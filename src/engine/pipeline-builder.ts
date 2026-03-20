import { FlowMode, RoleType } from '../types/enums';
import { Pipeline, PipelineStage, PipelineGap } from '../types/algorithm.types';
import { RoleConfig, FlowConfig } from '../types/project.types';

/**
 * Map flow_node strings to the gap between two consecutive role types.
 */
function getFlowNodeKey(from: string, to: string): string {
  return `${from}→${to}`;
}

/**
 * Build a Pipeline from a user-defined role order (pipeline_roles).
 *
 * The engine does not care about specific role names — only their order matters.
 * First role marked 'screen' → applies R_screen.
 * Last role → applies R_final.
 *
 * @param pipelineRoles Ordered array of role type strings (e.g. ['screen','label','qa1','qa2'])
 * @param screenEfficiency Screen efficiency percentage (0-100)
 * @param finalEfficiency Final delivery efficiency percentage (0-100)
 * @param roleConfigs All role configurations for the project
 * @param flowConfigs All flow configurations for the project
 * @param flowMode Legacy flow mode (kept for compatibility)
 * @returns Constructed Pipeline
 */
export function buildPipeline(
  pipelineRoles: string[],
  screenEfficiency: number,
  finalEfficiency: number,
  roleConfigs: RoleConfig[],
  flowConfigs: FlowConfig[],
  flowMode: FlowMode = FlowMode.Standard,
): Pipeline {
  const enableScreen = pipelineRoles.length > 0 && pipelineRoles[0] === RoleType.Screen;

  // Build role config lookup
  const roleMap = new Map<string, RoleConfig>();
  for (const rc of roleConfigs) {
    roleMap.set(rc.role_type, rc);
  }

  // Build flow config lookup
  const flowMap = new Map<string, number>();
  for (const fc of flowConfigs) {
    flowMap.set(fc.flow_node, fc.interval_days);
  }

  // Build stages (1-indexed)
  const stages: PipelineStage[] = pipelineRoles.map((roleType, idx) => {
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
  for (let i = 0; i < pipelineRoles.length - 1; i++) {
    const flowNode = getFlowNodeKey(pipelineRoles[i], pipelineRoles[i + 1]);
    const gapDays = flowMap.get(flowNode) ?? 1;
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
    pipelineRoles,
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
