import { Pipeline, SimulationInput, SimulationResult, StaffingResult, DailyPlanEntry, DailyCapacity } from '../types/algorithm.types';
import { RoleType } from '../types/enums';
import { runDailyRecursion, meetsDeliveryTarget } from './daily-recursion';
import { getAvailableDays } from './pipeline-builder';

const MAX_ITERATIONS = 100;

/**
 * §10.3 Optimal Staffing Algorithm.
 *
 * Find the minimum number of people per role that can complete all data
 * delivery within D working days.
 *
 * Steps:
 * 1. Calculate total data volume per stage
 * 2. Calculate available days per stage (accounting for gap delays)
 * 3. Estimate minimum people per stage
 * 4. Run simulation to validate
 * 5. If delivery target not met, find bottleneck and add 1 person, repeat
 */
export function findOptimalStaffing(
  pipeline: Pipeline,
  totalData: number,
  D: number,
  baseCapacity: DailyCapacity[][],
): StaffingResult {
  const screenRate = pipeline.enableScreen ? pipeline.screenRate : 1;
  const finalRate = pipeline.finalRate;

  // Step 1: Calculate total data per stage
  const totalPerStage = new Map<number, number>();
  for (const stage of pipeline.stages) {
    let total: number;
    if (stage.index === 1) {
      total = totalData;
    } else if (stage.isScreenStage) {
      total = totalData;
    } else {
      // Downstream of screen gets screenRate applied
      const prevStage = pipeline.stages.find(s => s.index === stage.index - 1);
      if (prevStage?.isScreenStage) {
        total = totalData * screenRate;
      } else {
        total = totalPerStage.get(stage.index - 1) ?? totalData;
      }
    }
    totalPerStage.set(stage.index, total);
  }

  // Step 2: Available days per stage
  const availDays = getAvailableDays(pipeline, D);

  // Step 3: Initial estimate of minimum people
  const peopleCounts = new Map<RoleType, number>();
  for (const stage of pipeline.stages) {
    const avail = availDays.get(stage.index) ?? D;
    if (avail <= 0) {
      // Infeasible: gaps exceed project duration
      return {
        recommendedPeople: Object.fromEntries(pipeline.stages.map(s => [s.roleType, 0])),
        feasibility: 'infeasible',
        bottleneckRole: null,
        dailyPlan: [],
        simulation: emptySimResult(D, pipeline.stages.length),
        totalCost: null,
      };
    }
    const totalForStage = totalPerStage.get(stage.index) ?? totalData;
    const minDailyCap = Math.ceil(totalForStage / avail);
    const minPeople = Math.ceil(minDailyCap / stage.efficiency);
    peopleCounts.set(stage.roleType, Math.max(1, minPeople));
  }

  // Step 4 & 5: Iterative validation
  let lastResult: SimulationResult | null = null;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    // Build capacity with current people counts
    const cap = buildOverrideCapacity(pipeline, D, baseCapacity, peopleCounts);

    const simInput: SimulationInput = {
      pipeline,
      totalData,
      workingDays: D,
      capacity: cap,
      warnThreshold: { dataShortage: 100, laborOverflow: 100 },
    };

    lastResult = runDailyRecursion(simInput);

    if (meetsDeliveryTarget(lastResult, totalData, screenRate, finalRate)) {
      // Success - build daily plan and return
      const dailyPlan = buildDailyPlan(lastResult, pipeline);
      const bottleneck = findBottleneck(lastResult, pipeline, cap, D);

      return {
        recommendedPeople: Object.fromEntries(peopleCounts),
        feasibility: 'feasible',
        bottleneckRole: bottleneck,
        dailyPlan,
        simulation: lastResult,
        totalCost: null, // Cost calculated separately
      };
    }

    // Find bottleneck and increase its people by 1
    const bottleneckIdx = findBottleneckIndex(lastResult, pipeline, cap, D);
    const bottleneckStage = pipeline.stages.find(s => s.index === bottleneckIdx);
    if (bottleneckStage) {
      const current = peopleCounts.get(bottleneckStage.roleType) ?? 1;
      peopleCounts.set(bottleneckStage.roleType, current + 1);
    } else {
      // Fallback: increase all by 1
      for (const stage of pipeline.stages) {
        const current = peopleCounts.get(stage.roleType) ?? 1;
        peopleCounts.set(stage.roleType, current + 1);
      }
    }
  }

  // Max iterations reached - return best effort
  const dailyPlan = lastResult ? buildDailyPlan(lastResult, pipeline) : [];
  return {
    recommendedPeople: Object.fromEntries(peopleCounts),
    feasibility: 'infeasible',
    bottleneckRole: null,
    dailyPlan,
    simulation: lastResult ?? emptySimResult(D, pipeline.stages.length),
    totalCost: null,
  };
}

