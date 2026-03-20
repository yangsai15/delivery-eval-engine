import { runDailyRecursion, meetsDeliveryTarget } from '../../../src/engine/daily-recursion';
import { buildStandardSimInput, buildStandardPipeline, buildStandardCapacity } from '../../fixtures/standard-mode';
import { buildLabelQCSimInput, buildLabelQCPipeline, buildLabelQCCapacity } from '../../fixtures/label-qc-mode';
import { FlowMode, RoleType } from '../../../src/types/enums';
import { SimulationInput, Pipeline, DailyCapacity } from '../../../src/types/algorithm.types';

describe('Daily Recursion Engine', () => {
  describe('Standard mode (no screen)', () => {
    test('should process all data in standard mode with sufficient capacity', () => {
      const input = buildStandardSimInput(20, 5);
      const result = runDailyRecursion(input);

      // 10000 items, 5 people × 100 eff = 500/day capacity per stage
      // First stage finishes in 20 days (10000/500 = 20)
      // With gap=1 between stages, last items delivered on day 22 if enough days
      // But we only have 20 days, so with gaps, not all will be delivered

      expect(result.workingDays).toBe(20);
      expect(result.totalFinalOut).toBeGreaterThan(0);

      // First stage processes 500/day for 20 days = 10000 total
      let firstStageTotal = 0;
      for (let d = 1; d <= 20; d++) {
        firstStageTotal += result.dailyStates[1][d].processed;
      }
      expect(firstStageTotal).toBe(10000);
    });

    test('should respect capacity limits', () => {
      const input = buildStandardSimInput(20, 1);
      // 1 person × 100 eff = 100/day per stage
      const result = runDailyRecursion(input);

      // First day: process min(10000, 100) = 100
      expect(result.dailyStates[1][1].processed).toBe(100);
      expect(result.dailyStates[1][1].output).toBe(100);
    });

    test('should handle gap delay correctly', () => {
      const input = buildStandardSimInput(20, 5);
      const result = runDailyRecursion(input);

      // Stage 2 gets data from stage 1 with 1-day delay
      // Day 1: Stage 2 inflow = Out[1][0] = 0 (no data)
      expect(result.dailyStates[2][1].inflow).toBe(0);
      expect(result.dailyStates[2][1].processed).toBe(0);

      // Day 2: Stage 2 inflow = Out[1][1] = 500
      expect(result.dailyStates[2][2].inflow).toBe(500);
      expect(result.dailyStates[2][2].processed).toBe(500);
    });

    test('should have zero final output on day 1 due to gaps', () => {
      const input = buildStandardSimInput(20, 5);
      const result = runDailyRecursion(input);

      // Total gap = 2 days, so no final output until day 3
      expect(result.dailyFinalOut[1]).toBe(0);
      expect(result.dailyFinalOut[2]).toBe(0);
      expect(result.dailyFinalOut[3]).toBeGreaterThan(0);
    });

    test('cumulative final output should be monotonically increasing', () => {
      const input = buildStandardSimInput(20, 5);
      const result = runDailyRecursion(input);

      for (let d = 2; d <= 20; d++) {
        expect(result.cumFinalOut[d]).toBeGreaterThanOrEqual(result.cumFinalOut[d - 1]);
      }
    });
  });

  describe('Label QC mode (with screen)', () => {
    test('should apply screen rate to first stage output', () => {
      const input = buildLabelQCSimInput(10);
      const result = runDailyRecursion(input);

      // First stage: screen, 3 people × 200 = 600 cap/day
      // Day 1: process min(5000, 600) = 600, output = 600 × 0.8 = 480
      expect(result.dailyStates[1][1].processed).toBe(600);
      expect(result.dailyStates[1][1].output).toBe(480);
    });

    test('should handle screen rate reducing downstream data', () => {
      const input = buildLabelQCSimInput(10);
      const result = runDailyRecursion(input);

      // Stage 2 (label_qc) gets 480 from day 1 on day 2
      expect(result.dailyStates[2][2].inflow).toBe(480);
    });
  });

  describe('Gap=0 same-day flow', () => {
    test('should allow same-day flow when gap is 0', () => {
      const pipeline: Pipeline = {
        stages: [
          { index: 1, roleType: RoleType.Label, efficiency: 100, basePeople: 5, isScreenStage: false },
          { index: 2, roleType: RoleType.QA1, efficiency: 100, basePeople: 5, isScreenStage: false },
        ],
        gaps: [{ fromIndex: 1, toIndex: 2, gapDays: 0 }],
        flowMode: FlowMode.Standard,
        pipelineRoles: [RoleType.Label, RoleType.QA1],
        enableScreen: false,
        screenRate: 1,
        finalRate: 1,
      };

      const D = 10;
      const cap: DailyCapacity[][] = Array.from({ length: 3 }, () =>
        Array.from({ length: D + 1 }, () => ({ people: 5, efficiency: 100, overtimeCap: 0, totalCap: 500 }))
      );

      const result = runDailyRecursion({
        pipeline, totalData: 1000, workingDays: D, capacity: cap,
        warnThreshold: { dataShortage: 100, laborOverflow: 100 },
      });

      // With gap=0, stage 2 receives stage 1's output on the same day
      expect(result.dailyStates[2][1].inflow).toBe(500);
      expect(result.dailyStates[2][1].processed).toBe(500);
      expect(result.dailyFinalOut[1]).toBe(500);
    });
  });

  describe('Half-day gap', () => {
    test('should handle 0.5 day gap with interpolation', () => {
      const pipeline: Pipeline = {
        stages: [
          { index: 1, roleType: RoleType.Label, efficiency: 100, basePeople: 5, isScreenStage: false },
          { index: 2, roleType: RoleType.QA2, efficiency: 100, basePeople: 5, isScreenStage: false },
        ],
        gaps: [{ fromIndex: 1, toIndex: 2, gapDays: 0.5 }],
        flowMode: FlowMode.Standard,
        pipelineRoles: [RoleType.Label, RoleType.QA2],
        enableScreen: false,
        screenRate: 1,
        finalRate: 1,
      };

      const D = 5;
      const cap: DailyCapacity[][] = Array.from({ length: 3 }, () =>
        Array.from({ length: D + 1 }, () => ({ people: 5, efficiency: 100, overtimeCap: 0, totalCap: 500 }))
      );

      const result = runDailyRecursion({
        pipeline, totalData: 2000, workingDays: D, capacity: cap,
        warnThreshold: { dataShortage: 100, laborOverflow: 100 },
      });

      // Gap=0.5: In[2][d] = Out[1][d-1] × 0.5 + Out[1][d] × 0.5
      // Day 1: In[2][1] = Out[1][0]*0.5 + Out[1][1]*0.5 = 0 + 500*0.5 = 250
      expect(result.dailyStates[2][1].inflow).toBe(250);

      // Day 2: In[2][2] = Out[1][1]*0.5 + Out[1][2]*0.5 = 250 + 250 = 500
      expect(result.dailyStates[2][2].inflow).toBe(500);
    });

    test('should handle 1.5 day gap', () => {
      const pipeline: Pipeline = {
        stages: [
          { index: 1, roleType: RoleType.Label, efficiency: 100, basePeople: 10, isScreenStage: false },
          { index: 2, roleType: RoleType.QA2, efficiency: 100, basePeople: 10, isScreenStage: false },
        ],
        gaps: [{ fromIndex: 1, toIndex: 2, gapDays: 1.5 }],
        flowMode: FlowMode.Standard,
        pipelineRoles: [RoleType.Label, RoleType.QA2],
        enableScreen: false,
        screenRate: 1,
        finalRate: 1,
      };

      const D = 5;
      const cap: DailyCapacity[][] = Array.from({ length: 3 }, () =>
        Array.from({ length: D + 1 }, () => ({ people: 10, efficiency: 100, overtimeCap: 0, totalCap: 1000 }))
      );

      const result = runDailyRecursion({
        pipeline, totalData: 5000, workingDays: D, capacity: cap,
        warnThreshold: { dataShortage: 100, laborOverflow: 100 },
      });

      // Gap=1.5: n=1, f=0.5
      // In[2][d] = Out[1][d-2]*0.5 + Out[1][d-1]*0.5
      // Day 1: d-2=-1 (<1), d-1=0 (<1) → 0
      expect(result.dailyStates[2][1].inflow).toBe(0);
      // Day 2: d-2=0(<1)→0, d-1=1→Out[1][1]*0.5 = 1000*0.5 = 500
      expect(result.dailyStates[2][2].inflow).toBe(500);
      // Day 3: d-2=1→Out[1][1]*0.5=500, d-1=2→Out[1][2]*0.5=500 → 1000
      expect(result.dailyStates[2][3].inflow).toBe(1000);
    });
  });

  describe('meetsDeliveryTarget', () => {
    test('should return true when all data is delivered', () => {
      const input = buildStandardSimInput(30, 10);
      const result = runDailyRecursion(input);
      // With 10 people, 1000/day capacity, should finish 10000 easily in 30 days
      expect(meetsDeliveryTarget(result, 10000, 1, 1)).toBe(true);
    });

    test('should return false when capacity is insufficient', () => {
      const input = buildStandardSimInput(5, 1);
      const result = runDailyRecursion(input);
      // 1 person, 100/day, 5 days = max 500 items through first stage
      expect(meetsDeliveryTarget(result, 10000, 1, 1)).toBe(false);
    });
  });

  describe('Edge cases', () => {
    test('should handle single working day', () => {
      const input = buildStandardSimInput(1, 100);
      const result = runDailyRecursion(input);
      expect(result.workingDays).toBe(1);
      // Only first stage processes on day 1, gaps prevent downstream
      expect(result.dailyStates[1][1].processed).toBeGreaterThan(0);
      expect(result.dailyFinalOut[1]).toBe(0); // gap prevents delivery
    });

    test('should handle total_data = 1', () => {
      const pipeline = buildStandardPipeline();
      const cap = buildStandardCapacity(20, 5);
      const result = runDailyRecursion({
        pipeline, totalData: 1, workingDays: 20, capacity: cap,
        warnThreshold: { dataShortage: 100, laborOverflow: 100 },
      });
      // 1 item should flow through the pipeline
      expect(result.dailyStates[1][1].processed).toBe(1);
    });
  });
});
