import type Database from 'better-sqlite3';
import { ProjectRepository } from '../db/repositories/project.repository';
import { FlowConfigRepository } from '../db/repositories/flow-config.repository';
import { RoleConfigRepository } from '../db/repositories/role-config.repository';
import { StageConfigRepository } from '../db/repositories/stage-config.repository';
import { OvertimeRepository } from '../db/repositories/overtime.repository';
import { CostRepository } from '../db/repositories/cost.repository';
import { SnapshotRepository } from '../db/repositories/snapshot.repository';
import { Project } from '../types/project.types';
import { FlowMode, ProjectStatus } from '../types/enums';
import { AppError, ErrorCode } from '../types/error-codes';
import { validateProjectInput, validateStateTransition } from './validation.service';
import { AuditService } from './audit.service';

export class ProjectService {
  private projectRepo: ProjectRepository;
  private flowRepo: FlowConfigRepository;
  private roleRepo: RoleConfigRepository;
  private stageRepo: StageConfigRepository;
  private overtimeRepo: OvertimeRepository;
  private costRepo: CostRepository;
  private snapshotRepo: SnapshotRepository;
  private audit: AuditService;

  constructor(private db: Database.Database) {
    this.projectRepo = new ProjectRepository(db);
    this.flowRepo = new FlowConfigRepository(db);
    this.roleRepo = new RoleConfigRepository(db);
    this.stageRepo = new StageConfigRepository(db);
    this.overtimeRepo = new OvertimeRepository(db);
    this.costRepo = new CostRepository(db);
    this.snapshotRepo = new SnapshotRepository(db);
    this.audit = new AuditService(db);
  }

  /**
   * Create a new project.
   */
  create(input: {
    project_name: string;
    label_type: string;
    unit: string;
    total_data: number;
    start_date: string;
    end_date: string;
    flow_mode: FlowMode;
    enable_screen?: boolean;
    screen_efficiency?: number;
    final_efficiency?: number;
    remark?: string;
  }): Project {
    // Validate
    const validation = validateProjectInput({
      project_name: input.project_name,
      total_data: input.total_data,
      start_date: input.start_date,
      end_date: input.end_date,
      screen_efficiency: input.screen_efficiency,
      final_efficiency: input.final_efficiency ?? 100,
      enable_screen: input.enable_screen ?? false,
    });
    if (!validation.valid) {
      throw validation.errors[0];
    }

    // Check name uniqueness
    const existing = this.projectRepo.findByName(input.project_name);
    if (existing) {
      throw new AppError(ErrorCode.E1002);
    }

    return this.db.transaction(() => {
      const project = this.projectRepo.create({
        project_name: input.project_name,
        label_type: input.label_type,
        unit: input.unit,
        total_data: input.total_data,
        start_date: input.start_date,
        end_date: input.end_date,
        flow_mode: input.flow_mode,
        enable_screen: input.enable_screen ?? false,
        screen_efficiency: input.screen_efficiency ?? null,
        final_efficiency: input.final_efficiency ?? 100,
        enable_overtime: false,
        enable_cost: false,
        warn_threshold: { data_shortage: 100, labor_overflow: 100 },
        calendar_id: 'default',
        status: ProjectStatus.Draft,
        remark: input.remark ?? null,
      });
      this.audit.log({ projectId: project.project_id, action: 'create', targetType: 'project', targetId: project.project_id, detail: { project_name: input.project_name } });
      return project;
    })();
  }

  /**
   * Get project by ID.
   */
  getById(id: string): Project | undefined {
    return this.projectRepo.getById(id);
  }

  /**
   * List all active (non-deleted) projects.
   */
  listActive(): Project[] {
    return this.projectRepo.listActive();
  }

  /**
   * Update project fields. If project is in 'calculated' status, revert to 'configured'.
   */
  update(id: string, fields: Partial<Project>): void {
    const project = this.projectRepo.getById(id);
    if (!project) throw new AppError(ErrorCode.E4001, '项目不存在');
    if (project.status === ProjectStatus.Archived) {
      throw new AppError(ErrorCode.E4001, '归档项目不可修改');
    }

    this.db.transaction(() => {
      this.projectRepo.update(id, fields);
      if (project.status === ProjectStatus.Calculated) {
        this.projectRepo.updateStatus(id, ProjectStatus.Configured);
      }
      this.audit.log({ projectId: id, action: 'edit', targetType: 'project', targetId: id, detail: { changed_fields: Object.keys(fields) } });
    })();
  }

