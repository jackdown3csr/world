"""Writes PlanetWallet.tsx using createPlanetMaterial factory."""
import pathlib

CODE = r'''"use client";

import React, { useRef, useMemo, useState, useCallback } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

import type { PlanetData } from "@/lib/orbitalUtils";
import { createPlanetMaterial, createRingMaterial } from "@/lib/planetShader";
import WalletTooltip from "./WalletTooltip";
import MoonBody from "./MoonBody";

interface PlanetWalletProps {
  data:     PlanetData;
  selected: boolean;
  onSelect: () => void;
}

export default function PlanetWallet({ data, selected, onSelect }: PlanetWalletProps) {
  const orbitRef = useRef<THREE.Group>(null);
  const meshRef  = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  // One ShaderMaterial per planet — unique uniforms (hue, seed, type, time)
  const material = useMemo(
    () => createPlanetMaterial(data.planetType, data.hue, data.seed),
    [data.planetType, data.hue, data.seed],
  );

  // Ring material (when hasRings)
  const ringMat = useMemo(
    () => createRingMaterial(data.hue, data.seed),
    [data.hue, data.seed],
  );

  const ringInner = data.radius * 1.38;
  const ringOuter = data.radius * 2.55;

  useFrame((state, delta) => {
    if (orbitRef.current) orbitRef.current.rotation.y += data.orbitSpeed * delta;
    if (meshRef.current)  meshRef.current.rotation.y  += 0.18 * delta;
    // Animate clouds / bands
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
    <group rotation={[data.tilt, 0, 0]}>
      <group ref={orbitRef} rotation-y={data.initialAngle}>

        {/* Planet sphere */}
        <mesh
          ref={meshRef}
          position={[data.orbitRadius, 0, 0]}
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
          onClick={onClick}
        >
          <sphereGeometry args={[data.radius, 80, 80]} />
          <primitive object={material} attach="material" />
        </mesh>

        {/* Saturn-style rings */}
        {data.hasRings && (
          <group
            position={[data.orbitRadius, 0, 0]}
            rotation={[Math.PI * 0.42 + (data.seed - 0.5) * 0.4, data.seed * 0.8, 0]}
          >
            <mesh>
              <ringGeometry args={[ringInner, ringOuter, 180]} />
              <primitive object={ringMat} attach="material" />
            </mesh>
          </group>
        )}

        {/* Tooltip */}
        {(hovered || selected) && (
          <Html
            position={[data.orbitRadius, data.radius + 0.6, 0]}
            center
            zIndexRange={[100, 0]}
          >
            <WalletTooltip wallet={data.wallet} />
          </Html>
        )}

        {/* Moons */}
        {data.moons.map((moon, i) => (
          <MoonBody
            key={moon.wallet.address + i}
            data={moon}
            planetOrbit={data.orbitRadius}
            selected={false}
            onSelect={() => {}}
          />
        ))}
      </group>
    </group>
  );
}
'''

out = pathlib.Path(r"c:\Users\honza\Documents\gitclones\world\world\components\PlanetWallet.tsx")
out.write_text(CODE, encoding="utf-8")
print(f"Written {len(CODE)} chars to {out}")
