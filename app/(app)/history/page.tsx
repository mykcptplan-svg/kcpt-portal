"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import HeartLoader from "@/components/HeartLoader";
import SectionDetail, {
  type HistorySectionKey,
} from "@/components/history/SectionDetail";
import {
  ChevronDownIcon,
  ClipboardCheckIcon,
  DownloadIcon,
  PlanIcon,
  RulerIcon,
} from "@/components/icons";
import { getWeeklyBasePlan } from "@/lib/api/basePlan";
import { exportWeekPdf } from "@/lib/api/exportPdf";
import { getWeeksList, type WeekSummary } from "@/lib/api/history";
import { getWeightMeasurement } from "@/lib/api/measurements";
import { getWeeklyTracker } from "@/lib/api/tracker";
import { countMealSlotsFilled } from "@/lib/planStats";
import { createClient } from "@/lib/supabase/client";
import {
  countTrackerDaysLogged,
  findClosestEarlierMeasuredWeek,
} from "@/lib/trackerStats";
import { formatWeekRange } from "@/lib/week";
import type {
  WeeklyBasePlan,
  WeeklyTrackerEntry,
  WeightMeasurement,
} from "@/types";

type WeekDetailCache = {
  plan: WeeklyBasePlan | null;
  tracker: WeeklyTrackerEntry | null;
  measurement: WeightMeasurement | null;
};

function computeStatus(w: WeekSummary): {
  key: "complete" | "partial" | "none";
  label: string;
} {
  const flags = [w.has_base_plan, w.has_tracker, w.has_measurements];
  const completeCount = flags.filter(Boolean).length;
  if (completeCount === 3) return { key: "complete", label: "Complete" };
  if (completeCount === 0) return { key: "none", label: "No Data" };
  return { key: "partial", label: "Partial" };
}

const STATUS_STYLES = {
  complete: { bg: "rgba(143,174,138,0.15)", dot: "#6a9a63", color: "#4d7548" },
  partial: { bg: "rgba(251,147,58,0.14)", dot: "#FB933A", color: "#B8681D" },
  none: {
    bg: "var(--badge-neutral-bg)",
    dot: "var(--badge-neutral-dot)",
    color: "var(--badge-neutral-text)",
  },
} as const;

function measurementSummary(
  week: WeekSummary,
  detail: WeekDetailCache | undefined,
  weeks: WeekSummary[],
  measurementByWeek: Record<string, WeightMeasurement | null>,
): string {
  if (!week.has_measurements || !detail?.measurement) {
    return "No entry this week";
  }
  const priorWeek = findClosestEarlierMeasuredWeek(weeks, week.week_start);
  const prior = priorWeek
    ? measurementByWeek[priorWeek.week_start]
    : undefined;
  if (prior == null) return "Logged this week";
  if (detail.measurement.weight == null || prior.weight == null) {
    return "Logged this week";
  }
  const delta = detail.measurement.weight - prior.weight;
  const formatted = `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`;
  return `Logged · ${formatted} since last week`;
}

