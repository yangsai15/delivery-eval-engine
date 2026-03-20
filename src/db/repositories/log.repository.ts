import type Database from 'better-sqlite3';
import { BaseRepository, generateId, nowISO } from './base.repository';
import { OperationLog } from '../../types/config.types';

interface LogRow {
  log_id: string;
  project_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  detail: string | null;
  hmac_signature: string;
  create_time: string;
}

export class LogRepository extends BaseRepository {
  constructor(db: Database.Database) {
    super(db);
  }

  create(input: Omit<OperationLog, 'log_id' | 'create_time'>): OperationLog {
    const now = nowISO();
    const id = generateId();
    this.db.prepare(`
      INSERT INTO operation_log (log_id, project_id, action, target_type, target_id, detail, hmac_signature, create_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, input.project_id, input.action, input.target_type,
      input.target_id, input.detail ? this.toJSON(input.detail) : null,
      input.hmac_signature, now
    );
    return { log_id: id, ...input, create_time: now };
  }

  getByProject(projectId: string): OperationLog[] {
    const rows = this.db.prepare(
      'SELECT * FROM operation_log WHERE project_id = ? ORDER BY create_time DESC'
    ).all(projectId) as LogRow[];
    return rows.map(r => ({
      ...r,
      detail: this.parseJSON<Record<string, unknown>>(r.detail),
    }));
  }

  getRecent(limit: number = 100): OperationLog[] {
    const rows = this.db.prepare(
      'SELECT * FROM operation_log ORDER BY create_time DESC LIMIT ?'
    ).all(limit) as LogRow[];
    return rows.map(r => ({
      ...r,
      detail: this.parseJSON<Record<string, unknown>>(r.detail),
    }));
  }
}
