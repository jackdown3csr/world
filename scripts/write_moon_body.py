"""Writes MoonBody.tsx using createPlanetMaterial factory (rocky preset)."""
import pathlib

CODE = r'''"use client";

import React, { useRef, useMemo, useState, useCallback } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

import type { MoonData } from "@/lib/orbitalUtils";
import { createPlanetMaterial } from "@/lib/planetShader";
import WalletTooltip from "./WalletTooltip";

interface MoonBodyProps {
  data:        MoonData;
  planetOrbit: number;   // parent planet orbit radius from sun
  selected:    boolean;
  onSelect:    () => void;
}

export default function MoonBody({ data, planetOrbit, selected, onSelect }: MoonBodyProps) {
  const moonOrbitRef = useRef<THREE.Group>(null);
  const meshRef      = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  // Moons always use the "rocky" shader — slightly desaturated hue
  const material = useMemo(
    () => createPlanetMaterial("rocky", data.hue * 0.3, data.seed),
    [data.hue, data.seed],
  );

  useFrame((state, delta) => {
    if (moonOrbitRef.current)
      moonOrbitRef.current.rotation.y += data.orbitSpeed * delta;
    if (meshRef.current)
      meshRef.current.rotation.y += 0.35 * delta;
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
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
          onClick={onClick}
        >
          <sphereGeometry args={[data.radius, 32, 32]} />
          <primitive object={material} attach="material" />
        </mesh>

        {(hovered || selected) && (
          <Html
            position={[data.orbitRadius, data.radius + 0.18, 0]}
            center
            zIndexRange={[100, 0]}
          >
            <WalletTooltip wallet={data.wallet} />
          </Html>
        )}
      </group>
    </group>
  );
}
'''

out = pathlib.Path(r"c:\Users\honza\Documents\gitclones\world\world\components\MoonBody.tsx")
out.write_text(CODE, encoding="utf-8")
print(f"Written {len(CODE)} chars to {out}")
