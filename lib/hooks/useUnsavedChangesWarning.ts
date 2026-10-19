import { useEffect, useRef } from "react";

/**
 * Warns before leaving a page with unsaved changes. Inactive while `active`
 * is false (form clean) and fully removed on unmount.
 *
 * Two layers:
 *  1. `beforeunload` covers closing the tab, reloading and typing a new URL
 *     (the browser shows its own native prompt).
 *  2. A capture-phase click listener covers in-app navigation. The App
 *     Router has no route-change event to cancel, so we catch the click on
 *     the link before Next's Link handler sees it, stop it, and hand the
 *     target to `onBlockedNavigation` so the page can show its own dialog and
 *     call router.push() if the user chooses to leave.
 *
 * Known limitation (accepted): the browser Back button is not intercepted.
 */
export function useUnsavedChangesWarning(
  active: boolean,
  onBlockedNavigation: (href: string) => void,
): void {
  const callbackRef = useRef(onBlockedNavigation);
  useEffect(() => {
    callbackRef.current = onBlockedNavigation;
  });

  useEffect(() => {
    if (!active) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    function handleClickCapture(event: MouseEvent) {
      // Leave anything the user did on purpose to open elsewhere alone.
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;

      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }

      // External links (and mailto:, tel:) are handled by beforeunload.
      if (url.origin !== window.location.origin) return;
      // Same page: hash-only links and links back to the current URL.
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      callbackRef.current(url.pathname + url.search + url.hash);
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleClickCapture, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleClickCapture, true);
    };
  }, [active]);
}
