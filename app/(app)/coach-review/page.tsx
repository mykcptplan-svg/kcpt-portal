"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import HeartLoader from "@/components/HeartLoader";
import SectionDetail, {
  type HistorySectionKey,
} from "@/components/history/SectionDetail";
import {
  ChevronDownIcon,
  ClipboardCheckIcon,
  PlanIcon,
  RulerIcon,
} from "@/components/icons";
import {
  getMembersList,
  type MemberListItem,
} from "@/lib/api/admin";
import { getWeeklyBasePlan } from "@/lib/api/basePlan";
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

function initialsFromFullName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return "--";
}

function displayName(m: MemberListItem): string {
  return m.full_name.trim() || m.email || "—";
}

function firstName(m: MemberListItem): string {
  const name = m.full_name.trim();
  if (!name) return m.email?.split("@")[0] ?? "—";
  return name.split(/\s+/)[0] ?? name;
}

export default function CoachReviewPage() {
  const supabase = useMemo(() => createClient(), []);

  const [members, setMembers] = useState<MemberListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const [weeks, setWeeks] = useState<WeekSummary[]>([]);
  const [weeksLoading, setWeeksLoading] = useState(false);
  const [weeksError, setWeeksError] = useState<string | null>(null);

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
  const [memberQuery, setMemberQuery] = useState("");

  const filteredMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      const name = m.full_name.toLowerCase();
      const email = (m.email ?? "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [members, memberQuery]);

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

        const list = await getMembersList(session.access_token);
        if (cancelled) return;

        const coached = list.filter((m) => m.coach_review_enabled);
        setMembers(coached);
        if (coached.length > 0) {
          setSelectedMemberId(coached[0].id);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Unable to load members.",
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

  // Reset and load weeks list when selected member changes
  useEffect(() => {
    if (!selectedMemberId) return;

    const memberId = selectedMemberId;
    let cancelled = false;

    setWeeks([]);
    setDetailCache({});
    setMeasurementByWeek({});
    setOpenSections(new Set());
    setExpandedWeekStart(null);
    setExpandError(null);
    setWeeksError(null);
    setWeeksLoading(true);

    async function loadWeeks() {
      const token = await getAccessToken();
      if (!token) {
        if (!cancelled) {
          setWeeksError("Not logged in.");
          setWeeksLoading(false);
        }
        return;
      }
      try {
        const list = await getWeeksList(token, memberId);
        if (cancelled) return;
        setWeeks(list);
        if (list.length > 0) {
          setExpandedWeekStart(list[0].week_start);
        }
      } catch (err) {
        if (!cancelled) {
          setWeeksError(
            err instanceof Error
              ? err.message
              : "Unable to load member weeks.",
          );
        }
      } finally {
        if (!cancelled) setWeeksLoading(false);
      }
    }

    void loadWeeks();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMemberId]);

  // Fetch week detail when expanded (and missing from cache)
  useEffect(() => {
    if (!selectedMemberId || !expandedWeekStart) return;
    if (detailCache[expandedWeekStart]) return;

    const memberId = selectedMemberId;
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

        const [plan, tracker, measurement, priorMeasurement] =
          await Promise.all([
            getWeeklyBasePlan(weekStart, token, memberId).catch(() => null),
            getWeeklyTracker(weekStart, token, memberId).catch(() => null),
            getWeightMeasurement(weekStart, token, memberId).catch(
              () => null,
            ),
            priorWeek && !priorAlreadyCached
              ? getWeightMeasurement(
                  priorWeek.week_start,
                  token,
                  memberId,
                ).catch(() => null)
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
            err instanceof Error
              ? err.message
              : "Unable to load week details.",
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
    // detailCache intentionally omitted — only fetch when missing for expandedWeekStart
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedWeekStart, weeks, selectedMemberId]);

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

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <HeartLoader size={192} />
      </div>
    );
  }

  const active = members.find((m) => m.id === selectedMemberId) ?? null;

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

      {loadError && (
        <p className="text-xs text-brand-orange-dark">{loadError}</p>
      )}

      {!loadError && members.length === 0 && (
        <p className="text-sm text-muted">
          No members are marked for Coach Review yet. Enable Coach Review for a
          member in the Admin Panel to see them here.
        </p>
      )}

      {!loadError && members.length > 0 && active && (
        <>
          <input
            type="search"
            value={memberQuery}
            onChange={(e) => setMemberQuery(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full rounded-[10px] border border-border bg-card px-[13px] py-3 text-[14px] font-semibold text-foreground outline-none focus:border-brand-orange md:max-w-[260px]"
          />

          {/* Mobile: horizontal scroll chips */}
          <div className="flex gap-2.5 overflow-x-auto px-0.5 pb-1.5 md:hidden">
            {filteredMembers.length === 0 ? (
              <p className="text-sm text-muted">No members match.</p>
            ) : (
              filteredMembers.map((m) => {
              const selected = m.id === selectedMemberId;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedMemberId(m.id)}
                  className={`flex shrink-0 cursor-pointer items-center gap-2.5 rounded-full py-2 pl-2 pr-3.5 ${
                    selected ? "" : "border border-border bg-card"
                  }`}
                  style={
                    selected
                      ? {
                          background: "rgba(251,147,58,0.12)",
                          border: "1.5px solid rgba(251,147,58,0.4)",
                        }
                      : undefined
                  }
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-gradient">
                    <span className="font-heading text-xs text-white">
                      {initialsFromFullName(m.full_name || displayName(m))}
                    </span>
                  </span>
                  <span
                    className={`whitespace-nowrap text-[13px] font-bold ${
                      selected ? "" : "text-muted"
                    }`}
                    style={selected ? { color: "#B8681D" } : undefined}
                  >
                    {firstName(m)}
                  </span>
                </button>
              );
            })
            )}
          </div>

          <div className="flex flex-wrap items-start gap-4 md:flex-nowrap">
            {/* Desktop: sidebar member list */}
            <div className="hidden w-full max-w-[260px] shrink-0 flex-col gap-1.5 rounded-[20px] border border-border bg-card p-3.5 shadow-[0_12px_26px_-18px_rgba(17,17,17,0.16)] md:flex">
              {filteredMembers.length === 0 ? (
                <p className="px-1 py-2 text-sm text-muted">No members match.</p>
              ) : (
                filteredMembers.map((m) => {
                const selected = m.id === selectedMemberId;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelectedMemberId(m.id)}
                    className="flex cursor-pointer items-center gap-3 rounded-[14px] p-2.5 text-left"
                    style={{
                      background: selected
                        ? "rgba(251,147,58,0.1)"
                        : "transparent",
                    }}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-gradient">
                      <span className="font-heading text-[13px] text-white">
                        {initialsFromFullName(m.full_name || displayName(m))}
                      </span>
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-bold text-foreground">
                        {displayName(m)}
                      </p>
                      <p className="truncate text-xs font-medium text-muted">
                        {m.email ?? "—"}
                      </p>
                    </div>
                  </button>
                );
              })
              )}
            </div>

            {/* Detail panel */}
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <div className="flex items-center gap-3.5 rounded-[20px] border border-border bg-card p-5 shadow-[0_12px_26px_-18px_rgba(17,17,17,0.16)]">
                <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-brand-gradient">
                  <span className="font-heading text-base text-white">
                    {initialsFromFullName(
                      active.full_name || displayName(active),
                    )}
                  </span>
                </span>
                <div>
                  <p className="text-[17px] font-extrabold text-foreground">
                    {displayName(active)}
                  </p>
                  <p className="mt-0.5 text-[13px] font-medium text-muted">
                    {active.email ?? "—"}
                  </p>
                </div>
              </div>

              {weeksLoading && (
                <div className="flex items-center justify-center rounded-[20px] border border-border bg-card py-12 shadow-[0_12px_26px_-18px_rgba(17,17,17,0.16)]">
                  <HeartLoader size={96} />
                </div>
              )}

              {weeksError && !weeksLoading && (
                <p className="text-xs text-brand-orange-dark">{weeksError}</p>
              )}

              {!weeksLoading && !weeksError && weeks.length === 0 && (
                <p className="text-sm text-muted">
                  No weeks logged yet for this member.
                </p>
              )}

              {!weeksLoading && weeks.length > 0 && (
                <div className="flex flex-col gap-2.5">
                  {weeks.map((week) => {
                    const expanded = expandedWeekStart === week.week_start;
                    const status = computeStatus(week);
                    const statusStyle = STATUS_STYLES[status.key];
                    const detail = detailCache[week.week_start];
                    const isExpandLoading = expandLoading === week.week_start;

                    const trackerDays = countTrackerDaysLogged(
                      detail?.tracker ?? null,
                    );
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
                        icon: (
                          <ClipboardCheckIcon className="h-3.5 w-3.5 text-white" />
                        ),
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
                        <button
                          type="button"
                          onClick={() => toggleWeek(week.week_start)}
                          className="flex w-full cursor-pointer items-center gap-3 px-[18px] py-4 text-left"
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
                          <ChevronDownIcon
                            className={`h-4 w-4 shrink-0 text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
                          />
                        </button>

                        {expanded && (
                          <div className="px-[18px] pb-5">
                            <div className="mb-4 h-px bg-border" />
                            {isExpandLoading || (!detail && !expandError) ? (
                              <p className="text-xs font-medium text-muted">
                                Loading week details…
                              </p>
                            ) : expandError && !detail ? (
                              <p className="text-xs text-brand-orange-dark">
                                {expandError}
                              </p>
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
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
