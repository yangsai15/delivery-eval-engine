import { findOptimalStaffing } from '../../../src/engine/optimal-staffing';
import { buildStandardPipeline, buildStandardCapacity } from '../../fixtures/standard-mode';
import { buildLabelQCPipeline, buildLabelQCCapacity } from '../../fixtures/label-qc-mode';
import { RoleType } from '../../../src/types/enums';

describe('Optimal Staffing Algorithm', () => {
  test('should find optimal staffing for standard mode', () => {
    const pipeline = buildStandardPipeline();
    const D = 20;
    const baseCapacity = buildStandardCapacity(D, 1); // base 1 person

    const result = findOptimalStaffing(pipeline, 10000, D, baseCapacity);

    expect(result.feasibility).toBe('feasible');
    expect(result.recommendedPeople[RoleType.Label]).toBeGreaterThanOrEqual(5);
    expect(result.recommendedPeople[RoleType.QA1]).toBeGreaterThanOrEqual(5);
    expect(result.recommendedPeople[RoleType.QA2]).toBeGreaterThanOrEqual(5);
  });

  test('recommended people should deliver 100% within deadline', () => {
    const pipeline = buildStandardPipeline();
    const D = 20;
    const baseCapacity = buildStandardCapacity(D, 1);

    const result = findOptimalStaffing(pipeline, 10000, D, baseCapacity);

    if (result.feasibility === 'feasible') {
      // Verify simulation confirms delivery
      const target = 10000; // screenRate=1, finalRate=1
      expect(result.simulation.totalFinalOut).toBeGreaterThanOrEqual(target - 1);
    }
  });

  test('should identify bottleneck role', () => {
    const pipeline = buildStandardPipeline();
    const D = 20;
    const baseCapacity = buildStandardCapacity(D, 1);

    const result = findOptimalStaffing(pipeline, 10000, D, baseCapacity);
    if (result.feasibility === 'feasible') {
      expect(result.bottleneckRole).toBeTruthy();
    }
  });

  test('should generate daily plan', () => {
    const pipeline = buildStandardPipeline();
    const D = 20;
    const baseCapacity = buildStandardCapacity(D, 1);

    const result = findOptimalStaffing(pipeline, 10000, D, baseCapacity);

    expect(result.dailyPlan.length).toBeGreaterThan(0);
    // Plan entries should cover all days and roles
    const days = new Set(result.dailyPlan.map(e => e.day));
    expect(days.size).toBe(D);
  });

  test('should handle label_qc mode with screen', () => {
    const pipeline = buildLabelQCPipeline();
    const D = 10;
    const baseCapacity = buildLabelQCCapacity(D);

    const result = findOptimalStaffing(pipeline, 5000, D, baseCapacity);
    expect(result.feasibility).toBe('feasible');
    expect(result.recommendedPeople[RoleType.Screen]).toBeGreaterThanOrEqual(1);
    expect(result.recommendedPeople[RoleType.LabelQC]).toBeGreaterThanOrEqual(1);
    expect(result.recommendedPeople[RoleType.QA2]).toBeGreaterThanOrEqual(1);
  });

  test('should handle infeasible case when gaps >= D', () => {
    const pipeline = {
      ...buildStandardPipeline(),
      gaps: [
        { fromIndex: 1, toIndex: 2, gapDays: 10 },
        { fromIndex: 2, toIndex: 3, gapDays: 10 },
      ],
    };
    const D = 5; // gaps sum to 20, way more than D=5
    const baseCapacity = buildStandardCapacity(D, 1);

    const result = findOptimalStaffing(pipeline, 10000, D, baseCapacity);
    expect(result.feasibility).toBe('infeasible');
  });
});
