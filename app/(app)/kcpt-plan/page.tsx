"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import HeartLoader from "@/components/HeartLoader";
import KcptHeartIcon from "@/components/KcptHeartIcon";
import PlanCard, { PlanText } from "@/components/kcpt-plan/PlanCard";
import { getMembersList, type MemberListItem } from "@/lib/api/admin";
import { getMemberPlan, type MemberPlan } from "@/lib/api/memberPlan";
import { useProfile } from "@/lib/context/ProfileContext";
import {
  hasText,
  isPlanEmpty,
  KCPT_QUESTIONNAIRE_URL,
  TEXT_SECTIONS,
  YOUR_PLAN_ROWS,
} from "@/lib/kcptPlan";
import { createClient } from "@/lib/supabase/client";

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; plan: MemberPlan | null };

function describeError(err: unknown): string {
  // fetch() rejects with a TypeError when the network request itself fails.
  if (err instanceof TypeError) {
    return "Could not reach the server. Please check your connection and try again.";
  }
  return err instanceof Error ? err.message : "Unable to load your plan.";
}

function PageLoader() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-10">
      <HeartLoader size={192} />
    </div>
  );
}

export default function KcptPlanPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <KcptPlanPageInner />
    </Suspense>
  );
}

function KcptPlanPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const { profile, loading: profileLoading } = useProfile();

  const role = profile?.role;
  const isRevoked = profile?.status === "revoked";
  const isMember = role === "member";

  // Admins have no plan of their own: they pick a member and see that member's
  // plan read-only. ?member=<uuid> is ignored for members (they always see
  // their own plan) and for coaches (redirected).
  const memberParam = searchParams.get("member");
  const [adminMembers, setAdminMembers] = useState<MemberListItem[] | null>(
    null,
  );
  const [membersError, setMembersError] = useState<string | null>(null);
  // Selected member: a ?member value that exists in the list, else the first.
  const previewId =
    role === "admin" && !isRevoked && adminMembers && adminMembers.length > 0
      ? (adminMembers.find((m) => m.id === memberParam)?.id ??
        adminMembers[0].id)
      : null;
  const previewMember = adminMembers?.find((m) => m.id === previewId) ?? null;
  const previewLabel = previewMember
    ? previewMember.full_name.trim() || previewMember.email || null
    : null;

  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  // Coaches have no personal plan: send them to Coach Review.
  useEffect(() => {
    if (profileLoading || !profile) return;
    if (role === "coach") router.replace("/coach-review");
  }, [profileLoading, profile, role, router]);

  // Admin: the member list for the picker.
  useEffect(() => {
    if (profileLoading || role !== "admin" || isRevoked) return;

    let cancelled = false;

    async function loadMembers() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          if (!cancelled) setMembersError("Not logged in.");
          return;
        }
        const list = await getMembersList(session.access_token);
        if (!cancelled) setAdminMembers(list);
      } catch (err) {
        if (!cancelled) setMembersError(describeError(err));
      }
    }

    void loadMembers();
    return () => {
      cancelled = true;
    };
  }, [supabase, profileLoading, role, isRevoked]);

  useEffect(() => {
    // A revoked member never triggers a fetch.
    if (profileLoading || (!isMember && previewId === null) || isRevoked) {
      return;
    }

    let cancelled = false;

    async function load() {
      setState({ kind: "loading" });
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          if (!cancelled) {
            setState({ kind: "error", message: "Not logged in." });
          }
          return;
        }
        if (previewId) {
          // Admin preview of the selected member's plan. `cancelled` guards
          // against a stale response from a previously selected member.
          const previewPlan = await getMemberPlan(session.access_token, previewId);
          if (cancelled) return;
          setState({ kind: "ready", plan: previewPlan });
          return;
        }
        const plan = await getMemberPlan(session.access_token);
        if (!cancelled) setState({ kind: "ready", plan });
      } catch (err) {
        if (!cancelled) {
          setState({ kind: "error", message: describeError(err) });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [supabase, profileLoading, isMember, isRevoked, previewId, reloadKey]);

  // Wait for role and status before rendering anything: no flash of the empty
  // state for admin/coach, no flash of plan content for a revoked member.
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

  if (!isMember && role !== "admin") return <PageLoader />;

  const heading = (
    <h1 className="font-heading text-[34px] uppercase leading-none tracking-wide text-foreground">
      My KCPT Plan
    </h1>
  );

  const shell =
    "flex flex-1 flex-col gap-4 px-5 py-6 md:mx-auto md:w-full md:max-w-3xl md:px-10 md:py-10";

  // Admin only: member picker. Null for members, so their page is unchanged.
  const adminPicker =
    adminMembers && previewId ? (
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
          Member
        </span>
        <select
          value={previewId}
          onChange={(e) =>
            router.replace(`/kcpt-plan?member=${e.target.value}`, {
              scroll: false,
            })
          }
          className="w-full cursor-pointer rounded-[10px] border border-border bg-card px-[13px] py-3 text-[14px] font-semibold text-foreground outline-none focus:border-brand-orange"
        >
          {adminMembers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.full_name.trim() || m.email || m.id}
            </option>
          ))}
        </select>
      </label>
    ) : null;

  // Shown only in admin preview. Null for members, so their page is unchanged.
  const previewBanner = previewId ? (
    <div
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border px-4 py-3"
      style={{
        background: "var(--tip-bg)",
        borderColor: "var(--brand-orange-dark)",
      }}
      role="status"
    >
      <p className="text-[13.5px] font-semibold leading-snug text-foreground">
        Preview of {previewLabel ?? "this member"} (read-only)
      </p>
      <Link
        href={`/coach-review?member=${previewId}&tab=plan`}
        className="text-[12px] font-bold text-brand-orange-dark underline decoration-dotted underline-offset-2"
      >
        Back to Coach Review
      </Link>
    </div>
  ) : null;

  if (isRevoked) {
    return (
      <div className={shell}>
        {heading}
        <div
          className="rounded-lg border px-4 py-3 text-[14px] leading-snug"
          style={{
            background: "var(--tip-bg)",
            borderColor: "var(--brand-orange-dark)",
            color: "var(--brand-orange-dark)",
          }}
          role="status"
        >
          Your access has been paused. Please contact your coach for more
          information.
        </div>
      </div>
    );
  }

  if (role === "admin") {
    if (membersError) {
      return (
        <div className={shell}>
          {heading}
          <p className="text-sm text-brand-orange-dark" role="alert">
            {membersError}
          </p>
        </div>
      );
    }
    if (adminMembers === null) return <PageLoader />;
    if (adminMembers.length === 0) {
      return (
        <div className={shell}>
          {heading}
          <p className="text-sm text-muted">No members yet.</p>
        </div>
      );
    }
  }

  if (state.kind === "loading") {
    if (!adminPicker) return <PageLoader />;
    // Admin switching members: keep the picker on screen while the plan loads.
    return (
      <div className={shell}>
        {adminPicker}
        <PageLoader />
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className={shell}>
        {adminPicker}
        {previewBanner}
        {heading}
        <div
          className="flex flex-col items-start gap-3 rounded-[20px] border border-border bg-card p-5"
          role="alert"
        >
          <p className="text-sm text-brand-orange-dark">{state.message}</p>
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

  const plan = state.plan;

  if (isPlanEmpty(plan)) {
    return (
      <div className={shell}>
        {adminPicker}
        {previewBanner}
        {heading}
        <section className="mt-2 flex flex-col items-center gap-4 rounded-[20px] border border-border bg-card px-6 py-9 text-center shadow-[0_12px_26px_-18px_rgba(17,17,17,0.16)]">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-gradient text-white">
            <KcptHeartIcon className="h-[26px] w-[26px]" />
          </span>
          <h2 className="max-w-[440px] text-balance font-heading text-2xl uppercase leading-[1.15] tracking-wide text-foreground">
            Your personalised KCPT Plan starts here!
          </h2>
          <p className="max-w-[400px] text-pretty text-[14.5px] leading-[1.55] text-muted">
            Please complete the KCPT questionnaire so I can create your
            individual plan.
          </p>
          {!previewId && (
            <a
              href={KCPT_QUESTIONNAIRE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-flex items-center justify-center rounded-[14px] bg-brand-gradient px-[22px] py-[13px] font-heading text-[14px] uppercase tracking-wider text-white shadow-[0_10px_22px_-12px_rgba(236,74,49,0.6)] transition-transform hover:-translate-y-px"
            >
              Complete the KCPT questionnaire
            </a>
          )}
        </section>
      </div>
    );
  }

  // plan is non-null here (isPlanEmpty returned false). Empty sections are
  // skipped entirely: no placeholder text.
  const filled = plan as MemberPlan;
  const planRows = YOUR_PLAN_ROWS.filter((row) => hasText(filled[row.key]));
  const textSections = TEXT_SECTIONS.filter((s) => hasText(filled[s.key]));

  return (
    <div className={shell}>
      {adminPicker}
      {previewBanner}
      {heading}

      {hasText(filled.name) && (
        <PlanCard title="Name">
          <p className="mt-2.5 text-[17px] font-extrabold text-foreground [overflow-wrap:anywhere]">
            {filled.name}
          </p>
        </PlanCard>
      )}

      {hasText(filled.goal) && (
        <PlanCard title="Goal">
          <PlanText text={filled.goal} />
        </PlanCard>
      )}

      {planRows.length > 0 && (
        <PlanCard title="Your Plan">
          <div className="mb-1 mt-3.5 h-px bg-border" />
          <ul>
            {planRows.map((row, i) => (
              <li
                key={row.key}
                className={`flex items-center justify-between gap-4 py-[11px] ${
                  i < planRows.length - 1 ? "border-b border-border" : ""
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full bg-brand-orange"
                  />
                  <span className="text-[14px] font-semibold text-foreground">
                    {row.label}
                  </span>
                </span>
                <span className="text-right text-[14px] font-bold text-foreground [overflow-wrap:anywhere]">
                  {filled[row.key]}
                </span>
              </li>
            ))}
          </ul>
        </PlanCard>
      )}

      {textSections.map((s) => (
        <PlanCard key={s.key} title={s.title}>
          <PlanText text={filled[s.key] as string} />
        </PlanCard>
      ))}
    </div>
  );
}
