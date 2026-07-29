/** Heuristic: touch phone with "Request Desktop Site" (wide layout viewport). */
export function isLikelyRequestedDesktopSite(): boolean {
  if (typeof window === "undefined") return false;
  if (navigator.maxTouchPoints <= 0) return false;

  const viewportW = document.documentElement.clientWidth;
  const screenW = Math.min(window.screen.width, window.screen.height);

  // Phone-sized screen + desktop-wide layout viewport
  if (screenW <= 500 && viewportW >= 900) return true;

  // Viewport much wider than device CSS width (classic desktop-site)
  if (viewportW > 768 && viewportW > screenW * 1.25) return true;

  return false;
}
