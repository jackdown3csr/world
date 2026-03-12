"use client";

import { useEffect, useMemo, useRef } from "react";
import type { SceneSystemDefinition, SceneSystemId } from "@/lib/sceneSystems";
import {
  buildSnapshot,
  computeMovement,
  loadSnapshot,
  saveIfStale,
  type SystemMovementSummary,
} from "@/lib/rankSnapshot";

/**
 * Tracks rank movement for all active systems.
 *
 * - On first mount (or when systems change), loads previous snapshots
 *   from localStorage and computes diffs against live data.
 * - Saves current snapshots only when 1h+ has elapsed since last save,
 *   so rapid refreshes don't erase the baseline.
 *
 * Returns a Map from systemId to SystemMovementSummary.
 */
export function useRankSnapshots(
  systems: SceneSystemDefinition[],
): Map<SceneSystemId, SystemMovementSummary> {
  const savedRef = useRef<Set<string>>(new Set());

  const summaries = useMemo(() => {
    const map = new Map<SceneSystemId, SystemMovementSummary>();
    for (const system of systems) {
      if (system.entries.length === 0) continue;
      const current = buildSnapshot(system.id, system.data);
      const previous = loadSnapshot(system.id);
      map.set(system.id, computeMovement(current, previous));
    }
    return map;
  }, [systems]);

  // Save snapshots on first encounter (subject to cooldown)
  useEffect(() => {
    for (const system of systems) {
      if (system.entries.length === 0) continue;
      if (savedRef.current.has(system.id)) continue;
      savedRef.current.add(system.id);
      const snapshot = buildSnapshot(system.id, system.data);
      saveIfStale(snapshot);
    }
  }, [systems]);

  return summaries;
}
