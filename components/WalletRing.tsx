"use client";

import React, { useRef, useMemo, useEffect, useState, useCallback } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { RingParticleData } from "@/lib/layout";
import WalletTooltip from "./WalletTooltip";

interface WalletRingProps {
  ringWallets:     RingParticleData[];
  hostRadius:      number;
  selectedAddress: string | null;
  onSelectAddress: (address: string) => void;
  showLabels?:     boolean;
  showRenamedOnly?: boolean;
}

const RING_INNER_MULT = 1.6;   // inner edge = hostRadius × this
const RING_OUTER_MULT = 4.2;   // outer edge = hostRadius × this
const CASSINI_CENTER  = 0.58;  // fraction where Cassini gap sits
const CASSINI_WIDTH   = 0.04;  // gap half-width in normalised radius

// ── Rock geometry variants ─────────────────────────────────────────────────
const N_VARIANTS = 7;

/**
 * Build an irregular rock-chunk geometry by displacing each vertex of a
 * low-poly icosahedron both globally (anisotropic squash) and per-vertex.
 * Keeps the mesh indexed so it is watertight with sharp faceted edges.
 */
function makeRockGeo(variantIdx: number): THREE.BufferGeometry {
  let s = variantIdx * 7919 + 1;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };

  // IcosahedronGeometry(1,0) → 12 unique verts, 20 triangular faces
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const pos = geo.attributes.position as THREE.BufferAttribute;

  // Per-variant anisotropic squash → flattened / elongated / oblate
  const gx = 0.55 + rnd() * 0.9;
  const gy = 0.30 + rnd() * 0.65;
  const gz = 0.55 + rnd() * 0.9;

  // Per-vertex random scale → bumpy, uneven surface
  for (let i = 0; i < pos.count; i++) {
    const d = 0.65 + rnd() * 0.70;
    pos.setXYZ(i,
      pos.getX(i) * gx * d,
      pos.getY(i) * gy * d,
      pos.getZ(i) * gz * d,
    );
  }
  geo.computeVertexNormals();
  return geo;
}

const ROCK_GEOS = Array.from({ length: N_VARIANTS }, (_, i) => makeRockGeo(i));