/**
 * Build capacity matrix with overridden people counts.
 */
function buildOverrideCapacity(
  pipeline: Pipeline,
  D: number,
  baseCapacity: DailyCapacity[][],
  peopleCounts: Map<RoleType, number>,
): DailyCapacity[][] {
  const stageCount = pipeline.stages.length;
  const cap: DailyCapacity[][] = Array.from({ length: stageCount + 1 }, () =>
    Array.from({ length: D + 1 }, () => ({
      people: 0,
      efficiency: 0,
      overtimeCap: 0,
      totalCap: 0,
    }))
  );

  for (const stage of pipeline.stages) {
    const people = peopleCounts.get(stage.roleType) ?? stage.basePeople;
    const eff = stage.efficiency;

    for (let d = 1; d <= D; d++) {
      const base = baseCapacity[stage.index]?.[d];
      // Keep overtime proportional to people
      const basePeople = base?.people ?? stage.basePeople;
      const overtimeRatio = basePeople > 0 ? people / basePeople : 1;
      const overtimeCap = (base?.overtimeCap ?? 0) * overtimeRatio;

      cap[stage.index][d] = {
        people,
        efficiency: eff,
        overtimeCap,
        totalCap: people * eff + overtimeCap,
      };
    }
  }

  return cap;
}

/**
 * Find the bottleneck stage index (highest utilization).
 */
function findBottleneckIndex(
  result: SimulationResult,
  pipeline: Pipeline,
  cap: DailyCapacity[][],
  D: number,
): number {
  let maxUtil = -1;
  let bottleneckIdx = 1;

  for (const stage of pipeline.stages) {
    let totalProc = 0;
    let totalCap = 0;
    for (let d = 1; d <= D; d++) {
      totalProc += result.dailyStates[stage.index][d].processed;
      totalCap += cap[stage.index][d].totalCap;
    }
    const util = totalCap > 0 ? totalProc / totalCap : 0;
    if (util > maxUtil) {
      maxUtil = util;
      bottleneckIdx = stage.index;
    }
  }

  return bottleneckIdx;
}

function findBottleneck(
  result: SimulationResult,
  pipeline: Pipeline,
  cap: DailyCapacity[][],
  D: number,
): string | null {
  const idx = findBottleneckIndex(result, pipeline, cap, D);
  return pipeline.stages.find(s => s.index === idx)?.roleType ?? null;
}

function buildDailyPlan(result: SimulationResult, pipeline: Pipeline): DailyPlanEntry[] {
  const plan: DailyPlanEntry[] = [];
  const D = result.workingDays;
  const lastIdx = pipeline.stages.length;

  for (let d = 1; d <= D; d++) {
    const cumProcs = new Map<number, number>();
    for (const stage of pipeline.stages) {
      let cumProc = 0;
      for (let k = 1; k <= d; k++) {
        cumProc += result.dailyStates[stage.index][k].processed;
      }
      cumProcs.set(stage.index, cumProc);
    }

    for (const stage of pipeline.stages) {
      plan.push({
        day: d,
        role: stage.roleType,
        processed: result.dailyStates[stage.index][d].processed,
        cumProcessed: cumProcs.get(stage.index) ?? 0,
        finalOut: stage.index === lastIdx ? result.dailyFinalOut[d] : 0,
        cumFinal: stage.index === lastIdx ? result.cumFinalOut[d] : 0,
      });
    }
  }

  return plan;
}

function emptySimResult(D: number, stageCount: number): SimulationResult {
  return {
    dailyStates: Array.from({ length: stageCount + 1 }, () =>
      Array.from({ length: D + 1 }, () => ({
        inflow: 0, backlog: 0, capacity: 0, processed: 0, output: 0,
      }))
    ),
    dailyFinalOut: new Array(D + 1).fill(0),
    cumFinalOut: new Array(D + 1).fill(0),
    totalFinalOut: 0,
    workingDays: D,
  };
}
