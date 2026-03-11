/**
 * Moon distribution across planets and individual moon sizing.
 */

import type { WalletEntry } from "../types";
import type { MoonData } from "./types";
import {
  MAX_MOONS_PER_PLANET,
  MOON_FIRST_GAP,
  MOON_SURFACE_GAP,
  BASE_MOON_SPEED,
  MIN_MOON_R,
  MAX_MOON_R,
} from "./constants";
import { fnv1a, frac, weiToFloat } from "./helpers";

/* ── Distribution ─────────────────────────────────────────── */

/**
 * Assign moon wallets to host planets (max 3 each).
 * Overflow (unplaced) moons get pushed into the asteroid belt.
 */
/**
 * Assign moon wallets to host planets.
 * Saturn (saturnIdx) is guaranteed 6 moons for its ring-gap slots.
 * Other planets get a size-based capacity: gas giants 5, ice giants 3,
 * terrestrials 2, rocky/small 1.
 * Overflow (unplaced) moons get pushed into the asteroid belt.
 */

/** Moon capacity per planet type — bigger planets attract more moons. */
const MOON_CAP: Record<string, number> = {
  gas_giant: 5,
  ice_giant: 3,
  terrestrial: 2,
  rocky: 1,
  molten: 1,
  lava_ocean: 2,
  protoplanetary: 2,
};

export function distributeMoons(
  moonEntries: { w: WalletEntry }[],
  planetCount: number,
  saturnIdx = -1,
  typeMap?: Map<string, string>,
  planetAddresses?: string[],
): { moonGroups: Map<number, WalletEntry[]>; overflowBelt: WalletEntry[] } {
  const moonGroups = new Map<number, WalletEntry[]>();
  for (let i = 0; i < planetCount; i++) moonGroups.set(i, []);

  const overflowBelt: WalletEntry[] = [];

  // Per-planet capacity: Saturn always 6, others by type
  const cap = (idx: number) => {
    if (idx === saturnIdx) return 6;
    if (typeMap && planetAddresses) {
      const t = typeMap.get(planetAddresses[idx]);
      if (t) return MOON_CAP[t] ?? MAX_MOONS_PER_PLANET;
    }
    return MAX_MOONS_PER_PLANET;
  };

  // Phase 1: fill Saturn first — take the first 6 available moons
  const remaining: { w: WalletEntry }[] = [];
  for (const entry of moonEntries) {
    if (saturnIdx >= 0 && (moonGroups.get(saturnIdx)!.length < 6)) {
      moonGroups.get(saturnIdx)!.push(entry.w);
    } else {
      remaining.push(entry);
    }
  }

  // Phase 2: distribute the rest by hash, respecting per-type capacity
  for (const { w } of remaining) {
    const safePlanetCount = Math.max(planetCount, 1);
    const preferredHostIdx = fnv1a(w.address, 0xbeef) % safePlanetCount;

    let placed = false;
    for (let offset = 0; offset < safePlanetCount; offset++) {
      const hostIdx = (preferredHostIdx + offset) % safePlanetCount;
      const grp = moonGroups.get(hostIdx)!;
      if (grp.length < cap(hostIdx)) {
        grp.push(w);
        placed = true;
        break;
      }
    }

    if (!placed) overflowBelt.push(w);
  }

  return { moonGroups, overflowBelt };
}

/* ── VP stats ─────────────────────────────────────────────── */

export interface MoonVPStats {
  mlogMin:  number;
  mvpRange: number;
}

/** Compute log-scale VP range for moon sizing. */
export function computeMoonVPStats(
  moonEntries: { w: WalletEntry }[],
): MoonVPStats {
  const vps    = moonEntries.map(({ w }) => weiToFloat(w.votingPower));
  const vpMax  = Math.max(...vps, 1);
  const vpMin  = Math.min(...vps.filter(v => v > 0), 0.001);
  const logMax = Math.log10(vpMax);
  const logMin = Math.log10(Math.max(vpMin, 0.001));
  return {
    mlogMin:  logMin,
    mvpRange: logMax - logMin || 1,
  };
}

/* ── Build MoonData array for one planet ──────────────────── */

