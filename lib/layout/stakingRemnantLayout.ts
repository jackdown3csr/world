import type { StakingRemnantPayload } from "../types";
import type { SolarSystemData } from "./types";

/**
 * Staking star is rendered as a lone dying star — no belt, no debris.
 * The layout returns an empty system; all visuals live in the Sun dying-star path.
 */
export function buildStakingRemnantSystem(
  _payload: StakingRemnantPayload | null | undefined,
): SolarSystemData {
  return {
    planets: [],
    asteroids: [],
    beltInnerRadius: 0,
    beltOuterRadius: 600, // camera framing hint only
  };
}
