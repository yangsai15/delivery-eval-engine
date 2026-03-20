/** 流程模式 */
export enum FlowMode {
  Standard = 'standard',
  LabelQC = 'label_qc',
}

/** 项目状态 */
export enum ProjectStatus {
  Draft = 'draft',
  Configured = 'configured',
  Calculated = 'calculated',
  Archived = 'archived',
}

/** 角色类型 */
export enum RoleType {
  Screen = 'screen',
  Label = 'label',
  QA1 = 'qa1',
  LabelQC = 'label_qc',
  QA2 = 'qa2',
}

/** 测算类型 */
export enum CalcType {
  Staffing = 'staffing',
  Capacity = 'capacity',
  Evaluation = 'evaluation',
}

/** 日期类型（加班） */
export enum DateType {
  Workday = 'workday',
  Weekend = 'weekend',
  Holiday = 'holiday',
}

/** 操作类型（日志） */
export enum ActionType {
  Create = 'create',
  Edit = 'edit',
  Delete = 'delete',
  Export = 'export',
  Archive = 'archive',
  Calc = 'calc',
  Backup = 'backup',
  Restore = 'restore',
}

/** 操作对象类型（日志） */
export enum TargetType {
  Project = 'project',
  Config = 'config',
  Template = 'template',
  System = 'system',
}

/** 系统配置类型 */
export enum ConfigType {
  Calendar = 'calendar',
  Template = 'template',
  Parameter = 'parameter',
  ReportTemplate = 'report_template',
  Preference = 'preference',
}
