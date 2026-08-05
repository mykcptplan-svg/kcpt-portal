"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BellIcon,
  ChartIcon,
  HistoryIcon,
  HomeIcon,
  MoreIcon,
  PlanIcon,
  ProfileIcon,
  RulerIcon,
  TrackerIcon,
  UsersIcon,
  UtensilsIcon,
} from "@/components/icons";
import DesktopSiteBanner from "@/components/DesktopSiteBanner";
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

const measurementsItem: NavItem = {
  label: "Measurements",
  href: "/measurements",
  icon: <RulerIcon className="h-5 w-5" />,
};

const historyItem: NavItem = {
  label: "History",
  href: "/history",
  icon: <HistoryIcon className="h-5 w-5" />,
};

const eveningMealsItem: NavItem = {
  label: "Evening Meals",
  href: "/evening-meals",
  icon: <UtensilsIcon className="h-5 w-5" />,
};

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
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [showComingSoon, setShowComingSoon] = useState(false);
  const bellWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    function sync() {
      const viewport = window.visualViewport;
      if (!viewport) return;
      const open = window.innerHeight - viewport.height > 150;
      setKeyboardOpen(open);
      if (open) setMoreOpen(false);
    }

    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, []);

  useEffect(() => {
    if (!showComingSoon) return;

    const timer = window.setTimeout(() => setShowComingSoon(false), 2000);

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (
        target instanceof Node &&
        bellWrapRef.current &&
        !bellWrapRef.current.contains(target)
      ) {
        setShowComingSoon(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [showComingSoon]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const extraNavItems = useMemo(() => {
    const role = profile?.role ?? "member";
    const extras: NavItem[] = [
      measurementsItem,
      historyItem,
      eveningMealsItem,
    ];

    if (!loading) {
      if (role === "coach" || role === "admin") {
        extras.push(coachReviewItem);
      }
      if (role === "admin") {
        extras.push(adminPanelItem);
      }
    }

    return extras;
  }, [loading, profile?.role]);

  const navItems = useMemo(
    () => [...baseNavItems, ...extraNavItems],
    [extraNavItems],
  );

  const moreActive =
    pathname.startsWith("/measurements") ||
    pathname.startsWith("/history") ||
    pathname.startsWith("/evening-meals") ||
    pathname.startsWith("/coach-review") ||
    pathname.startsWith("/admin");

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
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden pb-28 md:pb-0">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-[140px] -top-[160px] z-0 h-[480px] w-[480px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(251,147,58,0.14) 0%, rgba(236,74,49,0.05) 45%, rgba(250,248,245,0) 72%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-[100px] bottom-[-120px] z-0 h-[360px] w-[360px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(247,162,53,0.1) 0%, rgba(250,248,245,0) 70%)",
          }}
        />
        <header className="relative z-10 flex items-center justify-between px-5 py-4 md:hidden">
          <Image
            src="/brand/wordmark.png"
            alt="KCPT"
            width={780}
            height={242}
            className="h-10 w-auto"
            priority
          />
          <div ref={bellWrapRef} className="relative">
            <button
              type="button"
              aria-label="Notifications"
              aria-expanded={showComingSoon}
              onClick={() => setShowComingSoon(true)}
              className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted shadow-[0_4px_10px_-4px_rgba(17,17,17,0.12)] transition-colors hover:text-brand-orange-dark"
            >
              <BellIcon className="h-5 w-5" />
            </button>
            {showComingSoon && (
              <div
                role="status"
                className="absolute right-0 top-full z-50 mt-2 whitespace-nowrap rounded-[14px] border border-border bg-card px-3 py-2 text-[12px] font-semibold text-muted shadow-[0_4px_10px_-4px_rgba(17,17,17,0.12)]"
              >
                Coming soon
              </div>
            )}
          </div>
        </header>
        <div className="relative z-10 px-5 pt-2 md:px-10">
          <DesktopSiteBanner />
        </div>
        <main className="relative z-10 flex flex-1 flex-col">{children}</main>
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
        className={`fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4 transition-transform md:hidden ${
          keyboardOpen ? "pointer-events-none translate-y-full" : ""
        }`}
        aria-label="Main"
        aria-hidden={keyboardOpen}
      >
        <div className="flex w-full max-w-[420px] gap-1 rounded-[20px] border border-border bg-card/92 p-2 shadow-[0_20px_40px_-16px_rgba(17,17,17,0.22)] backdrop-blur-md">
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
