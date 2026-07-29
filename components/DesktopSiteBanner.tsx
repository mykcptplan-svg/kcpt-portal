"use client";

import { useEffect, useState } from "react";
import { isLikelyRequestedDesktopSite } from "@/lib/desktopSite";

const DISMISS_KEY = "kcpt-desktop-site-banner-dismissed";

export default function DesktopSiteBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      // sessionStorage may be unavailable
    }

    function check() {
      setVisible(isLikelyRequestedDesktopSite());
    }

    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);

  function handleDismiss() {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="relative z-10 mb-2 flex items-start gap-3 rounded-lg border px-4 py-3 text-[14px] leading-snug"
      style={{
        background: "var(--tip-bg)",
        borderColor: "var(--brand-orange-dark)",
        color: "var(--brand-orange-dark)",
      }}
      role="status"
    >
      <p className="min-w-0 flex-1">
        You&apos;re viewing the desktop version. For the best experience, turn
        off &quot;Desktop site&quot; in your browser menu.
      </p>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={handleDismiss}
        className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-[16px] font-bold leading-none transition-opacity hover:opacity-70"
      >
        ×
      </button>
    </div>
  );
}
