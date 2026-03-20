import { FlowMode, RoleType, CalcType } from '../../src/types/enums';
import { Pipeline, DailyCapacity, SimulationInput } from '../../src/types/algorithm.types';
import { RoleConfig, FlowConfig } from '../../src/types/project.types';

/**
 * Standard mode fixture: 10000 items, 20 working days, no screen
 * All roles efficiency = 100, gaps = 1 day each
 * Expected: optimal ~5 people per role (10000 / 20 = 500/day, 500/100 = 5)
 */
export const STANDARD_PROJECT = {
  project_name: 'Standard Test Project',
  label_type: '目标检测',
  unit: '条',
  total_data: 10000,
  start_date: '2026-04-01',
  end_date: '2026-04-28', // ~20 working days (Mon-Fri, no holidays)
  flow_mode: FlowMode.Standard,
  pipeline_roles: [RoleType.Label, RoleType.QA1, RoleType.QA2],
  enable_screen: false,
  screen_efficiency: null as number | null,
  final_efficiency: 100,
};

export const STANDARD_ROLE_CONFIGS: Array<{
  role_type: string;
  daily_efficiency: number;
  base_people: number;
}> = [
  { role_type: RoleType.Label, daily_efficiency: 100, base_people: 5 },
  { role_type: RoleType.QA1, daily_efficiency: 100, base_people: 5 },
  { role_type: RoleType.QA2, daily_efficiency: 100, base_people: 5 },
];

export const STANDARD_FLOW_CONFIGS: Array<{
  flow_node: string;
  interval_days: number;
}> = [
  { flow_node: 'label→qa1', interval_days: 1 },
  { flow_node: 'qa1→qa2', interval_days: 1 },
];

/**
 * Build a standard pipeline for direct engine testing.
 */
export function buildStandardPipeline(): Pipeline {
  return {
    stages: [
      { index: 1, roleType: RoleType.Label, efficiency: 100, basePeople: 5, isScreenStage: false },
      { index: 2, roleType: RoleType.QA1, efficiency: 100, basePeople: 5, isScreenStage: false },
      { index: 3, roleType: RoleType.QA2, efficiency: 100, basePeople: 5, isScreenStage: false },
    ],
    gaps: [
      { fromIndex: 1, toIndex: 2, gapDays: 1 },
      { fromIndex: 2, toIndex: 3, gapDays: 1 },
    ],
    flowMode: FlowMode.Standard,
    pipelineRoles: [RoleType.Label, RoleType.QA1, RoleType.QA2],
    enableScreen: false,
    screenRate: 1,
    finalRate: 1,
  };
}

/**
 * Build capacity matrix for standard mode: 5 people × 100 eff = 500 cap/day, no overtime.
 */
export function buildStandardCapacity(D: number = 20, people: number = 5): DailyCapacity[][] {
  const stageCount = 3;
  const matrix: DailyCapacity[][] = Array.from({ length: stageCount + 1 }, () =>
    Array.from({ length: D + 1 }, () => ({
      people: 0,
      efficiency: 0,
      overtimeCap: 0,
      totalCap: 0,
    }))
  );

  for (let sIdx = 1; sIdx <= stageCount; sIdx++) {
    for (let d = 1; d <= D; d++) {
      matrix[sIdx][d] = {
        people,
        efficiency: 100,
        overtimeCap: 0,
        totalCap: people * 100,
      };
    }
  }

  return matrix;
}

export function buildStandardSimInput(D: number = 20, people: number = 5): SimulationInput {
  return {
    pipeline: buildStandardPipeline(),
    totalData: 10000,
    workingDays: D,
    capacity: buildStandardCapacity(D, people),
    warnThreshold: { dataShortage: 100, laborOverflow: 100 },
  };
}
