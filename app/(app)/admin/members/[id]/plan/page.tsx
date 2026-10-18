"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import HeartLoader from "@/components/HeartLoader";
import { getMembersList, type MemberListItem } from "@/lib/api/admin";
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
  "plan_steps",
  "plan_workouts",
  "plan_water",
];
const LONG_AFTER_PLAN_KEYS: PlanFieldKey[] = [
  "food",
  "steps",
  "water",
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

export default function PlanEditorPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const memberId = typeof params.id === "string" ? params.id : "";
  const memberIdValid = isUuid(memberId);

  const supabase = useMemo(() => createClient(), []);
  const { profile, loading: profileLoading } = useProfile();
  const isAdmin = profile?.role === "admin";

  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [member, setMember] = useState<MemberListItem | null>(null);

  const [values, setValues] = useState<Values>(emptyValues);
  // Last loaded or last successfully saved (trimmed) values. Dirty = differs.
  const [baseline, setBaseline] = useState<Values>(emptyValues);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  // Client-side role guard (not a security boundary: the server enforces it).
  useEffect(() => {
    if (profileLoading || !profile) return;
    if (profile.role !== "admin") router.replace("/");
  }, [profileLoading, profile, router]);

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
        const [members, plan] = await Promise.all([
          getMembersList(token),
          getMemberPlan(token, memberId),
        ]);
        if (cancelled) return;

        const found = members.find((m) => m.id === memberId) ?? null;
        if (!found) {
          setLoadState({ kind: "notfound" });
          return;
        }

        const loaded = valuesFromPlan(plan);
        setMember(found);
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

  const displayName =
    member?.full_name.trim() || member?.email || "this member";
  const firstName = displayName.split(/\s+/)[0] || "The member";

  useUnsavedChangesWarning(ready && dirty, (href) => setPendingHref(href));

  useEffect(() => {
    if (pendingHref === null) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setPendingHref(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pendingHref]);

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

  if (!profile) {
    return (
      <div className="flex flex-1 flex-col gap-4 px-5 py-6 md:mx-auto md:w-full md:max-w-3xl md:px-10 md:py-10">
        <p className="text-sm text-brand-orange-dark">
          Unable to load your profile. Please refresh the page.
        </p>
      </div>
    );
  }

  if (!isAdmin) return <PageLoader />;

  if (memberIdValid && loadState.kind === "loading") return <PageLoader />;

  const shell =
    "flex flex-1 flex-col gap-4 px-5 pt-6 pb-28 md:mx-auto md:w-full md:max-w-3xl md:px-10 md:pt-10 md:pb-28";
  const backLink = (
    <Link
      href="/admin"
      className="inline-flex w-fit text-[12px] font-bold tracking-wide text-brand-orange-dark"
    >
      ← All members
    </Link>
  );

  if (!memberIdValid || loadState.kind === "notfound") {
    return (
      <div className={shell}>
        {backLink}
        <p className="text-sm text-foreground" role="status">
          Member not found.
        </p>
      </div>
    );
  }

  if (loadState.kind === "error") {
    return (
      <div className={shell}>
        {backLink}
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

  const namePlaceholder = member?.full_name.trim() || member?.email || "";

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
      {backLink}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
            KCPT Plan
          </p>
          <h1 className="mt-1 font-heading text-[34px] uppercase leading-none tracking-wide text-foreground">
            {displayName}
          </h1>
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

      {/* Sticky save bar. On mobile it sits above NavShell's bottom bar. */}
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
                color:
                  saveError || overLimit.length > 0
                    ? "var(--revoke-text)"
                    : "var(--muted)",
              }}
            >
              {statusText}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!canSave}
            className="shrink-0 cursor-pointer whitespace-nowrap rounded-[14px] bg-brand-gradient px-[22px] py-3 font-heading text-[14px] uppercase tracking-wider text-white shadow-[0_10px_22px_-12px_rgba(236,74,49,0.6)] transition-transform hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {saveLabel}
          </button>
        </div>
      </div>

      {/* Leave-without-saving dialog, opened by the click-capture hook. */}
      {pendingHref !== null && (
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
            <p className="mt-2 text-sm leading-[1.55] text-muted">
              You have unsaved changes to {firstName}&apos;s plan. If you leave
              now, they will be lost.
            </p>
            <div className="mt-5 flex flex-col gap-2.5">
              <button
                type="button"
                autoFocus
                onClick={() => setPendingHref(null)}
                className="cursor-pointer rounded-[14px] bg-brand-gradient p-3 text-center font-heading text-sm uppercase tracking-wider text-white"
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={() => {
                  const href = pendingHref;
                  setPendingHref(null);
                  router.push(href);
                }}
                className="cursor-pointer rounded-[14px] border-[1.5px] border-border p-3 text-center font-heading text-sm uppercase tracking-wide text-muted transition-colors hover:bg-tip-bg"
              >
                Leave without saving
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
