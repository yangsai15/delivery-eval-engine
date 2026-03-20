import type Database from 'better-sqlite3';
import { ProjectRepository } from '../db/repositories/project.repository';
import { FlowConfigRepository } from '../db/repositories/flow-config.repository';
import { RoleConfigRepository } from '../db/repositories/role-config.repository';
import { StageConfigRepository } from '../db/repositories/stage-config.repository';
import { OvertimeRepository } from '../db/repositories/overtime.repository';
import { CostRepository } from '../db/repositories/cost.repository';
import { SnapshotRepository } from '../db/repositories/snapshot.repository';
import { SystemConfigRepository } from '../db/repositories/system-config.repository';
import { AppError, ErrorCode } from '../types/error-codes';
import fs from 'fs';
import path from 'path';

export interface BackupMetadata {
  version: string;
  schema_version: number;
  created_at: string;
  app_version: string;
  project_count: number;
}

export interface BackupData {
  metadata: BackupMetadata;
  projects: unknown[];
  flow_configs: unknown[];
  role_configs: unknown[];
  stage_configs: unknown[];
  overtime_configs: unknown[];
  overtime_rates: unknown[];
  cost_configs: unknown[];
  staff_allocations: unknown[];
  snapshots: unknown[];
  system_configs: unknown[];
}

export class BackupService {
  constructor(private db: Database.Database) {}

  /**
   * Export full database as JSON backup data.
   */
  exportBackup(): BackupData {
    const schemaVersion = this.db.pragma('user_version', { simple: true }) as number;

    const projects = this.db.prepare('SELECT * FROM project WHERE is_deleted = 0').all();
    const flowConfigs = this.db.prepare('SELECT * FROM flow_config').all();
    const roleConfigs = this.db.prepare('SELECT * FROM role_config').all();
    const stageConfigs = this.db.prepare('SELECT * FROM stage_config').all();
    const overtimeConfigs = this.db.prepare('SELECT * FROM overtime_config').all();
    const overtimeRates = this.db.prepare('SELECT * FROM overtime_rate').all();
    const costConfigs = this.db.prepare('SELECT * FROM cost_config').all();
    const staffAllocations = this.db.prepare('SELECT * FROM staff_allocation').all();
    const snapshots = this.db.prepare('SELECT * FROM calc_snapshot').all();
    const systemConfigs = this.db.prepare('SELECT * FROM system_config').all();

    return {
      metadata: {
        version: '1.0',
        schema_version: schemaVersion,
        created_at: new Date().toISOString(),
        app_version: '1.0.0',
        project_count: projects.length,
      },
      projects,
      flow_configs: flowConfigs,
      role_configs: roleConfigs,
      stage_configs: stageConfigs,
      overtime_configs: overtimeConfigs,
      overtime_rates: overtimeRates,
      cost_configs: costConfigs,
      staff_allocations: staffAllocations,
      snapshots,
      system_configs: systemConfigs,
    };
  }

