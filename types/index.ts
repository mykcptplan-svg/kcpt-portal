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

/** Lifestyle & Recovery; each array is length 7: Mon…Sun (null = unset) */
export type Lifestyle = {
  /** Hours slept, 0 to 24 in 0.5 steps */
  sleep: (number | null)[];
  /** true = had alcohol */
  alcohol: (true | null)[];
};

export type WeeklyTrackerEntry = {
  user_id: string;
  week_start: string;
  /** Focus This Week snapshot: 0 to 5 points (older rows: 3 slots, some blank) */
  non_negotiables: string[];
  daily_metrics: DailyMetrics;
  sunday_reset_done: boolean;
  /** Length 3 — Sunday Reset wins */
  wins: string[];
  /** Length 3 — Sunday Reset next-week focus (reflective; not linked to non_negotiables) */
  next_week_focus: string[];
  /** Optional on write (omitted = leave stored value). GET always returns it. */
  lifestyle?: Lifestyle;
};

/** One dated Focus This Week row. Focus for week W = greatest effective_week <= W. */
export type MemberFocus = {
  user_id: string;
  /** Monday (YYYY-MM-DD) the focus starts applying */
  effective_week: string;
  /** 0 to 5 trimmed strings, 1 to 120 characters each (members write at most 3) */
  items: string[];
  /** Who wrote it: derived by the server from the caller's role */
  source: "member" | "admin";
  updated_at: string;
  updated_by: string;
};

export type MemberFocusResponse = {
  /** Row in force for the requested week, or null */
  resolved: MemberFocus | null;
  /** 8 most recent rows, newest effective_week first */
  history: MemberFocus[];
};

export type WeightMeasurement = {
  user_id: string;
  week_start: string;
  measured_on: string;
  weight: number | null;
  waist: number | null;
  hips: number | null;
  arm: number | null;
  thigh: number | null;
  calve: number | null;
};
