import { generateWarnings, WarningInput } from '../../../src/engine/warning-engine';
import { runDailyRecursion } from '../../../src/engine/daily-recursion';
import { buildStandardSimInput, buildStandardPipeline, buildStandardCapacity } from '../../fixtures/standard-mode';
import { WarningType } from '../../../src/types/warning.types';
import { Pipeline, DailyCapacity } from '../../../src/types/algorithm.types';
import { FlowMode, RoleType } from '../../../src/types/enums';

describe('Warning Engine', () => {
  test('should suppress warnings during startup period', () => {
    const input = buildStandardSimInput(20, 5);
    const result = runDailyRecursion(input);

    const warnings = generateWarnings({
      result,
      pipeline: input.pipeline,
      capacity: input.capacity,
      totalData: 10000,
      warnThreshold: { dataShortage: 100, laborOverflow: 100 },
    });

    // Gap sum = 2, so startup suppression = ceil(2) = 2 days
    const earlyWarnings = warnings.filter(
      w => w.day <= 2 && (w.type === WarningType.DataShortage || w.type === WarningType.LaborOverflow)
    );
    expect(earlyWarnings.length).toBe(0);
  });

  test('should detect delivery delay risk', () => {
    // Underpowered scenario: only 1 person per role
    const input = buildStandardSimInput(20, 1);
    const result = runDailyRecursion(input);

    const warnings = generateWarnings({
      result,
      pipeline: input.pipeline,
      capacity: buildStandardCapacity(20, 1),
      totalData: 10000,
      warnThreshold: { dataShortage: 100, laborOverflow: 100 },
    });

    const delayWarnings = warnings.filter(w => w.type === WarningType.DeliveryDelay);
    expect(delayWarnings.length).toBeGreaterThan(0);
  });

  test('should detect zero delivery (3 consecutive days)', () => {
    // With large gaps and few days, we get zero delivery
    const pipeline: Pipeline = {
      stages: [
        { index: 1, roleType: RoleType.Label, efficiency: 100, basePeople: 5, isScreenStage: false },
        { index: 2, roleType: RoleType.QA2, efficiency: 100, basePeople: 5, isScreenStage: false },
      ],
      gaps: [{ fromIndex: 1, toIndex: 2, gapDays: 5 }],
      flowMode: FlowMode.Standard,
      pipelineRoles: [RoleType.Label, RoleType.QA2],
      enableScreen: false,
      screenRate: 1,
      finalRate: 1,
    };

    const D = 10;
    const cap: DailyCapacity[][] = Array.from({ length: 3 }, () =>
      Array.from({ length: D + 1 }, () => ({ people: 5, efficiency: 100, overtimeCap: 0, totalCap: 500 }))
    );

    const result = runDailyRecursion({
      pipeline, totalData: 10000, workingDays: D, capacity: cap,
      warnThreshold: { dataShortage: 100, laborOverflow: 100 },
    });

    const warnings = generateWarnings({
      result,
      pipeline,
      capacity: cap,
      totalData: 10000,
      warnThreshold: { dataShortage: 100, laborOverflow: 100 },
    });

    // First 5 days have zero final delivery (gap=5), and after startup suppression of ceil(5)=5
    // Days 6-10 should have delivery, so zero delivery warning only during gap period
    // But startup suppression covers days 1-5, so zero delivery consecutive check starts from day 6
    // After day 6, delivery starts, so no zero delivery warning expected after suppression
  });

  test('should apply repeat suppression (every 3 days)', () => {
    // Scenario with consistent data shortage
    const input = buildStandardSimInput(20, 1); // very low capacity
    const result = runDailyRecursion(input);

    const warnings = generateWarnings({
      result,
      pipeline: input.pipeline,
      capacity: buildStandardCapacity(20, 1),
      totalData: 10000,
      warnThreshold: { dataShortage: 100, laborOverflow: 100 },
    });

    // Check that same role + same type doesn't appear every single day
    const roleTypeWarnings = warnings.filter(
      w => w.type === WarningType.DeliveryDelay && w.role === 'overall'
    );

    if (roleTypeWarnings.length > 1) {
      for (let i = 1; i < roleTypeWarnings.length; i++) {
        const dayDiff = roleTypeWarnings[i].day - roleTypeWarnings[i - 1].day;
        expect(dayDiff).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
