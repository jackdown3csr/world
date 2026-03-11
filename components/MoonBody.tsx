"use client";

import React, { useRef, useMemo, useState, useCallback, useEffect } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import SpriteLabel from "./SpriteLabel";
import OrbitRing from "./OrbitRing";
import * as THREE from "three";

import type { MoonData } from "@/lib/layout";
import { createMoonMaterial } from "@/lib/shaders/moonShader";
import { MOON_GEOS } from "@/lib/geometryPool";
import { type WalletTooltipVariant, type HoveredWalletInfo } from "./WalletTooltip";
import { registerSceneObject, unregisterSceneObject } from "@/lib/sceneRegistry";
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
  interactionEnabled?: boolean;
  paused?: boolean;
  showOrbits?: boolean;
  /** Scoped registry key, e.g. "vescrow:0x...". Defaults to bare address. */
  sceneId?: string;
  onHoverWallet?: (info: HoveredWalletInfo | null) => void;
}

export default function MoonBody({ data, starWorldPosition, planetOrbit, hostRadius, selected, panelOpen, onSelect, onDeselect, showLabel, showRenamedOnly, detailVariant = "wallet", interactionEnabled = true, paused = false, showOrbits = true, sceneId, onHoverWallet }: MoonBodyProps) {
  const hostGroupRef = useRef<THREE.Group>(null);
  const moonOrbitRef = useRef<THREE.Group>(null);
  const meshRef      = useRef<THREE.Mesh>(null);
  const simTimeRef = useRef(0);

  useEffect(() => {
    if (!meshRef.current) return;
    const id = sceneId ?? data.wallet.address.toLowerCase();
    registerSceneObject(id, meshRef.current, data.radius, "moon");
    return () => unregisterSceneObject(id);
  }, [sceneId, data.wallet.address, data.radius]);
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
  // Proximity-based orbit ring opacity (avoid per-frame re-render)
  const [orbitOpacity, setOrbitOpacity] = useState(0);
  const prevOpacityBand = useRef(-1);

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 1 / 30);
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

      // Proximity fade for orbit ring — quantise to bands to avoid churn
      const camDist = hostWorldPos.distanceTo(state.camera.position);
      const raw = camDist < 50 ? 0.12 : camDist > 120 ? 0 : 0.12 * (1 - (camDist - 50) / 70);
      const band = Math.round(raw * 20);  // ~5% steps
      if (band !== prevOpacityBand.current) {
        prevOpacityBand.current = band;
        setOrbitOpacity(band / 20);
      }
    }
  });

  const onPointerEnter = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer";
    onHoverWallet?.({ wallet: data.wallet, variant: detailVariant });
  }, [onHoverWallet, data.wallet, detailVariant]);
  const onPointerLeave = useCallback(() => {
    setHovered(false); document.body.style.cursor = "auto";
    onHoverWallet?.(null);
  }, [onHoverWallet]);
  const onClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation(); onSelect();
  }, [onSelect]);

  return (
    /* Moon orbit centre is at the host planet position */
    <group ref={hostGroupRef} position={[planetOrbit, 0, 0]} rotation={[data.tilt, 0, 0]}>
      {/* Moon orbit ring — proximity-faded, tint by moon type */}
      {showOrbits && orbitOpacity > 0 && (
        <OrbitRing
          radius={data.orbitRadius}
          color={MOON_TYPE_ORBIT_COLORS[data.moonType]}
          opacity={orbitOpacity}
        />
      )}
      <group ref={moonOrbitRef}>
        <mesh
          ref={meshRef}
          position={[data.orbitRadius, 0, 0]}
          scale={data.radius}
          userData={{ walletAddress: data.wallet.address.toLowerCase(), bodyRadius: data.radius, bodyType: "moon" }}
          onPointerEnter={interactionEnabled ? onPointerEnter : undefined}
          onPointerLeave={interactionEnabled ? onPointerLeave : undefined}
          onClick={interactionEnabled ? onClick : undefined}
        >
          <primitive object={MOON_GEOS[lodRef.current]} attach="geometry" />
          <primitive object={material} attach="material" />
        </mesh>

        {interactionEnabled && hovered && null /* tooltip now in WalletInfoBanner */}

        {/* Persistent name label */}
        {showLabel && (!showRenamedOnly || data.wallet.customName) && !hovered && (
          <SpriteLabel
            position={[data.orbitRadius, data.radius + 0.15, 0]}
            text={`${detailVariant === "vesting" ? "◈ " : ""}${data.wallet.customName || `${data.wallet.address.slice(0, 6)}\u2026${data.wallet.address.slice(-4)}`}`}
            color={selected ? "#b0e0ff" : detailVariant === "vesting" ? "#7ccedd" : detailVariant === "pool" ? "#ffe08a" : "#80a8b8"}
            fontSize={selected ? 0.35 : 0.3}
            opacity={selected ? 1.0 : 0.8}
            onClick={interactionEnabled ? onSelect : undefined}
          />
        )}
      </group>
    </group>
  );
}
