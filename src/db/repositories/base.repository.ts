import type Database from 'better-sqlite3';
import { generateId } from '../../utils/uuid';
import { nowISO } from '../../utils/date';

export { generateId, nowISO };

export class BaseRepository {
  constructor(protected db: Database.Database) {}

  protected findById<T>(table: string, idColumn: string, id: string): T | undefined {
    const stmt = this.db.prepare(`SELECT * FROM ${table} WHERE ${idColumn} = ?`);
    return stmt.get(id) as T | undefined;
  }

  protected findAllByField<T>(table: string, field: string, value: unknown): T[] {
    const stmt = this.db.prepare(`SELECT * FROM ${table} WHERE ${field} = ?`);
    return stmt.all(value) as T[];
  }

  protected deleteByField(table: string, field: string, value: unknown): number {
    const stmt = this.db.prepare(`DELETE FROM ${table} WHERE ${field} = ?`);
    return stmt.run(value).changes;
  }

  protected parseJSON<T>(value: string | null | undefined): T | null {
    if (value == null) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  protected toJSON(value: unknown): string {
    return JSON.stringify(value);
  }

  protected toBool(value: unknown): boolean {
    return value === 1 || value === true;
  }

  protected fromBool(value: boolean): number {
    return value ? 1 : 0;
  }
}
