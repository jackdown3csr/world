/**
 * Layout builder for the vesting / RewardDistributor star system.
 *
 * Young, chaotic protoplanetary system — small bodies, wild tilts,
 * tight orbits, mostly debris.
 *
 *   Rank 0–4   (top 5)   → planets (protoplanetary / lava_ocean / molten)
 *   Rank 5–14  (next 10)  → moons (distributed among planets)
 *   Rank 15+              → disk material (asteroids)
 */

import type { VestingWalletEntry } from "../types";
import type { PlanetType, SolarSystemData, VestingLayoutMode } from "./types";
import {
  SUN_RADIUS,
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
// The vesting system is young / undeveloped — very few large bodies,
// the vast majority of material is dust and debris in the protoplanetary disk.
const V_PLANET_COUNT  = 5;   // top 5 → planets
const V_MOON_END_RANK = 15;  // ranks 6–15 → moons (up to 10)
// ranks 16+ → protoplanetary disk material

/** Assign a planet type based on 0-based rank within the top-5. */
function vestingPlanetTypeByRank(rank0: number): PlanetType {
  if (rank0 < 2) return "protoplanetary";
  if (rank0 < 4) return "lava_ocean";
  return "molten";
}

/* ── Size assignment (vesting: everything is small / forming) ─── */

/** Smaller size ranges for the young vesting system. */
const V_SIZE_RANGES: Record<string, [number, number]> = {
  protoplanetary: [2.5, 4.0],   // forming — not yet giant
  lava_ocean:     [2.0, 3.5],   // mid
  molten:         [1.5, 2.8],   // small
};

function computeVestingPlanetSizing(
  planetEntries: { w: VestingWalletEntry; entitled: number }[],
): { radiusMap: Map<string, number>; typeMap: Map<string, PlanetType> } {
  const radiusMap = new Map<string, number>();
  const typeMap   = new Map<string, PlanetType>();

  planetEntries.forEach(({ w }, i) => {
    const t = vestingPlanetTypeByRank(i);
    typeMap.set(w.address, t);
    const [rMin, rMax] = V_SIZE_RANGES[t] ?? [1.5, 3.0];
    // Largest of each type gets rMax, smallest gets rMin
    const f = planetEntries.length === 1 ? 1.0 : 1.0 - i / (planetEntries.length - 1);
    radiusMap.set(w.address, rMin + f * (rMax - rMin));
  });

  return { radiusMap, typeMap };
}

/* ── Orbit assignment (chaotic: no type ordering, tight spacing) ─ */
const V_FIRST_ORBIT  = SUN_RADIUS * 1.8;  // closer to star than veGNET
const V_SURFACE_GAP  = 12.0;              // much tighter spacing

function computeVestingOrbits(
  planetEntries: { w: VestingWalletEntry; entitled: number }[],
  radiusMap: Map<string, number>,
  layoutMode: VestingLayoutMode,
): number[] {
  const N = planetEntries.length;
  const orbitByIdx = new Array<number>(N).fill(0);

  // Rank-based orbit ordering: closest orbit = highest rank
  let slotOrder: number[];
  if (layoutMode === "claimed") {
    const indexed = planetEntries.map(({ w }, i) => ({
      i,
      claimed: weiToFloat(w.totalClaimed),
    }));
    indexed.sort((a, b) => b.claimed - a.claimed);
    slotOrder = indexed.map(({ i }) => i);
  } else {
    // "entitled" — already sorted by entitled desc, use rank order
    slotOrder = planetEntries.map((_, i) => i);
  }

  let cursor = V_FIRST_ORBIT;
  for (const i of slotOrder) {
    const r = radiusMap.get(planetEntries[i].w.address)!;
    cursor += r;
    orbitByIdx[i] = cursor;
    cursor += r + V_SURFACE_GAP;
  }

  return orbitByIdx;
}

/* ── Main builder ────────────────────────────────────────── */

export function buildVestingSystem(
  wallets: VestingWalletEntry[],
  layoutMode: VestingLayoutMode = "entitled",
): SolarSystemData {
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
  const orbitByIdx = computeVestingOrbits(planetEntries, radiusMap, layoutMode);

  /* 4. Moons — up to 10 total, distributed across planets */
  const { moonGroups, overflowBelt } = distributeMoons(moonEntries.map(e => ({ w: e.w })), N);
  const moonStats = computeMoonVPStats(moonEntries.map(e => ({ w: e.w })));

  /* 5. Assemble planets — chaotic young system: wild tilts, fast orbits */
  const V_SPEED_MULT = 2.5;  // faster than mature veGNET system
  const planets: PlanetData[] = planetEntries.map(({ w }, i) => {
    const radius      = radiusMap.get(w.address)!;
    const orbitRadius = orbitByIdx[i];
    const orbitSpeed  = BASE_PLANET_SPEED * V_SPEED_MULT * Math.pow(V_FIRST_ORBIT / orbitRadius, 1.5);
    const pType       = typeMap.get(w.address)!;
    const moons       = buildMoonList(moonGroups.get(i) ?? [], radius, moonStats);

    // Chaotic tilts: ±60° (young system, not yet flattened to ecliptic)
    const tiltBase = (frac(w.address, 78) - 0.5) * 2.0;  // ±1.0 rad ≈ ±57°

    return {
      wallet:       w,
      radius,
      planetType:   pType,
      orbitRadius,
      orbitSpeed,
      initialAngle: frac(w.address, 1) * Math.PI * 2,
      hue:          frac(w.address, 43),
      seed:         frac(w.address, 100),
      tilt:         tiltBase,
      moons,
      ringWallets:  [],   // no ring system in vesting
      vpRank:       i + 1,
    };
  });

  /* 6. Disk material — sized by totalEntitled, not lockedGnet */
  const asteroidWallets = [
    ...beltEntries.map(e => e.w),
    ...overflowBelt,
  ];
  const maxOrbit        = N > 0 ? Math.max(...planets.map(p => p.orbitRadius)) : V_FIRST_ORBIT;
  const beltInnerRadius = maxOrbit + BELT_GAP * 0.5;  // disk starts closer
  const beltOuterRadius = beltInnerRadius + BELT_WIDTH * 1.5;  // wider disk
  const asteroids       = buildAsteroids(
    asteroidWallets, beltInnerRadius, beltOuterRadius,
    w => weiToFloat((w as VestingWalletEntry).totalEntitled),
  );

  return { planets, asteroids, beltInnerRadius, beltOuterRadius };
}
