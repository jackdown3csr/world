"use client";

/**
 * SaturnSystem — dedicated component for the ring-host planet.
 *
 * Renders the planet body, a multi-band ring disc (shader), wallet rock
 * particles (instanced), and moons ALL sharing a single axial tilt so
 * everything orbits in the same plane — just like real Saturn.
 */

import React, { useRef, useMemo, useState, useCallback, useEffect } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import SpriteLabel from "./SpriteLabel";
import OrbitRing from "./OrbitRing";
import * as THREE from "three";
import { MOON_GEOS } from "@/lib/geometryPool";

import type { PlanetData, MoonData, RingParticleData } from "@/lib/layout";
import { createSaturnRingMaterial } from "@/lib/shaders/saturnRingShader";
import { createMoonMaterial } from "@/lib/shaders/moonShader";
import type { MoonType } from "@/lib/shaders/moonShader";

/** Subtle orbit-ring tint per moon type */
const MOON_TYPE_ORBIT_COLORS: Record<MoonType, string> = {
  0: "#667788",   // Luna — grey
  1: "#7799bb",   // Europa — icy blue
  2: "#aa8844",   // Io — sulfur warm
  3: "#556655",   // Callisto — dark earthy
  4: "#6688aa",   // Ganymede — blue-grey
  5: "#aa7744",   // Titan — amber
};
import { type HoveredWalletInfo } from "./WalletTooltip";
import { registerSceneObject, unregisterSceneObject, registerInstancedSceneObject, unregisterInstancedSceneObject } from "@/lib/sceneRegistry";

/* ── Constants ────────────────────────────────────────────── */

/** Axial tilt for the entire Saturn system (~27°, like real Saturn) */
const SATURN_AXIAL_TILT = 0.47;

/** Ring bounds as multiples of host planet radius */
const RING_INNER_MULT = 1.20;
const RING_OUTER_MULT = 3.95;

/** Number of rock geometry variants for instanced particles */
const N_ROCK_VARIANTS = 7;

/* ── Rock geometry (reused from WalletRing logic) ─────────── */

function makeRockGeo(variantIdx: number): THREE.BufferGeometry {
  let s = variantIdx * 7919 + 1;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const gx = 0.55 + rnd() * 0.9;
  const gy = 0.30 + rnd() * 0.65;
  const gz = 0.55 + rnd() * 0.9;
  for (let i = 0; i < pos.count; i++) {
    const d = 0.65 + rnd() * 0.70;
    pos.setXYZ(i, pos.getX(i) * gx * d, pos.getY(i) * gy * d, pos.getZ(i) * gz * d);
  }
  geo.computeVertexNormals();
  return geo;
}

const ROCK_GEOS = Array.from({ length: N_ROCK_VARIANTS }, (_, i) => makeRockGeo(i));
const ROCK_MAT  = new THREE.MeshStandardMaterial({ roughness: 0.90, metalness: 0.05 });

/* ── Gap-aware radius mapping ─────────────────────────────── */

/**
 * Map a particle's radialT (0-1) to an actual radius, pushing particles
 * out of the Cassini Division and moon-orbit gaps.
 */
function saturnRingRadius(
  t:          number,
  inner:      number,
  outer:      number,
  moonOrbits: number[],
): number {
  const span = outer - inner;
  let r = inner + t * span;

  // Cassini Division: centered at 58.5% of span
  const cassiniC  = inner + 0.5825 * span;
  const cassiniHW = 0.038 * span;
  if (r > cassiniC - cassiniHW && r < cassiniC + cassiniHW) {
    r = r < cassiniC ? cassiniC - cassiniHW : cassiniC + cassiniHW;
  }

  // Moon-orbit gaps
  for (const mo of moonOrbits) {
    const gapHW = 0.035 * span;
    if (r > mo - gapHW && r < mo + gapHW) {
      r = r < mo ? mo - gapHW : mo + gapHW;
    }
  }

  return Math.max(inner, Math.min(outer, r));
}

/* ── Props ────────────────────────────────────────────────── */

