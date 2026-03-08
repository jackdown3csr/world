import React from "react";

export type PanelSwapState = "stable" | "fading-out" | "fading-in";

interface UsePanelSwapOptions<T> {
  item: T | null;
  itemKey: string | null;
  enabled: boolean;
  durationMs: number;
}

export function usePanelSwap<T>({
  item,
  itemKey,
  enabled,
  durationMs,
}: UsePanelSwapOptions<T>) {
  const [displayItem, setDisplayItem] = React.useState<T | null>(item);
  const [displayKey, setDisplayKey] = React.useState<string | null>(itemKey);
  const [animationState, setAnimationState] = React.useState<PanelSwapState>("stable");

  React.useEffect(() => {
    setDisplayItem((current) => current ?? item);
    setDisplayKey((current) => current ?? itemKey);
  }, [item, itemKey]);

  React.useEffect(() => {
    if (!enabled) {
      setDisplayItem(item);
      setDisplayKey(itemKey);
      setAnimationState("stable");
      return;
    }

    if (!displayItem || !item || displayKey === itemKey) {
      setDisplayItem(item);
      setDisplayKey(itemKey);
      setAnimationState("stable");
      return;
    }

    setAnimationState("fading-out");
    let settleTimer: number | undefined;
    const swapTimer = window.setTimeout(() => {
      setDisplayItem(item);
      setDisplayKey(itemKey);
      setAnimationState("fading-in");

      settleTimer = window.setTimeout(() => {
        setAnimationState("stable");
      }, durationMs);
    }, durationMs);

    return () => {
      window.clearTimeout(swapTimer);
      if (settleTimer !== undefined) {
        window.clearTimeout(settleTimer);
      }
    };
  }, [displayItem, displayKey, durationMs, enabled, item, itemKey]);

  return { displayItem, animationState };
}
