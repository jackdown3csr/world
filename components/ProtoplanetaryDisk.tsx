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
import SpriteLabel from "./SpriteLabel";
import * as THREE from "three";

import type { AsteroidData } from "@/lib/layout";
import type { HoveredWalletInfo } from "./WalletTooltip";
import { registerInstancedSceneObject, unregisterInstancedSceneObject } from "@/lib/sceneRegistry";

/* ── Irregular clump geometry variants ────────────────────── */

const N_VARIANTS = 8;

function makeClumpGeo(variantIdx: number): THREE.BufferGeometry {
  let s = variantIdx * 7919 + 12347;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };

  // 80-face icosphere → smooth surface (matching AsteroidBelt quality)
  const geo = new THREE.IcosahedronGeometry(1, 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;

  // Irregular chunk proportions — elongated on a random axis
  const elongAxis = Math.floor(rnd() * 3);
  const elong = 1.3 + rnd() * 0.7;          // 1.3 – 2.0 elongation
  const short = 0.45 + rnd() * 0.30;        // 0.45 – 0.75 short axis
  const mid   = 0.65 + rnd() * 0.30;        // 0.65 – 0.95 middle axis

  const gx = elongAxis === 0 ? elong : elongAxis === 2 ? mid : short;
  const gy = elongAxis === 1 ? elong : elongAxis === 0 ? mid : short;
  const gz = elongAxis === 2 ? elong : elongAxis === 1 ? mid : short;

  for (let i = 0; i < pos.count; i++) {
    const d = 0.85 + rnd() * 0.30;
    pos.setXYZ(i,
      pos.getX(i) * gx * d,
      pos.getY(i) * gy * d,
      pos.getZ(i) * gz * d,
    );
  }
  geo.computeVertexNormals();
  return geo;
}

const CLUMP_GEOS = Array.from({ length: N_VARIANTS }, (_, i) => makeClumpGeo(i));

const CLUMP_MAT = new THREE.MeshStandardMaterial({
  roughness: 0.82,
  metalness: 0.10,
});

