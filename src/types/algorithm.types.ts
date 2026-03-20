import { FlowMode, RoleType, CalcType } from './enums';

/** 流程链中的环节定义 */
export interface PipelineStage {
  index: number;        // 1-indexed position in pipeline
  roleType: RoleType;
  efficiency: number;   // daily_efficiency per person
  basePeople: number;   // base configured people
  isScreenStage: boolean;
}

/** 流转间隔数组（与环节链关联） */
export interface PipelineGap {
  fromIndex: number;    // 1-indexed
  toIndex: number;      // 1-indexed
  gapDays: number;      // ≥0, precision 0.5
}

/** 构建好的流程链 */
export interface Pipeline {
  stages: PipelineStage[];
  gaps: PipelineGap[];
  flowMode: FlowMode;
  enableScreen: boolean;
  screenRate: number;   // R_screen (decimal 0-1)
  finalRate: number;    // R_final (decimal 0-1)
}

/** 每个环节每日的产能配置 */
export interface DailyCapacity {
  people: number;       // configured people on this day
  efficiency: number;   // per-person daily efficiency
  overtimeCap: number;  // additional overtime capacity
  totalCap: number;     // people * efficiency + overtimeCap
}

/** 模拟输入 */
export interface SimulationInput {
  pipeline: Pipeline;
  totalData: number;        // N_raw
  workingDays: number;      // D
  /** Cap[stageIndex][dayIndex], both 1-indexed */
  capacity: DailyCapacity[][];
  warnThreshold: {
    dataShortage: number;   // percentage
    laborOverflow: number;  // percentage
  };
}

/** 每日每环节的模拟状态 */
export interface DailyStageState {
  inflow: number;       // In[i][d]
  backlog: number;      // Backlog[i][d] (after processing)
  capacity: number;     // Cap[i][d]
  processed: number;    // Proc[i][d]
  output: number;       // Out[i][d]
}

/** 模拟结果 */
export interface SimulationResult {
  /** dailyStates[stageIndex][dayIndex], both 1-indexed */
  dailyStates: DailyStageState[][];
  /** Final output per day, 1-indexed */
  dailyFinalOut: number[];
  /** Cumulative final output per day, 1-indexed */
  cumFinalOut: number[];
  totalFinalOut: number;
  workingDays: number;
}

/** 最优人力配置结果 */
export interface StaffingResult {
  recommendedPeople: Record<string, number>; // roleType → people
  feasibility: 'feasible' | 'infeasible';
  bottleneckRole: string | null;
  dailyPlan: DailyPlanEntry[];
  simulation: SimulationResult;
  totalCost: number | null;
}

export interface DailyPlanEntry {
  day: number;
  role: string;
  processed: number;
  cumProcessed: number;
  finalOut: number;
  cumFinal: number;
}

/** 最大产能结果 */
export interface CapacityResult {
  maxRawData: number;
  effectiveDelivery: number;
  bottleneckRole: string;
  utilization: Record<string, number>; // roleType → percentage
  simulation: SimulationResult;
}

/** 交付评估结果 */
export interface EvaluationResult {
  completionRate: number;
  dailyMetrics: DailyMetricEntry[];
  dailyDelivery: DailyDeliveryEntry[];
  costSummary: CostSummary | null;
  estimatedFinishDay: number;
  deliveryUniformity: number | null;
  avgDailyDelivery: number;
  overtimeContribution: number;
  simulation: SimulationResult;
}

export interface DailyMetricEntry {
  day: number;
  role: string;
  processed: number;
  backlog: number;
  capacity: number;
  utilization: number;
}

export interface DailyDeliveryEntry {
  day: number;
  finalOut: number;
  cumFinal: number;
}

export interface CostSummary {
  basicCost: number;
  overtimeCost: number;
  totalCost: number;
  unitCost: number | null; // null if cumFinal=0
}

/** 加班信息（用于引擎） */
export interface OvertimeEntry {
  roleType: RoleType;
  date: string;       // YYYY-MM-DD
  overtimeDays: number;
  dateType: string;
}

/** 分阶段人力配置（用于引擎） */
export interface StageEntry {
  roleType: RoleType;
  startDate: string;
  endDate: string;
  peopleNum: number;
}

/** 成本配置（用于引擎） */
export interface CostEntry {
  roleType: string;
  workType: string;
  dailySalary: number;
  peopleNum: number;
}

/** 加班倍率配置 */
export interface OvertimeRateEntry {
  dateType: string;
  rate: number;
}
