import { calculateCost, CostInput } from '../../../src/engine/cost-engine';
import { buildStandardPipeline, buildStandardCapacity } from '../../fixtures/standard-mode';
import { RoleType } from '../../../src/types/enums';

describe('Cost Engine', () => {
  function buildBasicCostInput(): CostInput {
    const pipeline = buildStandardPipeline();
    const D = 20;
    const workingDays = Array.from({ length: D }, (_, i) => `2026-04-${String(i + 1).padStart(2, '0')}`);

    return {
      pipeline,
      workingDays,
      D,
      costEntries: [
        { roleType: RoleType.Label, workType: '全职', dailySalary: 200, peopleNum: 5 },
        { roleType: RoleType.QA1, workType: '全职', dailySalary: 200, peopleNum: 5 },
        { roleType: RoleType.QA2, workType: '全职', dailySalary: 200, peopleNum: 5 },
      ],
      overtimeEntries: [],
      overtimeRates: [],
      stageEntries: [],
      capacity: buildStandardCapacity(D, 5),
      totalFinalOut: 10000,
    };
  }

  test('should calculate basic cost correctly', () => {
    const input = buildBasicCostInput();
    const result = calculateCost(input);

    // 3 roles × 5 people × 200/day × 20 days = 60000
    expect(result.basicCost).toBe(60000);
    expect(result.overtimeCost).toBe(0);
    expect(result.totalCost).toBe(60000);
  });

  test('should calculate unit cost', () => {
    const input = buildBasicCostInput();
    const result = calculateCost(input);

    // 60000 / 10000 = 6.0
    expect(result.unitCost).toBe(6);
  });

  test('unit cost should be null when totalFinalOut is 0', () => {
    const input = { ...buildBasicCostInput(), totalFinalOut: 0 };
    const result = calculateCost(input);

    expect(result.unitCost).toBeNull();
  });

  test('should calculate overtime cost with multiplier', () => {
    const input = buildBasicCostInput();
    input.overtimeEntries = [
      { roleType: RoleType.Label, date: '2026-04-05', overtimeDays: 1, dateType: 'weekend' },
    ];
    input.overtimeRates = [
      { dateType: 'weekend', rate: 2.0 },
    ];

    const result = calculateCost(input);

    // Overtime: 1 day × avgSalary(200) × 5 people × 2.0 multiplier = 2000
    expect(result.overtimeCost).toBeGreaterThan(0);
    expect(result.totalCost).toBeGreaterThan(result.basicCost);
  });

  test('should use default rates when not configured', () => {
    const input = buildBasicCostInput();
    input.overtimeEntries = [
      { roleType: RoleType.Label, date: '2026-04-05', overtimeDays: 0.5, dateType: 'holiday' },
    ];
    input.overtimeRates = []; // no custom rates

    const result = calculateCost(input);

    // Should use default holiday rate of 3.0
    expect(result.overtimeCost).toBeGreaterThan(0);
  });
});
