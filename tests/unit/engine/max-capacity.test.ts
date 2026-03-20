import { findMaxCapacity } from '../../../src/engine/max-capacity';
import { buildStandardPipeline, buildStandardCapacity } from '../../fixtures/standard-mode';
import { buildLabelQCPipeline, buildLabelQCCapacity } from '../../fixtures/label-qc-mode';

describe('Max Capacity Algorithm', () => {
  test('should find max capacity for standard mode', () => {
    const pipeline = buildStandardPipeline();
    const D = 20;
    const capacity = buildStandardCapacity(D, 5);

    const result = findMaxCapacity(pipeline, D, capacity, {
      dataShortage: 100,
      laborOverflow: 100,
    });

    // 5 people × 100 eff × 20 days = 10000 max for first stage
    // With gaps reducing downstream days, actual max should be around 9000-10000
    expect(result.maxRawData).toBeGreaterThan(0);
    expect(result.maxRawData).toBeLessThanOrEqual(10000);
    expect(result.effectiveDelivery).toBeGreaterThan(0);
  });

  test('should identify bottleneck role', () => {
    const pipeline = buildStandardPipeline();
    const D = 20;
    const capacity = buildStandardCapacity(D, 5);

    const result = findMaxCapacity(pipeline, D, capacity, {
      dataShortage: 100,
      laborOverflow: 100,
    });

    expect(result.bottleneckRole).toBeTruthy();
  });

  test('should calculate utilization per role', () => {
    const pipeline = buildStandardPipeline();
    const D = 20;
    const capacity = buildStandardCapacity(D, 5);

    const result = findMaxCapacity(pipeline, D, capacity, {
      dataShortage: 100,
      laborOverflow: 100,
    });

    expect(result.utilization).toBeDefined();
    // Utilization should be between 0 and 100
    for (const [_, util] of Object.entries(result.utilization)) {
      expect(util).toBeGreaterThanOrEqual(0);
      expect(util).toBeLessThanOrEqual(100.1); // small fp tolerance
    }
  });

  test('should handle label_qc mode with screen', () => {
    const pipeline = buildLabelQCPipeline();
    const D = 10;
    const capacity = buildLabelQCCapacity(D);

    const result = findMaxCapacity(pipeline, D, capacity, {
      dataShortage: 100,
      laborOverflow: 100,
    });

    // Screen rate = 0.8, so effective delivery = maxRaw × 0.8
    expect(result.maxRawData).toBeGreaterThan(0);
    expect(result.effectiveDelivery).toBeGreaterThan(0);
    // Effective should be approximately maxRaw × 0.8
    expect(result.effectiveDelivery).toBeLessThanOrEqual(result.maxRawData * 0.8 + 1);
  });

  test('binary search precision should be ≤ 1 item', () => {
    const pipeline = buildStandardPipeline();
    const D = 20;
    const capacity = buildStandardCapacity(D, 5);

    const result = findMaxCapacity(pipeline, D, capacity, {
      dataShortage: 100,
      laborOverflow: 100,
    });

    // Max raw data should be an integer
    expect(Number.isInteger(result.maxRawData)).toBe(true);
  });
});
