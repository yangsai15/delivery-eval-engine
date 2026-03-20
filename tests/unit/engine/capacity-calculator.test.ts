import { buildCapacityMatrix } from '../../../src/engine/capacity-calculator';
import { buildStandardPipeline } from '../../fixtures/standard-mode';
import { RoleType } from '../../../src/types/enums';

describe('Capacity Calculator', () => {
  const pipeline = buildStandardPipeline();
  const workingDays = ['2026-04-06', '2026-04-07', '2026-04-08', '2026-04-09', '2026-04-10'];

  test('should build basic capacity matrix', () => {
    const matrix = buildCapacityMatrix(pipeline, workingDays, [], []);

    // 3 stages + index 0 unused, 5 days + index 0 unused
    expect(matrix.length).toBe(4);
    expect(matrix[1].length).toBe(6);

    // Stage 1 (label): 5 people × 100 eff = 500
    expect(matrix[1][1].totalCap).toBe(500);
    expect(matrix[1][1].people).toBe(5);
    expect(matrix[1][1].efficiency).toBe(100);
  });

  test('should apply overtime capacity', () => {
    const overtimeEntries = [{
      roleType: RoleType.Label,
      date: '2026-04-07',
      overtimeDays: 0.5,
      dateType: 'workday',
    }];

    const matrix = buildCapacityMatrix(pipeline, workingDays, [], overtimeEntries);

    // Day 2 (Apr 7): normal 500 + overtime 0.5 * 5 * 100 = 250 → total 750
    expect(matrix[1][2].overtimeCap).toBe(250);
    expect(matrix[1][2].totalCap).toBe(750);
  });

  test('should apply staged people configuration', () => {
    const stageEntries = [
      { roleType: RoleType.Label, startDate: '2026-04-06', endDate: '2026-04-08', peopleNum: 3 },
      { roleType: RoleType.Label, startDate: '2026-04-09', endDate: '2026-04-10', peopleNum: 8 },
    ];

    const matrix = buildCapacityMatrix(pipeline, workingDays, stageEntries, []);

    // Days 1-3: 3 people × 100 = 300
    expect(matrix[1][1].totalCap).toBe(300);
    expect(matrix[1][3].totalCap).toBe(300);
    // Days 4-5: 8 people × 100 = 800
    expect(matrix[1][4].totalCap).toBe(800);
  });

  test('should use override people when provided', () => {
    const overrides = new Map<RoleType, number>();
    overrides.set(RoleType.Label, 10);

    const matrix = buildCapacityMatrix(pipeline, workingDays, [], [], overrides);

    expect(matrix[1][1].people).toBe(10);
    expect(matrix[1][1].totalCap).toBe(1000);
  });
});
