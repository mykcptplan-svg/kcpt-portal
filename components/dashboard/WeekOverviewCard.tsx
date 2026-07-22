type WeekOverviewCardProps = {
  weekRange: string;
  basePlanFilled: boolean;
  trackerDaysLogged: number;
  trackerDaysTotal: number;
};

export default function WeekOverviewCard({
  weekRange,
  basePlanFilled,
  trackerDaysLogged,
  trackerDaysTotal,
}: WeekOverviewCardProps) {
  const trackerPct = Math.round((trackerDaysLogged / trackerDaysTotal) * 100);

  return (
    <div className="rounded-[20px] border border-border bg-card p-5 shadow-[0_14px_32px_-18px_rgba(17,17,17,0.16)]">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
          This Week
        </span>
        <span className="text-xs font-semibold text-foreground/70">{weekRange}</span>
      </div>

      <div className="my-4 h-px bg-border" />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span
            className={`h-2 w-2 rounded-full ${
              basePlanFilled ? "bg-brand-orange" : "bg-black/15"
            }`}
          />
          <span className="text-sm font-semibold text-foreground">My Food Plan</span>
        </div>
        <span
          className={`rounded-full px-[11px] py-[5px] text-xs font-bold ${
            basePlanFilled
              ? "bg-badge-bg text-badge-text"
              : "bg-black/[0.06] text-muted"
          }`}
        >
          {basePlanFilled ? "Filled In" : "Not Started"}
        </span>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-brand-orange" />
            <span className="text-sm font-semibold text-foreground">
              My Success Tracker
            </span>
          </div>
          <span className="text-xs font-semibold text-muted">
            {trackerDaysLogged} of {trackerDaysTotal} days logged
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-black/[0.07]">
          <div
            className="h-full rounded-full bg-brand-gradient"
            style={{ width: `${trackerPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
