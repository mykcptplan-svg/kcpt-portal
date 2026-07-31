"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import DayAccordion from "@/components/evening-meals/DayAccordion";
import AutosaveStatus from "@/components/AutosaveStatus";
import HeartLoader from "@/components/HeartLoader";
import WeekToggle from "@/components/WeekToggle";
import { BulbIcon, UtensilsIcon } from "@/components/icons";
import { getWeeklyBasePlan, saveWeeklyBasePlan } from "@/lib/api/basePlan";
import { discardNextWeekDraft } from "@/lib/api/nextWeekDraft";
import { useDebouncedSave } from "@/lib/hooks/useDebouncedSave";
import { createClient } from "@/lib/supabase/client";
import {
  getNextWeekStart,
  getWeekStart,
  parseWeekStartParam,
} from "@/lib/week";
import type { EveningApproach } from "@/types/plan";

const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

type DayEntry = { meal: string; approach: EveningApproach };

function emptyEntries(): DayEntry[] {
  return DAY_NAMES.map(() => ({ meal: "", approach: null }));
}

const DEFAULT_PRESERVED = {
  nutrition_approach: "orange_base",
  breakfasts: [] as string[],
  lunches: [] as string[],
  trigger_snacks: [] as string[],
  desserts: [] as string[],
};

// Preserved verbatim from whatever My Food Plan last saved — this page only
// owns evening_meals and must never clobber the rest of the row.
type PreservedFields = {
  nutrition_approach: string;
  breakfasts: string[];
  lunches: string[];
  trigger_snacks: string[];
  desserts: string[];
};

export default function EveningMealsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center px-6 py-10">
          <HeartLoader size={192} />
        </div>
      }
    >
      <EveningMealsPageInner />
    </Suspense>
  );
}

function EveningMealsPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const nextWeekStart = useMemo(() => getNextWeekStart(), []);
  const weekStart = useMemo(
    () => parseWeekStartParam(searchParams.get("week_start")) ?? getWeekStart(),
    [searchParams],
  );
  const viewingNextWeek = weekStart === nextWeekStart;

  const [entries, setEntries] = useState<DayEntry[]>(emptyEntries);
  const [expandedIndex, setExpandedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasNextWeekDraft, setHasNextWeekDraft] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);

  const accessTokenRef = useRef<string | null>(null);
  const preservedRef = useRef<PreservedFields>({ ...DEFAULT_PRESERVED });

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
        accessTokenRef.current = session.access_token;

        const plan = await getWeeklyBasePlan(weekStart, session.access_token);
        if (cancelled) return;

        if (!plan) {
          preservedRef.current = { ...DEFAULT_PRESERVED };
          setEntries(emptyEntries());
          return;
        }

        preservedRef.current = {
          nutrition_approach: plan.nutrition_approach,
          breakfasts: plan.breakfasts,
          lunches: plan.lunches,
          trigger_snacks: plan.trigger_snacks,
          desserts: plan.desserts,
        };

        const byDay = new Map(plan.evening_meals.map((e) => [e.day, e]));
        setEntries(
          DAY_NAMES.map((day) => {
            const existing = byDay.get(day);
            return existing
              ? { meal: existing.meal, approach: existing.approach }
              : { meal: "", approach: null };
          }),
        );
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Unable to load plan.");
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

  // Same draft-existence check as Plan (evening meals live on weekly_base_plans).
  useEffect(() => {
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
        const draftPlan = await getWeeklyBasePlan(
          nextWeekStart,
          session.access_token,
        );
        if (!cancelled) setHasNextWeekDraft(draftPlan !== null);
      } catch {
        if (!cancelled) setHasNextWeekDraft(false);
      }
    }

    void checkDraft();
    return () => {
      cancelled = true;
    };
  }, [supabase, nextWeekStart, viewingNextWeek]);

  async function handleDiscardDraft() {
    const token = accessTokenRef.current;
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

  function updateEntry(index: number, patch: Partial<DayEntry>) {
    setEntries((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  const { status, error: saveError } = useDebouncedSave(
    entries,
    async (value) => {
      const accessToken = accessTokenRef.current;
      if (!accessToken) throw new Error("Not logged in.");

      const evening_meals = DAY_NAMES.map((day, i) => ({
        day,
        meal: value[i].meal.trim(),
        approach: value[i].approach,
      }))
        .filter((e) => e.meal.length > 0 || e.approach !== null)
        .map((e) => ({ ...e, approach: e.approach ?? "own" }));

      await saveWeeklyBasePlan(
        {
          week_start: weekStart,
          ...preservedRef.current,
          evening_meals,
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
      <div className="flex items-center gap-3.5">
        <span className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white">
          <UtensilsIcon className="h-5 w-5" />
        </span>
        <div>
          <h1 className="font-heading text-[32px] uppercase leading-none tracking-wide text-foreground">
            Evening Meals
          </h1>
          <p className="font-script text-xl font-bold text-brand-orange-dark">
            Plan your week. Stay in control.
          </p>
        </div>
      </div>

      {hasNextWeekDraft && (
        <WeekToggle
          pathname={pathname}
          nextWeekStart={nextWeekStart}
          viewingNextWeek={viewingNextWeek}
          onDiscard={() => void handleDiscardDraft()}
          discarding={discarding}
          discardError={discardError}
        />
      )}

      <p className="text-[13px] font-medium leading-relaxed text-muted">
        Tap to log your evening meals and how you&apos;ll approach them this
        week. Everything saves automatically.
      </p>

      <AutosaveStatus status={status} />

      <div className="flex flex-col gap-2.5">
        {DAY_NAMES.map((day, index) => (
          <DayAccordion
            key={day}
            day={day}
            meal={entries[index].meal}
            approach={entries[index].approach}
            expanded={expandedIndex === index}
            onToggle={() =>
              setExpandedIndex((current) => (current === index ? -1 : index))
            }
            onMealChange={(value) => updateEntry(index, { meal: value })}
            onSelectApproach={(value) => updateEntry(index, { approach: value })}
          />
        ))}
      </div>

      {(loadError || saveError) && (
        <p className="text-xs text-brand-orange-dark">{loadError ?? saveError}</p>
      )}

      <div className="flex gap-3.5 rounded-[18px] border border-tip-border bg-tip-bg p-[18px]">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white">
          <BulbIcon className="h-4 w-4" />
        </span>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-tip-text">
            Remember...
          </p>
          <div className="mt-1.5 flex flex-col gap-1.5">
            <p className="text-[13.5px] font-semibold leading-relaxed text-foreground">
              • One meal doesn&apos;t make or break your progress.
            </p>
            <p className="text-[13.5px] font-semibold leading-relaxed text-foreground">
              • Plans change, and that&apos;s normal — just come back to it.
            </p>
            <p className="text-[13.5px] font-semibold leading-relaxed text-foreground">
              • Aim for consistency, not perfection.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-brand-gradient px-[18px] py-[14px] text-center">
        <span className="font-heading text-[15px] uppercase tracking-wide text-white">
          Consistency Beats Perfection
        </span>
      </div>
    </div>
  );
}
