"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import MealSectionCard from "@/components/plan/MealSectionCard";
import AutosaveStatus from "@/components/AutosaveStatus";
import HeartLoader from "@/components/HeartLoader";
import WeekToggle from "@/components/WeekToggle";
import {
  ArrowRightIcon,
  BreakfastIcon,
  BulbIcon,
  DessertIcon,
  LunchIcon,
  TriggerSnackIcon,
  UtensilsIcon,
} from "@/components/icons";
import { getWeeklyBasePlan, saveWeeklyBasePlan } from "@/lib/api/basePlan";
import { discardNextWeekDraft } from "@/lib/api/nextWeekDraft";
import {
  appendMealItemToNextWeek,
  copyWholePlanToNextWeek,
  isFoodPlanEmpty,
  type MealSectionKey,
  MealListFullError,
} from "@/lib/copyFoodPlanToNextWeek";
import { useProfile } from "@/lib/context/ProfileContext";
import { useDebouncedSave } from "@/lib/hooks/useDebouncedSave";
import { createClient } from "@/lib/supabase/client";
import { getNextWeekStart, getWeekStart, parseWeekStartParam } from "@/lib/week";
import type { EveningMealEntry } from "@/types";
import type { NutritionApproach } from "@/types/plan";

export default function PlanPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center px-6 py-10">
          <HeartLoader size={192} />
        </div>
      }
    >
      <PlanPageInner />
    </Suspense>
  );
}

