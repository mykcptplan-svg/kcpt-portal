import type { WeeklyBasePlan } from "@/types";

const REQUIRED = { breakfasts: 2, lunches: 2, trigger_snacks: 2, desserts: 1 };
const TOTAL =
  REQUIRED.breakfasts +
  REQUIRED.lunches +
  REQUIRED.trigger_snacks +
  REQUIRED.desserts +
  7; // 14

export function countMealSlotsFilled(
  plan: WeeklyBasePlan | null,
): { filled: number; total: number } {
  if (!plan) return { filled: 0, total: TOTAL };
  const filled =
    Math.min(plan.breakfasts.length, REQUIRED.breakfasts) +
    Math.min(plan.lunches.length, REQUIRED.lunches) +
    Math.min(plan.trigger_snacks.length, REQUIRED.trigger_snacks) +
    Math.min(plan.desserts.length, REQUIRED.desserts) +
    Math.min(plan.evening_meals.length, 7);
  return { filled, total: TOTAL };
}
