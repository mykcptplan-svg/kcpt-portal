"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import AutosaveStatus from "@/components/AutosaveStatus";
import HeartLoader from "@/components/HeartLoader";
import {
  ArrowRightIcon,
  CheckIcon,
  ClipboardCheckIcon,
  RefreshIcon,
  RulerIcon,
} from "@/components/icons";
import { getWeeklyTracker, saveWeeklyTracker } from "@/lib/api/tracker";
import { useDebouncedSave } from "@/lib/hooks/useDebouncedSave";
import { createClient } from "@/lib/supabase/client";
import { getWeekStart } from "@/lib/week";
import type { DailyMetrics } from "@/types";

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

const METRIC_ROWS: {
  key: keyof DailyMetrics;
  label: string;
}[] = [
  { key: "calories", label: "Calories (kcal)" },
  { key: "protein", label: "Protein (g)" },
  { key: "steps", label: "Steps" },
  { key: "water", label: "Water (oz)" },
];

function emptyChecks(): boolean[][] {
  return Array.from({ length: 3 }, () => Array(7).fill(false) as boolean[]);
}

function emptyMetrics(): DailyMetrics {
  return {
    calories: Array(7).fill(null) as (number | null)[],
    protein: Array(7).fill(null) as (number | null)[],
    steps: Array(7).fill(null) as (number | null)[],
    water: Array(7).fill(null) as (number | null)[],
  };
}

function normalizeDailyMetrics(raw: unknown): DailyMetrics {
  const fallback = emptyMetrics();
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return fallback;
  }
  const obj = raw as Record<string, unknown>;
  for (const { key } of METRIC_ROWS) {
    const arr = obj[key];
    if (!Array.isArray(arr) || arr.length !== 7) return fallback;
  }
  return {
    calories: (obj.calories as (number | null)[]).slice(0, 7),
    protein: (obj.protein as (number | null)[]).slice(0, 7),
    steps: (obj.steps as (number | null)[]).slice(0, 7),
    water: (obj.water as (number | null)[]).slice(0, 7),
  };
}

