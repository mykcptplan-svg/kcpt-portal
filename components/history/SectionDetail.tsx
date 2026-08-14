import {
  averageCaloriesMetric,
  averageDailyMetric,
} from "@/lib/trackerStats";
import type { WeeklyBasePlan, WeeklyTrackerEntry, WeightMeasurement } from "@/types";

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

function formatCaloriesAverage(values: (number | true | null)[]): string {
  const avg = averageCaloriesMetric(values);
  if (avg == null) return "—";
  return Math.round(avg).toLocaleString();
}

function TrackerDetail({ tracker }: { tracker: WeeklyTrackerEntry | null }) {
  if (!tracker) return <EmptyState />;

  const nonNegotiables = (tracker.non_negotiables ?? [])
    .map((n) => n.trim())
    .filter((n) => n.length > 0);
  const metrics = tracker.daily_metrics;
  const workoutDays =
    metrics.workout?.filter((v) => v === true).length ?? 0;
  const wins = (tracker.wins ?? [])
    .map((n) => n.trim())
    .filter((n) => n.length > 0);
  const nextWeekFocus = (tracker.next_week_focus ?? [])
    .map((n) => n.trim())
    .filter((n) => n.length > 0);
  const hasSundayNotes = wins.length > 0 || nextWeekFocus.length > 0;

  return (
    <div>
      {nonNegotiables.length > 0 && (
        <>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">
            Non-Negotiables
          </p>
          <ul className="mb-4 flex flex-col gap-1">
            {nonNegotiables.map((name, i) => (
              <li
                key={i}
                className="text-[13px] font-semibold text-foreground"
              >
                {name}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <StatChip
          label="Avg Calories"
          value={formatCaloriesAverage(metrics.calories ?? [])}
          unit="kcal"
        />
        <StatChip
          label="Avg Protein"
          value={formatAverage(metrics.protein ?? [])}
          unit="g"
        />
        <StatChip
          label="Avg Water"
          value={formatAverage(metrics.water ?? [], 1)}
          unit="L"
        />
        <StatChip
          label="Avg Steps"
          value={formatAverage(metrics.steps ?? [])}
        />
        <StatChip label="Workout" value={`${workoutDays}/7`} unit="days" />
      </div>

      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">
        Sunday Reset
      </p>
      {hasSundayNotes ? (
        <div className="flex flex-col gap-3">
          {wins.length > 0 && (
            <div>
              <p className="mb-1 text-[12px] font-bold text-muted">Wins</p>
              <ul className="flex flex-col gap-1">
                {wins.map((item, i) => (
                  <li
                    key={`win-${i}`}
                    className="text-[12.5px] font-semibold leading-relaxed text-foreground"
                  >
                    {i + 1}. {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {nextWeekFocus.length > 0 && (
            <div>
              <p className="mb-1 text-[12px] font-bold text-muted">
                Next week focus
              </p>
              <ul className="flex flex-col gap-1">
                {nextWeekFocus.map((item, i) => (
                  <li
                    key={`focus-${i}`}
                    className="text-[12.5px] font-semibold leading-relaxed text-foreground"
                  >
                    {i + 1}. {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <p className="text-[12.5px] font-semibold text-muted">
          Not completed this week
        </p>
      )}
    </div>
  );
}

function formatMeasurementDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function MeasurementChips({ measurement }: { measurement: WeightMeasurement }) {
  const weightParts =
    measurement.weight != null
      ? stoneLbsFromTotal(measurement.weight)
      : null;

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {weightParts != null && (
        <StatChip
          label="Weight"
          value={`${weightParts.stone}st ${weightParts.lbs}`}
          unit="lbs"
        />
      )}
      {measurement.waist != null && (
        <StatChip label="Waist" value={String(measurement.waist)} unit="in" />
      )}
      {measurement.hips != null && (
        <StatChip label="Hips" value={String(measurement.hips)} unit="in" />
      )}
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

function MeasurementsDetail({
  measurement,
}: {
  measurement: WeightMeasurement[];
}) {
  if (measurement.length === 0) return <EmptyState />;

  const newestFirst = [...measurement].sort((a, b) =>
    b.measured_on.localeCompare(a.measured_on),
  );

  return (
    <div className="flex flex-col gap-4">
      {newestFirst.map((row) => (
        <div key={row.measured_on}>
          <p className="mb-2 text-[12px] font-bold text-muted">
            {formatMeasurementDate(row.measured_on)}
          </p>
          <MeasurementChips measurement={row} />
        </div>
      ))}
    </div>
  );
}

export type HistorySectionKey = "food" | "tracker" | "measurements";

type SectionDetailProps = {
  sectionKey: HistorySectionKey;
  plan: WeeklyBasePlan | null;
  tracker: WeeklyTrackerEntry | null;
  measurement: WeightMeasurement[];
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
