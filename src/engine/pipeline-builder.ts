import { FlowMode, RoleType } from '../types/enums';
import { Pipeline, PipelineStage, PipelineGap } from '../types/algorithm.types';
import { RoleConfig, FlowConfig } from '../types/project.types';

/**
 * Standard mode pipeline chains:
 * - Without screen: label → qa1 → qa2
 * - With screen: screen → label → qa1 → qa2
 *
 * Label QC mode pipeline chains:
 * - Without screen: label_qc → qa2
 * - With screen: screen → label_qc → qa2
 */
function getStageOrder(flowMode: FlowMode, enableScreen: boolean): RoleType[] {
  if (flowMode === FlowMode.Standard) {
    if (enableScreen) return [RoleType.Screen, RoleType.Label, RoleType.QA1, RoleType.QA2];
    return [RoleType.Label, RoleType.QA1, RoleType.QA2];
  } else {
    if (enableScreen) return [RoleType.Screen, RoleType.LabelQC, RoleType.QA2];
    return [RoleType.LabelQC, RoleType.QA2];
  }
}

/**
 * Map flow_node strings to the gap between two consecutive role types.
 */
function getFlowNodeKey(from: RoleType, to: RoleType): string {
  return `${from}→${to}`;
}

const FLOW_NODE_ALIASES: Record<string, string> = {
  'screen→label': 'screen→label',
  'screen→label_qc': 'screen→label_qc',
  'label→qa1': 'label→qa1',
  'qa1→qa2': 'qa1→qa2',
  'label_qc→qa2': 'label_qc→qa2',
};

/**
 * Build a Pipeline from project configuration.
 *
 * @param flowMode Project flow mode
 * @param enableScreen Whether screen stage is enabled
 * @param screenEfficiency Screen efficiency percentage (0-100)
 * @param finalEfficiency Final delivery efficiency percentage (0-100)
 * @param roleConfigs All role configurations for the project
 * @param flowConfigs All flow configurations for the project
 * @returns Constructed Pipeline
 */
export function buildPipeline(
  flowMode: FlowMode,
  enableScreen: boolean,
  screenEfficiency: number,
  finalEfficiency: number,
  roleConfigs: RoleConfig[],
  flowConfigs: FlowConfig[],
): Pipeline {
  const stageOrder = getStageOrder(flowMode, enableScreen);

  // Build role config lookup
  const roleMap = new Map<RoleType, RoleConfig>();
  for (const rc of roleConfigs) {
    roleMap.set(rc.role_type, rc);
  }

  // Build flow config lookup
  const flowMap = new Map<string, number>();
  for (const fc of flowConfigs) {
    flowMap.set(fc.flow_node, fc.interval_days);
  }

  // Build stages (1-indexed)
  const stages: PipelineStage[] = stageOrder.map((roleType, idx) => {
    const rc = roleMap.get(roleType);
    if (!rc) {
      throw new Error(`Missing role config for ${roleType}`);
    }
    return {
      index: idx + 1,
      roleType,
      efficiency: rc.daily_efficiency,
      basePeople: rc.base_people,
      isScreenStage: roleType === RoleType.Screen,
    };
  });

  // Build gaps between consecutive stages
  const gaps: PipelineGap[] = [];
  for (let i = 0; i < stageOrder.length - 1; i++) {
    const flowNode = getFlowNodeKey(stageOrder[i], stageOrder[i + 1]);
    const gapDays = flowMap.get(flowNode) ?? flowMap.get(FLOW_NODE_ALIASES[flowNode] ?? '') ?? 1;
    gaps.push({
      fromIndex: i + 1,
      toIndex: i + 2,
      gapDays,
    });
  }

  return {
    stages,
    gaps,
    flowMode,
    enableScreen,
    screenRate: screenEfficiency / 100,
    finalRate: finalEfficiency / 100,
  };
}

/**
 * Get the total gap sum for a pipeline.
 */
export function totalGapSum(pipeline: Pipeline): number {
  return pipeline.gaps.reduce((sum, g) => sum + g.gapDays, 0);
}

/**
 * Get the gap between stage fromIndex and toIndex.
 */
export function getGapBetween(pipeline: Pipeline, fromIndex: number, toIndex: number): number {
  const gap = pipeline.gaps.find(g => g.fromIndex === fromIndex && g.toIndex === toIndex);
  return gap?.gapDays ?? 0;
}

/**
 * Calculate available working days for each stage, considering cumulative gap delays.
 */
export function getAvailableDays(pipeline: Pipeline, totalDays: number): Map<number, number> {
  const result = new Map<number, number>();
  let cumGap = 0;
  for (const stage of pipeline.stages) {
    result.set(stage.index, totalDays - cumGap);
    const gap = pipeline.gaps.find(g => g.fromIndex === stage.index);
    if (gap) cumGap += gap.gapDays;
  }
  return result;
}
