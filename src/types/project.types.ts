import { FlowMode, ProjectStatus, DateType } from './enums';

export interface Project {
  project_id: string;
  project_name: string;
  label_type: string;
  unit: string;
  total_data: number;
  start_date: string; // YYYY-MM-DD
  end_date: string;
  flow_mode: FlowMode;
  pipeline_roles: string[];
  enable_screen: boolean;
  screen_efficiency: number | null; // (0, 100], null when screen disabled
  final_efficiency: number; // (0, 100]
  enable_overtime: boolean;
  enable_cost: boolean;
  warn_threshold: WarnThreshold;
  calendar_id: string;
  status: ProjectStatus;
  create_time: string;
  update_time: string;
  archived_time: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  remark: string | null;
}

export interface WarnThreshold {
  data_shortage: number;   // default 100 (percent)
  labor_overflow: number;  // default 100 (percent)
}

export interface FlowConfig {
  flow_id: string;
  project_id: string;
  flow_node: string; // e.g. 'screen→label', 'label→qa1'
  interval_days: number; // ≥0, precision 0.5
  create_time: string;
  update_time: string;
}

export interface RoleConfig {
  role_id: string;
  project_id: string;
  role_type: string; // flexible role name (e.g. 'screen', 'label', 'qa1', custom)
  daily_efficiency: number; // positive
  base_people: number; // positive integer ≥1
  enable_stage: boolean;
  create_time: string;
  update_time: string;
}

export interface StageConfig {
  stage_id: string;
  project_id: string;
  role_id: string;
  start_date: string;
  end_date: string;
  people_num: number; // positive integer ≥1
  create_time: string;
  update_time: string;
}

export interface OvertimeConfig {
  overtime_id: string;
  project_id: string;
  role_type: string; // flexible role name
  overtime_date: string;
  overtime_days: number; // positive decimal
  date_type: DateType;
  create_time: string;
  update_time: string;
}

export interface OvertimeRate {
  rate_id: string;
  project_id: string;
  date_type: DateType;
  rate: number; // e.g. 1.5, 2.0, 3.0
  create_time: string;
  update_time: string;
}
