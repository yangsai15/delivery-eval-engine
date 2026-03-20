import { dateRange, isWeekend, formatDate, parseDate } from '../utils/date';
import { OvertimeEntry } from '../types/algorithm.types';
import { RoleType } from '../types/enums';

export interface WorkingDayInfo {
  date: string;        // YYYY-MM-DD
  dayIndex: number;    // 1-indexed working day number
  isOvertimeDay: boolean;
}

/**
 * Build the standard working day sequence from project start/end dates.
 * Excludes weekends and holidays by default.
 *
 * @param startDate Project start date
 * @param endDate Project end date
 * @param holidays Set of holiday date strings (YYYY-MM-DD)
 * @param extraWorkdays Set of extra workday date strings (调休日)
 * @returns Array of working day date strings, ordered chronologically
 */
export function buildWorkingDays(
  startDate: string,
  endDate: string,
  holidays: Set<string> = new Set(),
  extraWorkdays: Set<string> = new Set(),
): string[] {
  const allDates = dateRange(startDate, endDate);
  return allDates.filter(date => {
    if (holidays.has(date)) return false;
    if (extraWorkdays.has(date)) return true;
    return !isWeekend(date);
  });
}

/**
 * Build a role-specific working day sequence that includes overtime days.
 * Overtime days on non-working days (weekends/holidays) are inserted chronologically.
 *
 * @param standardWorkingDays The base working day sequence
 * @param overtimeEntries All overtime entries for this role
 * @param startDate Project start date
 * @param endDate Project end date
 * @returns Working day info array including overtime days for this role
 */
export function buildRoleWorkingDays(
  standardWorkingDays: string[],
  overtimeEntries: OvertimeEntry[],
  startDate: string,
  endDate: string,
): WorkingDayInfo[] {
  const workingDaysSet = new Set(standardWorkingDays);

  // Find overtime days that are NOT already standard working days
  const overtimeDates = new Set<string>();
  for (const ot of overtimeEntries) {
    if (!workingDaysSet.has(ot.date)) {
      const d = parseDate(ot.date);
      const s = parseDate(startDate);
      const e = parseDate(endDate);
      if (d >= s && d <= e) {
        overtimeDates.add(ot.date);
      }
    }
  }

  // Merge standard working days + overtime non-working days, sorted chronologically
  const allDates = [...standardWorkingDays, ...overtimeDates].sort();

  return allDates.map((date, idx) => ({
    date,
    dayIndex: idx + 1,
    isOvertimeDay: overtimeDates.has(date),
  }));
}

/**
 * Build a lookup from date string to overtime_days for a specific role.
 */
export function buildOvertimeLookup(
  overtimeEntries: OvertimeEntry[],
  roleType: RoleType,
): Map<string, number> {
  const lookup = new Map<string, number>();
  for (const ot of overtimeEntries) {
    if (ot.roleType === roleType) {
      lookup.set(ot.date, (lookup.get(ot.date) ?? 0) + ot.overtimeDays);
    }
  }
  return lookup;
}
