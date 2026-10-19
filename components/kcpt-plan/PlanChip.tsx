/** "Has plan" / "No plan" marker for the Admin members list. */
export default function PlanChip({ hasPlan }: { hasPlan: boolean }) {
  return (
    <span
      className="inline-flex whitespace-nowrap rounded-full px-[11px] py-[5px] text-[11px] font-bold tracking-wide"
      style={{
        background: hasPlan ? "rgba(251,147,58,0.14)" : "var(--badge-neutral-bg)",
        color: hasPlan ? "var(--tip-text)" : "var(--badge-neutral-text)",
      }}
    >
      {hasPlan ? "Has plan" : "No plan"}
    </span>
  );
}
