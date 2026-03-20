import { calculateDeliveryMetrics } from '../../../src/engine/delivery-metrics';
import { runDailyRecursion } from '../../../src/engine/daily-recursion';
import { buildStandardSimInput, buildStandardPipeline, buildStandardCapacity } from '../../fixtures/standard-mode';

describe('Delivery Metrics', () => {
  test('should calculate completion rate', () => {
    const input = buildStandardSimInput(20, 10);
    const result = runDailyRecursion(input);
    const metrics = calculateDeliveryMetrics(result, input.pipeline, input.capacity, 10000);

    expect(metrics.completionRate).toBeGreaterThan(0);
    expect(metrics.completionRate).toBeLessThanOrEqual(100);
  });

  test('should calculate avg daily delivery', () => {
    const input = buildStandardSimInput(20, 10);
    const result = runDailyRecursion(input);
    const metrics = calculateDeliveryMetrics(result, input.pipeline, input.capacity, 10000);

    expect(metrics.avgDailyDelivery).toBeGreaterThan(0);
    expect(metrics.avgDailyDelivery).toBe(result.totalFinalOut / 20);
  });

  test('should calculate delivery uniformity', () => {
    const input = buildStandardSimInput(20, 10);
    const result = runDailyRecursion(input);
    const metrics = calculateDeliveryMetrics(result, input.pipeline, input.capacity, 10000);

    // Should be a number (coefficient of variation)
    expect(metrics.deliveryUniformity).not.toBeNull();
    expect(metrics.deliveryUniformity).toBeGreaterThanOrEqual(0);
  });

  test('should calculate estimated finish day', () => {
    const input = buildStandardSimInput(20, 10);
    const result = runDailyRecursion(input);
    const metrics = calculateDeliveryMetrics(result, input.pipeline, input.capacity, 10000);

    expect(metrics.estimatedFinishDay).toBeGreaterThan(0);
  });

  test('should generate daily metrics for all stages', () => {
    const input = buildStandardSimInput(20, 10);
    const result = runDailyRecursion(input);
    const metrics = calculateDeliveryMetrics(result, input.pipeline, input.capacity, 10000);

    expect(metrics.dailyMetrics.length).toBe(20 * 3); // 20 days × 3 stages
    expect(metrics.dailyDelivery.length).toBe(20);
  });

  test('should calculate overtime contribution', () => {
    const input = buildStandardSimInput(20, 10);
    const result = runDailyRecursion(input);
    const metrics = calculateDeliveryMetrics(result, input.pipeline, input.capacity, 10000);

    // No overtime configured → 0%
    expect(metrics.overtimeContribution).toBe(0);
  });

  test('costSummary should be null by default', () => {
    const input = buildStandardSimInput(20, 10);
    const result = runDailyRecursion(input);
    const metrics = calculateDeliveryMetrics(result, input.pipeline, input.capacity, 10000);

    expect(metrics.costSummary).toBeNull();
  });
});
