export type Profile = {
  id: string;
  full_name: string;
  role: "member" | "coach" | "admin";
  status: "active" | "revoked";
};

/** One evening meal entry for a single day of the week */
export type EveningMealEntry = {
  day: string;
  meal: string;
  approach: "meal_bank" | "orange_base" | "own";
};

export type WeeklyBasePlan = {
  user_id: string;
  week_start: string;
  nutrition_approach: string;
  breakfasts: string[];
  lunches: string[];
  trigger_snacks: string[];
  desserts: string[];
  evening_meals: EveningMealEntry[];
};

/** Daily pillars; each array is length 7: Mon…Sun (null = unset) */
export type DailyMetrics = {
  calories: (number | true | null)[];
  protein: (number | null)[];
  water: (number | null)[];
  steps: (number | null)[];
  workout: (boolean | null)[];
};

export type WeeklyTrackerEntry = {
  user_id: string;
  week_start: string;
  non_negotiables: string[];
  daily_metrics: DailyMetrics;
  sunday_reset_done: boolean;
  /** Length 3 — Sunday Reset wins */
  wins: string[];
  /** Length 3 — Sunday Reset next-week focus (reflective; not linked to non_negotiables) */
  next_week_focus: string[];
};

export type WeightMeasurement = {
  user_id: string;
  week_start: string;
  weight: number | null;
  waist: number | null;
  hips: number | null;
  arm: number | null;
  thigh: number | null;
  calve: number | null;
};
