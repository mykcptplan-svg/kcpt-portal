"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import HeartLoader from "@/components/HeartLoader";
import { LeaveDialog, SaveBar } from "@/components/coach-review/EditorChrome";
import {
  getMemberPlan,
  saveMemberPlan,
  type MemberPlan,
} from "@/lib/api/memberPlan";
import { useProfile } from "@/lib/context/ProfileContext";
import {
  codePointLength,
  fieldDisplayName,
  isUuid,
  limitFor,
  LONG_WARN_FROM,
  PLAN_FIELD_KEYS,
  PLAN_FIELDS,
  SHORT_COUNTER_FROM,
  type PlanFieldDef,
  type PlanFieldKey,
  type PlanFields,
} from "@/lib/kcptPlan";
import { useUnsavedChangesWarning } from "@/lib/hooks/useUnsavedChangesWarning";
import { createClient } from "@/lib/supabase/client";

/** Editable text per field. "" means empty (sent to the server as null). */
type Values = Record<PlanFieldKey, string>;

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "notfound" }
  | { kind: "ready" };

const SHORT_PLACEHOLDERS: Partial<Record<PlanFieldKey, string>> = {
  plan_calories: "e.g. 1,750 kcal",
  plan_protein: "e.g. 130 g",
  plan_steps: "e.g. 10,000 a day",
  plan_workouts: "e.g. 3 per week",
  plan_water: "e.g. 2.5 L",
};

const YOUR_PLAN_KEYS: PlanFieldKey[] = [
  "plan_calories",
  "plan_protein",
  "plan_water",
  "plan_steps",
  "plan_workouts",
];
const LONG_AFTER_PLAN_KEYS: PlanFieldKey[] = [
  "food",
  "water",
  "steps",
  "workouts",
  "barriers",
  "check_in",
  "additional_guidance",
];

const FIELD_BY_KEY = Object.fromEntries(
  PLAN_FIELDS.map((f) => [f.key, f]),
) as Record<PlanFieldKey, PlanFieldDef>;

function emptyValues(): Values {
  return Object.fromEntries(PLAN_FIELD_KEYS.map((k) => [k, ""])) as Values;
}

function valuesFromPlan(plan: MemberPlan | null): Values {
  const values = emptyValues();
  if (!plan) return values;
  for (const key of PLAN_FIELD_KEYS) {
    values[key] = (plan[key] ?? "").trim();
  }
  return values;
}

function trimmedValues(values: Values): Values {
  const out = emptyValues();
  for (const key of PLAN_FIELD_KEYS) out[key] = values[key].trim();
  return out;
}

function describeError(err: unknown, fallback: string): string {
  // fetch() rejects with a TypeError when the network request itself fails.
  if (err instanceof TypeError) {
    return "Could not reach the server. Please check your connection and try again.";
  }
  return err instanceof Error ? err.message : fallback;
}

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

function overMessage(def: PlanFieldDef, over: number): string {
  const limit = formatCount(limitFor(def));
  return `${fieldDisplayName(def)} is ${formatCount(over)} character${
    over === 1 ? "" : "s"
  } over the ${limit} limit.`;
}

const cardClass =
  "rounded-[20px] border border-border bg-card p-5 shadow-[0_12px_26px_-18px_rgba(17,17,17,0.16)]";
const cardTitleClass =
  "font-heading text-base uppercase tracking-wide text-foreground";
const inputClass =
  "w-full rounded-[10px] border border-border bg-background px-[13px] py-[11px] text-[13.5px] text-foreground outline-none focus:border-brand-orange aria-[invalid=true]:border-brand-orange-dark";

function PageLoader() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-10">
      <HeartLoader size={192} />
    </div>
  );
}

function Counter({
  def,
  count,
  id,
}: {
  def: PlanFieldDef;
  count: number;
  id: string;
}) {
  const limit = limitFor(def);
  const over = count > limit;
  const warn = def.kind === "long" && count > LONG_WARN_FROM;
  return (
    <span
      id={id}
      className="text-[11.5px] font-semibold"
      style={{
        color: over
          ? "var(--revoke-text)"
          : warn
            ? "var(--tip-text)"
            : "var(--muted)",
      }}
    >
      {formatCount(count)} / {formatCount(limit)}
    </span>
  );
}

/**
 * Admin-only KCPT Plan editor, shown in the "KCPT Plan" tab of Coach Review.
 * The server (member-plan function + RLS) is the real guard; the isAdmin check
 * here is UI only. Mount it with key={memberId} so state resets per member.
 */
