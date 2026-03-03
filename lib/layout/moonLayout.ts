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
export function distributeMoons(
  moonEntries: { w: WalletEntry }[],
  planetCount: number,
): { moonGroups: Map<number, WalletEntry[]>; overflowBelt: WalletEntry[] } {
  const moonGroups = new Map<number, WalletEntry[]>();
  for (let i = 0; i < planetCount; i++) moonGroups.set(i, []);

  const overflowBelt: WalletEntry[] = [];

  for (const { w } of moonEntries) {
    const hostIdx = fnv1a(w.address, 0xbeef) % Math.max(planetCount, 1);
    const grp = moonGroups.get(hostIdx)!;
    if (grp.length < MAX_MOONS_PER_PLANET) grp.push(w);
    else overflowBelt.push(w);
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
  let moonCursor = hostRadius + MOON_FIRST_GAP;

  return wallets.map((mw, idx) => {
    const mvp = weiToFloat(mw.votingPower);
    const mt  = Math.max(0, Math.min(1,
      (Math.log10(Math.max(mvp, 0.001)) - stats.mlogMin) / stats.mvpRange));
    const mrRaw = MIN_MOON_R + Math.pow(mt, 0.5) * (MAX_MOON_R - MIN_MOON_R);
    const mr    = Math.min(mrRaw, hostRadius * 0.30);

    moonCursor += mr;
    const mo    = moonCursor;
    moonCursor += mr + MOON_SURFACE_GAP;

    // Offset each moon's type by idx*2 (mod 6) so moons on the same planet
    // always get distinct types: offsets 0, +2, +4 cover 3 unique slots.
    const baseType = Math.floor(frac(mw.address, 66) * 6) % 6;
    const moonType = ((baseType + idx * 2) % 6) as 0 | 1 | 2 | 3 | 4 | 5;

    return {
      wallet:       mw,
      radius:       mr,
      orbitRadius:  mo,
      orbitSpeed:   BASE_MOON_SPEED * Math.pow(0.6, Math.floor(frac(mw.address, 55) * 3)),
      initialAngle: frac(mw.address, 11) * Math.PI * 2,
      hue:          frac(mw.address, 22),
      seed:         frac(mw.address, 33),
      tilt:         0,
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
    const mr    = Math.min(mrRaw, hostRadius * 0.30);

    const slot  = SATURN_MOON_SLOTS[i % SATURN_MOON_SLOTS.length];
    const mo    = hostRadius * slot;

    // Kepler-like orbit speed: inner moons orbit faster
    const baseOrbitR = hostRadius * SATURN_MOON_SLOTS[0];
    const speed      = BASE_MOON_SPEED * Math.pow(baseOrbitR / mo, 1.5);

    return {
      wallet:       mw,
      radius:       mr,
      orbitRadius:  mo,
      orbitSpeed:   speed,
      initialAngle: frac(mw.address, 11) * Math.PI * 2,
      hue:          frac(mw.address, 22),
      seed:         frac(mw.address, 33),
      tilt:         0,
      moonType:     (Math.floor(frac(mw.address, 66) * 6) % 6) as 0 | 1 | 2 | 3 | 4 | 5,
    };
  });
}
