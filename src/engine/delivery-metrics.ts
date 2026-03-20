import { SimulationResult, Pipeline, DailyCapacity, EvaluationResult, DailyMetricEntry, DailyDeliveryEntry } from '../types/algorithm.types';

/**
 * §10.5 Delivery evaluation metrics calculation.
 *
 * Computes:
 * - Completion rate
 * - Capacity utilization per stage
 * - Average daily delivery
 * - Delivery uniformity (coefficient of variation)
 * - Estimated finish day
 * - Overtime contribution ratio
 */
export function calculateDeliveryMetrics(
  result: SimulationResult,
  pipeline: Pipeline,
  capacity: DailyCapacity[][],
  totalData: number,
): EvaluationResult {
  const D = result.workingDays;
  const screenRate = pipeline.enableScreen ? pipeline.screenRate : 1;
  const finalRate = pipeline.finalRate;
  const targetTotal = totalData * screenRate * finalRate;

  // Completion rate
  const completionRate = targetTotal > 0
    ? (result.totalFinalOut / targetTotal) * 100
    : 0;

  // Daily metrics per stage
  const dailyMetrics: DailyMetricEntry[] = [];
  for (let d = 1; d <= D; d++) {
    for (const stage of pipeline.stages) {
      const state = result.dailyStates[stage.index][d];
      const cap = capacity[stage.index][d].totalCap;
      dailyMetrics.push({
        day: d,
        role: stage.roleType,
        processed: state.processed,
        backlog: state.backlog,
        capacity: cap,
        utilization: cap > 0 ? (state.processed / cap) * 100 : 0,
      });
    }
  }

  // Daily delivery
  const dailyDelivery: DailyDeliveryEntry[] = [];
  for (let d = 1; d <= D; d++) {
    dailyDelivery.push({
      day: d,
      finalOut: result.dailyFinalOut[d],
      cumFinal: result.cumFinalOut[d],
    });
  }

  // Average daily delivery
  const avgDailyDelivery = D > 0 ? result.totalFinalOut / D : 0;

  // Delivery uniformity (coefficient of variation)
  let deliveryUniformity: number | null = null;
  if (D > 0) {
    const finalOuts: number[] = [];
    for (let d = 1; d <= D; d++) {
      finalOuts.push(result.dailyFinalOut[d]);
    }
    const mean = finalOuts.reduce((a, b) => a + b, 0) / D;
    if (mean > 0) {
      const variance = finalOuts.reduce((sum, v) => sum + (v - mean) ** 2, 0) / D;
      const std = Math.sqrt(variance);
      deliveryUniformity = std / mean;
    }
  }

  // Estimated finish day (linear extrapolation)
  let estimatedFinishDay = D;
  if (targetTotal > 0) {
    // Find last day with positive cumulative output
    for (let d = D; d >= 1; d--) {
      if (result.cumFinalOut[d] > 0) {
        estimatedFinishDay = Math.ceil(d * targetTotal / result.cumFinalOut[d]);
        break;
      }
    }
  }

  // Overtime contribution
  let totalOvertimeCap = 0;
  let totalCapSum = 0;
  for (const stage of pipeline.stages) {
    for (let d = 1; d <= D; d++) {
      totalOvertimeCap += capacity[stage.index][d].overtimeCap;
      totalCapSum += capacity[stage.index][d].totalCap;
    }
  }
  const overtimeContribution = totalCapSum > 0
    ? (totalOvertimeCap / totalCapSum) * 100
    : 0;

  return {
    completionRate,
    dailyMetrics,
    dailyDelivery,
    costSummary: null, // Filled in by cost engine
    estimatedFinishDay,
    deliveryUniformity,
    avgDailyDelivery,
    overtimeContribution,
    simulation: result,
  };
}
