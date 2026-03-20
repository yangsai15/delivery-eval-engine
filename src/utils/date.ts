/**
 * Parse a YYYY-MM-DD string to a Date object (local time).
 */
export function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Format a Date to YYYY-MM-DD string.
 */
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Get ISO timestamp string.
 */
export function nowISO(): string {
  return new Date().toISOString().replace('Z', '').split('.')[0];
}

/**
 * Get the day of week: 0=Sunday, 6=Saturday.
 */
export function dayOfWeek(dateStr: string): number {
  return parseDate(dateStr).getDay();
}

/**
 * Check if a date is a weekend (Saturday or Sunday).
 */
export function isWeekend(dateStr: string): boolean {
  const dow = dayOfWeek(dateStr);
  return dow === 0 || dow === 6;
}

/**
 * Generate all dates between start and end (inclusive), as YYYY-MM-DD strings.
 */
export function dateRange(startDate: string, endDate: string): string[] {
  const result: string[] = [];
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  const current = new Date(start);
  while (current <= end) {
    result.push(formatDate(current));
    current.setDate(current.getDate() + 1);
  }
  return result;
}

/**
 * Add days to a date string.
 */
export function addDays(dateStr: string, days: number): string {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}
