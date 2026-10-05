/**
 * Member History list: every Monday from the start of the member's history
 * up to the current week, merged with the weeks returned by list-weeks.
 * Used only by the member History page (Coach Review keeps the raw API list).
 */
import type { WeekSummary } from "@/lib/api/history";
import { getWeekStart, listWeekStarts } from "@/lib/week";

export function buildMemberWeeksList(
  apiWeeks: WeekSummary[],
  createdAt: string | null,
): WeekSummary[] {
  const currentWeek = getWeekStart();

  let createdWeek: string | null = null;
  if (createdAt) {
    const d = new Date(createdAt);
    if (!Number.isNaN(d.getTime())) createdWeek = getWeekStart(d);
  }

  const oldestApi = apiWeeks.reduce<string | null>(
    (min, w) => (min === null || w.week_start < min ? w.week_start : min),
    null,
  );

  const candidates = [createdWeek, oldestApi].filter(
    (v): v is string => v !== null,
  );
  const start = candidates.length
    ? candidates.reduce((a, b) => (a < b ? a : b))
    : currentWeek;

  const byWeek = new Map<string, WeekSummary>();
  for (const w of apiWeeks) byWeek.set(w.week_start, w);

  for (const ws of listWeekStarts(start, currentWeek)) {
    if (!byWeek.has(ws)) {
      byWeek.set(ws, {
        week_start: ws,
        has_base_plan: false,
        has_tracker: false,
        has_measurements: false,
      });
    }
  }

  return Array.from(byWeek.values()).sort((a, b) =>
    a.week_start < b.week_start ? 1 : a.week_start > b.week_start ? -1 : 0,
  );
}
