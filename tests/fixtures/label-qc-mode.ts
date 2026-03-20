import { FlowMode, RoleType } from '../../src/types/enums';
import { Pipeline, DailyCapacity, SimulationInput } from '../../src/types/algorithm.types';

/**
 * Label QC mode fixture: 5000 items, 10 working days, with screen (80%)
 * screen eff=200, label_qc eff=100, qa2 eff=100
 * gaps: screen→label_qc = 1, label_qc→qa2 = 1
 */
export const LABEL_QC_PROJECT = {
  project_name: 'Label QC Test Project',
  label_type: '文本分类',
  unit: '条',
  total_data: 5000,
  start_date: '2026-04-01',
  end_date: '2026-04-14', // ~10 working days
  flow_mode: FlowMode.LabelQC,
  pipeline_roles: [RoleType.Screen, RoleType.LabelQC, RoleType.QA2],
  enable_screen: true,
  screen_efficiency: 80,
  final_efficiency: 100,
};

export function buildLabelQCPipeline(): Pipeline {
  return {
    stages: [
      { index: 1, roleType: RoleType.Screen, efficiency: 200, basePeople: 3, isScreenStage: true },
      { index: 2, roleType: RoleType.LabelQC, efficiency: 100, basePeople: 5, isScreenStage: false },
      { index: 3, roleType: RoleType.QA2, efficiency: 100, basePeople: 5, isScreenStage: false },
    ],
    gaps: [
      { fromIndex: 1, toIndex: 2, gapDays: 1 },
      { fromIndex: 2, toIndex: 3, gapDays: 1 },
    ],
    flowMode: FlowMode.LabelQC,
    pipelineRoles: [RoleType.Screen, RoleType.LabelQC, RoleType.QA2],
    enableScreen: true,
    screenRate: 0.8,
    finalRate: 1,
  };
}

export function buildLabelQCCapacity(D: number = 10): DailyCapacity[][] {
  const pipeline = buildLabelQCPipeline();
  const matrix: DailyCapacity[][] = Array.from({ length: 4 }, () =>
    Array.from({ length: D + 1 }, () => ({
      people: 0,
      efficiency: 0,
      overtimeCap: 0,
      totalCap: 0,
    }))
  );

  for (const stage of pipeline.stages) {
    for (let d = 1; d <= D; d++) {
      matrix[stage.index][d] = {
        people: stage.basePeople,
        efficiency: stage.efficiency,
        overtimeCap: 0,
        totalCap: stage.basePeople * stage.efficiency,
      };
    }
  }

  return matrix;
}

export function buildLabelQCSimInput(D: number = 10): SimulationInput {
  return {
    pipeline: buildLabelQCPipeline(),
    totalData: 5000,
    workingDays: D,
    capacity: buildLabelQCCapacity(D),
    warnThreshold: { dataShortage: 100, laborOverflow: 100 },
  };
}
