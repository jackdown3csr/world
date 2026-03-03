"use client";

import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

import type { AsteroidData } from "@/lib/layout";
import WalletTooltip from "./WalletTooltip";
import OrbitRing from "./OrbitRing";

/* ── Potato geometry variants ────────────────────────────────────────────── */

const N_VARIANTS = 12;

/**
 * Build a smooth potato/egg-shaped geometry.
 * - Subdivision 2 icosahedron (80 faces) → smooth rounded surface
 * - Strong anisotropic global squash → elongated potato
 * - Mild per-vertex bumps → irregular skin
 * - computeVertexNormals → smooth Phong-like shading (not faceted)
 */
function makePotatoGeo(variantIdx: number): THREE.BufferGeometry {
  let s = variantIdx * 5381 + 31337;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };

  // IcosahedronGeometry(1,2) → 80 triangular faces, nice and round
  const geo = new THREE.IcosahedronGeometry(1, 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;

  // Per-variant global shape: elongated on one axis (potato proportions)
  // gx,gz ≈ 1.0, gy ≈ 0.55–0.75 (slightly flattened), then one axis stretched
  const elongAxis = Math.floor(rnd() * 3);  // 0=X, 1=Y, 2=Z gets elongated
  const elong = 1.5 + rnd() * 0.8;          // 1.5 – 2.3 elongation
  const flat  = 0.50 + rnd() * 0.35;        // 0.50 – 0.85 short axis
  const mid   = 0.70 + rnd() * 0.25;        // 0.70 – 0.95 middle axis

  const gx = elongAxis === 0 ? elong : elongAxis === 2 ? mid : flat;
  const gy = elongAxis === 1 ? elong : elongAxis === 0 ? mid : flat;
  const gz = elongAxis === 2 ? elong : elongAxis === 1 ? mid : flat;

  // Per-vertex gentle bumps (0.88 – 1.10) — potato skin texture
  for (let i = 0; i < pos.count; i++) {
    const d = 0.88 + rnd() * 0.22;
    pos.setXYZ(i,
      pos.getX(i) * gx * d,
      pos.getY(i) * gy * d,
      pos.getZ(i) * gz * d,
    );
  }
  geo.computeVertexNormals();   // smooth normals → no hard facet edges
  return geo;
}

const POTATO_GEOS = Array.from({ length: N_VARIANTS }, (_, i) => makePotatoGeo(i));

// Slightly lighter roughness for a dusty rock look
const POTATO_MAT = new THREE.MeshStandardMaterial({
  roughness: 0.87,
  metalness: 0.04,
});

/* ── Component ────────────────────────────────────────────── */

interface AsteroidBeltProps {
  asteroids: AsteroidData[];
  beltInnerRadius: number;
  beltOuterRadius: number;
  selectedAddress: string | null;
  onSelectAddress: (address: string) => void;
  onDeselect: () => void;
  panelOpen?: boolean;
  showAllNames?: boolean;
  showRenamedOnly?: boolean;
  showOrbits?: boolean;
}

