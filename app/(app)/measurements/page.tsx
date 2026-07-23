"use client";

import { useMemo, useState } from "react";
import { ChartIcon, RulerIcon } from "@/components/icons";

type MetricKey = "weight" | "waist" | "hips" | "chest";

type Entry = {
  date: string;
  weight: number;
  waist: number;
  hips: number;
  chest: number;
};

const METRICS: { key: MetricKey; label: string; placeholder: string }[] = [
  { key: "weight", label: "Weight", placeholder: "e.g. 178" },
  { key: "waist", label: "Waist", placeholder: "e.g. 36.5" },
  { key: "hips", label: "Hips", placeholder: "e.g. 40" },
  { key: "chest", label: "Chest", placeholder: "e.g. 43.5" },
];

const INITIAL_ENTRIES: Entry[] = [
  { date: "May 28", weight: 186, waist: 39.5, hips: 42, chest: 45 },
  { date: "Jun 4", weight: 184, waist: 38.75, hips: 41.5, chest: 44.5 },
  { date: "Jun 11", weight: 183, waist: 38.25, hips: 41.25, chest: 44.25 },
  { date: "Jun 18", weight: 181, waist: 37.5, hips: 41, chest: 44 },
  { date: "Jun 25", weight: 180, waist: 37, hips: 40.5, chest: 43.75 },
  { date: "Jul 2", weight: 178, waist: 36.5, hips: 40, chest: 43.5 },
];

const CHART_W = 600;
const CHART_H = 220;
const PAD_X = 24;
const PAD_TOP = 16;
const PAD_BOTTOM = 16;

export default function MeasurementsPage() {
  const [entries, setEntries] = useState<Entry[]>(INITIAL_ENTRIES);
  const [activeMetric, setActiveMetric] = useState<MetricKey>("weight");
  const [form, setForm] = useState({ date: "", weight: "", waist: "", hips: "", chest: "" });
  const [showSaved, setShowSaved] = useState(false);

  function setFormField(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    if (!form.weight && !form.waist && !form.hips && !form.chest) return;
    const last = entries.at(-1);
    const entry: Entry = {
      date: form.date || "New",
      weight: parseFloat(form.weight) || last?.weight || 0,
      waist: parseFloat(form.waist) || last?.waist || 0,
      hips: parseFloat(form.hips) || last?.hips || 0,
      chest: parseFloat(form.chest) || last?.chest || 0,
    };
    setEntries((prev) => [...prev, entry]);
    setForm({ date: "", weight: "", waist: "", hips: "", chest: "" });
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 2200);
  }

  const chart = useMemo(() => {
    const values = entries.map((e) => e[activeMetric]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const n = values.length;

    const points = entries.map((e, i) => {
      const x = n === 1 ? CHART_W / 2 : PAD_X + (i * (CHART_W - 2 * PAD_X)) / (n - 1);
      const y = PAD_TOP + (1 - (e[activeMetric] - min) / range) * (CHART_H - PAD_TOP - PAD_BOTTOM);
      return { x, y, dateLabel: e.date };
    });

    const linePath = points
      .map((p, i) => (i === 0 ? "M" : "L") + p.x.toFixed(1) + "," + p.y.toFixed(1))
      .join(" ");
    const areaPath = points.length
      ? `${linePath} L${points.at(-1)!.x.toFixed(1)},${CHART_H - PAD_BOTTOM} L${points[0].x.toFixed(1)},${CHART_H - PAD_BOTTOM} Z`
      : "";

    const gridLines = [0, 0.5, 1].map((t) => PAD_TOP + t * (CHART_H - PAD_TOP - PAD_BOTTOM));

    const current = values.at(-1) ?? 0;
    const first = values[0] ?? 0;
    const delta = current - first;

    return { points, linePath, areaPath, gridLines, current, delta };
  }, [entries, activeMetric]);

  const metricLabel = METRICS.find((m) => m.key === activeMetric)!.label;

  return (
    <div className="flex flex-1 flex-col gap-4 px-5 py-6 md:mx-auto md:w-full md:max-w-3xl md:px-10 md:py-10">
      <div>
        <h1 className="font-heading text-[32px] uppercase leading-none tracking-wide text-foreground">
          Weight &amp; Measurements
        </h1>
        <p className="mt-0.5 font-script text-xl font-bold text-brand-orange-dark">
          Progress you can see.
        </p>
      </div>

      {/* Log New Entry */}
      <section className="rounded-[20px] border border-border bg-card p-5 shadow-[0_12px_26px_-18px_rgba(17,17,17,0.16)]">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white">
            <RulerIcon className="h-4 w-4" />
          </span>
          <h2 className="font-heading text-base uppercase tracking-wide text-foreground">
            Log New Entry
          </h2>
        </div>

        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">
          Date
        </p>
        <input
          type="text"
          value={form.date}
          onChange={(e) => setFormField("date", e.target.value)}
          placeholder="e.g. Jul 23"
          className="w-full rounded-[10px] border border-border bg-background px-[13px] py-3 text-[14px] font-semibold text-foreground outline-none focus:border-brand-orange"
        />

        <div className="mt-4 grid grid-cols-2 gap-3">
          {METRICS.map((field) => (
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
          ))}
        </div>

        <button
          type="button"
          onClick={handleSave}
          className="mt-[18px] w-full cursor-pointer rounded-2xl bg-brand-gradient p-3.5 text-center transition-transform hover:-translate-y-0.5"
        >
          <span className="font-heading text-sm uppercase tracking-wide text-white">
            Save Entry
          </span>
        </button>

        {showSaved && (
          <p className="mt-2.5 text-center text-xs font-bold text-[#8fae8a]">
            Entry saved
          </p>
        )}
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
              stroke="rgba(17,17,17,0.07)"
              strokeWidth={1}
            />
          ))}
          <path
            d={chart.areaPath}
            fill="url(#trendFill)"
            stroke="none"
          />
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
            <circle key={i} cx={pt.x} cy={pt.y} r={5} fill="#ffffff" stroke="#EC4A31" strokeWidth={3} />
          ))}
        </svg>
        <div className="mt-2 flex justify-between px-0.5">
          {chart.points.map((pt, i) => (
            <span key={i} className="flex-1 text-center text-[10.5px] font-semibold text-muted">
              {pt.dateLabel}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
