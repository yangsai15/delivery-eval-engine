import type Database from 'better-sqlite3';
import { FlowConfigRepository } from '../db/repositories/flow-config.repository';
import { RoleConfigRepository } from '../db/repositories/role-config.repository';
import { StageConfigRepository } from '../db/repositories/stage-config.repository';
import { OvertimeRepository } from '../db/repositories/overtime.repository';
import { CostRepository } from '../db/repositories/cost.repository';
import { ProjectRepository } from '../db/repositories/project.repository';
import { FlowConfig, RoleConfig, StageConfig, OvertimeConfig, OvertimeRate } from '../types/project.types';
import { CostConfig, StaffAllocation } from '../types/config.types';
import { FlowMode, RoleType, ProjectStatus } from '../types/enums';
import { AppError, ErrorCode } from '../types/error-codes';
import {
  validateRoleConfig,
  validateFlowConfig,
  validateRoleTypeForMode,
  validateFlowNodeForMode,
  validateStageCoverage,
  validateOvertimeDates,
} from './validation.service';

export class ConfigService {
  private projectRepo: ProjectRepository;
  private flowRepo: FlowConfigRepository;
  private roleRepo: RoleConfigRepository;
  private stageRepo: StageConfigRepository;
  private overtimeRepo: OvertimeRepository;
  private costRepo: CostRepository;

  constructor(private db: Database.Database) {
    this.projectRepo = new ProjectRepository(db);
    this.flowRepo = new FlowConfigRepository(db);
    this.roleRepo = new RoleConfigRepository(db);
    this.stageRepo = new StageConfigRepository(db);
    this.overtimeRepo = new OvertimeRepository(db);
    this.costRepo = new CostRepository(db);
  }

  // --- Flow Config ---

  setFlowConfigs(projectId: string, configs: Array<{ flow_node: string; interval_days: number }>): FlowConfig[] {
    const project = this.getProjectOrThrow(projectId);

    return this.db.transaction(() => {
      this.flowRepo.deleteByProject(projectId);
      const results: FlowConfig[] = [];
      for (const cfg of configs) {
        // DC-02
        if (!validateFlowNodeForMode(cfg.flow_node, project.flow_mode)) {
          throw new AppError(ErrorCode.E1011, `流转节点${cfg.flow_node}与流程模式${project.flow_mode}不匹配`);
        }
        const v = validateFlowConfig(cfg);
        if (!v.valid) throw v.errors[0];

        results.push(this.flowRepo.create({ project_id: projectId, ...cfg }));
      }
      this.markConfigured(project);
      return results;
    })();
  }

  getFlowConfigs(projectId: string): FlowConfig[] {
    return this.flowRepo.getByProject(projectId);
  }

  // --- Role Config ---

  setRoleConfig(projectId: string, input: {
    role_type: RoleType;
    daily_efficiency: number;
    base_people: number;
    enable_stage?: boolean;
  }): RoleConfig {
    const project = this.getProjectOrThrow(projectId);

    // DC-01
    if (!validateRoleTypeForMode(input.role_type, project.flow_mode)) {
      throw new AppError(ErrorCode.E1011, `角色${input.role_type}与流程模式${project.flow_mode}不匹配`);
    }

    const v = validateRoleConfig(input);
    if (!v.valid) throw v.errors[0];

    return this.db.transaction(() => {
      // Upsert: delete existing for this role type then create
      const existing = this.roleRepo.getByProject(projectId).find(r => r.role_type === input.role_type);
      if (existing) {
        this.stageRepo.deleteByRoleId(existing.role_id);
        this.roleRepo.deleteByProject(projectId);
        // Re-create all except the one being updated
        const others = this.roleRepo.getByProject(projectId);
        // Actually, we need to be smarter - just update existing
      }

      // Simple approach: check if exists and update or create
      const existingRoles = this.roleRepo.getByProject(projectId);
      const existingRole = existingRoles.find(r => r.role_type === input.role_type);

      if (existingRole) {
        this.roleRepo.update(existingRole.role_id, {
          daily_efficiency: input.daily_efficiency,
          base_people: input.base_people,
          enable_stage: input.enable_stage ?? false,
        });
        this.markConfigured(project);
        return this.roleRepo.getById(existingRole.role_id)!;
      }

      const result = this.roleRepo.create({
        project_id: projectId,
        role_type: input.role_type,
        daily_efficiency: input.daily_efficiency,
        base_people: input.base_people,
        enable_stage: input.enable_stage ?? false,
      });
      this.markConfigured(project);
      return result;
    })();
  }