export default function AsteroidBelt({
  asteroids,
  beltInnerRadius,
  beltOuterRadius,
  selectedAddress,
  onSelectAddress,
  onDeselect,
  panelOpen,
  showAllNames,
  showRenamedOnly,
  showOrbits = true,
}: AsteroidBeltProps) {
  const groupRef = useRef<THREE.Group>(null);
  const count    = asteroids.length;

  // Global index into `asteroids` of the currently hovered item
  const [hoveredGlobalIdx, setHoveredGlobalIdx] = useState<number>(-1);

  // Split asteroids into variant buckets using precomputed .variant field
  const variantGroups = useMemo(() => {
    const groups: number[][] = Array.from({ length: N_VARIANTS }, () => []);
    asteroids.forEach((a, gi) => {
      groups[a.variant % N_VARIANTS].push(gi);
    });
    return groups;
  }, [asteroids]);

  // Per-variant instanced mesh refs
  const meshRefs = useRef<(THREE.InstancedMesh | null)[]>([]);

  // Build instance matrices + colors
  useEffect(() => {
    const mat4  = new THREE.Matrix4();
    const color = new THREE.Color();

    variantGroups.forEach((globalIndices, v) => {
      const mesh = meshRefs.current[v];
      if (!mesh || globalIndices.length === 0) return;

      globalIndices.forEach((gi, localId) => {
        const a   = asteroids[gi];
        const pos = new THREE.Vector3(a.position[0], a.position[1], a.position[2]);

        // Per-instance non-uniform scale on top of the already-elongated geo
        // → every single asteroid looks unique
        const base = a.size;
        const sx   = base * (0.75 + a.seed  * 0.55);   // 0.75 – 1.30 × base
        const sy   = base * (0.45 + a.hue   * 0.55);   // 0.45 – 1.00 × base (flatter)
        const sz   = base * (0.80 + a.seed  * 0.65);   // 0.80 – 1.45 × base

        const quat = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(
            a.hue  * Math.PI * 2,
            a.seed * Math.PI * 3.1,
            a.hue  * Math.PI,
          )
        );
        mat4.compose(pos, quat, new THREE.Vector3(sx, sy, sz));
        mesh.setMatrixAt(localId, mat4);

        // Muted brownish-grey tones typical for C/S/M type asteroids
        const lightness = 0.30 + a.seed * 0.22;
        const sat       = 0.12 + a.hue  * 0.18;
        const hueAngle  = 0.07 + a.hue  * 0.06;  // narrow warm brown range
        color.setHSL(hueAngle, sat, lightness);
        mesh.setColorAt(localId, color);
      });

      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }, [asteroids, variantGroups]);

  /* ── Slow belt rotation ─────────────────────────────────── */
  useFrame((state) => {
    if (groupRef.current) groupRef.current.rotation.y = 0.002 * state.clock.elapsedTime;
  });

  /* ── Event handlers (per variant) ───────────────────────── */
  const makePointerMove = useCallback(
    (v: number) => (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      const localId = e.instanceId ?? -1;
      if (localId >= 0 && localId < variantGroups[v].length) {
        setHoveredGlobalIdx(variantGroups[v][localId]);
        document.body.style.cursor = "pointer";
      }
    },
    [variantGroups],
  );

  const onPointerLeave = useCallback(() => {
    setHoveredGlobalIdx(-1);
    document.body.style.cursor = "auto";
  }, []);

  const makeClick = useCallback(
    (v: number) => (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      const localId = e.instanceId ?? -1;
      if (localId >= 0 && localId < variantGroups[v].length) {
        onSelectAddress(asteroids[variantGroups[v][localId]].wallet.address);
      }
    },
    [variantGroups, asteroids, onSelectAddress],
  );

  const selectedIndex = selectedAddress
    ? asteroids.findIndex(
        (a) => a.wallet.address.toLowerCase() === selectedAddress.toLowerCase(),
      )
    : -1;

  const activeIndex   = selectedIndex >= 0 ? selectedIndex
                       : hoveredGlobalIdx >= 0 && hoveredGlobalIdx < count ? hoveredGlobalIdx
                       : -1;
  const activeAsteroid = activeIndex >= 0 ? asteroids[activeIndex] : null;

  return (
    <group ref={groupRef}>
      {/* Belt boundary orbit rings */}
      {showOrbits && beltInnerRadius > 0 && (
        <>
          <OrbitRing radius={beltInnerRadius} tilt={0} color="#443322" opacity={0.12} />
          <OrbitRing radius={beltOuterRadius} tilt={0} color="#443322" opacity={0.12} />
        </>
      )}

      {/* Subtle dust ring */}
      {beltInnerRadius > 0 && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[beltInnerRadius, beltOuterRadius, 128]} />
          <meshBasicMaterial
            color="#443322"
            opacity={0.06}
            transparent
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* One InstancedMesh per potato-shape variant */}
      {POTATO_GEOS.map((geo, v) => {
        const vCount = variantGroups[v].length;
        if (vCount === 0) return null;
        return (
          <instancedMesh
            key={v}
            ref={el => { meshRefs.current[v] = el; }}
            args={[geo, POTATO_MAT, vCount]}
            userData={{
              bodyType: "asteroid",
              walletAddresses: variantGroups[v].map(gi =>
                asteroids[gi].wallet.address.toLowerCase()),
            }}
            frustumCulled={false}
            onPointerMove={makePointerMove(v)}
            onPointerLeave={onPointerLeave}
            onClick={makeClick(v)}
          >
            <primitive object={geo} attach="geometry" />
            <primitive object={POTATO_MAT} attach="material" />
          </instancedMesh>
        );
      })}

      {/* Tooltip */}
      {activeAsteroid && (selectedIndex < 0 || panelOpen) && (
        <Html
          position={activeAsteroid.position}
          center
          zIndexRange={[10000, 0]}
          style={{ pointerEvents: (selectedIndex >= 0 && panelOpen) ? "auto" : "none" }}
        >
          <WalletTooltip
            wallet={activeAsteroid.wallet}
            onClose={(selectedIndex >= 0 && panelOpen) ? onDeselect : undefined}
          />
        </Html>
      )}

      {/* Persistent name labels (only named asteroids) */}
      {showAllNames && asteroids.map((a, i) => {
        if (showRenamedOnly && !a.wallet.customName) return null;
        if (!showRenamedOnly && !a.wallet.customName) return null;
        if (activeIndex === i) return null;
        return (
          <Html
            key={a.wallet.address}
            position={a.position}
            center
            zIndexRange={[4000, 0]}
            style={{ pointerEvents: "none" }}
          >
            <div style={{
              color: "#405868",
              fontSize: 8,
              fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
              fontWeight: 500,
              whiteSpace: "nowrap",
              textShadow: "0 0 6px rgba(0,0,0,0.95)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              opacity: 0.7,
            }}>
              {a.wallet.customName}
            </div>
          </Html>
        );
      })}
    </group>
  );
}
