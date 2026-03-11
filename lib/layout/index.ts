/**
 * Solar-system layout orchestrator.
 *
 * Ranked by votingPower (descending):
 *   Rank  1–20   → planet  (gas_giant / ice_giant / terrestrial / rocky)
 *   Rank 21–60   → moon    (distributed across planets, max 3 each)
 *   Rank 61–190  → ring    (orbits the #1 planet — "Saturn")
 *   Rank 191+    → asteroid belt
 *
 * Each sub-builder lives in its own file for easy per-category editing.
 */

import type { WalletEntry } from "../types";
import type { SolarSystemData, PlanetData, LayoutMode } from "./types";
import {
  PLANET_COUNT,
  MOON_END_RANK,
  RING_END_RANK,
  FIRST_ORBIT,
  BASE_PLANET_SPEED,
  BELT_GAP,
  BELT_WIDTH,
} from "./constants";
import { weiToFloat, frac, planetTypeByRank } from "./helpers";
import { computePlanetSizing, computeOrbits } from "./planetLayout";
import { distributeMoons, computeMoonVPStats, buildMoonList, buildSaturnMoonList } from "./moonLayout";
import { buildRingParticles } from "./ringLayout";
import { buildAsteroids } from "./asteroidLayout";

export function buildSolarSystem(wallets: WalletEntry[], layoutMode: LayoutMode = "solar"): SolarSystemData {
  if (wallets.length === 0)
    return { planets: [], asteroids: [], beltInnerRadius: 0, beltOuterRadius: 0 };

  /* 1. Sort all wallets by votingPower descending */
  const ranked = [...wallets]
    .map(w => ({ w, vp: weiToFloat(w.votingPower) }))
    .sort((a, b) => b.vp - a.vp);

  /* 2. Slice into tiers */
  const planetEntries = ranked.slice(0, Math.min(PLANET_COUNT, ranked.length));
  const moonEntries   = ranked.slice(PLANET_COUNT, Math.min(MOON_END_RANK, ranked.length));
  const ringEntries   = ranked.slice(MOON_END_RANK, Math.min(RING_END_RANK, ranked.length));
  const beltEntries   = ranked.slice(RING_END_RANK);

  const N = planetEntries.length;

  /* 3. Planet sizing + orbits */
  const { radiusMap, typeMap } = computePlanetSizing(planetEntries);
  const saturnIdx  = 0;   // ring-host is always rank-0 (highest VP) planet
  // Mars = highest-ranked rocky planet (first entry with type "rocky" = rank 14)
  const marsIdx    = planetEntries.findIndex((_, i) => planetTypeByRank(i) === "rocky");
  const orbitByIdx = computeOrbits(planetEntries, radiusMap, typeMap, saturnIdx, layoutMode);

  /* 4. Moon distribution — Saturn gets 6, others by planet type */
  const planetAddresses = planetEntries.map(({ w }) => w.address);
  const { moonGroups, overflowBelt } = distributeMoons(
    moonEntries, N, saturnIdx, typeMap, planetAddresses,
  );
  const moonStats = computeMoonVPStats(moonEntries);

  /* 5. Ring particles (assigned to Saturn = rank-0 planet) */
  const ringParticles = buildRingParticles(ringEntries);

  /* 6. Assemble planets */
  const typeCounters: Record<string, number> = {};
  const planets: PlanetData[] = planetEntries.map(({ w }, i) => {
    const radius      = radiusMap.get(w.address)!;
    const orbitRadius = orbitByIdx[i];
    const orbitSpeed  = BASE_PLANET_SPEED * Math.pow(FIRST_ORBIT / orbitRadius, 1.5);
    const pType       = typeMap.get(w.address)!;
    const isSaturn    = i === saturnIdx;
    const isMarsEntry = i === marsIdx;
    // Don't count Mars toward rocky subRank (it uses its own hero shader)
    const subRank     = isMarsEntry ? 0 : (typeCounters[pType] = (typeCounters[pType] ?? -1) + 1);
    const moons       = isSaturn
      ? buildSaturnMoonList(moonGroups.get(i) ?? [], radius, moonStats)
      : buildMoonList(moonGroups.get(i) ?? [], radius, moonStats);

    return {
      wallet:       w,
      radius,
      planetType:   pType,
      orbitRadius,
      orbitSpeed,
      initialAngle: frac(w.address, 0) * Math.PI * 2,
      hue:          frac(w.address, 42),
      seed:         frac(w.address, 99),
      variant:      frac(w.address, 137),
      subRank,
      // Mars gets a 25.2° tilt (like real Mars); others use address-derived tilt
      tilt:         i === marsIdx ? 0.44 : (frac(w.address, 77) - 0.5) * 0.28,
      moons,
      ringWallets:  i === saturnIdx ? ringParticles : [],
      vpRank:       i + 1,
      isMars:       isMarsEntry,
    };
  });

  /* 7. Asteroid belt */
  const asteroidWallets = [...beltEntries.map(e => e.w), ...overflowBelt]
    .sort((a, b) => weiToFloat(b.votingPower) - weiToFloat(a.votingPower));
  const maxOrbit        = N > 0 ? Math.max(...planets.map(p => p.orbitRadius)) : FIRST_ORBIT;
  const beltInnerRadius = maxOrbit + BELT_GAP;
  const beltOuterRadius = beltInnerRadius + BELT_WIDTH;
  const asteroids       = buildAsteroids(asteroidWallets, beltInnerRadius, beltOuterRadius);

  return { planets, asteroids, beltInnerRadius, beltOuterRadius };
}

/* ── Re-exports for convenience ───────────────────────────── */
export { buildVestingSystem } from "./vestingLayout";
export { buildPoolSystem } from "./poolLayout";
export { buildStakingRemnantSystem } from "./stakingRemnantLayout";
export type {
  PlanetType,
  PlanetData,
  MoonData,
  RingParticleData,
  AsteroidData,
  SolarSystemData,
  LayoutMode,
  VestingLayoutMode,
} from "./types";
export { SUN_RADIUS } from "./constants";
