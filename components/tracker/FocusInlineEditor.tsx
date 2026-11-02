"use client";

import { useState } from "react";

const SLOTS = 3;
const ITEM_MAX_CHARS = 120;

/**
 * Inline editor for this week's focus (up to 3 points) inside the
 * "My Focus This Week" card. Purely presentational: the parent owns the API
 * call, the saving flag and the error text. The typed text is kept here, so it
 * survives a failed save.
 */
export default function FocusInlineEditor({
  initialItems,
  saving,
  error,
  onSave,
  onCancel,
}: {
  initialItems: string[];
  saving: boolean;
  error: string | null;
  onSave: (items: string[]) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<string[]>(() =>
    Array.from({ length: SLOTS }, (_, i) => initialItems[i] ?? ""),
  );

  const items = values.map((s) => s.trim()).filter((s) => s.length > 0);
  const canSave = items.length > 0 && !saving;

  return (
    <div>
      <div className="flex flex-col gap-2">
        {values.map((value, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-[12px] font-bold text-muted">
              {i + 1}.
            </span>
            <input
              type="text"
              value={value}
              onChange={(e) => {
                const next = values.slice();
                next[i] = e.target.value;
                setValues(next);
              }}
              placeholder={i === 0 ? "e.g. Prep lunches on Sunday" : "Optional"}
              maxLength={ITEM_MAX_CHARS}
              disabled={saving}
              aria-label={`Focus point ${i + 1}`}
              className="w-full rounded-[10px] border border-border bg-background px-3 py-2 text-[13.5px] text-foreground outline-none focus:border-brand-orange disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
        ))}
      </div>

      {error && (
        <p
          className="mt-2 text-[12px] font-semibold text-brand-orange-dark"
          role="alert"
        >
          {error}
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onSave(items)}
          disabled={!canSave}
          className="cursor-pointer rounded-[10px] bg-brand-orange px-3.5 py-2 text-xs font-bold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="cursor-pointer rounded-[10px] border border-border px-3.5 py-2 text-xs font-bold text-foreground transition-colors hover:bg-tip-bg disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
