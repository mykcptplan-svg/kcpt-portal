"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AutosaveStatus from "@/components/AutosaveStatus";
import HeartLoader from "@/components/HeartLoader";
import TipsCard from "@/components/measurements/TipsCard";
import { ChartIcon, RulerIcon } from "@/components/icons";
import { getWeeksList } from "@/lib/api/history";
import {
  getWeightMeasurement,
  saveWeightMeasurement,
} from "@/lib/api/measurements";
import { useDebouncedSave } from "@/lib/hooks/useDebouncedSave";
import { createClient } from "@/lib/supabase/client";
import { getWeekStart } from "@/lib/week";
import type { WeightMeasurement } from "@/types";

type MetricKey = "weight" | "waist" | "hips";

type Entry = {
  week_start: string;
  weight: number | null;
  waist: number | null;
  hips: number | null;
};

type FormState = {
  stone: string;
  lbs: string;
  waist: string;
  hips: string;
};

type ExtraFormState = {
  arm: string;
  thigh: string;
  calve: string;
};

const METRICS: { key: MetricKey; label: string }[] = [
  { key: "weight", label: "Weight" },
  { key: "waist", label: "Waist" },
  { key: "hips", label: "Hips" },
];

const EXTRA_FIELDS = [
  { key: "arm", label: "Arm", placeholder: "e.g. 13.5", unit: "in" },
  { key: "thigh", label: "Thigh", placeholder: "e.g. 22", unit: "in" },
  { key: "calve", label: "Calve", placeholder: "e.g. 15", unit: "in" },
] as const;

const CHART_W = 600;
const CHART_H = 220;
const PAD_X = 24;
const PAD_TOP = 16;
const PAD_BOTTOM = 16;