interface SaturnSystemProps {
  data:             PlanetData;       // full planet data (moons + ringWallets)
  starWorldPosition: [number, number, number];
  selectedAddress:  string | null;
  onSelectAddress:  (address: string) => void;
  onDeselect:       () => void;
  panelOpen?:       boolean;
  showMoonLabels?:  boolean;
  showRingLabels?:  boolean;
  showRenamedOnly?: boolean;
  interactionEnabled?: boolean;
  paused?:          boolean;
  showOrbits?:      boolean;
  /** System prefix for scene registry keys, e.g. "vescrow". When set, registers as "prefix:0x...". */
  sceneIdPrefix?: string;
  onHoverWallet?: (info: HoveredWalletInfo | null) => void;
}

/* ── Component ────────────────────────────────────────────── */

export default function SaturnSystem({
  data,
  starWorldPosition,
  selectedAddress,
  onSelectAddress,
  onDeselect,
  panelOpen,
  showMoonLabels,
  showRingLabels,
  showRenamedOnly,
  interactionEnabled = true,
  paused = false,
  showOrbits = true,
  sceneIdPrefix,
  onHoverWallet,
}: SaturnSystemProps) {

  const hostR  = data.radius;
  const inner  = hostR * RING_INNER_MULT;
  const outer  = hostR * RING_OUTER_MULT;
  const moons  = data.moons;
  const ringWallets = data.ringWallets;
  const count  = ringWallets.length;
  const simTimeRef = useRef(0);
  const starWorldPos = useMemo(
    () => new THREE.Vector3(starWorldPosition[0], starWorldPosition[1], starWorldPosition[2]),
    [starWorldPosition],
  );

  /* ── Refs ── */
  const ringGroupRef  = useRef<THREE.Group>(null);       // slow rotation for ring + particles
  const hostGroupRef  = useRef<THREE.Group>(null);       // for tracking planet world position (shadow)
  const moonOrbitRefs = useRef<(THREE.Group | null)[]>([]); // per-moon orbit group
  const moonMeshRefs  = useRef<(THREE.Mesh | null)[]>([]);  // per-moon mesh (self-rotation)
  const rockMeshRefs  = useRef<(THREE.InstancedMesh | null)[]>([]);

  /** Reusable vector for world-pos extraction */
  const hostWorldPos = useMemo(() => new THREE.Vector3(), []);

  /* ── Hover / selection state ── */
  const [hoveredRingIdx, setHoveredRingIdx]   = useState(-1);
  const [hoveredMoonIdx, setHoveredMoonIdx]   = useState(-1);
  // Proximity-based orbit ring opacity for Saturn moons (quantised to avoid churn)
  const [moonOrbitOpacity, setMoonOrbitOpacity] = useState(0);
  const prevMoonOpacityBand = useRef(-1);

  /* ── Moon orbit radii (for gap computation) ── */
  const moonOrbits = useMemo(() => moons.map(m => m.orbitRadius), [moons]);

  /* ── Ring disc shader material ── */
  const ringDiscMat = useMemo(
    () => createSaturnRingMaterial(inner, outer, moonOrbits, data.seed),
    [inner, outer, moonOrbits, data.seed],
  );

  /* ── Moon shader materials ── */
  const moonMaterials = useMemo(
    () => moons.map(m => createMoonMaterial(m.moonType, m.hue, m.seed)),
    [moons],
  );

  /* ── Moon LOD (shared unit-sphere pool, scaled by mesh.scale) ── */
  const _lodPos = useMemo(() => new THREE.Vector3(), []);
  const moonLodRefs = useRef<number[]>([]);
  useEffect(() => {
    moonLodRefs.current = moons.map(() => 0);
  }, [moons]);

  /* ── Ring particle positions (XZ plane, gap-aware) ── */
  const positions = useMemo(() => ringWallets.map(rp => {
    const r = saturnRingRadius(rp.radialT, inner, outer, moonOrbits);
    const y = (rp.seed - 0.5) * 0.16;   // slight vertical scatter
    return new THREE.Vector3(Math.cos(rp.angle) * r, y, Math.sin(rp.angle) * r);
  }), [ringWallets, inner, outer, moonOrbits]);

  /* ── Variant groups (same logic as WalletRing) ── */
  const variantGroups = useMemo(() => {
    const groups: number[][] = Array.from({ length: N_ROCK_VARIANTS }, () => []);
    ringWallets.forEach((rp, gi) => {
      groups[Math.floor(rp.hue * N_ROCK_VARIANTS) % N_ROCK_VARIANTS].push(gi);
    });
    return groups;
  }, [ringWallets]);

  /* ── Build instanced matrices + colours ── */
  useEffect(() => {
    const mat4  = new THREE.Matrix4();
    const color = new THREE.Color();
    variantGroups.forEach((globalIndices, v) => {
      const mesh = rockMeshRefs.current[v];
      if (!mesh || globalIndices.length === 0) return;
      globalIndices.forEach((gi, localId) => {
        const rp  = ringWallets[gi];
        const pos = positions[gi];
        const sx = rp.size;
        const sy = rp.size * (0.55 + rp.seed * 0.45);
        const sz = rp.size * (0.60 + rp.hue  * 0.55);
        const quat = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(rp.seed * 4.1, rp.hue * 6.3, rp.seed * 2.7),
        );
        mat4.compose(pos, quat, new THREE.Vector3(sx, sy, sz));
        mesh.setMatrixAt(localId, mat4);
        color.setHSL(rp.hue, 0.30 + rp.seed * 0.30, 0.40 + rp.seed * 0.28);
        mesh.setColorAt(localId, color);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }, [ringWallets, positions, variantGroups]);

  // Register ring particles in the scene registry for camera targeting
  useEffect(() => {
    const ids: string[] = [];
    variantGroups.forEach((globalIndices, v) => {
      const mesh = rockMeshRefs.current[v];
      if (!mesh) return;
      globalIndices.forEach((gi, localIdx) => {
        const rawAddr = ringWallets[gi].wallet.address.toLowerCase();
        const id = sceneIdPrefix ? `${sceneIdPrefix}:${rawAddr}` : rawAddr;
        registerInstancedSceneObject(id, mesh, localIdx, "ring");
        ids.push(id);
      });
    });
    return () => { ids.forEach(unregisterInstancedSceneObject); };
  }, [ringWallets, variantGroups, sceneIdPrefix]);

  // Register moons in the scene registry for camera targeting
  useEffect(() => {
    const ids: string[] = [];
    moons.forEach((moon, i) => {
      const mesh = moonMeshRefs.current[i];
      if (!mesh) return;
      const rawAddr = moon.wallet.address.toLowerCase();
      const id = sceneIdPrefix ? `${sceneIdPrefix}:${rawAddr}` : rawAddr;
      registerSceneObject(id, mesh, moon.radius, "moon");
      ids.push(id);
    });
    return () => { ids.forEach(unregisterSceneObject); };
  }, [moons, sceneIdPrefix]);

  /* ── Label proximity tracking ── */
  const { camera } = useThree();
  const [nearIndices, setNearIndices] = useState<Set<number>>(new Set());
  const LABEL_DIST = 35;

  /* ── Animation frame ── */
  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 1 / 30);
    if (!paused) simTimeRef.current += delta;
    const t = simTimeRef.current;
    // Ring disc + particles: slow rotation
    if (ringGroupRef.current) ringGroupRef.current.rotation.y = 0.008 * t;

    // Moon orbits + self-rotation + LOD
    moons.forEach((moon, i) => {
      const orbitGrp = moonOrbitRefs.current[i];
      if (orbitGrp) orbitGrp.rotation.y = moon.initialAngle + moon.orbitSpeed * t;
      const mesh = moonMeshRefs.current[i];
      if (mesh) {
        mesh.rotation.y = moon.seed * 6.28 + 0.06 * t;
        // LOD swap
        mesh.getWorldPosition(_lodPos);
        const d = _lodPos.distanceTo(state.camera.position);
        const lod = d < 50 ? 0 : d < 200 ? 1 : 2;
        if (moonLodRefs.current[i] !== lod) {
          moonLodRefs.current[i] = lod;
          mesh.geometry = MOON_GEOS[lod];
        }
      }
    });

    // Moon materials time + host shadow uniforms
    if (hostGroupRef.current) {
      hostGroupRef.current.getWorldPosition(hostWorldPos);
    }
    moonMaterials.forEach(mat => {
      mat.uniforms.uTime.value = t;
      mat.uniforms.uHostPos.value.copy(hostWorldPos);
      mat.uniforms.uHostRadius.value = hostR;
      mat.uniforms.uStarPos.value.copy(starWorldPos);
    });

    // Proximity fade for moon orbit rings
    const camDist = hostWorldPos.distanceTo(state.camera.position);
    const raw = camDist < 50 ? 0.12 : camDist > 120 ? 0 : 0.12 * (1 - (camDist - 50) / 70);
    const band = Math.round(raw * 20);
    if (band !== prevMoonOpacityBand.current) {
      prevMoonOpacityBand.current = band;
      setMoonOrbitOpacity(band / 20);
    }

    // Ring disc time
    ringDiscMat.uniforms.uTime.value = t;
    ringDiscMat.uniforms.uStarPos.value.copy(starWorldPos);

    // Proximity check for ring labels (throttled)
    if (ringGroupRef.current && Math.random() < 0.17) {
      const wp   = new THREE.Vector3();
      const near = new Set<number>();
      for (let i = 0; i < count; i++) {
        wp.copy(positions[i]);
        ringGroupRef.current.localToWorld(wp);
        if (wp.distanceTo(camera.position) < LABEL_DIST) near.add(i);
      }
      setNearIndices(near);
    }
  });

  /* ── Ring particle event handlers ── */
  const makeRockPointerMove = useCallback(
    (v: number) => (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      const localId = e.instanceId ?? -1;
      if (localId >= 0 && localId < variantGroups[v].length) {
        const gi = variantGroups[v][localId];
        setHoveredRingIdx(gi);
        onHoverWallet?.({ wallet: ringWallets[gi].wallet });
        document.body.style.cursor = "pointer";
      }
    },
    [variantGroups, onHoverWallet, ringWallets],
  );
  const onRockPointerOut = useCallback(() => {
    setHoveredRingIdx(-1);
    onHoverWallet?.(null);
    document.body.style.cursor = "auto";
  }, [onHoverWallet]);
  const makeRockClick = useCallback(
    (v: number) => (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      const localId = e.instanceId ?? -1;
      if (localId >= 0 && localId < variantGroups[v].length) {
        onSelectAddress(ringWallets[variantGroups[v][localId]].wallet.address);
      }
    },
    [variantGroups, ringWallets, onSelectAddress],
  );

  /* ── Moon event handlers ── */
  const onMoonEnter = useCallback((idx: number) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation(); setHoveredMoonIdx(idx); document.body.style.cursor = "pointer";
    onHoverWallet?.({ wallet: moons[idx].wallet });
  }, [onHoverWallet, moons]);
  const onMoonLeave = useCallback(() => {
    setHoveredMoonIdx(-1); document.body.style.cursor = "auto";
    onHoverWallet?.(null);
  }, [onHoverWallet]);
  const onMoonClick = useCallback((idx: number) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation(); onSelectAddress(moons[idx].wallet.address);
  }, [moons, onSelectAddress]);

  /* ── Dust disc material ── */
  const dustMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: "#887755",
    transparent: true,
    opacity: 0.018,
    side: THREE.DoubleSide,
    depthWrite: false,
  }), []);

  if (count === 0 && moons.length === 0) return null;

  return (
    /* Single axial tilt for the entire ring + moon system */
    <group rotation={[SATURN_AXIAL_TILT, 0, 0]}>

      {/* Invisible anchor at planet center — used to extract world position for shadow */}
      <group ref={hostGroupRef} />

      {/* ═══════════════  RING DISC + PARTICLES  ═══════════════ */}
      <group ref={ringGroupRef}>

        {/* Visual ring disc (shader) — RingGeometry is XY, rotate to XZ */}
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[inner, outer, 360, 12]} />
          <primitive object={ringDiscMat} attach="material" />
        </mesh>

        {/* Faint dust fill (same as original WalletRing) */}
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[inner, outer, 180]} />
          <primitive object={dustMat} attach="material" />
        </mesh>

        {/* Instanced rock meshes — one per variant */}
        {ROCK_GEOS.map((geo, v) => {
          const vCount = variantGroups[v].length;
          if (vCount === 0) return null;
          return (
            <instancedMesh
              key={v}
              ref={el => { rockMeshRefs.current[v] = el; }}
              args={[geo, ROCK_MAT, vCount]}
              userData={{
                bodyType: "ring",
                walletAddresses: variantGroups[v].map(gi =>
                  ringWallets[gi].wallet.address.toLowerCase()),
              }}
              frustumCulled={false}
              onPointerOver={interactionEnabled ? makeRockPointerMove(v) : undefined}
              onPointerMove={interactionEnabled ? makeRockPointerMove(v) : undefined}
              onPointerOut={interactionEnabled ? onRockPointerOut : undefined}
              onClick={interactionEnabled ? makeRockClick(v) : undefined}
            >
              <primitive object={geo} attach="geometry" />
              <primitive object={ROCK_MAT} attach="material" />
            </instancedMesh>
          );
        })}

        {/* Ring-particle tooltip — now in WalletInfoBanner */}

        {/* Ring-particle persistent labels */}
        {ringWallets.map((rp, i) => {
          if (hoveredRingIdx === i) return null;
          const isSelected = selectedAddress?.toLowerCase() === rp.wallet.address.toLowerCase();
          const isNear     = nearIndices.has(i);
          const isRenamed  = !showRenamedOnly || !!rp.wallet.customName;
          if (!isSelected && !(showRingLabels && (isNear || isRenamed))) return null;
          const pos   = positions[i];
          const label = rp.wallet.customName
            || `${rp.wallet.address.slice(0, 6)}\u2026${rp.wallet.address.slice(-4)}`;
          return (
            <SpriteLabel
              key={rp.wallet.address}
              position={[pos.x, pos.y + rp.size + 0.12, pos.z]}
              text={label}
              color={isSelected ? "#b0e0ff" : "#80a8b8"}
              fontSize={isSelected ? 0.35 : 0.25}
              opacity={isSelected ? 1.0 : 0.65}
              onClick={interactionEnabled ? () => onSelectAddress(rp.wallet.address) : undefined}
            />
          );
        })}
      </group>

      {/* ═══════════════  MOONS  ═══════════════════════════════ */}
      {/* Each moon orbits in XZ plane — SAME plane as ring disc */}      {/* Moon orbit rings — proximity-faded, type-tinted */}
      {showOrbits && moonOrbitOpacity > 0 && moons.map((moon) => (
        <OrbitRing
          key={`orbit-${moon.wallet.address}`}
          radius={moon.orbitRadius}
          color={MOON_TYPE_ORBIT_COLORS[moon.moonType]}
          opacity={moonOrbitOpacity}
        />
      ))}      {moons.map((moon, i) => {
        const isMoonSelected = selectedAddress?.toLowerCase() === moon.wallet.address.toLowerCase();
        const isMoonHovered  = hoveredMoonIdx === i;
        return (
          <group
            key={moon.wallet.address + i}
            ref={el => { moonOrbitRefs.current[i] = el; }}
          >
            <mesh
              ref={el => { moonMeshRefs.current[i] = el; }}
              position={[moon.orbitRadius, 0, 0]}
              scale={moon.radius}
              userData={{
                walletAddress: moon.wallet.address.toLowerCase(),
                bodyRadius: moon.radius,
                bodyType: "moon",
              }}
              onPointerEnter={interactionEnabled ? onMoonEnter(i) : undefined}
              onPointerLeave={interactionEnabled ? onMoonLeave : undefined}
              onClick={interactionEnabled ? onMoonClick(i) : undefined}
            >
              <primitive object={MOON_GEOS[0]} attach="geometry" />
              <primitive object={moonMaterials[i]} attach="material" />
            </mesh>

            {/* Moon tooltip — now in WalletInfoBanner */}

            {/* Moon persistent label */}
            {showMoonLabels && (!showRenamedOnly || moon.wallet.customName) && !isMoonHovered && (
              <SpriteLabel
                position={[moon.orbitRadius, moon.radius + 0.15, 0]}
                text={moon.wallet.customName || `${moon.wallet.address.slice(0, 6)}\u2026${moon.wallet.address.slice(-4)}`}
                color={isMoonSelected ? "#b0e0ff" : "#80a8b8"}
                fontSize={isMoonSelected ? 0.35 : 0.3}
                opacity={isMoonSelected ? 1.0 : 0.8}
                onClick={interactionEnabled ? () => onSelectAddress(moon.wallet.address) : undefined}
              />
            )}
          </group>
        );
      })}
    </group>
  );
}
