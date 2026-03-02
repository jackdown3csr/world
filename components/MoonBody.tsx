"use client";

import React, { useRef, useMemo, useState, useCallback } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

import type { MoonData } from "@/lib/layout";
import { createMoonMaterial } from "@/lib/shaders/moonShader";
import WalletTooltip from "./WalletTooltip";

interface MoonBodyProps {
  data:        MoonData;
  planetOrbit: number;   // parent planet orbit radius from sun
  selected:    boolean;
  onSelect:    () => void;
  onDeselect:  () => void;
  showLabel?:  boolean;
  showRenamedOnly?: boolean;
}

export default function MoonBody({ data, planetOrbit, selected, onSelect, onDeselect, showLabel, showRenamedOnly }: MoonBodyProps) {
  const moonOrbitRef = useRef<THREE.Group>(null);
  const meshRef      = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  // Each moon gets its own procedural type (icy, volcanic, cratered, etc.)
  const material = useMemo(
    () => createMoonMaterial(data.moonType, data.hue, data.seed),
    [data.moonType, data.hue, data.seed],
  );

  useFrame((state, delta) => {
    if (moonOrbitRef.current)
      moonOrbitRef.current.rotation.y += data.orbitSpeed * delta;
    if (meshRef.current)
      meshRef.current.rotation.y += 0.06 * delta;
    material.uniforms.uTime.value = state.clock.elapsedTime;
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
    <group position={[planetOrbit, 0, 0]} rotation={[data.tilt, 0, 0]}>
      <group ref={moonOrbitRef} rotation-y={data.initialAngle}>
        <mesh
          ref={meshRef}
          position={[data.orbitRadius, 0, 0]}
          userData={{ walletAddress: data.wallet.address.toLowerCase(), bodyRadius: data.radius, bodyType: "moon" }}
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
          onClick={onClick}
        >
          <sphereGeometry args={[data.radius, 64, 64]} />
          <primitive object={material} attach="material" />
        </mesh>

        {(hovered || selected) && (
          <Html
            position={[data.orbitRadius, data.radius + 0.18, 0]}
            center
            zIndexRange={[10000, 0]}
            style={{ pointerEvents: selected ? "auto" : "none" }}
          >
            <WalletTooltip wallet={data.wallet} onClose={selected ? onDeselect : undefined} />
          </Html>
        )}

        {/* Persistent name label */}
        {showLabel && (!showRenamedOnly || data.wallet.customName) && !hovered && !selected && (
          <Html
            position={[data.orbitRadius, data.radius + 0.15, 0]}
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
              {data.wallet.customName || `${data.wallet.address.slice(0, 6)}\u2026${data.wallet.address.slice(-4)}`}
            </div>
          </Html>
        )}
      </group>
    </group>
  );
}
