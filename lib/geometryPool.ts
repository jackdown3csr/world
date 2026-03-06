/**
 * Shared unit-sphere geometry pool.
 *
 * Every sphere in the scene reuses one of these (radius = 1) and applies its
 * real radius via mesh.scale.  This collapses ~1 200 separate SphereGeometry
 * allocations into 6 cached instances.
 */

import * as THREE from "three";

const pool = new Map<number, THREE.SphereGeometry>();

function unit(seg: number): THREE.SphereGeometry {
  let g = pool.get(seg);
  if (!g) { g = new THREE.SphereGeometry(1, seg, seg); pool.set(seg, g); }
  return g;
}

/** Planet body LOD tiers: 64 / 32 / 16 segments */
export const PLANET_GEOS = [unit(64), unit(32), unit(16)] as const;

/** Moon body LOD tiers: 48 / 24 / 12 segments */
export const MOON_GEOS = [unit(48), unit(24), unit(12)] as const;

/** Convenience re-exports for atmosphere shells that match existing segment counts */
export const ATMOS_HAZE_GEO   = unit(64); // same as PLANET_GEOS[0]
export const ATMOS_RIM_GEO    = unit(48); // same as MOON_GEOS[0]
export const ATMOS_EXPIRY_GEO = unit(32); // same as PLANET_GEOS[1]
