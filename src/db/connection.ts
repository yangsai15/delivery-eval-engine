import Database from 'better-sqlite3';
import path from 'path';

let db: Database.Database | null = null;

export interface ConnectionOptions {
  dbPath?: string;
  inMemory?: boolean;
}

/**
 * Get or create the database connection.
 * WAL mode, busy_timeout=5000, foreign_keys=ON.
 */
export function getDatabase(options?: ConnectionOptions): Database.Database {
  if (db) return db;

  const dbPath = options?.inMemory
    ? ':memory:'
    : options?.dbPath ?? path.join(process.cwd(), 'data', 'delivery-eval.db');

  db = new Database(dbPath);

  // Configure pragmas
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');

  return db;
}

/**
 * Create a fresh in-memory database (useful for testing).
 */
export function createInMemoryDatabase(): Database.Database {
  const memDb = new Database(':memory:');
  memDb.pragma('journal_mode = WAL');
  memDb.pragma('busy_timeout = 5000');
  memDb.pragma('foreign_keys = ON');
  return memDb;
}

/**
 * Close the database connection.
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
