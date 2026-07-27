"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import AutosaveStatus from "@/components/AutosaveStatus";
import HeartLoader from "@/components/HeartLoader";
import {
  ArrowRightIcon,
  CheckIcon,
  RefreshIcon,
} from "@/components/icons";
import PillarInfoButton from "@/components/tracker/PillarInfoButton";
import { getWeeklyTracker, saveWeeklyTracker } from "@/lib/api/tracker";
import { useProfile } from "@/lib/context/ProfileContext";
import { useDebouncedSave } from "@/lib/hooks/useDebouncedSave";
import { createClient } from "@/lib/supabase/client";
import { getWeekStart } from "@/lib/week";
import type { DailyMetrics } from "@/types";

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

const HABIT_PLACEHOLDERS = [
  "In bed by 11pm",
  "No alcohol weekdays",
  "10k steps",
] as const;

const NUMERIC_PILLAR_ROWS: {
  key: "protein" | "water" | "steps";
  label: string;
  step?: string;
}[] = [
  { key: "protein", label: "Protein (g)" },
  { key: "water", label: "Water (L)", step: "0.1" },
  { key: "steps", label: "Steps" },
];

const PILLAR_INFO = {
  calories:
    "Tracking calories? Enter your daily total. Not tracking? If you've been consistent with your food that day, simply tick the box.",
  protein:
    "Tracking protein? Enter your daily total. Not tracking? If you've been consistent with your protein intake that day, simply tick the box.",
  water: "Enter the litres of water you drank today.",
  steps: "Enter your total steps for the day.",
  workout: "Please tick the box if you completed a workout on this day.",
} as const;

function emptyMetrics(): DailyMetrics {
  return {
    calories: Array(7).fill(null) as (number | true | null)[],
    protein: Array(7).fill(null) as (number | null)[],
    water: Array(7).fill(null) as (number | null)[],
    steps: Array(7).fill(null) as (number | null)[],
    workout: Array(7).fill(null) as (boolean | null)[],
  };
}

function normalizeSeries7(
  raw: unknown,
  parseCell: (cell: unknown) => number | true | boolean | null,
): (number | true | boolean | null)[] {
  if (!Array.isArray(raw) || raw.length !== 7) {
    return Array(7).fill(null);
  }
  return raw.slice(0, 7).map(parseCell);
}

/**
 * Load-path normalizer: always returns all 5 pillar keys (length 7).
 * Accepts calories as null | true | number; missing workout defaults to null×7.
 * Does not fall back to empty solely because calories contains `true`.
 */
function normalizeDailyMetrics(raw: unknown): DailyMetrics {
  const fallback = emptyMetrics();
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return fallback;
  }
  const obj = raw as Record<string, unknown>;

  const calories = normalizeSeries7(obj.calories, (cell) => {
    if (cell === null || cell === undefined) return null;
    if (cell === true) return true;
    if (typeof cell === "number" && Number.isFinite(cell)) return cell;
    return null;
  }) as (number | true | null)[];

  const parseNumber = (cell: unknown): number | null => {
    if (cell === null || cell === undefined) return null;
    if (typeof cell === "number" && Number.isFinite(cell)) return cell;
    return null;
  };

  const protein = normalizeSeries7(obj.protein, parseNumber) as (number | null)[];
  const water = normalizeSeries7(obj.water, parseNumber) as (number | null)[];
  const steps = normalizeSeries7(obj.steps, parseNumber) as (number | null)[];
  const workout = normalizeSeries7(obj.workout, (cell) => {
    if (cell === null || cell === undefined) return null;
    if (typeof cell === "boolean") return cell;
    return null;
  }) as (boolean | null)[];

  return { calories, protein, water, steps, workout };
}

