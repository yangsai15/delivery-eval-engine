import type Database from 'better-sqlite3';
import { BaseRepository, generateId, nowISO } from './base.repository';
import { OvertimeConfig, OvertimeRate } from '../../types/project.types';
import { RoleType, DateType } from '../../types/enums';

export class OvertimeRepository extends BaseRepository {
  constructor(db: Database.Database) {
    super(db);
  }

  // --- overtime_config ---

  createOvertime(input: Omit<OvertimeConfig, 'overtime_id' | 'create_time' | 'update_time'>): OvertimeConfig {
    const now = nowISO();
    const id = generateId();
    this.db.prepare(`
      INSERT INTO overtime_config (overtime_id, project_id, role_type, overtime_date, overtime_days, date_type, create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.project_id, input.role_type, input.overtime_date, input.overtime_days, input.date_type, now, now);
    return { overtime_id: id, ...input, create_time: now, update_time: now };
  }

  getOvertimeByProject(projectId: string): OvertimeConfig[] {
    const rows = this.findAllByField<OvertimeConfig>('overtime_config', 'project_id', projectId);
    return rows.map(r => ({
      ...r,
      role_type: r.role_type as RoleType,
      date_type: r.date_type as DateType,
    }));
  }

  deleteOvertimeByProject(projectId: string): number {
    return this.deleteByField('overtime_config', 'project_id', projectId);
  }

  // --- overtime_rate ---

  createRate(input: Omit<OvertimeRate, 'rate_id' | 'create_time' | 'update_time'>): OvertimeRate {
    const now = nowISO();
    const id = generateId();
    this.db.prepare(`
      INSERT INTO overtime_rate (rate_id, project_id, date_type, rate, create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, input.project_id, input.date_type, input.rate, now, now);
    return { rate_id: id, ...input, create_time: now, update_time: now };
  }

  getRatesByProject(projectId: string): OvertimeRate[] {
    const rows = this.findAllByField<OvertimeRate>('overtime_rate', 'project_id', projectId);
    return rows.map(r => ({
      ...r,
      date_type: r.date_type as DateType,
    }));
  }

  deleteRatesByProject(projectId: string): number {
    return this.deleteByField('overtime_rate', 'project_id', projectId);
  }
}
