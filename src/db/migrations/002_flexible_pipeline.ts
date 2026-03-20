import type Database from 'better-sqlite3';

/**
 * Migration 002: Flexible Pipeline
 *
 * - Add pipeline_roles column to project table (JSON array of role strings)
 * - Remove CHECK constraint on role_config.role_type to allow arbitrary role names
 * - Populate pipeline_roles from existing flow_mode for backwards compatibility
 */
export function up(db: Database.Database): void {
  // Add pipeline_roles column (nullable for existing rows, will be populated below)
  db.exec(`ALTER TABLE project ADD COLUMN pipeline_roles TEXT`);

  // Populate pipeline_roles based on existing flow_mode and enable_screen
  db.exec(`
    UPDATE project SET pipeline_roles = CASE
      WHEN flow_mode = 'label_qc' AND enable_screen = 1 THEN '["screen","label_qc","qa2"]'
      WHEN flow_mode = 'label_qc' AND enable_screen = 0 THEN '["label_qc","qa2"]'
      WHEN flow_mode = 'standard' AND enable_screen = 1 THEN '["screen","label","qa1","qa2"]'
      WHEN flow_mode = 'standard' AND enable_screen = 0 THEN '["label","qa1","qa2"]'
      ELSE '["label","qa1","qa2"]'
    END
    WHERE pipeline_roles IS NULL
  `);

  // Recreate role_config without CHECK constraint on role_type
  // SQLite doesn't support DROP CONSTRAINT, so we recreate the table
  db.exec(`
    CREATE TABLE role_config_new (
      role_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      role_type TEXT NOT NULL,
      daily_efficiency REAL NOT NULL CHECK(daily_efficiency > 0),
      base_people INTEGER NOT NULL CHECK(base_people >= 1),
      enable_stage INTEGER NOT NULL DEFAULT 0,
      create_time TEXT NOT NULL,
      update_time TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES project(project_id)
    );

    INSERT INTO role_config_new SELECT * FROM role_config;

    DROP TABLE role_config;

    ALTER TABLE role_config_new RENAME TO role_config;

    CREATE INDEX IF NOT EXISTS idx_role_config_project ON role_config(project_id);
  `);
}
