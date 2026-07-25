import { Fragment } from "react";
import { CheckIcon } from "@/components/icons";
import { averageDailyMetric } from "@/lib/trackerStats";
import type { WeeklyBasePlan, WeeklyTrackerEntry, WeightMeasurement } from "@/types";

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

const APPROACH_LABELS: Record<string, string> = {
  orange_base: "Orange Base",
  meal_bank: "KCPT Meal Bank",
  own: "My Own Meal",
};

function EmptyState() {
  return (
    <p className="py-3 text-center text-[13px] font-semibold text-muted">
      Not filled in this week
    </p>
  );
}

function StatChip({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="rounded-[14px] border border-border bg-background px-[13px] py-3">
      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className="text-[16px] font-bold text-foreground">
        {value}
        {unit && (
          <span className="ml-1 text-[12px] font-semibold text-muted">
            {unit}
          </span>
        )}
      </p>
    </div>
  );
}

function formatAverage(values: (number | null)[], decimals = 0): string {
  const avg = averageDailyMetric(values);
  if (avg == null) return "—";
  return decimals > 0 ? avg.toFixed(decimals) : Math.round(avg).toLocaleString();
}

function stoneLbsFromTotal(totalLbs: number): { stone: number; lbs: number } {
  const stone = Math.floor(totalLbs / 14);
  const lbs = Math.round((totalLbs - stone * 14) * 100) / 100;
  return { stone, lbs };
}

