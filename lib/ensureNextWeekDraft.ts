/**
 * Create-if-missing Food Plan + Tracker rows for next calendar week.
 * Never overwrites an existing draft (GET then PUT only when null).
 */
import { getWeeklyBasePlan, saveWeeklyBasePlan } from "@/lib/api/basePlan";
import { getWeeklyTracker, saveWeeklyTracker } from "@/lib/api/tracker";
import { getNextWeekStart } from "@/lib/week";
import type { DailyMetrics } from "@/types";

function emptyDailyMetrics(): DailyMetrics {
  return {
    calories: Array(7).fill(null) as (number | true | null)[],
    protein: Array(7).fill(null) as (number | null)[],
    water: Array(7).fill(null) as (number | null)[],
    steps: Array(7).fill(null) as (number | null)[],
    workout: Array(7).fill(null) as (boolean | null)[],
  };
}

export async function ensureNextWeekDraft(
  accessToken: string,
): Promise<string> {
  const nextWeekStart = getNextWeekStart();

  const existingPlan = await getWeeklyBasePlan(nextWeekStart, accessToken);
  if (!existingPlan) {
    await saveWeeklyBasePlan(
      {
        week_start: nextWeekStart,
        nutrition_approach: "orange_base",
        breakfasts: [],
        lunches: [],
        trigger_snacks: [],
        desserts: [],
        evening_meals: [],
      },
      accessToken,
    );
  }

  const existingTracker = await getWeeklyTracker(nextWeekStart, accessToken);
  if (!existingTracker) {
    await saveWeeklyTracker(
      {
        week_start: nextWeekStart,
        non_negotiables: ["", "", ""],
        daily_metrics: emptyDailyMetrics(),
        sunday_reset_done: false,
        wins: ["", "", ""],
        next_week_focus: ["", "", ""],
      },
      accessToken,
    );
  }

  return nextWeekStart;
}
