import { buildPipeline, totalGapSum, getAvailableDays } from '../../../src/engine/pipeline-builder';
import { FlowMode, RoleType } from '../../../src/types/enums';
import { RoleConfig, FlowConfig } from '../../../src/types/project.types';

function makeRole(role_type: RoleType, eff = 100, people = 5): RoleConfig {
  return {
    role_id: `r-${role_type}`, project_id: 'p1', role_type,
    daily_efficiency: eff, base_people: people, enable_stage: false,
    create_time: '', update_time: '',
  };
}

function makeFlow(node: string, days: number): FlowConfig {
  return {
    flow_id: `f-${node}`, project_id: 'p1', flow_node: node,
    interval_days: days, create_time: '', update_time: '',
  };
}

describe('Pipeline Builder', () => {
  test('should build standard pipeline without screen', () => {
    const roles = [makeRole(RoleType.Label), makeRole(RoleType.QA1), makeRole(RoleType.QA2)];
    const flows = [makeFlow('label→qa1', 1), makeFlow('qa1→qa2', 1)];
    const pipeline = buildPipeline(FlowMode.Standard, false, 80, 100, roles, flows);

    expect(pipeline.stages.length).toBe(3);
    expect(pipeline.stages[0].roleType).toBe(RoleType.Label);
    expect(pipeline.stages[1].roleType).toBe(RoleType.QA1);
    expect(pipeline.stages[2].roleType).toBe(RoleType.QA2);
    expect(pipeline.gaps.length).toBe(2);
    expect(pipeline.screenRate).toBe(0.8); // screenEfficiency param is always passed
    expect(pipeline.finalRate).toBe(1);
  });

  test('should build standard pipeline with screen', () => {
    const roles = [makeRole(RoleType.Screen, 200), makeRole(RoleType.Label), makeRole(RoleType.QA1), makeRole(RoleType.QA2)];
    const flows = [makeFlow('screen→label', 1), makeFlow('label→qa1', 1), makeFlow('qa1→qa2', 1)];
    const pipeline = buildPipeline(FlowMode.Standard, true, 80, 90, roles, flows);

    expect(pipeline.stages.length).toBe(4);
    expect(pipeline.stages[0].isScreenStage).toBe(true);
    expect(pipeline.screenRate).toBe(0.8);
    expect(pipeline.finalRate).toBe(0.9);
  });

  test('should build label_qc pipeline', () => {
    const roles = [makeRole(RoleType.LabelQC), makeRole(RoleType.QA2)];
    const flows = [makeFlow('label_qc→qa2', 2)];
    const pipeline = buildPipeline(FlowMode.LabelQC, false, 80, 100, roles, flows);

    expect(pipeline.stages.length).toBe(2);
    expect(pipeline.stages[0].roleType).toBe(RoleType.LabelQC);
    expect(pipeline.gaps[0].gapDays).toBe(2);
  });

  test('totalGapSum should sum all gaps', () => {
    const roles = [makeRole(RoleType.Label), makeRole(RoleType.QA1), makeRole(RoleType.QA2)];
    const flows = [makeFlow('label→qa1', 1.5), makeFlow('qa1→qa2', 2)];
    const pipeline = buildPipeline(FlowMode.Standard, false, 80, 100, roles, flows);

    expect(totalGapSum(pipeline)).toBe(3.5);
  });

  test('getAvailableDays should compute per-stage available days', () => {
    const roles = [makeRole(RoleType.Label), makeRole(RoleType.QA1), makeRole(RoleType.QA2)];
    const flows = [makeFlow('label→qa1', 2), makeFlow('qa1→qa2', 3)];
    const pipeline = buildPipeline(FlowMode.Standard, false, 80, 100, roles, flows);

    const avail = getAvailableDays(pipeline, 20);
    expect(avail.get(1)).toBe(20);
    expect(avail.get(2)).toBe(18); // 20 - 2
    expect(avail.get(3)).toBe(15); // 20 - 2 - 3
  });

  test('should throw for missing role config', () => {
    const roles = [makeRole(RoleType.Label)]; // missing qa1, qa2
    const flows = [makeFlow('label→qa1', 1)];
    expect(() => buildPipeline(FlowMode.Standard, false, 80, 100, roles, flows)).toThrow();
  });
});
