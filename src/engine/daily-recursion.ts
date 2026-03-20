import { SimulationInput, SimulationResult, DailyStageState } from '../types/algorithm.types';

/**
 * Core daily recursion algorithm (§10.2).
 *
 * Simulates the day-by-day data flow through the pipeline.
 * Processing order: within each simulated day, stages are processed
 * in pipeline order (stage 1 → stage N) to ensure Gap=0 same-day flow.
 *
 * @param input Simulation parameters
 * @returns Full simulation result with daily states for all stages
 */
export function runDailyRecursion(input: SimulationInput): SimulationResult {
  const { pipeline, totalData, workingDays: D, capacity } = input;
  const stageCount = pipeline.stages.length;

  // Initialize daily state arrays (1-indexed for both stage and day)
  // dailyStates[stageIndex][dayIndex]
  const dailyStates: DailyStageState[][] = Array.from({ length: stageCount + 1 }, () =>
    Array.from({ length: D + 1 }, () => ({
      inflow: 0,
      backlog: 0,
      capacity: 0,
      processed: 0,
      output: 0,
    }))
  );

  // Track cumulative processing for first stage
  let cumFirstStageProc = 0;

  // Persistent backlogs (carried across days, 1-indexed by stage)
  const carryBacklog = new Float64Array(stageCount + 1);

  // Final output per day (1-indexed)
  const dailyFinalOut = new Float64Array(D + 1);
  const cumFinalOut = new Float64Array(D + 1);

  const firstStageIndex = 1;
  const lastStageIndex = stageCount;
  const screenRate = pipeline.screenRate;
  const finalRate = pipeline.finalRate;
  const isFirstStageScreen = pipeline.stages[0]?.isScreenStage ?? false;

  for (let d = 1; d <= D; d++) {
    // Process each stage in pipeline order
    for (let sIdx = 1; sIdx <= stageCount; sIdx++) {
      const cap = capacity[sIdx]?.[d]?.totalCap ?? 0;
      const state = dailyStates[sIdx][d];
      state.capacity = cap;

      if (sIdx === firstStageIndex) {
        // --- First stage: consume from total data pool ---
        const remaining = totalData - cumFirstStageProc;
        const proc = Math.min(remaining, cap);
        state.inflow = remaining; // conceptually, the remaining pool
        state.processed = proc;

        // First stage output: apply screen rate if this is screen stage
        let out = proc;
        if (isFirstStageScreen) {
          out = proc * screenRate;
        }
        state.output = out;
        state.backlog = remaining - proc;

        cumFirstStageProc += proc;
      } else {
        // --- Non-first stage: calculate inflow from upstream ---
        const upstreamIndex = sIdx - 1;
        const gapInfo = pipeline.gaps.find(g => g.fromIndex === upstreamIndex && g.toIndex === sIdx);
        const gapDays = gapInfo?.gapDays ?? 0;

        let inflow = 0;

        if (gapDays === Math.floor(gapDays)) {
          // Integer gap: In[i][d] = Out[i-1][d - gap]
          const n = gapDays;
          const srcDay = d - n;
          if (srcDay >= 1) {
            inflow = dailyStates[upstreamIndex][srcDay].output;
          }
        } else {
          // Half-day gap: In[i][d] = Out[i-1][d-n-1] × f + Out[i-1][d-n] × (1-f)
          const n = Math.floor(gapDays);
          const f = gapDays - n; // 0.5

          const day1 = d - n - 1;
          const day2 = d - n;

          const out1 = (day1 >= 1) ? dailyStates[upstreamIndex][day1].output : 0;
          const out2 = (day2 >= 1) ? dailyStates[upstreamIndex][day2].output : 0;

          inflow = out1 * f + out2 * (1 - f);
        }

        state.inflow = inflow;

        // Backlog accumulation
        const totalBacklog = carryBacklog[sIdx] + inflow;

        // Process: min(backlog, capacity)
        const proc = Math.min(totalBacklog, cap);
        state.processed = proc;

        // Output: intermediate stages have no efficiency loss
        // Last stage (qa2) applies R_final
        let out = proc;
        if (sIdx === lastStageIndex) {
          out = proc * finalRate;
        }
        state.output = out;

        // Update carry backlog
        carryBacklog[sIdx] = totalBacklog - proc;
        state.backlog = carryBacklog[sIdx];
      }
    }

    // Daily final output is the last stage's output
    dailyFinalOut[d] = dailyStates[lastStageIndex][d].output;
    cumFinalOut[d] = (d > 1 ? cumFinalOut[d - 1] : 0) + dailyFinalOut[d];
  }

  return {
    dailyStates,
    dailyFinalOut: Array.from(dailyFinalOut),
    cumFinalOut: Array.from(cumFinalOut),
    totalFinalOut: cumFinalOut[D],
    workingDays: D,
  };
}

/**
 * Check if the simulation result meets the delivery target.
 * Target = N_raw × R_screen × R_final (if screen enabled, else N_raw × R_final)
 */
export function meetsDeliveryTarget(
  result: SimulationResult,
  totalData: number,
  screenRate: number,
  finalRate: number,
): boolean {
  const target = totalData * screenRate * finalRate;
  // Use small epsilon for floating point comparison
  return result.totalFinalOut >= target - 0.001;
}
