import { FlowMode, RoleType, ProjectStatus } from '../types/enums';
import { AppError, ErrorCode } from '../types/error-codes';
import { Project, RoleConfig, FlowConfig, StageConfig, OvertimeConfig } from '../types/project.types';

export interface ValidationResult {
  valid: boolean;
  errors: AppError[];
  warnings: AppError[];
}

/**
 * Validate project creation/update input.
 * Implements B-01 through B-13 boundary rules.
 */
export function validateProjectInput(input: {
  project_name?: string;
  total_data?: number;
  start_date?: string;
  end_date?: string;
  screen_efficiency?: number | null;
  final_efficiency?: number;
  enable_screen?: boolean;
}): ValidationResult {
  const errors: AppError[] = [];
  const warnings: AppError[] = [];

  // B-01: project name
  if (input.project_name !== undefined && input.project_name.trim() === '') {
    errors.push(new AppError(ErrorCode.E1001));
  }

  // B-02: total_data >= 1
  if (input.total_data !== undefined) {
    if (input.total_data < 1) {
      errors.push(new AppError(ErrorCode.E1003));
    }
    // B-13: total_data > 10,000,000
    if (input.total_data > 10_000_000) {
      warnings.push(new AppError(ErrorCode.E1013));
    }
  }

  // B-07: date range
  if (input.start_date && input.end_date) {
    if (input.end_date < input.start_date) {
      errors.push(new AppError(ErrorCode.E1007));
    }
  }

  // B-03 & B-04: screen_efficiency
  if (input.enable_screen && input.screen_efficiency != null) {
    if (input.screen_efficiency <= 0) {
      errors.push(new AppError(ErrorCode.E1004, '筛图有效率不可为0'));
    }
    if (input.screen_efficiency > 100) {
      errors.push(new AppError(ErrorCode.E1004, '筛图有效率不可超过100%'));
    }
  }

  // B-03 & B-04: final_efficiency
  if (input.final_efficiency !== undefined) {
    if (input.final_efficiency <= 0) {
      errors.push(new AppError(ErrorCode.E1004, '最终交付有效率不可为0'));
    }
    if (input.final_efficiency > 100) {
      errors.push(new AppError(ErrorCode.E1004, '最终交付有效率不可超过100%'));
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate role configuration.
 * B-05: efficiency > 0
 * B-06: people >= 1
 * B-12: people > 1000
 */
export function validateRoleConfig(config: {
  daily_efficiency: number;
  base_people: number;
}): ValidationResult {
  const errors: AppError[] = [];
  const warnings: AppError[] = [];

  if (config.daily_efficiency <= 0) {
    errors.push(new AppError(ErrorCode.E1005));
  }
  if (config.base_people < 1) {
    errors.push(new AppError(ErrorCode.E1006));
  }
  if (config.base_people > 1000) {
    warnings.push(new AppError(ErrorCode.E1012));
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate flow config.
 * B-08: interval precision must be 0.5 multiple
 */
export function validateFlowConfig(config: {
  interval_days: number;
}): ValidationResult {
  const errors: AppError[] = [];
  const warnings: AppError[] = [];

  if (config.interval_days < 0) {
    errors.push(new AppError(ErrorCode.E1008, '流转间隔不可为负'));
  }
  if (config.interval_days % 0.5 !== 0) {
    errors.push(new AppError(ErrorCode.E1008));
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate pipeline_roles array.
 * - Must have at least 2 roles
 * - No duplicate role names
 * - If first role is 'screen', it's valid (screen stage auto-applied)
 */
export function validatePipelineRoles(pipelineRoles: string[]): ValidationResult {
  const errors: AppError[] = [];
  const warnings: AppError[] = [];

  if (!Array.isArray(pipelineRoles) || pipelineRoles.length < 2) {
    errors.push(new AppError(ErrorCode.E1011, '流程链至少需要2个角色'));
  }

  if (pipelineRoles.length > 0) {
    const seen = new Set<string>();
    for (const role of pipelineRoles) {
      if (!role || typeof role !== 'string' || role.trim() === '') {
        errors.push(new AppError(ErrorCode.E1011, '角色名称不可为空'));
        break;
      }
      if (seen.has(role)) {
        errors.push(new AppError(ErrorCode.E1011, `角色 ${role} 在流程链中重复`));
        break;
      }
      seen.add(role);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * DC-01: role_type matches flow_mode.
 * @deprecated Use validatePipelineRoles instead for flexible pipeline mode.
 */
export function validateRoleTypeForMode(roleType: string, flowMode: FlowMode): boolean {
  const standardRoles = [RoleType.Screen, RoleType.Label, RoleType.QA1, RoleType.QA2];
  const labelQcRoles = [RoleType.Screen, RoleType.LabelQC, RoleType.QA2];

  if (flowMode === FlowMode.Standard) return standardRoles.includes(roleType as RoleType);
  return labelQcRoles.includes(roleType as RoleType);
}

/**
 * DC-02: flow_node matches flow_mode.
 * @deprecated Use validatePipelineRoles instead for flexible pipeline mode.
 */
export function validateFlowNodeForMode(flowNode: string, flowMode: FlowMode): boolean {
  const standardNodes = ['screen→label', 'label→qa1', 'qa1→qa2'];
  const labelQcNodes = ['screen→label_qc', 'label_qc→qa2'];

  if (flowMode === FlowMode.Standard) return standardNodes.includes(flowNode);
  return labelQcNodes.includes(flowNode);
}

/**
 * DC-03: Stage configs must continuously cover project period.
 */
export function validateStageCoverage(
  stages: StageConfig[],
  projectStart: string,
  projectEnd: string,
): ValidationResult {
  const errors: AppError[] = [];
  if (stages.length === 0) return { valid: true, errors, warnings: [] };

  // Sort by start_date
  const sorted = [...stages].sort((a, b) => a.start_date.localeCompare(b.start_date));

  // First stage must start on project start
  if (sorted[0].start_date !== projectStart) {
    errors.push(new AppError(ErrorCode.E1009, `首阶段起始日期(${sorted[0].start_date})与项目开始日期(${projectStart})不一致`));
  }

  // Last stage must end on project end
  if (sorted[sorted.length - 1].end_date !== projectEnd) {
    errors.push(new AppError(ErrorCode.E1009, `末阶段结束日期(${sorted[sorted.length - 1].end_date})与项目结束日期(${projectEnd})不一致`));
  }

  // Check continuity (no gaps, no overlaps)
  for (let i = 1; i < sorted.length; i++) {
    const prevEnd = sorted[i - 1].end_date;
    const currStart = sorted[i].start_date;
    // Next day after prevEnd should be currStart
    const prevEndDate = new Date(prevEnd);
    prevEndDate.setDate(prevEndDate.getDate() + 1);
    const expectedStart = prevEndDate.toISOString().split('T')[0];
    if (currStart !== expectedStart) {
      errors.push(new AppError(ErrorCode.E1009, `阶段间存在空隙或重叠: ${prevEnd} ~ ${currStart}`));
    }
  }

  return { valid: errors.length === 0, errors, warnings: [] };
}

/**
 * DC-04: Overtime dates within project period.
 */
export function validateOvertimeDates(
  overtimeConfigs: OvertimeConfig[],
  projectStart: string,
  projectEnd: string,
): ValidationResult {
  const errors: AppError[] = [];

  for (const ot of overtimeConfigs) {
    if (ot.overtime_date < projectStart || ot.overtime_date > projectEnd) {
      errors.push(new AppError(ErrorCode.E1010, `加班日期${ot.overtime_date}超出项目周期`));
    }
  }

  return { valid: errors.length === 0, errors, warnings: [] };
}

/**
 * DC-06: State transition validation.
 */
export function validateStateTransition(current: ProjectStatus, target: ProjectStatus): boolean {
  const validTransitions: Record<ProjectStatus, ProjectStatus[]> = {
    [ProjectStatus.Draft]: [ProjectStatus.Configured],
    [ProjectStatus.Configured]: [ProjectStatus.Calculated],
    [ProjectStatus.Calculated]: [ProjectStatus.Configured, ProjectStatus.Archived],
    [ProjectStatus.Archived]: [],
  };

  return validTransitions[current]?.includes(target) ?? false;
}

/**
 * B-07: Check if gap sum exceeds working days.
 */
export function validateGapSum(flowConfigs: FlowConfig[], workingDays: number): ValidationResult {
  const errors: AppError[] = [];
  const warnings: AppError[] = [];
  const totalGap = flowConfigs.reduce((sum, fc) => sum + fc.interval_days, 0);

  if (totalGap >= workingDays) {
    warnings.push(new AppError(ErrorCode.E2002, '流转间隔总和接近或超过项目周期，下游环节可用工作日极少'));
  }

  return { valid: true, errors, warnings };
}

/**
 * Comprehensive pre-calculation validation.
 * Checks all required configs are present (E2005).
 * Uses pipeline_roles for role validation instead of flow_mode.
 */
export function validateCalculationReady(
  project: Project,
  roleConfigs: RoleConfig[],
  flowConfigs: FlowConfig[],
  workingDays: number,
): ValidationResult {
  const errors: AppError[] = [];
  const warnings: AppError[] = [];

  // Must have at least one role config
  if (roleConfigs.length === 0) {
    errors.push(new AppError(ErrorCode.E2005, '缺少角色配置'));
  }

  // Working days >= 1 (B-01)
  if (workingDays < 1) {
    errors.push(new AppError(ErrorCode.E1007, '有效工作日数不足'));
  } else if (workingDays === 1) {
    warnings.push(new AppError(ErrorCode.E1007, '项目周期仅1个工作日，结果仅供参考'));
  }

  // Check all roles in pipeline_roles have config
  const pipelineRoles = project.pipeline_roles;
  if (pipelineRoles && pipelineRoles.length > 0) {
    for (const rt of pipelineRoles) {
      if (!roleConfigs.find(r => r.role_type === rt)) {
        errors.push(new AppError(ErrorCode.E2005, `缺少${rt}角色配置`));
      }
    }
  } else {
    errors.push(new AppError(ErrorCode.E2005, '缺少流程链配置(pipeline_roles)'));
  }

  // Gap sum check
  const gapResult = validateGapSum(flowConfigs, workingDays);
  warnings.push(...gapResult.warnings);

  return { valid: errors.length === 0, errors, warnings };
}
