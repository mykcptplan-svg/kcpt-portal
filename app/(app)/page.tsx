import QuickAccessCard from "@/components/dashboard/QuickAccessCard";
import { HistoryIcon, PlanIcon, TrackerIcon } from "@/components/icons";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col gap-8 px-6 py-10 md:px-10">
      <div>
        <h1 className="font-heading text-2xl uppercase tracking-wide text-foreground">
          Welcome to KCPT Portal
        </h1>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted">
          Jump into your weekly plan, or check back soon for tracker and
          history.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <QuickAccessCard
          title="Weekly Base Plan"
          description="Plan breakfasts, lunches, snacks, and desserts for the week."
          icon={<PlanIcon className="h-6 w-6" />}
          href="/plan"
        />
        <QuickAccessCard
          title="Weekly Tracker"
          description="Track non-negotiables and daily habit checkmarks."
          icon={<TrackerIcon className="h-6 w-6" />}
          comingSoon
        />
        <QuickAccessCard
          title="History"
          description="Review past weeks, measurements, and progress."
          icon={<HistoryIcon className="h-6 w-6" />}
          comingSoon
        />
      </div>
    </div>
  );
}