function formatChartLabel(weekStart: string): string {
  const [year, month, day] = weekStart.split("-").map(Number);
  const monday = new Date(year, month - 1, day);
  return monday.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function totalLbsFromStoneLbs(stone: number, lbs: number): number {
  return stone * 14 + lbs;
}

function stoneLbsFromTotal(totalLbs: number): { stone: number; lbs: number } {
  const stone = Math.floor(totalLbs / 14);
  const lbs = Math.round((totalLbs - stone * 14) * 100) / 100;
  return { stone, lbs };
}

function emptyForm(): FormState {
  return { stone: "", lbs: "", waist: "", hips: "" };
}

function emptyExtraForm(): ExtraFormState {
  return { arm: "", thigh: "", calve: "" };
}

function formFromEntry(entry: Entry | null | undefined): FormState {
  if (!entry) return emptyForm();
  const weightParts =
    entry.weight != null ? stoneLbsFromTotal(entry.weight) : null;
  return {
    stone: weightParts != null ? String(weightParts.stone) : "",
    lbs: weightParts != null ? String(weightParts.lbs) : "",
    waist: entry.waist != null ? String(entry.waist) : "",
    hips: entry.hips != null ? String(entry.hips) : "",
  };
}

function extraFormFromEntry(row: WeightMeasurement | null): ExtraFormState {
  if (!row) return emptyExtraForm();
  return {
    arm: row.arm != null ? String(row.arm) : "",
    thigh: row.thigh != null ? String(row.thigh) : "",
    calve: row.calve != null ? String(row.calve) : "",
  };
}

function entryFromRow(row: {
  week_start: string;
  weight: number | null;
  waist: number | null;
  hips: number | null;
}): Entry {
  return {
    week_start: row.week_start,
    weight: row.weight,
    waist: row.waist,
    hips: row.hips,
  };
}

function parsePositive(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function parseNonNegative(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export default function MeasurementsPage() {
  const supabase = useMemo(() => createClient(), []);
  const weekStart = useMemo(() => getWeekStart(), []);

  const [entries, setEntries] = useState<Entry[]>([]);
  const [activeMetric, setActiveMetric] = useState<MetricKey>("weight");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [extraForm, setExtraForm] = useState<ExtraFormState>(emptyExtraForm);
  const [hasSavedEntry, setHasSavedEntry] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const accessTokenRef = useRef<string | null>(null);
  const startedEmptyRef = useRef(false);

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
        const token = session.access_token;

        const [currentRow, weeks] = await Promise.all([
          getWeightMeasurement(weekStart, token),
          getWeeksList(token),
        ]);
        if (cancelled) return;

        startedEmptyRef.current = !currentRow;

        const measuredWeeks = weeks.filter((w) => w.has_measurements);
        const historyRows = await Promise.all(
          measuredWeeks.map((w) => getWeightMeasurement(w.week_start, token)),
        );
        if (cancelled) return;

        const historyEntries = historyRows
          .filter((row): row is NonNullable<typeof row> => row !== null)
          .map(entryFromRow)
          .sort((a, b) => a.week_start.localeCompare(b.week_start));

        setEntries(historyEntries);
        setForm(formFromEntry(currentRow ? entryFromRow(currentRow) : null));
        setExtraForm(extraFormFromEntry(currentRow));
        if (currentRow) setHasSavedEntry(true);
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Unable to load measurements.",
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
  }, [supabase, weekStart]);

  function setFormField(key: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setExtraFormField(key: keyof ExtraFormState, value: string) {
    setExtraForm((prev) => ({ ...prev, [key]: value }));
  }

  const saveValue = useMemo(
    () => ({ ...form, ...extraForm }),
    [form, extraForm],
  );

  const { status, error: saveError } = useDebouncedSave(
    saveValue,
    async (value) => {
      const accessToken = accessTokenRef.current;
      if (!accessToken) throw new Error("Not logged in.");

      const stonePart = parseNonNegative(value.stone);
      const lbsPart = parseNonNegative(value.lbs);
      const hasWeightInput =
        value.stone.trim() !== "" || value.lbs.trim() !== "";
      const weight = hasWeightInput
        ? totalLbsFromStoneLbs(stonePart ?? 0, lbsPart ?? 0)
        : null;
      const waist = parsePositive(value.waist);
      const hips = parsePositive(value.hips);
      const arm = parsePositive(value.arm);
      const thigh = parsePositive(value.thigh);
      const calve = parsePositive(value.calve);

      const hasAny =
        (weight != null && weight > 0) ||
        waist != null ||
        hips != null ||
        arm != null ||
        thigh != null ||
        calve != null;
      if (!hasAny) {
        return false;
      }

      await saveWeightMeasurement(
        {
          week_start: weekStart,
          weight: weight != null && weight > 0 ? weight : null,
          waist,
          hips,
          arm,
          thigh,
          calve,
        },
        accessToken,
      );

      const saved: Entry = {
        week_start: weekStart,
        weight: weight != null && weight > 0 ? weight : null,
        waist,
        hips,
      };
      setEntries((prev) => {
        const idx = prev.findIndex((e) => e.week_start === weekStart);
        if (idx === -1) {
          return [...prev, saved].sort((a, b) =>
            a.week_start.localeCompare(b.week_start),
          );
        }
        const next = prev.slice();
        next[idx] = saved;
        return next;
      });
      setHasSavedEntry(true);
    },
    { skip: loading },
  );

  const showForm = !hasSavedEntry || isEditing || startedEmptyRef.current;

  const chart = useMemo(() => {
    const empty = {
      points: [] as { x: number; y: number; dateLabel: string }[],
      linePath: "",
      areaPath: "",
      gridLines: [0, 0.5, 1].map(
        (t) => PAD_TOP + t * (CHART_H - PAD_TOP - PAD_BOTTOM),
      ),
      current: 0,
      delta: 0,
    };

    const chartEntries = entries.filter((e) => e[activeMetric] != null);
    if (chartEntries.length === 0) {
      return empty;
    }

    const values = chartEntries.map((e) => e[activeMetric] as number);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const n = values.length;

    const points = chartEntries.map((e, i) => {
      const x = n === 1 ? CHART_W / 2 : PAD_X + (i * (CHART_W - 2 * PAD_X)) / (n - 1);
      const y =
        PAD_TOP +
        (1 - ((e[activeMetric] as number) - min) / range) *
          (CHART_H - PAD_TOP - PAD_BOTTOM);
      return { x, y, dateLabel: formatChartLabel(e.week_start) };
    });

    const linePath = points
      .map((p, i) => (i === 0 ? "M" : "L") + p.x.toFixed(1) + "," + p.y.toFixed(1))
      .join(" ");
    const areaPath = points.length
      ? `${linePath} L${points.at(-1)!.x.toFixed(1)},${CHART_H - PAD_BOTTOM} L${points[0].x.toFixed(1)},${CHART_H - PAD_BOTTOM} Z`
      : "";

    const gridLines = [0, 0.5, 1].map(
      (t) => PAD_TOP + t * (CHART_H - PAD_TOP - PAD_BOTTOM),
    );

    const current = values.at(-1) ?? 0;
    const first = values[0] ?? 0;
    const delta = current - first;

    return { points, linePath, areaPath, gridLines, current, delta };
  }, [entries, activeMetric]);

  const metricLabel = METRICS.find((m) => m.key === activeMetric)!.label;

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
          Weight &amp; Measurements
        </h1>
        <p className="mt-0.5 font-script text-xl font-bold text-brand-orange-dark">
          Track more than just your weight.
        </p>
      </div>

      <AutosaveStatus status={status} />

      <TipsCard
        title="Weight Tips"
        intro="If you choose to weigh yourself, these tips will help you get the most accurate picture of your progress:"
        items={[
          "Weigh yourself on Monday and Friday mornings.",
          "Weigh yourself after a wee, before eating or drinking, naked.",
          "Use the same scales in the same spot in the house every time.",
          "Your weight will fluctuate daily, that's normal and nothing to do with body fat.",
          "If the scales affect your mindset, remember they're completely optional. Progress photos, measurements, how your clothes fit and how you feel are all equally valuable ways to measure success.",
          "Assess your progress over time, not from one weigh-in or even one week. Always look at the overall trend rather than individual numbers.",
        ]}
      />

      <TipsCard
        title="Body Measurement Tips"
        items={[
          "Take your body measurements every 4 weeks, not every week.",
          "Use the same tape measure and measure the same areas each time.",
          "Record your measurements in inches (or centimetres, depending on the unit you choose).",
        ]}
      />

      <TipsCard
        title="Other Great Ways to Measure Progress"
        intro="Remember, the scales tell lies. Don't let them dictate your mood. They're notorious for hiding progress, so always look at the bigger picture."
        items={[
          "Progress photos are a fantastic way to see changes over time — take them every 4 weeks, alongside your measurements.",
          "My favourite way to measure progress is by choosing one favourite item of clothing and trying it on every couple of weeks. Often you'll notice your clothes fitting differently before you see a big change on the scales.",
          "Pay attention to how you feel, your energy levels, your strength and your confidence too.",
        ]}
      />

      {/* This week's entry — log or read-only */}
      <section className="rounded-[20px] border border-border bg-card p-5 shadow-[0_12px_26px_-18px_rgba(17,17,17,0.16)]">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white">
            <RulerIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h2 className="font-heading text-base uppercase tracking-wide text-foreground">
                {hasSavedEntry ? "This Week's Entry" : "Update Your Progress"}
              </h2>
              {hasSavedEntry && !isEditing && (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="cursor-pointer rounded-full border border-border bg-card px-3 py-1 text-[12px] font-bold text-muted transition-colors hover:text-foreground"
                >
                  Edit
                </button>
              )}
            </div>
            {!hasSavedEntry && (
              <p className="mt-1 text-[12px] text-muted">
                You can log your weight weekly if you wish. Body measurements
                are best taken every 4 weeks for a more meaningful comparison.
              </p>
            )}
            {hasSavedEntry && !isEditing && (
              <p className="mt-1 text-[12px] text-muted">
                Only edit if you made a mistake — this won&apos;t create a new
                entry.
              </p>
            )}
          </div>
        </div>

        <p className="mb-4 text-[12px] font-medium leading-snug text-muted">
          Measurements every 4 weeks are enough — you can still log here any
          week if you want to.
        </p>

        <div className="grid grid-cols-2 gap-3">
          {(
            [
              { key: "stone", label: "Stone", placeholder: "e.g. 12", unit: "st" },
              { key: "lbs", label: "Lbs", placeholder: "e.g. 6", unit: "lbs" },
              { key: "waist", label: "Waist", placeholder: "e.g. 36.5", unit: "in" },
              { key: "hips", label: "Hips", placeholder: "e.g. 40", unit: "in" },
            ] as const
          ).map((field) =>
            showForm ? (
              <div key={field.key}>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">
                  {field.label}
                </p>
                <input
                  type="number"
                  inputMode="decimal"
                  value={form[field.key]}
                  onChange={(e) => setFormField(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full rounded-[10px] border border-border bg-background px-[13px] py-3 text-[14px] font-semibold text-foreground outline-none focus:border-brand-orange"
                />
              </div>
            ) : (
              <div
                key={field.key}
                className="w-full rounded-[14px] border border-border bg-background px-[13px] py-3"
              >
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted">
                  {field.label}
                </p>
                {form[field.key].trim() !== "" ? (
                  <p className="text-[16px] font-bold text-foreground">
                    {form[field.key]}{" "}
                    <span className="text-[12px] font-semibold text-muted">
                      {field.unit}
                    </span>
                  </p>
                ) : (
                  <p className="text-[16px] font-bold text-foreground">—</p>
                )}
              </div>
            ),
          )}

          {EXTRA_FIELDS.map((field) =>
            showForm ? (
              <div key={field.key}>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">
                  {field.label}
                </p>
                <input
                  type="number"
                  inputMode="decimal"
                  value={extraForm[field.key]}
                  onChange={(e) => setExtraFormField(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full rounded-[10px] border border-border bg-background px-[13px] py-3 text-[14px] font-semibold text-foreground outline-none focus:border-brand-orange"
                />
              </div>
            ) : (
              <div
                key={field.key}
                className="w-full rounded-[14px] border border-border bg-background px-[13px] py-3"
              >
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted">
                  {field.label}
                </p>
                {extraForm[field.key].trim() !== "" ? (
                  <p className="text-[16px] font-bold text-foreground">
                    {extraForm[field.key]}{" "}
                    <span className="text-[12px] font-semibold text-muted">
                      {field.unit}
                    </span>
                  </p>
                ) : (
                  <p className="text-[16px] font-bold text-foreground">—</p>
                )}
              </div>
            ),
          )}
        </div>
      </section>

      {/* Trend */}
      <section className="rounded-[20px] border border-border bg-card p-5 shadow-[0_12px_26px_-18px_rgba(17,17,17,0.16)]">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white">
            <ChartIcon className="h-4 w-4" />
          </span>
          <h2 className="font-heading text-base uppercase tracking-wide text-foreground">
            Your Trend
          </h2>
        </div>

        <div className="mb-[18px] flex flex-wrap gap-2">
          {METRICS.map((m) => {
            const active = m.key === activeMetric;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setActiveMetric(m.key)}
                className={`cursor-pointer rounded-full px-4 py-2 text-[12.5px] font-bold transition-colors ${
                  active
                    ? "bg-brand-gradient text-white"
                    : "border border-border bg-card text-muted"
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        {chart.points.length === 0 ? (
          <p className="text-sm text-muted">
            No {metricLabel.toLowerCase()} measurements yet. Log this metric to
            start your trend.
          </p>
        ) : (
          <>
            <div className="mb-3.5 flex items-baseline gap-3">
              <span className="font-heading text-[30px] text-foreground">
                {chart.current} · {metricLabel}
              </span>
              <span
                className="text-[13px] font-bold"
                style={{
                  color:
                    chart.delta === 0
                      ? "var(--muted)"
                      : chart.delta < 0
                        ? "#6a9a63"
                        : "var(--brand-orange-dark)",
                }}
              >
                {chart.delta === 0
                  ? "No change"
                  : `${chart.delta > 0 ? "+" : ""}${chart.delta.toFixed(1)} since start`}
              </span>
            </div>

            <svg
              viewBox={`0 0 ${CHART_W} ${CHART_H}`}
              className="block w-full overflow-visible"
              style={{ height: "auto" }}
            >
              {chart.gridLines.map((y, i) => (
                <line
                  key={i}
                  x1={0}
                  x2={CHART_W}
                  y1={y}
                  y2={y}
                  stroke="var(--border)"
                  strokeWidth={1}
                />
              ))}
              <path d={chart.areaPath} fill="url(#trendFill)" stroke="none" />
              <path
                d={chart.linePath}
                fill="none"
                stroke="#EC4A31"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <defs>
                <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F7A235" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#F7A235" stopOpacity={0} />
                </linearGradient>
              </defs>
              {chart.points.map((pt, i) => (
                <circle
                  key={i}
                  cx={pt.x}
                  cy={pt.y}
                  r={5}
                  fill="#ffffff"
                  stroke="#EC4A31"
                  strokeWidth={3}
                />
              ))}
            </svg>
            <div className="mt-2 flex justify-between px-0.5">
              {chart.points.map((pt, i) => (
                <span
                  key={i}
                  className="flex-1 text-center text-[10.5px] font-semibold text-muted"
                >
                  {pt.dateLabel}
                </span>
              ))}
            </div>
          </>
        )}
      </section>

      {(loadError || saveError) && (
        <p className="text-xs text-brand-orange-dark">{loadError ?? saveError}</p>
      )}
    </div>
  );
}
