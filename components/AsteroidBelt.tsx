"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

import type { AsteroidData } from "@/lib/layout";
import WalletTooltip from "./WalletTooltip";
import OrbitRing from "./OrbitRing";

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
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const [hovered, setHovered] = useState<number>(-1);

  const count = asteroids.length;

  /* ── Set instance matrices + colors ─────────────────────── */
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || count === 0) return;

    const mat = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const pos = new THREE.Vector3();
    const color = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const a = asteroids[i];

      pos.set(a.position[0], a.position[1], a.position[2]);

      // Pseudo-random rotation from hash-derived values
      quat.setFromEuler(
        new THREE.Euler(
          a.hue * Math.PI * 2,
          a.size * 100,
          a.hue * Math.PI,
        ),
      );

      scale.setScalar(a.size);
      mat.compose(pos, quat, scale);
      mesh.setMatrixAt(i, mat);

      color.setHSL(a.hue, 0.3, 0.5);
      mesh.setColorAt(i, color);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [asteroids, count]);

  /* ── Slow belt rotation ─────────────────────────────────── */
  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.002 * delta;
    }
  });

  /* ── Pointer events ─────────────────────────────────────── */
  const onPointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(e.instanceId !== undefined ? e.instanceId : -1);
    document.body.style.cursor = "pointer";
  }, []);

  const onPointerLeave = useCallback(() => {
    setHovered(-1);
    document.body.style.cursor = "auto";
  }, []);

  const onClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (e.instanceId !== undefined) {
        const asteroid = asteroids[e.instanceId];
        if (asteroid) onSelectAddress(asteroid.wallet.address);
      }
    },
    [asteroids, onSelectAddress],
  );

  const selectedIndex = selectedAddress
    ? asteroids.findIndex(
        (a) => a.wallet.address.toLowerCase() === selectedAddress.toLowerCase(),
      )
    : -1;

  const activeIndex = selectedIndex >= 0 ? selectedIndex : hovered >= 0 && hovered < count ? hovered : -1;
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

      {/* Instanced asteroid rocks */}
      {count > 0 && (
        <instancedMesh
          ref={meshRef}
          args={[undefined as unknown as THREE.BufferGeometry, undefined as unknown as THREE.Material, count]}
          userData={{ walletAddresses: asteroids.map(a => a.wallet.address.toLowerCase()), bodyType: "asteroid" }}
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
          onClick={onClick}
          frustumCulled={false}
        >
          <icosahedronGeometry args={[1, 0]} />
          <meshStandardMaterial roughness={0.8} metalness={0.2} />
        </instancedMesh>
      )}

      {/* Tooltip on hover */}
      {activeAsteroid && (selectedIndex < 0 || panelOpen) && (
        <Html position={activeAsteroid.position} center zIndexRange={[10000, 0]}
          style={{ pointerEvents: (selectedIndex >= 0 && panelOpen) ? "auto" : "none" }}>
          <WalletTooltip wallet={activeAsteroid.wallet} onClose={(selectedIndex >= 0 && panelOpen) ? onDeselect : undefined} />
        </Html>
      )}

      {/* Persistent name labels (only named asteroids to keep perf sane) */}
      {showAllNames && asteroids.map((a, i) => {
        if (showRenamedOnly && !a.wallet.customName) return null;
        if (!showRenamedOnly && !a.wallet.customName) return null;
        // Don't double-show if this asteroid has the active tooltip
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
