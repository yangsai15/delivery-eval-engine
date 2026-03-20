import { buildWorkingDays, buildRoleWorkingDays, buildOvertimeLookup } from '../../../src/engine/calendar';
import { RoleType } from '../../../src/types/enums';

describe('Calendar Engine', () => {
  test('buildWorkingDays should exclude weekends', () => {
    // 2026-04-06 = Monday, 2026-04-12 = Sunday
    const days = buildWorkingDays('2026-04-06', '2026-04-12');
    expect(days.length).toBe(5); // Mon-Fri
    expect(days).toContain('2026-04-06');
    expect(days).toContain('2026-04-10');
    expect(days).not.toContain('2026-04-11'); // Saturday
    expect(days).not.toContain('2026-04-12'); // Sunday
  });

  test('buildWorkingDays should exclude holidays', () => {
    const holidays = new Set(['2026-04-07']); // Tuesday
    const days = buildWorkingDays('2026-04-06', '2026-04-10', holidays);
    expect(days.length).toBe(4);
    expect(days).not.toContain('2026-04-07');
  });

  test('buildWorkingDays should include extra workdays', () => {
    const extraWorkdays = new Set(['2026-04-11']); // Saturday
    const days = buildWorkingDays('2026-04-06', '2026-04-12', new Set(), extraWorkdays);
    expect(days).toContain('2026-04-11');
    expect(days.length).toBe(6);
  });

  test('buildRoleWorkingDays should insert overtime non-working days', () => {
    const standardDays = buildWorkingDays('2026-04-06', '2026-04-12');
    const overtimeEntries = [{
      roleType: RoleType.Label,
      date: '2026-04-11', // Saturday
      overtimeDays: 1,
      dateType: 'weekend',
    }];

    const roleDays = buildRoleWorkingDays(
      standardDays, overtimeEntries, '2026-04-06', '2026-04-12'
    );

    expect(roleDays.length).toBe(6); // 5 regular + 1 overtime
    const satEntry = roleDays.find(d => d.date === '2026-04-11');
    expect(satEntry).toBeDefined();
    expect(satEntry!.isOvertimeDay).toBe(true);
  });

  test('buildRoleWorkingDays should not duplicate existing working days', () => {
    const standardDays = buildWorkingDays('2026-04-06', '2026-04-10');
    const overtimeEntries = [{
      roleType: RoleType.Label,
      date: '2026-04-07', // Tuesday - already a working day
      overtimeDays: 0.5,
      dateType: 'workday',
    }];

    const roleDays = buildRoleWorkingDays(
      standardDays, overtimeEntries, '2026-04-06', '2026-04-10'
    );

    expect(roleDays.length).toBe(5); // no duplicate
  });

  test('buildOvertimeLookup should aggregate overtime days', () => {
    const entries = [
      { roleType: RoleType.Label, date: '2026-04-07', overtimeDays: 0.5, dateType: 'workday' },
      { roleType: RoleType.Label, date: '2026-04-07', overtimeDays: 0.5, dateType: 'workday' },
      { roleType: RoleType.QA1, date: '2026-04-07', overtimeDays: 1, dateType: 'workday' },
    ];

    const lookup = buildOvertimeLookup(entries, RoleType.Label);
    expect(lookup.get('2026-04-07')).toBe(1); // 0.5 + 0.5
    expect(lookup.has('2026-04-08')).toBe(false);
  });
});