export default function TrackerPage() {
  const supabase = useMemo(() => createClient(), []);
  const weekStart = useMemo(() => getWeekStart(), []);
  const { profile } = useProfile();
  const isRevoked = profile?.status === "revoked";

  const [nonNegotiables, setNonNegotiables] = useState<string[]>(["", "", ""]);
  const [dailyMetrics, setDailyMetrics] = useState<DailyMetrics>(emptyMetrics);
  const [wentWell, setWentWell] = useState("");
  const [adjustNext, setAdjustNext] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const accessTokenRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          if (!cancelled) setLoadError("Not logged in.");
          return;
        }
        accessTokenRef.current = session.access_token;

        const tracker = await getWeeklyTracker(weekStart, session.access_token);
        if (cancelled || !tracker) return;

        const names = tracker.non_negotiables ?? [];
        setNonNegotiables([0, 1, 2].map((i) => names[i] ?? ""));
        setDailyMetrics(normalizeDailyMetrics(tracker.daily_metrics));
        setWentWell(tracker.went_well ?? "");
        setAdjustNext(tracker.adjust_next ?? "");
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Unable to load tracker.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [supabase, weekStart]);

  function setNumericCell(
    key: "protein" | "water" | "steps",
    dayIdx: number,
    raw: string,
  ) {
    setDailyMetrics((prev) => {
      const nextRow = prev[key].slice();
      if (raw.trim() === "") {
        nextRow[dayIdx] = null;
      } else {
        const n = Number(raw);
        nextRow[dayIdx] = Number.isFinite(n) ? n : null;
      }
      return { ...prev, [key]: nextRow };
    });
  }

  function setCalorieNumber(dayIdx: number, raw: string) {
    setDailyMetrics((prev) => {
      const nextRow = prev.calories.slice();
      if (raw.trim() === "") {
        nextRow[dayIdx] = null;
      } else {
        const n = Number(raw);
        nextRow[dayIdx] = Number.isFinite(n) ? n : null;
      }
      return { ...prev, calories: nextRow };
    });
  }

  function toggleCalorieTick(dayIdx: number) {
    setDailyMetrics((prev) => {
      const nextRow = prev.calories.slice();
      nextRow[dayIdx] = nextRow[dayIdx] === true ? null : true;
      return { ...prev, calories: nextRow };
    });
  }

  function toggleWorkout(dayIdx: number) {
    setDailyMetrics((prev) => {
      const nextRow = prev.workout.slice();
      nextRow[dayIdx] = nextRow[dayIdx] === true ? null : true;
      return { ...prev, workout: nextRow };
    });
  }

  const draft = useMemo(
    () => ({ nonNegotiables, dailyMetrics, wentWell, adjustNext }),
    [nonNegotiables, dailyMetrics, wentWell, adjustNext],
  );

  const { status, error: saveError } = useDebouncedSave(
    draft,
    async (value) => {
      const accessToken = accessTokenRef.current;
      if (!accessToken) throw new Error("Not logged in.");
      await saveWeeklyTracker(
        {
          week_start: weekStart,
          non_negotiables: value.nonNegotiables,
          daily_metrics: value.dailyMetrics,
          sunday_reset_done: Boolean(
            value.wentWell.trim() || value.adjustNext.trim(),
          ),
          went_well: value.wentWell.trim() || null,
          adjust_next: value.adjustNext.trim() || null,
        },
        accessToken,
      );
    },
    { skip: loading },
  );

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <HeartLoader size={192} />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 px-5 py-6 md:mx-auto md:w-full md:max-w-3xl md:px-10 md:py-10">
      <div>
        <h1 className="font-heading text-[32px] uppercase leading-none tracking-wide text-foreground">
          My Success Tracker
        </h1>
        <p className="mt-0.5 font-script text-xl font-bold text-brand-orange-dark">
          Small wins. Big results.
        </p>
      </div>

      {isRevoked && (
        <div
          className="rounded-lg border px-4 py-3 text-[14px] leading-snug"
          style={{
            background: "var(--tip-bg)",
            borderColor: "var(--brand-orange-dark)",
            color: "var(--brand-orange-dark)",
          }}
          role="status"
        >
          Your access has been paused. Please contact your coach for more
          information.
        </div>
      )}

      <AutosaveStatus status={status} />

      {/* Non-negotiables */}
      <section className="rounded-[20px] border border-border bg-card p-5 shadow-[0_12px_26px_-18px_rgba(17,17,17,0.16)]">
        <div className="mb-3.5 flex items-center gap-3">
          <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white">
            <CheckIcon className="h-3.5 w-3.5" />
          </span>
          <h2 className="font-heading text-base uppercase tracking-wide text-foreground">
            My Non-Negotiables
          </h2>
        </div>
        <div className="flex flex-col gap-2.5">
          {nonNegotiables.map((name, i) => (
            <input
              key={i}
              type="text"
              value={name}
              onChange={(e) => {
                const next = nonNegotiables.slice();
                next[i] = e.target.value;
                setNonNegotiables(next);
              }}
              placeholder={HABIT_PLACEHOLDERS[i]}
              maxLength={40}
              disabled={isRevoked}
              className="w-full rounded-[10px] border border-border bg-background px-3 py-2 text-[13.5px] text-foreground outline-none focus:border-brand-orange disabled:cursor-not-allowed disabled:opacity-60"
            />
          ))}
        </div>
        <p className="mt-2 text-[12px] font-medium leading-snug text-muted">
          These are your own personal non-negotiables. Choose three habits
          you&apos;ll commit to this week.
        </p>
      </section>

      {/* Pillars grid */}
      <section className="rounded-[20px] border border-border bg-card px-4 pt-6 pb-5 shadow-[0_12px_26px_-18px_rgba(17,17,17,0.16)]">
        <div className="grid grid-cols-[minmax(100px,1.4fr)_repeat(7,minmax(0,1fr))] items-center gap-x-0.5 gap-y-2">
          <div />
          {DAY_LABELS.map((d, i) => (
            <div
              key={`metric-day-${d}-${i}`}
              className="text-center text-[10.5px] font-extrabold tracking-wide text-muted"
            >
              {d}
            </div>
          ))}

          {/* Calories — hybrid number | tick (single-height cell) */}
          <div className="flex items-center gap-1 pr-1.5 text-xs font-bold leading-tight text-foreground">
            Calories (kcal)
            <PillarInfoButton label="Calories" text={PILLAR_INFO.calories} />
          </div>
          {dailyMetrics.calories.map((value, dayIdx) => {
            const ticked = value === true;
            const hasNumber = typeof value === "number";
            return (
              <div
                key={`calories-${dayIdx}`}
                className="flex justify-center"
              >
                {ticked ? (
                  <button
                    type="button"
                    onClick={() => toggleCalorieTick(dayIdx)}
                    aria-pressed
                    aria-label={`Calories tick — ${DAY_LABELS[dayIdx]}`}
                    disabled={isRevoked}
                    className={`flex h-[34px] w-full min-w-0 max-w-[68px] items-center justify-center rounded-lg bg-brand-gradient transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      isRevoked ? "" : "cursor-pointer"
                    }`}
                  >
                    <CheckIcon className="h-3.5 w-3.5 text-white" />
                  </button>
                ) : (
                  <div className="relative h-[34px] w-full min-w-0 max-w-[68px]">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      value={hasNumber ? value : ""}
                      onChange={(e) => setCalorieNumber(dayIdx, e.target.value)}
                      aria-label={`Calories — ${DAY_LABELS[dayIdx]}`}
                      disabled={isRevoked}
                      className={`h-full w-full rounded-lg pl-5 pr-1 text-center text-[11px] outline-none disabled:cursor-not-allowed disabled:opacity-60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
                        hasNumber
                          ? "border border-transparent bg-brand-gradient text-white focus:ring-1 focus:ring-white/40"
                          : "border border-foreground/25 bg-background text-foreground focus:border-brand-orange"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => toggleCalorieTick(dayIdx)}
                      aria-pressed={false}
                      aria-label={`Calories tick — ${DAY_LABELS[dayIdx]}`}
                      disabled={isRevoked}
                      className={`absolute inset-y-0 left-0 flex w-[22px] items-center justify-center rounded-l-lg transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                        isRevoked ? "" : "cursor-pointer"
                      }`}
                    >
                      <span
                        className={`h-2.5 w-2.5 rounded-full border ${
                          hasNumber ? "border-white" : "border-muted"
                        }`}
                        aria-hidden
                      />
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {NUMERIC_PILLAR_ROWS.map(({ key, label, step }) => (
            <Fragment key={key}>
              <div className="flex items-center gap-1 pr-1.5 text-xs font-bold leading-tight text-foreground">
                {label}
                <PillarInfoButton label={label} text={PILLAR_INFO[key]} />
              </div>
              {dailyMetrics[key].map((value, dayIdx) => (
                <div key={`${key}-${dayIdx}`} className="flex justify-center">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={step}
                    value={value ?? ""}
                    onChange={(e) => setNumericCell(key, dayIdx, e.target.value)}
                    aria-label={`${label} — ${DAY_LABELS[dayIdx]}`}
                    disabled={isRevoked}
                    className="h-[34px] w-full min-w-0 max-w-[48px] rounded-lg border border-foreground/25 bg-background px-1 text-center text-[11px] text-foreground outline-none focus:border-brand-orange disabled:cursor-not-allowed disabled:opacity-60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                </div>
              ))}
            </Fragment>
          ))}

          {/* Workout — checkboxes */}
          <div className="flex items-center gap-1 pr-1.5 text-xs font-bold leading-tight text-foreground">
            Workout
            <PillarInfoButton label="Workout" text={PILLAR_INFO.workout} />
          </div>
          {dailyMetrics.workout.map((value, dayIdx) => {
            const checked = value === true;
            return (
              <div key={`workout-${dayIdx}`} className="flex justify-center py-0.5">
                <button
                  type="button"
                  onClick={() => toggleWorkout(dayIdx)}
                  aria-pressed={checked}
                  aria-label={`Workout — ${DAY_LABELS[dayIdx]}`}
                  disabled={isRevoked}
                  className={`flex h-[34px] w-full min-w-0 max-w-[48px] items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    isRevoked ? "" : "cursor-pointer"
                  } ${
                    checked
                      ? "bg-brand-gradient"
                      : "border border-foreground/25 bg-background"
                  }`}
                >
                  {checked && <CheckIcon className="h-3.5 w-3.5 text-white" />}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* End of Week Reflection */}
      <section className="rounded-[20px] border border-border bg-card p-5 shadow-[0_12px_26px_-18px_rgba(17,17,17,0.16)]">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white">
            <RefreshIcon className="h-4 w-4" />
          </span>
          <h2 className="font-heading text-base uppercase tracking-wide text-foreground">
            End of Week Reflection
          </h2>
        </div>

        <p className="mb-4 text-[13.5px] font-semibold leading-relaxed text-foreground">
          Reflect. Reset. Plan. Complete your Sunday Reset in the KCPT App, build
          your new Food Plan and get ready for another successful week.
        </p>

        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">
          What went well this week?
        </p>
        <textarea
          value={wentWell}
          onChange={(e) => setWentWell(e.target.value)}
          placeholder="e.g. Hit my water goal every day"
          rows={2}
          disabled={isRevoked}
          className="w-full resize-none rounded-[10px] border border-border bg-background px-[13px] py-3 text-[13.5px] text-foreground outline-none focus:border-brand-orange disabled:cursor-not-allowed disabled:opacity-60"
        />

        <p className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-wide text-muted">
          What will you adjust next week?
        </p>
        <textarea
          value={adjustNext}
          onChange={(e) => setAdjustNext(e.target.value)}
          placeholder="e.g. Prep lunches on Sunday"
          rows={2}
          disabled={isRevoked}
          className="w-full resize-none rounded-[10px] border border-border bg-background px-[13px] py-3 text-[13.5px] text-foreground outline-none focus:border-brand-orange disabled:cursor-not-allowed disabled:opacity-60"
        />
      </section>

      <div className="flex gap-3.5 rounded-[18px] border border-tip-border bg-tip-bg p-[18px]">
        <p className="text-[13.5px] font-semibold leading-relaxed text-foreground">
          Remember… Consistency doesn&apos;t come from perfection. It comes from
          repeating the basics, week after week. Some boxes won&apos;t get ticked
          and that&apos;s okay! Just keep showing up. 🧡
        </p>
      </div>

      {(loadError || saveError) && (
        <p className="text-xs text-brand-orange-dark">{loadError ?? saveError}</p>
      )}

      <a
        href="https://forms.gle/vW1VFdMaXgaGcUUy5"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3.5 rounded-[18px] border border-tip-border bg-gradient-to-r from-[rgba(247,162,53,0.08)] to-[rgba(236,74,49,0.05)] p-4 transition-colors hover:border-brand-orange/40"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white">
          <RefreshIcon className="h-4 w-4" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-bold text-foreground">Sunday Reset</p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            Want to go deeper? Complete the full Sunday Reset in your coaching
            app (optional).
          </p>
        </div>
        <span className="flex items-center gap-1 whitespace-nowrap text-xs font-bold text-brand-orange-dark">
          Open <ArrowRightIcon className="h-3.5 w-3.5" />
        </span>
      </a>

      <div className="rounded-2xl bg-brand-gradient px-[18px] py-[14px] text-center">
        <span className="font-heading text-[15px] uppercase tracking-wide text-white">
          Consistency Beats Perfection
        </span>
      </div>
    </div>
  );
}