function FoodPlanDetail({ plan }: { plan: WeeklyBasePlan | null }) {
  if (!plan) return <EmptyState />;

  const groups = [
    { label: "Breakfasts", items: plan.breakfasts },
    { label: "Lunches", items: plan.lunches },
    { label: "Trigger Snacks", items: plan.trigger_snacks },
    { label: "Desserts", items: plan.desserts },
  ].filter((g) => g.items.length > 0);

  const eveningMeals = plan.evening_meals.filter(
    (e) => e.meal.trim().length > 0,
  );

  if (groups.length === 0 && eveningMeals.length === 0) return <EmptyState />;

  return (
    <div>
      <div className="mb-3.5 flex items-center gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted">
          Approach
        </p>
        <span className="rounded-full bg-badge-bg px-2.5 py-1 text-[11.5px] font-bold text-badge-text">
          {APPROACH_LABELS[plan.nutrition_approach] ?? plan.nutrition_approach}
        </span>
      </div>

      <div className="flex flex-col gap-3.5">
        {groups.map((grp) => (
          <div key={grp.label}>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">
              {grp.label}
            </p>
            <div className="flex flex-col gap-1">
              {grp.items.map((item, i) => (
                <p
                  key={i}
                  className="text-[13px] font-semibold text-foreground"
                >
                  {item}
                </p>
              ))}
            </div>
          </div>
        ))}

        {eveningMeals.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">
              Evening Meals
            </p>
            <div className="flex flex-col gap-1.5">
              {eveningMeals.map((e) => (
                <p
                  key={e.day}
                  className="text-[13px] font-semibold text-foreground"
                >
                  <span className="text-muted">{e.day}:</span> {e.meal}{" "}
                  <span className="text-[11px] font-bold text-badge-text">
                    · {APPROACH_LABELS[e.approach] ?? e.approach}
                  </span>
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TrackerDetail({ tracker }: { tracker: WeeklyTrackerEntry | null }) {
  if (!tracker) return <EmptyState />;

  const habitRows = tracker.habits.filter(
    (h) => h.name.trim().length > 0 || h.days.some(Boolean),
  );
  const metrics = tracker.daily_metrics;
  const wentWell = tracker.went_well?.trim();
  const adjustNext = tracker.adjust_next?.trim();
  const hasSundayNotes = Boolean(wentWell || adjustNext);

  return (
    <div>
      {habitRows.length > 0 && (
        <>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">
            Non-Negotiables
          </p>
          <div className="mb-4 grid grid-cols-[minmax(76px,1.3fr)_repeat(7,minmax(0,1fr))] items-center gap-x-0.5 gap-y-1">
            <div />
            {DAY_LABELS.map((d, i) => (
              <div
                key={`day-${i}`}
                className="text-center text-[9.5px] font-extrabold tracking-wide text-muted"
              >
                {d}
              </div>
            ))}
            {habitRows.map((habit, rowIdx) => (
              <Fragment key={rowIdx}>
                <div className="line-clamp-2 overflow-hidden pr-1.5 text-[11px] font-bold leading-tight text-foreground">
                  {habit.name.trim() || "Not set"}
                </div>
                {habit.days.map((checked, dayIdx) => (
                  <div
                    key={dayIdx}
                    className="flex justify-center py-0.5"
                  >
                    <div
                      className={`flex h-[18px] w-[18px] items-center justify-center rounded-md ${
                        checked
                          ? "bg-brand-gradient"
                          : "border border-border bg-background"
                      }`}
                    >
                      {checked && (
                        <CheckIcon className="h-2 w-2 text-white" />
                      )}
                    </div>
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
        </>
      )}

      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatChip
          label="Avg Calories"
          value={formatAverage(metrics.calories)}
          unit="kcal"
        />
        <StatChip
          label="Avg Protein"
          value={formatAverage(metrics.protein)}
          unit="g"
        />
        <StatChip label="Avg Steps" value={formatAverage(metrics.steps)} />
        <StatChip
          label="Avg Water"
          value={formatAverage(metrics.water, 1)}
          unit="L"
        />
      </div>

      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">
        Sunday Reset
      </p>
      {hasSundayNotes ? (
        <div className="flex flex-col gap-2">
          <p className="text-[12.5px] font-semibold leading-relaxed text-foreground">
            <span className="font-bold text-muted">Went well: </span>
            {wentWell || "Not noted"}
          </p>
          <p className="text-[12.5px] font-semibold leading-relaxed text-foreground">
            <span className="font-bold text-muted">Adjusting: </span>
            {adjustNext || "Not noted"}
          </p>
        </div>
      ) : (
        <p className="text-[12.5px] font-semibold text-muted">
          Not completed this week
        </p>
      )}
    </div>
  );
}

function MeasurementsDetail({
  measurement,
}: {
  measurement: WeightMeasurement | null;
}) {
  if (!measurement) return <EmptyState />;

  const { stone, lbs } = stoneLbsFromTotal(measurement.weight);

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      <StatChip label="Weight" value={`${stone}st ${lbs}`} unit="lbs" />
      <StatChip label="Waist" value={String(measurement.waist)} unit="in" />
      <StatChip label="Hips" value={String(measurement.hips)} unit="in" />
      <StatChip label="Chest" value={String(measurement.chest)} unit="in" />
      {measurement.arm != null && (
        <StatChip label="Arm" value={String(measurement.arm)} unit="in" />
      )}
      {measurement.thigh != null && (
        <StatChip label="Thigh" value={String(measurement.thigh)} unit="in" />
      )}
      {measurement.calve != null && (
        <StatChip label="Calve" value={String(measurement.calve)} unit="in" />
      )}
    </div>
  );
}

export type HistorySectionKey = "food" | "tracker" | "measurements";

type SectionDetailProps = {
  sectionKey: HistorySectionKey;
  plan: WeeklyBasePlan | null;
  tracker: WeeklyTrackerEntry | null;
  measurement: WeightMeasurement | null;
};

export default function SectionDetail({
  sectionKey,
  plan,
  tracker,
  measurement,
}: SectionDetailProps) {
  if (sectionKey === "food") return <FoodPlanDetail plan={plan} />;
  if (sectionKey === "tracker") return <TrackerDetail tracker={tracker} />;
  return <MeasurementsDetail measurement={measurement} />;
}
