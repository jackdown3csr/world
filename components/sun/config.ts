import { SUN_RADIUS } from "@/lib/layout";

export const SUN_PALETTES = {
  warm: {
    // veGNET — orange/gold
    surface: { white: "#fff8f0", yellow: "#ffe070", orange: "#ff9922", dark: "#8c2800" },
    halo: ["#fffef0", "#fff4c8", "#ffe080", "#ffaa33", "#ff7711"],
    flare: { warm: "#ff9a18", orange: "#ff6610" },
    label: { name: "#ffd888", accent: "#40eeff", sub: "#d8c080" },
    point: "#fff5e0",
  },
  cool: {
    // Vesting — ancient ivory-teal giant star
    surface: { white: "#fdf8f0", yellow: "#e0e8e4", orange: "#8abcb8", dark: "#1a2e30" },
    halo: ["#faf6ee", "#e8ede8", "#c2d6d2", "#8ab0ac", "#5a8882"],
    flare: { warm: "#e4ece6", orange: "#8ab8b0" },
    label: { name: "#e0eed8", accent: "#40ffee", sub: "#a0beb4" },
    point: "#f4efe4",
  },
  dwarf: {
    // gUBI pool — compact pristine blue-white young star
    surface: { white: "#fbfdff", yellow: "#dcf3ff", orange: "#89c7ff", dark: "#1d3156" },
    halo: ["#fafdff", "#dff4ff", "#a9dcff", "#63b7ff", "#2e7de0"],
    flare: { warm: "#e4f6ff", orange: "#89d8ff" },
    label: { name: "#eef8ff", accent: "#ffe08a", sub: "#9ec8ee" },
    point: "#f2f9ff",
  },
  dying: {
    // frozen staking shell — swollen unstable star shedding matter
    surface: { white: "#fff1d8", yellow: "#ff7f3d", orange: "#67160d", dark: "#120304" },
    halo: ["#ff9060", "#ff5a28", "#cf3c1a", "#5c120c", "#220405"],
    flare: { warm: "#ff7030", orange: "#7f190f" },
    label: { name: "#ffd8ba", accent: "#ff8750", sub: "#a56d5f" },
    point: "#ff9a58",
  },
} as const;

export type StarPalette = keyof typeof SUN_PALETTES;
export type StarVariant = "vescrow" | "vesting" | "dwarf" | "dying" | "generic";
export type HaloLayerConfig = {
  scale: number;
  color: string;
  alpha: number;
  falloff: number;
};

export const DYING_PARAMS = {
  turbulence: 2.8,
  pulseSpeed: 0.35,
  pulseAmplitude: 0.06,
  heatBias: 0.55,
  gasOpacity: 0.14,
  gasScale: 1.72,
  emberCount: 420,
  emberSpeed: 0.065,
  emberEmissive: 2.5,
} as const;

export const DWARF_PARAMS = {
  flowSpeed: 0.38,
  plasmaTightness: 0.58,
  coronaScale: 1.08,
  coronaOpacity: 0.06,
} as const;

export const VESTING_PARAMS = {
  pulseSpeed: 0.08,
  pulseAmplitude: 0.012,
  driftSpeed: 0.14,
  bandIntensity: 0.35,
  atmosphereScale: 1.1,
  atmosphereOpacity: 0.06,
} as const;

export const VESCROW_PARAMS = {
  turbulence: 0.45,
  pulseSpeed: 0.22,
  pulseAmplitude: 0.005,
  plasmaSpeed: 0.28,
  hotspotIntensity: 0.55,
  coronaScale: 1.08,
  coronaOpacity: 0.06,
} as const;

export function getStarVariant(palette: StarPalette): StarVariant {
  switch (palette) {
    case "warm":
      return "vescrow";
    case "cool":
      return "vesting";
    case "dwarf":
      return "dwarf";
    case "dying":
      return "dying";
    default:
      return "generic";
  }
}

