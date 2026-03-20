// =============================================
// 数据标注需求交付评估计算工具
// 算法引擎 + 数据库层 公共API
// =============================================

// --- Types ---
export { FlowMode, ProjectStatus, RoleType, CalcType, DateType, ActionType, TargetType, ConfigType } from './types/enums';
export { AppError, ErrorCode } from './types/error-codes';
export { WarningType, WarningSeverity } from './types/warning.types';
export type { Warning } from './types/warning.types';
export type { Project, WarnThreshold, FlowConfig, RoleConfig, StageConfig, OvertimeConfig, OvertimeRate } from './types/project.types';
export type { CostConfig, StaffAllocation, CalcSnapshot, OperationLog, ReportTemplate, SystemConfig } from './types/config.types';
export type {
  Pipeline, PipelineStage, PipelineGap,
  SimulationInput, SimulationResult, DailyStageState, DailyCapacity,
  StaffingResult, CapacityResult, EvaluationResult,
  DailyPlanEntry, DailyMetricEntry, DailyDeliveryEntry, CostSummary,
  OvertimeEntry, StageEntry, CostEntry, OvertimeRateEntry,
} from './types/algorithm.types';

// --- Database ---
export { getDatabase, createInMemoryDatabase, closeDatabase } from './db/connection';
export { runMigrations } from './db/migrations';

// --- Repositories ---
export { ProjectRepository } from './db/repositories/project.repository';
export { FlowConfigRepository } from './db/repositories/flow-config.repository';
export { RoleConfigRepository } from './db/repositories/role-config.repository';
export { StageConfigRepository } from './db/repositories/stage-config.repository';
export { OvertimeRepository } from './db/repositories/overtime.repository';
export { CostRepository } from './db/repositories/cost.repository';
export { SnapshotRepository } from './db/repositories/snapshot.repository';
export { LogRepository } from './db/repositories/log.repository';
export { SystemConfigRepository } from './db/repositories/system-config.repository';

// --- Engine (pure functions, no DB dependency) ---
export { buildWorkingDays, buildRoleWorkingDays, buildOvertimeLookup } from './engine/calendar';
export { buildPipeline, totalGapSum, getGapBetween, getAvailableDays } from './engine/pipeline-builder';
export { buildCapacityMatrix } from './engine/capacity-calculator';
export { runDailyRecursion, meetsDeliveryTarget } from './engine/daily-recursion';
export { findOptimalStaffing } from './engine/optimal-staffing';
export { findMaxCapacity } from './engine/max-capacity';
export { calculateDeliveryMetrics } from './engine/delivery-metrics';
export { generateWarnings } from './engine/warning-engine';
export type { WarningInput } from './engine/warning-engine';
export { calculateCost } from './engine/cost-engine';
export type { CostInput } from './engine/cost-engine';

// --- Services (orchestrate DB + Engine) ---
export { ProjectService } from './services/project.service';
export { ConfigService } from './services/config.service';
export { CalculationService } from './services/calculation.service';
export { ExportService } from './services/export.service';
export type { ExportData } from './services/export.service';
export { CalendarService } from './services/calendar.service';
export type { CalendarData } from './services/calendar.service';
export { BackupService } from './services/backup.service';
export type { BackupData, BackupMetadata } from './services/backup.service';
export { TemplateService } from './services/template.service';
export { SecurityService } from './services/security.service';
export { AuditService } from './services/audit.service';
export { FileExportService } from './services/file-export.service';
export {
  validateProjectInput,
  validateRoleConfig,
  validateFlowConfig,
  validatePipelineRoles,
  validateRoleTypeForMode,
  validateFlowNodeForMode,
  validateStageCoverage,
  validateOvertimeDates,
  validateStateTransition,
  validateGapSum,
  validateCalculationReady,
} from './services/validation.service';
export type { ValidationResult } from './services/validation.service';

// --- Utilities ---
export { generateId } from './utils/uuid';
export { hashParams } from './utils/hash';
export { parseDate, formatDate, nowISO, dateRange, addDays, isWeekend } from './utils/date';
