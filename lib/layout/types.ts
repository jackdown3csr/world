/**
 * Data types for all celestial bodies in the solar system.
 */

import type { WalletEntry } from "../types";

/* ── Planet ────────────────────────────────────────────────── */

export type PlanetType = "rocky" | "terrestrial" | "ice_giant" | "gas_giant";

/** Layout mode: "solar" = real-solar-system bands, "ranked" = VP rank → distance, "ranked-gnet" = locked GNET rank → distance */
export type LayoutMode = "solar" | "ranked" | "ranked-gnet";

export interface PlanetData {
  wallet:       WalletEntry;
  radius:       number;
  planetType:   PlanetType;
  orbitRadius:  number;
  orbitSpeed:   number;
  initialAngle: number;
  hue:          number;
  seed:         number;
  tilt:         number;
  moons:        MoonData[];
  ringWallets:  RingParticleData[];
  /** 1-based rank by voting power (veGNET), highest VP = 1 */
  vpRank:       number;
  /** True for the highest-ranked rocky planet (the "Mars" of this system) */
  isMars?:      boolean;
}

/* ── Moon ──────────────────────────────────────────────────── */

export interface MoonData {
  wallet:       WalletEntry;
  radius:       number;
  orbitRadius:  number;
  orbitSpeed:   number;
  initialAngle: number;
  hue:          number;
  seed:         number;
  tilt:         number;
  moonType:     0 | 1 | 2 | 3 | 4 | 5;
}

/* ── Ring particle ────────────────────────────────────────── */

export interface RingParticleData {
  wallet:       WalletEntry;
  angle:        number;
  radialT:      number;
  size:         number;
  hue:          number;
  seed:         number;
}

/* ── Asteroid ─────────────────────────────────────────────── */

export interface AsteroidData {
  wallet:   WalletEntry;
  position: [number, number, number];
  size:     number;
  hue:      number;
  seed:     number;   // second independent hash [0,1] for per-instance deformation
  variant:  number;   // 0..N_POTATO_VARIANTS-1, geometry shape bucket
}

/* ── Solar system (combined output) ───────────────────────── */

export interface SolarSystemData {
  planets:         PlanetData[];
  asteroids:       AsteroidData[];
  beltInnerRadius: number;
  beltOuterRadius: number;
}
