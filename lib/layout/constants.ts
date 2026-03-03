/**
 * Layout constants for the solar system.
 */

import type { PlanetType } from "./types";

/* ── Sun ──────────────────────────────────────────────────── */
export const SUN_RADIUS = 80.0;

/* ── Tier boundaries (rank-based) ─────────────────────────── */
export const PLANET_COUNT  = 20;
export const MOON_END_RANK = 60;    // ranks 21–60 → moons
export const RING_END_RANK = 190;   // ranks 61–190 → ring particles
// ranks 191+ → asteroid belt

/* ── Planet sizing ────────────────────────────────────────── */
export const SIZE_RANGES: Record<PlanetType, [number, number]> = {
  gas_giant:   [9.0, 14.0],
  ice_giant:   [4.5, 7.0],
  terrestrial: [2.5, 4.5],
  rocky:       [1.4, 2.5],
};

/* ── Planet orbits ────────────────────────────────────────── */
export const FIRST_ORBIT = SUN_RADIUS * 2.8;   // ~224 units
export const SURFACE_GAP = 24.0;

export const BASE_PLANET_SPEED = 0.012;

/* ── Moon sizing / orbits ─────────────────────────────────── */
export const MIN_MOON_R       = 0.12;
export const MAX_MOON_R       = 0.4;
export const MOON_FIRST_GAP   = 3.0;   // gap between planet surface and first moon orbit
export const MOON_SURFACE_GAP = 1.8;   // gap between moon orbit and moon surface

export const BASE_MOON_SPEED       = 0.08;
export const MAX_MOONS_PER_PLANET  = 3;

/* ── Saturn ring layout ───────────────────────────────────── */
/** Outer edge of Saturn ring = planet radius × this (must match RING_OUTER_MULT in WalletRing.tsx) */
export const SATURN_RING_OUTER_MULT = 4.2;
/** Extra clearance added on top of the ring outer radius so neighbours never clip */
export const SATURN_RING_EXTRA_GAP  = 30;

/* ── Asteroid belt ────────────────────────────────────────── */
export const BELT_GAP   = 40;
export const BELT_WIDTH = 30;
export const BELT_MIN   = 0.08;
export const BELT_MAX   = 0.25;
