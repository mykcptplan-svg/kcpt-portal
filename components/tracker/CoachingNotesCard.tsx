"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardCheckIcon } from "@/components/icons";
import { getMyCoachingNotes, isNoteEdited } from "@/lib/api/coachingNotes";
import { createClient } from "@/lib/supabase/client";
import type { MemberCoachingNote } from "@/types";

const INITIAL_COUNT = 5;

/** "27 Oct 2026" in Europe/London. */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Read-only list of the coach's notes that were shared with this member, shown
 * under "My Focus This Week" in the Success Tracker. The server only ever
 * returns the caller's own visible notes (id, note, created_at, updated_at).
 *
 * Renders nothing while loading, on error, and when there are no notes, so
 * members without notes see no change at all. Mount it only for active
 * members. Note text is never logged.
 */
export default function CoachingNotesCard() {
  const supabase = useMemo(() => createClient(), []);
  const [notes, setNotes] = useState<MemberCoachingNote[]>([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    // Fetched once on mount (no polling); guards against a late response.
    let cancelled = false;

    async function load() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) return;
        const list = await getMyCoachingNotes(session.access_token);
        if (!cancelled) setNotes(list);
      } catch {
        // Errors render nothing; the tracker works exactly as before.
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  if (notes.length === 0) return null;

  const visible = showAll ? notes : notes.slice(0, INITIAL_COUNT);
  const hiddenCount = notes.length - visible.length;

  return (
    <section className="rounded-[20px] border border-border bg-card p-5 shadow-[0_12px_26px_-18px_rgba(17,17,17,0.16)]">
      <div className="mb-3.5 flex items-center gap-3">
        <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white">
          <ClipboardCheckIcon className="h-3.5 w-3.5" />
        </span>
        <h2 className="font-heading text-base uppercase tracking-wide text-foreground">
          Kelly&apos;s Coaching Notes
        </h2>
      </div>

      <ul className="flex flex-col gap-3">
        {visible.map((note) => (
          <li
            key={note.id}
            className="rounded-[14px] border border-border bg-background px-3.5 py-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="text-[12px] font-bold text-foreground">
                {formatDate(note.created_at)}
              </p>
              {isNoteEdited(note) && (
                <p className="text-[11.5px] font-medium text-muted">
                  Updated {formatDate(note.updated_at)}
                </p>
              )}
            </div>
            {/* Plain text node: line breaks kept, never rendered as HTML. */}
            <p className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-[1.6] text-foreground [overflow-wrap:anywhere]">
              {note.note}
            </p>
          </li>
        ))}
      </ul>

      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-3 cursor-pointer rounded-[10px] border border-border px-3.5 py-2 text-xs font-bold text-foreground transition-colors hover:bg-tip-bg"
        >
          Show earlier notes
        </button>
      )}
    </section>
  );
}
