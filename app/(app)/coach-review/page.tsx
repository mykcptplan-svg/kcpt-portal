"use client";

import { useState } from "react";
import { ChartIcon, ClipboardCheckIcon, PlanIcon } from "@/components/icons";

type CoachedMember = {
  firstName: string;
  lastName: string;
  email: string;
  foodPlan: { filledDays: number; totalDays: number; summary: string };
  tracker: { daysLogged: number; daysTotal: number; nonNegotiablesHit: number };
  measurements: { latestWeight: number; delta: number; lastLogged: string };
};

const COACHED_MEMBERS: CoachedMember[] = [
  {
    firstName: "Jamie",
    lastName: "Morgan",
    email: "jamie.morgan@email.com",
    foodPlan: { filledDays: 4, totalDays: 4, summary: "All meals filled in for this week" },
    tracker: { daysLogged: 7, daysTotal: 7, nonNegotiablesHit: 4 },
    measurements: { latestWeight: 178, delta: -1.2, lastLogged: "Jul 20" },
  },
  {
    firstName: "Sam",
    lastName: "Whitfield",
    email: "sam.whitfield@email.com",
    foodPlan: { filledDays: 3, totalDays: 4, summary: "Dinner left blank on Thursday" },
    tracker: { daysLogged: 5, daysTotal: 7, nonNegotiablesHit: 3 },
    measurements: { latestWeight: 164, delta: -0.4, lastLogged: "Jul 18" },
  },
  {
    firstName: "Rina",
    lastName: "Damayanti",
    email: "rina.damayanti@email.com",
    foodPlan: { filledDays: 4, totalDays: 4, summary: "All meals filled in for this week" },
    tracker: { daysLogged: 6, daysTotal: 7, nonNegotiablesHit: 4 },
    measurements: { latestWeight: 142, delta: 0.6, lastLogged: "Jul 21" },
  },
];

function initials(m: Pick<CoachedMember, "firstName" | "lastName">): string {
  return `${m.firstName[0] ?? ""}${m.lastName[0] ?? ""}`.toUpperCase();
}

function deltaLabel(delta: number): string {
  if (delta === 0) return "No change";
  return `${delta > 0 ? "+" : ""}${delta} since last week`;
}

function deltaColor(delta: number): string {
  if (delta === 0) return "rgba(26,22,19,0.45)";
  return delta < 0 ? "#6a9a63" : "var(--brand-orange-dark)";
}

