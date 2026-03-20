import type Database from 'better-sqlite3';
import { BaseRepository, generateId, nowISO } from './base.repository';
import { RoleConfig } from '../../types/project.types';
import { RoleType } from '../../types/enums';

interface RoleConfigRow {
  role_id: string;
  project_id: string;
  role_type: string;
  daily_efficiency: number;
  base_people: number;
  enable_stage: number;
  create_time: string;
  update_time: string;
}

export class RoleConfigRepository extends BaseRepository {
  constructor(db: Database.Database) {
    super(db);
  }

  private rowToRoleConfig(row: RoleConfigRow): RoleConfig {
    return {
      ...row,
      role_type: row.role_type as RoleType,
      enable_stage: this.toBool(row.enable_stage),
    };
  }

  create(input: Omit<RoleConfig, 'role_id' | 'create_time' | 'update_time'>): RoleConfig {
    const now = nowISO();
    const id = generateId();
    this.db.prepare(`
      INSERT INTO role_config (role_id, project_id, role_type, daily_efficiency, base_people, enable_stage, create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.project_id, input.role_type, input.daily_efficiency, input.base_people, this.fromBool(input.enable_stage), now, now);
    return { role_id: id, ...input, create_time: now, update_time: now };
  }

  getByProject(projectId: string): RoleConfig[] {
    const rows = this.findAllByField<RoleConfigRow>('role_config', 'project_id', projectId);
    return rows.map(r => this.rowToRoleConfig(r));
  }

  getById(roleId: string): RoleConfig | undefined {
    const row = this.findById<RoleConfigRow>('role_config', 'role_id', roleId);
    return row ? this.rowToRoleConfig(row) : undefined;
  }

  update(roleId: string, fields: Partial<Pick<RoleConfig, 'daily_efficiency' | 'base_people' | 'enable_stage'>>): void {
    const sets: string[] = ['update_time = ?'];
    const values: unknown[] = [nowISO()];
    if (fields.daily_efficiency !== undefined) { sets.push('daily_efficiency = ?'); values.push(fields.daily_efficiency); }
    if (fields.base_people !== undefined) { sets.push('base_people = ?'); values.push(fields.base_people); }
    if (fields.enable_stage !== undefined) { sets.push('enable_stage = ?'); values.push(this.fromBool(fields.enable_stage)); }
    values.push(roleId);
    this.db.prepare(`UPDATE role_config SET ${sets.join(', ')} WHERE role_id = ?`).run(...values);
  }

  deleteByProject(projectId: string): number {
    return this.deleteByField('role_config', 'project_id', projectId);
  }
}
