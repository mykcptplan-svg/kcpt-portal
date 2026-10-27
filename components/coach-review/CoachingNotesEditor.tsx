"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import HeartLoader from "@/components/HeartLoader";
import { LeaveDialog } from "@/components/coach-review/EditorChrome";
import {
  createCoachingNote,
  deleteCoachingNote,
  getMemberCoachingNotes,
  isNoteEdited,
  updateCoachingNote,
} from "@/lib/api/coachingNotes";
import { useProfile } from "@/lib/context/ProfileContext";
import { useUnsavedChangesWarning } from "@/lib/hooks/useUnsavedChangesWarning";
import { codePointLength, isUuid } from "@/lib/kcptPlan";
import { createClient } from "@/lib/supabase/client";
import type { CoachingNote } from "@/types";

const NOTE_MAX = 5000;

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

/** "27 Oct 2026, 14:05" in Europe/London. */
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

const cardClass =
  "rounded-[20px] border border-border bg-card p-5 shadow-[0_12px_26px_-18px_rgba(17,17,17,0.16)]";
const cardTitleClass =
  "font-heading text-base uppercase tracking-wide text-foreground";
const textareaClass =
  "w-full resize-y rounded-[10px] border border-border bg-background px-[13px] py-3 text-[13.5px] leading-[1.55] text-foreground outline-none focus:border-brand-orange aria-[invalid=true]:border-brand-orange-dark";
const primaryButtonClass =
  "cursor-pointer rounded-[14px] bg-brand-gradient px-5 py-3 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0";
const smallButtonClass =
  "cursor-pointer rounded-[10px] border border-border px-3 py-2 text-xs font-bold text-foreground transition-colors hover:bg-tip-bg disabled:cursor-not-allowed disabled:opacity-60";

/** Same switch look as the Dark Mode switch on the profile page. */
function Switch({
  checked,
  onChange,
  disabled,
  labelledBy,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  labelledBy: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative h-[26px] w-11 shrink-0 cursor-pointer rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60"
      style={{
        background: checked ? "var(--brand-gradient)" : "rgba(17,17,17,0.12)",
      }}
    >
      <span
        className="absolute top-[3px] h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(17,17,17,0.2)] transition-[left]"
        style={{ left: checked ? "21px" : "3px" }}
      />
    </button>
  );
}

