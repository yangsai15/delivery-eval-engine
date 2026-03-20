import type Database from 'better-sqlite3';
import { ProjectRepository } from '../db/repositories/project.repository';
import { FlowConfigRepository } from '../db/repositories/flow-config.repository';
import { RoleConfigRepository } from '../db/repositories/role-config.repository';
import { StageConfigRepository } from '../db/repositories/stage-config.repository';
import { OvertimeRepository } from '../db/repositories/overtime.repository';
import { CostRepository } from '../db/repositories/cost.repository';
import { SnapshotRepository } from '../db/repositories/snapshot.repository';
import { CalcType, ProjectStatus } from '../types/enums';
import { AppError, ErrorCode } from '../types/error-codes';
import { StaffingResult, CapacityResult, EvaluationResult, OvertimeEntry, StageEntry, CostEntry, OvertimeRateEntry } from '../types/algorithm.types';
import { Warning } from '../types/warning.types';
import { buildWorkingDays } from '../engine/calendar';
import { buildPipeline } from '../engine/pipeline-builder';
import { buildCapacityMatrix } from '../engine/capacity-calculator';
import { runDailyRecursion } from '../engine/daily-recursion';
import { findOptimalStaffing } from '../engine/optimal-staffing';
import { findMaxCapacity } from '../engine/max-capacity';
import { calculateDeliveryMetrics } from '../engine/delivery-metrics';
import { generateWarnings } from '../engine/warning-engine';
import { calculateCost } from '../engine/cost-engine';
import { validateCalculationReady } from './validation.service';
import { hashParams } from '../utils/hash';
import { CalendarService } from './calendar.service';

export class CalculationService {
  private projectRepo: ProjectRepository;
  private flowRepo: FlowConfigRepository;
  private roleRepo: RoleConfigRepository;
  private stageRepo: StageConfigRepository;
  private overtimeRepo: OvertimeRepository;
  private costRepo: CostRepository;
  private snapshotRepo: SnapshotRepository;
  private calendarService: CalendarService;

  constructor(private db: Database.Database) {
    this.projectRepo = new ProjectRepository(db);
    this.flowRepo = new FlowConfigRepository(db);
    this.roleRepo = new RoleConfigRepository(db);
    this.stageRepo = new StageConfigRepository(db);
    this.overtimeRepo = new OvertimeRepository(db);
    this.costRepo = new CostRepository(db);
    this.snapshotRepo = new SnapshotRepository(db);
    this.calendarService = new CalendarService(db);
  }

  /**
   * Run optimal staffing calculation (§10.3).
   */
  runStaffing(projectId: string): { result: StaffingResult; warnings: Warning[] } {
    const { project, pipeline, workingDays, capacity, overtimeEntries, stageEntries } = this.loadAndValidate(projectId);

    const staffingResult = findOptimalStaffing(
      pipeline,
      project.total_data,
      workingDays.length,
      capacity,
    );

    // Generate warnings
    const warnings = generateWarnings({
      result: staffingResult.simulation,
      pipeline,
      capacity,
      totalData: project.total_data,
      warnThreshold: {
        dataShortage: project.warn_threshold.data_shortage,
        laborOverflow: project.warn_threshold.labor_overflow,
      },
    });

    // Cost (if enabled)
    if (project.enable_cost) {
      const { costEntries, overtimeRates } = this.loadCostConfig(projectId);
      const costSummary = calculateCost({
        pipeline,
        workingDays,
        D: workingDays.length,
        costEntries,
        overtimeEntries,
        overtimeRates,
        stageEntries,
        capacity,
        totalFinalOut: staffingResult.simulation.totalFinalOut,
      });
      staffingResult.totalCost = costSummary.totalCost;
    }

    // Save snapshot
    this.saveSnapshot(projectId, CalcType.Staffing, staffingResult, warnings);

    return { result: staffingResult, warnings };
  }

  /**
   * Run max capacity calculation (§10.4).
   */
  runCapacity(projectId: string): { result: CapacityResult; warnings: Warning[] } {
    const { project, pipeline, workingDays, capacity } = this.loadAndValidate(projectId);

    const capacityResult = findMaxCapacity(
      pipeline,
      workingDays.length,
      capacity,
      {
        dataShortage: project.warn_threshold.data_shortage,
        laborOverflow: project.warn_threshold.labor_overflow,
      },
    );

    const warnings = generateWarnings({
      result: capacityResult.simulation,
      pipeline,
      capacity,
      totalData: capacityResult.maxRawData,
      warnThreshold: {
        dataShortage: project.warn_threshold.data_shortage,
        laborOverflow: project.warn_threshold.labor_overflow,
      },
    });

    this.saveSnapshot(projectId, CalcType.Capacity, capacityResult, warnings);

    return { result: capacityResult, warnings };
  }

