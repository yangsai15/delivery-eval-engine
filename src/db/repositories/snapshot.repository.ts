import type Database from 'better-sqlite3';
import { BaseRepository, generateId, nowISO } from './base.repository';
import { CalcSnapshot, WarningRecord } from '../../types/config.types';
import { CalcType } from '../../types/enums';

interface SnapshotRow {
  snapshot_id: string;
  project_id: string;
  calc_type: string;
  params_hash: string;
  result_data: string;
  warnings: string | null;
  create_time: string;
}

export class SnapshotRepository extends BaseRepository {
  constructor(db: Database.Database) {
    super(db);
  }

  create(input: Omit<CalcSnapshot, 'snapshot_id' | 'create_time'>): CalcSnapshot {
    const now = nowISO();
    const id = generateId();
    this.db.prepare(`
      INSERT INTO calc_snapshot (snapshot_id, project_id, calc_type, params_hash, result_data, warnings, create_time)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, input.project_id, input.calc_type, input.params_hash,
      this.toJSON(input.result_data),
      input.warnings ? this.toJSON(input.warnings) : null,
      now
    );
    return { snapshot_id: id, ...input, create_time: now };
  }

  getByProject(projectId: string): CalcSnapshot[] {
    const rows = this.db.prepare(
      'SELECT * FROM calc_snapshot WHERE project_id = ? ORDER BY create_time DESC'
    ).all(projectId) as SnapshotRow[];
    return rows.map(r => this.rowToSnapshot(r));
  }

  getLatest(projectId: string, calcType: CalcType): CalcSnapshot | undefined {
    const row = this.db.prepare(
      'SELECT * FROM calc_snapshot WHERE project_id = ? AND calc_type = ? ORDER BY create_time DESC LIMIT 1'
    ).get(projectId, calcType) as SnapshotRow | undefined;
    return row ? this.rowToSnapshot(row) : undefined;
  }

  private rowToSnapshot(row: SnapshotRow): CalcSnapshot {
    return {
      ...row,
      calc_type: row.calc_type as CalcType,
      result_data: this.parseJSON<Record<string, unknown>>(row.result_data) ?? {},
      warnings: this.parseJSON<WarningRecord[]>(row.warnings) ?? [],
    };
  }

  deleteByProject(projectId: string): number {
    return this.deleteByField('calc_snapshot', 'project_id', projectId);
  }

  /** Keep only the latest N snapshots for a project, delete older ones */
  pruneSnapshots(projectId: string, keepCount: number = 20): number {
    const result = this.db.prepare(`
      DELETE FROM calc_snapshot WHERE snapshot_id NOT IN (
        SELECT snapshot_id FROM calc_snapshot WHERE project_id = ? ORDER BY create_time DESC LIMIT ?
      ) AND project_id = ?
    `).run(projectId, keepCount, projectId);
    return result.changes;
  }
}
