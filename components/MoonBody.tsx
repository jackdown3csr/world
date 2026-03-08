"use client";

import React, { useRef, useMemo, useState, useCallback, useEffect } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import SpriteLabel from "./SpriteLabel";
import * as THREE from "three";

import type { MoonData } from "@/lib/layout";
import { createMoonMaterial } from "@/lib/shaders/moonShader";
import { MOON_GEOS } from "@/lib/geometryPool";
import WalletTooltip, { type WalletTooltipVariant } from "./WalletTooltip";

interface MoonBodyProps {
  data:        MoonData;
  starWorldPosition: [number, number, number];
  planetOrbit: number;   // parent planet orbit radius from sun
  hostRadius:  number;   // parent planet body radius (for shadow)
  selected:    boolean;
  panelOpen?:  boolean;
  onSelect:    () => void;
  onDeselect:  () => void;
  showLabel?:  boolean;
  showRenamedOnly?: boolean;
  detailVariant?: WalletTooltipVariant;
  paused?: boolean;
}

export default function MoonBody({ data, starWorldPosition, planetOrbit, hostRadius, selected, panelOpen, onSelect, onDeselect, showLabel, showRenamedOnly, detailVariant = "wallet", paused = false }: MoonBodyProps) {
  const hostGroupRef = useRef<THREE.Group>(null);
  const moonOrbitRef = useRef<THREE.Group>(null);
  const meshRef      = useRef<THREE.Mesh>(null);
  const simTimeRef = useRef(0);
  const [hovered, setHovered] = useState(false);
  const starWorldPos = useMemo(
    () => new THREE.Vector3(starWorldPosition[0], starWorldPosition[1], starWorldPosition[2]),
    [starWorldPosition],
  );

  // Reusable vector for world-pos extraction
  const hostWorldPos = useMemo(() => new THREE.Vector3(), []);

  // Each moon gets its own procedural type (icy, volcanic, cratered, etc.)
  const material = useMemo(
    () => createMoonMaterial(data.moonType, data.hue, data.seed),
    [data.moonType, data.hue, data.seed],
  );

  // LOD geometries (shared unit-sphere pool, scaled by mesh.scale)
  const _lodPos = useMemo(() => new THREE.Vector3(), []);
  const lodRef = useRef(0);

  useFrame((state, delta) => {
    if (!paused) simTimeRef.current += delta;
    const t = simTimeRef.current;
    if (moonOrbitRef.current)
      moonOrbitRef.current.rotation.y = data.initialAngle + data.orbitSpeed * t;
    if (meshRef.current)
      meshRef.current.rotation.y = data.seed * 6.28 + 0.06 * t;
    material.uniforms.uTime.value = t;
    material.uniforms.uStarPos.value.copy(starWorldPos);

    // LOD: swap sphere tessellation based on camera distance
    if (meshRef.current) {
      meshRef.current.getWorldPosition(_lodPos);
      const d = _lodPos.distanceTo(state.camera.position);
      const lod = d < 50 ? 0 : d < 200 ? 1 : 2;
      if (lod !== lodRef.current) {
        lodRef.current = lod;
        meshRef.current.geometry = MOON_GEOS[lod];
      }
    }

    // Track host planet world position for shadow casting
    if (hostGroupRef.current) {
      hostGroupRef.current.getWorldPosition(hostWorldPos);
      material.uniforms.uHostPos.value.copy(hostWorldPos);
      material.uniforms.uHostRadius.value = hostRadius;
    }
  });

  const onPointerEnter = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer";
  }, []);
  const onPointerLeave = useCallback(() => {
    setHovered(false); document.body.style.cursor = "auto";
  }, []);
  const onClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation(); onSelect();
  }, [onSelect]);

  return (
    /* Moon orbit centre is at the host planet position */
    <group ref={hostGroupRef} position={[planetOrbit, 0, 0]} rotation={[data.tilt, 0, 0]}>
      <group ref={moonOrbitRef}>
        <mesh
          ref={meshRef}
          position={[data.orbitRadius, 0, 0]}
          scale={data.radius}
          userData={{ walletAddress: data.wallet.address.toLowerCase(), bodyRadius: data.radius, bodyType: "moon" }}
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
          onClick={onClick}
        >
          <primitive object={MOON_GEOS[lodRef.current]} attach="geometry" />
          <primitive object={material} attach="material" />
        </mesh>

        {(hovered || (selected && panelOpen)) && (
          <Html
            position={[data.orbitRadius, data.radius + 0.18, 0]}
            center
            zIndexRange={[10000, 0]}
            style={{ pointerEvents: (selected && panelOpen) ? "auto" : "none" }}
          >
            <WalletTooltip wallet={data.wallet} onClose={(selected && panelOpen) ? onDeselect : undefined} variant={detailVariant} />
          </Html>
        )}

        {/* Persistent name label */}
        {showLabel && (!showRenamedOnly || data.wallet.customName) && !hovered && !(selected && panelOpen) && (
          <SpriteLabel
            position={[data.orbitRadius, data.radius + 0.15, 0]}
            text={`${detailVariant === "vesting" ? "◈ " : ""}${data.wallet.customName || `${data.wallet.address.slice(0, 6)}\u2026${data.wallet.address.slice(-4)}`}`}
            color={detailVariant === "vesting" ? "#7ccedd" : detailVariant === "pool" ? "#ffe08a" : "#80a8b8"}
            fontSize={0.3}
            opacity={0.8}
            onClick={onSelect}
          />
        )}
      </group>
    </group>
  );
}
