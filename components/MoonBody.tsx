"use client";

import React, { useRef, useMemo, useState, useCallback, useEffect } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

import type { MoonData } from "@/lib/layout";
import { createMoonMaterial } from "@/lib/shaders/moonShader";
import WalletTooltip from "./WalletTooltip";

interface MoonBodyProps {
  data:        MoonData;
  planetOrbit: number;   // parent planet orbit radius from sun
  hostRadius:  number;   // parent planet body radius (for shadow)
  selected:    boolean;
  panelOpen?:  boolean;
  onSelect:    () => void;
  onDeselect:  () => void;
  showLabel?:  boolean;
  showRenamedOnly?: boolean;
}

export default function MoonBody({ data, planetOrbit, hostRadius, selected, panelOpen, onSelect, onDeselect, showLabel, showRenamedOnly }: MoonBodyProps) {
  const hostGroupRef = useRef<THREE.Group>(null);
  const moonOrbitRef = useRef<THREE.Group>(null);
  const meshRef      = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  // Reusable vector for world-pos extraction
  const hostWorldPos = useMemo(() => new THREE.Vector3(), []);

  // Each moon gets its own procedural type (icy, volcanic, cratered, etc.)
  const material = useMemo(
    () => createMoonMaterial(data.moonType, data.hue, data.seed),
    [data.moonType, data.hue, data.seed],
  );

  // LOD geometries
  const _lodPos = useMemo(() => new THREE.Vector3(), []);
  const moonGeos = useMemo(() => [
    new THREE.SphereGeometry(data.radius, 48, 48),
    new THREE.SphereGeometry(data.radius, 24, 24),
    new THREE.SphereGeometry(data.radius, 12, 12),
  ], [data.radius]);
  const lodRef = useRef(0);
  useEffect(() => () => { moonGeos.forEach(g => g.dispose()); }, [moonGeos]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (moonOrbitRef.current)
      moonOrbitRef.current.rotation.y = data.initialAngle + data.orbitSpeed * t;
    if (meshRef.current)
      meshRef.current.rotation.y = data.seed * 6.28 + 0.06 * t;
    material.uniforms.uTime.value = t;

    // LOD: swap sphere tessellation based on camera distance
    if (meshRef.current) {
      meshRef.current.getWorldPosition(_lodPos);
      const d = _lodPos.distanceTo(state.camera.position);
      const lod = d < 50 ? 0 : d < 200 ? 1 : 2;
      if (lod !== lodRef.current) {
        lodRef.current = lod;
        meshRef.current.geometry = moonGeos[lod];
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
          userData={{ walletAddress: data.wallet.address.toLowerCase(), bodyRadius: data.radius, bodyType: "moon" }}
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
          onClick={onClick}
        >
          <primitive object={moonGeos[lodRef.current]} attach="geometry" />
          <primitive object={material} attach="material" />
        </mesh>

        {(hovered || (selected && panelOpen)) && (
          <Html
            position={[data.orbitRadius, data.radius + 0.18, 0]}
            center
            zIndexRange={[10000, 0]}
            style={{ pointerEvents: (selected && panelOpen) ? "auto" : "none" }}
          >
            <WalletTooltip wallet={data.wallet} onClose={(selected && panelOpen) ? onDeselect : undefined} />
          </Html>
        )}

        {/* Persistent name label */}
        {showLabel && (!showRenamedOnly || data.wallet.customName) && !hovered && !(selected && panelOpen) && (
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