/* ── Reusable temp objects (avoid per-frame allocation) ──── */
const _tmpMat4 = new THREE.Matrix4();

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
  interactive?: boolean;
  paused?: boolean;
  /** System prefix for scene registry keys, e.g. "vesting". When set, registers as "prefix:0x...". */
  sceneIdPrefix?: string;
  onHoverWallet?: (info: HoveredWalletInfo | null) => void;
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
  interactive = true,
  paused = false,
  sceneIdPrefix,
  onHoverWallet,
}: ProtoplanetaryDiskProps) {
  const groupRef = useRef<THREE.Group>(null);
  const simTimeRef = useRef(0);
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

  // Pre-compute orbital polar coordinates for differential rotation
  const orbitalData = useMemo(() => {
    return asteroids.map(a => {
      const x = a.position[0];
      const z = a.position[2];
      return {
        r: Math.sqrt(x * x + z * z),
        baseAngle: Math.atan2(z, x),
        y: a.position[1] * 0.10,
      };
    });
  }, [asteroids]);

  const meshRefs = useRef<(THREE.InstancedMesh | null)[]>([]);

  const selectedIndex = selectedAddress
    ? asteroids.findIndex(
        (a) => a.wallet.address.toLowerCase() === selectedAddress.toLowerCase(),
      )
    : -1;

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

        // Position in disk plane (Y compressed)
        const diskX = a.position[0];
        const diskZ = a.position[2];
        const diskY = a.position[1] * 0.10;

        // Irregular clump scales — less aggressively flat than before
        const base = a.size * 8.0;
        const sx   = base * (0.65 + a.seed * 0.70);
        const sy   = base * (0.45 + a.hue  * 0.45);
        const sz   = base * (0.65 + a.seed * 0.60);

        // More varied tumble rotation
        const quat = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(
            a.hue  * Math.PI * 0.5,
            a.seed * Math.PI * 4.0,
            a.hue  * Math.PI * 0.4,
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

  // Register each interactive disk pebble in the scene registry for camera targeting
  useEffect(() => {
    if (!interactive) return;
    const ids: string[] = [];
    variantGroups.forEach((globalIndices, v) => {
      const mesh = meshRefs.current[v];
      if (!mesh) return;
      globalIndices.forEach((gi, localIdx) => {
        const rawAddr = asteroids[gi].wallet.address.toLowerCase();
        const id = sceneIdPrefix ? `${sceneIdPrefix}:${rawAddr}` : rawAddr;
        registerInstancedSceneObject(id, mesh, localIdx, "asteroid");
        ids.push(id);
      });
    });
    return () => { ids.forEach(unregisterInstancedSceneObject); };
  }, [asteroids, interactive, variantGroups, sceneIdPrefix]);

  /* ── Differential disk rotation (Kepler-like) ────────────── */
  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 1 / 30);
    if (!paused) simTimeRef.current += delta;
    const time = simTimeRef.current;

    if (!groupRef.current) return;

    // Group rotation at outer-edge base speed
    const BASE_OMEGA = 0.006;
    const refR = Math.max(beltOuterRadius, 1);
    groupRef.current.rotation.y = BASE_OMEGA * time;

    // Per-instance differential offset — inner particles orbit faster
    variantGroups.forEach((globalIndices, v) => {
      const mesh = meshRefs.current[v];
      if (!mesh || globalIndices.length === 0) return;
      let updated = false;

      globalIndices.forEach((gi, localId) => {
        const orb = orbitalData[gi];
        if (!orb) return;

        // ω ∝ r^(-1.5) normalised so outer edge = BASE_OMEGA
        const omega = BASE_OMEGA * Math.pow(refR / Math.max(orb.r, refR * 0.3), 1.5);
        const diffAngle = (omega - BASE_OMEGA) * time;
        const angle = orb.baseAngle + diffAngle;

        mesh.getMatrixAt(localId, _tmpMat4);
        _tmpMat4.setPosition(
          Math.cos(angle) * orb.r,
          orb.y,
          Math.sin(angle) * orb.r,
        );
        mesh.setMatrixAt(localId, _tmpMat4);
        updated = true;
      });

      if (updated) mesh.instanceMatrix.needsUpdate = true;
    });

    // Tooltip anchor tracking removed — hover info is sent via onHoverWallet
  });

  /* ── Event handlers ─────────────────────────────────────── */
  const makePointerMove = useCallback(
    (v: number) => (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      const localId = e.instanceId ?? -1;
      if (localId >= 0 && localId < variantGroups[v].length) {
        const gi = variantGroups[v][localId];
        setHoveredGlobalIdx(gi);
        onHoverWallet?.({ wallet: asteroids[gi].wallet, vesting: true });
        document.body.style.cursor = "pointer";
      }
    },
    [variantGroups, onHoverWallet, asteroids],
  );

  const onPointerLeave = useCallback(() => {
    setHoveredGlobalIdx(-1);
    onHoverWallet?.(null);
    document.body.style.cursor = "auto";
  }, [onHoverWallet]);

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

  if (count === 0) return null;

  return (
    <group ref={groupRef}>
      {/* Instanced disk pebbles per geometry variant */}
      {variantGroups.map((globalIndices, v) => (
        globalIndices.length === 0 ? null : (
          <instancedMesh
            key={v}
            ref={(el) => { meshRefs.current[v] = el; }}
            args={[CLUMP_GEOS[v], CLUMP_MAT, globalIndices.length]}
            frustumCulled={false}
            onPointerMove={interactive ? makePointerMove(v) : undefined}
            onPointerLeave={interactive ? onPointerLeave : undefined}
            onClick={interactive ? makeClick(v) : undefined}
          />
        )
      ))}

      {/* Tooltip — now in WalletInfoBanner */}

      {/* Persistent labels for disk particles */}
      {interactive && showAllNames && asteroids.map((a, i) => {
        if (showRenamedOnly && !a.wallet.customName) return null;
        if (hoveredGlobalIdx === i) return null;
        const isSelected = selectedIndex === i;
        const label = a.wallet.customName || `${a.wallet.address.slice(0, 6)}\u2026${a.wallet.address.slice(-4)}`;
        return (
          <SpriteLabel
            key={a.wallet.address}
            position={a.position as [number, number, number]}
            text={`◈ ${label}`}
            color={isSelected ? "#b0e0ff" : "#7ccedd"}
            fontSize={isSelected ? 0.35 : 0.3}
            opacity={isSelected ? 1.0 : 0.7}
            onClick={() => onSelectAddress(a.wallet.address)}
          />
        );
      })}
    </group>
  );
}
