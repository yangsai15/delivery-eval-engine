import type Database from 'better-sqlite3';
import { ProjectRepository } from '../db/repositories/project.repository';
import { SnapshotRepository } from '../db/repositories/snapshot.repository';
import { FlowConfigRepository } from '../db/repositories/flow-config.repository';
import { RoleConfigRepository } from '../db/repositories/role-config.repository';
import { CalcType } from '../types/enums';
import { AppError, ErrorCode } from '../types/error-codes';

export interface ExportData {
  project: {
    project_id: string;
    project_name: string;
    label_type: string;
    unit: string;
    total_data: number;
    start_date: string;
    end_date: string;
    flow_mode: string;
    pipeline_roles: string[];
    enable_screen: boolean;
    final_efficiency: number;
  };
  configuration: {
    roles: Array<{
      role_type: string;
      daily_efficiency: number;
      base_people: number;
    }>;
    flows: Array<{
      flow_node: string;
      interval_days: number;
    }>;
  };
  results: Record<string, unknown> | null;
  warnings: unknown[];
  exported_at: string;
}

export class ExportService {
  private projectRepo: ProjectRepository;
  private snapshotRepo: SnapshotRepository;
  private flowRepo: FlowConfigRepository;
  private roleRepo: RoleConfigRepository;

  constructor(private db: Database.Database) {
    this.projectRepo = new ProjectRepository(db);
    this.snapshotRepo = new SnapshotRepository(db);
    this.flowRepo = new FlowConfigRepository(db);
    this.roleRepo = new RoleConfigRepository(db);
  }

  /**
   * Export project data as JSON (§7.16 format).
   */
  exportProject(projectId: string, calcType?: CalcType): ExportData {
    const project = this.projectRepo.getById(projectId);
    if (!project) throw new AppError(ErrorCode.E4001, '项目不存在');

    const roles = this.roleRepo.getByProject(projectId);
    const flows = this.flowRepo.getByProject(projectId);

    let snapshot = null;
    if (calcType) {
      snapshot = this.snapshotRepo.getLatest(projectId, calcType);
    } else {
      const snapshots = this.snapshotRepo.getByProject(projectId);
      snapshot = snapshots[0] ?? null;
    }

    return {
      project: {
        project_id: project.project_id,
        project_name: project.project_name,
        label_type: project.label_type,
        unit: project.unit,
        total_data: project.total_data,
        start_date: project.start_date,
        end_date: project.end_date,
        flow_mode: project.flow_mode,
        pipeline_roles: project.pipeline_roles,
        enable_screen: project.enable_screen,
        final_efficiency: project.final_efficiency,
      },
      configuration: {
        roles: roles.map(r => ({
          role_type: r.role_type,
          daily_efficiency: r.daily_efficiency,
          base_people: r.base_people,
        })),
        flows: flows.map(f => ({
          flow_node: f.flow_node,
          interval_days: f.interval_days,
        })),
      },
      results: snapshot?.result_data ?? null,
      warnings: snapshot?.warnings ?? [],
      exported_at: new Date().toISOString(),
    };
  }
}