export default function HistoryPage() {
  const supabase = useMemo(() => createClient(), []);

  const [weeks, setWeeks] = useState<WeekSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedWeekStart, setExpandedWeekStart] = useState<string | null>(
    null,
  );
  const [detailCache, setDetailCache] = useState<
    Record<string, WeekDetailCache>
  >({});
  const [measurementByWeek, setMeasurementByWeek] = useState<
    Record<string, WeightMeasurement | null>
  >({});
  const measurementByWeekRef = useRef(measurementByWeek);
  measurementByWeekRef.current = measurementByWeek;
  const [expandLoading, setExpandLoading] = useState<string | null>(null);
  const [expandError, setExpandError] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [downloadingWeekStart, setDownloadingWeekStart] = useState<
    string | null
  >(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function getAccessToken(): Promise<string | null> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

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

        const list = await getWeeksList(session.access_token);
        if (cancelled) return;

        setWeeks(list);
        if (list.length > 0) {
          setExpandedWeekStart(list[0].week_start);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Unable to load history.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (!expandedWeekStart) return;
    if (detailCache[expandedWeekStart]) return;

    const weekStart = expandedWeekStart;
    const week = weeks.find((w) => w.week_start === weekStart);
    if (!week) return;

    let cancelled = false;

    async function fetchDetail() {
      const token = await getAccessToken();
      if (!token || cancelled) return;

      setExpandLoading(weekStart);
      setExpandError(null);
      try {
        const priorWeek = findClosestEarlierMeasuredWeek(weeks, weekStart);
        const priorKey = priorWeek?.week_start;
        const priorAlreadyCached =
          priorKey != null && priorKey in measurementByWeekRef.current;

        const [plan, tracker, measurement, priorMeasurement] = await Promise.all([
          getWeeklyBasePlan(weekStart, token).catch(() => null),
          getWeeklyTracker(weekStart, token).catch(() => null),
          getWeightMeasurement(weekStart, token).catch(() => null),
          priorWeek && !priorAlreadyCached
            ? getWeightMeasurement(priorWeek.week_start, token).catch(() => null)
            : Promise.resolve(
                priorKey != null
                  ? (measurementByWeekRef.current[priorKey] ?? null)
                  : null,
              ),
        ]);

        if (cancelled) return;

        setDetailCache((prev) => ({
          ...prev,
          [weekStart]: { plan, tracker, measurement },
        }));

        setMeasurementByWeek((prev) => {
          const next = { ...prev };
          next[weekStart] = measurement;
          if (priorKey != null) {
            next[priorKey] = priorAlreadyCached
              ? prev[priorKey]
              : priorMeasurement;
          }
          return next;
        });
      } catch (err) {
        if (!cancelled) {
          setExpandError(
            err instanceof Error ? err.message : "Unable to load week details.",
          );
        }
      } finally {
        if (!cancelled) setExpandLoading(null);
      }
    }

    void fetchDetail();
    return () => {
      cancelled = true;
    };
    // detailCache intentionally omitted — we only fetch when missing for expandedWeekStart
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedWeekStart, weeks]);

  function toggleWeek(weekStart: string) {
    setExpandedWeekStart((current) =>
      current === weekStart ? null : weekStart,
    );
  }

  function toggleSectionDetail(weekStart: string, key: HistorySectionKey) {
    const id = `${weekStart}:${key}`;
    setOpenSections((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleDownloadPdf(weekStart: string) {
    const token = await getAccessToken();
    if (!token) {
      setDownloadError("Not logged in.");
      return;
    }
    setDownloadError(null);
    setDownloadingWeekStart(weekStart);
    try {
      const blob = await exportWeekPdf(weekStart, token);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kcpt-week-${weekStart}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(
        err instanceof Error ? err.message : "Unable to download week PDF",
      );
    } finally {
      setDownloadingWeekStart(null);
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
    <div className="flex flex-1 flex-col gap-4 px-5 py-6 md:mx-auto md:w-full md:max-w-3xl md:px-10 md:py-10">
      <div>
        <h1 className="font-heading text-[32px] uppercase leading-none tracking-wide text-foreground">
          History
        </h1>
        <p className="mt-0.5 font-script text-xl font-bold text-brand-orange-dark">
          Consistency isn&apos;t built in one perfect week. It&apos;s built by
          stacking good weeks together.
        </p>
      </div>
      <p className="text-[13px] font-medium leading-[1.5] text-muted">
        Everything you&apos;ve completed is saved here, so you can look back,
        celebrate your progress and spot patterns over time.
      </p>

      {loadError && (
        <p className="text-xs text-brand-orange-dark">{loadError}</p>
      )}

      {!loadError && weeks.length === 0 && (
        <p className="text-sm text-muted">
          No weeks logged yet. Your history will show up here as you fill in
          your plan, tracker, and measurements.
        </p>
      )}

      {downloadError && (
        <p className="text-xs text-brand-orange-dark">{downloadError}</p>
      )}

      <div className="flex flex-col gap-2.5">
        {weeks.map((week) => {
          const expanded = expandedWeekStart === week.week_start;
          const status = computeStatus(week);
          const statusStyle = STATUS_STYLES[status.key];
          const detail = detailCache[week.week_start];
          const isExpandLoading = expandLoading === week.week_start;
          const isDownloading = downloadingWeekStart === week.week_start;

          const trackerDays = countTrackerDaysLogged(detail?.tracker ?? null);
          const { filled: mealsFilled, total: mealsTotal } =
            countMealSlotsFilled(detail?.plan ?? null);

          const sections: {
            key: HistorySectionKey;
            title: string;
            summary: string;
            icon: ReactNode;
          }[] = [
            {
              key: "food",
              title: "Food Plan",
              summary: `${mealsFilled}/${mealsTotal} meals filled in`,
              icon: <PlanIcon className="h-3.5 w-3.5 text-white" />,
            },
            {
              key: "tracker",
              title: "Success Tracker",
              summary: `${trackerDays} of 7 days logged`,
              icon: <ClipboardCheckIcon className="h-3.5 w-3.5 text-white" />,
            },
            {
              key: "measurements",
              title: "Weight & Measurements",
              summary: measurementSummary(
                week,
                detail,
                weeks,
                measurementByWeek,
              ),
              icon: <RulerIcon className="h-3.5 w-3.5 text-white" />,
            },
          ];

          return (
            <div
              key={week.week_start}
              className="overflow-hidden rounded-[18px] border border-border bg-card shadow-[0_10px_22px_-16px_rgba(17,17,17,0.16)]"
            >
              <div className="flex w-full items-center gap-2 px-[18px] py-4">
                <button
                  type="button"
                  onClick={() => toggleWeek(week.week_start)}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
                >
                  <span
                    className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full"
                    style={{
                      background: expanded
                        ? "var(--brand-gradient)"
                        : "var(--tip-bg)",
                    }}
                  >
                    <RulerIcon
                      className={`h-3.5 w-3.5 ${expanded ? "text-white" : "text-tip-text"}`}
                    />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-heading text-[15px] uppercase tracking-wide text-foreground">
                    {formatWeekRange(week.week_start)}
                  </span>
                  <span
                    className="flex shrink-0 items-center gap-1.5 rounded-full px-[11px] py-[5px]"
                    style={{ background: statusStyle.bg }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: statusStyle.dot }}
                    />
                    <span
                      className="text-[11px] font-bold tracking-wide"
                      style={{ color: statusStyle.color }}
                    >
                      {status.label}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleDownloadPdf(week.week_start)}
                  disabled={isDownloading}
                  aria-label={
                    isDownloading
                      ? `Generating PDF for ${formatWeekRange(week.week_start)}`
                      : `Download PDF for ${formatWeekRange(week.week_start)}`
                  }
                  className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-tip-bg hover:text-foreground disabled:cursor-wait disabled:opacity-50"
                >
                  {isDownloading ? (
                    <span className="text-[10px] font-bold text-muted">…</span>
                  ) : (
                    <DownloadIcon className="h-4 w-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => toggleWeek(week.week_start)}
                  aria-expanded={expanded}
                  aria-label={
                    expanded
                      ? `Collapse ${formatWeekRange(week.week_start)}`
                      : `Expand ${formatWeekRange(week.week_start)}`
                  }
                  className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center text-muted"
                >
                  <ChevronDownIcon
                    className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
                  />
                </button>
              </div>

              {expanded && (
                <div className="px-[18px] pb-5">
                  <div className="mb-4 h-px bg-border" />
                  {isExpandLoading || (!detail && !expandError) ? (
                    <p className="text-xs font-medium text-muted">
                      Loading week details…
                    </p>
                  ) : expandError && !detail ? (
                    <p className="text-xs text-brand-orange-dark">{expandError}</p>
                  ) : detail ? (
                    <div className="flex flex-col gap-2.5">
                      {sections.map((section) => {
                        const isSectionOpen = openSections.has(
                          `${week.week_start}:${section.key}`,
                        );
                        return (
                          <div key={section.key}>
                            <button
                              type="button"
                              onClick={() =>
                                toggleSectionDetail(
                                  week.week_start,
                                  section.key,
                                )
                              }
                              aria-expanded={isSectionOpen}
                              className="flex w-full cursor-pointer items-center gap-3 rounded-[14px] border border-border bg-background px-4 py-3.5 text-left"
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
                                {isSectionOpen ? "Hide" : "View →"}
                              </span>
                            </button>

                            {isSectionOpen && (
                              <div className="mt-2 rounded-[14px] border border-border bg-card p-4">
                                <SectionDetail
                                  sectionKey={section.key}
                                  plan={detail.plan}
                                  tracker={detail.tracker}
                                  measurement={detail.measurement}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
