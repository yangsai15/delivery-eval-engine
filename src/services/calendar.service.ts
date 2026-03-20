import type Database from 'better-sqlite3';
import { SystemConfigRepository } from '../db/repositories/system-config.repository';
import { ConfigType } from '../types/enums';
import { isWeekend, dateRange } from '../utils/date';

export interface CalendarData {
  year: number;
  holidays: string[];   // YYYY-MM-DD
  workdays: string[];    // extra workdays (调休日)
  adjustments: Array<{ date: string; type: 'holiday' | 'workday' }>;
}

export class CalendarService {
  private configRepo: SystemConfigRepository;

  constructor(private db: Database.Database) {
    this.configRepo = new SystemConfigRepository(db);
  }

  /**
   * Get or create a calendar configuration for a given year.
   */
  getCalendar(year: number): CalendarData {
    const calendars = this.configRepo.getByType(ConfigType.Calendar);
    const existing = calendars.find(
      c => (c.config_content as unknown as CalendarData).year === year
    );
    if (existing) {
      return existing.config_content as unknown as CalendarData;
    }
    // Return default (weekends off, no holidays)
    return { year, holidays: [], workdays: [], adjustments: [] };
  }

  /**
   * Save a calendar configuration.
   */
  saveCalendar(data: CalendarData): void {
    const calendars = this.configRepo.getByType(ConfigType.Calendar);
    const existing = calendars.find(
      c => (c.config_content as unknown as CalendarData).year === data.year
    );
    if (existing) {
      this.configRepo.update(existing.config_id, data as unknown as Record<string, unknown>);
    } else {
      this.configRepo.create({
        config_type: ConfigType.Calendar,
        config_name: `calendar_${data.year}`,
        config_content: data as unknown as Record<string, unknown>,
      });
    }
  }

  /**
   * Add a holiday to a year's calendar.
   */
  addHoliday(year: number, date: string): void {
    const cal = this.getCalendar(year);
    if (!cal.holidays.includes(date)) {
      cal.holidays.push(date);
      cal.holidays.sort();
      cal.adjustments.push({ date, type: 'holiday' });
      this.saveCalendar(cal);
    }
  }

  /**
   * Add an extra workday (调休) to a year's calendar.
   */
  addWorkday(year: number, date: string): void {
    const cal = this.getCalendar(year);
    if (!cal.workdays.includes(date)) {
      cal.workdays.push(date);
      cal.workdays.sort();
      cal.adjustments.push({ date, type: 'workday' });
      this.saveCalendar(cal);
    }
  }

  /**
   * Remove a holiday from a year's calendar.
   */
  removeHoliday(year: number, date: string): void {
    const cal = this.getCalendar(year);
    cal.holidays = cal.holidays.filter(d => d !== date);
    cal.adjustments = cal.adjustments.filter(a => !(a.date === date && a.type === 'holiday'));
    this.saveCalendar(cal);
  }

  /**
   * Import a batch of calendar data (holidays + workdays).
   */
  importCalendar(data: CalendarData): void {
    this.saveCalendar(data);
  }

  /**
   * Get working days for a date range, using calendar configuration.
   */
  getWorkingDays(startDate: string, endDate: string): string[] {
    const startYear = parseInt(startDate.slice(0, 4));
    const endYear = parseInt(endDate.slice(0, 4));

    const holidays = new Set<string>();
    const extraWorkdays = new Set<string>();

    for (let year = startYear; year <= endYear; year++) {
      const cal = this.getCalendar(year);
      cal.holidays.forEach(d => holidays.add(d));
      cal.workdays.forEach(d => extraWorkdays.add(d));
    }

    const allDates = dateRange(startDate, endDate);
    return allDates.filter(date => {
      if (holidays.has(date)) return false;
      if (extraWorkdays.has(date)) return true;
      return !isWeekend(date);
    });
  }

  /**
   * Initialize default calendars with Chinese national holidays.
   */
  initializeDefaults(): void {
    // 2026 Chinese national holidays (approximate)
    const holidays2026: CalendarData = {
      year: 2026,
      holidays: [
        '2026-01-01', '2026-01-02', '2026-01-03', // 元旦
        '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20',
        '2026-02-21', '2026-02-22', '2026-02-23', // 春节
        '2026-04-05', '2026-04-06', '2026-04-07', // 清明
        '2026-05-01', '2026-05-02', '2026-05-03', // 劳动节
        '2026-06-19', '2026-06-20', '2026-06-21', // 端午
        '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
        '2026-10-05', '2026-10-06', '2026-10-07', // 国庆+中秋
      ],
      workdays: [
        '2026-02-14', '2026-02-15', // 春节调休
        '2026-10-10', // 国庆调休
      ],
      adjustments: [],
    };
    this.saveCalendar(holidays2026);

    const holidays2027: CalendarData = {
      year: 2027,
      holidays: [
        '2027-01-01', '2027-01-02', '2027-01-03',
        '2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09',
        '2027-02-10', '2027-02-11', '2027-02-12',
        '2027-04-05', '2027-04-06', '2027-04-07',
        '2027-05-01', '2027-05-02', '2027-05-03',
        '2027-06-09', '2027-06-10', '2027-06-11',
        '2027-10-01', '2027-10-02', '2027-10-03', '2027-10-04',
        '2027-10-05', '2027-10-06', '2027-10-07',
      ],
      workdays: [],
      adjustments: [],
    };
    this.saveCalendar(holidays2027);
  }
}
