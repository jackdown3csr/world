/**
 * Asteroid belt layout.
 */

import type { WalletEntry } from "../types";
import type { AsteroidData } from "./types";
import { BELT_MIN, BELT_MAX } from "./constants";
import { fnv1a, weiToFloat } from "./helpers";

/**
 * Place asteroids in a toroidal belt between inner and outer radius.
 */
export function buildAsteroids(
  wallets:         WalletEntry[],
  beltInnerRadius: number,
  beltOuterRadius: number,
): AsteroidData[] {
  const beltWidth = beltOuterRadius - beltInnerRadius;
  const beltMid   = (beltInnerRadius + beltOuterRadius) / 2;

  return wallets.map(w => {
    const h1 = fnv1a(w.address, 0);
    const h2 = fnv1a(w.address, 1337);
    const h3 = fnv1a(w.address, 9999);

    const angle   = (h1 / 0xffffffff) * Math.PI * 2;
    const rOffset = ((h2 / 0xffffffff) - 0.5) * beltWidth;
    const yOffset = ((h3 / 0xffffffff) - 0.5) * 2.5;
    const r       = beltMid + rOffset;

    const g        = weiToFloat(w.lockedGnet);
    const sizeFrac = Math.min(g / 100, 1);
    const size     = BELT_MIN + sizeFrac * (BELT_MAX - BELT_MIN);

    return {
      wallet:   w,
      position: [
        Math.cos(angle) * r,
        yOffset,
        Math.sin(angle) * r,
      ] as [number, number, number],
      size,
      hue: h2 / 0xffffffff,
    };
  });
}
