/**
 * Ring-particle layout (Saturn wallet ring).
 */

import type { WalletEntry } from "../types";
import type { RingParticleData } from "./types";
import { frac, weiToFloat } from "./helpers";

/**
 * Build ring particle data for wallets ranked 61–190.
 * Size scales logarithmically with voting power.
 */
export function buildRingParticles(
  ringEntries: { w: WalletEntry; vp: number }[],
): RingParticleData[] {
  const vps    = ringEntries.map(({ vp }) => vp);
  const vpMax  = Math.max(...vps, 1);
  const vpMin  = Math.min(...vps.filter(v => v > 0), 0.001);
  const logMax = Math.log10(vpMax);
  const logMin = Math.log10(Math.max(vpMin, 0.001));
  const range  = logMax - logMin || 1;

  return ringEntries.map(({ w, vp }) => {
    const t = Math.max(0, Math.min(1,
      (Math.log10(Math.max(vp, 0.001)) - logMin) / range));
    return {
      wallet:  w,
      angle:   frac(w.address, 11) * Math.PI * 2,
      radialT: frac(w.address, 22),
      size:    0.15 + Math.pow(t, 0.5) * 0.45,
      hue:     frac(w.address, 33),
      seed:    frac(w.address, 44),
    };
  });
}
