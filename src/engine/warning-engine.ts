import { SimulationResult, Pipeline, DailyCapacity, CostSummary } from '../types/algorithm.types';
import { Warning, WarningType, WarningSeverity } from '../types/warning.types';
import { totalGapSum } from './pipeline-builder';

export interface WarningInput {
  result: SimulationResult;
  pipeline: Pipeline;
  capacity: DailyCapacity[][];
  totalData: number;
  warnThreshold: {
    dataShortage: number;
    laborOverflow: number;
  };
  costSummary?: CostSummary | null;
  budgetCost?: number;
}

/**
 * §10.6 Warning engine.
 *
 * 5 warning types:
 * 1. Data shortage: Backlog[i][d] < Cap[i][d] × threshold
 * 2. Labor overflow: Proc[i][d] / Cap[i][d] < (1 - threshold)
 * 3. Delivery delay risk: linear extrapolation exceeds deadline
 * 4. Cost overrun: cumulative cost exceeds budget pace
 * 5. Zero delivery: 3 consecutive days with FinalOut = 0
 *
 * Suppression rules:
 * - Startup suppression: first N days where N = ceil(sum of all gaps)
 * - Repeat suppression: same stage + same type, only first day + every 3 days
 */
export function generateWarnings(input: WarningInput): Warning[] {
  const { result, pipeline, capacity, totalData, warnThreshold } = input;
  const D = result.workingDays;
  const screenRate = pipeline.enableScreen ? pipeline.screenRate : 1;
  const finalRate = pipeline.finalRate;
  const targetTotal = totalData * screenRate * finalRate;

  // Startup suppression period
  const suppressDays = Math.ceil(totalGapSum(pipeline));

  const rawWarnings: Warning[] = [];

  // Warning 1 & 2: Data shortage and labor overflow (per stage per day)
  for (const stage of pipeline.stages) {
    for (let d = 1; d <= D; d++) {
      if (d <= suppressDays) continue; // Startup suppression

      const state = result.dailyStates[stage.index][d];
      const cap = capacity[stage.index]?.[d]?.totalCap ?? 0;

      if (cap > 0) {
        // Data shortage: backlog + inflow < cap × threshold%
        const availableData = stage.index === 1
          ? state.inflow // For first stage, it's remaining data
          : state.backlog + state.inflow; // NOT the post-processing backlog

        // We need pre-processing backlog. For non-first stages:
        // preBacklog = carryBacklog + inflow = state.processed + state.backlog
        const preBacklog = state.processed + state.backlog;

        if (preBacklog < cap * (warnThreshold.dataShortage / 100)) {
          rawWarnings.push({
            type: WarningType.DataShortage,
            role: stage.roleType,
            day: d,
            currentValue: preBacklog,
            threshold: cap * (warnThreshold.dataShortage / 100),
            severity: WarningSeverity.Medium,
            message: `第${d}工作日，${stage.roleType}环节积压数据(${Math.round(preBacklog)})不足以支撑当日产能(${Math.round(cap)})`,
          });
        }

        // Labor overflow: Proc / Cap < (1 - threshold%)
        const utilization = state.processed / cap;
        if (utilization < (1 - warnThreshold.laborOverflow / 100)) {
          rawWarnings.push({
            type: WarningType.LaborOverflow,
            role: stage.roleType,
            day: d,
            currentValue: utilization * 100,
            threshold: (1 - warnThreshold.laborOverflow / 100) * 100,
            severity: WarningSeverity.Medium,
            message: `第${d}工作日，${stage.roleType}环节产能利用率(${(utilization * 100).toFixed(1)}%)较低`,
          });
        }
      }
    }
  }

  // Warning 3: Delivery delay risk
  for (let d = Math.max(suppressDays + 1, 1); d <= D; d++) {
    if (result.cumFinalOut[d] > 0 && targetTotal > 0) {
      const estimatedFinishDay = d * targetTotal / result.cumFinalOut[d];
      if (estimatedFinishDay > D) {
        rawWarnings.push({
          type: WarningType.DeliveryDelay,
          role: 'overall',
          day: d,
          currentValue: estimatedFinishDay,
          threshold: D,
          severity: WarningSeverity.High,
          message: `第${d}工作日，按当前进度预计第${Math.ceil(estimatedFinishDay)}工作日完成，超出计划周期`,
        });
      }
    }
  }

  // Warning 4: Cost overrun (only if cost data available)
  if (input.costSummary && input.budgetCost && input.budgetCost > 0) {
    const dailyCostRate = input.costSummary.totalCost / D;
    for (let d = 1; d <= D; d++) {
      const cumCost = dailyCostRate * d;
      const expectedCost = (d / D) * input.budgetCost * 1.1;
      if (cumCost > expectedCost) {
        rawWarnings.push({
          type: WarningType.CostOverrun,
          role: 'overall',
          day: d,
          currentValue: cumCost,
          threshold: expectedCost,
          severity: WarningSeverity.High,
          message: `第${d}工作日，累计成本超过预算进度10%`,
        });
      }
    }
  }

  // Warning 5: Zero delivery (3 consecutive days after startup)
  let consecutiveZero = 0;
  for (let d = 1; d <= D; d++) {
    if (d <= suppressDays) {
      consecutiveZero = 0;
      continue;
    }
    if (result.dailyFinalOut[d] === 0) {
      consecutiveZero++;
      if (consecutiveZero >= 3) {
        rawWarnings.push({
          type: WarningType.ZeroDelivery,
          role: 'overall',
          day: d,
          currentValue: 0,
          threshold: 0,
          severity: WarningSeverity.High,
          message: `第${d}工作日，连续${consecutiveZero}个工作日零交付`,
        });
      }
    } else {
      consecutiveZero = 0;
    }
  }

  // Apply repeat suppression: same role + same type, keep first + every 3 days
  return applyRepeatSuppression(rawWarnings);
}

/**
 * Apply repeat suppression: for same (role, type) combo,
 * keep first occurrence and then every 3 days.
 */
function applyRepeatSuppression(warnings: Warning[]): Warning[] {
  const lastEmitted = new Map<string, number>(); // key → last emitted day
  const result: Warning[] = [];

  // Sort by day first
  const sorted = [...warnings].sort((a, b) => a.day - b.day);

  for (const w of sorted) {
    const key = `${w.role}:${w.type}`;
    const last = lastEmitted.get(key);
    if (last === undefined || w.day - last >= 3) {
      result.push(w);
      lastEmitted.set(key, w.day);
    }
  }

  return result;
}
