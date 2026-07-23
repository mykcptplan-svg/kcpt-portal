import type { WeekSummary } from "@/lib/api/history";
import type { WeeklyTrackerEntry } from "@/types";

export function countTrackerDaysLogged(
  tracker: WeeklyTrackerEntry | null,
): number {
  if (!tracker) return 0;

  const metrics = tracker.daily_metrics;
  const metricSeries: ((number | null)[] | undefined)[] = metrics
    ? [
        metrics.calories,
        metrics.protein,
        metrics.steps,
        metrics.water,
      ]
    : [];

  let count = 0;
  for (let day = 0; day < 7; day++) {
    const habitChecked = tracker.habits.some((h) => h.days[day] === true);
    const metricLogged = metricSeries.some(
      (series) => series != null && series[day] != null,
    );
    if (habitChecked || metricLogged) count += 1;
  }
  return count;
}

export function findClosestEarlierMeasuredWeek(
  weeks: WeekSummary[],
  weekStart: string,
): WeekSummary | undefined {
  return weeks.find(
    (w) => w.has_measurements && w.week_start < weekStart,
  );
}

export function countNonNegotiablesHit(
  tracker: WeeklyTrackerEntry | null,
): number {
  if (!tracker) return 0;
  return tracker.habits.reduce(
    (sum, habit) => sum + habit.days.filter(Boolean).length,
    0,
  );
}
