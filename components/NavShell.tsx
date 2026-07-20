import type { ReactNode } from "react";
import { HistoryIcon, PlanIcon, TrackerIcon } from "@/components/icons";

const navItems = [
  {
    label: "Tracker",
    href: "#",
    icon: <TrackerIcon className="h-5 w-5" />,
  },
  {
    label: "Plan",
    href: "/plan",
    icon: <PlanIcon className="h-5 w-5" />,
  },
  {
    label: "History",
    href: "#",
    icon: <HistoryIcon className="h-5 w-5" />,
  },
] as const;

export default function NavShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1">
      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-background md:flex">
        <div className="border-b border-border px-5 py-6">
          <p className="font-heading text-lg uppercase tracking-wide text-brand-orange">
            KCPT <span className="text-foreground">Portal</span>
          </p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Main">
          {navItems.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-white/5 hover:text-foreground"
            >
              {item.icon}
              {item.label}
            </a>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
        <header className="border-b border-border px-4 py-4 md:hidden">
          <p className="font-heading text-base uppercase tracking-wide text-brand-orange">
            KCPT <span className="text-foreground">Portal</span>
          </p>
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-50 flex border-t border-border bg-background md:hidden"
        aria-label="Main"
      >
        {navItems.map((item) => (
          <a
            key={item.label}
            href={item.href}
            className="flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium text-muted transition-colors hover:text-brand-orange"
          >
            {item.icon}
            {item.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