/** Badge text differs between states, so it is not conveyed by colour alone. */
function VisibilityBadge({ visible }: { visible: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-[10px] py-1 text-[11px] font-bold tracking-wide ${
        visible
          ? "border border-solid"
          : "border border-dashed border-border"
      }`}
      style={
        visible
          ? {
              background: "rgba(143,174,138,0.15)",
              borderColor: "#6a9a63",
              color: "#4d7548",
            }
          : {
              background: "var(--badge-neutral-bg)",
              color: "var(--badge-neutral-text)",
            }
      }
    >
      <span aria-hidden>{visible ? "●" : "○"}</span>
      {visible ? "Visible to member" : "Private"}
    </span>
  );
}

/**
 * Admin-only coaching notes for one member (Coach Review, "Coaching Notes"
 * tab). Notes are private by default; the admin can share a note so the member
 * sees it. The server (coaching-notes function + RLS) is the real guard. Mount
 * with key={memberId} so state resets per member.
 */
export default function CoachingNotesEditor({
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
  const uid = useId();

  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [notes, setNotes] = useState<CoachingNote[]>([]);

  // Add-note form. Private (off) is the default for every new note.
  const [draft, setDraft] = useState("");
  const [draftVisible, setDraftVisible] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Inline edit of one note.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // One request at a time per note (visibility toggle, delete).
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // Sharing a private note needs a confirmation; the switch stays off meanwhile.
  const [confirmShareId, setConfirmShareId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(
    null,
  );

  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    if (profileLoading || !isAdmin || !memberIdValid) return;

    // Guards against a slow response for a previous member overwriting this
    // member's notes.
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
        const list = await getMemberCoachingNotes(
          session.access_token,
          memberId,
        );
        if (cancelled) return;
        setNotes(list);
        setLoadState({ kind: "ready" });
      } catch (err) {
        if (!cancelled) {
          setLoadState({
            kind: "error",
            message: describeError(err, "Unable to load notes."),
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

  const draftTrimmed = draft.trim();
  const draftCount = codePointLength(draftTrimmed);
  const draftOver = draftCount > NOTE_MAX;
  const canAdd = ready && !adding && draftTrimmed.length > 0 && !draftOver;

  const editingNote = notes.find((n) => n.id === editingId) ?? null;
  const editTrimmed = editText.trim();
  const editCount = codePointLength(editTrimmed);
  const editOver = editCount > NOTE_MAX;
  const editChanged = editingNote !== null && editTrimmed !== editingNote.note;
  const canSaveEdit =
    editingNote !== null &&
    !savingEdit &&
    editTrimmed.length > 0 &&
    !editOver &&
    editChanged;

  // Unsaved: a non-empty add draft, or an open inline edit with changes.
  const dirty = ready && (draftTrimmed.length > 0 || (editingNote !== null && editChanged));

  useUnsavedChangesWarning(dirty, (href) => setPendingHref(href));

  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  async function getToken(): Promise<string> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw new Error("Not logged in.");
    return session.access_token;
  }

  async function handleAdd() {
    if (!canAdd) return;
    setAdding(true);
    setAddError(null);
    try {
      const created = await createCoachingNote(await getToken(), {
        userId: memberId,
        note: draftTrimmed,
        visibleToMember: draftVisible,
      });
      setNotes((prev) => [created, ...prev]);
      // Everything typed is cleared only after success; private is the default
      // for the next note.
      setDraft("");
      setDraftVisible(false);
    } catch (err) {
      setAddError(describeError(err, "Unable to save this note."));
    } finally {
      setAdding(false);
    }
  }

  function startEdit(note: CoachingNote) {
    if (editingId === note.id) return;
    if (
      editingNote !== null &&
      editChanged &&
      !window.confirm("Discard your unsaved edit?")
    ) {
      return;
    }
    setEditingId(note.id);
    setEditText(note.note);
    setEditError(null);
    setConfirmDeleteId(null);
    setConfirmShareId(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText("");
    setEditError(null);
  }

  async function handleSaveEdit() {
    if (!canSaveEdit || !editingNote) return;
    const id = editingNote.id;
    setSavingEdit(true);
    setEditError(null);
    try {
      const updated = await updateCoachingNote(await getToken(), id, {
        note: editTrimmed,
      });
      setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
      cancelEdit();
    } catch (err) {
      setEditError(describeError(err, "Unable to save this note."));
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleToggleVisible(note: CoachingNote, next: boolean) {
    setBusyId(note.id);
    setRowError(null);
    try {
      const updated = await updateCoachingNote(await getToken(), note.id, {
        visibleToMember: next,
      });
      // Only now does the badge change.
      setNotes((prev) => prev.map((n) => (n.id === note.id ? updated : n)));
      setConfirmShareId(null);
    } catch (err) {
      setRowError({
        id: note.id,
        message: describeError(err, "Unable to change visibility."),
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(note: CoachingNote) {
    setBusyId(note.id);
    setRowError(null);
    try {
      await deleteCoachingNote(await getToken(), note.id);
      setNotes((prev) => prev.filter((n) => n.id !== note.id));
      setConfirmDeleteId(null);
      if (editingId === note.id) cancelEdit();
    } catch (err) {
      setRowError({
        id: note.id,
        message: describeError(err, "Unable to delete this note."),
      });
    } finally {
      setBusyId(null);
    }
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
          className={primaryButtonClass}
        >
          <span className="font-heading text-[13px] uppercase tracking-wide text-white">
            Try again
          </span>
        </button>
      </div>
    );
  }

  const draftId = `${uid}-draft`;
  const draftNoteId = `${uid}-draft-note`;
  const draftSwitchLabelId = `${uid}-draft-switch`;
  const draftHelpId = `${uid}-draft-help`;

  return (
    <div className="flex flex-col gap-4">
      {/* ---- Add note ---------------------------------------------------- */}
      <section className={cardClass}>
        <label htmlFor={draftId} className={`${cardTitleClass} mb-3 block`}>
          Add note
        </label>
        <textarea
          id={draftId}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setAddError(null);
          }}
          rows={4}
          aria-invalid={draftOver}
          aria-describedby={draftOver ? `${draftNoteId} ${draftId}-count` : `${draftId}-count`}
          disabled={adding}
          className={textareaClass}
        />
        <div className="mt-1.5 flex flex-wrap items-start justify-between gap-2 text-[11.5px] font-semibold">
          {draftOver ? (
            <p
              id={draftNoteId}
              style={{ color: "var(--revoke-text)" }}
            >
              This note is {formatCount(draftCount - NOTE_MAX)} character
              {draftCount - NOTE_MAX === 1 ? "" : "s"} over the{" "}
              {formatCount(NOTE_MAX)} limit.
            </p>
          ) : (
            <span />
          )}
          <span
            id={`${draftId}-count`}
            style={{ color: draftOver ? "var(--revoke-text)" : "var(--muted)" }}
          >
            {formatCount(draftCount)} / {formatCount(NOTE_MAX)}
          </span>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <span
            id={draftSwitchLabelId}
            className="text-[13px] font-bold text-foreground"
          >
            Visible to {memberName}
          </span>
          <Switch
            checked={draftVisible}
            onChange={setDraftVisible}
            disabled={adding}
            labelledBy={draftSwitchLabelId}
          />
        </div>
        <p
          id={draftHelpId}
          className="mt-1.5 text-[12px] font-medium leading-snug text-muted"
        >
          {draftVisible
            ? `Shared. ${memberName} will see this note on their Success Tracker page.`
            : "Private. Only you can see this note."}
        </p>

        {addError && (
          <p className="mt-3 text-xs text-brand-orange-dark" role="alert">
            {addError}
          </p>
        )}

        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={!canAdd}
          className={`${primaryButtonClass} mt-4`}
        >
          <span className="font-heading text-[13px] uppercase tracking-wide text-white">
            {adding ? "Adding…" : "Add note"}
          </span>
        </button>
      </section>

      {/* ---- Notes list -------------------------------------------------- */}
      {notes.length === 0 ? (
        <p className="text-sm text-muted">No notes yet for {memberName}.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {notes.map((note) => {
            const editing = editingId === note.id;
            const busy = busyId === note.id;
            const switchLabelId = `${uid}-sw-${note.id}`;
            const editId = `${uid}-edit-${note.id}`;
            return (
              <li key={note.id} className={cardClass}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <p className="text-[12.5px] font-bold text-foreground">
                    {formatDateTime(note.created_at)}
                  </p>
                  <VisibilityBadge visible={note.visible_to_member} />
                  {isNoteEdited(note) && (
                    <span className="text-[11.5px] font-semibold text-muted">
                      Edited {formatDateTime(note.updated_at)}
                    </span>
                  )}
                </div>

                {editing ? (
                  <div className="mt-3">
                    <label htmlFor={editId} className="sr-only">
                      Edit note
                    </label>
                    <textarea
                      id={editId}
                      value={editText}
                      onChange={(e) => {
                        setEditText(e.target.value);
                        setEditError(null);
                      }}
                      rows={5}
                      aria-invalid={editOver}
                      disabled={savingEdit}
                      className={textareaClass}
                    />
                    <div className="mt-1.5 flex justify-end text-[11.5px] font-semibold">
                      <span
                        style={{
                          color: editOver ? "var(--revoke-text)" : "var(--muted)",
                        }}
                      >
                        {formatCount(editCount)} / {formatCount(NOTE_MAX)}
                      </span>
                    </div>
                    {editOver && (
                      <p
                        className="mt-1 text-[12px] font-semibold"
                        style={{ color: "var(--revoke-text)" }}
                      >
                        This note is {formatCount(editCount - NOTE_MAX)} character
                        {editCount - NOTE_MAX === 1 ? "" : "s"} over the{" "}
                        {formatCount(NOTE_MAX)} limit.
                      </p>
                    )}
                    {editError && (
                      <p
                        className="mt-2 text-xs text-brand-orange-dark"
                        role="alert"
                      >
                        {editError}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleSaveEdit()}
                        disabled={!canSaveEdit}
                        className="cursor-pointer rounded-[10px] bg-brand-gradient px-3.5 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {savingEdit ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        disabled={savingEdit}
                        className={smallButtonClass}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 whitespace-pre-wrap text-[14px] leading-[1.6] text-foreground [overflow-wrap:anywhere]">
                    {note.note}
                  </p>
                )}

                {!editing && (
                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-border pt-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        id={switchLabelId}
                        className="text-[12px] font-bold text-muted"
                      >
                        Visible to member
                      </span>
                      <Switch
                        checked={note.visible_to_member}
                        onChange={(next) => {
                          if (next) {
                            // Private -> visible: ask first, send nothing yet.
                            setConfirmShareId(note.id);
                            setConfirmDeleteId(null);
                            setRowError(null);
                          } else {
                            // Visible -> private stays immediate.
                            setConfirmShareId(null);
                            void handleToggleVisible(note, false);
                          }
                        }}
                        disabled={busy}
                        labelledBy={switchLabelId}
                      />
                    </div>

                    {confirmShareId === note.id && (
                      <div
                        className="flex flex-wrap items-center gap-2 text-[12px] font-semibold"
                        role="alertdialog"
                        aria-label="Confirm sharing this note"
                      >
                        <span className="text-muted">
                          Share this note with {memberName}? They will see it
                          right away.
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleToggleVisible(note, true)}
                          disabled={busy}
                          className="cursor-pointer text-brand-orange-dark underline decoration-dotted underline-offset-2 disabled:opacity-60"
                        >
                          {busy ? "Sharing…" : "Yes, share"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmShareId(null)}
                          disabled={busy}
                          className="cursor-pointer text-muted underline decoration-dotted underline-offset-2 disabled:opacity-60"
                        >
                          Cancel
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => startEdit(note)}
                      disabled={busy}
                      className={smallButtonClass}
                    >
                      Edit
                    </button>

                    {confirmDeleteId === note.id ? (
                      <div
                        className="flex flex-wrap items-center gap-2 text-[12px] font-semibold"
                        role="alertdialog"
                        aria-label="Confirm deleting this note"
                      >
                        <span className="text-muted">Delete this note?</span>
                        <button
                          type="button"
                          onClick={() => void handleDelete(note)}
                          disabled={busy}
                          className="cursor-pointer text-brand-orange-dark underline decoration-dotted underline-offset-2 disabled:opacity-60"
                        >
                          {busy ? "Deleting…" : "Yes, delete"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          disabled={busy}
                          className="cursor-pointer text-muted underline decoration-dotted underline-offset-2 disabled:opacity-60"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmDeleteId(note.id);
                          setConfirmShareId(null);
                          setRowError(null);
                        }}
                        disabled={busy}
                        className={`${smallButtonClass} !text-[var(--revoke-text)]`}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                )}

                {rowError?.id === note.id && (
                  <p className="mt-2 text-xs text-brand-orange-dark" role="alert">
                    {rowError.message}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {pendingHref !== null && (
        <LeaveDialog
          message={`You have unsaved changes to ${memberName}'s coaching notes. If you leave now, they will be lost.`}
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
