/**
 * Shared definitions for the KCPT Plan feature (member page + admin editor).
 * Field names and limits mirror supabase/functions/member-plan/index.ts.
 */

/**
 * Where the "Complete the KCPT questionnaire" button points. Single place to
 * change once Kelly supplies the real link.
 */
export const KCPT_QUESTIONNAIRE_URL = "https://forms.gle/cHUfMEJqABJfAVo7A";

export const SHORT_MAX = 200;
export const LONG_MAX = 8000;
/** The short-field character counter appears from this length. */
export const SHORT_COUNTER_FROM = 180;
/** The long-field counter turns amber above this length. */
export const LONG_WARN_FROM = 7500;

export type PlanFieldKey =
  | "name"
  | "plan_calories"
  | "plan_protein"
  | "plan_steps"
  | "plan_workouts"
  | "plan_water"
  | "goal"
  | "food"
  | "steps"
  | "water"
  | "workouts"
  | "barriers"
  | "check_in"
  | "additional_guidance";

export type PlanFields = Record<PlanFieldKey, string | null>;

export type PlanFieldDef = {
  key: PlanFieldKey;
  label: string;
  kind: "short" | "long";
};

/** Order matches the editor: Name, Goal, Your Plan (5 short), then text sections. */
export const PLAN_FIELDS: PlanFieldDef[] = [
  { key: "name", label: "Name", kind: "short" },
  { key: "goal", label: "Goal", kind: "long" },
  { key: "plan_calories", label: "Calories", kind: "short" },
  { key: "plan_protein", label: "Protein", kind: "short" },
  { key: "plan_water", label: "Water", kind: "short" },
  { key: "plan_steps", label: "Steps", kind: "short" },
  { key: "plan_workouts", label: "Workouts", kind: "short" },
  { key: "food", label: "Food", kind: "long" },
  { key: "water", label: "Water", kind: "long" },
  { key: "steps", label: "Steps", kind: "long" },
  { key: "workouts", label: "Workouts", kind: "long" },
  { key: "barriers", label: "Barriers", kind: "long" },
  { key: "check_in", label: "Check-In", kind: "long" },
  { key: "additional_guidance", label: "Additional Guidance", kind: "long" },
];

export const PLAN_FIELD_KEYS: PlanFieldKey[] = PLAN_FIELDS.map((f) => f.key);

/** Read-only member page: "Your Plan" rows, in display order. */
export const YOUR_PLAN_ROWS: { key: PlanFieldKey; label: string }[] = [
  { key: "plan_calories", label: "Calories" },
  { key: "plan_protein", label: "Protein" },
  { key: "plan_water", label: "Water" },
  { key: "plan_steps", label: "Steps" },
  { key: "plan_workouts", label: "Workouts" },
];

/** Read-only member page: text sections after "Your Plan", in display order. */
export const TEXT_SECTIONS: { key: PlanFieldKey; title: string }[] = [
  { key: "food", title: "Food" },
  { key: "water", title: "Water" },
  { key: "steps", title: "Steps" },
  { key: "workouts", title: "Workouts" },
  { key: "barriers", title: "Barriers" },
  { key: "check_in", title: "Check-In" },
  { key: "additional_guidance", title: "Additional Guidance" },
];

/** Length in Unicode code points, the same way the server counts. */
export function codePointLength(value: string): number {
  return [...value].length;
}

export function limitFor(def: PlanFieldDef): number {
  return def.kind === "short" ? SHORT_MAX : LONG_MAX;
}

/** "Steps" exists twice (Your Plan row and text section): disambiguate in messages. */
export function fieldDisplayName(def: PlanFieldDef): string {
  const isPlanRow = def.kind === "short" && def.key !== "name";
  return isPlanRow ? `${def.label} in Your Plan` : def.label;
}

/** True when a value has real content (non-null and not only whitespace). */
export function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** True when there is no plan or every content field is empty. */
export function isPlanEmpty(
  plan: Partial<Record<PlanFieldKey, string | null>> | null,
): boolean {
  if (!plan) return true;
  return PLAN_FIELD_KEYS.every((key) => !hasText(plan[key]));
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
