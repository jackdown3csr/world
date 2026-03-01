/**
 * Deterministic hash utilities for mapping a wallet address
 * to a lat/lon point on the sphere and a hue for city color.
 *
 * Uses FNV‑1a (32‑bit) — fast, good avalanche, zero dependencies.
 */

/* ── FNV‑1a 32‑bit hash ──────────────────────────────────── */
function fnv1a(input: string, seed = 0): number {
  let hash = 2166136261 ^ seed;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  // Force unsigned 32‑bit
  return hash >>> 0;
}

/* ── Public API ───────────────────────────────────────────── */

export interface LatLon {
  lat: number; // -90 … 90
  lon: number; // -180 … 180
}

/**
 * Map an address deterministically to a lat/lon on the sphere.
 * Same address → same point every time.
 */
export function hashToLatLon(address: string): LatLon {
  // Two independent hashes using different seeds
  const h1 = fnv1a(address, 0);
  const h2 = fnv1a(address, 1337);

  // Normalize to [0, 1)
  const u = h1 / 0xffffffff;
  const v = h2 / 0xffffffff;

  // Uniform sphere distribution via acos (avoids polar bunching)
  const lat = Math.acos(2 * u - 1) * (180 / Math.PI) - 90;
  const lon = v * 360 - 180;

  return { lat, lon };
}

/**
 * Deterministic hue (0–360) derived from the address.
 * Used for per‑city color variation.
 */
export function hashToHue(address: string): number {
  const h = fnv1a(address, 42);
  return (h % 360);
}

/* ── Coordinate conversion helper ─────────────────────────── */

/**
 * Convert lat/lon (degrees) to a unit‑sphere XYZ position.
 * @param radius  Sphere radius (default 1)
 */
export function latLonToXYZ(
  lat: number,
  lon: number,
  radius = 1,
): [x: number, y: number, z: number] {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;

  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);

  return [x, y, z];
}
