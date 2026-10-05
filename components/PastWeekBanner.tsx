"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { formatWeekRange } from "@/lib/week";

/**
 * Shown while a member is editing a past week (URL param only). `weekStart`
 * is the Monday of the week being edited.
 */
export default function PastWeekBanner({ weekStart }: { weekStart: string }) {
  const pathname = usePathname();

  return (
    <div
      className="flex flex-col gap-2 rounded-lg border px-4 py-3"
      style={{
        background: "var(--tip-bg)",
        borderColor: "var(--brand-orange-dark)",
      }}
      role="status"
    >
      <p className="text-[13.5px] font-semibold leading-snug text-foreground">
        You are editing a past week ({formatWeekRange(weekStart)})
      </p>
      <div className="flex flex-wrap items-center gap-3 text-[12px] font-bold">
        <Link
          href="/history"
          className="text-brand-orange-dark underline decoration-dotted underline-offset-2"
        >
          Back to History
        </Link>
        <Link
          href={pathname}
          className="text-brand-orange-dark underline decoration-dotted underline-offset-2"
        >
          Back to today
        </Link>
      </div>
    </div>
  );
}
