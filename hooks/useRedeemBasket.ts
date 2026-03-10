"use client";

import { useState, useEffect } from "react";
import type { PoolRedeemBasket, VaultBalances } from "@/lib/types";

/**
 * Given a connected wallet address, the total gUBI supply, and the vault
 * balances, computes the proportional share of WGNET and Archai the user
 * would receive if they burned all their gUBI.
 *
 * Returns null when the wallet is not connected or hasn't been read yet.
 */
export function useRedeemBasket(
  connectedAddress: string | null,
  supply: string,
  vault: VaultBalances | null,
  /** Changing trigger value forces a re-fetch (e.g. poolUpdatedAt). */
  trigger?: number,
): PoolRedeemBasket | null {
  const [basket, setBasket] = useState<PoolRedeemBasket | null>(null);

  useEffect(() => {
    if (!connectedAddress || !vault || !supply || supply === "0") {
      setBasket(null);
      return;
    }

    let cancelled = false;

    const params = new URLSearchParams({
      address: connectedAddress,
      supply,
      wgnet: vault.wgnet,
      archai: vault.archai,
    });

    fetch(`/api/pool/redeem?${params.toString()}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as PoolRedeemBasket | null;
      })
      .then((payload) => {
        if (cancelled) return;
        if (!payload) {
          setBasket(null);
          return;
        }

        setBasket(payload);
      })
      .catch(() => {
        if (!cancelled) setBasket(null);
      });

    return () => {
      cancelled = true;
    };
  }, [connectedAddress, supply, vault, trigger]);

  return basket;
}
