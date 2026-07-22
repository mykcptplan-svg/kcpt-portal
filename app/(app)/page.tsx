"use client";

import { useEffect, useMemo, useState } from "react";
import QuickAccessCard from "@/components/dashboard/QuickAccessCard";
import WeekOverviewCard from "@/components/dashboard/WeekOverviewCard";
import HeartLoader from "@/components/HeartLoader";
import { HistoryIcon, PlanIcon, RulerIcon, TrackerIcon } from "@/components/icons";
import { getWeeklyBasePlan } from "@/lib/api/basePlan";
import { getProfile } from "@/lib/api/profile";
import { getWeeklyTracker } from "@/lib/api/tracker";
import { createClient } from "@/lib/supabase/client";
import { formatWeekRange, getWeekStart } from "@/lib/week";

function emailPrefix(email: string | undefined | null): string | null {
  if (!email) return null;
  return email.split("@")[0] || null;
}

export default function Home() {
  const supabase = useMemo(() => createClient(), []);
  const weekStart = useMemo(() => getWeekStart(), []);
  const weekRange = useMemo(() => formatWeekRange(weekStart), [weekStart]);

  const [firstName, setFirstName] = useState("there");
  const [basePlanFilled, setBasePlanFilled] = useState(false);
  const [trackerDaysLogged, setTrackerDaysLogged] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        if (!cancelled) setLoading(false);
        return;
      }

      const fallbackName =
        emailPrefix(session.user.email) ?? "there";

      const [profile, plan, tracker] = await Promise.all([
        getProfile(session.access_token).catch(() => null),
        getWeeklyBasePlan(weekStart, session.access_token).catch(() => null),
        getWeeklyTracker(weekStart, session.access_token).catch(() => null),
      ]);
      if (cancelled) return;

      const fullName = profile?.full_name?.trim();
      setFirstName(fullName || fallbackName);

      if (plan) {
        setBasePlanFilled(
          plan.breakfasts.length > 0 ||
            plan.lunches.length > 0 ||
            plan.trigger_snacks.length > 0 ||
            plan.desserts.length > 0,
        );
      }

      if (tracker) {
        const daysLogged = Array.from({ length: 7 }, (_, day) =>
          tracker.habits.some((habit) => habit.days[day]),
        ).filter(Boolean).length;
        setTrackerDaysLogged(daysLogged);
      }

      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [supabase, weekStart]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <HeartLoader size={192} />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-5 px-5 pt-2 pb-6 md:mx-auto md:w-full md:max-w-3xl md:px-10 md:pt-8 md:pb-10">
      <div>
        <p className="text-[13px] font-medium tracking-wide text-muted">
          Welcome back,
        </p>
        <h1 className="mt-0.5 font-heading text-[38px] uppercase leading-none tracking-wide text-foreground">
          {firstName}
        </h1>
      </div>

      <WeekOverviewCard
        weekRange={weekRange}
        basePlanFilled={basePlanFilled}
        trackerDaysLogged={trackerDaysLogged}
        trackerDaysTotal={7}
      />

      <div className="mt-2">
        <h2 className="font-heading text-lg uppercase tracking-wide text-foreground">
          Quick Access
        </h2>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <QuickAccessCard
          title="My Food Plan"
          description="Your structure for this week"
          icon={<PlanIcon className="h-5 w-5" />}
          href="/plan"
        />
        <QuickAccessCard
          title="My Success Tracker"
          description="Log and review your days"
          icon={<TrackerIcon className="h-5 w-5" />}
          href="/tracker"
        />
        <QuickAccessCard
          title="History"
          description="Past weeks at a glance"
          icon={<HistoryIcon className="h-5 w-5" />}
          comingSoon
        />
        <QuickAccessCard
          title="Measurements"
          description="Track your progress over time"
          icon={<RulerIcon className="h-5 w-5" />}
          comingSoon
        />
      </div>
    </div>
  );
}
