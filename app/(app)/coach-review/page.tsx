"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import HeartLoader from "@/components/HeartLoader";
import { ChartIcon, ClipboardCheckIcon, PlanIcon } from "@/components/icons";
import {
  getMembersList,
  type MemberListItem,
} from "@/lib/api/admin";
import { getWeeklyBasePlan } from "@/lib/api/basePlan";
import { getWeeksList } from "@/lib/api/history";
import { getWeightMeasurement } from "@/lib/api/measurements";
import { getWeeklyTracker } from "@/lib/api/tracker";
import { createClient } from "@/lib/supabase/client";
import {
  countNonNegotiablesHit,
  countTrackerDaysLogged,
  findClosestEarlierMeasuredWeek,
} from "@/lib/trackerStats";
import { getWeekStart } from "@/lib/week";
import type {
  WeeklyBasePlan,
  WeeklyTrackerEntry,
  WeightMeasurement,
} from "@/types";

type MemberDetailCache = {
  plan: WeeklyBasePlan | null;
  tracker: WeeklyTrackerEntry | null;
  measurement: WeightMeasurement | null;
  priorWeekStart: string | null;
};

function measurementCacheKey(memberId: string, weekStart: string): string {
  return `${memberId}:${weekStart}`;
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

function formatLastLogged(weekStart: string): string {
  const [year, month, day] = weekStart.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function deltaLabel(delta: number): string {
  if (delta === 0) return "No change";
  const formatted = `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`;
  return `${formatted} since last week`;
}

function deltaColor(delta: number): string {
  if (delta === 0) return "rgba(26,22,19,0.45)";
  return delta < 0 ? "#6a9a63" : "var(--brand-orange-dark)";
}

export default function CoachReviewPage() {
  const supabase = useMemo(() => createClient(), []);
  const accessTokenRef = useRef<string | null>(null);
  const weekStart = useMemo(() => getWeekStart(), []);

  const [members, setMembers] = useState<MemberListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const [detailCache, setDetailCache] = useState<
    Record<string, MemberDetailCache>
  >({});
  const [measurementByWeek, setMeasurementByWeek] = useState<
    Record<string, WeightMeasurement | null>
  >({});
  const measurementByWeekRef = useRef(measurementByWeek);
  measurementByWeekRef.current = measurementByWeek;

  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!selectedMemberId) return;

    const token = accessTokenRef.current;
    if (!token) return;

    const memberId = selectedMemberId;
    let cancelled = false;

    async function fetchDetail() {
      setDetailLoading(memberId);
      setDetailError(null);
      try {
        const [plan, tracker, measurement, weeks] = await Promise.all([
          getWeeklyBasePlan(weekStart, token!, memberId).catch(() => null),
          getWeeklyTracker(weekStart, token!, memberId).catch(() => null),
          getWeightMeasurement(weekStart, token!, memberId).catch(() => null),
          getWeeksList(token!, memberId),
        ]);

        if (cancelled) return;

        const priorWeek = findClosestEarlierMeasuredWeek(weeks, weekStart);
        const priorKey = priorWeek
          ? measurementCacheKey(memberId, priorWeek.week_start)
          : null;
        const priorAlreadyCached =
          priorKey != null && priorKey in measurementByWeekRef.current;

        const priorMeasurement =
          priorWeek && !priorAlreadyCached
            ? await getWeightMeasurement(
                priorWeek.week_start,
                token!,
                memberId,
              ).catch(() => null)
            : priorKey != null
              ? (measurementByWeekRef.current[priorKey] ?? null)
              : null;

        if (cancelled) return;

        setDetailCache((prev) => ({
          ...prev,
          [memberId]: {
            plan,
            tracker,
            measurement,
            priorWeekStart: priorWeek?.week_start ?? null,
          },
        }));

        setMeasurementByWeek((prev) => {
          const next = { ...prev };
          next[measurementCacheKey(memberId, weekStart)] = measurement;
          if (priorKey != null) {
            next[priorKey] = priorAlreadyCached
              ? prev[priorKey]
              : priorMeasurement;
          }
          return next;
        });
      } catch (err) {
        if (!cancelled) {
          setDetailError(
            err instanceof Error
              ? err.message
              : "Unable to load member details.",
          );
        }
      } finally {
        if (!cancelled) setDetailLoading(null);
      }
    }

    void fetchDetail();
    return () => {
      cancelled = true;
    };
    // detailCache intentionally omitted — used for render after fetch, not to skip refetch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMemberId, weekStart]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <HeartLoader size={192} />
      </div>
    );
  }

  const active = members.find((m) => m.id === selectedMemberId) ?? null;
  const detail = active ? detailCache[active.id] : undefined;
  const isDetailLoading = active != null && detailLoading === active.id;

  const daysLogged = countTrackerDaysLogged(detail?.tracker ?? null);
  const nonNegotiablesHit = countNonNegotiablesHit(detail?.tracker ?? null);
  const pct = Math.round((daysLogged / 7) * 100);

  const currentMeasurement = detail?.measurement ?? null;
  const priorMeasurement =
    active && detail?.priorWeekStart
      ? (measurementByWeek[
          measurementCacheKey(active.id, detail.priorWeekStart)
        ] ?? null)
      : null;
  const weightDelta =
    currentMeasurement != null && priorMeasurement != null
      ? currentMeasurement.weight - priorMeasurement.weight
      : null;

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
          {/* Mobile: horizontal scroll chips */}
          <div className="flex gap-2.5 overflow-x-auto px-0.5 pb-1.5 md:hidden">
            {members.map((m) => {
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
            })}
          </div>

          <div className="flex flex-wrap items-start gap-4 md:flex-nowrap">
            {/* Desktop: sidebar member list */}
            <div className="hidden w-full max-w-[260px] shrink-0 flex-col gap-1.5 rounded-[20px] border border-border bg-card p-3.5 shadow-[0_12px_26px_-18px_rgba(17,17,17,0.16)] md:flex">
              {members.map((m) => {
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
              })}
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

              {isDetailLoading && (
                <div className="flex items-center justify-center rounded-[20px] border border-border bg-card py-12 shadow-[0_12px_26px_-18px_rgba(17,17,17,0.16)]">
                  <HeartLoader size={96} />
                </div>
              )}

              {detailError && !isDetailLoading && !detail && (
                <p className="text-xs text-brand-orange-dark">{detailError}</p>
              )}

              {detail && !isDetailLoading && (
                <>
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
                    <p className="text-[13.5px] font-semibold text-foreground">
                      {detail.plan
                        ? "All meals filled in for this week"
                        : "Not filled in yet"}
                    </p>
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
                        {daysLogged} of 7 days logged
                      </p>
                      <p className="text-xs font-bold text-brand-orange-dark">
                        {nonNegotiablesHit} non-negotiables hit
                      </p>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-black/[0.07]">
                      <div
                        className="h-full rounded-full bg-brand-gradient"
                        style={{ width: `${pct}%` }}
                      />
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
                    {currentMeasurement == null ? (
                      <p className="text-[13.5px] font-semibold text-foreground">
                        No entry this week
                      </p>
                    ) : (
                      <>
                        <div className="mb-1.5 flex items-baseline gap-3">
                          <span className="font-heading text-[26px] text-foreground">
                            {currentMeasurement.weight}
                          </span>
                          <span
                            className="text-[13px] font-bold"
                            style={{ color: deltaColor(weightDelta ?? 0) }}
                          >
                            {deltaLabel(weightDelta ?? 0)}
                          </span>
                        </div>
                        <p className="text-xs font-medium text-muted">
                          Last logged {formatLastLogged(weekStart)}
                        </p>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
