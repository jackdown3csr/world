/**
 * Scale a raw wei balance to a visual height for the instanced city mesh.
 *
 * Uses sqrt scaling so small balances are visible while whales
 * don't become planet‑sized. Returns a value in [MIN_SCALE, MAX_SCALE].
 */

const MIN_SCALE = 0.02;
const MAX_SCALE = 1.0;
const DECIMALS = 18;

/**
 * Convert raw wei string → visual scale factor.
 */
export function scaleBalance(rawWei: string): number {
  if (!rawWei || rawWei === "0") return 0;

  // Convert to float GNET (18 decimals)
  const wei = BigInt(rawWei);
  const unit = 10n ** BigInt(DECIMALS);
  const whole = Number(wei / unit);
  const frac = Number(wei % unit) / Number(unit);
  const gnet = whole + frac;

  if (gnet <= 0) return 0;

  // sqrt scaling with a multiplier
  const raw = Math.sqrt(gnet) * 0.05;

  // Clamp
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, raw));
}
