"use client";

/**
 * ProtoplanetaryDisk — flat rotating accretion disk for the vesting system.
 *
 * Replaces AsteroidBelt in the vesting StarSystem. Same data interface
 * (AsteroidData[]) so no layout changes are required.
 *
 * Differences from AsteroidBelt:
 *   - Particles confined to a very thin disk (Y ≈ 0 ± a few units)
 *   - Continuous slow rotation of the whole disk group
 *   - Color gradient: blue-white near star → warm orange/brown at belt edge
 *   - A separate "chaos debris" bucket rendered with steeper inclinations
 *   - Hover + click interactions identical to AsteroidBelt
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import SpriteLabel from "./SpriteLabel";
import * as THREE from "three";

import type { AsteroidData } from "@/lib/layout";
import WalletTooltip from "./WalletTooltip";

/* ── Flat pebble geometry variants ───────────────────────── */

const N_VARIANTS = 8;

function makePebbleGeo(variantIdx: number): THREE.BufferGeometry {
  let s = variantIdx * 7919 + 12347;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };

  // Start from an icosphere and flatten it strongly on Y → disk-like pebble
  const geo = new THREE.IcosahedronGeometry(1, 1); // 20 faces
  const pos = geo.attributes.position as THREE.BufferAttribute;

  const flatY  = 0.20 + rnd() * 0.25;   // 0.20 – 0.45  (very flat)
  const gx     = 0.70 + rnd() * 0.60;   // 0.70 – 1.30
  const gz     = 0.70 + rnd() * 0.60;

  for (let i = 0; i < pos.count; i++) {
    const d = 0.85 + rnd() * 0.30;
    pos.setXYZ(i,
      pos.getX(i) * gx * d,
      pos.getY(i) * flatY * d,
      pos.getZ(i) * gz * d,
    );
  }
  geo.computeVertexNormals();
  return geo;
}

const PEBBLE_GEOS = Array.from({ length: N_VARIANTS }, (_, i) => makePebbleGeo(i));

const PEBBLE_MAT = new THREE.MeshStandardMaterial({
  roughness: 0.85,
  metalness: 0.12,
});

/* ── Component ────────────────────────────────────────────── */

interface ProtoplanetaryDiskProps {
  asteroids: AsteroidData[];
  beltInnerRadius: number;
  beltOuterRadius: number;
  selectedAddress: string | null;
  onSelectAddress: (address: string) => void;
  onDeselect: () => void;
  panelOpen?: boolean;
  showAllNames?: boolean;
  showRenamedOnly?: boolean;
  vesting?: boolean;
}

