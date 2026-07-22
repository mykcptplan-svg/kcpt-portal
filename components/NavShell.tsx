"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BellIcon,
  HomeIcon,
  PlanIcon,
  ProfileIcon,
  TrackerIcon,
} from "@/components/icons";

const navItems = [
  {
    label: "Home",
    href: "/",
    icon: <HomeIcon className="h-5 w-5" />,
  },
  {
    label: "Food Plan",
    href: "/plan",
    icon: <PlanIcon className="h-5 w-5" />,
  },
  {
    label: "Tracker",
    href: "/tracker",
    icon: <TrackerIcon className="h-5 w-5" />,
  },
  {
    label: "My Profile",
    href: "/profile",
    icon: <ProfileIcon className="h-5 w-5" />,
  },
] as const;

export default function NavShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="flex min-h-full flex-1 bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="border-b border-border px-5 py-5">
          <Image
            src="/brand/wordmark.png"
            alt="KCPT"
            width={780}
            height={242}
            className="h-12 w-auto"
            priority
          />
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Main">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-brand-orange/10 text-brand-orange-dark"
                    : "text-muted hover:bg-brand-orange/10 hover:text-brand-orange-dark"
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col pb-28 md:pb-0">
        <header className="flex items-center justify-between px-5 py-4 md:hidden">
          <Image
            src="/brand/wordmark.png"
            alt="KCPT"
            width={780}
            height={242}
            className="h-10 w-auto"
            priority
          />
          <button
            type="button"
            aria-label="Notifications"
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted shadow-[0_4px_10px_-4px_rgba(17,17,17,0.12)] transition-colors hover:text-brand-orange-dark"
          >
            <BellIcon className="h-5 w-5" />
          </button>
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
      </div>

      {/* Mobile floating bottom nav */}
      <nav
        className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4 md:hidden"
        aria-label="Main"
      >
        <div className="flex w-full max-w-[420px] gap-1 rounded-[20px] border border-border bg-white/92 p-2 shadow-[0_20px_40px_-16px_rgba(17,17,17,0.22)] backdrop-blur-md">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`flex flex-1 flex-col items-center gap-1 rounded-[14px] py-2 text-[10.5px] font-semibold transition-colors ${
                  active ? "text-brand-orange-dark" : "text-muted/70 hover:text-brand-orange-dark"
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
