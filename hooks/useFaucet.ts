"use client";

import { useEffect, useRef, useState } from "react";

export interface FaucetStats {
  totalClaims: number;
  totalDistributed: string; // e.g. "1.58"
  balance: string;          // e.g. "3.4200"
}

/**
 * Polls /api/faucet every `intervalMs` ms (default 5 min — data changes slowly).
 */
export function useFaucet(intervalMs = 300_000): FaucetStats | null {
  const [stats, setStats] = useState<FaucetStats | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/faucet", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data: FaucetStats = await res.json();
        if (!cancelled) setStats(data);
      } catch {
        // ignore
      }
      if (!cancelled) {
        timerRef.current = setTimeout(poll, intervalMs);
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [intervalMs]);

  return stats;
}
