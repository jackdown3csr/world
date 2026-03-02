"""Writes the new lib/orbitalUtils.ts with type-based sizing and 4 planet tiers."""
import pathlib

CODE = r'''/**
 * Solar system layout — wallet data → bodies.
 *
 * Distribution (261 wallets):
 *   >= 10 000 GNET  → gas_giant   (31 wallets)  radius 2.2–5.0
 *   >= 3  000 GNET  → ice_giant   (30 wallets)  radius 1.3–2.3
 *   >= 1  000 GNET  → terrestrial (37 wallets)  radius 0.65–1.4
 *   >=   500 GNET   → rocky       (31 wallets)  radius 0.32–0.70
 *   >=   100 GNET   → moon (orbits a host planet)
 *   <    100 GNET   → asteroid belt
 *
 * Orbit order : random by address hash  (decoupled from size)
 * Speed       : Kepler ω ∝ r^{-1.5}    (inner = much faster)
 * Size        : type-based range, position within range by voting-power rank
 */

import type { WalletEntry } from "./types";

/* ── FNV-1a 32-bit hash ─────────────────────────────────── */
function fnv1a(input: string, seed = 0): number {
  let hash = 2166136261 ^ seed;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
const frac = (addr: string, seed: number) => fnv1a(addr, seed) / 0xffffffff;

/* ── Constants ───────────────────────────────────────────── */
const DECIMALS = 18;

// Classification thresholds (lockedGnet in GNET, not wei)
const THRESH_GAS_GIANT   = 10_000;  // gas_giant planet
const THRESH_ICE_GIANT   =  3_000;  // ice_giant planet
const THRESH_TERRESTRIAL =  1_000;  // terrestrial planet
const THRESH_ROCKY       =    500;  // rocky planet   <- lowest planet tier
const THRESH_MOON        =    100;  // moon; orbits a host planet
// below THRESH_MOON -> asteroid belt

// Size ranges per planet type [min, max] in world units
// These create clear visual tier separation (gas giant ~10x a rocky world)
const SIZE_RANGES = {
  gas_giant:   [2.4, 5.2] as [number, number],
  ice_giant:   [1.4, 2.4] as [number, number],
  terrestrial: [0.70, 1.45] as [number, number],
  rocky:       [0.34, 0.72] as [number, number],
};

// Moon size range
const MIN_MOON_R = 0.16;
const MAX_MOON_R = 0.52;

// Sun radius — prominent anchor of the scene
export const SUN_RADIUS = 10.0;

// Innermost planet orbit clears the sun corona comfortably
const FIRST_ORBIT = SUN_RADIUS * 3.0;   // 30 world units
// Minimum gap between planet *surfaces*
const SURFACE_GAP = 6.5;
// Moon orbit gaps from planet surface
const MOON_FIRST_GAP  = 0.55;
const MOON_SURFACE_GAP = 0.42;

// Kepler: ω(r) = BASE_SPEED * (FIRST_ORBIT / r)^1.5
// At FIRST_ORBIT a planet orbits in ~2π/BASE_SPEED ≈ 25 s (very visible)
const BASE_PLANET_SPEED = 0.25;
// Moon base speed (faster, orbits planet not sun)
const BASE_MOON_SPEED   = 1.20;

const MAX_MOONS_PER_PLANET = 5;

// Asteroid belt placed after outermost planet
const BELT_GAP   = 18;
const BELT_WIDTH = 22;
const BELT_MIN   = 0.04;
const BELT_MAX   = 0.16;

/* ── Types ───────────────────────────────────────────────── */
export type PlanetType = "rocky" | "terrestrial" | "ice_giant" | "gas_giant";

function classifyPlanet(lockedGnet: number): PlanetType {
  if (lockedGnet >= THRESH_GAS_GIANT)   return "gas_giant";
  if (lockedGnet >= THRESH_ICE_GIANT)   return "ice_giant";
  if (lockedGnet >= THRESH_TERRESTRIAL) return "terrestrial";
  return "rocky";
}

function weiToFloat(raw: string): number {
  if (!raw || raw === "0") return 0;
  const wei  = BigInt(raw);
  const unit = 10n ** BigInt(DECIMALS);
  return Number(wei / unit) + Number(wei % unit) / Number(unit);
}

/* ── Interfaces ─────────────────────────────────────────── */
export interface MoonData {
  wallet:       WalletEntry;
  radius:       number;
  orbitRadius:  number;     // from host planet centre
  orbitSpeed:   number;
  initialAngle: number;
  hue:          number;
  seed:         number;
  tilt:         number;     // moon orbital plane tilt relative to host
}

export interface PlanetData {
  wallet:       WalletEntry;
  radius:       number;
  planetType:   PlanetType;
  orbitRadius:  number;     // from sun centre
  orbitSpeed:   number;
  initialAngle: number;
  hue:          number;
  seed:         number;
  tilt:         number;     // orbital plane tilt (radians)
  moons:        MoonData[];
  hasRings:     boolean;    // Saturn-style ring disc
}

export interface AsteroidData {
  wallet:   WalletEntry;
  position: [number, number, number];
  size:     number;
  hue:      number;
}

export interface SolarSystemData {
  planets:         PlanetData[];
  asteroids:       AsteroidData[];
  beltInnerRadius: number;
  beltOuterRadius: number;
}

/* ── Main builder ────────────────────────────────────────── */
export function buildSolarSystem(wallets: WalletEntry[]): SolarSystemData {
  if (wallets.length === 0)
    return { planets: [], asteroids: [], beltInnerRadius: 0, beltOuterRadius: 0 };

  /* ── 1. Classify wallets ─────────────────────────────── */
  const planetWallets:  WalletEntry[] = [];
  const moonCandidates: WalletEntry[] = [];
  const beltWallets:    WalletEntry[] = [];

  for (const w of wallets) {
    const g = weiToFloat(w.lockedGnet);
    if      (g >= THRESH_ROCKY)  planetWallets.push(w);
    else if (g >= THRESH_MOON)   moonCandidates.push(w);
    else                          beltWallets.push(w);
  }

  const N = planetWallets.length;

  /* ── 2. Bucket planets by type, size by VP rank within type ─ */
  // Group by type
  const byType: Record<PlanetType, { w: WalletEntry; vp: number }[]> = {
    gas_giant: [], ice_giant: [], terrestrial: [], rocky: [],
  };
  for (const w of planetWallets) {
    const g = weiToFloat(w.lockedGnet);
    const t = classifyPlanet(g);
    byType[t].push({ w, vp: weiToFloat(w.votingPower) });
  }

  // Sort each bucket by VP descending so rank[0] = largest
  for (const t of Object.keys(byType) as PlanetType[]) {
    byType[t].sort((a, b) => b.vp - a.vp);
  }

  // Build radius map: address → radius
  const radiusMap = new Map<string, number>();
  for (const type of Object.keys(byType) as PlanetType[]) {
    const bucket = byType[type];
    const [rMin, rMax] = SIZE_RANGES[type];
    const count = bucket.length;
    bucket.forEach(({ w }, idx) => {
      // rank from 0 (largest) to count-1 (smallest)
      const t = count === 1 ? 1.0 : 1.0 - idx / (count - 1);
      // Mild curve so the biggest really stands out
      const r = rMin + Math.pow(t, 0.65) * (rMax - rMin);
      radiusMap.set(w.address, r);
    });
  }

  /* ── 3. Shuffle orbit order by hash ─────────────────── */
  const slotOrder = planetWallets
    .map((w, i) => ({ i, key: fnv1a(w.address, 0xcafe) }))
    .sort((a, b) => a.key - b.key)
    .map(x => x.i);

  /* ── 4. Greedy orbit placement ──────────────────────── */
  const orbitByIdx = new Array<number>(N).fill(0);
  let cursor = FIRST_ORBIT;
  for (const planetIdx of slotOrder) {
    const r = radiusMap.get(planetWallets[planetIdx].address)!;
    cursor += r;
    orbitByIdx[planetIdx] = cursor;
    cursor += r + SURFACE_GAP;
  }

  /* ── 5. Assign moon candidates to planets ────────────── */
  const moonVPs  = moonCandidates.map(w => weiToFloat(w.votingPower));
  const mvpMax   = Math.max(...moonVPs, 1);
  const mvpMin   = Math.min(...moonVPs.filter(v => v > 0), 0.001);
  const mlogMax  = Math.log10(mvpMax);
  const mlogMin  = Math.log10(Math.max(mvpMin, 0.001));
  const mvpRange = mlogMax - mlogMin || 1;

  const moonGroups = new Map<number, WalletEntry[]>(
    planetWallets.map((_, i) => [i, []])
  );
  const overflowBelt: WalletEntry[] = [];

  for (const w of moonCandidates) {
    const hostIdx = fnv1a(w.address, 0xbeef) % Math.max(N, 1);
    const grp = moonGroups.get(hostIdx)!;
    if (grp.length < MAX_MOONS_PER_PLANET) grp.push(w);
    else overflowBelt.push(w);
  }
  const asteroidWallets = [...beltWallets, ...overflowBelt];

  /* ── 6. Build planet data ────────────────────────────── */
  const planets: PlanetData[] = planetWallets.map((w, i) => {
    const radius      = radiusMap.get(w.address)!;
    const orbitRadius = orbitByIdx[i];
    const orbitSpeed  = BASE_PLANET_SPEED * Math.pow(FIRST_ORBIT / orbitRadius, 1.5);
    const lockedG     = weiToFloat(w.lockedGnet);
    const hasRings    = lockedG >= THRESH_GAS_GIANT && frac(w.address, 13) > 0.38;

    const moonList  = moonGroups.get(i)!;
    let moonCursor  = radius + MOON_FIRST_GAP;

    const moons: MoonData[] = moonList.map(mw => {
      const mvp = weiToFloat(mw.votingPower);
      const mt  = Math.max(0, Math.min(1,
        (Math.log10(Math.max(mvp, 0.001)) - mlogMin) / mvpRange));
      const mr  = MIN_MOON_R + Math.pow(mt, 0.5) * (MAX_MOON_R - MIN_MOON_R);
      moonCursor += mr;
      const mo   = moonCursor;
      moonCursor += mr + MOON_SURFACE_GAP;
      return {
        wallet:       mw,
        radius:       mr,
        orbitRadius:  mo,
        orbitSpeed:   BASE_MOON_SPEED * Math.pow(0.6, Math.floor(Math.random() * 3)),
        initialAngle: frac(mw.address, 11) * Math.PI * 2,
        hue:          frac(mw.address, 22),
        seed:         frac(mw.address, 33),
        tilt:         (frac(mw.address, 44) - 0.5) * 0.9,
      };
    });

    return {
      wallet:       w,
      radius,
      planetType:   classifyPlanet(lockedG),
      orbitRadius,
      orbitSpeed,
      initialAngle: frac(w.address, 0) * Math.PI * 2,
      hue:          frac(w.address, 42),
      seed:         frac(w.address, 99),
      tilt:         (frac(w.address, 77) - 0.5) * 0.28,
      moons,
      hasRings,
    };
  });

  /* ── 7. Asteroid belt ────────────────────────────────── */
  const maxOrbit        = N > 0 ? Math.max(...planets.map(p => p.orbitRadius)) : FIRST_ORBIT;
  const beltInnerRadius = maxOrbit + BELT_GAP;
  const beltOuterRadius = beltInnerRadius + BELT_WIDTH;
  const beltMid         = (beltInnerRadius + beltOuterRadius) / 2;

  const asteroids: AsteroidData[] = asteroidWallets.map(w => {
    const h1 = fnv1a(w.address, 0);
    const h2 = fnv1a(w.address, 1337);
    const h3 = fnv1a(w.address, 9999);

    const angle   = (h1 / 0xffffffff) * Math.PI * 2;
    const rOffset = ((h2 / 0xffffffff) - 0.5) * BELT_WIDTH;
    const yOffset = ((h3 / 0xffffffff) - 0.5) * 2.0;
    const r       = beltMid + rOffset;

    const g        = weiToFloat(w.lockedGnet);
    const sizeFrac = Math.min(g / THRESH_MOON, 1);
    const size     = BELT_MIN + sizeFrac * (BELT_MAX - BELT_MIN);

    return {
      wallet:   w,
      position: [Math.cos(angle) * r, yOffset, Math.sin(angle) * r] as [number, number, number],
      size,
      hue: h2 / 0xffffffff,
    };
  });

  return { planets, asteroids, beltInnerRadius, beltOuterRadius };
}
'''

out = pathlib.Path(r"c:\Users\honza\Documents\gitclones\world\world\lib\orbitalUtils.ts")
out.write_text(CODE, encoding="utf-8")
print(f"Written {len(CODE)} chars to {out}")
