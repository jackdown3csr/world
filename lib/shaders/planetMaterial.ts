/**
 * Planet material factory — picks the right per-type shader.
 */

import * as THREE from "three";
import type { PlanetType } from "../layout/types";

import * as rocky from "./rockyShader";
import * as terrestrial from "./terrestrialShader";
import * as iceGiant from "./iceGiantShader";
import * as gasGiant from "./gasGiantShader";

const SHADER_MAP: Record<PlanetType, { VERT: string; FRAG: string }> = {
  rocky,
  terrestrial,
  ice_giant:  iceGiant,
  gas_giant:  gasGiant,
};

/** One ShaderMaterial per planet — independent uniforms per instance. */
export function createPlanetMaterial(
  type: PlanetType,
  hue:  number,
  seed: number,
  hasRing = false,
): THREE.ShaderMaterial {
  const { VERT, FRAG } = SHADER_MAP[type];
  return new THREE.ShaderMaterial({
    vertexShader:   VERT,
    fragmentShader: FRAG,
    uniforms: {
      uHue:     { value: hue  },
      uSeed:    { value: seed },
      uTime:    { value: 0    },
      uVariant: { value: seed },
      uHasRing: { value: hasRing ? 1.0 : 0.0 },
    },
  });
}