function PlanPageInner() {
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
  const { profile } = useProfile();
  const isRevoked = profile?.status === "revoked";

  const [nutritionApproach, setNutritionApproach] =
    useState<NutritionApproach>("orange_base");
  const [breakfasts, setBreakfasts] = useState(["", ""]);
  const [lunches, setLunches] = useState(["", ""]);
  const [triggerSnacks, setTriggerSnacks] = useState(["", ""]);
  const [desserts, setDesserts] = useState([""]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasNextWeekDraft, setHasNextWeekDraft] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);
  const [copyWholeConfirming, setCopyWholeConfirming] = useState(false);
  const [copyingWhole, setCopyingWhole] = useState(false);
  const [copyingItem, setCopyingItem] = useState<{
    section: MealSectionKey;
    index: number;
  } | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  // Evening Meals owns this field; we only round-trip it so autosaving the
  // rest of the plan never clobbers it.
  const eveningMealsRef = useRef<EveningMealEntry[]>([]);

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

        const plan = await getWeeklyBasePlan(weekStart, session.access_token);
        if (cancelled) return;

        if (!plan) {
          setNutritionApproach("orange_base");
          setBreakfasts(["", ""]);
          setLunches(["", ""]);
          setTriggerSnacks(["", ""]);
          setDesserts([""]);
          eveningMealsRef.current = [];
          return;
        }

        if (
          plan.nutrition_approach === "orange_base" ||
          plan.nutrition_approach === "meal_bank"
        ) {
          setNutritionApproach(plan.nutrition_approach);
        } else {
          setNutritionApproach("orange_base");
        }
        setBreakfasts(plan.breakfasts.length ? plan.breakfasts : ["", ""]);
        setLunches(plan.lunches.length ? plan.lunches : ["", ""]);
        setTriggerSnacks(
          plan.trigger_snacks.length ? plan.trigger_snacks : ["", ""],
        );
        setDesserts(plan.desserts.length ? plan.desserts : [""]);
        eveningMealsRef.current = plan.evening_meals ?? [];
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

  // Independent of the main plan load above: check whether a next-week draft
  // exists at all, so the WeekToggle knows whether to render. Skipped while
  // already viewing the draft (existence is trivially true — you navigated
  // here via the toggle or "Start Next Week's Plan").
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
        // Non-critical: if this check fails, the toggle just stays hidden.
        if (!cancelled) setHasNextWeekDraft(false);
      }
    }

    void checkDraft();
    return () => {
      cancelled = true;
    };
  }, [supabase, nextWeekStart, viewingNextWeek]);

  async function handleDiscardDraft() {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      setDiscardError("Not logged in.");
      return;
    }
    setDiscarding(true);
    setDiscardError(null);
    try {
      await discardNextWeekDraft(accessToken);
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

  const draft = useMemo(
    () => ({ nutritionApproach, breakfasts, lunches, triggerSnacks, desserts }),
    [nutritionApproach, breakfasts, lunches, triggerSnacks, desserts],
  );

  const { status, error: saveError } = useDebouncedSave(
    draft,
    async (value) => {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error("Not logged in.");
      await saveWeeklyBasePlan(
        {
          week_start: weekStart,
          nutrition_approach: value.nutritionApproach,
          breakfasts: value.breakfasts.filter((v) => v.trim().length > 0),
          lunches: value.lunches.filter((v) => v.trim().length > 0),
          trigger_snacks: value.triggerSnacks.filter((v) => v.trim().length > 0),
          desserts: value.desserts.filter((v) => v.trim().length > 0),
          evening_meals: eveningMealsRef.current,
        },
        accessToken,
      );
    },
    { skip: loading },
  );

  const showCopyActions = !viewingNextWeek && !isRevoked;

  async function executeCopyWhole(accessToken: string) {
    setCopyingWhole(true);
    setCopyError(null);
    setCopyMessage(null);
    try {
      await copyWholePlanToNextWeek(
        {
          nutrition_approach: nutritionApproach,
          breakfasts: breakfasts.filter((v) => v.trim().length > 0),
          lunches: lunches.filter((v) => v.trim().length > 0),
          trigger_snacks: triggerSnacks.filter((v) => v.trim().length > 0),
          desserts: desserts.filter((v) => v.trim().length > 0),
          evening_meals: eveningMealsRef.current,
        },
        accessToken,
      );
      setHasNextWeekDraft(true);
      setCopyWholeConfirming(false);
      setCopyMessage("Copied to next week.");
    } catch (err) {
      setCopyError(
        err instanceof Error ? err.message : "Unable to copy to next week.",
      );
    } finally {
      setCopyingWhole(false);
    }
  }

  async function handleCopyWholeClick() {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      setCopyError("Not logged in.");
      return;
    }
    setCopyError(null);
    setCopyMessage(null);
    try {
      const nextPlan = await getWeeklyBasePlan(nextWeekStart, accessToken);
      if (!isFoodPlanEmpty(nextPlan)) {
        setCopyWholeConfirming(true);
        return;
      }
      await executeCopyWhole(accessToken);
    } catch (err) {
      setCopyError(
        err instanceof Error ? err.message : "Unable to copy to next week.",
      );
    }
  }

  async function handleCopyWholeConfirm() {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      setCopyError("Not logged in.");
      return;
    }
    await executeCopyWhole(accessToken);
  }

  async function handleCopyItem(section: MealSectionKey, index: number) {
    const lists: Record<MealSectionKey, string[]> = {
      breakfasts,
      lunches,
      trigger_snacks: triggerSnacks,
      desserts,
    };
    const item = lists[section][index]?.trim();
    if (!item) return;

    const accessToken = await getAccessToken();
    if (!accessToken) {
      setCopyError("Not logged in.");
      return;
    }

    setCopyingItem({ section, index });
    setCopyError(null);
    setCopyMessage(null);
    try {
      await appendMealItemToNextWeek(section, item, accessToken);
      setHasNextWeekDraft(true);
      setCopyMessage("Copied to next week.");
    } catch (err) {
      setCopyError(
        err instanceof MealListFullError || err instanceof Error
          ? err.message
          : "Unable to copy to next week.",
      );
    } finally {
      setCopyingItem(null);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <HeartLoader size={192} />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 px-5 py-6 md:mx-auto md:w-full md:max-w-3xl md:px-10 md:py-10">
      <div>
        <h1 className="font-heading text-[34px] uppercase leading-none tracking-wide text-foreground">
          My Food Plan
        </h1>
        <p className="mt-1 font-script text-xl font-bold text-brand-orange-dark">
          Simple structure. Real results.
        </p>
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

      {showCopyActions && (
        <div className="flex flex-col gap-1.5">
          {copyWholeConfirming ? (
            <div className="flex flex-wrap items-center gap-2 text-[12px] font-semibold">
              <span className="text-muted">
                Next week already has a food plan. Replace it?
              </span>
              <button
                type="button"
                onClick={() => void handleCopyWholeConfirm()}
                disabled={copyingWhole}
                className="text-brand-orange-dark underline decoration-dotted underline-offset-2 disabled:opacity-60"
              >
                {copyingWhole ? "Copying…" : "Yes, replace"}
              </button>
              <button
                type="button"
                onClick={() => setCopyWholeConfirming(false)}
                disabled={copyingWhole}
                className="text-muted underline decoration-dotted underline-offset-2 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void handleCopyWholeClick()}
              disabled={copyingWhole}
              className="self-start text-[12px] font-semibold text-muted underline decoration-dotted underline-offset-2 transition-colors hover:text-brand-orange-dark disabled:opacity-60"
            >
              {copyingWhole ? "Copying to next week…" : "Copy to next week"}
            </button>
          )}
          {copyMessage && (
            <p className="text-[12px] font-semibold text-[#8fae8a]">{copyMessage}</p>
          )}
          {copyError && (
            <p className="text-xs text-brand-orange-dark">{copyError}</p>
          )}
        </div>
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

      <p className="text-[12px] font-medium leading-snug text-muted">
        Your food plan is saved automatically. Get a head start on next week
        anytime from the Sunday Reset on your Tracker, and view previous plans
        anytime in your History.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <MealSectionCard
          title="Breakfasts"
          idPrefix="breakfast"
          icon={<BreakfastIcon className="h-[19px] w-[19px]" />}
          values={breakfasts}
          onChange={setBreakfasts}
          minRequired={2}
          maxItems={3}
          placeholder="e.g. Greek yogurt with berries"
          disabled={isRevoked}
          showCopy={showCopyActions}
          copyingIndex={
            copyingItem?.section === "breakfasts" ? copyingItem.index : null
          }
          onCopyItem={(index) => void handleCopyItem("breakfasts", index)}
        />

        <MealSectionCard
          title="Lunches"
          idPrefix="lunch"
          icon={<LunchIcon className="h-[19px] w-[19px]" />}
          values={lunches}
          onChange={setLunches}
          minRequired={2}
          maxItems={3}
          placeholder="e.g. Grilled chicken salad"
          disabled={isRevoked}
          showCopy={showCopyActions}
          copyingIndex={
            copyingItem?.section === "lunches" ? copyingItem.index : null
          }
          onCopyItem={(index) => void handleCopyItem("lunches", index)}
        />

        <MealSectionCard
          title="Trigger Time Snacks"
          idPrefix="trigger-snack"
          icon={<TriggerSnackIcon className="h-[17px] w-[17px]" />}
          values={triggerSnacks}
          onChange={setTriggerSnacks}
          minRequired={2}
          maxItems={3}
          placeholder="e.g. Chips"
          disabled={isRevoked}
          showCopy={showCopyActions}
          copyingIndex={
            copyingItem?.section === "trigger_snacks" ? copyingItem.index : null
          }
          onCopyItem={(index) => void handleCopyItem("trigger_snacks", index)}
        />

        <MealSectionCard
          title="Desserts"
          idPrefix="dessert"
          icon={<DessertIcon className="h-[17px] w-[17px]" />}
          values={desserts}
          onChange={setDesserts}
          minRequired={1}
          maxItems={2}
          placeholder="e.g. Dark chocolate square"
          disabled={isRevoked}
          showCopy={showCopyActions}
          copyingIndex={
            copyingItem?.section === "desserts" ? copyingItem.index : null
          }
          onCopyItem={(index) => void handleCopyItem("desserts", index)}
        />
      </div>

      {(loadError || saveError) && (
        <p className="text-xs text-brand-orange-dark">{loadError ?? saveError}</p>
      )}

      <Link
        href={`/evening-meals?week_start=${weekStart}`}
        className="flex items-center gap-3.5 rounded-[18px] border border-border bg-card p-4 shadow-[0_12px_26px_-18px_rgba(17,17,17,0.16)] transition-colors hover:border-brand-orange/40"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white">
          <UtensilsIcon className="h-4 w-4" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-bold text-foreground">Evening Meals</p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            Plan each night&apos;s meal for the week
          </p>
        </div>
        <span className="flex items-center gap-1 whitespace-nowrap text-xs font-bold text-brand-orange-dark">
          Open <ArrowRightIcon className="h-3.5 w-3.5" />
        </span>
      </Link>

      <div className="flex gap-3.5 rounded-[18px] border border-tip-border bg-tip-bg p-[18px]">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white">
          <BulbIcon className="h-4 w-4" />
        </span>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-tip-text">
            KCPT Tip
          </p>
          <p className="mt-1 text-[13.5px] font-semibold leading-relaxed text-foreground">
            Your food plan doesn&apos;t need to be fancy - especially on busy
            weekdays. Repeatable meals are a smart way to reduce overwhelm.
            Pick meals you genuinely enjoy, and you&apos;ll be far more
            consistent.
          </p>
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
