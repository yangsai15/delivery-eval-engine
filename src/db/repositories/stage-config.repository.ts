import type Database from 'better-sqlite3';
import { BaseRepository, generateId, nowISO } from './base.repository';
import { StageConfig } from '../../types/project.types';

export class StageConfigRepository extends BaseRepository {
  constructor(db: Database.Database) {
    super(db);
  }

  create(input: Omit<StageConfig, 'stage_id' | 'create_time' | 'update_time'>): StageConfig {
    const now = nowISO();
    const id = generateId();
    this.db.prepare(`
      INSERT INTO stage_config (stage_id, project_id, role_id, start_date, end_date, people_num, create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.project_id, input.role_id, input.start_date, input.end_date, input.people_num, now, now);
    return { stage_id: id, ...input, create_time: now, update_time: now };
  }

  getByRoleId(roleId: string): StageConfig[] {
    return this.findAllByField<StageConfig>('stage_config', 'role_id', roleId);
  }

  getByProject(projectId: string): StageConfig[] {
    return this.findAllByField<StageConfig>('stage_config', 'project_id', projectId);
  }

  deleteByRoleId(roleId: string): number {
    return this.deleteByField('stage_config', 'role_id', roleId);
  }

  deleteByProject(projectId: string): number {
    return this.deleteByField('stage_config', 'project_id', projectId);
  }
}
