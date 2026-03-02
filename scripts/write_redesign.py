"""
Writes the redesigned solar-system files:
  1. lib/orbitalUtils.ts   — rank-based 20 planets, 40 moons, 130 ring, 71 asteroid
  2. components/Sun.tsx     — SUN_RADIUS=80, prominence layer, 7th halo
  3. components/WalletRing.tsx — instanced wallet-particle ring
"""
import pathlib, textwrap

ROOT = pathlib.Path(__file__).resolve().parent.parent

# ═══════════════════════════════════════════════════════════════════════
#  1.  lib/orbitalUtils.ts
# ═══════════════════════════════════════════════════════════════════════
(ROOT / "lib" / "orbitalUtils.ts").write_text(textwrap.dedent(r'''
/**
 * Solar-system layout — wallet data → bodies.
 *
 * Ranked by votingPower (descending):
 *   Rank  1–20   → planet  (top 4 gas_giant, 5–8 ice_giant, 9–14 terrestrial, 15–20 rocky)
 *   Rank 21–60   → moon    (distributed across planets, max 3 each)
 *   Rank 61–190  → ring particle  (orbits the #1 voting-power planet — "Saturn")
 *   Rank 191+    → asteroid belt
 *
 * Orbit order : random by address hash  (decoupled from rank)
 * Speed       : Kepler ω ∝ r^{-1.5}
 * Size        : type-based range, position within range by voting-power rank
 */

import type { WalletEntry } from "./types";

/* ── helpers ──────────────────────────────────────────────── */
function fnv1a(input: string, seed = 0): number {
  let hash = 2166136261 ^ seed;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
const frac = (addr: string, seed: number) => fnv1a(addr, seed) / 0xffffffff;

const DECIMALS = 18;
function weiToFloat(raw: string): number {
  if (!raw || raw === "0") return 0;
  const wei  = BigInt(raw);
  const unit = 10n ** BigInt(DECIMALS);
  return Number(wei / unit) + Number(wei % unit) / Number(unit);
}

/* ── constants ────────────────────────────────────────────── */

// Tier counts (deterministic)
const PLANET_COUNT      = 20;
const MOON_END_RANK     = 60;   // ranks 21–60 → moons
const RING_END_RANK     = 190;  // ranks 61–190 → ring particles
// ranks 191+ → asteroid belt

// Planet type by rank within the 20
function planetTypeByRank(rank0: number): PlanetType {
  if (rank0 < 4)  return "gas_giant";
  if (rank0 < 8)  return "ice_giant";
  if (rank0 < 14) return "terrestrial";
  return "rocky";
}

// Size ranges per planet type [min, max] in world units
const SIZE_RANGES: Record<PlanetType, [number, number]> = {
  gas_giant:   [3.0, 6.0],
  ice_giant:   [1.8, 3.0],
  terrestrial: [0.90, 1.80],
  rocky:       [0.44, 0.90],
};

const MIN_MOON_R = 0.18;
const MAX_MOON_R = 0.56;

export const SUN_RADIUS = 80.0;

const FIRST_ORBIT   = SUN_RADIUS * 2.0;   // ~160 units
const SURFACE_GAP   = 6.0;
const MOON_FIRST_GAP   = 0.6;
const MOON_SURFACE_GAP = 0.45;

const BASE_PLANET_SPEED = 0.18;
const BASE_MOON_SPEED   = 1.10;
const MAX_MOONS_PER_PLANET = 3;

const BELT_GAP   = 24;
const BELT_WIDTH  = 28;
const BELT_MIN    = 0.05;
const BELT_MAX    = 0.18;

/* ── types ────────────────────────────────────────────────── */
export type PlanetType = "rocky" | "terrestrial" | "ice_giant" | "gas_giant";

export interface MoonData {
  wallet:       WalletEntry;
  radius:       number;
  orbitRadius:  number;
  orbitSpeed:   number;
  initialAngle: number;
  hue:          number;
  seed:         number;
  tilt:         number;
}

export interface RingParticleData {
  wallet:       WalletEntry;
  angle:        number;     // radians
  radialT:      number;     // 0..1 within the disc
  size:         number;     // world units
  hue:          number;
  seed:         number;
}

export interface PlanetData {
  wallet:       WalletEntry;
  radius:       number;
  planetType:   PlanetType;
  orbitRadius:  number;
  orbitSpeed:   number;
  initialAngle: number;
  hue:          number;
  seed:         number;
  tilt:         number;
  moons:        MoonData[];
  ringWallets:  RingParticleData[];
}

export interface AsteroidData {
  wallet:   WalletEntry;
  position: [number, number, number];
  size:     number;
  hue:      number;
}

export interface SolarSystemData {
  planets:         PlanetData[];
  asteroids:       AsteroidData[];
  beltInnerRadius: number;
  beltOuterRadius: number;
}

/* ── main builder ─────────────────────────────────────────── */
export function buildSolarSystem(wallets: WalletEntry[]): SolarSystemData {
  if (wallets.length === 0)
    return { planets: [], asteroids: [], beltInnerRadius: 0, beltOuterRadius: 0 };

  // 1. Sort ALL wallets by votingPower descending
  const ranked = [...wallets]
    .map(w => ({ w, vp: weiToFloat(w.votingPower) }))
    .sort((a, b) => b.vp - a.vp);

  // 2. Slice into tiers
  const planetEntries = ranked.slice(0, Math.min(PLANET_COUNT, ranked.length));
  const moonEntries   = ranked.slice(PLANET_COUNT, Math.min(MOON_END_RANK, ranked.length));
  const ringEntries   = ranked.slice(MOON_END_RANK, Math.min(RING_END_RANK, ranked.length));
  const beltEntries   = ranked.slice(RING_END_RANK);

  const N = planetEntries.length;

  // 3. Compute planet radii by type-rank
  const radiusMap = new Map<string, number>();
  const typeMap   = new Map<string, PlanetType>();
  // Group by type to compute within-type rank
  const byType: Record<PlanetType, { addr: string; idx: number }[]> = {
    gas_giant: [], ice_giant: [], terrestrial: [], rocky: [],
  };
  planetEntries.forEach(({ w }, i) => {
    const t = planetTypeByRank(i);
    typeMap.set(w.address, t);
    byType[t].push({ addr: w.address, idx: byType[t].length });
  });
  for (const type of Object.keys(byType) as PlanetType[]) {
    const bucket = byType[type];
    const [rMin, rMax] = SIZE_RANGES[type];
    const count = bucket.length;
    bucket.forEach(({ addr }, idx) => {
      const t = count === 1 ? 1.0 : 1.0 - idx / (count - 1);
      const r = rMin + Math.pow(t, 0.65) * (rMax - rMin);
      radiusMap.set(addr, r);
    });
  }

  // 4. Orbit order — shuffled by address hash (decoupled from rank)
  const slotOrder = planetEntries
    .map(({ w }, i) => ({ i, key: fnv1a(w.address, 0xcafe) }))
    .sort((a, b) => a.key - b.key)
    .map(x => x.i);

  const orbitByIdx = new Array<number>(N).fill(0);
  let cursor = FIRST_ORBIT;
  for (const planetIdx of slotOrder) {
    const r = radiusMap.get(planetEntries[planetIdx].w.address)!;
    cursor += r;
    orbitByIdx[planetIdx] = cursor;
    cursor += r + SURFACE_GAP;
  }

  // 5. Distribute moons
  const moonGroups = new Map<number, WalletEntry[]>(
    planetEntries.map((_, i) => [i, []])
  );
  const overflowBelt: WalletEntry[] = [];
  for (const { w } of moonEntries) {
    const hostIdx = fnv1a(w.address, 0xbeef) % Math.max(N, 1);
    const grp = moonGroups.get(hostIdx)!;
    if (grp.length < MAX_MOONS_PER_PLANET) grp.push(w);
    else overflowBelt.push(w);
  }

  // Moon sizing helpers
  const moonVPs  = moonEntries.map(({ w }) => weiToFloat(w.votingPower));
  const mvpMax   = Math.max(...moonVPs, 1);
  const mvpMin   = Math.min(...moonVPs.filter(v => v > 0), 0.001);
  const mlogMax  = Math.log10(mvpMax);
  const mlogMin  = Math.log10(Math.max(mvpMin, 0.001));
  const mvpRange = mlogMax - mlogMin || 1;

  // 6. Find #1 planet (highest VP) for Ring assignment
  //    rank 0 is already the highest VP
  const saturnIdx = 0;

  // 7. Build ring particles for the Saturn planet
  const ringVPs  = ringEntries.map(({ w }) => weiToFloat(w.votingPower));
  const rvpMax   = Math.max(...ringVPs, 1);
  const rvpMin   = Math.min(...ringVPs.filter(v => v > 0), 0.001);
  const rlogMax  = Math.log10(rvpMax);
  const rlogMin  = Math.log10(Math.max(rvpMin, 0.001));
  const rvpRange = rlogMax - rlogMin || 1;

  const ringParticles: RingParticleData[] = ringEntries.map(({ w }) => {
    const vp = weiToFloat(w.votingPower);
    const t  = Math.max(0, Math.min(1,
      (Math.log10(Math.max(vp, 0.001)) - rlogMin) / rvpRange));
    return {
      wallet: w,
      angle:   frac(w.address, 11) * Math.PI * 2,
      radialT: frac(w.address, 22),
      size:    0.04 + Math.pow(t, 0.5) * 0.10,
      hue:     frac(w.address, 33),
      seed:    frac(w.address, 44),
    };
  });

  // 8. Build planets
  const planets: PlanetData[] = planetEntries.map(({ w }, i) => {
    const radius      = radiusMap.get(w.address)!;
    const orbitRadius = orbitByIdx[i];
    const orbitSpeed  = BASE_PLANET_SPEED * Math.pow(FIRST_ORBIT / orbitRadius, 1.5);
    const pType       = typeMap.get(w.address)!;

    const moonList  = moonGroups.get(i)!;
    let moonCursor  = radius + MOON_FIRST_GAP;
    const moons: MoonData[] = moonList.map(mw => {
      const mvp = weiToFloat(mw.votingPower);
      const mt  = Math.max(0, Math.min(1,
        (Math.log10(Math.max(mvp, 0.001)) - mlogMin) / mvpRange));
      const mr  = MIN_MOON_R + Math.pow(mt, 0.5) * (MAX_MOON_R - MIN_MOON_R);
      moonCursor += mr;
      const mo   = moonCursor;
      moonCursor += mr + MOON_SURFACE_GAP;
      return {
        wallet:       mw,
        radius:       mr,
        orbitRadius:  mo,
        orbitSpeed:   BASE_MOON_SPEED * Math.pow(0.6, Math.floor(frac(mw.address, 55) * 3)),
        initialAngle: frac(mw.address, 11) * Math.PI * 2,
        hue:          frac(mw.address, 22),
        seed:         frac(mw.address, 33),
        tilt:         (frac(mw.address, 44) - 0.5) * 0.9,
      };
    });

    return {
      wallet:       w,
      radius,
      planetType:   pType,
      orbitRadius,
      orbitSpeed,
      initialAngle: frac(w.address, 0) * Math.PI * 2,
      hue:          frac(w.address, 42),
      seed:         frac(w.address, 99),
      tilt:         (frac(w.address, 77) - 0.5) * 0.28,
      moons,
      ringWallets:  i === saturnIdx ? ringParticles : [],
    };
  });

  // 9. Asteroid belt
  const asteroidWallets = [...beltEntries.map(e => e.w), ...overflowBelt];
  const maxOrbit        = N > 0 ? Math.max(...planets.map(p => p.orbitRadius)) : FIRST_ORBIT;
  const beltInnerRadius = maxOrbit + BELT_GAP;
  const beltOuterRadius = beltInnerRadius + BELT_WIDTH;
  const beltMid         = (beltInnerRadius + beltOuterRadius) / 2;

  const asteroids: AsteroidData[] = asteroidWallets.map(w => {
    const h1 = fnv1a(w.address, 0);
    const h2 = fnv1a(w.address, 1337);
    const h3 = fnv1a(w.address, 9999);
    const angle   = (h1 / 0xffffffff) * Math.PI * 2;
    const rOffset = ((h2 / 0xffffffff) - 0.5) * BELT_WIDTH;
    const yOffset = ((h3 / 0xffffffff) - 0.5) * 2.5;
    const r       = beltMid + rOffset;
    const g       = weiToFloat(w.lockedGnet);
    const sizeFrac = Math.min(g / 100, 1);
    const size     = BELT_MIN + sizeFrac * (BELT_MAX - BELT_MIN);
    return {
      wallet:   w,
      position: [Math.cos(angle) * r, yOffset, Math.sin(angle) * r] as [number, number, number],
      size,
      hue: h2 / 0xffffffff,
    };
  });

  return { planets, asteroids, beltInnerRadius, beltOuterRadius };
}
''').lstrip(), encoding="utf-8")
print("✓ lib/orbitalUtils.ts")


