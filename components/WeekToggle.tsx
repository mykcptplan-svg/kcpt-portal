"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * "This Week" / "Next Week (draft)" pill toggle, shared by My Food Plan and
 * My Success Tracker. Only rendered by the parent when a next-week draft
 * exists (see hasNextWeekDraft in lib/api/nextWeekDraft.ts usage on each
 * page) — this component itself has no opinion on whether a draft exists.
 */
export default function WeekToggle({
  pathname,
  nextWeekStart,
  viewingNextWeek,
  onDiscard,
  discarding,
  discardError,
}: {
  pathname: string;
  nextWeekStart: string;
  viewingNextWeek: boolean;
  onDiscard: () => void;
  discarding: boolean;
  discardError: string | null;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full border border-border bg-card p-1">
          <Link
            href={pathname}
            className={`rounded-full px-4 py-1.5 text-[12px] font-bold uppercase tracking-wide transition-colors ${
              !viewingNextWeek
                ? "bg-brand-gradient text-white"
                : "text-muted hover:text-foreground"
            }`}
          >
            This Week
          </Link>
          <Link
            href={`${pathname}?week_start=${nextWeekStart}`}
            className={`rounded-full px-4 py-1.5 text-[12px] font-bold uppercase tracking-wide transition-colors ${
              viewingNextWeek
                ? "bg-brand-gradient text-white"
                : "text-muted hover:text-foreground"
            }`}
          >
            Next Week (draft)
          </Link>
        </div>

        {confirming ? (
          <div className="flex flex-wrap items-center gap-2 text-[12px] font-semibold">
            <span className="text-muted">Discard this draft?</span>
            <button
              type="button"
              onClick={onDiscard}
              disabled={discarding}
              className="text-brand-orange-dark underline decoration-dotted underline-offset-2 disabled:opacity-60"
            >
              {discarding ? "Discarding…" : "Yes, discard"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={discarding}
              className="text-muted underline decoration-dotted underline-offset-2 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="text-[12px] font-semibold text-muted underline decoration-dotted underline-offset-2 transition-colors hover:text-brand-orange-dark"
          >
            Discard draft
          </button>
        )}
      </div>

      {viewingNextWeek && (
        <span className="inline-flex w-fit items-center rounded-full bg-tip-bg px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide text-brand-orange-dark">
          Editing next week&apos;s draft
        </span>
      )}

      {discardError && (
        <p className="text-xs text-brand-orange-dark">{discardError}</p>
      )}
    </div>
  );
}
