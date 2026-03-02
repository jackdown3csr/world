/**
 * Shared helpers for the layout builder.
 */

import type { PlanetType } from "./types";

/* ── Hash helpers ─────────────────────────────────────────── */

export function fnv1a(input: string, seed = 0): number {
  let hash = 2166136261 ^ seed;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export const frac = (addr: string, seed: number): number =>
  fnv1a(addr, seed) / 0xffffffff;

/* ── Conversion ───────────────────────────────────────────── */

const DECIMALS = 18;

export function weiToFloat(raw: string): number {
  if (!raw || raw === "0") return 0;
  const wei  = BigInt(raw);
  const unit = 10n ** BigInt(DECIMALS);
  return Number(wei / unit) + Number(wei % unit) / Number(unit);
}

/* ── Type helpers ─────────────────────────────────────────── */

/** Determine planet sub-type from 0-based rank within the top 20. */
export function planetTypeByRank(rank0: number): PlanetType {
  if (rank0 < 4)  return "gas_giant";
  if (rank0 < 8)  return "ice_giant";
  if (rank0 < 14) return "terrestrial";
  return "rocky";
}
