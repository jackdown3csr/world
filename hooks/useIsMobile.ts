"use client";

import { useState, useEffect } from "react";

/**
 * Returns true when the viewport width is ≤ breakpoint (default 640px).
 * Starts as false (SSR-safe), then corrects on first paint via useEffect.
 * Re-fires when the window is resized across the breakpoint.
 */
export function useIsMobile(breakpoint = 640): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [breakpoint]);

  return isMobile;
}
