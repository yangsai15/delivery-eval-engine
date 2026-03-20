import { DailyCapacity, Pipeline, StageEntry, OvertimeEntry } from '../types/algorithm.types';
import { RoleType } from '../types/enums';

/**
 * Build Cap[i][d] matrix for all stages and working days.
 * Cap[i][d] = People[i][d] × Eff[i] + OvertimeCap[i][d]
 *
 * @param pipeline The pipeline definition
 * @param workingDays Standard working day dates (not role-specific)
 * @param stageEntries Staged people configurations
 * @param overtimeEntries Overtime configurations
 * @param overridePeople Optional: override people count per role (used by optimal staffing)
 * @returns 2D array [stageIndex][dayIndex], both 1-indexed
 */
export function buildCapacityMatrix(
  pipeline: Pipeline,
  workingDays: string[],
  stageEntries: StageEntry[],
  overtimeEntries: OvertimeEntry[],
  overridePeople?: Map<RoleType, number>,
): DailyCapacity[][] {
  const D = workingDays.length;
  const stageCount = pipeline.stages.length;

  // Initialize: index 0 is unused (1-indexed)
  const matrix: DailyCapacity[][] = Array.from({ length: stageCount + 1 }, () =>
    Array.from({ length: D + 1 }, () => ({
      people: 0,
      efficiency: 0,
      overtimeCap: 0,
      totalCap: 0,
    }))
  );

  // Build stage entry lookup: roleType -> sorted stages
  const stageMap = new Map<RoleType, StageEntry[]>();
  for (const se of stageEntries) {
    const list = stageMap.get(se.roleType) ?? [];
    list.push(se);
    stageMap.set(se.roleType, list);
  }

  // Build overtime lookup: roleType -> date -> overtime_days
  const overtimeMap = new Map<RoleType, Map<string, number>>();
  for (const ot of overtimeEntries) {
    if (!overtimeMap.has(ot.roleType)) {
      overtimeMap.set(ot.roleType, new Map());
    }
    const dateMap = overtimeMap.get(ot.roleType)!;
    dateMap.set(ot.date, (dateMap.get(ot.date) ?? 0) + ot.overtimeDays);
  }

  for (const stage of pipeline.stages) {
    const roleType = stage.roleType;
    const eff = stage.efficiency;
    const basePeople = overridePeople?.get(roleType) ?? stage.basePeople;
    const stages = stageMap.get(roleType) ?? [];
    const otMap = overtimeMap.get(roleType);

    for (let d = 1; d <= D; d++) {
      const dateStr = workingDays[d - 1];

      // Determine people count for this day (staged or base)
      let people = basePeople;
      if (stages.length > 0 && !overridePeople) {
        for (const se of stages) {
          if (dateStr >= se.startDate && dateStr <= se.endDate) {
            people = se.peopleNum;
            break;
          }
        }
      }

      // Overtime capacity on working days: overtime_days × People × Eff
      const overtimeDays = otMap?.get(dateStr) ?? 0;
      const overtimeCap = overtimeDays * people * eff;

      const totalCap = people * eff + overtimeCap;

      matrix[stage.index][d] = {
        people,
        efficiency: eff,
        overtimeCap,
        totalCap,
      };
    }
  }

  return matrix;
}
