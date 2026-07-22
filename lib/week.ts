/**
 * Monday–Sunday week helpers (local time).
 *
 * Matches HabitDayStatus.days: 7 flags Monday through Sunday, with
 * week_start as the Monday of that week (YYYY-MM-DD).
 *
 * No external dependencies (no date-fns) — plain Date math only, to keep
 * the app's dependency footprint small for now.
 */

/**
 * Format a Date as YYYY-MM-DD using the local calendar (not UTC).
 */
export function formatWeekStart(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Return the Monday of the week containing `date`, as YYYY-MM-DD (local time).
 *
 * If `date` is itself a Monday, returns that same date.
 *
 * @example
 * // If today is Wednesday 2026-07-22, returns "2026-07-20"
 * getWeekStart(new Date(2026, 6, 22));
 */
export function getWeekStart(date: Date = new Date()): string {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);

  const day = result.getDay(); // 0=Sun … 6=Sat
  const daysBackToMonday = day === 0 ? 6 : day - 1;
  result.setDate(result.getDate() - daysBackToMonday);

  return formatWeekStart(result);
}

/**
 * Format a "YYYY-MM-DD" week_start (a Monday) as a display range through
 * that week's Sunday, e.g. "Jul 20 – Jul 26".
 */
export function formatWeekRange(weekStart: string): string {
  const [year, month, day] = weekStart.split("-").map(Number);
  const monday = new Date(year, month - 1, day);
  const sunday = new Date(year, month - 1, day + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}