# ═══════════════════════════════════════════════════════════════════════
#  2.  components/Sun.tsx
# ═══════════════════════════════════════════════════════════════════════
(ROOT / "components" / "Sun.tsx").write_text(textwrap.dedent(r'''
"use client";

import React, { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { NOISE_GLSL } from "@/lib/glsl";
import { SUN_RADIUS } from "@/lib/orbitalUtils";

/* ── surface shader ──────────────────────────────────── */
const surfaceVert = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vNorm;
  void main() {
    vPos  = position;
    vNorm = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
  }
`;

const surfaceFrag = /* glsl */ `
  uniform float uTime;
  varying vec3 vPos;
  varying vec3 vNorm;

  ${NOISE_GLSL}

  /* Voronoi granulation */
  float granule(vec3 p) {
    vec3 fp = floor(p); vec3 fr = fract(p);
    float d = 1.0;
    for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++) for(int z=-1;z<=1;z++) {
      vec3 o = vec3(float(x),float(y),float(z));
      vec3 rp = fp+o;
      vec3 h  = fract(sin(rp * vec3(127.1,311.7,74.7) + rp.yzx*vec3(269.5,183.3,246.1)) * 43758.5);
      d = min(d, length(fr - o - h));
    }
    return d;
  }

  void main() {
    vec3 p = normalize(vPos);

    /* two-scale granulation */
    float gran1 = granule(p * 4.5 + vec3(uTime*0.006));
    float gran2 = granule(p * 10.0 + vec3(uTime*0.014, uTime*0.009, 0.0));
    float cell  = mix(gran1, gran2, 0.45);
    float bright = 1.0 - smoothstep(0.12, 0.50, cell);

    /* sunspot activity */
    float activity = fbm(p * 2.0 + vec3(uTime*0.004));
    float spots    = smoothstep(0.52, 0.68, activity) * 0.50;

    /* faculae (bright patches near limb) */
    float fac = smoothstep(0.60, 0.80, activity) * 0.25;

    /* palette */
    vec3 white  = vec3(1.00, 0.98, 0.92);
    vec3 yellow = vec3(1.00, 0.82, 0.34);
    vec3 orange = vec3(1.00, 0.52, 0.08);
    vec3 dark   = vec3(0.50, 0.16, 0.02);

    vec3 col = mix(orange, yellow, bright);
    col      = mix(col, white, bright * bright * 0.65);
    col      = mix(col, dark, spots);
    col     += white * fac;

    /* limb darkening (μ = cos θ from camera) */
    float mu     = max(dot(vNorm, vec3(0.0,0.0,1.0)), 0.0);
    float limb   = 0.30 + 0.70 * pow(mu, 0.50);
    col *= limb;

    /* chromosphere edge glow */
    float edge = pow(1.0 - mu, 4.5);
    col = mix(col, vec3(1.0,0.38,0.04), edge * 0.55);

    gl_FragColor = vec4(col, 1.0);
  }
`;

/* ── prominence / filament layer shader ─────────────── */
const promVert = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vNorm;
  void main() {
    vPos  = position;
    vNorm = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
  }
`;

const promFrag = /* glsl */ `
  uniform float uTime;
  varying vec3 vPos;
  varying vec3 vNorm;

  ${NOISE_GLSL}

  void main() {
    vec3 p  = normalize(vPos);
    float mu = max(dot(vNorm, vec3(0.0,0.0,1.0)), 0.0);

    /* faint wisps visible only at the limb */
    float limbMask = pow(1.0 - mu, 6.0);
    float n = fbm(p * 3.0 + vec3(uTime*0.012, uTime*0.007, 0.0));
    float filament = smoothstep(0.35, 0.65, n) * limbMask;

    vec3 col = mix(vec3(1.0, 0.35, 0.05), vec3(1.0, 0.80, 0.30), n) * filament;
    float alpha = filament * 0.60;
    gl_FragColor = vec4(col, alpha);
  }
`;

/* ── halo (corona) layer ─────────────────────────────── */
const haloVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
  }
`;

const haloFrag = /* glsl */ `
  uniform vec3  uColor;
  uniform float uAlpha;
  uniform float uFalloff;
  varying vec2 vUv;
  void main() {
    float d   = length(vUv - 0.5) * 2.0;
    float glow = pow(max(1.0 - d, 0.0), uFalloff);
    gl_FragColor = vec4(uColor * glow, glow * uAlpha);
  }
`;

/* ── HaloLayer component ─────────────────────────────── */
function HaloLayer({ scale, color, alpha, falloff }:
  { scale: number; color: string; alpha: number; falloff: number }) {
  const ref   = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  const mat   = useMemo(
    () => new THREE.ShaderMaterial({
      vertexShader: haloVert, fragmentShader: haloFrag,
      uniforms: {
        uColor:   { value: new THREE.Color(color) },
        uAlpha:   { value: alpha },
        uFalloff: { value: falloff },
      },
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
      side: THREE.DoubleSide,
    }), [color, alpha, falloff]);
  useFrame(() => { if (ref.current) ref.current.quaternion.copy(camera.quaternion); });
  const s = SUN_RADIUS * scale;
  return (
    <mesh ref={ref}>
      <planeGeometry args={[s * 2, s * 2]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}

/* ── Sun component ───────────────────────────────────── */
export default function Sun() {
  const surfaceMat = useMemo(
    () => new THREE.ShaderMaterial({
      vertexShader: surfaceVert, fragmentShader: surfaceFrag,
      uniforms: { uTime: { value: 0 } },
    }), []);

  const promMat = useMemo(
    () => new THREE.ShaderMaterial({
      vertexShader: promVert, fragmentShader: promFrag,
      uniforms: { uTime: { value: 0 } },
      transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
    }), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    surfaceMat.uniforms.uTime.value = t;
    promMat.uniforms.uTime.value    = t;
  });

  return (
    <group>
      {/* photosphere */}
      <mesh>
        <sphereGeometry args={[SUN_RADIUS, 128, 128]} />
        <primitive object={surfaceMat} attach="material" />
      </mesh>

      {/* prominence / filament shell */}
      <mesh>
        <sphereGeometry args={[SUN_RADIUS * 1.015, 96, 96]} />
        <primitive object={promMat} attach="material" />
      </mesh>

      {/* corona layers — inner (hot white) to outer (deep red) */}
      <HaloLayer scale={1.20} color="#fffbe8" alpha={0.85} falloff={3.0} />
      <HaloLayer scale={1.70} color="#ffdd55" alpha={0.52} falloff={2.4} />
      <HaloLayer scale={2.80} color="#ffaa11" alpha={0.28} falloff={1.9} />
      <HaloLayer scale={5.00} color="#ff7700" alpha={0.15} falloff={1.4} />
      <HaloLayer scale={9.00} color="#ff4400" alpha={0.07} falloff={1.0} />
      <HaloLayer scale={15.0} color="#ff2200" alpha={0.03} falloff={0.7} />
      <HaloLayer scale={25.0} color="#cc1100" alpha={0.012} falloff={0.5} />

      <pointLight intensity={18} distance={8000} decay={0.12} color="#fff5e0" />
    </group>
  );
}
''').lstrip(), encoding="utf-8")
print("✓ components/Sun.tsx")


