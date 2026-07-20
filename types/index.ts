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

/** One habit; `days` is length 7: Mon…Sun completion flags */
export type HabitDayStatus = {
  name: string;
  days: boolean[]; // 7 elements: Monday through Sunday
};

export type WeeklyTrackerEntry = {
  user_id: string;
  week_start: string;
  habits: HabitDayStatus[];
  sunday_reset_done: boolean;
};

export type WeightMeasurement = {
  user_id: string;
  week_start: string;
  weight: number;
  waist: number;
  hips: number;
  chest: number;
};
