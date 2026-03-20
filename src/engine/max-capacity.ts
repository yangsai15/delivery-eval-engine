import { Pipeline, SimulationInput, SimulationResult, CapacityResult, DailyCapacity } from '../types/algorithm.types';
import { runDailyRecursion } from './daily-recursion';

/**
 * §10.4 Maximum Capacity Algorithm.
 *
 * Binary search for the maximum N_raw that can be fully delivered
 * within D working days given the current staffing configuration.
 *
 * Search bounds:
 * - Lower = 1
 * - Upper = Σ Cap[firstStage][d] / R_s (first stage total capacity / screen rate)
 *
 * Precision: ≤ 1 data item (binary search terminates when upper - lower ≤ 1)
 */
export function findMaxCapacity(
  pipeline: Pipeline,
  D: number,
  capacity: DailyCapacity[][],
  warnThreshold: { dataShortage: number; laborOverflow: number },
): CapacityResult {
  const screenRate = pipeline.enableScreen ? pipeline.screenRate : 1;
  const finalRate = pipeline.finalRate;

  // Calculate upper bound: sum of first stage capacity / R_s
  let firstStageTotalCap = 0;
  for (let d = 1; d <= D; d++) {
    firstStageTotalCap += capacity[1]?.[d]?.totalCap ?? 0;
  }
  let upper = Math.ceil(firstStageTotalCap / screenRate);
  let lower = 1;

  // Edge case: if upper is 0 or 1, just test it
  if (upper <= 1) upper = 1;

  let bestResult: SimulationResult | null = null;
  let bestNRaw = 0;

  // Binary search
  while (upper - lower > 1) {
    const mid = Math.floor((upper + lower) / 2);
    const result = runSimulation(pipeline, mid, D, capacity, warnThreshold);
    const target = mid * screenRate * finalRate;

    if (result.totalFinalOut >= target - 0.001) {
      lower = mid;
      bestNRaw = mid;
      bestResult = result;
    } else {
      upper = mid;
    }
  }

  // Test the final lower bound
  if (!bestResult || bestNRaw !== lower) {
    bestResult = runSimulation(pipeline, lower, D, capacity, warnThreshold);
    bestNRaw = lower;
  }

  // Also test upper in case it works
  const upperResult = runSimulation(pipeline, upper, D, capacity, warnThreshold);
  const upperTarget = upper * screenRate * finalRate;
  if (upperResult.totalFinalOut >= upperTarget - 0.001) {
    bestNRaw = upper;
    bestResult = upperResult;
  }

  // Calculate utilization per stage
  const utilization: Record<string, number> = {};
  let maxUtil = -1;
  let bottleneckRole = pipeline.stages[0]?.roleType ?? '';

  for (const stage of pipeline.stages) {
    let totalProc = 0;
    let totalCap = 0;
    for (let d = 1; d <= D; d++) {
      totalProc += bestResult.dailyStates[stage.index][d].processed;
      totalCap += capacity[stage.index][d].totalCap;
    }
    const util = totalCap > 0 ? (totalProc / totalCap) * 100 : 0;
    utilization[stage.roleType] = util;
    if (util > maxUtil) {
      maxUtil = util;
      bottleneckRole = stage.roleType;
    }
  }

  return {
    maxRawData: bestNRaw,
    effectiveDelivery: bestResult.totalFinalOut,
    bottleneckRole,
    utilization,
    simulation: bestResult,
  };
}

function runSimulation(
  pipeline: Pipeline,
  nRaw: number,
  D: number,
  capacity: DailyCapacity[][],
  warnThreshold: { dataShortage: number; laborOverflow: number },
): SimulationResult {
  const input: SimulationInput = {
    pipeline,
    totalData: nRaw,
    workingDays: D,
    capacity,
    warnThreshold,
  };
  return runDailyRecursion(input);
}
