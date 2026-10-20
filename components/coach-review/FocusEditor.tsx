"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import HeartLoader from "@/components/HeartLoader";
import { LeaveDialog, SaveBar } from "@/components/coach-review/EditorChrome";
import { getMemberFocus, saveMemberFocus } from "@/lib/api/memberFocus";
import { useProfile } from "@/lib/context/ProfileContext";
import { useUnsavedChangesWarning } from "@/lib/hooks/useUnsavedChangesWarning";
import { codePointLength, isUuid } from "@/lib/kcptPlan";
import { createClient } from "@/lib/supabase/client";
import { formatWeekRange, getNextWeekStart, getWeekStart } from "@/lib/week";
import type { MemberFocus } from "@/types";

const MAX_ITEMS = 5;
const ITEM_MAX = 120;

type WeekChoice = "this" | "next";

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready" };

function describeError(err: unknown, fallback: string): string {
  // fetch() rejects with a TypeError when the network request itself fails.
  if (err instanceof TypeError) {
    return "Could not reach the server. Please check your connection and try again.";
  }
  return err instanceof Error ? err.message : fallback;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function sourceLabel(source: "member" | "admin"): string {
  return source === "admin" ? "coach" : "member";
}

function sameItems(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((s, i) => s === b[i]);
}

const cardClass =
  "rounded-[20px] border border-border bg-card p-5 shadow-[0_12px_26px_-18px_rgba(17,17,17,0.16)]";
const cardTitleClass =
  "font-heading text-base uppercase tracking-wide text-foreground";
const inputClass =
  "w-full min-w-0 rounded-[10px] border border-border bg-background px-[13px] py-[11px] text-[13.5px] text-foreground outline-none focus:border-brand-orange aria-[invalid=true]:border-brand-orange-dark";

/**
 * Admin-only editor for a member's Focus This Week (member_focus).
 * Precedence is last write wins, no locking: a coach save replaces whatever the
 * member last wrote for that week, and a later member save replaces it again.
 * The server (member-focus function + RLS) is the real guard.
 */
export default function FocusEditor({
  memberId,
  memberName,
  onDirtyChange,
}: {
  memberId: string;
  memberName: string;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { profile, loading: profileLoading } = useProfile();
  const isAdmin = profile?.role === "admin";
  const memberIdValid = isUuid(memberId);

  const thisWeek = useMemo(() => getWeekStart(), []);
  const nextWeek = useMemo(() => getNextWeekStart(), []);
  const [choice, setChoice] = useState<WeekChoice>("this");
  const weekStart = choice === "this" ? thisWeek : nextWeek;

  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [resolved, setResolved] = useState<MemberFocus | null>(null);
  const [history, setHistory] = useState<MemberFocus[]>([]);

  // Editable rows (blank rows allowed while editing) and the last loaded /
  // saved list. Dirty = trimmed non-empty rows differ from the baseline.
  const [rows, setRows] = useState<string[]>([""]);
  const [baseline, setBaseline] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    if (profileLoading || !isAdmin || !memberIdValid) return;

    let cancelled = false;

    async function load() {
      setLoadState({ kind: "loading" });
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          if (!cancelled) {
            setLoadState({ kind: "error", message: "Not logged in." });
          }
          return;
        }
        const res = await getMemberFocus(
          weekStart,
          session.access_token,
          memberId,
        );
        if (cancelled) return;

        const items = res.resolved?.items ?? [];
        setResolved(res.resolved);
        setHistory(res.history);
        setRows(items.length > 0 ? items : [""]);
        setBaseline(items);
        setSaveError(null);
        setJustSaved(false);
        setConfirmClear(false);
        setLoadState({ kind: "ready" });
      } catch (err) {
        if (!cancelled) {
          setLoadState({
            kind: "error",
            message: describeError(err, "Unable to load this focus."),
          });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [supabase, profileLoading, isAdmin, memberId, memberIdValid, weekStart, reloadKey]);

  const ready = loadState.kind === "ready";

  const cleanItems = useMemo(
    () => rows.map((r) => r.trim()).filter((r) => r.length > 0),
    [rows],
  );
  const dirty = !sameItems(cleanItems, baseline);

  const overRows = rows
    .map((r, i) => ({ i, over: codePointLength(r.trim()) - ITEM_MAX }))
    .filter((r) => r.over > 0);

  // Save stays disabled until the focus has loaded, so an empty list can never
  // overwrite an existing focus by accident.
  const canSave = ready && dirty && !saving && overRows.length === 0;

  const firstName = memberName.split(/\s+/)[0] || "The member";

  useUnsavedChangesWarning(ready && dirty, (href) => setPendingHref(href));

  useEffect(() => {
    onDirtyChange?.(ready && dirty);
    return () => onDirtyChange?.(false);
  }, [ready, dirty, onDirtyChange]);

  function setRow(index: number, value: string) {
    setRows((prev) => prev.map((r, i) => (i === index ? value : r)));
    setJustSaved(false);
    setConfirmClear(false);
  }

  function addRow() {
    setRows((prev) => (prev.length < MAX_ITEMS ? [...prev, ""] : prev));
  }

  function removeRow(index: number) {
    setRows((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [""];
    });
    setJustSaved(false);
    setConfirmClear(false);
  }

  function switchWeek(next: WeekChoice) {
    if (next === choice) return;
    if (
      dirty &&
      !window.confirm("You have unsaved changes. Switch week without saving?")
    ) {
      return;
    }
    setChoice(next);
  }

  async function doSave() {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    setJustSaved(false);
    setConfirmClear(false);

    // Everything typed stays in `rows` no matter what happens below.
    const sent = cleanItems;
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Not logged in.");
      await saveMemberFocus(session.access_token, {
        effective_week: weekStart,
        items: sent,
        user_id: memberId,
      });
      setBaseline(sent);
      setJustSaved(true);
      // Refresh attribution and history. A failure here is not a save failure.
      try {
        const fresh = await getMemberFocus(
          weekStart,
          session.access_token,
          memberId,
        );
        setResolved(fresh.resolved);
        setHistory(fresh.history);
      } catch {
        // keep the previous attribution
      }
    } catch (err) {
      setSaveError(describeError(err, "Unable to save this focus."));
    } finally {
      setSaving(false);
    }
  }

  function handleSaveClick() {
    if (!canSave) return;
    // Saving an empty list clears the focus: ask for a one-line confirm first.
    if (cleanItems.length === 0 && !confirmClear) {
      setConfirmClear(true);
      return;
    }
    void doSave();
  }

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <HeartLoader size={96} />
      </div>
    );
  }
  if (!isAdmin) return null;

  if (!memberIdValid) {
    return (
      <p className="text-sm text-foreground" role="status">
        Member not found.
      </p>
    );
  }

  if (loadState.kind === "loading") {
    return (
      <div className="flex items-center justify-center py-12">
        <HeartLoader size={96} />
      </div>
    );
  }

  if (loadState.kind === "error") {
    return (
      <div
        className="flex flex-col items-start gap-3 rounded-[20px] border border-border bg-card p-5"
        role="alert"
      >
        <p className="text-sm text-brand-orange-dark">{loadState.message}</p>
        <button
          type="button"
          onClick={() => setReloadKey((n) => n + 1)}
          className="cursor-pointer rounded-[14px] bg-brand-gradient px-5 py-3 transition-transform hover:-translate-y-0.5"
        >
          <span className="font-heading text-[13px] uppercase tracking-wide text-white">
            Try again
          </span>
        </button>
      </div>
    );
  }

  // ---- status bar text -----------------------------------------------------
  let statusText: string;
  let statusDot: string;
  if (saving) {
    statusText = "Saving…";
    statusDot = "var(--brand-orange)";
  } else if (saveError) {
    statusText = "Could not save";
    statusDot = "var(--revoke-text)";
  } else if (overRows.length > 0) {
    statusText = `${overRows.length} point${
      overRows.length === 1 ? " is" : "s are"
    } over the limit`;
    statusDot = "var(--revoke-text)";
  } else if (dirty) {
    statusText = "Unsaved changes";
    statusDot = "var(--brand-orange)";
  } else if (justSaved) {
    statusText = "All changes saved";
    statusDot = "#8fae8a";
  } else {
    statusText = resolved ? "No changes" : "No focus yet. Add points and save.";
    statusDot = "var(--badge-neutral-dot)";
  }
  const saveLabel = saving ? "Saving…" : saveError ? "Try again" : "Save";

  const weekButton = (value: WeekChoice, label: string, monday: string) => {
    const selected = choice === value;
    return (
      <button
        key={value}
        type="button"
        onClick={() => switchWeek(value)}
        aria-pressed={selected}
        className={`cursor-pointer rounded-full px-4 py-2 text-left transition-colors ${
          selected
            ? "bg-brand-gradient text-white"
            : "border border-border bg-card text-muted"
        }`}
      >
        <span className="block text-[12.5px] font-bold">{label}</span>
        <span className="block text-[11px] font-semibold opacity-80">
          {formatWeekRange(monday)}
        </span>
      </button>
    );
  };

  const attribution = resolved
    ? `Last changed by ${sourceLabel(resolved.source)} on ${formatDate(
        resolved.updated_at,
      )}${
        resolved.effective_week !== weekStart
          ? `, carried over from the week of ${formatWeekRange(
              resolved.effective_week,
            )}`
          : ""
      }.`
    : "No focus has been set for this week yet.";

  return (
    <div className="flex flex-col gap-4 pb-28">
      <div className="flex flex-wrap gap-2.5">
        {weekButton("this", "This week", thisWeek)}
        {weekButton("next", "Next week", nextWeek)}
      </div>

      <section className={cardClass}>
        <h2 className={`${cardTitleClass} mb-1`}>Focus points</h2>
        <p className="mb-3 text-[12.5px] font-medium leading-snug text-muted">
          Up to {MAX_ITEMS} points, {ITEM_MAX} characters each. {attribution}
        </p>

        <div className="flex flex-col gap-2">
          {rows.map((value, i) => {
            const over = codePointLength(value.trim()) - ITEM_MAX;
            const noteId = `focus-note-${i}`;
            return (
              <div key={i}>
                <div className="flex items-center gap-2">
                  <span className="w-5 shrink-0 text-[12px] font-bold text-muted">
                    {i + 1}.
                  </span>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => setRow(i, e.target.value)}
                    placeholder="e.g. In bed by 11pm"
                    aria-label={`Focus point ${i + 1}`}
                    aria-invalid={over > 0}
                    aria-describedby={over > 0 ? noteId : undefined}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    aria-label={`Remove focus point ${i + 1}`}
                    className="shrink-0 cursor-pointer rounded-[10px] border border-border px-3 py-2 text-xs font-bold text-muted transition-colors hover:text-foreground"
                  >
                    Remove
                  </button>
                </div>
                {over > 0 && (
                  <p
                    id={noteId}
                    className="mt-1.5 pl-7 text-[12px] font-semibold"
                    style={{ color: "var(--revoke-text)" }}
                  >
                    Point {i + 1} is {over.toLocaleString("en-US")} character
                    {over === 1 ? "" : "s"} over the {ITEM_MAX} limit.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={addRow}
          disabled={rows.length >= MAX_ITEMS}
          className="mt-3 cursor-pointer rounded-[10px] border border-border px-3.5 py-2 text-xs font-bold text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          + Add point
        </button>
      </section>

      {confirmClear && (
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border px-4 py-3"
          style={{
            background: "var(--tip-bg)",
            borderColor: "var(--brand-orange-dark)",
          }}
          role="alertdialog"
          aria-label="Confirm clearing the focus"
        >
          <p className="text-[13px] font-semibold text-foreground">
            Save an empty list? This clears {firstName}&apos;s focus for this
            week.
          </p>
          <div className="flex items-center gap-3 text-[12px] font-bold">
            <button
              type="button"
              onClick={() => void doSave()}
              disabled={saving}
              className="cursor-pointer text-brand-orange-dark underline decoration-dotted underline-offset-2 disabled:opacity-60"
            >
              Yes, clear it
            </button>
            <button
              type="button"
              onClick={() => setConfirmClear(false)}
              disabled={saving}
              className="cursor-pointer text-muted underline decoration-dotted underline-offset-2 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {saveError && (
        <div
          className="rounded-2xl border px-4 py-3.5"
          style={{
            background: "rgba(236,74,49,0.06)",
            borderColor: "rgba(236,74,49,0.35)",
          }}
          role="alert"
        >
          <p
            className="text-sm font-bold"
            style={{ color: "var(--revoke-text)" }}
          >
            Your changes were not saved
          </p>
          <p className="mt-1 text-[12.5px] leading-[1.45] text-muted">
            {saveError} Nothing has been lost on this page. Press Save again.
          </p>
        </div>
      )}

      {justSaved && !dirty && !saveError && (
        <div
          className="rounded-2xl border px-4 py-3.5"
          style={{
            background: "rgba(143,174,138,0.12)",
            borderColor: "rgba(143,174,138,0.5)",
          }}
          role="status"
        >
          <p className="text-sm font-bold" style={{ color: "#4d7548" }}>
            Focus saved
          </p>
          <p className="mt-1 text-[12.5px] leading-[1.45] text-muted">
            {firstName} will see it on My Focus This Week.
          </p>
        </div>
      )}

      <section className={cardClass}>
        <h2 className={`${cardTitleClass} mb-3`}>History</h2>
        {history.length === 0 ? (
          <p className="text-[13px] font-medium text-muted">
            No focus history yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {history.map((row) => (
              <li
                key={row.effective_week}
                className="rounded-[14px] border border-border bg-background px-3.5 py-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[12.5px] font-bold text-foreground">
                    {formatWeekRange(row.effective_week)}
                  </p>
                  <p className="text-[11.5px] font-semibold text-muted">
                    {sourceLabel(row.source)}, {formatDate(row.updated_at)}
                  </p>
                </div>
                {row.items.length === 0 ? (
                  <p className="mt-1.5 text-[12.5px] font-medium text-muted">
                    Cleared (no points)
                  </p>
                ) : (
                  <ol className="mt-1.5 flex flex-col gap-1">
                    {row.items.map((item, i) => (
                      <li
                        key={i}
                        className="text-[12.5px] font-semibold leading-relaxed text-foreground [overflow-wrap:anywhere]"
                      >
                        {i + 1}. {item}
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <SaveBar
        statusText={statusText}
        statusDot={statusDot}
        isError={Boolean(saveError) || overRows.length > 0}
        saveLabel={saveLabel}
        canSave={canSave}
        onSave={handleSaveClick}
      />

      {pendingHref !== null && (
        <LeaveDialog
          message={`You have unsaved changes to ${firstName}'s focus. If you leave now, they will be lost.`}
          onKeep={() => setPendingHref(null)}
          onLeave={() => {
            const href = pendingHref;
            setPendingHref(null);
            router.push(href);
          }}
        />
      )}
    </div>
  );
}
