import { CostSummary, CostEntry, OvertimeEntry, OvertimeRateEntry, Pipeline, DailyCapacity, StageEntry } from '../types/algorithm.types';

export interface CostInput {
  pipeline: Pipeline;
  workingDays: string[]; // date strings
  D: number;
  costEntries: CostEntry[];
  overtimeEntries: OvertimeEntry[];
  overtimeRates: OvertimeRateEntry[];
  stageEntries: StageEntry[];
  capacity: DailyCapacity[][];
  totalFinalOut: number;
}

/**
 * §10.7 Cost Calculation.
 *
 * BasicCost = Σ(all roles, all types, all days) People[i][type][d] × DailySalary[i][type]
 * OvertimeCost = Σ(all roles, all days) OvertimeDays[i][d] × DailySalary[i] × People[i][d] × Multiplier
 * TotalCost = BasicCost + OvertimeCost
 * UnitCost = TotalCost / CumFinal[D]
 */
export function calculateCost(input: CostInput): CostSummary {
  const { pipeline, workingDays, D, costEntries, overtimeEntries, overtimeRates, stageEntries, totalFinalOut } = input;

  // Build rate multiplier lookup
  const rateMap = new Map<string, number>();
  for (const r of overtimeRates) {
    rateMap.set(r.dateType, r.rate);
  }
  // Default rates if not configured
  if (!rateMap.has('workday')) rateMap.set('workday', 1.5);
  if (!rateMap.has('weekend')) rateMap.set('weekend', 2.0);
  if (!rateMap.has('holiday')) rateMap.set('holiday', 3.0);

  // Build stage entry lookup
  const stageLookup = new Map<string, StageEntry[]>();
  for (const se of stageEntries) {
    const key = se.roleType;
    if (!stageLookup.has(key)) stageLookup.set(key, []);
    stageLookup.get(key)!.push(se);
  }

  // Calculate basic cost: iterate each cost entry × working days
  let basicCost = 0;
  for (const ce of costEntries) {
    const role = pipeline.stages.find(s => s.roleType === ce.roleType);
    if (!role) continue;

    for (let d = 1; d <= D; d++) {
      const dateStr = workingDays[d - 1];

      // Determine people count for this cost entry on this day
      let people = ce.peopleNum;
      const stages = stageLookup.get(ce.roleType) ?? [];
      if (stages.length > 0) {
        for (const se of stages) {
          if (dateStr >= se.startDate && dateStr <= se.endDate) {
            // Scale the cost entry people proportionally to staged changes
            const roleBasePeople = role.basePeople;
            if (roleBasePeople > 0) {
              people = Math.round(ce.peopleNum * se.peopleNum / roleBasePeople);
            }
            break;
          }
        }
      }

      basicCost += people * ce.dailySalary;
    }
  }

  // Calculate overtime cost
  let overtimeCost = 0;

  // Build average daily salary per role (weighted by people)
  const roleSalary = new Map<string, number>();
  const roleCostPeople = new Map<string, number>();
  for (const ce of costEntries) {
    const existing = roleSalary.get(ce.roleType) ?? 0;
    const existingPeople = roleCostPeople.get(ce.roleType) ?? 0;
    roleSalary.set(ce.roleType, existing + ce.dailySalary * ce.peopleNum);
    roleCostPeople.set(ce.roleType, existingPeople + ce.peopleNum);
  }

  for (const ot of overtimeEntries) {
    const role = pipeline.stages.find(s => s.roleType === ot.roleType);
    if (!role) continue;

    const dateStr = ot.date;
    const multiplier = rateMap.get(ot.dateType) ?? 1.5;

    // Find the day index in working days
    const dayIdx = workingDays.indexOf(dateStr) + 1;
    const people = dayIdx > 0
      ? (input.capacity[role.index]?.[dayIdx]?.people ?? role.basePeople)
      : role.basePeople;

    // Use average daily salary for the role
    const totalSalary = roleSalary.get(ot.roleType) ?? 0;
    const totalPeople = roleCostPeople.get(ot.roleType) ?? 1;
    const avgSalary = totalSalary / totalPeople;

    overtimeCost += ot.overtimeDays * avgSalary * people * multiplier;
  }

  const totalCost = basicCost + overtimeCost;
  const unitCost = totalFinalOut > 0 ? totalCost / totalFinalOut : null;

  return {
    basicCost,
    overtimeCost,
    totalCost,
    unitCost,
  };
}
