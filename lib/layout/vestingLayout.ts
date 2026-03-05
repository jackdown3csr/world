/**
 * Layout builder for the vesting / RewardDistributor star system.
 *
 * Composition:
 *   Rank 0–2   (top 3)   → protoplanetary  (large, dramatic accretion disks)
 *   Rank 3–5             → lava_ocean       (mid-tier, molten hemispheres)
 *   Rank 6–9             → molten           (smaller, glowing crack networks)
 *   Rank 10–15           → moons (up to 6, one per planet slots 0–5)
 *   Rank 16+             → asteroid belt for now (Phase 8 → ProtoplanetaryDisk)
 *
 * Uses the shared computePlanetSizing / computeOrbits helpers with a custom
 * type-assignment function so all sizing and orbit spacing logic is shared.
 */

import type { VestingWalletEntry } from "../types";
import type { PlanetType, SolarSystemData } from "./types";
import {
  SIZE_RANGES,
  FIRST_ORBIT,
  SURFACE_GAP,
  BASE_PLANET_SPEED,
  BELT_GAP,
  BELT_WIDTH,
} from "./constants";
import { fnv1a, frac, weiToFloat } from "./helpers";
import {
  distributeMoons,
  computeMoonVPStats,
  buildMoonList,
} from "./moonLayout";
import { buildAsteroids } from "./asteroidLayout";
import type { PlanetData } from "./types";

/* ── Vesting-specific tier constants ─────────────────────── */
const V_PLANET_COUNT  = 10;  // top 10 → planets
const V_MOON_END_RANK = 16;  // ranks 10–15 → moons (up to 6)
// ranks 16+ → asteroid belt

/** Assign a planet type based on 0-based rank within the top-10. */
function vestingPlanetTypeByRank(rank0: number): PlanetType {
  if (rank0 < 3) return "protoplanetary";
  if (rank0 < 6) return "lava_ocean";
  return "molten";
}

/* ── Size assignment ─────────────────────────────────────── */
function computeVestingPlanetSizing(
  planetEntries: { w: VestingWalletEntry; entitled: number }[],
): { radiusMap: Map<string, number>; typeMap: Map<string, PlanetType> } {
  const radiusMap = new Map<string, number>();
  const typeMap   = new Map<string, PlanetType>();

  const byType: Record<PlanetType, { addr: string; idx: number }[]> = {
    gas_giant: [], ice_giant: [], terrestrial: [], rocky: [],
    molten: [], lava_ocean: [], protoplanetary: [],
  };

  planetEntries.forEach(({ w }, i) => {
    const t = vestingPlanetTypeByRank(i);
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

/* ── Orbit assignment ────────────────────────────────────── */
function computeVestingOrbits(
  planetEntries: { w: VestingWalletEntry }[],
  radiusMap: Map<string, number>,
  typeMap:   Map<string, PlanetType>,
): number[] {
  const N = planetEntries.length;
  const TYPE_ORDER: Partial<Record<PlanetType, number>> = {
    protoplanetary: 2, // outer (large)
    lava_ocean:     1, // mid
    molten:         0, // inner (small)
  };

  const entries = planetEntries.map(({ w }, i) => ({
    i,
    type:   typeMap.get(w.address) ?? ("molten" as PlanetType),
    // sub-sort within type by address hash for stable layout
    subKey: fnv1a(w.address, 0xdead) % Math.max(N, 1),
  }));

  const slotOrder = entries
    .sort((a, b) =>
      (TYPE_ORDER[a.type] ?? 0) - (TYPE_ORDER[b.type] ?? 0) ||
      a.subKey - b.subKey,
    )
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

/* ── Main builder ────────────────────────────────────────── */

export function buildVestingSystem(wallets: VestingWalletEntry[]): SolarSystemData {
  if (wallets.length === 0)
    return { planets: [], asteroids: [], beltInnerRadius: 0, beltOuterRadius: 0 };

  /* 1. Sort by totalEntitled descending */
  const ranked = [...wallets]
    .map(w => ({ w, entitled: weiToFloat(w.totalEntitled) }))
    .sort((a, b) => b.entitled - a.entitled);

  /* 2. Slice into tiers */
  const planetEntries = ranked.slice(0, Math.min(V_PLANET_COUNT, ranked.length));
  const moonEntries   = ranked.slice(V_PLANET_COUNT, Math.min(V_MOON_END_RANK, ranked.length));
  const beltEntries   = ranked.slice(V_MOON_END_RANK);

  const N = planetEntries.length;

  /* 3. Sizing + orbits */
  const { radiusMap, typeMap } = computeVestingPlanetSizing(planetEntries);
  const orbitByIdx = computeVestingOrbits(planetEntries, radiusMap, typeMap);

  /* 4. Moons — max 6 total, biased toward volcanic (molten/lava_ocean) planets */
  const { moonGroups, overflowBelt } = distributeMoons(moonEntries.map(e => ({ w: e.w })), N);
  const moonStats = computeMoonVPStats(moonEntries.map(e => ({ w: e.w })));

  /* 5. Assemble planets (no Saturn ring in vesting system) */
  const planets: PlanetData[] = planetEntries.map(({ w }, i) => {
    const radius      = radiusMap.get(w.address)!;
    const orbitRadius = orbitByIdx[i];
    const orbitSpeed  = BASE_PLANET_SPEED * Math.pow(FIRST_ORBIT / orbitRadius, 1.5);
    const pType       = typeMap.get(w.address)!;
    const moons       = buildMoonList(moonGroups.get(i) ?? [], radius, moonStats);

    return {
      wallet:       w,
      radius,
      planetType:   pType,
      orbitRadius,
      orbitSpeed,
      initialAngle: frac(w.address, 1) * Math.PI * 2,
      hue:          frac(w.address, 43),
      seed:         frac(w.address, 100),
      tilt:         (frac(w.address, 78) - 0.5) * 0.40,
      moons,
      ringWallets:  [],   // no ring system in vesting
      vpRank:       i + 1,
    };
  });

  /* 6. Asteroid belt (Phase 8 will replace with ProtoplanetaryDisk) */
  const asteroidWallets = [
    ...beltEntries.map(e => e.w),
    ...overflowBelt,
  ];
  const maxOrbit        = N > 0 ? Math.max(...planets.map(p => p.orbitRadius)) : FIRST_ORBIT;
  const beltInnerRadius = maxOrbit + BELT_GAP;
  const beltOuterRadius = beltInnerRadius + BELT_WIDTH;
  const asteroids       = buildAsteroids(asteroidWallets, beltInnerRadius, beltOuterRadius);

  return { planets, asteroids, beltInnerRadius, beltOuterRadius };
}
