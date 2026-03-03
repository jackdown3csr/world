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
import { Html } from "@react-three/drei";
import * as THREE from "three";

import type { PlanetData, MoonData, RingParticleData } from "@/lib/layout";
import { createSaturnRingMaterial } from "@/lib/shaders/saturnRingShader";
import { createMoonMaterial } from "@/lib/shaders/moonShader";
import WalletTooltip from "./WalletTooltip";

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
    const gapHW = 0.022 * span;
    if (r > mo - gapHW && r < mo + gapHW) {
      r = r < mo ? mo - gapHW : mo + gapHW;
    }
  }

  return Math.max(inner, Math.min(outer, r));
}

/* ── Props ────────────────────────────────────────────────── */

interface SaturnSystemProps {
  data:             PlanetData;       // full planet data (moons + ringWallets)
  selectedAddress:  string | null;
  onSelectAddress:  (address: string) => void;
  onDeselect:       () => void;
  panelOpen?:       boolean;
  showMoonLabels?:  boolean;
  showRingLabels?:  boolean;
  showRenamedOnly?: boolean;
}

/* ── Component ────────────────────────────────────────────── */

export default function SaturnSystem({
  data,
  selectedAddress,
  onSelectAddress,
  onDeselect,
  panelOpen,
  showMoonLabels,
  showRingLabels,
  showRenamedOnly,
}: SaturnSystemProps) {

  const hostR  = data.radius;
  const inner  = hostR * RING_INNER_MULT;
  const outer  = hostR * RING_OUTER_MULT;
  const moons  = data.moons;
  const ringWallets = data.ringWallets;
  const count  = ringWallets.length;

  /* ── Refs ── */
  const ringGroupRef  = useRef<THREE.Group>(null);       // slow rotation for ring + particles
  const moonOrbitRefs = useRef<(THREE.Group | null)[]>([]); // per-moon orbit group
  const moonMeshRefs  = useRef<(THREE.Mesh | null)[]>([]);  // per-moon mesh (self-rotation)
  const rockMeshRefs  = useRef<(THREE.InstancedMesh | null)[]>([]);

  /* ── Hover / selection state ── */
  const [hoveredRingIdx, setHoveredRingIdx]   = useState(-1);
  const [hoveredMoonIdx, setHoveredMoonIdx]   = useState(-1);

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

  /* ── Label proximity tracking ── */
  const { camera } = useThree();
  const [nearIndices, setNearIndices] = useState<Set<number>>(new Set());
  const LABEL_DIST = 35;

  /* ── Animation frame ── */
  useFrame((state, delta) => {
    // Ring disc + particles: slow rotation
    if (ringGroupRef.current) ringGroupRef.current.rotation.y += 0.008 * delta;

    // Moon orbits + self-rotation
    moons.forEach((moon, i) => {
      const orbitGrp = moonOrbitRefs.current[i];
      if (orbitGrp) orbitGrp.rotation.y += moon.orbitSpeed * delta;
      const mesh = moonMeshRefs.current[i];
      if (mesh) mesh.rotation.y += 0.06 * delta;
    });

    // Moon materials time
    moonMaterials.forEach(mat => {
      mat.uniforms.uTime.value = state.clock.elapsedTime;
    });

    // Ring disc time
    ringDiscMat.uniforms.uTime.value = state.clock.elapsedTime;

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
        setHoveredRingIdx(variantGroups[v][localId]);
        document.body.style.cursor = "pointer";
      }
    },
    [variantGroups],
  );
  const onRockPointerOut = useCallback(() => {
    setHoveredRingIdx(-1);
    document.body.style.cursor = "auto";
  }, []);
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
  }, []);
  const onMoonLeave = useCallback(() => {
    setHoveredMoonIdx(-1); document.body.style.cursor = "auto";
  }, []);
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
              onPointerMove={makeRockPointerMove(v)}
              onPointerOut={onRockPointerOut}
              onClick={makeRockClick(v)}
            >
              <primitive object={geo} attach="geometry" />
              <primitive object={ROCK_MAT} attach="material" />
            </instancedMesh>
          );
        })}

        {/* Ring-particle tooltip */}
        {hoveredRingIdx >= 0 && hoveredRingIdx < count && (
          <Html
            position={[
              positions[hoveredRingIdx].x,
              positions[hoveredRingIdx].y + 0.25,
              positions[hoveredRingIdx].z,
            ]}
            center
            zIndexRange={[10000, 0]}
            style={{ pointerEvents: "none" }}
          >
            <WalletTooltip wallet={ringWallets[hoveredRingIdx].wallet} />
          </Html>
        )}

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
            <Html
              key={rp.wallet.address}
              position={[pos.x, pos.y + rp.size + 0.12, pos.z]}
              center
              zIndexRange={[isSelected ? 9000 : 4500, 0]}
              style={{ pointerEvents: "none" }}
            >
              <div style={{
                color:      isSelected ? "#a0d8ff" : "#506878",
                fontSize:   isSelected ? 9 : 7,
                fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
                fontWeight: isSelected ? 700 : 500,
                whiteSpace: "nowrap",
                textShadow: "0 0 6px rgba(0,0,0,0.95), 0 0 12px rgba(0,0,0,0.7)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                opacity:    isSelected ? 1.0 : 0.65,
              }}>
                {label}
              </div>
            </Html>
          );
        })}
      </group>

      {/* ═══════════════  MOONS  ═══════════════════════════════ */}
      {/* Each moon orbits in XZ plane — SAME plane as ring disc */}
      {moons.map((moon, i) => {
        const isMoonSelected = selectedAddress?.toLowerCase() === moon.wallet.address.toLowerCase();
        const isMoonHovered  = hoveredMoonIdx === i;
        return (
          <group
            key={moon.wallet.address + i}
            ref={el => { moonOrbitRefs.current[i] = el; }}
            rotation-y={moon.initialAngle}
          >
            <mesh
              ref={el => { moonMeshRefs.current[i] = el; }}
              position={[moon.orbitRadius, 0, 0]}
              userData={{
                walletAddress: moon.wallet.address.toLowerCase(),
                bodyRadius: moon.radius,
                bodyType: "moon",
              }}
              onPointerEnter={onMoonEnter(i)}
              onPointerLeave={onMoonLeave}
              onClick={onMoonClick(i)}
            >
              <sphereGeometry args={[moon.radius, 64, 64]} />
              <primitive object={moonMaterials[i]} attach="material" />
            </mesh>

            {/* Moon tooltip */}
            {(isMoonHovered || (isMoonSelected && panelOpen)) && (
              <Html
                position={[moon.orbitRadius, moon.radius + 0.18, 0]}
                center
                zIndexRange={[10000, 0]}
                style={{ pointerEvents: (isMoonSelected && panelOpen) ? "auto" : "none" }}
              >
                <WalletTooltip
                  wallet={moon.wallet}
                  onClose={(isMoonSelected && panelOpen) ? onDeselect : undefined}
                />
              </Html>
            )}

            {/* Moon persistent label */}
            {showMoonLabels && (!showRenamedOnly || moon.wallet.customName) && !isMoonHovered && !(isMoonSelected && panelOpen) && (
              <Html
                position={[moon.orbitRadius, moon.radius + 0.15, 0]}
                center
                zIndexRange={[5000, 0]}
                style={{ pointerEvents: "none" }}
              >
                <div style={{
                  color: "#506878",
                  fontSize: 8,
                  fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  textShadow: "0 0 6px rgba(0,0,0,0.95), 0 0 14px rgba(0,0,0,0.7)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  opacity: 0.8,
                }}>
                  {moon.wallet.customName || `${moon.wallet.address.slice(0, 6)}\u2026${moon.wallet.address.slice(-4)}`}
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
}
