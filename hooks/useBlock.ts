"use client";

import { useEffect, useRef, useState } from "react";

export interface BlockInfo {
  blockNumber: number;
  blockTimestamp: number; // unix seconds
}

/**
 * Polls /api/block every `intervalMs` ms.
 * Galactica blocks are irregular — every 1-10 min — so default is 30 s.
 * `onNewBlock` fires every time blockNumber increases.
 */
export function useBlock(
  intervalMs = 30_000,
  onNewBlock?: (info: BlockInfo) => void,
): BlockInfo | null {
  const [info, setInfo] = useState<BlockInfo | null>(null);
  const lastBlock = useRef<number>(-1);
  const cbRef     = useRef(onNewBlock);
  cbRef.current   = onNewBlock;

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/block", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data: BlockInfo = await res.json();
        if (cancelled) return;

        setInfo(data);

        if (data.blockNumber > lastBlock.current) {
          lastBlock.current = data.blockNumber;
          cbRef.current?.(data);
        }
      } catch {
        // silent — network blip
      }
    }

    poll();
    const id = setInterval(poll, intervalMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [intervalMs]);

  return info;
}
