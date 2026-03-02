import os

content = r'''/**
 * Solar system layout from wallet data.
 *
 * Classification (by lockedGnet):
 *   >= 10 000  -> gas_giant  (planet)
 *   >= 3 000   -> ice_giant  (planet)
 *   >= 500     -> moon (orbits a host planet)
 *   <  500     -> asteroid belt
 *
 * Size   = log-scaled from votingPower (veGNET)
 * Orbits = greedily spaced so no planet surfaces ever overlap,
 *          order randomised by address hash
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

// veGNET thresholds for body type
const THRESH_GAS_GIANT = 10_000;   // gas giant planet
const THRESH_ICE_GIANT =  3_000;   // ice giant / terrestrial planet
const THRESH_MOON      =    500;   // moon orbiting a planet
// below THRESH_MOON -> asteroid belt

// Planet visual radii (in world units)
const MIN_PLANET_R = 0.22;
const MAX_PLANET_R = 1.90;

// Moon visual radii
const MIN_MOON_R = 0.06;
const MAX_MOON_R = 0.20;

export const SUN_RADIUS = 4.0;

// Innermost orbit clears the sun corona
const FIRST_ORBIT   = SUN_RADIUS * 2.8;  // ~11.2
// Minimum gap between the surface of adjacent planets
const SURFACE_GAP   = 2.8;
// Gap between planet surface and first moon
const MOON_FIRST_GAP = 0.30;
// Gap between successive moon surfaces
const MOON_SURFACE_GAP = 0.20;

// Kepler base speeds
const BASE_PLANET_SPEED = 0.07;   // rad/s at FIRST_ORBIT
const BASE_MOON_SPEED   = 0.50;   // rad/s for innermost moon

const MAX_MOONS_PER_PLANET = 5;

// Asteroid belt
const BELT_GAP   = 6;
const BELT_WIDTH = 8;
const BELT_MIN   = 0.025;
const BELT_MAX   = 0.10;

/* ── Types ───────────────────────────────────────────────── */
export type PlanetType = "rocky" | "terrestrial" | "ice_giant" | "gas_giant";

function classifyPlanet(lockedGnet: number): PlanetType {
  if (lockedGnet >= THRESH_GAS_GIANT) return "gas_giant";
  if (lockedGnet >= THRESH_ICE_GIANT) return "ice_giant";
  return "terrestrial";
}

function weiToFloat(raw: string): number {
  if (!raw || raw === "0") return 0;
  const wei = BigInt(raw);
  const unit = 10n ** BigInt(DECIMALS);
  return Number(wei / unit) + Number(wei % unit) / Number(unit);
}

/* ── Interfaces ─────────────────────────────────────────── */
export interface MoonData {
  wallet:       WalletEntry;
  radius:       number;
  orbitRadius:  number;     // distance from host planet centre
  orbitSpeed:   number;
  initialAngle: number;
  hue:          number;
  seed:         number;
  tilt:         number;     // moon orbital plane tilt relative to planet
}

export interface PlanetData {
  wallet:       WalletEntry;
  radius:       number;
  planetType:   PlanetType;
  orbitRadius:  number;     // distance from sun centre
  orbitSpeed:   number;
  initialAngle: number;
  hue:          number;
  seed:         number;
  tilt:         number;     // orbital plane tilt (radians)
  moons:        MoonData[];
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

  // Sort by lockedGnet descending
  const sorted = [...wallets].sort((a, b) => {
    const d = BigInt(b.lockedGnet) - BigInt(a.lockedGnet);
    return d > 0n ? 1 : d < 0n ? -1 : 0;
  });

  /* ── 1. Classify wallets ─────────────────────────────── */
  const planetWallets:   WalletEntry[] = [];
  const moonCandidates:  WalletEntry[] = [];
  const asteroidWallets: WalletEntry[] = [];

  for (const w of sorted) {
    const g = weiToFloat(w.lockedGnet);
    if      (g >= THRESH_ICE_GIANT) planetWallets.push(w);
    else if (g >= THRESH_MOON)      moonCandidates.push(w);
    else                            asteroidWallets.push(w);
  }

  const N = planetWallets.length;

  /* ── 2. Planet radii from votingPower ────────────────── */
  const vps = planetWallets.map(w => weiToFloat(w.votingPower));
  const vpMax = Math.max(...vps, 1);
  const vpMin = Math.min(...vps.filter(v => v > 0), 0.001);
  const logMax = Math.log10(vpMax);
  const logMin = Math.log10(Math.max(vpMin, 0.001));
  const vpRange = logMax - logMin || 1;

  const planetRadii = vps.map(vp => {
    const t = Math.max(0, Math.min(1,
      (Math.log10(Math.max(vp, 0.001)) - logMin) / vpRange));
    return MIN_PLANET_R + Math.pow(t, 0.55) * (MAX_PLANET_R - MIN_PLANET_R);
  });

  /* ── 3. Shuffle orbit order by hash ─────────────────── */
  // Build a random permutation of planet indices.
  // This decouples orbit position from veGNET size.
  const slotOrder = planetWallets
    .map((w, i) => ({ i, key: fnv1a(w.address, 0xcafe) }))
    .sort((a, b) => a.key - b.key)
    .map(x => x.i);
  // slotOrder[slotIdx] = planetIdx that goes in slot slotIdx

  /* ── 4. Greedy orbit placement — guaranteed no overlap ─ */
  // Process planets in shuffled order, placing each at the next
  // free orbit position so radii never touch.
  const orbitByIdx = new Array<number>(N).fill(0);
  let cursor = FIRST_ORBIT;
  for (const planetIdx of slotOrder) {
    const r = planetRadii[planetIdx];
    cursor += r;                       // move past leading radius
    orbitByIdx[planetIdx] = cursor;
    cursor += r + SURFACE_GAP;         // trailing radius + gap
  }

  /* ── 5. Assign moon candidates to planets ────────────── */
  // Moon VP range (for size scaling)
  const moonVPs = moonCandidates.map(w => weiToFloat(w.votingPower));
  const mvpMax  = Math.max(...moonVPs, 1);
  const mvpMin  = Math.min(...moonVPs.filter(v => v > 0), 0.001);
  const mlogMax = Math.log10(mvpMax);
  const mlogMin = Math.log10(Math.max(mvpMin, 0.001));
  const mvpRange = mlogMax - mlogMin || 1;

  const moonGroups = new Map<number, WalletEntry[]>(
    planetWallets.map((_, i) => [i, []])
  );

  for (const w of moonCandidates) {
    const hostIdx = fnv1a(w.address, 0xbeef) % Math.max(N, 1);
    const group = moonGroups.get(hostIdx)!;
    if (group.length < MAX_MOONS_PER_PLANET) {
      group.push(w);
    } else {
      asteroidWallets.push(w); // overflow to belt
    }
  }

  /* ── 6. Build planet data ────────────────────────────── */
  const planets: PlanetData[] = planetWallets.map((w, i) => {
    const radius      = planetRadii[i];
    const orbitRadius = orbitByIdx[i];
    const orbitSpeed  = BASE_PLANET_SPEED * Math.pow(FIRST_ORBIT / orbitRadius, 1.5);
    const lockedG     = weiToFloat(w.lockedGnet);

    /* Build moons for this planet */
    const moonList = moonGroups.get(i)!;
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
        orbitSpeed:   BASE_MOON_SPEED + frac(mw.address, 55) * 0.35,
        initialAngle: frac(mw.address, 11) * Math.PI * 2,
        hue:          frac(mw.address, 22),
        seed:         frac(mw.address, 33),
        tilt:         (frac(mw.address, 44) - 0.5) * 0.8,
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
      tilt:         (frac(w.address, 77) - 0.5) * 0.30,
      moons,
    };
  });

  /* ── 7. Asteroid belt ────────────────────────────────── */
  const maxOrbit       = N > 0 ? Math.max(...planets.map(p => p.orbitRadius)) : FIRST_ORBIT;
  const beltInnerRadius = maxOrbit + BELT_GAP;
  const beltOuterRadius = beltInnerRadius + BELT_WIDTH;
  const beltMid         = (beltInnerRadius + beltOuterRadius) / 2;

  const asteroids: AsteroidData[] = asteroidWallets.map(w => {
    const h1 = fnv1a(w.address, 0);
    const h2 = fnv1a(w.address, 1337);
    const h3 = fnv1a(w.address, 9999);

    const angle   = (h1 / 0xffffffff) * Math.PI * 2;
    const rOffset = ((h2 / 0xffffffff) - 0.5) * BELT_WIDTH;
    const yOffset = ((h3 / 0xffffffff) - 0.5) * 1.4;
    const r       = beltMid + rOffset;

    const g        = weiToFloat(w.lockedGnet);
    const sizeFrac = Math.min(g / THRESH_MOON, 1);
    const size     = BELT_MIN + sizeFrac * (BELT_MAX - BELT_MIN);

    return {
      wallet:   w,
      position: [Math.cos(angle) * r, yOffset, Math.sin(angle) * r] as [number, number, number],
      size,
      hue:      h2 / 0xffffffff,
    };
  });

  return { planets, asteroids, beltInnerRadius, beltOuterRadius };
}
'''

out = os.path.join(os.path.dirname(__file__), '..', 'lib', 'orbitalUtils.ts')
with open(out, 'w', encoding='utf-8') as f:
    f.write(content)
print(f"Written {len(content)} chars to {os.path.abspath(out)}")
