/**
 * Planet material factory — picks the right per-type shader.
 *
 * Uses a prototype-cache so Three.js reuses the compiled WebGL program
 * for all planets of the same type (clone shares the GPU program).
 */

import * as THREE from "three";
import type { PlanetType } from "../layout/types";

import * as rocky from "./rockyShader";
import * as mars from "./marsShader";
import * as terrestrial from "./terrestrialShader";
import * as iceGiant from "./iceGiantShader";
import * as gasGiant from "./gasGiantShader";
import * as molten from "./moltenShader";
import * as lavaOcean from "./lavaOceanShader";
import * as protoplanetary from "./protoplanetaryShader";

const SHADER_MAP: Record<PlanetType, { VERT: string; FRAG: string }> = {
  rocky,
  terrestrial,
  ice_giant:      iceGiant,
  gas_giant:      gasGiant,
  molten,
  lava_ocean:     lavaOcean,
  protoplanetary,
};

function makeUniforms(hue: number, seed: number, hasRing = false) {
  return {
    uHue:     { value: hue  },
    uSeed:    { value: seed },
    uTime:    { value: 0    },
    uVariant: { value: seed },
    uHasRing:  { value: hasRing ? 1.0 : 0.0 },
    uStarPos:  { value: new THREE.Vector3(0, 0, 0) },
    // Moon transit shadow uniforms (updated per frame by PlanetWallet)
    uMoonPos:   { value: Array.from({ length: 6 }, () => new THREE.Vector3()) },
    uMoonRad:   { value: [0, 0, 0, 0, 0, 0] },
    uMoonCount: { value: 0 },
  };
}

/* ── Prototype cache: one compiled program per planet type ──────── */
const protoCache = new Map<string, THREE.ShaderMaterial>();

function getProto(vert: string, frag: string, key: string): THREE.ShaderMaterial {
  let proto = protoCache.get(key);
  if (!proto) {
    proto = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: makeUniforms(0, 0),
    });
    protoCache.set(key, proto);
  }
  return proto;
}

/** One ShaderMaterial per planet — cloned from prototype so GPU program is shared. */
export function createPlanetMaterial(
  type: PlanetType,
  hue:  number,
  seed: number,
  hasRing = false,
): THREE.ShaderMaterial {
  const { VERT, FRAG } = SHADER_MAP[type];
  const mat = getProto(VERT, FRAG, `planet_${type}`).clone();
  const u = makeUniforms(hue, seed, hasRing);
  for (const [k, v] of Object.entries(u)) mat.uniforms[k] = v;
  return mat;
}

/** Dedicated material for the Mars planet (highest-ranked rocky). */
export function createMarsMaterial(
  hue:  number,
  seed: number,
): THREE.ShaderMaterial {
  const mat = getProto(mars.VERT, mars.FRAG, "planet_mars").clone();
  const u = makeUniforms(hue, seed, false);
  for (const [k, v] of Object.entries(u)) mat.uniforms[k] = v;
  return mat;
}