export default function TrackerPage() {
  const supabase = useMemo(() => createClient(), []);
  const weekStart = useMemo(() => getWeekStart(), []);

  const [habitNames, setHabitNames] = useState<string[]>(["", "", ""]);
  const [checks, setChecks] = useState<boolean[][]>(emptyChecks);
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

        const habits = tracker.habits.slice(0, 3);
        setHabitNames([0, 1, 2].map((i) => habits[i]?.name ?? ""));
        setChecks(
          [0, 1, 2].map(
            (i) => habits[i]?.days?.slice() ?? (Array(7).fill(false) as boolean[]),
          ),
        );
        setDailyMetrics(normalizeDailyMetrics(tracker.daily_metrics));
        if (tracker.sunday_reset_done) {
          // Text isn't persisted (no backing column) — the boolean flag is
          // the only signal we get back, so surface it as a placeholder.
          setWentWell((current) => current || "Reset completed for this week.");
        }
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

  function toggleCell(rowIdx: number, colIdx: number) {
    setChecks((prev) => {
      const next = prev.map((row) => row.slice());
      next[rowIdx][colIdx] = !next[rowIdx][colIdx];
      return next;
    });
  }

  function setMetricCell(
    key: keyof DailyMetrics,
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

  const draft = useMemo(
    () => ({ checks, habitNames, dailyMetrics, wentWell, adjustNext }),
    [checks, habitNames, dailyMetrics, wentWell, adjustNext],
  );

  const { status, error: saveError } = useDebouncedSave(
    draft,
    async (value) => {
      const accessToken = accessTokenRef.current;
      if (!accessToken) throw new Error("Not logged in.");
      await saveWeeklyTracker(
        {
          week_start: weekStart,
          habits: value.habitNames.map((name, i) => ({
            name,
            days: value.checks[i],
          })),
          daily_metrics: value.dailyMetrics,
          sunday_reset_done: Boolean(value.wentWell.trim() || value.adjustNext.trim()),
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
          {habitNames.map((name, i) => (
            <input
              key={i}
              type="text"
              value={name}
              onChange={(e) => {
                const next = habitNames.slice();
                next[i] = e.target.value;
                setHabitNames(next);
              }}
              placeholder={`Non-negotiable ${i + 1}`}
              maxLength={40}
              className="w-full rounded-[10px] border border-border bg-background px-3 py-2 text-[13.5px] text-foreground outline-none focus:border-brand-orange"
            />
          ))}
        </div>
      </section>

      {/* Daily Numbers */}
      <section className="rounded-[20px] border border-border bg-card px-4 py-5 shadow-[0_12px_26px_-18px_rgba(17,17,17,0.16)]">
        <div className="mb-4 flex items-center gap-3 px-1">
          <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white">
            <RulerIcon className="h-4 w-4" />
          </span>
          <h2 className="font-heading text-base uppercase tracking-wide text-foreground">
            Daily Numbers
          </h2>
        </div>

        <div className="grid grid-cols-[minmax(100px,1.4fr)_repeat(7,minmax(0,1fr))] items-center gap-x-0.5 gap-y-1.5">
          <div />
          {DAY_LABELS.map((d, i) => (
            <div
              key={`metric-day-${d}-${i}`}
              className="text-center text-[10.5px] font-extrabold tracking-wide text-muted"
            >
              {d}
            </div>
          ))}

          {METRIC_ROWS.map(({ key, label }) => (
            <Fragment key={key}>
              <div className="pr-1.5 text-xs font-bold leading-tight text-foreground">
                {label}
              </div>
              {dailyMetrics[key].map((value, dayIdx) => (
                <div key={`${key}-${dayIdx}`} className="flex justify-center">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={value ?? ""}
                    onChange={(e) => setMetricCell(key, dayIdx, e.target.value)}
                    aria-label={`${label} — ${DAY_LABELS[dayIdx]}`}
                    className="h-[28px] w-full min-w-0 max-w-[44px] rounded-lg border border-border bg-background px-0.5 text-center text-[11px] text-foreground outline-none focus:border-brand-orange [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                </div>
              ))}
            </Fragment>
          ))}
        </div>
      </section>

      {/* Check-in grid */}
      <section className="rounded-[20px] border border-border bg-card px-4 py-5 shadow-[0_12px_26px_-18px_rgba(17,17,17,0.16)]">
        <div className="mb-4 flex items-center gap-3 px-1">
          <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white">
            <ClipboardCheckIcon className="h-4 w-4" />
          </span>
          <h2 className="font-heading text-base uppercase tracking-wide text-foreground">
            This Week&apos;s Check-In
          </h2>
        </div>

        <div className="grid grid-cols-[minmax(88px,1.3fr)_repeat(7,minmax(0,1fr))] items-center gap-x-0.5 gap-y-1">
          <div />
          {DAY_LABELS.map((d, i) => (
            <div
              key={`${d}-${i}`}
              className="text-center text-[10.5px] font-extrabold tracking-wide text-muted"
            >
              {d}
            </div>
          ))}

          {habitNames.map((label, rowIdx) => {
            const displayLabel = label.trim() || "Not set yet";
            return (
              <Fragment key={rowIdx}>
                <div className="line-clamp-2 overflow-hidden pr-1.5 text-xs font-bold leading-tight text-foreground">
                  {label.trim() || (
                    <span className="italic text-muted">Not set yet</span>
                  )}
                </div>
                {checks[rowIdx].map((checked, colIdx) => (
                  <div
                    key={`${rowIdx}-${colIdx}`}
                    className="flex justify-center py-0.5"
                  >
                    <button
                      type="button"
                      onClick={() => toggleCell(rowIdx, colIdx)}
                      aria-pressed={checked}
                      aria-label={`${displayLabel} — ${DAY_LABELS[colIdx]}`}
                      className={`flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-lg transition-colors ${
                        checked ? "bg-brand-gradient" : "border border-border bg-background"
                      }`}
                    >
                      {checked && <CheckIcon className="h-2.5 w-2.5 text-white" />}
                    </button>
                  </div>
                ))}
              </Fragment>
            );
          })}
        </div>
      </section>

      {/* Sunday reset */}
      <section className="rounded-[20px] border border-border bg-card p-5 shadow-[0_12px_26px_-18px_rgba(17,17,17,0.16)]">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white">
            <RefreshIcon className="h-4 w-4" />
          </span>
          <h2 className="font-heading text-base uppercase tracking-wide text-foreground">
            Sunday Reset
          </h2>
        </div>

        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">
          What went well this week?
        </p>
        <textarea
          value={wentWell}
          onChange={(e) => setWentWell(e.target.value)}
          placeholder="e.g. Hit my water goal every day"
          rows={2}
          className="w-full resize-none rounded-[10px] border border-border bg-background px-[13px] py-3 text-[13.5px] text-foreground outline-none focus:border-brand-orange"
        />

        <p className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-wide text-muted">
          What will you adjust next week?
        </p>
        <textarea
          value={adjustNext}
          onChange={(e) => setAdjustNext(e.target.value)}
          placeholder="e.g. Prep lunches on Sunday"
          rows={2}
          className="w-full resize-none rounded-[10px] border border-border bg-background px-[13px] py-3 text-[13.5px] text-foreground outline-none focus:border-brand-orange"
        />
      </section>

      {(loadError || saveError) && (
        <p className="text-xs text-brand-orange-dark">{loadError ?? saveError}</p>
      )}

      <div className="flex items-center gap-3.5 rounded-[18px] border border-tip-border bg-gradient-to-r from-[rgba(247,162,53,0.08)] to-[rgba(236,74,49,0.05)] p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white">
          <RefreshIcon className="h-4 w-4" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-bold text-foreground">Sunday Reset</p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            Continue your full reset in the coaching app
          </p>
        </div>
        <span className="flex items-center gap-1 whitespace-nowrap text-xs font-bold text-brand-orange-dark">
          Open <ArrowRightIcon className="h-3.5 w-3.5" />
        </span>
      </div>

      <div className="rounded-2xl bg-brand-gradient px-[18px] py-[14px] text-center">
        <span className="font-heading text-[15px] uppercase tracking-wide text-white">
          Consistency Beats Perfection
        </span>
      </div>
    </div>
  );
}
