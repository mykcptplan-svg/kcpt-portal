import type { ReactNode } from "react";

/** White titled card used on the member's KCPT Plan page. */
export default function PlanCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[20px] border border-border bg-card p-5 shadow-[0_12px_26px_-18px_rgba(17,17,17,0.16)]">
      <h2 className="font-heading text-base uppercase tracking-wide text-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Plain-text body. Rendered as a React text node (escaped) with
 * white-space: pre-wrap, never as HTML or markdown. overflow-wrap keeps a long
 * unbroken string from stretching the card.
 */
export function PlanText({ text }: { text: string }) {
  return (
    <p className="mt-2.5 whitespace-pre-wrap text-[14.5px] leading-[1.6] text-foreground [overflow-wrap:anywhere]">
      {text}
    </p>
  );
}
