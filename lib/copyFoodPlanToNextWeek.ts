/**
 * Copy actions from the current week's Food Plan into next week's
 * weekly_base_plans row. Uses GET + PUT via weekly-base-plan only —
 * never touches weekly_tracker_entries or ensureNextWeekDraft.
 */
import { getWeeklyBasePlan, saveWeeklyBasePlan } from "@/lib/api/basePlan";
import { getNextWeekStart } from "@/lib/week";
import type { EveningMealEntry, WeeklyBasePlan } from "@/types";
import type { EveningApproach } from "@/types/plan";

export type MealSectionKey =
  | "breakfasts"
  | "lunches"
  | "trigger_snacks"
  | "desserts";

export const MEAL_SECTION_LIMITS: Record<MealSectionKey, number> = {
  breakfasts: 3,
  lunches: 3,
  trigger_snacks: 3,
  desserts: 2,
};

const SECTION_SINGULAR_LABEL: Record<MealSectionKey, string> = {
  breakfasts: "breakfast",
  lunches: "lunch",
  trigger_snacks: "trigger time snack",
  desserts: "dessert",
};

export class MealListFullError extends Error {
  readonly section: MealSectionKey;
  readonly maxItems: number;

  constructor(section: MealSectionKey) {
    const maxItems = MEAL_SECTION_LIMITS[section];
    const label = SECTION_SINGULAR_LABEL[section];
    super(
      `Next week already has ${maxItems} ${label}${maxItems === 1 ? "" : "s"}. Remove one there first.`,
    );
    this.name = "MealListFullError";
    this.section = section;
    this.maxItems = maxItems;
  }
}

type PlanPayload = Omit<WeeklyBasePlan, "user_id">;

function emptyPlanDefaults(weekStart: string): PlanPayload {
  return {
    week_start: weekStart,
    nutrition_approach: "orange_base",
    breakfasts: [],
    lunches: [],
    trigger_snacks: [],
    desserts: [],
    evening_meals: [],
  };
}

function listHasContent(items: string[]): boolean {
  return items.some((item) => item.trim().length > 0);
}

/** True when the plan has no member-entered food content (ignores nutrition_approach alone). */
export function isFoodPlanEmpty(plan: WeeklyBasePlan | null): boolean {
  if (!plan) return true;
  if (listHasContent(plan.breakfasts)) return false;
  if (listHasContent(plan.lunches)) return false;
  if (listHasContent(plan.trigger_snacks)) return false;
  if (listHasContent(plan.desserts)) return false;
  if (plan.evening_meals.length > 0) return false;
  return true;
}

/** True when next week already has a saved evening meal for this weekday. */
export function hasEveningMealForDay(
  plan: WeeklyBasePlan | null,
  day: string,
): boolean {
  if (!plan) return false;
  return plan.evening_meals.some((e) => e.day === day);
}

async function loadNextWeekPlan(
  accessToken: string,
): Promise<{ nextWeekStart: string; plan: PlanPayload }> {
  const nextWeekStart = getNextWeekStart();
  const existing = await getWeeklyBasePlan(nextWeekStart, accessToken);
  return {
    nextWeekStart,
    plan: existing
      ? {
          week_start: existing.week_start,
          nutrition_approach: existing.nutrition_approach,
          breakfasts: existing.breakfasts,
          lunches: existing.lunches,
          trigger_snacks: existing.trigger_snacks,
          desserts: existing.desserts,
          evening_meals: existing.evening_meals,
        }
      : emptyPlanDefaults(nextWeekStart),
  };
}

export type WholePlanSource = {
  nutrition_approach: string;
  breakfasts: string[];
  lunches: string[];
  trigger_snacks: string[];
  desserts: string[];
  evening_meals: EveningMealEntry[];
};

/** Overwrites next week's full Food Plan row with the supplied source fields. */
export async function copyWholePlanToNextWeek(
  source: WholePlanSource,
  accessToken: string,
): Promise<string> {
  const { nextWeekStart } = await loadNextWeekPlan(accessToken);

  await saveWeeklyBasePlan(
    {
      week_start: nextWeekStart,
      nutrition_approach: source.nutrition_approach,
      breakfasts: source.breakfasts.map((v) => v.trim()).filter(Boolean),
      lunches: source.lunches.map((v) => v.trim()).filter(Boolean),
      trigger_snacks: source.trigger_snacks.map((v) => v.trim()).filter(Boolean),
      desserts: source.desserts.map((v) => v.trim()).filter(Boolean),
      evening_meals: source.evening_meals,
    },
    accessToken,
  );

  return nextWeekStart;
}

export type EveningDaySource = {
  meal: string;
  approach: EveningApproach;
};

/** Copies one weekday's evening meal into the same weekday on next week. */
export async function copyEveningMealDayToNextWeek(
  day: string,
  source: EveningDaySource,
  accessToken: string,
): Promise<string> {
  const { nextWeekStart, plan } = await loadNextWeekPlan(accessToken);

  const meal = source.meal.trim();
  const approach = source.approach ?? "own";

  const withoutDay = plan.evening_meals.filter((e) => e.day !== day);
  const evening_meals =
    meal.length > 0 || source.approach !== null
      ? [...withoutDay, { day, meal, approach }]
      : withoutDay;

  await saveWeeklyBasePlan(
    {
      ...plan,
      week_start: nextWeekStart,
      evening_meals,
    },
    accessToken,
  );

  return nextWeekStart;
}

/** Appends one list item to the matching section on next week's plan. */
export async function appendMealItemToNextWeek(
  section: MealSectionKey,
  item: string,
  accessToken: string,
): Promise<string> {
  const trimmed = item.trim();
  if (!trimmed) {
    throw new Error("Nothing to copy.");
  }

  const maxItems = MEAL_SECTION_LIMITS[section];
  const { nextWeekStart, plan } = await loadNextWeekPlan(accessToken);
  const currentList = plan[section];

  if (currentList.length >= maxItems) {
    throw new MealListFullError(section);
  }

  await saveWeeklyBasePlan(
    {
      ...plan,
      week_start: nextWeekStart,
      [section]: [...currentList, trimmed],
    },
    accessToken,
  );

  return nextWeekStart;
}
