type WeekOverviewCardProps = {
  weekRange: string;
  basePlanFilled: boolean;
  trackerDaysLogged: number;
  trackerDaysTotal: number;
};

const RING_SIZE = 68;
const RING_STROKE = 7;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export default function WeekOverviewCard({
  weekRange,
  basePlanFilled,
  trackerDaysLogged,
  trackerDaysTotal,
}: WeekOverviewCardProps) {
  const progress =
    trackerDaysTotal > 0
      ? Math.min(1, Math.max(0, trackerDaysLogged / trackerDaysTotal))
      : 0;
  const trackerPct = Math.round(progress * 100);
  const dashOffset = RING_CIRCUMFERENCE * (1 - progress);

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
        <div className="mb-3 flex items-center justify-between">
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

        <div
          className="relative mx-auto"
          style={{ width: RING_SIZE, height: RING_SIZE }}
          role="progressbar"
          aria-valuenow={trackerPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${trackerDaysLogged} of ${trackerDaysTotal} days logged`}
        >
          <svg
            width={RING_SIZE}
            height={RING_SIZE}
            viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
            className="block"
            aria-hidden
          >
            <defs>
              <linearGradient
                id="tracker-ring-gradient"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop offset="0%" stopColor="#f7a235" />
                <stop offset="100%" stopColor="#ec4a31" />
              </linearGradient>
            </defs>
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              stroke="rgba(0,0,0,0.07)"
              strokeWidth={RING_STROKE}
            />
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              stroke="url(#tracker-ring-gradient)"
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
            />
          </svg>
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums text-foreground">
            {trackerDaysLogged}/{trackerDaysTotal}
          </span>
        </div>
      </div>
    </div>
  );
}
