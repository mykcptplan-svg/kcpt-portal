"use client";

import { useEffect, useState } from "react";
import { DownloadIcon } from "@/components/icons";
import PillarInfoButton from "@/components/tracker/PillarInfoButton";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

const cardClassName =
  "rounded-[20px] border border-border bg-card p-4 shadow-[0_12px_26px_-18px_rgba(17,17,17,0.16)]";

const installInfoContent = (
  <div className="space-y-2">
    <p>
      <span className="font-bold">iOS:</span> Tap Share → scroll / “View More” →
      Add to Home Screen
    </p>
    <p>
      <span className="font-bold">Android (Chrome):</span> Tap the three-dot menu
      → Install app (or “Add to Home Screen”) → Install → done
    </p>
  </div>
);

function InstallAppHeader() {
  return (
    <>
      <div className="mb-3 flex items-center gap-1.5">
        <h2 className="font-heading text-base uppercase tracking-wide text-foreground">
          Install App
        </h2>
        <PillarInfoButton
          label="Install App"
          popoverClassName="w-[260px]"
          text={installInfoContent}
        />
      </div>
      <p className="mb-3 text-sm font-medium text-muted">
        For the full experience, add the app to your Home Screen.
      </p>
    </>
  );
}

export default function InstallAppCard() {
  const [standalone, setStandalone] = useState(false);
  const [ios, setIos] = useState(false);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    setStandalone(isStandaloneDisplay());
    setIos(isIosDevice());

    const media = window.matchMedia("(display-mode: standalone)");
    function handleDisplayModeChange() {
      setStandalone(isStandaloneDisplay());
    }
    media.addEventListener("change", handleDisplayModeChange);

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      media.removeEventListener("change", handleDisplayModeChange);
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
    };
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } finally {
      setDeferredPrompt(null);
      setInstalling(false);
      setStandalone(isStandaloneDisplay());
    }
  }

  if (standalone) return null;

  if (ios) {
    return (
      <div className={cardClassName}>
        <InstallAppHeader />
        <p className="text-sm font-medium leading-relaxed text-muted">
          Tap the Share button, then{" "}
          <span className="font-bold text-foreground">Add to Home Screen</span>.
        </p>
      </div>
    );
  }

  if (!deferredPrompt) return null;

  return (
    <div className={cardClassName}>
      <InstallAppHeader />
      <button
        type="button"
        onClick={handleInstall}
        disabled={installing}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[14px] bg-brand-gradient p-[13px] text-center transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
      >
        <DownloadIcon className="h-4 w-4 text-white" />
        <span className="font-heading text-sm uppercase tracking-wide text-white">
          {installing ? "Installing…" : "Install App"}
        </span>
      </button>
    </div>
  );
}