export function getHaloLayers(palette: StarPalette): HaloLayerConfig[] {
  const pal = SUN_PALETTES[palette];
  switch (getStarVariant(palette)) {
    case "dying":
      return [
        { scale: 1.08, color: pal.halo[0], alpha: 0.55, falloff: 5.0 },
        { scale: 1.42, color: pal.halo[1], alpha: 0.35, falloff: 3.6 },
        { scale: 2.1, color: pal.halo[2], alpha: 0.2, falloff: 2.4 },
        { scale: 3.4, color: pal.halo[3], alpha: 0.1, falloff: 1.7 },
        { scale: 5.6, color: pal.halo[4], alpha: 0.04, falloff: 1.1 },
      ];
    case "vesting":
      return [
        { scale: 1.18, color: pal.halo[0], alpha: 0.72, falloff: 4.2 },
        { scale: 1.65, color: pal.halo[1], alpha: 0.42, falloff: 3.0 },
        { scale: 2.6, color: pal.halo[2], alpha: 0.22, falloff: 2.0 },
        { scale: 4.5, color: pal.halo[3], alpha: 0.1, falloff: 1.4 },
        { scale: 8.0, color: pal.halo[4], alpha: 0.035, falloff: 0.9 },
      ];
    case "vescrow":
      return [
        { scale: 1.14, color: pal.halo[0], alpha: 0.95, falloff: 4.2 },
        { scale: 1.55, color: pal.halo[1], alpha: 0.62, falloff: 3.0 },
        { scale: 2.4, color: pal.halo[2], alpha: 0.34, falloff: 2.2 },
        { scale: 4.2, color: pal.halo[3], alpha: 0.16, falloff: 1.5 },
        { scale: 7.5, color: pal.halo[4], alpha: 0.06, falloff: 1.0 },
      ];
    case "dwarf":
      return [
        { scale: 1.02, color: pal.halo[0], alpha: 0.56, falloff: 7.2 },
        { scale: 1.12, color: pal.halo[1], alpha: 0.28, falloff: 5.8 },
        { scale: 1.28, color: pal.halo[2], alpha: 0.14, falloff: 4.5 },
        { scale: 1.52, color: pal.halo[3], alpha: 0.06, falloff: 3.1 },
      ];
    case "generic":
    default:
      return [
        { scale: 1.12, color: pal.halo[0], alpha: 0.9, falloff: 4.0 },
        { scale: 1.45, color: pal.halo[1], alpha: 0.55, falloff: 3.0 },
        { scale: 2.2, color: pal.halo[2], alpha: 0.3, falloff: 2.2 },
        { scale: 3.8, color: pal.halo[3], alpha: 0.14, falloff: 1.5 },
        { scale: 7.0, color: pal.halo[4], alpha: 0.05, falloff: 1.0 },
      ];
  }
}

export function getLensFlareConfig(palette: StarPalette): { scaleMult: number; opacity: number } {
  switch (getStarVariant(palette)) {
    case "dying":
      return { scaleMult: 5.5, opacity: 0.8 };
    case "dwarf":
      return { scaleMult: 2.8, opacity: 0.62 };
    case "vesting":
      return { scaleMult: 6.5, opacity: 0.55 };
    case "vescrow":
      return { scaleMult: 5.5, opacity: 0.9 };
    case "generic":
    default:
      return { scaleMult: 5, opacity: 1 };
  }
}

export function getPointLightConfig(palette: StarPalette): { intensity: number; distance: number; decay: number } {
  switch (getStarVariant(palette)) {
    case "dying":
      return { intensity: 18, distance: 11000, decay: 0.14 };
    case "dwarf":
      return { intensity: 17, distance: 8200, decay: 0.14 };
    case "vesting":
      return { intensity: 24, distance: 14000, decay: 0.08 };
    case "vescrow":
      return { intensity: 32, distance: 13000, decay: 0.1 };
    case "generic":
    default:
      return { intensity: 28, distance: 12000, decay: 0.1 };
  }
}

export function getLabelAnchorRadius(palette: StarPalette): number {
  switch (getStarVariant(palette)) {
    case "dying":
      return SUN_RADIUS * DYING_PARAMS.gasScale + 56;
    case "vesting":
      return SUN_RADIUS * VESTING_PARAMS.atmosphereScale + 48;
    default:
      return SUN_RADIUS + 40;
  }
}

export function getCmeAlphaMultiplier(palette: StarPalette): number {
  return palette === "dwarf" ? 0.08 : 0.18;
}