export default function PlanEditor({
  memberId,
  fullName,
  email,
  onDirtyChange,
}: {
  memberId: string;
  fullName: string;
  email: string | null;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const router = useRouter();
  const memberIdValid = isUuid(memberId);

  const supabase = useMemo(() => createClient(), []);
  const { profile, loading: profileLoading } = useProfile();
  const isAdmin = profile?.role === "admin";

  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  const [values, setValues] = useState<Values>(emptyValues);
  // Last loaded or last successfully saved (trimmed) values. Dirty = differs.
  const [baseline, setBaseline] = useState<Values>(emptyValues);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    if (profileLoading || !isAdmin) return;
    // An invalid id is shown as "Member not found" at render time; no fetch.
    if (!memberIdValid) return;

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
        const token = session.access_token;
        const plan = await getMemberPlan(token, memberId);
        if (cancelled) return;

        const loaded = valuesFromPlan(plan);
        setValues(loaded);
        setBaseline(loaded);
        setSaveError(null);
        setJustSaved(false);
        setLoadState({ kind: "ready" });
      } catch (err) {
        if (!cancelled) {
          setLoadState({
            kind: "error",
            message: describeError(err, "Unable to load this plan."),
          });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [supabase, profileLoading, isAdmin, memberId, memberIdValid, reloadKey]);

  const ready = loadState.kind === "ready";

  const dirty = useMemo(() => {
    const t = trimmedValues(values);
    return PLAN_FIELD_KEYS.some((k) => t[k] !== baseline[k]);
  }, [values, baseline]);

  const hasPlan = useMemo(
    () => PLAN_FIELD_KEYS.some((k) => baseline[k].length > 0),
    [baseline],
  );

  // Characters over the limit, counted in code points on the trimmed value.
  const counts = useMemo(() => {
    const t = trimmedValues(values);
    return Object.fromEntries(
      PLAN_FIELD_KEYS.map((k) => [k, codePointLength(t[k])]),
    ) as Record<PlanFieldKey, number>;
  }, [values]);

  const overLimit = PLAN_FIELDS.filter(
    (def) => counts[def.key] > limitFor(def),
  );

  // Save stays disabled until the plan has loaded, so an empty form can never
  // overwrite an existing plan.
  const canSave = ready && dirty && !saving && overLimit.length === 0;

  const displayName = fullName.trim() || email || "this member";
  const firstName = displayName.split(/\s+/)[0] || "The member";

  useUnsavedChangesWarning(ready && dirty, (href) => setPendingHref(href));

  useEffect(() => {
    onDirtyChange?.(ready && dirty);
    return () => onDirtyChange?.(false);
  }, [ready, dirty, onDirtyChange]);

  function setField(key: PlanFieldKey, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setJustSaved(false);
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    setJustSaved(false);

    // Everything typed stays in `values` no matter what happens below.
    const sent = trimmedValues(values);
    const fields = Object.fromEntries(
      PLAN_FIELD_KEYS.map((k) => [k, sent[k].length > 0 ? sent[k] : null]),
    ) as PlanFields;

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Not logged in.");
      await saveMemberPlan(session.access_token, memberId, fields);
      setBaseline(sent);
      setJustSaved(true);
    } catch (err) {
      setSaveError(describeError(err, "Unable to save this plan."));
    } finally {
      setSaving(false);
    }
  }

  // ---- guards: render a loader until role and member are known ------------
  if (profileLoading) return <PageLoader />;

  if (!profile) return null;

  if (!isAdmin) return null;

  if (memberIdValid && loadState.kind === "loading") return <PageLoader />;

  const shell = "flex flex-col gap-4 pb-28";

  if (!memberIdValid || loadState.kind === "notfound") {
    return (
      <div className={shell}>
        <p className="text-sm text-foreground" role="status">
          Member not found.
        </p>
      </div>
    );
  }

  if (loadState.kind === "error") {
    return (
      <div className={shell}>
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
  } else if (overLimit.length > 0) {
    statusText = `${overLimit.length} field${
      overLimit.length === 1 ? " is" : "s are"
    } over the limit`;
    statusDot = "var(--revoke-text)";
  } else if (dirty) {
    statusText = "Unsaved changes";
    statusDot = "var(--brand-orange)";
  } else if (justSaved) {
    statusText = "All changes saved";
    statusDot = "#8fae8a";
  } else {
    statusText = hasPlan
      ? "No changes"
      : "No plan yet. Fill in the sections and save.";
    statusDot = "var(--badge-neutral-dot)";
  }
  const saveLabel = saving ? "Saving…" : saveError ? "Try again" : "Save";

  const namePlaceholder = fullName.trim() || email || "";

  function fieldNote(def: PlanFieldDef) {
    const over = counts[def.key] - limitFor(def);
    return over > 0 ? (
      <p
        id={`note-${def.key}`}
        className="mt-1.5 text-[12px] font-semibold"
        style={{ color: "var(--revoke-text)" }}
      >
        {overMessage(def, over)}
      </p>
    ) : null;
  }

  function describedBy(def: PlanFieldDef, withCounter: boolean): string | undefined {
    const ids: string[] = [];
    if (withCounter) ids.push(`count-${def.key}`);
    if (counts[def.key] > limitFor(def)) ids.push(`note-${def.key}`);
    return ids.length > 0 ? ids.join(" ") : undefined;
  }

  function renderShortInput(def: PlanFieldDef, placeholder?: string) {
    const showCounter = counts[def.key] >= SHORT_COUNTER_FROM;
    const over = counts[def.key] > limitFor(def);
    return (
      <>
        <input
          id={`field-${def.key}`}
          type="text"
          value={values[def.key]}
          onChange={(e) => setField(def.key, e.target.value)}
          placeholder={placeholder}
          aria-invalid={over}
          aria-describedby={describedBy(def, showCounter)}
          className={inputClass}
        />
        {(showCounter || over) && (
          <div className="mt-1.5 text-right">
            <Counter def={def} count={counts[def.key]} id={`count-${def.key}`} />
          </div>
        )}
        {fieldNote(def)}
      </>
    );
  }

  function renderLongCard(key: PlanFieldKey, hint?: string) {
    const def = FIELD_BY_KEY[key];
    const over = counts[key] > limitFor(def);
    const rows = Math.min(
      14,
      Math.max(4, values[key].split("\n").length + 1),
    );
    return (
      <section key={key} className={cardClass}>
        <label
          htmlFor={`field-${key}`}
          className={`${cardTitleClass} mb-3 block`}
        >
          {def.label}
        </label>
        <textarea
          id={`field-${key}`}
          value={values[key]}
          onChange={(e) => setField(key, e.target.value)}
          rows={rows}
          aria-invalid={over}
          aria-describedby={describedBy(def, true)}
          className={`${inputClass} resize-y py-3 leading-[1.55]`}
        />
        <div className="mt-1.5 flex justify-between gap-3 text-[11.5px] font-semibold">
          <span className="text-muted">{hint ?? ""}</span>
          <Counter def={def} count={counts[key]} id={`count-${key}`} />
        </div>
        {fieldNote(def)}
      </section>
    );
  }

  return (
    <div className={shell}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
            KCPT Plan
          </p>
          <Link
            href={`/kcpt-plan?member=${memberId}`}
            className="text-[12px] font-bold text-brand-orange-dark underline decoration-dotted underline-offset-2"
          >
            Preview as member
          </Link>
        </div>
        <span
          className="rounded-full px-[11px] py-[5px] text-[12px] font-bold"
          style={{
            background: hasPlan
              ? "rgba(251,147,58,0.14)"
              : "var(--badge-neutral-bg)",
            color: hasPlan ? "var(--tip-text)" : "var(--badge-neutral-text)",
          }}
        >
          {hasPlan ? "Has plan" : "No plan"}
        </span>
      </div>

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
            Plan saved
          </p>
          <p className="mt-1 text-[12.5px] leading-[1.45] text-muted">
            {firstName} can now see the updated plan in My KCPT Plan.
          </p>
        </div>
      )}

      <div className="mt-1 flex flex-col gap-4">
        {/* Name: independent field. The member's full name is only a placeholder. */}
        <section className={cardClass}>
          <label
            htmlFor="field-name"
            className={`${cardTitleClass} mb-3 block`}
          >
            Name
          </label>
          {renderShortInput(FIELD_BY_KEY.name, namePlaceholder)}
        </section>

        {renderLongCard("goal")}

        <section className={cardClass}>
          <h2 className={`${cardTitleClass} mb-3`}>Your Plan</h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
            {YOUR_PLAN_KEYS.map((key) => {
              const def = FIELD_BY_KEY[key];
              return (
                <div key={key}>
                  <label
                    htmlFor={`field-${key}`}
                    className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.05em] text-muted"
                  >
                    {def.label}
                  </label>
                  {renderShortInput(def, SHORT_PLACEHOLDERS[key])}
                </div>
              );
            })}
          </div>
        </section>

        {LONG_AFTER_PLAN_KEYS.map((key) =>
          renderLongCard(
            key,
            key === "additional_guidance"
              ? "Optional. Hidden from the member when empty."
              : undefined,
          ),
        )}
      </div>

      <SaveBar
        statusText={statusText}
        statusDot={statusDot}
        isError={Boolean(saveError) || overLimit.length > 0}
        saveLabel={saveLabel}
        canSave={canSave}
        onSave={() => void handleSave()}
      />

      {pendingHref !== null && (
        <LeaveDialog
          message={`You have unsaved changes to ${firstName}'s plan. If you leave now, they will be lost.`}
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
