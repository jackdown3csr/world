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

/* ── Per-rank shader imports (unique visual identity per planet) ────── */
import * as gasGiant0 from "./planets/gasGiant0";
import * as gasGiant1 from "./planets/gasGiant1";
import * as gasGiant2 from "./planets/gasGiant2";
import * as gasGiant3 from "./planets/gasGiant3";
import * as iceGiant0 from "./planets/iceGiant0";
import * as iceGiant1 from "./planets/iceGiant1";
import * as iceGiant2 from "./planets/iceGiant2";
import * as iceGiant3 from "./planets/iceGiant3";
import * as terrestrial0 from "./planets/terrestrial0";
import * as terrestrial1 from "./planets/terrestrial1";
import * as terrestrial2 from "./planets/terrestrial2";
import * as terrestrial3 from "./planets/terrestrial3";
import * as terrestrial4 from "./planets/terrestrial4";
import * as terrestrial5 from "./planets/terrestrial5";
import * as rocky0 from "./planets/rocky0";
import * as rocky1 from "./planets/rocky1";
import * as rocky2 from "./planets/rocky2";
import * as rocky3 from "./planets/rocky3";
import * as rocky4 from "./planets/rocky4";
import * as protoplanetary0 from "./planets/protoplanetary0";
import * as protoplanetary1 from "./planets/protoplanetary1";
import * as molten0 from "./planets/molten0";
import * as lavaOcean0 from "./planets/lavaOcean0";
import * as lavaOcean1 from "./planets/lavaOcean1";

const SHADER_MAP: Record<PlanetType, { VERT: string; FRAG: string }> = {
  rocky,
  terrestrial,
  ice_giant:      iceGiant,
  gas_giant:      gasGiant,
  molten,
  lava_ocean:     lavaOcean,
  protoplanetary,
};

/** Per-rank shaders: `${planetType}_${subRank}` → unique shader per planet. */
const RANK_SHADER_MAP: Record<string, { VERT: string; FRAG: string }> = {
  gas_giant_0:      gasGiant0,
  gas_giant_1:      gasGiant1,
  gas_giant_2:      gasGiant2,
  gas_giant_3:      gasGiant3,
  ice_giant_0:      iceGiant0,
  ice_giant_1:      iceGiant1,
  ice_giant_2:      iceGiant2,
  ice_giant_3:      iceGiant3,
  terrestrial_0:    terrestrial0,
  terrestrial_1:    terrestrial1,
  terrestrial_2:    terrestrial2,
  terrestrial_3:    terrestrial3,
  terrestrial_4:    terrestrial4,
  terrestrial_5:    terrestrial5,
  rocky_0:          rocky0,
  rocky_1:          rocky1,
  rocky_2:          rocky2,
  rocky_3:          rocky3,
  rocky_4:          rocky4,
  protoplanetary_0: protoplanetary0,
  protoplanetary_1: protoplanetary1,
  molten_0:         molten0,
  lava_ocean_0:     lavaOcean0,
  lava_ocean_1:     lavaOcean1,
};

function makeUniforms(hue: number, seed: number, variant: number, hasRing = false) {
  return {
    uHue:     { value: hue  },
    uSeed:    { value: seed },
    uTime:    { value: 0    },
    uVariant: { value: variant },
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
      uniforms: makeUniforms(0, 0, 0),
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
  variant: number,
  hasRing = false,
  subRank = -1,
): THREE.ShaderMaterial {
  // Try rank-specific shader first
  const rankKey = `${type}_${subRank}`;
  const rankShader = RANK_SHADER_MAP[rankKey];
  if (rankShader) {
    const mat = getProto(rankShader.VERT, rankShader.FRAG, `planet_${rankKey}`).clone();
    const u = makeUniforms(hue, seed, variant, hasRing);
    for (const [k, v] of Object.entries(u)) mat.uniforms[k] = v;
    return mat;
  }
  // Fallback to shared type shader (pool system, extra planets, etc.)
  const { VERT, FRAG } = SHADER_MAP[type];
  const mat = getProto(VERT, FRAG, `planet_${type}`).clone();
  const u = makeUniforms(hue, seed, variant, hasRing);
  for (const [k, v] of Object.entries(u)) mat.uniforms[k] = v;
  return mat;
}

/** Dedicated material for the Mars planet (highest-ranked rocky). */
export function createMarsMaterial(
  hue:  number,
  seed: number,
  variant: number,
): THREE.ShaderMaterial {
  const mat = getProto(mars.VERT, mars.FRAG, "planet_mars").clone();
  const u = makeUniforms(hue, seed, variant, false);
  for (const [k, v] of Object.entries(u)) mat.uniforms[k] = v;
  return mat;
}