  getRoleConfigs(projectId: string): RoleConfig[] {
    return this.roleRepo.getByProject(projectId);
  }

  // --- Stage Config ---

  setStageConfigs(projectId: string, roleId: string, stages: Array<{
    start_date: string;
    end_date: string;
    people_num: number;
  }>): StageConfig[] {
    const project = this.getProjectOrThrow(projectId);

    return this.db.transaction(() => {
      this.stageRepo.deleteByRoleId(roleId);
      const results: StageConfig[] = [];
      for (const s of stages) {
        if (s.people_num < 1) throw new AppError(ErrorCode.E1006);
        results.push(this.stageRepo.create({
          project_id: projectId,
          role_id: roleId,
          start_date: s.start_date,
          end_date: s.end_date,
          people_num: s.people_num,
        }));
      }

      // DC-03: validate coverage
      const coverage = validateStageCoverage(results, project.start_date, project.end_date);
      if (!coverage.valid) throw coverage.errors[0];

      this.markConfigured(project);
      return results;
    })();
  }

  getStageConfigs(projectId: string): StageConfig[] {
    return this.stageRepo.getByProject(projectId);
  }

  // --- Overtime Config ---

  setOvertimeConfigs(projectId: string, configs: Array<{
    role_type: RoleType;
    overtime_date: string;
    overtime_days: number;
    date_type: string;
  }>): OvertimeConfig[] {
    const project = this.getProjectOrThrow(projectId);

    return this.db.transaction(() => {
      this.overtimeRepo.deleteOvertimeByProject(projectId);
      const results: OvertimeConfig[] = [];
      for (const cfg of configs) {
        results.push(this.overtimeRepo.createOvertime({
          project_id: projectId,
          role_type: cfg.role_type,
          overtime_date: cfg.overtime_date,
          overtime_days: cfg.overtime_days,
          date_type: cfg.date_type as any,
        }));
      }

      // DC-04
      const v = validateOvertimeDates(results, project.start_date, project.end_date);
      if (!v.valid) throw v.errors[0];

      this.markConfigured(project);
      return results;
    })();
  }

  getOvertimeConfigs(projectId: string): OvertimeConfig[] {
    return this.overtimeRepo.getOvertimeByProject(projectId);
  }

  // --- Overtime Rates ---

  setOvertimeRates(projectId: string, rates: Array<{
    date_type: string;
    rate: number;
  }>): OvertimeRate[] {
    this.getProjectOrThrow(projectId);
    return this.db.transaction(() => {
      this.overtimeRepo.deleteRatesByProject(projectId);
      return rates.map(r => this.overtimeRepo.createRate({
        project_id: projectId,
        date_type: r.date_type as any,
        rate: r.rate,
      }));
    })();
  }

  getOvertimeRates(projectId: string): OvertimeRate[] {
    return this.overtimeRepo.getRatesByProject(projectId);
  }

  // --- Cost Config ---

  setCostConfigs(projectId: string, configs: Array<{
    work_type: string;
    role_type: string;
    daily_salary: number;
    people_num: number;
  }>): CostConfig[] {
    this.getProjectOrThrow(projectId);
    return this.db.transaction(() => {
      this.costRepo.deleteCostByProject(projectId);
      return configs.map(c => this.costRepo.createCost({
        project_id: projectId,
        ...c,
      }));
    })();
  }

  getCostConfigs(projectId: string): CostConfig[] {
    return this.costRepo.getCostByProject(projectId);
  }

  // --- Staff Allocation ---

  setAllocations(projectId: string, allocations: Array<{
    role_type: string;
    work_type: string;
    people_num: number;
    stage_id?: string;
  }>): StaffAllocation[] {
    this.getProjectOrThrow(projectId);
    return this.db.transaction(() => {
      this.costRepo.deleteAllocationsByProject(projectId);
      return allocations.map(a => this.costRepo.createAllocation({
        project_id: projectId,
        role_type: a.role_type,
        work_type: a.work_type,
        people_num: a.people_num,
        stage_id: a.stage_id ?? null,
      }));
    })();
  }

  // --- Helpers ---

  private getProjectOrThrow(projectId: string) {
    const project = this.projectRepo.getById(projectId);
    if (!project) throw new AppError(ErrorCode.E4001, '项目不存在');
    if (project.status === ProjectStatus.Archived) {
      throw new AppError(ErrorCode.E4001, '归档项目不可修改配置');
    }
    return project;
  }

  private markConfigured(project: { project_id: string; status: ProjectStatus }) {
    if (project.status === ProjectStatus.Calculated) {
      this.projectRepo.updateStatus(project.project_id, ProjectStatus.Configured);
    }
  }
}
