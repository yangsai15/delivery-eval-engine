import type Database from 'better-sqlite3';
import { BaseRepository, generateId, nowISO } from './base.repository';
import { Project, WarnThreshold } from '../../types/project.types';
import { FlowMode, ProjectStatus } from '../../types/enums';

interface ProjectRow {
  project_id: string;
  project_name: string;
  label_type: string;
  unit: string;
  total_data: number;
  start_date: string;
  end_date: string;
  flow_mode: string;
  enable_screen: number;
  screen_efficiency: number | null;
  final_efficiency: number;
  enable_overtime: number;
  enable_cost: number;
  warn_threshold: string;
  calendar_id: string;
  status: string;
  create_time: string;
  update_time: string;
  archived_time: string | null;
  is_deleted: number;
  deleted_at: string | null;
  remark: string | null;
}

export class ProjectRepository extends BaseRepository {
  constructor(db: Database.Database) {
    super(db);
  }

  private rowToProject(row: ProjectRow): Project {
    return {
      ...row,
      flow_mode: row.flow_mode as FlowMode,
      status: row.status as ProjectStatus,
      enable_screen: this.toBool(row.enable_screen),
      enable_overtime: this.toBool(row.enable_overtime),
      enable_cost: this.toBool(row.enable_cost),
      is_deleted: this.toBool(row.is_deleted),
      warn_threshold: this.parseJSON<WarnThreshold>(row.warn_threshold) ?? {
        data_shortage: 100,
        labor_overflow: 100,
      },
    };
  }

  create(input: Omit<Project, 'project_id' | 'create_time' | 'update_time' | 'archived_time' | 'is_deleted' | 'deleted_at'>): Project {
    const now = nowISO();
    const id = generateId();
    const stmt = this.db.prepare(`
      INSERT INTO project (
        project_id, project_name, label_type, unit, total_data,
        start_date, end_date, flow_mode, enable_screen, screen_efficiency,
        final_efficiency, enable_overtime, enable_cost, warn_threshold,
        calendar_id, status, create_time, update_time, remark
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?
      )
    `);
    stmt.run(
      id, input.project_name, input.label_type, input.unit, input.total_data,
      input.start_date, input.end_date, input.flow_mode,
      this.fromBool(input.enable_screen), input.screen_efficiency,
      input.final_efficiency, this.fromBool(input.enable_overtime),
      this.fromBool(input.enable_cost), this.toJSON(input.warn_threshold),
      input.calendar_id, input.status, now, now, input.remark ?? null
    );
    return this.getById(id)!;
  }

  getById(id: string): Project | undefined {
    const row = this.findById<ProjectRow>('project', 'project_id', id);
    return row ? this.rowToProject(row) : undefined;
  }

  listActive(): Project[] {
    const rows = this.db.prepare(
      'SELECT * FROM project WHERE is_deleted = 0 ORDER BY create_time DESC'
    ).all() as ProjectRow[];
    return rows.map(r => this.rowToProject(r));
  }

  findByName(name: string): Project | undefined {
    const row = this.db.prepare(
      'SELECT * FROM project WHERE project_name = ? AND is_deleted = 0'
    ).get(name) as ProjectRow | undefined;
    return row ? this.rowToProject(row) : undefined;
  }

  updateStatus(id: string, status: ProjectStatus): void {
    const now = nowISO();
    const archivedTime = status === ProjectStatus.Archived ? now : null;
    this.db.prepare(
      'UPDATE project SET status = ?, update_time = ?, archived_time = COALESCE(?, archived_time) WHERE project_id = ?'
    ).run(status, now, archivedTime, id);
  }

  update(id: string, fields: Partial<Project>): void {
    const now = nowISO();
    const sets: string[] = ['update_time = ?'];
    const values: unknown[] = [now];
    const fieldMap: Record<string, (v: unknown) => unknown> = {
      project_name: v => v,
      label_type: v => v,
      unit: v => v,
      total_data: v => v,
      start_date: v => v,
      end_date: v => v,
      enable_screen: v => this.fromBool(v as boolean),
      screen_efficiency: v => v,
      final_efficiency: v => v,
      enable_overtime: v => this.fromBool(v as boolean),
      enable_cost: v => this.fromBool(v as boolean),
      warn_threshold: v => this.toJSON(v),
      calendar_id: v => v,
      status: v => v,
      remark: v => v,
    };
    for (const [key, transform] of Object.entries(fieldMap)) {
      if (key in fields) {
        sets.push(`${key} = ?`);
        values.push(transform((fields as Record<string, unknown>)[key]));
      }
    }
    values.push(id);
    this.db.prepare(`UPDATE project SET ${sets.join(', ')} WHERE project_id = ?`).run(...values);
  }

  softDelete(id: string): void {
    const now = nowISO();
    this.db.prepare(
      'UPDATE project SET is_deleted = 1, deleted_at = ?, update_time = ? WHERE project_id = ?'
    ).run(now, now, id);
  }

  hardDelete(id: string): void {
    this.db.prepare('DELETE FROM project WHERE project_id = ?').run(id);
  }
}
