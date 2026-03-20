import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec(`
    -- 1. 项目主表
    CREATE TABLE IF NOT EXISTS project (
      project_id TEXT PRIMARY KEY,
      project_name TEXT NOT NULL,
      label_type TEXT NOT NULL,
      unit TEXT NOT NULL,
      total_data INTEGER NOT NULL CHECK(total_data >= 1),
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      flow_mode TEXT NOT NULL CHECK(flow_mode IN ('standard', 'label_qc')),
      enable_screen INTEGER NOT NULL DEFAULT 0,
      screen_efficiency REAL,
      final_efficiency REAL NOT NULL CHECK(final_efficiency > 0 AND final_efficiency <= 100),
      enable_overtime INTEGER NOT NULL DEFAULT 0,
      enable_cost INTEGER NOT NULL DEFAULT 0,
      warn_threshold TEXT NOT NULL DEFAULT '{"data_shortage":100,"labor_overflow":100}',
      calendar_id TEXT NOT NULL DEFAULT 'default',
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'configured', 'calculated', 'archived')),
      create_time TEXT NOT NULL,
      update_time TEXT NOT NULL,
      archived_time TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      remark TEXT
    );

    -- 2. 环节流转配置表
    CREATE TABLE IF NOT EXISTS flow_config (
      flow_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      flow_node TEXT NOT NULL,
      interval_days REAL NOT NULL CHECK(interval_days >= 0),
      create_time TEXT NOT NULL,
      update_time TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES project(project_id)
    );

    -- 3. 角色人效配置表
    CREATE TABLE IF NOT EXISTS role_config (
      role_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      role_type TEXT NOT NULL CHECK(role_type IN ('screen', 'label', 'qa1', 'label_qc', 'qa2')),
      daily_efficiency REAL NOT NULL CHECK(daily_efficiency > 0),
      base_people INTEGER NOT NULL CHECK(base_people >= 1),
      enable_stage INTEGER NOT NULL DEFAULT 0,
      create_time TEXT NOT NULL,
      update_time TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES project(project_id)
    );

    -- 4. 分阶段人力配置表
    CREATE TABLE IF NOT EXISTS stage_config (
      stage_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      people_num INTEGER NOT NULL CHECK(people_num >= 1),
      create_time TEXT NOT NULL,
      update_time TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES project(project_id),
      FOREIGN KEY (role_id) REFERENCES role_config(role_id)
    );

    -- 5. 加班配置表
    CREATE TABLE IF NOT EXISTS overtime_config (
      overtime_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      role_type TEXT NOT NULL,
      overtime_date TEXT NOT NULL,
      overtime_days REAL NOT NULL CHECK(overtime_days > 0),
      date_type TEXT NOT NULL CHECK(date_type IN ('workday', 'weekend', 'holiday')),
      create_time TEXT NOT NULL,
      update_time TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES project(project_id)
    );

    -- 6. 成本配置表
    CREATE TABLE IF NOT EXISTS cost_config (
      cost_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      work_type TEXT NOT NULL,
      role_type TEXT NOT NULL,
      daily_salary REAL NOT NULL CHECK(daily_salary >= 0),
      people_num INTEGER NOT NULL CHECK(people_num >= 1),
      create_time TEXT NOT NULL,
      update_time TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES project(project_id)
    );

    -- 7. 人员分配表
    CREATE TABLE IF NOT EXISTS staff_allocation (
      allocation_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      role_type TEXT NOT NULL,
      work_type TEXT NOT NULL,
      people_num INTEGER NOT NULL CHECK(people_num >= 1),
      stage_id TEXT,
      create_time TEXT NOT NULL,
      update_time TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES project(project_id),
      FOREIGN KEY (stage_id) REFERENCES stage_config(stage_id)
    );

    -- 8. 加班倍率配置表
    CREATE TABLE IF NOT EXISTS overtime_rate (
      rate_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      date_type TEXT NOT NULL CHECK(date_type IN ('workday', 'weekend', 'holiday')),
      rate REAL NOT NULL CHECK(rate > 0),
      create_time TEXT NOT NULL,
      update_time TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES project(project_id)
    );

    -- 9. 计算结果快照表
    CREATE TABLE IF NOT EXISTS calc_snapshot (
      snapshot_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      calc_type TEXT NOT NULL CHECK(calc_type IN ('staffing', 'capacity', 'evaluation')),
      params_hash TEXT NOT NULL,
      result_data TEXT NOT NULL,
      warnings TEXT,
      create_time TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES project(project_id)
    );

    -- 10. 操作日志表
    CREATE TABLE IF NOT EXISTS operation_log (
      log_id TEXT PRIMARY KEY,
      project_id TEXT,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      detail TEXT,
      hmac_signature TEXT NOT NULL,
      create_time TEXT NOT NULL
    );

    -- 11. 汇报模板表
    CREATE TABLE IF NOT EXISTS report_template (
      template_id TEXT PRIMARY KEY,
      template_name TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      sections TEXT NOT NULL,
      style_config TEXT,
      create_time TEXT NOT NULL,
      update_time TEXT NOT NULL
    );

    -- 12. 用户安全信息表
    CREATE TABLE IF NOT EXISTS user_security (
      security_id TEXT PRIMARY KEY,
      password_hash TEXT,
      master_key_encrypted TEXT NOT NULL,
      recovery_key_hash TEXT,
      password_set INTEGER NOT NULL DEFAULT 0,
      last_password_change TEXT,
      create_time TEXT NOT NULL,
      update_time TEXT NOT NULL
    );

    -- 13. 系统配置表
    CREATE TABLE IF NOT EXISTS system_config (
      config_id TEXT PRIMARY KEY,
      config_type TEXT NOT NULL,
      config_name TEXT NOT NULL,
      config_content TEXT NOT NULL,
      create_time TEXT NOT NULL,
      update_time TEXT NOT NULL
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_project_status ON project(status) WHERE is_deleted = 0;
    CREATE INDEX IF NOT EXISTS idx_project_name ON project(project_name) WHERE is_deleted = 0;
    CREATE INDEX IF NOT EXISTS idx_flow_config_project ON flow_config(project_id);
    CREATE INDEX IF NOT EXISTS idx_role_config_project ON role_config(project_id);
    CREATE INDEX IF NOT EXISTS idx_stage_config_role ON stage_config(role_id);
    CREATE INDEX IF NOT EXISTS idx_overtime_config_project ON overtime_config(project_id);
    CREATE INDEX IF NOT EXISTS idx_cost_config_project ON cost_config(project_id);
    CREATE INDEX IF NOT EXISTS idx_staff_allocation_project ON staff_allocation(project_id);
    CREATE INDEX IF NOT EXISTS idx_overtime_rate_project ON overtime_rate(project_id);
    CREATE INDEX IF NOT EXISTS idx_calc_snapshot_project ON calc_snapshot(project_id);
    CREATE INDEX IF NOT EXISTS idx_operation_log_project ON operation_log(project_id);
    CREATE INDEX IF NOT EXISTS idx_system_config_type ON system_config(config_type);
  `);
}