  /**
   * Run delivery evaluation (§10.5).
   */
  runEvaluation(projectId: string): { result: EvaluationResult; warnings: Warning[] } {
    const { project, pipeline, workingDays, capacity, overtimeEntries, stageEntries } = this.loadAndValidate(projectId);

    // Run simulation with configured people
    const simInput = {
      pipeline,
      totalData: project.total_data,
      workingDays: workingDays.length,
      capacity,
      warnThreshold: {
        dataShortage: project.warn_threshold.data_shortage,
        laborOverflow: project.warn_threshold.labor_overflow,
      },
    };

    const simResult = runDailyRecursion(simInput);

    // Calculate metrics
    const evalResult = calculateDeliveryMetrics(
      simResult, pipeline, capacity, project.total_data,
    );

    // Cost (if enabled)
    if (project.enable_cost) {
      const { costEntries, overtimeRates } = this.loadCostConfig(projectId);
      evalResult.costSummary = calculateCost({
        pipeline,
        workingDays,
        D: workingDays.length,
        costEntries,
        overtimeEntries,
        overtimeRates,
        stageEntries,
        capacity,
        totalFinalOut: simResult.totalFinalOut,
      });
    }

    // Warnings
    const warnings = generateWarnings({
      result: simResult,
      pipeline,
      capacity,
      totalData: project.total_data,
      warnThreshold: {
        dataShortage: project.warn_threshold.data_shortage,
        laborOverflow: project.warn_threshold.labor_overflow,
      },
      costSummary: evalResult.costSummary,
    });

    // B-11: zero delivery warning
    if (simResult.totalFinalOut === 0) {
      warnings.push({
        type: 'zero_delivery' as any,
        role: 'overall',
        day: 0,
        currentValue: 0,
        threshold: 0,
        severity: 'high' as any,
        message: '当前配置下无法产生任何有效交付',
      });
    }

    this.saveSnapshot(projectId, CalcType.Evaluation, evalResult, warnings);

    return { result: evalResult, warnings };
  }

  /**
   * Load and validate all project configuration for calculation.
   */
  private loadAndValidate(projectId: string) {
    const project = this.projectRepo.getById(projectId);
    if (!project) throw new AppError(ErrorCode.E4001, '项目不存在');

    const roleConfigs = this.roleRepo.getByProject(projectId);
    const flowConfigs = this.flowRepo.getByProject(projectId);

    // Build working days (use calendar service for holidays/workdays)
    const workingDays = this.calendarService.getWorkingDays(project.start_date, project.end_date);
    const D = workingDays.length;

    // Validate readiness
    const validation = validateCalculationReady(project, roleConfigs, flowConfigs, D);
    if (!validation.valid) throw validation.errors[0];

    // Build pipeline
    const pipeline = buildPipeline(
      project.flow_mode,
      project.enable_screen,
      project.screen_efficiency ?? 80,
      project.final_efficiency,
      roleConfigs,
      flowConfigs,
    );

    // Load stage configs
    const allStages = this.stageRepo.getByProject(projectId);
    const stageEntries: StageEntry[] = allStages.map(s => {
      const role = roleConfigs.find(r => r.role_id === s.role_id);
      return {
        roleType: role?.role_type ?? ('' as any),
        startDate: s.start_date,
        endDate: s.end_date,
        peopleNum: s.people_num,
      };
    });

    // Load overtime configs
    const overtimeConfigs = this.overtimeRepo.getOvertimeByProject(projectId);
    const overtimeEntries: OvertimeEntry[] = overtimeConfigs.map(ot => ({
      roleType: ot.role_type,
      date: ot.overtime_date,
      overtimeDays: ot.overtime_days,
      dateType: ot.date_type,
    }));

    // Build capacity matrix
    const capacity = buildCapacityMatrix(pipeline, workingDays, stageEntries, overtimeEntries);

    return { project, pipeline, workingDays, capacity, D, overtimeEntries, stageEntries };
  }

  private loadCostConfig(projectId: string) {
    const costConfigs = this.costRepo.getCostByProject(projectId);
    const costEntries: CostEntry[] = costConfigs.map(c => ({
      roleType: c.role_type,
      workType: c.work_type,
      dailySalary: c.daily_salary,
      peopleNum: c.people_num,
    }));

    const rates = this.overtimeRepo.getRatesByProject(projectId);
    const overtimeRates: OvertimeRateEntry[] = rates.map(r => ({
      dateType: r.date_type,
      rate: r.rate,
    }));

    return { costEntries, overtimeRates };
  }

  private saveSnapshot(projectId: string, calcType: CalcType, resultData: unknown, warnings: Warning[]): void {
    this.db.transaction(() => {
      const paramsHash = hashParams({ projectId, calcType, timestamp: Date.now() });

      this.snapshotRepo.create({
        project_id: projectId,
        calc_type: calcType,
        params_hash: paramsHash,
        result_data: resultData as Record<string, unknown>,
        warnings: warnings.map(w => ({
          type: w.type,
          role: w.role,
          day: w.day,
          current_value: w.currentValue,
          threshold: w.threshold,
          severity: w.severity,
          message: w.message,
        })),
      });

      // Update project status to calculated
      const project = this.projectRepo.getById(projectId);
      if (project && (project.status === ProjectStatus.Configured || project.status === ProjectStatus.Draft)) {
        this.projectRepo.updateStatus(projectId, ProjectStatus.Calculated);
      }

      // Prune old snapshots
      this.snapshotRepo.pruneSnapshots(projectId, 20);
    })();
  }
}
