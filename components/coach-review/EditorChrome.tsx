"use client";

import { useEffect } from "react";

/**
 * Shared chrome for the Coach Review editors (KCPT Plan, Focus): the sticky
 * save bar and the "unsaved changes" leave dialog.
 */

/** Sticky save bar. On mobile it sits above NavShell's bottom bar. */
export function SaveBar({
  statusText,
  statusDot,
  isError,
  saveLabel,
  canSave,
  onSave,
}: {
  statusText: string;
  statusDot: string;
  isError: boolean;
  saveLabel: string;
  canSave: boolean;
  onSave: () => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-28 z-40 flex justify-center px-4 md:bottom-4 md:left-56">
      <div className="pointer-events-auto flex w-full max-w-[688px] items-center justify-between gap-3 rounded-[20px] border border-border bg-card/92 py-2.5 pl-[18px] pr-2.5 shadow-[0_20px_40px_-16px_rgba(17,17,17,0.22)] backdrop-blur-md">
        <div
          className="flex min-w-0 items-center gap-2"
          role="status"
          aria-live="polite"
        >
          <span
            aria-hidden
            className="h-[7px] w-[7px] shrink-0 rounded-full"
            style={{ background: statusDot }}
          />
          <span
            className="text-[12px] font-bold tracking-[0.02em]"
            style={{
              color: isError ? "var(--revoke-text)" : "var(--muted)",
            }}
          >
            {statusText}
          </span>
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className="shrink-0 cursor-pointer whitespace-nowrap rounded-[14px] bg-brand-gradient px-[22px] py-3 font-heading text-[14px] uppercase tracking-wider text-white shadow-[0_10px_22px_-12px_rgba(236,74,49,0.6)] transition-transform hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {saveLabel}
        </button>
      </div>
    </div>
  );
}

/** Leave-without-saving dialog, opened by useUnsavedChangesWarning. */
export function LeaveDialog({
  message,
  onKeep,
  onLeave,
}: {
  message: string;
  onKeep: () => void;
  onLeave: () => void;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onKeep();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeep]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-5">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="leave-title"
        className="w-full max-w-[400px] rounded-[20px] bg-card p-6 shadow-[0_30px_60px_-20px_rgba(17,17,17,0.4)]"
      >
        <h2
          id="leave-title"
          className="font-heading text-xl uppercase tracking-wide text-foreground"
        >
          Unsaved changes
        </h2>
        <p className="mt-2 text-sm leading-[1.55] text-muted">{message}</p>
        <div className="mt-5 flex flex-col gap-2.5">
          <button
            type="button"
            autoFocus
            onClick={onKeep}
            className="cursor-pointer rounded-[14px] bg-brand-gradient p-3 text-center font-heading text-sm uppercase tracking-wider text-white"
          >
            Keep editing
          </button>
          <button
            type="button"
            onClick={onLeave}
            className="cursor-pointer rounded-[14px] border-[1.5px] border-border p-3 text-center font-heading text-sm uppercase tracking-wide text-muted transition-colors hover:bg-tip-bg"
          >
            Leave without saving
          </button>
        </div>
      </div>
    </div>
  );
}