  /**
   * Export backup to a file path.
   */
  exportToFile(filePath: string): void {
    const data = this.exportBackup();
    const json = JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, json, 'utf-8');
  }

  /**
   * Import backup data into the database.
   * Merges with existing data (does not clear first).
   */
  importBackup(data: BackupData): { importedProjects: number } {
    const currentVersion = this.db.pragma('user_version', { simple: true }) as number;

    if (data.metadata.schema_version > currentVersion) {
      throw new AppError(ErrorCode.E4005, `备份文件Schema版本(${data.metadata.schema_version})高于当前版本(${currentVersion})，请升级应用后再导入`);
    }

    let importedProjects = 0;

    const doImport = this.db.transaction(() => {
      // Import projects (skip duplicates by project_id)
      const insertProject = this.db.prepare(`
        INSERT OR IGNORE INTO project (project_id, project_name, label_type, unit, total_data,
          start_date, end_date, flow_mode, enable_screen, screen_efficiency, final_efficiency,
          enable_overtime, enable_cost, warn_threshold, calendar_id, status, create_time,
          update_time, archived_time, is_deleted, deleted_at, remark)
        VALUES (@project_id, @project_name, @label_type, @unit, @total_data,
          @start_date, @end_date, @flow_mode, @enable_screen, @screen_efficiency, @final_efficiency,
          @enable_overtime, @enable_cost, @warn_threshold, @calendar_id, @status, @create_time,
          @update_time, @archived_time, @is_deleted, @deleted_at, @remark)
      `);

      for (const p of data.projects) {
        const result = insertProject.run(p as Record<string, unknown>);
        if (result.changes > 0) importedProjects++;
      }

      // Import configs
      const tables = [
        { data: data.flow_configs, table: 'flow_config', id: 'flow_id' },
        { data: data.role_configs, table: 'role_config', id: 'role_id' },
        { data: data.stage_configs, table: 'stage_config', id: 'stage_id' },
        { data: data.overtime_configs, table: 'overtime_config', id: 'overtime_id' },
        { data: data.overtime_rates, table: 'overtime_rate', id: 'rate_id' },
        { data: data.cost_configs, table: 'cost_config', id: 'cost_id' },
        { data: data.staff_allocations, table: 'staff_allocation', id: 'allocation_id' },
        { data: data.snapshots, table: 'calc_snapshot', id: 'snapshot_id' },
        { data: data.system_configs, table: 'system_config', id: 'config_id' },
      ];

      for (const { data: rows, table, id } of tables) {
        if (!rows || rows.length === 0) continue;
        const firstRow = rows[0] as Record<string, unknown>;
        const columns = Object.keys(firstRow);
        const placeholders = columns.map(c => `@${c}`).join(', ');
        const stmt = this.db.prepare(
          `INSERT OR IGNORE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`
        );
        for (const row of rows) {
          stmt.run(row as Record<string, unknown>);
        }
      }
    });

    doImport();
    return { importedProjects };
  }

  /**
   * Import backup from a file path.
   */
  importFromFile(filePath: string): { importedProjects: number } {
    if (!fs.existsSync(filePath)) {
      throw new AppError(ErrorCode.E5004, '备份文件不存在');
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    let data: BackupData;
    try {
      data = JSON.parse(content);
    } catch {
      throw new AppError(ErrorCode.E5004, '备份文件格式无效');
    }
    if (!data.metadata) {
      throw new AppError(ErrorCode.E5004, '备份文件缺少元数据');
    }
    return this.importBackup(data);
  }

  /**
   * Get database file size info.
   */
  getDatabaseInfo(): { sizeBytes: number; sizeMB: number; projectCount: number; snapshotCount: number } {
    const projectCount = (this.db.prepare('SELECT COUNT(*) as count FROM project WHERE is_deleted = 0').get() as { count: number }).count;
    const snapshotCount = (this.db.prepare('SELECT COUNT(*) as count FROM calc_snapshot').get() as { count: number }).count;

    // For in-memory databases, size is not available from file
    let sizeBytes = 0;
    try {
      const pageCount = this.db.pragma('page_count', { simple: true }) as number;
      const pageSize = this.db.pragma('page_size', { simple: true }) as number;
      sizeBytes = pageCount * pageSize;
    } catch {
      // ignore
    }

    return {
      sizeBytes,
      sizeMB: Math.round(sizeBytes / 1024 / 1024 * 100) / 100,
      projectCount,
      snapshotCount,
    };
  }

  /**
   * Optimize database (VACUUM).
   */
  optimize(): void {
    this.db.exec('VACUUM');
  }

  /**
   * Clean up soft-deleted projects older than N days.
   */
  cleanupDeleted(retentionDays: number = 30): number {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const deletedProjects = this.db.prepare(
      "SELECT project_id FROM project WHERE is_deleted = 1 AND deleted_at < ?"
    ).all(cutoffStr) as Array<{ project_id: string }>;

    let cleaned = 0;
    const doClean = this.db.transaction(() => {
      for (const { project_id } of deletedProjects) {
        this.db.prepare('DELETE FROM calc_snapshot WHERE project_id = ?').run(project_id);
        this.db.prepare('DELETE FROM staff_allocation WHERE project_id = ?').run(project_id);
        this.db.prepare('DELETE FROM cost_config WHERE project_id = ?').run(project_id);
        this.db.prepare('DELETE FROM overtime_rate WHERE project_id = ?').run(project_id);
        this.db.prepare('DELETE FROM overtime_config WHERE project_id = ?').run(project_id);
        this.db.prepare('DELETE FROM stage_config WHERE project_id = ?').run(project_id);
        this.db.prepare('DELETE FROM role_config WHERE project_id = ?').run(project_id);
        this.db.prepare('DELETE FROM flow_config WHERE project_id = ?').run(project_id);
        this.db.prepare('DELETE FROM project WHERE project_id = ?').run(project_id);
        cleaned++;
      }
    });
    doClean();
    return cleaned;
  }
}
