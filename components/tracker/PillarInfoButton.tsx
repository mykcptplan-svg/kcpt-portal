"use client";

import { useEffect, useRef, useState } from "react";

export default function PillarInfoButton({
  label,
  text,
}: {
  label: string;
  text: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => setOpen(false), 4000);
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (
        target instanceof Node &&
        wrapRef.current &&
        !wrapRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative inline-flex shrink-0">
      <button
        type="button"
        aria-label={`${label} info`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-muted text-[9px] font-bold leading-none text-muted"
      >
        i
      </button>
      {open && (
        <div
          role="status"
          className="absolute left-1/2 top-full z-50 mt-1.5 w-[200px] -translate-x-1/2 rounded-[12px] border border-border bg-card px-3 py-2 text-[11.5px] font-medium leading-snug text-foreground shadow-[0_4px_10px_-4px_rgba(17,17,17,0.12)]"
        >
          {text}
        </div>
      )}
    </div>
  );
}
