import * as React from "react";

export type OverlayPhase = "hidden" | "entering" | "visible" | "leaving";

interface UseOverlayStateOptions {
  /** Unique key identifying the current target (e.g. systemId, bridgeId). */
  targetId: string | null;
  /** When false, the overlay stays hidden regardless of targetId. */
  enabled: boolean;
  /** Duration of the enter/leave CSS transition in ms. */
  fadeMs: number;
  /** How long the overlay stays visible before auto-hiding (ms). */
  autoHideMs?: number;
}

interface OverlayState {
  visible: boolean;
  mounted: boolean;
  phase: OverlayPhase;
  /** Mark the current target as dismissed so auto-show won't reopen it. */
  dismiss: () => void;
  /** Immediately hide + unmount and cancel all pending timers. */
  forceHide: () => void;
}

export function useOverlayState({
  targetId,
  enabled,
  fadeMs,
  autoHideMs = 8000,
}: UseOverlayStateOptions): OverlayState {
  const [visible, setVisible] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [phase, setPhase] = React.useState<OverlayPhase>("hidden");

  const dismissedForRef = React.useRef<string | null>(null);
  const lastTargetRef = React.useRef<string | null>(null);
  const hideTimerRef = React.useRef<number | null>(null);
  const unmountTimerRef = React.useRef<number | null>(null);

  // Reset dismissal when target changes so a new selection auto-shows.
  React.useEffect(() => {
    dismissedForRef.current = null;
  }, [targetId]);

  React.useEffect(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (unmountTimerRef.current !== null) {
      window.clearTimeout(unmountTimerRef.current);
      unmountTimerRef.current = null;
    }

    if (!enabled || dismissedForRef.current === targetId) {
      lastTargetRef.current = targetId;
      setVisible(false);
      setMounted(false);
      setPhase("hidden");
      return;
    }

    const isRetargeting = Boolean(
      targetId
      && mounted
      && visible
      && lastTargetRef.current
      && lastTargetRef.current !== targetId,
    );
    lastTargetRef.current = targetId;

    setMounted(true);
    let rafId: number | null = null;
    if (isRetargeting) {
      setPhase("visible");
      setVisible(true);
    } else {
      rafId = window.requestAnimationFrame(() => {
        setPhase("entering");
        setVisible(true);
      });
    }

    const settleVisibleTimer = window.setTimeout(() => {
      setPhase("visible");
    }, isRetargeting ? 0 : fadeMs);

    hideTimerRef.current = window.setTimeout(() => {
      setPhase("leaving");
      setVisible(false);
      hideTimerRef.current = null;
    }, autoHideMs);

    unmountTimerRef.current = window.setTimeout(() => {
      setMounted(false);
      setPhase("hidden");
      unmountTimerRef.current = null;
    }, autoHideMs + fadeMs);

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      window.clearTimeout(settleVisibleTimer);
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      if (unmountTimerRef.current !== null) {
        window.clearTimeout(unmountTimerRef.current);
        unmountTimerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId, enabled, fadeMs, autoHideMs]);

  const dismiss = React.useCallback(() => {
    dismissedForRef.current = targetId;
  }, [targetId]);

  const forceHide = React.useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (unmountTimerRef.current !== null) {
      window.clearTimeout(unmountTimerRef.current);
      unmountTimerRef.current = null;
    }
    setVisible(false);
    setMounted(false);
    setPhase("hidden");
  }, []);

  return { visible, mounted, phase, dismiss, forceHide };
}
