"use client";

import { useMemo, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BellIcon,
  ChartIcon,
  HomeIcon,
  MoreIcon,
  PlanIcon,
  ProfileIcon,
  TrackerIcon,
  UsersIcon,
} from "@/components/icons";
import { useProfile } from "@/lib/context/ProfileContext";

type NavItem = {
  label: string;
  href: string;
  icon: ReactNode;
};

const baseNavItems: NavItem[] = [
  {
    label: "Home",
    href: "/",
    icon: <HomeIcon className="h-5 w-5" />,
  },
  {
    label: "My Food Plan",
    href: "/plan",
    icon: <PlanIcon className="h-5 w-5" />,
  },
  {
    label: "My Success Tracker",
    href: "/tracker",
    icon: <TrackerIcon className="h-5 w-5" />,
  },
  {
    label: "My Profile",
    href: "/profile",
    icon: <ProfileIcon className="h-5 w-5" />,
  },
];

const coachReviewItem: NavItem = {
  label: "Coach Review",
  href: "/coach-review",
  icon: <ChartIcon className="h-5 w-5" />,
};

const adminPanelItem: NavItem = {
  label: "Admin Panel",
  href: "/admin",
  icon: <UsersIcon className="h-5 w-5" />,
};

export default function NavShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { profile, loading } = useProfile();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const extraNavItems = useMemo(() => {
    if (loading) return [];

    const role = profile?.role ?? "member";
    const extras: NavItem[] = [];

    if (role === "coach" || role === "admin") {
      extras.push(coachReviewItem);
    }
    if (role === "admin") {
      extras.push(adminPanelItem);
    }

    return extras;
  }, [loading, profile?.role]);

  const navItems = useMemo(
    () => [...baseNavItems, ...extraNavItems],
    [extraNavItems],
  );

  const moreActive =
    pathname.startsWith("/coach-review") || pathname.startsWith("/admin");

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

      {/* Mobile More sheet */}
      {moreOpen && extraNavItems.length > 0 && (
        <>
          <button
            type="button"
            aria-label="Close more menu"
            className="fixed inset-0 z-40 md:hidden"
            onClick={() => setMoreOpen(false)}
          />
          <div className="fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 md:hidden">
            <div className="w-full max-w-[420px] rounded-[20px] border border-border bg-card p-2 shadow-[0_20px_40px_-16px_rgba(17,17,17,0.22)]">
              {extraNavItems.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={`flex items-center gap-3 rounded-[14px] px-3.5 py-3 text-sm font-medium transition-colors ${
                      active
                        ? "bg-brand-orange/10 text-brand-orange-dark"
                        : "text-foreground hover:bg-brand-orange/10 hover:text-brand-orange-dark"
                    }`}
                  >
                    {item.icon}
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Mobile floating bottom nav */}
      <nav
        className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4 md:hidden"
        aria-label="Main"
      >
        <div className="flex w-full max-w-[420px] gap-1 rounded-[20px] border border-border bg-white/92 p-2 shadow-[0_20px_40px_-16px_rgba(17,17,17,0.22)] backdrop-blur-md">
          {baseNavItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className={`flex flex-1 flex-col items-center gap-1 rounded-[14px] py-2 px-0.5 transition-colors ${
                  active
                    ? "text-brand-orange-dark"
                    : "text-muted/70 hover:text-brand-orange-dark"
                }`}
              >
                {item.icon}
                <span className="text-center text-[9.5px] font-semibold leading-tight whitespace-normal">
                  {item.label}
                </span>
              </Link>
            );
          })}
          {extraNavItems.length > 0 && (
            <button
              type="button"
              aria-expanded={moreOpen}
              aria-label="More"
              onClick={() => setMoreOpen((open) => !open)}
              className={`flex flex-1 flex-col items-center gap-1 rounded-[14px] py-2 px-0.5 transition-colors ${
                moreActive || moreOpen
                  ? "text-brand-orange-dark"
                  : "text-muted/70 hover:text-brand-orange-dark"
              }`}
            >
              <MoreIcon className="h-5 w-5" />
              <span className="text-center text-[9.5px] font-semibold leading-tight whitespace-normal">
                More
              </span>
            </button>
          )}
        </div>
      </nav>
    </div>
  );
}
