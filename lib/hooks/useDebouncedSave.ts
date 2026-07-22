import { useEffect, useRef, useState } from "react";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Debounces `save(value)` after `value` changes, skipping the run that
 * happens the moment `skip` flips from true to false (i.e. the state
 * update that populates the form from a fetch shouldn't trigger a write).
 */
export function useDebouncedSave<T>(
  value: T,
  save: (value: T) => Promise<void>,
  { delay = 800, skip = false }: { delay?: number; skip?: boolean } = {},
): { status: SaveStatus; error: string | null } {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const skipNextRef = useRef(true);

  useEffect(() => {
    if (skip) {
      skipNextRef.current = true;
      return;
    }
    if (skipNextRef.current) {
      skipNextRef.current = false;
      return;
    }

    setStatus("saving");
    const timer = setTimeout(() => {
      save(value)
        .then(() => {
          setStatus("saved");
          setError(null);
        })
        .catch((err) => {
          setStatus("error");
          setError(err instanceof Error ? err.message : "Unable to save.");
        });
    }, delay);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, skip]);

  return { status, error };
}
