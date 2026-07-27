import type { WeekSummary } from "@/lib/api/history";
import type { WeeklyTrackerEntry } from "@/types";

export function countTrackerDaysLogged(
  tracker: WeeklyTrackerEntry | null,
): number {
  if (!tracker) return 0;

  const metrics = tracker.daily_metrics;
  if (!metrics) return 0;

  let count = 0;
  for (let day = 0; day < 7; day++) {
    const calorieLogged = metrics.calories?.[day] != null;
    const proteinLogged = metrics.protein?.[day] != null;
    const waterLogged = metrics.water?.[day] != null;
    const stepsLogged = metrics.steps?.[day] != null;
    const workoutLogged = metrics.workout?.[day] === true;
    if (
      calorieLogged ||
      proteinLogged ||
      waterLogged ||
      stepsLogged ||
      workoutLogged
    ) {
      count += 1;
    }
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

/** Average of the non-null entries in a 7-day metric series, or null if none are logged. */
export function averageDailyMetric(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v != null);
  if (present.length === 0) return null;
  return present.reduce((sum, v) => sum + v, 0) / present.length;
}

/** Average calories ignoring `true` (ticked-without-number) cells. */
export function averageCaloriesMetric(
  values: (number | true | null)[],
): number | null {
  const present = values.filter((v): v is number => typeof v === "number");
  if (present.length === 0) return null;
  return present.reduce((sum, v) => sum + v, 0) / present.length;
}

/** Compact glance text for large day totals (e.g. 8500 → "8.5k"). */
export function formatAbbreviated(value: number): string {
  if (value >= 1000) {
    const rounded = Math.round(value / 100) / 10;
    return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}k`;
  }
  return String(value);
}

/** Grid display for a numeric pillar cell. Water never uses k-abbreviation (litres). */
export function formatPillarCellValue(
  metric: "calories" | "protein" | "water" | "steps",
  value: number,
): string {
  if (metric === "water") return String(value);
  return formatAbbreviated(value);
}
