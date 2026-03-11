import type { PoolTokenEntry } from "../types";
import type { PlanetData, SolarSystemData } from "./types";
import { frac } from "./helpers";

const BASE_ORBIT = 440;
const ORBIT_GAP = 230;
const MIN_RADIUS = 18;
const MAX_RADIUS = 42;
const BASE_SPEED = 0.07;
const PLANET_TYPES = ["terrestrial", "ice_giant", "rocky", "gas_giant"] as const;

export function buildPoolSystem(tokens: PoolTokenEntry[]): SolarSystemData {
  if (tokens.length === 0) {
    return { planets: [], asteroids: [], beltInnerRadius: 0, beltOuterRadius: 0 };
  }

  const ranked = [...tokens].sort((a, b) => b.valueUSD - a.valueUSD);
  const maxValue = ranked[0]?.valueUSD ?? 1;

  const planets: PlanetData[] = ranked.map((token, index) => {
    const share = maxValue > 0 ? token.valueUSD / maxValue : 0;
    const radius = MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * Math.pow(share, 0.82);
    const orbitRadius = BASE_ORBIT + index * ORBIT_GAP;
    const planetType = PLANET_TYPES[index % PLANET_TYPES.length];

    return {
      wallet: token,
      radius,
      planetType,
      orbitRadius,
      orbitSpeed: BASE_SPEED * Math.pow(BASE_ORBIT / orbitRadius, 1.35),
      initialAngle: frac(token.address, 0) * Math.PI * 2,
      hue: frac(token.address, 42),
      seed: frac(token.address, 99),
      variant: frac(token.address, 137),
      subRank: -1,  // pool system: no rank-specific shaders, use parametric fallback
      tilt: (frac(token.address, 77) - 0.5) * 0.16,
      moons: [],
      ringWallets: [],
      vpRank: index + 1,
      isMars: false,
    };
  });

  return {
    planets,
    asteroids: [],
    beltInnerRadius: 0,
    beltOuterRadius: 0,
  };
}