export default function ProtoplanetaryDisk({
  asteroids,
  beltInnerRadius,
  beltOuterRadius,
  selectedAddress,
  onSelectAddress,
  onDeselect,
  panelOpen,
  showAllNames,
  showRenamedOnly,
  vesting,
}: ProtoplanetaryDiskProps) {
  const groupRef = useRef<THREE.Group>(null);
  const count    = asteroids.length;

  const [hoveredGlobalIdx, setHoveredGlobalIdx] = useState<number>(-1);

  // Split into variant buckets
  const variantGroups = useMemo(() => {
    const groups: number[][] = Array.from({ length: N_VARIANTS }, () => []);
    asteroids.forEach((a, gi) => {
      groups[a.variant % N_VARIANTS].push(gi);
    });
    return groups;
  }, [asteroids]);

  const meshRefs = useRef<(THREE.InstancedMesh | null)[]>([]);

  // Build instance matrices + gradient colors
  useEffect(() => {
    if (count === 0 || beltOuterRadius === 0) return;

    const mat4   = new THREE.Matrix4();
    const color  = new THREE.Color();
    const span   = Math.max(beltOuterRadius - beltInnerRadius, 1);

    variantGroups.forEach((globalIndices, v) => {
      const mesh = meshRefs.current[v];
      if (!mesh || globalIndices.length === 0) return;

      globalIndices.forEach((gi, localId) => {
        const a = asteroids[gi];

        // Flatten Y heavily — disk is very thin
        const diskX = a.position[0];
        const diskZ = a.position[2];
        const diskY = a.position[1] * 0.10;   // compress height to ≈10%

        // Disk pebbles — scale up so they're visible at belt radius
        const base = a.size * 8.0;
        const sx   = base * (0.60 + a.seed * 0.80);
        const sy   = base * (0.20 + a.hue  * 0.30);   // flat-ish
        const sz   = base * (0.60 + a.seed * 0.70);

        // Rotation mostly around Y (lying flat in disk)
        const quat = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(
            a.hue  * Math.PI * 0.3,
            a.seed * Math.PI * 4.0,
            a.hue  * Math.PI * 0.2,
          )
        );
        mat4.compose(
          new THREE.Vector3(diskX, diskY, diskZ),
          quat,
          new THREE.Vector3(sx, sy, sz),
        );
        mesh.setMatrixAt(localId, mat4);

        // Radial distance for color gradient
        const r = Math.sqrt(diskX * diskX + diskZ * diskZ);
        const t = Math.max(0, Math.min(1, (r - beltInnerRadius) / span));

        // Inner (near star): blue-white   Outer: warm brown/orange
        // t=0 → hue≈0.60 (blue)  t=1 → hue≈0.07 (orange-brown)
        const h = 0.60 - t * 0.53;
        const sat = 0.40 + (1 - t) * 0.30;       // more saturated near star
        const lit = 0.40 + (1 - t) * 0.25;       // brighter inner
        color.setHSL(h, sat, lit);
        mesh.setColorAt(localId, color);
      });

      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }, [asteroids, variantGroups, beltInnerRadius, beltOuterRadius, count]);

  /* ── Slow disk rotation ─────────────────────────────────── */
  useFrame((state) => {
    if (groupRef.current)
      // Slightly faster than asteroid belt (more "active" accretion)
      groupRef.current.rotation.y = 0.004 * state.clock.elapsedTime;
  });

  /* ── Event handlers ─────────────────────────────────────── */
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

  const activeIndex    = selectedIndex >= 0 ? selectedIndex
                        : hoveredGlobalIdx >= 0 && hoveredGlobalIdx < count ? hoveredGlobalIdx
                        : -1;
  const activeAsteroid = activeIndex >= 0 ? asteroids[activeIndex] : null;

  if (count === 0) return null;

  return (
    <group ref={groupRef}>
      {/* Instanced disk pebbles per geometry variant */}
      {variantGroups.map((globalIndices, v) => (
        globalIndices.length === 0 ? null : (
          <instancedMesh
            key={v}
            ref={(el) => { meshRefs.current[v] = el; }}
            args={[PEBBLE_GEOS[v], PEBBLE_MAT, globalIndices.length]}
            frustumCulled={false}
            onPointerMove={makePointerMove(v)}
            onPointerLeave={onPointerLeave}
            onClick={makeClick(v)}
          />
        )
      ))}

      {/* Tooltip for hovered / selected particle */}
      {activeAsteroid && (
        <Html
          position={activeAsteroid.position}
          zIndexRange={[7000, 0]}
          style={{ pointerEvents: "none" }}
        >
          <WalletTooltip
            wallet={activeAsteroid.wallet}
            vesting={vesting}
          />
        </Html>
      )}

      {/* Selected particle label (stays when panel open) */}
      {panelOpen && selectedIndex >= 0 && showAllNames && (
        <Html
          position={asteroids[selectedIndex].position}
          zIndexRange={[7100, 0]}
          style={{ pointerEvents: "none" }}
        >
          <WalletTooltip
            wallet={asteroids[selectedIndex].wallet}
            vesting={vesting}
          />
        </Html>
      )}

      {/* Persistent labels for disk particles */}
      {showAllNames && asteroids.map((a, i) => {
        if (showRenamedOnly && !a.wallet.customName) return null;
        if (activeIndex === i) return null;
        const label = a.wallet.customName || `${a.wallet.address.slice(0, 6)}\u2026${a.wallet.address.slice(-4)}`;
        return (
          <SpriteLabel
            key={a.wallet.address}
            position={a.position as [number, number, number]}
            text={`◈ ${label}`}
            color="#7ccedd"
            fontSize={0.3}
            opacity={0.7}
            onClick={() => onSelectAddress(a.wallet.address)}
          />
        );
      })}
    </group>
  );
}