export function buildMoonList(
  wallets:    WalletEntry[],
  hostRadius: number,
  stats:      MoonVPStats,
): MoonData[] {
  // Scale first-orbit gap with host size so moons don't hug large planets
  const firstGap = Math.max(MOON_FIRST_GAP, hostRadius * 0.5 + 2.0);
  let moonCursor = hostRadius + firstGap;

  return wallets.map((mw, idx) => {
    const mvp = weiToFloat(mw.votingPower);
    const mt  = Math.max(0, Math.min(1,
      (Math.log10(Math.max(mvp, 0.001)) - stats.mlogMin) / stats.mvpRange));
    const mrRaw = MIN_MOON_R + Math.pow(mt, 0.5) * (MAX_MOON_R - MIN_MOON_R);
    const mr    = Math.min(mrRaw, hostRadius * 0.25);

    moonCursor += mr;
    const mo    = moonCursor;
    moonCursor += mr + MOON_SURFACE_GAP;

    // Offset each moon's type by idx*2 (mod 6) so moons on the same planet
    // always get distinct types: offsets 0, +2, +4 cover 3 unique slots.
    const baseType = Math.floor(frac(mw.address, 66) * 6) % 6;
    const moonType = ((baseType + idx * 2) % 6) as 0 | 1 | 2 | 3 | 4 | 5;

    // Smaller moons get more tilt (irregular orbits), larger ones stay near-equatorial
    const tiltRaw = (frac(mw.address, 44) - 0.5) * 0.35;  // ±~10°
    const sizeNorm = (mr - MIN_MOON_R) / (MAX_MOON_R - MIN_MOON_R + 0.001);
    const tilt = tiltRaw * (1.0 - sizeNorm * 0.6);

    return {
      wallet:       mw,
      radius:       mr,
      orbitRadius:  mo,
      orbitSpeed:   BASE_MOON_SPEED * Math.pow(0.6, Math.floor(frac(mw.address, 55) * 3)),
      initialAngle: frac(mw.address, 11) * Math.PI * 2,
      hue:          frac(mw.address, 22),
      seed:         frac(mw.address, 33),
      tilt,
      moonType,
    };
  });
}

/* ── Saturn-specific moon placement ───────────────────────── */

/**
 * Predefined orbit slots for Saturn moons (as multiples of host radius).
 * Shepherd moons sit within the ring bands to create gaps;
 * larger moons orbit beyond the ring's outer edge.
 */
const SATURN_MOON_SLOTS = [
  1.45,   // D/C ring boundary — shepherd moon (creates visible gap)
  2.10,   // mid-C ring — shepherd moon
  2.80,   // near Cassini Division — like Mimas
  3.45,   // A ring — like Daphnis in Encke gap
  4.30,   // just outside ring system — like Janus
  5.00,   // far outer orbit — like Enceladus
];

/**
 * Build moon layout for Saturn. Moons are spread across and beyond the
 * ring system rather than packed at the inner edge, so the ring disc
 * shader can carve realistic gaps at each moon orbit.
 */
export function buildSaturnMoonList(
  wallets:    WalletEntry[],
  hostRadius: number,
  stats:      MoonVPStats,
): MoonData[] {
  return wallets.map((mw, i) => {
    const mvp   = weiToFloat(mw.votingPower);
    const mt    = Math.max(0, Math.min(1,
      (Math.log10(Math.max(mvp, 0.001)) - stats.mlogMin) / stats.mvpRange));
    const mrRaw = MIN_MOON_R + Math.pow(mt, 0.5) * (MAX_MOON_R - MIN_MOON_R);
    const mr    = Math.min(mrRaw, hostRadius * 0.25);

    const slot  = SATURN_MOON_SLOTS[i % SATURN_MOON_SLOTS.length];
    const mo    = hostRadius * slot;

    // Kepler-like orbit speed: inner moons orbit faster
    const baseOrbitR = hostRadius * SATURN_MOON_SLOTS[0];
    const speed      = BASE_MOON_SPEED * Math.pow(baseOrbitR / mo, 1.5);

    // Type diversity: offset by index so Saturn moons on the same planet differ
    const baseType = Math.floor(frac(mw.address, 66) * 6) % 6;
    const moonType = ((baseType + i * 2) % 6) as 0 | 1 | 2 | 3 | 4 | 5;

    return {
      wallet:       mw,
      radius:       mr,
      orbitRadius:  mo,
      orbitSpeed:   speed,
      initialAngle: frac(mw.address, 11) * Math.PI * 2,
      hue:          frac(mw.address, 22),
      seed:         frac(mw.address, 33),
      tilt:         0,
      moonType,
    };
  });
}
