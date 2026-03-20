import type Database from 'better-sqlite3';
import { up as migration001 } from './001_initial_schema';

interface Migration {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
}

const migrations: Migration[] = [
  { version: 1, name: '001_initial_schema', up: migration001 },
];

/**
 * Run all pending migrations.
 * Uses SQLite user_version pragma to track current schema version.
 */
export function runMigrations(db: Database.Database): void {
  const currentVersion = db.pragma('user_version', { simple: true }) as number;

  const pending = migrations.filter(m => m.version > currentVersion);
  if (pending.length === 0) return;

  const runAll = db.transaction(() => {
    for (const migration of pending) {
      migration.up(db);
      db.pragma(`user_version = ${migration.version}`);
    }
  });

  runAll();
}