  /**
   * Update project status with state machine validation.
   */
  updateStatus(id: string, targetStatus: ProjectStatus): void {
    const project = this.projectRepo.getById(id);
    if (!project) throw new AppError(ErrorCode.E4001, '项目不存在');

    if (!validateStateTransition(project.status, targetStatus)) {
      throw new AppError(ErrorCode.E4001,
        `不允许从${project.status}转换到${targetStatus}`);
    }

    this.projectRepo.updateStatus(id, targetStatus);
  }

  /**
   * Soft delete project and cascade to all related data (DC-07).
   */
  softDelete(id: string): void {
    const project = this.projectRepo.getById(id);
    if (!project) return;

    this.db.transaction(() => {
      this.projectRepo.softDelete(id);
      this.audit.log({ projectId: id, action: 'delete', targetType: 'project', targetId: id });
    })();
  }

  /**
   * Hard delete project and all related data.
   */
  hardDelete(id: string): void {
    this.db.transaction(() => {
      this.snapshotRepo.deleteByProject(id);
      this.costRepo.deleteCostByProject(id);
      this.costRepo.deleteAllocationsByProject(id);
      this.overtimeRepo.deleteOvertimeByProject(id);
      this.overtimeRepo.deleteRatesByProject(id);
      this.stageRepo.deleteByProject(id);
      this.roleRepo.deleteByProject(id);
      this.flowRepo.deleteByProject(id);
      this.projectRepo.hardDelete(id);
    })();
  }

  /**
   * Clone a project for reuse.
   */
  clone(sourceId: string, newName?: string): Project {
    const source = this.projectRepo.getById(sourceId);
    if (!source) throw new AppError(ErrorCode.E4001, '源项目不存在');

    let name = newName ?? `${source.project_name}（副本）`;
    if (this.projectRepo.findByName(name)) {
      const ts = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
      name = `${source.project_name}（副本_${ts}）`;
    }

    return this.db.transaction(() => {
      const newProject = this.projectRepo.create({
        ...source,
        project_name: name,
        status: ProjectStatus.Draft,
        remark: source.remark,
      });

      // Clone flow configs
      const flows = this.flowRepo.getByProject(sourceId);
      for (const fc of flows) {
        this.flowRepo.create({
          project_id: newProject.project_id,
          flow_node: fc.flow_node,
          interval_days: fc.interval_days,
        });
      }

      // Clone role configs
      const roles = this.roleRepo.getByProject(sourceId);
      for (const rc of roles) {
        const newRole = this.roleRepo.create({
          project_id: newProject.project_id,
          role_type: rc.role_type,
          daily_efficiency: rc.daily_efficiency,
          base_people: rc.base_people,
          enable_stage: rc.enable_stage,
        });

        // Clone stages for this role
        const stages = this.stageRepo.getByRoleId(rc.role_id);
        for (const sc of stages) {
          this.stageRepo.create({
            project_id: newProject.project_id,
            role_id: newRole.role_id,
            start_date: sc.start_date,
            end_date: sc.end_date,
            people_num: sc.people_num,
          });
        }
      }

      // Clone overtime configs
      const overtimes = this.overtimeRepo.getOvertimeByProject(sourceId);
      for (const ot of overtimes) {
        this.overtimeRepo.createOvertime({
          project_id: newProject.project_id,
          role_type: ot.role_type,
          overtime_date: ot.overtime_date,
          overtime_days: ot.overtime_days,
          date_type: ot.date_type,
        });
      }

      // Clone overtime rates
      const rates = this.overtimeRepo.getRatesByProject(sourceId);
      for (const r of rates) {
        this.overtimeRepo.createRate({
          project_id: newProject.project_id,
          date_type: r.date_type,
          rate: r.rate,
        });
      }

      // Clone cost configs
      const costs = this.costRepo.getCostByProject(sourceId);
      for (const cc of costs) {
        this.costRepo.createCost({
          project_id: newProject.project_id,
          work_type: cc.work_type,
          role_type: cc.role_type,
          daily_salary: cc.daily_salary,
          people_num: cc.people_num,
        });
      }

      return newProject;
    })();
  }
}
