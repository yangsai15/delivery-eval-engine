import type Database from 'better-sqlite3';
import { BaseRepository, generateId, nowISO } from './base.repository';
import { SystemConfig } from '../../types/config.types';

interface SystemConfigRow {
  config_id: string;
  config_type: string;
  config_name: string;
  config_content: string;
  create_time: string;
  update_time: string;
}

export class SystemConfigRepository extends BaseRepository {
  constructor(db: Database.Database) {
    super(db);
  }

  create(input: Omit<SystemConfig, 'config_id' | 'create_time' | 'update_time'>): SystemConfig {
    const now = nowISO();
    const id = generateId();
    this.db.prepare(`
      INSERT INTO system_config (config_id, config_type, config_name, config_content, create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, input.config_type, input.config_name, this.toJSON(input.config_content), now, now);
    return { config_id: id, ...input, create_time: now, update_time: now };
  }

  getByType(configType: string): SystemConfig[] {
    const rows = this.findAllByField<SystemConfigRow>('system_config', 'config_type', configType);
    return rows.map(r => ({
      ...r,
      config_content: this.parseJSON<Record<string, unknown>>(r.config_content) ?? {},
    }));
  }

  getById(configId: string): SystemConfig | undefined {
    const row = this.findById<SystemConfigRow>('system_config', 'config_id', configId);
    if (!row) return undefined;
    return {
      ...row,
      config_content: this.parseJSON<Record<string, unknown>>(row.config_content) ?? {},
    };
  }

  update(configId: string, content: Record<string, unknown>): void {
    this.db.prepare(
      'UPDATE system_config SET config_content = ?, update_time = ? WHERE config_id = ?'
    ).run(this.toJSON(content), nowISO(), configId);
  }

  delete(configId: string): number {
    return this.db.prepare('DELETE FROM system_config WHERE config_id = ?').run(configId).changes;
  }
}