export default function CoachReviewPage() {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = COACHED_MEMBERS[activeIndex];
  const pct = Math.round((active.tracker.daysLogged / active.tracker.daysTotal) * 100);

  return (
    <div className="flex flex-1 flex-col gap-4 px-5 py-6 md:mx-auto md:w-full md:max-w-[960px] md:px-10 md:py-10">
      <div>
        <h1 className="font-heading text-[32px] uppercase leading-none tracking-wide text-foreground">
          Coach Review
        </h1>
        <p className="mt-0.5 font-script text-xl font-bold text-brand-orange-dark">
          Your actively coached members.
        </p>
      </div>

      {/* Mobile: horizontal scroll chips */}
      <div className="flex gap-2.5 overflow-x-auto px-0.5 pb-1.5 md:hidden">
        {COACHED_MEMBERS.map((m, i) => {
          const selected = i === activeIndex;
          return (
            <button
              key={m.email}
              type="button"
              onClick={() => setActiveIndex(i)}
              className="flex shrink-0 cursor-pointer items-center gap-2.5 rounded-full py-2 pl-2 pr-3.5"
              style={{
                background: selected ? "rgba(251,147,58,0.12)" : "#ffffff",
                border: selected
                  ? "1.5px solid rgba(251,147,58,0.4)"
                  : "1px solid rgba(17,17,17,0.08)",
              }}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-gradient">
                <span className="font-heading text-xs text-white">{initials(m)}</span>
              </span>
              <span
                className="whitespace-nowrap text-[13px] font-bold"
                style={{ color: selected ? "#B8681D" : "rgba(26,22,19,0.6)" }}
              >
                {m.firstName}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-start gap-4 md:flex-nowrap">
        {/* Desktop: sidebar member list */}
        <div className="hidden w-full max-w-[260px] shrink-0 flex-col gap-1.5 rounded-[20px] border border-border bg-card p-3.5 shadow-[0_12px_26px_-18px_rgba(17,17,17,0.16)] md:flex">
          {COACHED_MEMBERS.map((m, i) => {
            const selected = i === activeIndex;
            return (
              <button
                key={m.email}
                type="button"
                onClick={() => setActiveIndex(i)}
                className="flex cursor-pointer items-center gap-3 rounded-[14px] p-2.5 text-left"
                style={{ background: selected ? "rgba(251,147,58,0.1)" : "transparent" }}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-gradient">
                  <span className="font-heading text-[13px] text-white">{initials(m)}</span>
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-bold text-foreground">
                    {m.firstName} {m.lastName}
                  </p>
                  <p className="truncate text-xs font-medium text-muted">{m.email}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Detail panel */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex items-center gap-3.5 rounded-[20px] border border-border bg-card p-5 shadow-[0_12px_26px_-18px_rgba(17,17,17,0.16)]">
            <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-brand-gradient">
              <span className="font-heading text-base text-white">{initials(active)}</span>
            </span>
            <div>
              <p className="text-[17px] font-extrabold text-foreground">
                {active.firstName} {active.lastName}
              </p>
              <p className="mt-0.5 text-[13px] font-medium text-muted">{active.email}</p>
            </div>
          </div>

          {/* Food Plan */}
          <div className="rounded-[20px] border border-border bg-card p-5 shadow-[0_12px_26px_-18px_rgba(17,17,17,0.16)]">
            <div className="mb-3.5 flex items-center gap-3">
              <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white">
                <PlanIcon className="h-4 w-4" />
              </span>
              <h2 className="font-heading text-base uppercase tracking-wide text-foreground">
                Food Plan
              </h2>
            </div>
            <p className="mb-3 text-[13.5px] font-semibold text-foreground">
              {active.foodPlan.summary}
            </p>
            <div>
              <p className="font-heading text-[22px] text-foreground">
                {active.foodPlan.filledDays}/{active.foodPlan.totalDays}
              </p>
              <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-muted">
                Meals Filled
              </p>
            </div>
          </div>

          {/* Success Tracker */}
          <div className="rounded-[20px] border border-border bg-card p-5 shadow-[0_12px_26px_-18px_rgba(17,17,17,0.16)]">
            <div className="mb-3.5 flex items-center gap-3">
              <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white">
                <ClipboardCheckIcon className="h-4 w-4" />
              </span>
              <h2 className="font-heading text-base uppercase tracking-wide text-foreground">
                Success Tracker
              </h2>
            </div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5">
              <p className="text-[13.5px] font-semibold text-foreground">
                {active.tracker.daysLogged} of {active.tracker.daysTotal} days logged
              </p>
              <p className="text-xs font-bold text-brand-orange-dark">
                {active.tracker.nonNegotiablesHit} non-negotiables hit
              </p>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-black/[0.07]">
              <div className="h-full rounded-full bg-brand-gradient" style={{ width: `${pct}%` }} />
            </div>
          </div>

          {/* Measurements */}
          <div className="rounded-[20px] border border-border bg-card p-5 shadow-[0_12px_26px_-18px_rgba(17,17,17,0.16)]">
            <div className="mb-3.5 flex items-center gap-3">
              <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white">
                <ChartIcon className="h-4 w-4" />
              </span>
              <h2 className="font-heading text-base uppercase tracking-wide text-foreground">
                Weight &amp; Measurements
              </h2>
            </div>
            <div className="mb-1.5 flex items-baseline gap-3">
              <span className="font-heading text-[26px] text-foreground">
                {active.measurements.latestWeight}
              </span>
              <span
                className="text-[13px] font-bold"
                style={{ color: deltaColor(active.measurements.delta) }}
              >
                {deltaLabel(active.measurements.delta)}
              </span>
            </div>
            <p className="text-xs font-medium text-muted">
              Last logged {active.measurements.lastLogged}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
