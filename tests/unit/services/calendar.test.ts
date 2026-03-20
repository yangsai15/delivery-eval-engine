import Database from 'better-sqlite3';
import { runMigrations } from '../../../src/db/migrations';
import { CalendarService } from '../../../src/services/calendar.service';

describe('CalendarService', () => {
  let db: Database.Database;
  let service: CalendarService;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    service = new CalendarService(db);
  });

  afterEach(() => db.close());

  test('should return default calendar for missing year', () => {
    const cal = service.getCalendar(2026);
    expect(cal.year).toBe(2026);
    expect(cal.holidays).toEqual([]);
    expect(cal.workdays).toEqual([]);
  });

  test('should save and retrieve calendar', () => {
    service.saveCalendar({
      year: 2026,
      holidays: ['2026-01-01'],
      workdays: ['2026-01-04'],
      adjustments: [],
    });
    const cal = service.getCalendar(2026);
    expect(cal.holidays).toContain('2026-01-01');
    expect(cal.workdays).toContain('2026-01-04');
  });

  test('should add and remove holidays', () => {
    service.addHoliday(2026, '2026-05-01');
    let cal = service.getCalendar(2026);
    expect(cal.holidays).toContain('2026-05-01');

    service.removeHoliday(2026, '2026-05-01');
    cal = service.getCalendar(2026);
    expect(cal.holidays).not.toContain('2026-05-01');
  });

  test('should add extra workdays', () => {
    service.addWorkday(2026, '2026-10-10');
    const cal = service.getCalendar(2026);
    expect(cal.workdays).toContain('2026-10-10');
  });

  test('should not duplicate holidays', () => {
    service.addHoliday(2026, '2026-05-01');
    service.addHoliday(2026, '2026-05-01');
    const cal = service.getCalendar(2026);
    expect(cal.holidays.filter(d => d === '2026-05-01').length).toBe(1);
  });

  test('getWorkingDays should exclude weekends and holidays', () => {
    service.saveCalendar({
      year: 2026,
      holidays: ['2026-04-06'], // Monday holiday
      workdays: ['2026-04-05'], // Sunday workday
      adjustments: [],
    });

    const days = service.getWorkingDays('2026-04-01', '2026-04-10');
    // Apr 1=Wed, 2=Thu, 3=Fri (work), 4=Sat(off), 5=Sun(work-extra),
    // 6=Mon(holiday), 7=Tue(work), 8=Wed(work), 9=Thu(work), 10=Fri(work)
    expect(days).toContain('2026-04-01');
    expect(days).toContain('2026-04-05'); // extra workday
    expect(days).not.toContain('2026-04-04'); // saturday
    expect(days).not.toContain('2026-04-06'); // holiday
  });

  test('initializeDefaults should create 2026 and 2027 calendars', () => {
    service.initializeDefaults();
    const cal2026 = service.getCalendar(2026);
    expect(cal2026.holidays.length).toBeGreaterThan(0);
    expect(cal2026.holidays).toContain('2026-01-01');
  });

  test('importCalendar should overwrite existing', () => {
    service.saveCalendar({ year: 2026, holidays: ['2026-01-01'], workdays: [], adjustments: [] });
    service.importCalendar({ year: 2026, holidays: ['2026-05-01'], workdays: [], adjustments: [] });
    const cal = service.getCalendar(2026);
    expect(cal.holidays).toEqual(['2026-05-01']);
  });
});
