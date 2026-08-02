"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import HeartLoader from "@/components/HeartLoader";
import { ChevronDownIcon, DownloadIcon, UsersIcon } from "@/components/icons";
import {
  getMembersList,
  inviteMember,
  listPendingInvites,
  manageMember,
  type MemberListItem,
  type PendingInvite,
} from "@/lib/api/admin";
import {
  createQuote,
  deleteQuote,
  listQuotes,
  updateQuote,
  type MotivationalQuote,
} from "@/lib/api/quotes";
import { downloadMembersCsv } from "@/lib/membersCsv";
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

function pendingStatusLabel(status: PendingInvite["status"]): string {
  return status === "not_opened"
    ? "Invite not opened"
    : "Opened, setup not finished";
}

function formatInvitedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function AdminPage() {
  const supabase = useMemo(() => createClient(), []);
  const accessTokenRef = useRef<string | null>(null);

  const [members, setMembers] = useState<MemberListItem[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [quotes, setQuotes] = useState<MotivationalQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [resendingEmail, setResendingEmail] = useState<string | null>(null);

  const [newQuoteBody, setNewQuoteBody] = useState("");
  const [addingQuote, setAddingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
  const [editingQuoteBody, setEditingQuoteBody] = useState("");
  const [quoteBusyId, setQuoteBusyId] = useState<string | null>(null);

  const [membersOpen, setMembersOpen] = useState(true);
  const [onHoldOpen, setOnHoldOpen] = useState(false);
  const [quotesOpen, setQuotesOpen] = useState(false);
  const [memberQuery, setMemberQuery] = useState("");
  const [quoteQuery, setQuoteQuery] = useState("");
  const onHoldOpenInitialized = useRef(false);

  const filteredMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      const name = m.full_name.toLowerCase();
      const email = (m.email ?? "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [members, memberQuery]);

  const filteredQuotes = useMemo(() => {
    const q = quoteQuery.trim().toLowerCase();
    if (!q) return quotes;
    return quotes.filter((quote) => quote.body.toLowerCase().includes(q));
  }, [quotes, quoteQuery]);

  async function refreshMembers(token: string) {
    const list = await getMembersList(token);
    setMembers(list);
  }

  async function refreshPendingInvites(token: string) {
    const list = await listPendingInvites(token);
    setPendingInvites(list);
    if (!onHoldOpenInitialized.current) {
      onHoldOpenInitialized.current = true;
      setOnHoldOpen(list.length > 0);
    }
  }

  async function refreshQuotes(token: string) {
    const list = await listQuotes(token);
    setQuotes(list);
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
        await Promise.all([
          refreshMembers(session.access_token),
          refreshPendingInvites(session.access_token),
          refreshQuotes(session.access_token),
        ]);
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Unable to load admin data.",
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
      await Promise.all([
        refreshMembers(token),
        refreshPendingInvites(token),
      ]);
    } catch (err) {
      setInviteError(
        err instanceof Error ? err.message : "Unable to send invite.",
      );
    } finally {
      setInviting(false);
    }
  }

  async function handleResendInvite(email: string) {
    const token = accessTokenRef.current;
    if (!token) {
      setActionError("Not logged in.");
      return;
    }

    setResendingEmail(email);
    setActionError(null);
    try {
      await inviteMember(token, email);
      await refreshPendingInvites(token);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Unable to send invite.",
      );
    } finally {
      setResendingEmail(null);
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

  async function handleAddQuote() {
    const body = newQuoteBody.trim();
    if (!body) return;
    const token = accessTokenRef.current;
    if (!token) {
      setQuoteError("Not logged in.");
      return;
    }

    setAddingQuote(true);
    setQuoteError(null);
    try {
      const created = await createQuote(token, body, true);
      setQuotes((prev) => [created, ...prev]);
      setNewQuoteBody("");
    } catch (err) {
      setQuoteError(
        err instanceof Error ? err.message : "Unable to add quote.",
      );
    } finally {
      setAddingQuote(false);
    }
  }

  async function handleSaveQuoteEdit(quote: MotivationalQuote) {
    const body = editingQuoteBody.trim();
    if (!body) {
      setQuoteError("Quote text is required.");
      return;
    }
    const token = accessTokenRef.current;
    if (!token) {
      setQuoteError("Not logged in.");
      return;
    }

    setQuoteBusyId(quote.id);
    setQuoteError(null);
    try {
      const updated = await updateQuote(token, { id: quote.id, body });
      setQuotes((prev) =>
        prev.map((q) => (q.id === updated.id ? updated : q)),
      );
      setEditingQuoteId(null);
      setEditingQuoteBody("");
    } catch (err) {
      setQuoteError(
        err instanceof Error ? err.message : "Unable to update quote.",
      );
    } finally {
      setQuoteBusyId(null);
    }
  }

  async function handleToggleQuoteActive(quote: MotivationalQuote) {
    const token = accessTokenRef.current;
    if (!token) {
      setQuoteError("Not logged in.");
      return;
    }

    setQuoteBusyId(quote.id);
    setQuoteError(null);
    const next = !quote.is_active;
    setQuotes((prev) =>
      prev.map((q) =>
        q.id === quote.id ? { ...q, is_active: next } : q,
      ),
    );

    try {
      const updated = await updateQuote(token, {
        id: quote.id,
        is_active: next,
      });
      setQuotes((prev) =>
        prev.map((q) => (q.id === updated.id ? updated : q)),
      );
    } catch (err) {
      setQuotes((prev) =>
        prev.map((q) => (q.id === quote.id ? quote : q)),
      );
      setQuoteError(
        err instanceof Error ? err.message : "Unable to update quote.",
      );
    } finally {
      setQuoteBusyId(null);
    }
  }

  async function handleDeleteQuote(quote: MotivationalQuote) {
    const token = accessTokenRef.current;
    if (!token) {
      setQuoteError("Not logged in.");
      return;
    }

    setQuoteBusyId(quote.id);
    setQuoteError(null);
    try {
      await deleteQuote(token, quote.id);
      setQuotes((prev) => prev.filter((q) => q.id !== quote.id));
      if (editingQuoteId === quote.id) {
        setEditingQuoteId(null);
        setEditingQuoteBody("");
      }
    } catch (err) {
      setQuoteError(
        err instanceof Error ? err.message : "Unable to delete quote.",
      );
    } finally {
      setQuoteBusyId(null);
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
          <button
            type="button"
            onClick={() => setMembersOpen((v) => !v)}
            aria-expanded={membersOpen}
            className="mb-4 flex w-full cursor-pointer items-center gap-3 text-left"
          >
            <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white">
              <UsersIcon className="h-4 w-4" />
            </span>
            <h2 className="min-w-0 flex-1 font-heading text-base uppercase tracking-wide text-foreground">
              Members ({members.length})
            </h2>
            <ChevronDownIcon
              className={`h-5 w-5 shrink-0 text-muted transition-transform ${
                membersOpen ? "rotate-180" : ""
              }`}
            />
          </button>
        </div>

        {membersOpen && (
          <>
            <div className="flex items-center gap-2.5 px-5 pb-3">
              <input
                type="search"
                value={memberQuery}
                onChange={(e) => setMemberQuery(e.target.value)}
                placeholder="Search by name or email…"
                className="min-w-0 flex-1 rounded-[10px] border border-border bg-background px-[13px] py-3 text-[14px] font-semibold text-foreground outline-none focus:border-brand-orange"
              />
              <button
                type="button"
                onClick={() => downloadMembersCsv(filteredMembers)}
                disabled={filteredMembers.length === 0}
                className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-[10px] border-[1.5px] border-border px-3.5 py-3 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <DownloadIcon className="h-4 w-4 text-muted" />
                <span className="font-heading text-[13px] uppercase tracking-wide text-muted">
                  Export CSV
                </span>
              </button>
            </div>

            {filteredMembers.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted">No members match.</p>
            ) : (
              <>
        {/* Mobile: stacked cards */}
        <div className="flex flex-col gap-2.5 px-5 pb-5 md:hidden">
          {filteredMembers.map((m) => {
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
                        : "var(--badge-neutral-bg)",
                    }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{
                        background: active
                          ? "#6a9a63"
                          : "var(--badge-neutral-dot)",
                      }}
                    />
                    <span
                      className="text-[11px] font-bold tracking-wide"
                      style={{
                        color: active
                          ? "#4d7548"
                          : "var(--badge-neutral-text)",
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
                      background: active
                        ? "var(--card)"
                        : "var(--brand-gradient)",
                      border: active
                        ? "1.5px solid var(--border)"
                        : "1.5px solid transparent",
                    }}
                  >
                    <span
                      className="text-xs font-bold"
                      style={{
                        color: active ? "var(--revoke-text)" : "#ffffff",
                      }}
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

            {filteredMembers.map((m) => {
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
                          : "var(--badge-neutral-bg)",
                      }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{
                          background: active
                            ? "#6a9a63"
                            : "var(--badge-neutral-dot)",
                        }}
                      />
                      <span
                        className="text-[11px] font-bold tracking-wide"
                        style={{
                          color: active
                            ? "#4d7548"
                            : "var(--badge-neutral-text)",
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
                      background: active
                        ? "var(--card)"
                        : "var(--brand-gradient)",
                      border: active
                        ? "1.5px solid var(--border)"
                        : "1.5px solid transparent",
                    }}
                  >
                    <span
                      className="text-xs font-bold"
                      style={{
                        color: active ? "var(--revoke-text)" : "#ffffff",
                      }}
                    >
                      {active ? "Revoke" : "Grant"}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
              </>
            )}
          </>
        )}
      </section>

      <section className="overflow-hidden rounded-[20px] border border-border bg-card shadow-[0_12px_26px_-18px_rgba(17,17,17,0.16)]">
        <div className={`px-5 pt-[18px] ${onHoldOpen ? "" : "pb-[18px]"}`}>
          <button
            type="button"
            onClick={() => setOnHoldOpen((v) => !v)}
            aria-expanded={onHoldOpen}
            className={`flex w-full cursor-pointer items-center gap-3 text-left ${onHoldOpen ? "mb-4" : ""}`}
          >
            <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white">
              <span className="font-heading text-sm text-white">…</span>
            </span>
            <h2 className="min-w-0 flex-1 font-heading text-base uppercase tracking-wide text-foreground">
              On Hold ({pendingInvites.length})
            </h2>
            <ChevronDownIcon
              className={`h-5 w-5 shrink-0 text-muted transition-transform ${
                onHoldOpen ? "rotate-180" : ""
              }`}
            />
          </button>
        </div>

        {onHoldOpen && (
          <>
            {pendingInvites.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted">No pending invites.</p>
            ) : (
              <>
                <div className="flex flex-col gap-2.5 px-5 pb-5 md:hidden">
                  {pendingInvites.map((invite) => {
                    const busy = resendingEmail === invite.email;
                    return (
                      <div
                        key={invite.email}
                        className="rounded-[18px] border border-border bg-background px-4 py-3.5"
                      >
                        <p className="truncate text-[13.5px] font-bold text-foreground">
                          {invite.email}
                        </p>
                        <p className="mt-1 text-xs font-medium text-muted">
                          Invited {formatInvitedAt(invite.invited_at)}
                        </p>
                        <p className="mt-2 text-[11px] font-bold tracking-wide text-muted">
                          {pendingStatusLabel(invite.status)}
                        </p>
                        <button
                          type="button"
                          onClick={() => void handleResendInvite(invite.email)}
                          disabled={busy || resendingEmail !== null}
                          className="mt-3 w-full cursor-pointer rounded-[10px] border-[1.5px] border-border px-3 py-2.5 text-center transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <span className="font-heading text-[13px] uppercase tracking-wide text-muted">
                            {busy ? "Sending…" : "Resend"}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div className="hidden md:block">
                  <div className="min-w-[640px]">
                    <div className="grid grid-cols-[2fr_1fr_1.4fr_0.8fr] items-center gap-3 px-5 pb-3">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
                        Email
                      </span>
                      <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
                        Invited
                      </span>
                      <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
                        Status
                      </span>
                      <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
                        Action
                      </span>
                    </div>

                    {pendingInvites.map((invite) => {
                      const busy = resendingEmail === invite.email;
                      return (
                        <div
                          key={invite.email}
                          className="grid grid-cols-[2fr_1fr_1.4fr_0.8fr] items-center gap-3 border-t border-border px-5 py-3.5"
                        >
                          <p className="truncate text-[13.5px] font-bold text-foreground">
                            {invite.email}
                          </p>
                          <p className="text-xs font-medium text-muted">
                            {formatInvitedAt(invite.invited_at)}
                          </p>
                          <p className="text-[11px] font-bold tracking-wide text-muted">
                            {pendingStatusLabel(invite.status)}
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              void handleResendInvite(invite.email)
                            }
                            disabled={busy || resendingEmail !== null}
                            className="cursor-pointer rounded-[10px] border-[1.5px] border-border px-3 py-2.5 text-center transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <span className="font-heading text-[13px] uppercase tracking-wide text-muted">
                              {busy ? "Sending…" : "Resend"}
                            </span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </section>

      <section className="overflow-hidden rounded-[20px] border border-border bg-card shadow-[0_12px_26px_-18px_rgba(17,17,17,0.16)]">
        <div className={`px-5 pt-[18px] ${quotesOpen ? "pb-5" : "pb-[18px]"}`}>
          <button
            type="button"
            onClick={() => setQuotesOpen((v) => !v)}
            aria-expanded={quotesOpen}
            className={`flex w-full cursor-pointer items-center gap-3 text-left ${quotesOpen ? "mb-4" : ""}`}
          >
            <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white">
              <span className="font-heading text-sm text-white">“”</span>
            </span>
            <h2 className="min-w-0 flex-1 font-heading text-base uppercase tracking-wide text-foreground">
              Motivational Quotes ({quotes.length})
            </h2>
            <ChevronDownIcon
              className={`h-5 w-5 shrink-0 text-muted transition-transform ${
                quotesOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {quotesOpen && (
            <>
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">
              New quote
            </p>
            <textarea
              value={newQuoteBody}
              onChange={(e) => setNewQuoteBody(e.target.value)}
              rows={2}
              placeholder="Add a short motivational line…"
              className="w-full resize-y rounded-[10px] border border-border bg-background px-[13px] py-3 text-[14px] font-semibold text-foreground outline-none focus:border-brand-orange"
            />
            <button
              type="button"
              onClick={() => void handleAddQuote()}
              disabled={addingQuote || !newQuoteBody.trim()}
              className="mt-2.5 cursor-pointer rounded-[14px] bg-brand-gradient px-5 py-3 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="font-heading text-[13px] uppercase tracking-wide text-white">
                {addingQuote ? "Adding…" : "Add Quote"}
              </span>
            </button>
          </div>

          {quoteError && (
            <p className="mt-3 text-xs text-brand-orange-dark">{quoteError}</p>
          )}

          <div className="mt-5">
            <input
              type="search"
              value={quoteQuery}
              onChange={(e) => setQuoteQuery(e.target.value)}
              placeholder="Search quotes…"
              className="w-full rounded-[10px] border border-border bg-background px-[13px] py-3 text-[14px] font-semibold text-foreground outline-none focus:border-brand-orange"
            />
          </div>

          <div className="mt-3 flex flex-col gap-2.5">
            {quotes.length === 0 ? (
              <p className="text-sm text-muted">No quotes yet.</p>
            ) : filteredQuotes.length === 0 ? (
              <p className="text-sm text-muted">No quotes match.</p>
            ) : (
              filteredQuotes.map((q) => {
                const busy = quoteBusyId === q.id;
                const editing = editingQuoteId === q.id;
                return (
                  <div
                    key={q.id}
                    className="rounded-[14px] border border-border bg-background px-3.5 py-3"
                  >
                    {editing ? (
                      <textarea
                        value={editingQuoteBody}
                        onChange={(e) => setEditingQuoteBody(e.target.value)}
                        rows={2}
                        className="mb-2.5 w-full resize-y rounded-[10px] border border-border bg-card px-[13px] py-2.5 text-[14px] font-semibold text-foreground outline-none focus:border-brand-orange"
                      />
                    ) : (
                      <p className="text-[14px] font-semibold leading-snug text-foreground">
                        {q.body}
                      </p>
                    )}

                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-[11px] py-[5px]"
                        style={{
                          background: q.is_active
                            ? "rgba(143,174,138,0.15)"
                            : "var(--badge-neutral-bg)",
                        }}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{
                            background: q.is_active
                              ? "#6a9a63"
                              : "var(--badge-neutral-dot)",
                          }}
                        />
                        <span
                          className="text-[11px] font-bold tracking-wide"
                          style={{
                            color: q.is_active
                              ? "#4d7548"
                              : "var(--badge-neutral-text)",
                          }}
                        >
                          {q.is_active ? "Active" : "Inactive"}
                        </span>
                      </span>

                      {editing ? (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleSaveQuoteEdit(q)}
                            className="cursor-pointer rounded-[10px] bg-brand-gradient px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setEditingQuoteId(null);
                              setEditingQuoteBody("");
                            }}
                            className="cursor-pointer rounded-[10px] border border-border px-3 py-2 text-xs font-bold text-muted disabled:opacity-60"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setEditingQuoteId(q.id);
                              setEditingQuoteBody(q.body);
                              setQuoteError(null);
                            }}
                            className="cursor-pointer rounded-[10px] border border-border px-3 py-2 text-xs font-bold text-foreground disabled:opacity-60"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleToggleQuoteActive(q)}
                            className="cursor-pointer rounded-[10px] border border-border px-3 py-2 text-xs font-bold text-foreground disabled:opacity-60"
                          >
                            {q.is_active ? "Deactivate" : "Activate"}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleDeleteQuote(q)}
                            className="cursor-pointer rounded-[10px] border border-border px-3 py-2 text-xs font-bold disabled:opacity-60"
                            style={{ color: "var(--revoke-text)" }}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
