"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import HeartLoader from "@/components/HeartLoader";
import { UsersIcon } from "@/components/icons";
import {
  getMembersList,
  inviteMember,
  manageMember,
  type MemberListItem,
} from "@/lib/api/admin";
import { createClient } from "@/lib/supabase/client";

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

export default function AdminPage() {
  const supabase = useMemo(() => createClient(), []);
  const accessTokenRef = useRef<string | null>(null);

  const [members, setMembers] = useState<MemberListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  async function refreshMembers(token: string) {
    const list = await getMembersList(token);
    setMembers(list);
  }

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
        await refreshMembers(session.access_token);
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

  async function handleSendInvite() {
    const email = inviteEmail.trim();
    if (!email) return;
    const token = accessTokenRef.current;
    if (!token) {
      setInviteError("Not logged in.");
      return;
    }

    setInviting(true);
    setInviteError(null);
    try {
      await inviteMember(token, email);
      setInviteEmail("");
      setShowInviteForm(false);
      await refreshMembers(token);
    } catch (err) {
      setInviteError(
        err instanceof Error ? err.message : "Unable to send invite.",
      );
    } finally {
      setInviting(false);
    }
  }

  async function handleToggleCoachReview(member: MemberListItem) {
    const token = accessTokenRef.current;
    if (!token) {
      setActionError("Not logged in.");
      return;
    }

    const next = !member.coach_review_enabled;
    const previous = member;
    setActionError(null);
    setMembers((prev) =>
      prev.map((m) =>
        m.id === member.id ? { ...m, coach_review_enabled: next } : m,
      ),
    );

    try {
      await manageMember(token, {
        user_id: member.id,
        coach_review_enabled: next,
      });
    } catch (err) {
      setMembers((prev) =>
        prev.map((m) => (m.id === previous.id ? previous : m)),
      );
      setActionError(
        err instanceof Error ? err.message : "Unable to update member.",
      );
    }
  }

  async function handleToggleStatus(member: MemberListItem) {
    const token = accessTokenRef.current;
    if (!token) {
      setActionError("Not logged in.");
      return;
    }

    const nextStatus = member.status === "active" ? "revoked" : "active";
    const previous = member;
    setActionError(null);
    setMembers((prev) =>
      prev.map((m) =>
        m.id === member.id ? { ...m, status: nextStatus } : m,
      ),
    );

    try {
      await manageMember(token, {
        user_id: member.id,
        status: nextStatus,
      });
    } catch (err) {
      setMembers((prev) =>
        prev.map((m) => (m.id === previous.id ? previous : m)),
      );
      setActionError(
        err instanceof Error ? err.message : "Unable to update member.",
      );
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <HeartLoader size={192} />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 px-5 py-6 md:mx-auto md:w-full md:max-w-[960px] md:px-10 md:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-[32px] uppercase leading-none tracking-wide text-foreground">
            Admin Panel
          </h1>
          <p className="mt-0.5 font-script text-xl font-bold text-brand-orange-dark">
            Manage your members.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowInviteForm((v) => !v)}
          className="cursor-pointer whitespace-nowrap rounded-[14px] bg-brand-gradient px-5 py-3 transition-transform hover:-translate-y-0.5"
        >
          <span className="font-heading text-[13px] uppercase tracking-wide text-white">
            {showInviteForm ? "× Close" : "+ Invite Member"}
          </span>
        </button>
      </div>

      {loadError && (
        <p className="text-xs text-brand-orange-dark">{loadError}</p>
      )}
      {actionError && (
        <p className="text-xs text-brand-orange-dark">{actionError}</p>
      )}

      {showInviteForm && (
        <section className="rounded-[20px] border border-border bg-card p-5 shadow-[0_12px_26px_-18px_rgba(17,17,17,0.16)]">
          <h2 className="mb-4 font-heading text-base uppercase tracking-wide text-foreground">
            Invite New Member
          </h2>
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">
              Email
            </p>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="e.g. jamie.morgan@email.com"
              className="w-full rounded-[10px] border border-border bg-background px-[13px] py-3 text-[14px] font-semibold text-foreground outline-none focus:border-brand-orange"
            />
          </div>
          {inviteError && (
            <p className="mt-2 text-xs text-brand-orange-dark">{inviteError}</p>
          )}
          <div className="mt-[18px] flex gap-2.5">
            <button
              type="button"
              onClick={() => void handleSendInvite()}
              disabled={inviting || !inviteEmail.trim()}
              className="flex-1 cursor-pointer rounded-[14px] bg-brand-gradient p-[13px] text-center transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="font-heading text-[13px] uppercase tracking-wide text-white">
                {inviting ? "Sending…" : "Send Invite"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setShowInviteForm(false)}
              disabled={inviting}
              className="cursor-pointer rounded-[14px] border-[1.5px] border-border px-[18px] py-[13px] disabled:opacity-60"
            >
              <span className="font-heading text-[13px] uppercase tracking-wide text-muted">
                Cancel
              </span>
            </button>
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-[20px] border border-border bg-card shadow-[0_12px_26px_-18px_rgba(17,17,17,0.16)]">
        <div className="px-5 pt-[18px]">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white">
              <UsersIcon className="h-4 w-4" />
            </span>
            <h2 className="font-heading text-base uppercase tracking-wide text-foreground">
              Members ({members.length})
            </h2>
          </div>
        </div>

        {/* Mobile: stacked cards */}
        <div className="flex flex-col gap-2.5 px-5 pb-5 md:hidden">
          {members.map((m) => {
            const active = m.status === "active";
            const displayName = m.full_name.trim() || m.email || "—";
            return (
              <div
                key={m.id}
                className="rounded-[18px] border border-border bg-background px-4 py-3.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-gradient">
                    <span className="font-heading text-[13px] text-white">
                      {initialsFromFullName(m.full_name || displayName)}
                    </span>
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-bold text-foreground">
                      {displayName}
                    </p>
                    <p className="truncate text-xs font-medium text-muted">
                      {m.email ?? "—"}
                    </p>
                  </div>
                </div>

                <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-2.5">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-[11px] py-[5px]"
                    style={{
                      background: active
                        ? "rgba(143,174,138,0.15)"
                        : "rgba(17,17,17,0.06)",
                    }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{
                        background: active ? "#6a9a63" : "rgba(17,17,17,0.3)",
                      }}
                    />
                    <span
                      className="text-[11px] font-bold tracking-wide"
                      style={{
                        color: active ? "#4d7548" : "rgba(26,22,19,0.5)",
                      }}
                    >
                      {active ? "Active" : "Revoked"}
                    </span>
                  </span>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
                      Coach Review
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleToggleCoachReview(m)}
                      aria-pressed={m.coach_review_enabled}
                      aria-label={`Toggle Coach Review for ${displayName}`}
                      className="relative h-[26px] w-11 shrink-0 cursor-pointer rounded-full transition-colors"
                      style={{
                        background: m.coach_review_enabled
                          ? "var(--brand-gradient)"
                          : "rgba(17,17,17,0.12)",
                      }}
                    >
                      <span
                        className="absolute top-[3px] h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(17,17,17,0.25)] transition-[left]"
                        style={{
                          left: m.coach_review_enabled ? "21px" : "3px",
                        }}
                      />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleToggleStatus(m)}
                    className="ml-auto cursor-pointer rounded-[10px] px-3 py-2.5 text-center transition-transform hover:-translate-y-0.5"
                    style={{
                      background: active ? "#ffffff" : "var(--brand-gradient)",
                      border: active
                        ? "1.5px solid rgba(17,17,17,0.12)"
                        : "none",
                    }}
                  >
                    <span
                      className="text-xs font-bold"
                      style={{ color: active ? "#8a2c1f" : "#ffffff" }}
                    >
                      {active ? "Revoke" : "Grant"}
                    </span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop: grid table */}
        <div className="hidden md:block">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[2fr_1fr_1.1fr_1fr] items-center gap-3 px-5 pb-3">
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
                Member
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
                Status
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
                Coach Review
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
                Access
              </span>
            </div>

            {members.map((m) => {
              const active = m.status === "active";
              const displayName = m.full_name.trim() || m.email || "—";
              return (
                <div
                  key={m.id}
                  className="grid grid-cols-[2fr_1fr_1.1fr_1fr] items-center gap-3 border-t border-border px-5 py-3.5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-gradient">
                      <span className="font-heading text-[13px] text-white">
                        {initialsFromFullName(m.full_name || displayName)}
                      </span>
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-bold text-foreground">
                        {displayName}
                      </p>
                      <p className="truncate text-xs font-medium text-muted">
                        {m.email ?? "—"}
                      </p>
                    </div>
                  </div>

                  <div>
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-[11px] py-[5px]"
                      style={{
                        background: active
                          ? "rgba(143,174,138,0.15)"
                          : "rgba(17,17,17,0.06)",
                      }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{
                          background: active ? "#6a9a63" : "rgba(17,17,17,0.3)",
                        }}
                      />
                      <span
                        className="text-[11px] font-bold tracking-wide"
                        style={{
                          color: active ? "#4d7548" : "rgba(26,22,19,0.5)",
                        }}
                      >
                        {active ? "Active" : "Revoked"}
                      </span>
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleToggleCoachReview(m)}
                    aria-pressed={m.coach_review_enabled}
                    aria-label={`Toggle Coach Review for ${displayName}`}
                    className="relative h-[26px] w-11 shrink-0 cursor-pointer rounded-full transition-colors"
                    style={{
                      background: m.coach_review_enabled
                        ? "var(--brand-gradient)"
                        : "rgba(17,17,17,0.12)",
                    }}
                  >
                    <span
                      className="absolute top-[3px] h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(17,17,17,0.25)] transition-[left]"
                      style={{ left: m.coach_review_enabled ? "21px" : "3px" }}
                    />
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleToggleStatus(m)}
                    className="cursor-pointer rounded-[10px] px-3 py-2.5 text-center transition-transform hover:-translate-y-0.5"
                    style={{
                      background: active ? "#ffffff" : "var(--brand-gradient)",
                      border: active
                        ? "1.5px solid rgba(17,17,17,0.12)"
                        : "none",
                    }}
                  >
                    <span
                      className="text-xs font-bold"
                      style={{ color: active ? "#8a2c1f" : "#ffffff" }}
                    >
                      {active ? "Revoke" : "Grant"}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
