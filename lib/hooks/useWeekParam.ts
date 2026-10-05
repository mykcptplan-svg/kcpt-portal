import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  getNextWeekStart,
  getWeekStart,
  isPastWeekStart,
  parseWeekStartParam,
} from "@/lib/week";

/**
 * Resolves the week shown by Tracker, Food Plan and Evening Meals from
 * `?week_start=`. Invalid values and any week after next week silently fall
 * back to the current week. Must be used under a Suspense boundary.
 */
export function useWeekParam(): { weekStart: string; isPastWeek: boolean } {
  const searchParams = useSearchParams();
  return useMemo(() => {
    const parsed = parseWeekStartParam(searchParams.get("week_start"));
    const weekStart =
      parsed && parsed <= getNextWeekStart() ? parsed : getWeekStart();
    return { weekStart, isPastWeek: isPastWeekStart(weekStart) };
  }, [searchParams]);
}
