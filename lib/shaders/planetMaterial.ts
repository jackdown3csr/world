/**
 * Planet material factory — picks the right per-type shader.
 */

import * as THREE from "three";
import type { PlanetType } from "../layout/types";

import * as rocky from "./rockyShader";
import * as mars from "./marsShader";
import * as terrestrial from "./terrestrialShader";
import * as iceGiant from "./iceGiantShader";
import * as gasGiant from "./gasGiantShader";

const SHADER_MAP: Record<PlanetType, { VERT: string; FRAG: string }> = {
  rocky,
  terrestrial,
  ice_giant:  iceGiant,
  gas_giant:  gasGiant,
};

function makeUniforms(hue: number, seed: number, hasRing = false) {
  return {
    uHue:     { value: hue  },
    uSeed:    { value: seed },
    uTime:    { value: 0    },
    uVariant: { value: seed },
    uHasRing: { value: hasRing ? 1.0 : 0.0 },
    // Moon transit shadow uniforms (updated per frame by PlanetWallet)
    uMoonPos:   { value: Array.from({ length: 6 }, () => new THREE.Vector3()) },
    uMoonRad:   { value: [0, 0, 0, 0, 0, 0] },
    uMoonCount: { value: 0 },
  };
}

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
    uniforms: makeUniforms(hue, seed, hasRing),
  });
}

/** Dedicated material for the Mars planet (highest-ranked rocky). */
export function createMarsMaterial(
  hue:  number,
  seed: number,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader:   mars.VERT,
    fragmentShader: mars.FRAG,
    uniforms: makeUniforms(hue, seed, false),
  });
}
