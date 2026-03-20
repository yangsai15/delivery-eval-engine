import { CalcType, DateType } from './enums';

export interface CostConfig {
  cost_id: string;
  project_id: string;
  work_type: string;
  role_type: string;
  daily_salary: number;
  people_num: number;
  create_time: string;
  update_time: string;
}

export interface StaffAllocation {
  allocation_id: string;
  project_id: string;
  role_type: string;
  work_type: string;
  people_num: number;
  stage_id: string | null;
  create_time: string;
  update_time: string;
}

export interface CalcSnapshot {
  snapshot_id: string;
  project_id: string;
  calc_type: CalcType;
  params_hash: string;
  result_data: Record<string, unknown>;
  warnings: WarningRecord[];
  create_time: string;
}

export interface WarningRecord {
  type: string;
  role: string;
  day: number;
  current_value: number;
  threshold: number;
  severity: string;
  message: string;
}

export interface OperationLog {
  log_id: string;
  project_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  detail: Record<string, unknown> | null;
  hmac_signature: string;
  create_time: string;
}

export interface ReportTemplate {
  template_id: string;
  template_name: string;
  is_default: boolean;
  sections: SectionConfig[];
  style_config: StyleConfig | null;
  create_time: string;
  update_time: string;
}

export interface SectionConfig {
  section_id: string;
  section_type: string;
  title: string;
  enabled: boolean;
  order: number;
}

export interface StyleConfig {
  logo_path?: string;
  primary_color?: string;
  font_family?: string;
  header_font_size?: number;
  body_font_size?: number;
}

export interface UserSecurity {
  security_id: string;
  password_hash: string | null;
  master_key_encrypted: string;
  recovery_key_hash: string | null;
  password_set: boolean;
  last_password_change: string | null;
  create_time: string;
  update_time: string;
}

export interface SystemConfig {
  config_id: string;
  config_type: string;
  config_name: string;
  config_content: Record<string, unknown>;
  create_time: string;
  update_time: string;
}
