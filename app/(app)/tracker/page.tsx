"use client";

import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import AutosaveStatus from "@/components/AutosaveStatus";
import HeartLoader from "@/components/HeartLoader";
import PastWeekBanner from "@/components/PastWeekBanner";
import WeekToggle from "@/components/WeekToggle";
import {
  CheckIcon,
  RefreshIcon,
} from "@/components/icons";
import PillarEntrySheet, {
  type PillarEntryMetric,
} from "@/components/tracker/PillarEntrySheet";
import CoachingNotesCard from "@/components/tracker/CoachingNotesCard";
import PillarInfoButton from "@/components/tracker/PillarInfoButton";
import { getMemberFocus, saveMemberFocus } from "@/lib/api/memberFocus";
import { discardNextWeekDraft } from "@/lib/api/nextWeekDraft";
import { getWeeklyTracker, saveWeeklyTracker } from "@/lib/api/tracker";
import { useProfile } from "@/lib/context/ProfileContext";
import { ensureNextWeekDraft } from "@/lib/ensureNextWeekDraft";
import { useDebouncedSave } from "@/lib/hooks/useDebouncedSave";
import { useWeekParam } from "@/lib/hooks/useWeekParam";
import { SILVER_GOLD_CHECKIN_URL } from "@/lib/kcptPlan";
import { createClient } from "@/lib/supabase/client";
import { formatPillarCellValue, inferStepsMode, isUniformSteps } from "@/lib/trackerStats";
import { getNextWeekStart, getWeekStart } from "@/lib/week";
import type { DailyMetrics, Lifestyle } from "@/types";

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const NUMERIC_PILLAR_ROWS: {
  key: "protein" | "water";
  label: string;
}[] = [
  { key: "protein", label: "Protein (g)" },
  { key: "water", label: "Water (L)" },
];

const PILLAR_INFO = {
  calories:
    "Tracking calories? Enter your daily total. Not tracking? If you've been consistent with your food that day, simply tick the box.",
  protein:
    "Tracking protein? Enter your daily total. Not tracking? If you've been consistent with your protein intake that day, simply tick the box.",
  water: "Enter the litres of water you drank today.",
  steps:
    "Enter your total steps for each day, or switch to Weekly total and enter one total for the whole week.",
  workout: "Please tick the box if you completed a workout on this day.",
  sleep: "Enter the hours you slept the night before, in steps of half an hour. Optional.",
  alcohol: "Tick the box on days you had alcohol. No counting needed. Optional.",
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

function emptyLifestyle(): Lifestyle {
  return {
    sleep: Array(7).fill(null) as (number | null)[],
    alcohol: Array(7).fill(null) as (true | null)[],
  };
}

/** Load-path normalizer: older rows store {} so every cell defaults to null. */
function normalizeLifestyle(raw: unknown): Lifestyle {
  const out = emptyLifestyle();
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return out;
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.sleep)) {
    for (let i = 0; i < 7; i++) {
      const v = obj.sleep[i];
      if (typeof v === "number" && Number.isFinite(v)) out.sleep[i] = v;
    }
  }
  if (Array.isArray(obj.alcohol)) {
    for (let i = 0; i < 7; i++) {
      if (obj.alcohol[i] === true) out.alcohol[i] = true;
    }
  }
  return out;
}

/** Save-path: the server accepts 0 to 24 in 0.5 steps, so snap before sending. */
function sanitizeLifestyle(value: Lifestyle): Lifestyle {
  return {
    sleep: value.sleep.map((v) =>
      v == null ? null : Math.min(24, Math.max(0, Math.round(v * 2) / 2)),
    ),
    alcohol: value.alcohol,
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
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center px-6 py-10">
          <HeartLoader size={192} />
        </div>
      }
    >
      <TrackerPageInner />
    </Suspense>
  );
}

function TrackerPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const nextWeekStart = useMemo(() => getNextWeekStart(), []);
  const { weekStart, isPastWeek } = useWeekParam();
  const viewingNextWeek = weekStart === nextWeekStart;
  const { profile } = useProfile();
  const isRevoked = profile?.status === "revoked";

  // Focus This Week, read from member_focus (display only). Falls back to the
  // week's own saved habits when nothing resolves. These items are also what
  // gets written back to weekly_tracker_entries.habits (backward compatible).
  const [focusItems, setFocusItems] = useState<string[]>([]);
  const [focusSource, setFocusSource] = useState<"member" | "admin" | null>(
    null,
  );
  // Sunday Reset focus <-> member_focus, current week only:
  //  "legacy"   other weeks, or the focus call failed: plain tracker text only
  //  "edit"     member edits up to 3 points; written to member_focus on change
  //  "readonly" coach set more than 3 points; shown read-only, never written
  const [nextFocusMode, setNextFocusMode] = useState<
    "legacy" | "edit" | "readonly"
  >("legacy");
  const [nextFocusSource, setNextFocusSource] = useState<
    "member" | "admin" | null
  >(null);
  const [nextFocusReadOnlyItems, setNextFocusReadOnlyItems] = useState<
    string[]
  >([]);
  const focusModeRef = useRef<"legacy" | "edit" | "readonly">("legacy");
  // Items as first shown / last written; a PUT happens only when they differ.
  const focusBaselineRef = useRef<string[]>([]);
  const focusDirtyRef = useRef(false);
  const [dailyMetrics, setDailyMetrics] = useState<DailyMetrics>(emptyMetrics);
  const [lifestyle, setLifestyle] = useState<Lifestyle>(emptyLifestyle);
  const [wins, setWins] = useState<string[]>(["", "", ""]);
  const [nextWeekFocus, setNextWeekFocus] = useState<string[]>(["", "", ""]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [startingNextWeek, setStartingNextWeek] = useState(false);
  const [nextWeekError, setNextWeekError] = useState<string | null>(null);
  const [hasNextWeekDraft, setHasNextWeekDraft] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);
  const [stepsMode, setStepsMode] = useState<"daily" | "weekly">("daily");
  const [stepsModeConfirming, setStepsModeConfirming] = useState(false);
  const [activeCell, setActiveCell] = useState<{
    metric: PillarEntryMetric;
    dayIdx: number;
  } | null>(null);

  async function getAccessToken(): Promise<string | null> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          if (!cancelled) setLoadError("Not logged in.");
          return;
        }

        const token = session.access_token;
        const isCurrentWeek = weekStart === getWeekStart();
        // A failed focus call never blocks the tracker: it falls back to the
        // week's own habits and turns member_focus writes off.
        const [tracker, focusRes, nextFocusRes] = await Promise.all([
          getWeeklyTracker(weekStart, token),
          getMemberFocus(weekStart, token).catch(() => null),
          isCurrentWeek
            ? getMemberFocus(nextWeekStart, token).catch(() => null)
            : Promise.resolve(null),
        ]);
        if (cancelled) return;

        const habits = (tracker?.non_negotiables ?? [])
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        const resolved = focusRes?.resolved ?? null;
        setFocusItems(resolved ? resolved.items : habits);
        setFocusSource(resolved ? resolved.source : null);

        // Sunday Reset focus: start from the focus resolved for NEXT week.
        const legacyRaw = tracker?.next_week_focus ?? [];
        const legacySlots = [0, 1, 2].map((i) => legacyRaw[i] ?? "");
        const legacyItems = legacyRaw
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        focusDirtyRef.current = false;
        let mode: "legacy" | "edit" | "readonly" = "legacy";
        if (isCurrentWeek && nextFocusRes) {
          const nextResolved = nextFocusRes.resolved;
          const hasRowForNext = nextResolved?.effective_week === nextWeekStart;
          // A saved next_week_focus text is kept unless a row already exists
          // for next week, so nothing a member typed earlier is hidden.
          const fromTable = hasRowForNext || legacyItems.length === 0;
          const initial = fromTable
            ? (nextResolved?.items ?? [])
            : legacyItems;
          const readOnly = fromTable && initial.length > 3;
          mode = readOnly ? "readonly" : "edit";
          focusBaselineRef.current = initial;
          setNextFocusSource(fromTable && nextResolved ? nextResolved.source : null);
          setNextFocusReadOnlyItems(readOnly ? initial : []);
          setNextWeekFocus(
            readOnly ? legacySlots : [0, 1, 2].map((i) => initial[i] ?? ""),
          );
        } else {
          focusBaselineRef.current = [];
          setNextFocusSource(null);
          setNextFocusReadOnlyItems([]);
          setNextWeekFocus(legacySlots);
        }
        focusModeRef.current = mode;
        setNextFocusMode(mode);

        if (!tracker) {
          setDailyMetrics(emptyMetrics());
          setLifestyle(emptyLifestyle());
          setWins(["", "", ""]);
          setStepsMode("daily");
          setStepsModeConfirming(false);
          return;
        }

        const metrics = normalizeDailyMetrics(tracker.daily_metrics);
        setDailyMetrics(metrics);
        setLifestyle(normalizeLifestyle(tracker.lifestyle));
        setStepsMode(inferStepsMode(metrics.steps));
        setStepsModeConfirming(false);
        const winList = tracker.wins ?? [];
        setWins([0, 1, 2].map((i) => winList[i] ?? ""));
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
  }, [supabase, weekStart, nextWeekStart]);

  // Independent of the main tracker load above: check whether a next-week
  // draft exists at all, so the WeekToggle knows whether to render. Skipped
  // while already viewing the draft (existence is trivially true).
  useEffect(() => {
    if (isPastWeek) return;
    if (viewingNextWeek) {
      setHasNextWeekDraft(true);
      return;
    }

    let cancelled = false;

    async function checkDraft() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session || cancelled) return;
        const draftTracker = await getWeeklyTracker(
          nextWeekStart,
          session.access_token,
        );
        if (!cancelled) setHasNextWeekDraft(draftTracker !== null);
      } catch {
        // Non-critical: if this check fails, the toggle just stays hidden.
        if (!cancelled) setHasNextWeekDraft(false);
      }
    }

    void checkDraft();
    return () => {
      cancelled = true;
    };
  }, [supabase, nextWeekStart, viewingNextWeek, isPastWeek]);

  async function handleDiscardDraft() {
    const token = await getAccessToken();
    if (!token) {
      setDiscardError("Not logged in.");
      return;
    }
    setDiscarding(true);
    setDiscardError(null);
    try {
      await discardNextWeekDraft(token);
      setHasNextWeekDraft(false);
      if (viewingNextWeek) {
        router.push(pathname);
      }
    } catch (err) {
      setDiscardError(
        err instanceof Error ? err.message : "Unable to discard draft.",
      );
    } finally {
      setDiscarding(false);
    }
  }

  async function handleStartNextWeek() {
    const token = await getAccessToken();
    if (!token) {
      setNextWeekError("Not logged in.");
      return;
    }
    setStartingNextWeek(true);
    setNextWeekError(null);
    try {
      const nextWeekStart = await ensureNextWeekDraft(token);
      router.push(`/plan?week_start=${nextWeekStart}`);
    } catch (err) {
      setNextWeekError(
        err instanceof Error ? err.message : "Unable to start next week's plan.",
      );
    } finally {
      setStartingNextWeek(false);
    }
  }

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

  function setStepsWeekly(raw: string) {
    setDailyMetrics((prev) => {
      if (raw.trim() === "") {
        return {
          ...prev,
          steps: Array(7).fill(null) as (number | null)[],
        };
      }
      const n = Number(raw);
      const value = Number.isFinite(n) ? n / 7 : null;
      return {
        ...prev,
        steps: Array(7).fill(value) as (number | null)[],
      };
    });
  }

  function requestStepsWeeklyMode() {
    const steps = dailyMetrics.steps;
    const hasAny = steps.some((v) => v != null);
    if (hasAny && !isUniformSteps(steps)) {
      setStepsModeConfirming(true);
      return;
    }
    setStepsModeConfirming(false);
    setStepsMode("weekly");
    if (activeCell?.metric === "steps") {
      setActiveCell(null);
    }
  }

  function confirmStepsWeeklyMode() {
    setDailyMetrics((prev) => ({
      ...prev,
      steps: Array(7).fill(null) as (number | null)[],
    }));
    setStepsMode("weekly");
    setStepsModeConfirming(false);
    if (activeCell?.metric === "steps") {
      setActiveCell(null);
    }
  }

  function switchStepsToDaily() {
    setStepsModeConfirming(false);
    setStepsMode("daily");
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

  function markCalorieEaten(dayIdx: number) {
    setDailyMetrics((prev) => {
      const nextRow = prev.calories.slice();
      nextRow[dayIdx] = true;
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

  function setSleepCell(dayIdx: number, raw: string) {
    setLifestyle((prev) => {
      const nextRow = prev.sleep.slice();
      if (raw.trim() === "") {
        nextRow[dayIdx] = null;
      } else {
        const n = Number(raw);
        nextRow[dayIdx] = Number.isFinite(n) ? n : null;
      }
      return { ...prev, sleep: nextRow };
    });
  }

  function toggleAlcohol(dayIdx: number) {
    setLifestyle((prev) => {
      const nextRow = prev.alcohol.slice();
      nextRow[dayIdx] = nextRow[dayIdx] === true ? null : true;
      return { ...prev, alcohol: nextRow };
    });
  }

  const draft = useMemo(
    () => ({ focusItems, dailyMetrics, lifestyle, wins, nextWeekFocus }),
    [focusItems, dailyMetrics, lifestyle, wins, nextWeekFocus],
  );

  const { status, error: saveError } = useDebouncedSave(
    draft,
    async (value) => {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error("Not logged in.");
      const hasResetContent = [...value.wins, ...value.nextWeekFocus].some(
        (s) => s.trim().length > 0,
      );
      await saveWeeklyTracker(
        {
          week_start: weekStart,
          non_negotiables: value.focusItems,
          daily_metrics: value.dailyMetrics,
          lifestyle: sanitizeLifestyle(value.lifestyle),
          sunday_reset_done: hasResetContent,
          wins: value.wins,
          next_week_focus: value.nextWeekFocus,
        },
        accessToken,
      );

      // member_focus is written ONLY when the member changed the focus fields
      // and the points differ from what was first shown / last written.
      if (focusModeRef.current === "edit" && focusDirtyRef.current) {
        const items = value.nextWeekFocus
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        const baseline = focusBaselineRef.current;
        const unchanged =
          items.length === baseline.length &&
          items.every((s, i) => s === baseline[i]);
        if (!unchanged) {
          await saveMemberFocus(accessToken, {
            effective_week: nextWeekStart,
            items,
          });
          focusBaselineRef.current = items;
        }
      }
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

      {isPastWeek && <PastWeekBanner weekStart={weekStart} />}

      {hasNextWeekDraft && !isPastWeek && (
        <WeekToggle
          pathname={pathname}
          nextWeekStart={nextWeekStart}
          viewingNextWeek={viewingNextWeek}
          onDiscard={() => void handleDiscardDraft()}
          discarding={discarding}
          discardError={discardError}
        />
      )}

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
            My Focus This Week
          </h2>
        </div>
        {focusItems.length > 0 ? (
          <ol className="flex flex-col gap-2.5">
            {focusItems.map((item, i) => (
              <li
                key={i}
                className="flex items-start gap-2 rounded-[10px] border border-border bg-background px-3 py-2 text-[13.5px] font-semibold text-foreground"
              >
                <span className="w-5 shrink-0 text-[12px] font-bold text-muted">
                  {i + 1}.
                </span>
                <span className="min-w-0 [overflow-wrap:anywhere]">{item}</span>
              </li>
            ))}
          </ol>
        ) : (
          /* REVIEW COPY: empty state of the Focus card */
          <p className="text-[13px] font-medium leading-snug text-muted">
            No focus set yet. You can choose your focus for next week in the
            Sunday Reset below.
          </p>
        )}
        {focusItems.length > 0 && focusSource === "admin" && (
          /* REVIEW COPY: attribution when the coach wrote the focus */
          <p className="mt-2 text-[12px] font-semibold text-brand-orange-dark">
            Set by your coach
          </p>
        )}
        <p className="mt-2 text-[12px] font-medium leading-snug text-muted">
          These are the habits you&apos;re focusing on this week. Keep them
          simple, realistic and achievable. Small actions repeated
          consistently lead to big results.
        </p>
      </section>

      {/* Coach's shared notes: members only, renders nothing when there are none. */}
      {profile?.role === "member" && !isRevoked && <CoachingNotesCard />}

      {/* Pillars grid */}
      <section className="rounded-[20px] border border-border bg-card px-4 pt-6 pb-5 shadow-[0_12px_26px_-18px_rgba(17,17,17,0.16)]">
        <div className="mb-4 flex gap-3.5 rounded-[18px] border border-tip-border bg-tip-bg p-[18px]">
          <p className="text-[13.5px] font-semibold leading-relaxed text-foreground">
            Remember… Consistency doesn&apos;t come from perfection. It comes from
            repeating the basics, week after week. Some boxes won&apos;t get ticked
            — and that&apos;s okay. What matters is that you keep showing up 🧡
          </p>
        </div>
        <div className="grid grid-cols-[minmax(78px,1fr)_repeat(7,minmax(0,1fr))] items-center gap-x-0 gap-y-2">
          <div />
          {DAY_LABELS.map((d, i) => {
            const isActiveDay = activeCell?.dayIdx === i;
            return (
              <div
                key={`metric-day-${d}-${i}`}
                className={`text-center text-[10.5px] font-extrabold tracking-wide ${
                  isActiveDay
                    ? "rounded-md ring-1 ring-brand-orange text-brand-orange"
                    : "text-muted"
                }`}
              >
                {d}
              </div>
            );
          })}

          {/* Calories */}
          <div className="flex w-full items-center justify-between gap-1 pr-1.5 text-xs font-bold leading-tight text-foreground">
            <span>Calories (kcal)</span>
            <PillarInfoButton label="Calories" text={PILLAR_INFO.calories} />
          </div>
          {dailyMetrics.calories.map((value, dayIdx) => {
            const filled = value != null;
            const ticked = value === true;
            const isActive =
              activeCell?.metric === "calories" && activeCell.dayIdx === dayIdx;
            return (
              <div key={`calories-${dayIdx}`} className="flex justify-center">
                <button
                  type="button"
                  onClick={() =>
                    setActiveCell({ metric: "calories", dayIdx })
                  }
                  aria-label={`Calories — ${DAY_LABELS[dayIdx]}`}
                  disabled={isRevoked}
                  className={`flex h-[34px] w-full min-w-0 max-w-[68px] items-center justify-center rounded-lg text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    isRevoked ? "" : "cursor-pointer"
                  } ${
                    filled
                      ? "bg-brand-gradient text-white"
                      : "border border-foreground/25 bg-background text-muted"
                  } ${isActive ? "ring-2 ring-brand-orange ring-offset-1 ring-offset-card" : ""}`}
                >
                  {ticked ? (
                    <CheckIcon className="h-3.5 w-3.5 text-white" />
                  ) : typeof value === "number" ? (
                    formatPillarCellValue("calories", value)
                  ) : (
                    "–"
                  )}
                </button>
              </div>
            );
          })}

          {NUMERIC_PILLAR_ROWS.map(({ key, label }) => (
            <Fragment key={key}>
              <div className="flex w-full items-center justify-between gap-1 pr-1.5 text-xs font-bold leading-tight text-foreground">
                <span>{label}</span>
                <PillarInfoButton label={label} text={PILLAR_INFO[key]} />
              </div>
              {dailyMetrics[key].map((value, dayIdx) => {
                const filled = value != null;
                const isActive =
                  activeCell?.metric === key && activeCell.dayIdx === dayIdx;
                return (
                  <div key={`${key}-${dayIdx}`} className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => setActiveCell({ metric: key, dayIdx })}
                      aria-label={`${label} — ${DAY_LABELS[dayIdx]}`}
                      disabled={isRevoked}
                      className={`flex h-[34px] w-full min-w-0 max-w-[68px] items-center justify-center rounded-lg text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                        isRevoked ? "" : "cursor-pointer"
                      } ${
                        filled
                          ? "bg-brand-gradient text-white"
                          : "border border-foreground/25 bg-background text-muted"
                      } ${isActive ? "ring-2 ring-brand-orange ring-offset-1 ring-offset-card" : ""}`}
                    >
                      {typeof value === "number"
                        ? formatPillarCellValue(key, value)
                        : "–"}
                    </button>
                  </div>
                );
              })}
            </Fragment>
          ))}

          {/* Steps — daily grid or weekly total */}
          <div className="col-span-8 flex flex-col gap-1.5 pr-1.5">
            <div className="flex w-full items-center justify-between gap-1 text-xs font-bold leading-tight text-foreground">
              <span>Steps</span>
              <PillarInfoButton label="Steps" text={PILLAR_INFO.steps} />
            </div>
            {!isRevoked && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-full border border-border bg-background p-0.5">
                  <button
                    type="button"
                    onClick={switchStepsToDaily}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                      stepsMode === "daily"
                        ? "bg-brand-gradient text-white"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    Daily
                  </button>
                  <button
                    type="button"
                    onClick={requestStepsWeeklyMode}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                      stepsMode === "weekly"
                        ? "bg-brand-gradient text-white"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    Weekly total
                  </button>
                </div>
                {stepsModeConfirming && (
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                    <span className="text-muted">
                      Replace daily steps with one weekly total?
                    </span>
                    <button
                      type="button"
                      onClick={confirmStepsWeeklyMode}
                      className="text-brand-orange-dark underline decoration-dotted underline-offset-2"
                    >
                      Yes, replace
                    </button>
                    <button
                      type="button"
                      onClick={() => setStepsModeConfirming(false)}
                      className="text-muted underline decoration-dotted underline-offset-2"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          {stepsMode === "weekly" ? (
            <>
              <div aria-hidden />
              <div className="col-span-7 flex items-center gap-2">
                <label htmlFor="steps-weekly-avg" className="sr-only">
                  Total steps this week
                </label>
                <input
                  id="steps-weekly-avg"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={
                    dailyMetrics.steps[0] != null
                      ? String(Math.round(dailyMetrics.steps[0] * 7))
                      : ""
                  }
                  onChange={(e) => setStepsWeekly(e.target.value)}
                  disabled={isRevoked}
                  placeholder="e.g. 70000"
                  className="h-9 w-full max-w-[11rem] rounded-[10px] border border-border bg-background px-3 text-center text-[13.5px] font-semibold text-foreground outline-none focus:border-brand-orange disabled:cursor-not-allowed disabled:opacity-60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span className="shrink-0 text-[11px] font-semibold text-muted">
                  total steps / week
                </span>
              </div>
            </>
          ) : (
            <>
              <div aria-hidden />
              {dailyMetrics.steps.map((value, dayIdx) => {
                const filled = value != null;
                const isActive =
                  activeCell?.metric === "steps" &&
                  activeCell.dayIdx === dayIdx;
                return (
                  <div key={`steps-${dayIdx}`} className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => setActiveCell({ metric: "steps", dayIdx })}
                      aria-label={`Steps — ${DAY_LABELS[dayIdx]}`}
                      disabled={isRevoked}
                      className={`flex h-[34px] w-full min-w-0 max-w-[68px] items-center justify-center rounded-lg text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                        isRevoked ? "" : "cursor-pointer"
                      } ${
                        filled
                          ? "bg-brand-gradient text-white"
                          : "border border-foreground/25 bg-background text-muted"
                      } ${isActive ? "ring-2 ring-brand-orange ring-offset-1 ring-offset-card" : ""}`}
                    >
                      {typeof value === "number"
                        ? formatPillarCellValue("steps", value)
                        : "–"}
                    </button>
                  </div>
                );
              })}
            </>
          )}

          {/* Workout — checkboxes */}
          <div className="flex w-full items-center justify-between gap-1 pr-1.5 text-xs font-bold leading-tight text-foreground">
            <span>Workout</span>
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

          {/* Lifestyle & Recovery (optional): Sleep numbers + Alcohol ticks */}
          <div className="col-span-8 mt-3 border-t border-border pt-4">
            <h3 className="font-heading text-sm uppercase tracking-wide text-foreground">
              Lifestyle &amp; Recovery
            </h3>
          </div>

          <div className="flex w-full items-center justify-between gap-1 pr-1.5 text-xs font-bold leading-tight text-foreground">
            <span>Sleep (hours)</span>
            <PillarInfoButton label="Sleep" text={PILLAR_INFO.sleep} />
          </div>
          {lifestyle.sleep.map((value, dayIdx) => {
            const filled = value != null;
            const isActive =
              activeCell?.metric === "sleep" && activeCell.dayIdx === dayIdx;
            return (
              <div key={`sleep-${dayIdx}`} className="flex justify-center">
                <button
                  type="button"
                  onClick={() => setActiveCell({ metric: "sleep", dayIdx })}
                  aria-label={`Sleep (hours), ${DAY_LABELS[dayIdx]}`}
                  disabled={isRevoked}
                  className={`flex h-[34px] w-full min-w-0 max-w-[68px] items-center justify-center rounded-lg text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    isRevoked ? "" : "cursor-pointer"
                  } ${
                    filled
                      ? "bg-brand-gradient text-white"
                      : "border border-foreground/25 bg-background text-muted"
                  } ${isActive ? "ring-2 ring-brand-orange ring-offset-1 ring-offset-card" : ""}`}
                >
                  {typeof value === "number" ? String(value) : "–"}
                </button>
              </div>
            );
          })}

          <div className="flex w-full items-center justify-between gap-1 pr-1.5 text-xs font-bold leading-tight text-foreground">
            <span>Alcohol</span>
            <PillarInfoButton label="Alcohol" text={PILLAR_INFO.alcohol} />
          </div>
          {lifestyle.alcohol.map((value, dayIdx) => {
            const checked = value === true;
            return (
              <div key={`alcohol-${dayIdx}`} className="flex justify-center py-0.5">
                <button
                  type="button"
                  onClick={() => toggleAlcohol(dayIdx)}
                  aria-pressed={checked}
                  aria-label={`Alcohol, ${DAY_LABELS[dayIdx]}`}
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

      {activeCell && (
        <PillarEntrySheet
          metric={activeCell.metric}
          dayName={DAY_NAMES[activeCell.dayIdx]}
          value={
            activeCell.metric === "calories"
              ? dailyMetrics.calories[activeCell.dayIdx]
              : activeCell.metric === "sleep"
                ? lifestyle.sleep[activeCell.dayIdx]
                : dailyMetrics[activeCell.metric][activeCell.dayIdx]
          }
          disabled={isRevoked}
          onClose={() => setActiveCell(null)}
          onNumberChange={(raw) => {
            if (activeCell.metric === "calories") {
              setCalorieNumber(activeCell.dayIdx, raw);
            } else if (activeCell.metric === "sleep") {
              setSleepCell(activeCell.dayIdx, raw);
            } else {
              setNumericCell(activeCell.metric, activeCell.dayIdx, raw);
            }
          }}
          onMarkEatenWell={
            activeCell.metric === "calories"
              ? () => markCalorieEaten(activeCell.dayIdx)
              : undefined
          }
        />
      )}

      {/* Sunday Reset */}
      <section className="rounded-[20px] border border-border bg-card p-5 shadow-[0_12px_26px_-18px_rgba(17,17,17,0.16)]">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white">
            <RefreshIcon className="h-4 w-4" />
          </span>
          <h2 className="font-heading text-base uppercase tracking-wide text-foreground">
            Sunday Reset
          </h2>
        </div>

        <div className="mb-5">
          <p className="mb-2 text-[13.5px] font-bold leading-snug text-foreground">
            🧡 What went well this week?
          </p>
          <p className="mb-3 text-[12.5px] font-semibold leading-relaxed text-muted">
            Take a moment to celebrate your wins, no matter how small. We
            don&apos;t fix what isn&apos;t broke! If something worked well this
            week, keep doing it. Consistency beats constantly changing the plan.
          </p>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">
            Your wins:
          </p>
          <div className="flex flex-col gap-2">
            {wins.map((win, i) => (
              <div key={`win-${i}`} className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-[12px] font-bold text-muted">
                  {i + 1}.
                </span>
                <input
                  type="text"
                  value={win}
                  onChange={(e) => {
                    const next = wins.slice();
                    next[i] = e.target.value;
                    setWins(next);
                  }}
                  placeholder={
                    i === 0
                      ? "e.g. Hit my water goal every day"
                      : "Optional"
                  }
                  maxLength={80}
                  disabled={isRevoked}
                  className="w-full rounded-[10px] border border-border bg-background px-3 py-2 text-[13.5px] text-foreground outline-none focus:border-brand-orange disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <p className="mb-2 text-[13.5px] font-bold leading-snug text-foreground">
            💪 What is my focus for next week?
          </p>
          <p className="mb-3 text-[12.5px] font-semibold leading-relaxed text-muted">
            Think about what went well this week and what you&apos;d like to
            improve. Choose up to 3 things to focus on next week. Keep them
            simple, realistic and within your control.
          </p>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">
            My focus for next week
          </p>
          {nextFocusMode === "readonly" ? (
            <div>
              <ol className="flex flex-col gap-2">
                {nextFocusReadOnlyItems.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 rounded-[10px] border border-border bg-background px-3 py-2 text-[13.5px] font-semibold text-foreground"
                  >
                    <span className="w-5 shrink-0 text-[12px] font-bold text-muted">
                      {i + 1}.
                    </span>
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                      {item}
                    </span>
                  </li>
                ))}
              </ol>
              {/* REVIEW COPY: read-only note when the coach set more than 3 points */}
              <p className="mt-2 text-[12px] font-semibold text-brand-orange-dark">
                Your coach set this focus, so it can&apos;t be changed here.
              </p>
            </div>
          ) : (
          <div className="flex flex-col gap-2">
            {nextWeekFocus.map((item, i) => (
              <div key={`focus-${i}`} className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-[12px] font-bold text-muted">
                  {i + 1}.
                </span>
                <input
                  type="text"
                  value={item}
                  onChange={(e) => {
                    const next = nextWeekFocus.slice();
                    next[i] = e.target.value;
                    focusDirtyRef.current = true;
                    setNextWeekFocus(next);
                  }}
                  placeholder={
                    i === 0 ? "e.g. Prep lunches on Sunday" : "Optional"
                  }
                  maxLength={120}
                  disabled={isRevoked}
                  className="w-full rounded-[10px] border border-border bg-background px-3 py-2 text-[13.5px] text-foreground outline-none focus:border-brand-orange disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
            ))}
          </div>
          )}
          {nextFocusMode === "edit" && nextFocusSource === "admin" && (
            /* REVIEW COPY: note when the starting focus was set by the coach */
            <p className="mt-2 text-[12px] font-semibold text-brand-orange-dark">
              Set by your coach. You can change it here.
            </p>
          )}
        </div>

        {!isPastWeek && (
        <div className="mb-4">
          {hasNextWeekDraft ? (
            <Link
              href={`${pathname}?week_start=${nextWeekStart}`}
              className="flex w-full items-center justify-center rounded-[14px] bg-brand-gradient px-5 py-3.5 transition-transform hover:-translate-y-0.5"
            >
              <span className="font-heading text-[13px] uppercase tracking-wide text-white">
                Continue Next Week&apos;s Draft
              </span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => void handleStartNextWeek()}
              disabled={isRevoked || startingNextWeek}
              className="w-full cursor-pointer rounded-[14px] bg-brand-gradient px-5 py-3.5 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
            >
              <span className="font-heading text-[13px] uppercase tracking-wide text-white">
                {startingNextWeek
                  ? "Starting…"
                  : "Start Next Week's Plan"}
              </span>
            </button>
          )}
          <p className="mt-2 text-center text-[12px] font-medium leading-snug text-muted">
            This opens next week&apos;s Food Plan and Tracker together, not just
            the Tracker.
          </p>
          {nextWeekError && (
            <p className="mt-2 text-xs text-brand-orange-dark">{nextWeekError}</p>
          )}
        </div>
        )}

        {/* External check-in form. Secondary (outline) so START NEXT WEEK'S
            PLAN stays the primary action; never tied to the form's state.
            Hidden when editing a past week and for revoked members. */}
        {!isPastWeek && !isRevoked && (
          <a
            href={SILVER_GOLD_CHECKIN_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-4 flex w-full items-center justify-center rounded-[14px] border-[1.5px] border-border bg-card px-5 py-3.5 transition-transform hover:-translate-y-0.5"
          >
            <span className="font-heading text-[13px] uppercase tracking-wide text-foreground">
              Submit my Silver/Gold check-in
            </span>
          </a>
        )}

        <p className="mt-4 text-[12px] font-medium leading-snug text-muted">
          Your progress is saved automatically. Every Monday your Success Tracker
          starts fresh for a new week. You can view all of your previous weeks at
          any time in your History.
        </p>
      </section>

      {(loadError || saveError) && (
        <p className="text-xs text-brand-orange-dark">{loadError ?? saveError}</p>
      )}

      <div className="rounded-2xl bg-brand-gradient px-[18px] py-[14px] text-center">
        <span className="font-heading text-[15px] uppercase tracking-wide text-white">
          Consistency Beats Perfection
        </span>
      </div>
    </div>
  );
}
