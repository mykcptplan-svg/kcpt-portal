"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import MealSectionCard from "@/components/plan/MealSectionCard";
import AutosaveStatus from "@/components/AutosaveStatus";
import HeartLoader from "@/components/HeartLoader";
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
import { useProfile } from "@/lib/context/ProfileContext";
import { useDebouncedSave } from "@/lib/hooks/useDebouncedSave";
import { createClient } from "@/lib/supabase/client";
import { getWeekStart } from "@/lib/week";
import type { EveningMealEntry } from "@/types";
import type { NutritionApproach } from "@/types/plan";

export default function PlanPage() {
  const supabase = useMemo(() => createClient(), []);
  const weekStart = useMemo(() => getWeekStart(), []);
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
  const accessTokenRef = useRef<string | null>(null);
  // Evening Meals owns this field; we only round-trip it so autosaving the
  // rest of the plan never clobbers it.
  const eveningMealsRef = useRef<EveningMealEntry[]>([]);

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

        const plan = await getWeeklyBasePlan(weekStart, session.access_token);
        if (cancelled || !plan) return;

        if (
          plan.nutrition_approach === "orange_base" ||
          plan.nutrition_approach === "meal_bank"
        ) {
          setNutritionApproach(plan.nutrition_approach);
        }
        if (plan.breakfasts.length) setBreakfasts(plan.breakfasts);
        if (plan.lunches.length) setLunches(plan.lunches);
        if (plan.trigger_snacks.length) setTriggerSnacks(plan.trigger_snacks);
        if (plan.desserts.length) setDesserts(plan.desserts);
        eveningMealsRef.current = plan.evening_meals;
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

  const draft = useMemo(
    () => ({ nutritionApproach, breakfasts, lunches, triggerSnacks, desserts }),
    [nutritionApproach, breakfasts, lunches, triggerSnacks, desserts],
  );

  const { status, error: saveError } = useDebouncedSave(
    draft,
    async (value) => {
      const accessToken = accessTokenRef.current;
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
        />
      </div>

      {(loadError || saveError) && (
        <p className="text-xs text-brand-orange-dark">{loadError ?? saveError}</p>
      )}

      <Link
        href="/evening-meals"
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
            Your base plan doesn&apos;t need to be fancy — just repeatable.
            Pick meals you&apos;ll actually make again and again.
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
