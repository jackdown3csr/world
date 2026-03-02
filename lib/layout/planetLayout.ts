/**
 * Planet sizing, type assignment, and orbit ordering.
 */

import type { WalletEntry } from "../types";
import type { PlanetType } from "./types";
import { SIZE_RANGES, FIRST_ORBIT, SURFACE_GAP } from "./constants";
import { fnv1a, planetTypeByRank } from "./helpers";

interface RankedEntry { w: WalletEntry; vp: number }

/**
 * Compute each planet's radius and sub-type from rank.
 * Returns maps keyed by wallet address.
 */
export function computePlanetSizing(planetEntries: RankedEntry[]): {
  radiusMap: Map<string, number>;
  typeMap:   Map<string, PlanetType>;
} {
  const radiusMap = new Map<string, number>();
  const typeMap   = new Map<string, PlanetType>();

  const byType: Record<PlanetType, { addr: string; idx: number }[]> = {
    gas_giant: [], ice_giant: [], terrestrial: [], rocky: [],
  };

  planetEntries.forEach(({ w }, i) => {
    const t = planetTypeByRank(i);
    typeMap.set(w.address, t);
    byType[t].push({ addr: w.address, idx: byType[t].length });
  });

  for (const type of Object.keys(byType) as PlanetType[]) {
    const bucket = byType[type];
    const [rMin, rMax] = SIZE_RANGES[type];
    const count = bucket.length;
    bucket.forEach(({ addr }, idx) => {
      const t = count === 1 ? 1.0 : 1.0 - idx / (count - 1);
      const r = rMin + Math.pow(t, 0.65) * (rMax - rMin);
      radiusMap.set(addr, r);
    });
  }

  return { radiusMap, typeMap };
}

/**
 * Compute orbit positions — grouped by type so the layout resembles
 * the real solar system: rocky (inner) → terrestrial → ice_giant →
 * gas_giant (outer).  Within each type group wallets are sub-sorted
 * by their persistent orbitSlot (or hash fallback).
 */
export function computeOrbits(
  planetEntries: RankedEntry[],
  radiusMap: Map<string, number>,
  typeMap:   Map<string, PlanetType>,
): number[] {
  const N = planetEntries.length;

  // Type → orbit-band priority (lower = closer to sun)
  const TYPE_ORDER: Record<PlanetType, number> = {
    rocky: 0, terrestrial: 1, ice_giant: 2, gas_giant: 3,
  };

  // Build entries with type + sub-key for intra-group ordering
  const entries = planetEntries.map(({ w }, i) => ({
    i,
    type:   typeMap.get(w.address) ?? ("rocky" as PlanetType),
    subKey: w.orbitSlot != null ? w.orbitSlot : fnv1a(w.address, 0xcafe) % N,
  }));

  // Sort: first by type band, then by sub-key within band
  const slotOrder = entries
    .sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.subKey - b.subKey)
    .map(x => x.i);

  const orbitByIdx = new Array<number>(N).fill(0);
  let cursor = FIRST_ORBIT;
  for (const planetIdx of slotOrder) {
    const r = radiusMap.get(planetEntries[planetIdx].w.address)!;
    cursor += r;
    orbitByIdx[planetIdx] = cursor;
    cursor += r + SURFACE_GAP;
  }

  return orbitByIdx;
}
