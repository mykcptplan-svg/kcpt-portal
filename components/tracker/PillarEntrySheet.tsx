"use client";

import { useEffect, useRef } from "react";

export type PillarEntryMetric = "calories" | "protein" | "water" | "steps";

const METRIC_META: Record<
  PillarEntryMetric,
  { title: string; unit: string | null; step?: string }
> = {
  calories: { title: "Calories", unit: "kcal" },
  protein: { title: "Protein", unit: "g" },
  water: { title: "Water", unit: "L", step: "0.1" },
  steps: { title: "Steps", unit: null },
};

export default function PillarEntrySheet({
  metric,
  dayName,
  value,
  disabled = false,
  onClose,
  onNumberChange,
  onMarkEatenWell,
}: {
  metric: PillarEntryMetric;
  dayName: string;
  value: number | true | null;
  disabled?: boolean;
  onClose: () => void;
  onNumberChange: (raw: string) => void;
  onMarkEatenWell?: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const meta = METRIC_META[metric];
  const inputValue = typeof value === "number" ? String(value) : "";

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (
        target instanceof Node &&
        panelRef.current &&
        !panelRef.current.contains(target)
      ) {
        onClose();
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-foreground/40" aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${dayName} ${meta.title}`}
        className="relative z-10 w-full max-w-[420px] rounded-t-[24px] border border-border border-b-0 bg-card px-5 pb-6 pt-3 shadow-[0_-12px_40px_-16px_rgba(17,17,17,0.28)]"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted/50" aria-hidden />
        <p className="mb-5 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
          {dayName} · {meta.title}
        </p>

        <div className="mb-5 flex items-baseline justify-center gap-2">
          <input
            ref={inputRef}
            type="number"
            inputMode="decimal"
            min={0}
            step={meta.step}
            value={inputValue}
            onChange={(e) => onNumberChange(e.target.value)}
            disabled={disabled}
            aria-label={`${meta.title} value`}
            className="w-[min(100%,11rem)] rounded-xl border-2 border-brand-orange bg-background px-3 py-2 text-center font-heading text-[32px] leading-none text-foreground outline-none disabled:cursor-not-allowed disabled:opacity-60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          {meta.unit && (
            <span className="text-sm font-semibold text-muted">{meta.unit}</span>
          )}
        </div>

        {metric === "calories" && onMarkEatenWell && (
          <button
            type="button"
            onClick={() => {
              onMarkEatenWell();
              onClose();
            }}
            disabled={disabled}
            className="mb-3 flex h-11 w-full items-center justify-center rounded-xl border border-border bg-background text-[14px] font-semibold text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          >
            Just mark eaten well ✓
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          className="flex h-11 w-full items-center justify-center rounded-xl bg-brand-gradient text-[14px] font-bold text-white"
        >
          Done
        </button>
      </div>
    </div>
  );
}