// Shared material — per-instance colours applied via setColorAt
const ROCK_MAT = new THREE.MeshStandardMaterial({
  roughness: 0.90,
  metalness: 0.05,
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
  ringWallets, hostRadius, selectedAddress, onSelectAddress, showLabels, showRenamedOnly,
}: WalletRingProps) {
  const groupRef = useRef<THREE.Group>(null);
  const count    = ringWallets.length;

  // Global index into ringWallets of the currently hovered particle
  const [hoveredGlobalIdx, setHoveredGlobalIdx] = useState<number>(-1);

  const inner = hostRadius * RING_INNER_MULT;
  const outer = hostRadius * RING_OUTER_MULT;

  // Precompute positions (relative to group) for tooltip + label lookup
  const positions = useMemo(() => ringWallets.map((rp) => {
    const r = ringRadius(rp.radialT, inner, outer);
    const y = (rp.seed - 0.5) * 0.18;
    return new THREE.Vector3(Math.cos(rp.angle) * r, y, Math.sin(rp.angle) * r);
  }), [ringWallets, inner, outer]);

  // Split particles into N_VARIANTS buckets (deterministic, via address hue)
  // variantGroups[v] = [globalIdx0, globalIdx1, …]
  const variantGroups = useMemo(() => {
    const groups: number[][] = Array.from({ length: N_VARIANTS }, () => []);
    ringWallets.forEach((rp, gi) => {
      groups[Math.floor(rp.hue * N_VARIANTS) % N_VARIANTS].push(gi);
    });
    return groups;
  }, [ringWallets]);

  // Per-variant instanced mesh refs
  const meshRefs = useRef<(THREE.InstancedMesh | null)[]>([]);

  // Build instance matrices + colors for every variant
  useEffect(() => {
    const mat4  = new THREE.Matrix4();
    const color = new THREE.Color();

    variantGroups.forEach((globalIndices, v) => {
      const mesh = meshRefs.current[v];
      if (!mesh || globalIndices.length === 0) return;

      globalIndices.forEach((gi, localId) => {
        const rp  = ringWallets[gi];
        const pos = positions[gi];

        // Non-uniform scale per instance on top of already-irregular geo
        const sx = rp.size;
        const sy = rp.size * (0.55 + rp.seed * 0.45);
        const sz = rp.size * (0.60 + rp.hue  * 0.55);

        const quat = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(rp.seed * 4.1, rp.hue * 6.3, rp.seed * 2.7)
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

  // Slow disc rotation + label proximity tracking
  const { camera } = useThree();
  const [nearIndices, setNearIndices] = useState<Set<number>>(new Set());
  const LABEL_DIST = 35;

  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += 0.008 * delta;

    if (groupRef.current && Math.random() < 0.17) {
      const wp   = new THREE.Vector3();
      const near = new Set<number>();
      for (let i = 0; i < count; i++) {
        wp.copy(positions[i]);
        groupRef.current.localToWorld(wp);
        if (wp.distanceTo(camera.position) < LABEL_DIST) near.add(i);
      }
      setNearIndices(near);
    }
  });

  // Event handler factories — one set per variant (v → globalIdx)
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

  const onPointerOut = useCallback(() => {
    setHoveredGlobalIdx(-1);
    document.body.style.cursor = "auto";
  }, []);

  const makeClick = useCallback(
    (v: number) => (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      const localId = e.instanceId ?? -1;
      if (localId >= 0 && localId < variantGroups[v].length) {
        onSelectAddress(ringWallets[variantGroups[v][localId]].wallet.address);
      }
    },
    [variantGroups, ringWallets, onSelectAddress],
  );

  const dustMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: "#887755",
    transparent: true,
    opacity: 0.018,
    side: THREE.DoubleSide,
    depthWrite: false,
  }), []);

  if (count === 0) return null;

  return (
    <group ref={groupRef} rotation={[Math.PI * 0.44, 0, 0.15]}>

      {/* faint dust disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[inner, outer, 180]} />
        <primitive object={dustMat} attach="material" />
      </mesh>

      {/* one InstancedMesh per rock-shape variant */}
      {ROCK_GEOS.map((geo, v) => {
        const vCount = variantGroups[v].length;
        if (vCount === 0) return null;
        return (
          <instancedMesh
            key={v}
            ref={el => { meshRefs.current[v] = el; }}
            args={[geo, ROCK_MAT, vCount]}
            userData={{
              bodyType: "ring",
              walletAddresses: variantGroups[v].map(gi =>
                ringWallets[gi].wallet.address.toLowerCase()),
            }}
            frustumCulled={false}
            onPointerMove={makePointerMove(v)}
            onPointerOut={onPointerOut}
            onClick={makeClick(v)}
          >
            <primitive object={geo} attach="geometry" />
            <primitive object={ROCK_MAT} attach="material" />
          </instancedMesh>
        );
      })}

      {/* tooltip for hovered particle */}
      {hoveredGlobalIdx >= 0 && hoveredGlobalIdx < count && (
        <Html
          position={[
            positions[hoveredGlobalIdx].x,
            positions[hoveredGlobalIdx].y + 0.25,
            positions[hoveredGlobalIdx].z,
          ]}
          center
          zIndexRange={[10000, 0]}
          style={{ pointerEvents: "none" }}
        >
          <WalletTooltip wallet={ringWallets[hoveredGlobalIdx].wallet} />
        </Html>
      )}

      {/* persistent labels */}
      {ringWallets.map((rp, i) => {
        if (hoveredGlobalIdx === i) return null;
        const isSelected = selectedAddress?.toLowerCase() === rp.wallet.address.toLowerCase();
        const isNear     = nearIndices.has(i);
        const isRenamed  = !showRenamedOnly || !!rp.wallet.customName;
        if (!isSelected && !(showLabels && (isNear || isRenamed))) return null;

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
  );
}
