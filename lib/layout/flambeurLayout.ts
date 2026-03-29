// lib/layout/flambeurLayout.ts
// FEATURE: Flambeur Star System

import type { FlambeurEntry } from "../types";
import type { PlanetType, SolarSystemData, PlanetData } from "./types";
import { SUN_RADIUS, BASE_PLANET_SPEED, SIZE_RANGES } from "./constants";
import { frac, weiToFloat } from "./helpers";
import { distributeMoons, computeMoonVPStats, buildMoonList } from "./moonLayout";

/* ── Tier constants ──────────────────────────────────────── */
const F_PLANET_COUNT = 9;
const F_FIRST_ORBIT  = SUN_RADIUS * 3.4;
const F_SURFACE_GAP  = 52.0;
const F_SPEED_MULT   = 1.3;

function flambeurTypeByRank(rank0: number): PlanetType {
  if (rank0 < 2) return "gas_giant";
  if (rank0 < 4) return "ice_giant";
  if (rank0 < 7) return "terrestrial";
  return "rocky";
}

/* ── Sizing ──────────────────────────────────────────────── */
function computeFlambeurSizing(
  entries: FlambeurEntry[],
): { radiusMap: Map<string, number>; typeMap: Map<string, PlanetType> } {
  const radiusMap = new Map<string, number>();
  const typeMap   = new Map<string, PlanetType>();

  const byType: Record<PlanetType, string[]> = {
    gas_giant: [], ice_giant: [], terrestrial: [], rocky: [],
    molten: [], lava_ocean: [], protoplanetary: [],
  };

  entries.forEach((w, i) => {
    const t = flambeurTypeByRank(i);
    typeMap.set(w.address, t);
    byType[t].push(w.address);
  });

  for (const type of Object.keys(byType) as PlanetType[]) {
    const bucket       = byType[type];
    const [rMin, rMax] = SIZE_RANGES[type];
    const count        = bucket.length;
    bucket.forEach((addr, idx) => {
      const t = count === 1 ? 1.0 : 1.0 - idx / (count - 1);
      radiusMap.set(addr, rMin + Math.pow(t, 0.65) * (rMax - rMin));
    });
  }

  return { radiusMap, typeMap };
}

/* ── Orbit placement — solar-style band ordering ─────────── */
const TYPE_ORDER: Record<PlanetType, number> = {
  rocky: 0, terrestrial: 1, ice_giant: 2, gas_giant: 3,
  molten: 4, lava_ocean: 5, protoplanetary: 6,
};

function computeFlambeurOrbits(
  entries: FlambeurEntry[],
  radiusMap: Map<string, number>,
  typeMap: Map<string, PlanetType>,
): number[] {
  const N         = entries.length;
  const slotOrder = entries
    .map((w, i) => ({
      i,
      type:   typeMap.get(w.address) ?? ("rocky" as PlanetType),
      subKey: frac(w.address, 0xcafe) * N,
    }))
    .sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.subKey - b.subKey)
    .map(x => x.i);

  const orbitByIdx = new Array<number>(N).fill(0);
  let cursor = F_FIRST_ORBIT;
  for (const idx of slotOrder) {
    const r         = radiusMap.get(entries[idx].address)!;
    cursor         += r;
    orbitByIdx[idx] = cursor;
    cursor         += r + F_SURFACE_GAP;
  }

  return orbitByIdx;
}

/* ── Main builder ────────────────────────────────────────── */
export function buildFlambeurSystem(wallets: FlambeurEntry[]): SolarSystemData {
  if (wallets.length === 0)
    return { planets: [], asteroids: [], beltInnerRadius: 0, beltOuterRadius: 0 };

  const ranked = [...wallets].sort(
    (a, b) => weiToFloat(b.totalGubiSwapped) - weiToFloat(a.totalGubiSwapped),
  );

  const planetEntries = ranked.slice(0, Math.min(F_PLANET_COUNT, ranked.length));
  const moonEntries   = ranked.slice(F_PLANET_COUNT);
  const N             = planetEntries.length;

  const { radiusMap, typeMap } = computeFlambeurSizing(planetEntries);
  const orbitByIdx             = computeFlambeurOrbits(planetEntries, radiusMap, typeMap);

  const planetAddresses = planetEntries.map(w => w.address);
  const { moonGroups }  = distributeMoons(
    moonEntries.map(w => ({ w })),
    N,
    -1,
    typeMap,
    planetAddresses,
  );
  const moonStats = computeMoonVPStats(moonEntries.map(w => ({ w })));

  const typeCounters: Record<string, number> = {};
  const planets: PlanetData[] = planetEntries.map((w, i) => {
    const radius      = radiusMap.get(w.address)!;
    const orbitRadius = orbitByIdx[i];
    const orbitSpeed  = BASE_PLANET_SPEED * F_SPEED_MULT * Math.pow(F_FIRST_ORBIT / orbitRadius, 1.5);
    const pType       = typeMap.get(w.address)!;
    const subRank     = (typeCounters[pType] = (typeCounters[pType] ?? -1) + 1);
    const moons       = buildMoonList(moonGroups.get(i) ?? [], radius, moonStats);

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
      tilt:         (frac(w.address, 77) - 0.5) * 0.28,
      moons,
      ringWallets:  [],
      vpRank:       i + 1,
    };
  });

  return { planets, asteroids: [], beltInnerRadius: 0, beltOuterRadius: 0 };
}
