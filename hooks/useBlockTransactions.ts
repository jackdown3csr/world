"use client";

import { useEffect, useRef, useState } from "react";
import { mapEventsToSceneEffects } from "@/lib/blockExplorer/mapEventsToSceneEffects";
import type { AddressSystemMap } from "@/lib/blockExplorer/mapEventsToSceneEffects";
import type { BlockExplorerEvent } from "@/lib/blockExplorer/types";
import type { TransactionFlowEffect } from "@/lib/blockExplorer/types";
import type { BlockExplorerApiResponse } from "@/lib/blockExplorer/types";

const EFFECT_DURATION_MS = 10_000;
const PRUNE_INTERVAL_MS  = 5_000;
const LED_FLASH_MS       = 1_500;
const BACKFILL_BLOCKS    = 3;
const MAX_RECENT_EVENTS  = 8;

export interface BlockTransactionLeds {
  /** Blinks green when any new transactions arrive */
  rxLed: boolean;
  /** Blinks cyan when ecosystem transactions arrive */
  ecoLed: boolean;
}

export interface BlockTransactionFeed {
  effects: TransactionFlowEffect[];
  recentEvents: BlockExplorerEvent[];
}

/**
 * Client buffer for live-block transaction effects.
 *
 * - Triggers a fetch against /api/block/txs whenever `blockNumber` changes.
 * - De-duplicates by effect ID across block refreshes.
 * - Prunes expired effects every 5 seconds.
 * - When `enabled` is false, fetching is skipped and effects are cleared.
 *
 * Returns a stable `TransactionFlowEffect[]` suitable for merging into
 * the scene's `sceneEffects` array.
 */
export function useBlockTransactions(
  blockNumber: number | null | undefined,
  enabled: boolean,
  addressSystemMap?: AddressSystemMap,
): BlockTransactionFeed & BlockTransactionLeds {
  const [effects, setEffects] = useState<TransactionFlowEffect[]>([]);
  const [recentEvents, setRecentEvents] = useState<BlockExplorerEvent[]>([]);
  const [rxLed, setRxLed] = useState(false);
  const [ecoLed, setEcoLed] = useState(false);
  const rxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ecoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchedBlocks = useRef<Set<number>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  // Clear on disable
  useEffect(() => {
    if (!enabled) {
      setEffects([]);
      setRecentEvents([]);
      fetchedBlocks.current.clear();
      if (rxTimer.current) clearTimeout(rxTimer.current);
      if (ecoTimer.current) clearTimeout(ecoTimer.current);
      setRxLed(false);
      setEcoLed(false);
    }
  }, [enabled]);

  // Fetch current block plus a short unseen backfill window.
  useEffect(() => {
    if (!enabled || blockNumber == null) return;

    const candidateBlocks: number[] = [];
    const startBlock = Math.max(1, blockNumber - (BACKFILL_BLOCKS - 1));
    for (let bn = startBlock; bn <= blockNumber; bn++) {
      if (!fetchedBlocks.current.has(bn)) {
        candidateBlocks.push(bn);
        fetchedBlocks.current.add(bn);
      }
    }
    if (candidateBlocks.length === 0) return;

    // Cancel any in-flight fetch for a stale block
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      try {
        for (const candidateBlock of candidateBlocks) {
          const res = await fetch(`/api/block/txs?block=${candidateBlock}`, {
            signal: controller.signal,
            cache: "no-store",
          });
          if (!res.ok || controller.signal.aborted) return;

          const data: BlockExplorerApiResponse = await res.json();
          const newEffects = mapEventsToSceneEffects(data.events, EFFECT_DURATION_MS, addressSystemMap);

          setEffects((prev) => {
            const existingIds = new Set(prev.map((e) => e.id));
            const fresh = newEffects.filter((e) => !existingIds.has(e.id));
            if (fresh.length > 0) {
              // Flash RX LED for any activity
              setRxLed(true);
              if (rxTimer.current) clearTimeout(rxTimer.current);
              rxTimer.current = setTimeout(() => setRxLed(false), LED_FLASH_MS);
              // Flash eco LED if any ecosystem effect
              if (fresh.some((e) => e.paletteHint === "ecosystem")) {
                setEcoLed(true);
                if (ecoTimer.current) clearTimeout(ecoTimer.current);
                ecoTimer.current = setTimeout(() => setEcoLed(false), LED_FLASH_MS);
              }
            }
            return [...prev, ...fresh];
          });

          setRecentEvents((prev) => {
            const seen = new Set(prev.map((event) => event.id));
            const freshEvents = data.events.filter((event) => !seen.has(event.id));
            return [...freshEvents.reverse(), ...prev].slice(0, MAX_RECENT_EVENTS);
          });
        }
      } catch (err: unknown) {
        for (const candidateBlock of candidateBlocks) {
          fetchedBlocks.current.delete(candidateBlock);
        }
        if (err instanceof Error && err.name === "AbortError") return;
      }
    })();

    return () => controller.abort();
  }, [addressSystemMap, blockNumber, enabled]);

  // Prune expired effects on an interval
  useEffect(() => {
    if (!enabled) return;

    const id = setInterval(() => {
      const now = Date.now();
      setEffects((prev) => prev.filter((e) => e.expiresAt > now));
    }, PRUNE_INTERVAL_MS);

    return () => clearInterval(id);
  }, [enabled]);

  return { effects, recentEvents, rxLed, ecoLed };
}