# ═══════════════════════════════════════════════════════════════════════
#  3.  components/WalletRing.tsx
# ═══════════════════════════════════════════════════════════════════════
(ROOT / "components" / "WalletRing.tsx").write_text(textwrap.dedent(r'''
"use client";

import React, { useRef, useMemo, useEffect, useState, useCallback } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { RingParticleData } from "@/lib/orbitalUtils";
import WalletTooltip from "./WalletTooltip";

interface WalletRingProps {
  ringWallets:     RingParticleData[];
  hostRadius:      number;
  selectedAddress: string | null;
  onSelectAddress: (address: string) => void;
}

const RING_INNER_MULT = 1.6;   // inner edge = hostRadius × this
const RING_OUTER_MULT = 4.2;   // outer edge = hostRadius × this
const CASSINI_CENTER  = 0.58;  // fraction where Cassini gap sits
const CASSINI_WIDTH   = 0.04;  // gap half-width in normalised radius

const particleGeo = new THREE.SphereGeometry(1, 8, 6);
const particleMat = new THREE.MeshStandardMaterial({
  roughness: 0.55,
  metalness: 0.15,
});

/** Place a ring particle — skip the Cassini gap */
function ringRadius(t: number, inner: number, outer: number): number {
  // Push particles away from the gap
  const gap = CASSINI_CENTER;
  const hw  = CASSINI_WIDTH;
  let adj = t;
  if (adj > gap - hw && adj < gap + hw) {
    adj = adj < gap ? gap - hw : gap + hw;
  }
  return inner + adj * (outer - inner);
}

export default function WalletRing({
  ringWallets, hostRadius, selectedAddress, onSelectAddress,
}: WalletRingProps) {
  const meshRef  = useRef<THREE.InstancedMesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const count    = ringWallets.length;

  const [hoveredIdx, setHoveredIdx] = useState<number>(-1);

  const inner = hostRadius * RING_INNER_MULT;
  const outer = hostRadius * RING_OUTER_MULT;

  // Precompute positions for tooltip lookup
  const positions = useMemo(() => {
    return ringWallets.map((rp) => {
      const r = ringRadius(rp.radialT, inner, outer);
      const y = (rp.seed - 0.5) * 0.18;
      return new THREE.Vector3(
        Math.cos(rp.angle) * r,
        y,
        Math.sin(rp.angle) * r,
      );
    });
  }, [ringWallets, inner, outer]);

  // Instanced mesh setup
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || count === 0) return;

    const mat4  = new THREE.Matrix4();
    const quat  = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const rp  = ringWallets[i];
      const pos = positions[i];

      quat.setFromEuler(new THREE.Euler(rp.seed * 3, rp.hue * 5, rp.seed * 2));
      scale.setScalar(rp.size);
      mat4.compose(pos, quat, scale);
      mesh.setMatrixAt(i, mat4);
      color.setHSL(rp.hue, 0.50, 0.55);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [ringWallets, count, positions]);

  // Slow disc rotation
  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += 0.06 * delta;
  });

  const onPointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const idx = e.instanceId ?? -1;
    setHoveredIdx(idx);
    document.body.style.cursor = idx >= 0 ? "pointer" : "auto";
  }, []);

  const onPointerOut = useCallback(() => {
    setHoveredIdx(-1);
    document.body.style.cursor = "auto";
  }, []);

  const onClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const idx = e.instanceId ?? -1;
    if (idx >= 0 && idx < count) {
      onSelectAddress(ringWallets[idx].wallet.address);
    }
  }, [count, onSelectAddress, ringWallets]);

  // Dust underlayer for visual continuity
  const dustMat = useMemo(
    () => new THREE.MeshBasicMaterial({
      color: "#887755",
      transparent: true,
      opacity: 0.06,
      side: THREE.DoubleSide,
      depthWrite: false,
    }), []);

  if (count === 0) return null;

  return (
    <group ref={groupRef}
      rotation={[Math.PI * 0.44, 0, 0.15]}>

      {/* faint dust disc */}
      <mesh>
        <ringGeometry args={[inner, outer, 180]} />
        <primitive object={dustMat} attach="material" />
      </mesh>

      {/* wallet particles */}
      <instancedMesh
        ref={meshRef}
        args={[particleGeo, particleMat, count]}
        frustumCulled={false}
        onPointerMove={onPointerMove}
        onPointerOut={onPointerOut}
        onClick={onClick}
      >
        <primitive object={particleGeo} attach="geometry" />
        <primitive object={particleMat} attach="material" />
      </instancedMesh>

      {/* tooltip */}
      {hoveredIdx >= 0 && hoveredIdx < count && (
        <Html
          position={[positions[hoveredIdx].x, positions[hoveredIdx].y + 0.25, positions[hoveredIdx].z]}
          center
          zIndexRange={[100, 0]}
        >
          <WalletTooltip wallet={ringWallets[hoveredIdx].wallet} />
        </Html>
      )}
    </group>
  );
}
''').lstrip(), encoding="utf-8")
print("✓ components/WalletRing.tsx")


print("\n✅ All 3 files written!")
