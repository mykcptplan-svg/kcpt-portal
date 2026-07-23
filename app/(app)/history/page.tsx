"use client";

import { useState } from "react";
import { ChevronDownIcon, ClipboardCheckIcon, PlanIcon, RulerIcon } from "@/components/icons";

type Week = {
  label: string;
  foodPlanDone: boolean;
  trackerDays: number;
  trackerTotal: number;
  measurementsLogged: boolean;
  weightChange: number | null;
};

const WEEKS: Week[] = [
  { label: "Jul 14 – Jul 20", foodPlanDone: true, trackerDays: 7, trackerTotal: 7, measurementsLogged: true, weightChange: -1.2 },
  { label: "Jul 7 – Jul 13", foodPlanDone: true, trackerDays: 6, trackerTotal: 7, measurementsLogged: true, weightChange: -0.8 },
  { label: "Jun 30 – Jul 6", foodPlanDone: true, trackerDays: 5, trackerTotal: 7, measurementsLogged: false, weightChange: null },
  { label: "Jun 23 – Jun 29", foodPlanDone: false, trackerDays: 3, trackerTotal: 7, measurementsLogged: true, weightChange: -0.5 },
  { label: "Jun 16 – Jun 22", foodPlanDone: true, trackerDays: 7, trackerTotal: 7, measurementsLogged: true, weightChange: -1.0 },
  { label: "Jun 9 – Jun 15", foodPlanDone: true, trackerDays: 7, trackerTotal: 7, measurementsLogged: true, weightChange: -0.6 },
  { label: "Jun 2 – Jun 8", foodPlanDone: false, trackerDays: 2, trackerTotal: 7, measurementsLogged: false, weightChange: null },
  { label: "May 26 – Jun 1", foodPlanDone: true, trackerDays: 4, trackerTotal: 7, measurementsLogged: true, weightChange: -0.3 },
];

function computeStatus(w: Week): { key: "complete" | "partial" | "none"; label: string } {
  const scores = [w.foodPlanDone, w.trackerDays === w.trackerTotal, w.measurementsLogged];
  const completeCount = scores.filter(Boolean).length;
  if (completeCount === 3) return { key: "complete", label: "Complete" };
  if (completeCount === 0) return { key: "none", label: "No Data" };
  return { key: "partial", label: "Partial" };
}

const STATUS_STYLES = {
  complete: { bg: "rgba(143,174,138,0.15)", dot: "#6a9a63", color: "#4d7548" },
  partial: { bg: "rgba(251,147,58,0.14)", dot: "#FB933A", color: "#B8681D" },
  none: { bg: "rgba(17,17,17,0.06)", dot: "rgba(17,17,17,0.3)", color: "rgba(26,22,19,0.5)" },
} as const;

export default function HistoryPage() {
  const [expandedIndex, setExpandedIndex] = useState(0);

  return (
    <div className="flex flex-1 flex-col gap-4 px-5 py-6 md:mx-auto md:w-full md:max-w-3xl md:px-10 md:py-10">
      <div>
        <h1 className="font-heading text-[32px] uppercase leading-none tracking-wide text-foreground">
          History
        </h1>
        <p className="mt-0.5 font-script text-xl font-bold text-brand-orange-dark">
          Every week tells a story.
        </p>
      </div>
      <p className="text-[13px] font-medium leading-[1.5] text-muted">
        Tap a week to see how your Food Plan, Success Tracker, and Measurements
        came together.
      </p>

      <div className="flex flex-col gap-2.5">
        {WEEKS.map((week, i) => {
          const expanded = expandedIndex === i;
          const status = computeStatus(week);
          const statusStyle = STATUS_STYLES[status.key];

          const sections = [
            {
              key: "food",
              title: "Food Plan",
              summary: week.foodPlanDone ? "All meals filled in for the week" : "Not fully filled in",
              icon: <PlanIcon className="h-3.5 w-3.5 text-white" />,
            },
            {
              key: "tracker",
              title: "Success Tracker",
              summary: `${week.trackerDays} of ${week.trackerTotal} days logged`,
              icon: <ClipboardCheckIcon className="h-3.5 w-3.5 text-white" />,
            },
            {
              key: "measurements",
              title: "Weight & Measurements",
              summary: week.measurementsLogged
                ? week.weightChange != null
                  ? `Logged · ${week.weightChange > 0 ? "+" : ""}${week.weightChange} since last week`
                  : "Logged this week"
                : "No entry this week",
              icon: <RulerIcon className="h-3.5 w-3.5 text-white" />,
            },
          ];

          return (
            <div
              key={week.label}
              className="overflow-hidden rounded-[18px] border border-border bg-card shadow-[0_10px_22px_-16px_rgba(17,17,17,0.16)]"
            >
              <button
                type="button"
                onClick={() => setExpandedIndex(expanded ? -1 : i)}
                className="flex w-full cursor-pointer items-center gap-3 px-[18px] py-4 text-left"
              >
                <span
                  className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full"
                  style={{ background: expanded ? "var(--brand-gradient)" : "var(--tip-bg)" }}
                >
                  <RulerIcon
                    className={`h-3.5 w-3.5 ${expanded ? "text-white" : "text-tip-text"}`}
                  />
                </span>
                <span className="min-w-0 flex-1 truncate font-heading text-[15px] uppercase tracking-wide text-foreground">
                  {week.label}
                </span>
                <span
                  className="flex shrink-0 items-center gap-1.5 rounded-full px-[11px] py-[5px]"
                  style={{ background: statusStyle.bg }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: statusStyle.dot }}
                  />
                  <span className="text-[11px] font-bold tracking-wide" style={{ color: statusStyle.color }}>
                    {status.label}
                  </span>
                </span>
                <ChevronDownIcon
                  className={`h-4 w-4 shrink-0 text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
                />
              </button>

              {expanded && (
                <div className="px-[18px] pb-5">
                  <div className="mb-4 h-px bg-border" />
                  <div className="flex flex-col gap-2.5">
                    {sections.map((section) => (
                      <div
                        key={section.key}
                        className="flex items-center gap-3 rounded-[14px] border border-border bg-background px-4 py-3.5"
                      >
                        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-brand-gradient">
                          {section.icon}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[12.5px] font-bold text-foreground">
                            {section.title}
                          </p>
                          <p className="mt-0.5 text-xs font-medium text-muted">
                            {section.summary}
                          </p>
                        </div>
                        <span className="whitespace-nowrap text-xs font-bold text-brand-orange-dark">
                          View →
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
