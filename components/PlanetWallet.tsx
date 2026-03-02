"use client";

import React, { useRef, useMemo, useState, useCallback } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

import type { PlanetData } from "@/lib/layout";
import { createPlanetMaterial } from "@/lib/shaders/planetMaterial";
import WalletTooltip from "./WalletTooltip";
import MoonBody from "./MoonBody";
import WalletRing from "./WalletRing";

interface PlanetWalletProps {
  data:     PlanetData;
  selected: boolean;
  panelOpen?: boolean;
  onSelect: () => void;
  onDeselect: () => void;
  selectedAddress: string | null;
  onSelectAddress: (address: string) => void;
  showLabel?: boolean;
  showMoonLabels?: boolean;
  showRingLabels?: boolean;
  showRenamedOnly?: boolean;
}

export default function PlanetWallet({ data, selected, panelOpen, onSelect, onDeselect, selectedAddress, onSelectAddress, showLabel, showMoonLabels, showRingLabels, showRenamedOnly }: PlanetWalletProps) {
  const orbitRef = useRef<THREE.Group>(null);
  const meshRef  = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  // One ShaderMaterial per planet — unique uniforms (hue, seed, type, time)
  const material = useMemo(
    () => createPlanetMaterial(data.planetType, data.hue, data.seed, data.ringWallets.length > 0),
    [data.planetType, data.hue, data.seed, data.ringWallets.length],
  );

  // Atmosphere glow shell — skip for rocky and for planets with wallet rings (Saturn)
  const atmosMaterial = useMemo(() => {
    if (data.planetType === "rocky") return null;
    if (data.ringWallets.length > 0) return null;  // Saturn has its own disc
    const colorMap: Record<string, THREE.Color> = {
      gas_giant:   new THREE.Color(0.75, 0.65, 0.50),
      ice_giant:   new THREE.Color(0.45, 0.75, 1.0),
      terrestrial: new THREE.Color(0.40, 0.65, 1.0),
    };
    const intensityMap: Record<string, number> = {
      gas_giant: 0.25, ice_giant: 0.50, terrestrial: 0.45,
    };
    const falloffMap: Record<string, number> = {
      gas_giant: 5.5, ice_giant: 4.5, terrestrial: 4.0,
    };
    return new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        varying vec3 vNorm;
        varying vec3 vWorldPos;
        void main() {
          vNorm = normalize(mat3(modelMatrix) * normal);
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uIntensity;
        uniform float uFalloff;
        varying vec3 vNorm;
        varying vec3 vWorldPos;
        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float rim = 1.0 - max(dot(vNorm, viewDir), 0.0);
          float glow = pow(rim, uFalloff) * uIntensity;
          // Fade out the very outermost edge to avoid a hard ring
          float edgeFade = smoothstep(1.0, 0.7, rim);
          glow *= edgeFade;
          gl_FragColor = vec4(uColor * glow, glow);
        }
      `,
      uniforms: {
        uColor:     { value: colorMap[data.planetType] ?? new THREE.Color(0.5, 0.7, 1.0) },
        uIntensity: { value: intensityMap[data.planetType] ?? 0.4 },
        uFalloff:   { value: falloffMap[data.planetType] ?? 4.5 },
      },
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }, [data.planetType, data.ringWallets.length]);

  useFrame((state, delta) => {
    if (orbitRef.current) orbitRef.current.rotation.y += data.orbitSpeed * delta;
    if (meshRef.current)  meshRef.current.rotation.y  += 0.04 * delta;
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
          userData={{ walletAddress: data.wallet.address.toLowerCase(), bodyRadius: data.radius, bodyType: "planet" }}
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
          onClick={onClick}
        >
          <sphereGeometry args={[data.radius, 80, 80]} />
          <primitive object={material} attach="material" />
        </mesh>

        {/* Atmosphere glow shell */}
        {atmosMaterial && (
          <mesh position={[data.orbitRadius, 0, 0]}>
            <sphereGeometry args={[data.radius * 1.03, 48, 48]} />
            <primitive object={atmosMaterial} attach="material" />
          </mesh>
        )}

        {/* Wallet-particle ring (Saturn) */}
        {data.ringWallets.length > 0 && (
          <group position={[data.orbitRadius, 0, 0]}>
            <WalletRing
              ringWallets={data.ringWallets}
              hostRadius={data.radius}
              selectedAddress={selectedAddress}
              onSelectAddress={onSelectAddress}
              showLabels={showRingLabels}
              showRenamedOnly={showRenamedOnly}
            />
          </group>
        )}

        {/* Tooltip */}
        {(hovered || (selected && panelOpen)) && (
          <Html
            position={[data.orbitRadius, data.radius + 0.6, 0]}
            center
            zIndexRange={[10000, 0]}
            style={{ pointerEvents: (selected && panelOpen) ? "auto" : "none" }}
          >
            <WalletTooltip wallet={data.wallet} onClose={(selected && panelOpen) ? onDeselect : undefined} />
          </Html>
        )}

        {/* Persistent name label */}
        {showLabel && !hovered && !(selected && panelOpen) && (
          (!showRenamedOnly || data.wallet.customName) ? (
          <Html
            position={[data.orbitRadius, data.radius + 0.4, 0]}
            center
            zIndexRange={[5000, 0]}
            style={{ pointerEvents: "none" }}
          >
            <div style={{
              color: "#7090a8",
              fontSize: 10,
              fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
              fontWeight: 500,
              whiteSpace: "nowrap",
              textShadow: "0 0 8px rgba(0,0,0,0.95), 0 0 20px rgba(0,0,0,0.7)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              opacity: 0.85,
            }}>
              {data.wallet.customName || `${data.wallet.address.slice(0, 6)}\u2026${data.wallet.address.slice(-4)}`}
            </div>
          </Html>
          ) : null
        )}

        {/* Moons */}
        {data.moons.map((moon, i) => (
          <MoonBody
            key={moon.wallet.address + i}
            data={moon}
            planetOrbit={data.orbitRadius}
            selected={selectedAddress?.toLowerCase() === moon.wallet.address.toLowerCase()}
            panelOpen={panelOpen}
            onSelect={() => onSelectAddress(moon.wallet.address)}
            onDeselect={onDeselect}
            showLabel={showMoonLabels}
            showRenamedOnly={showRenamedOnly}
          />
        ))}
      </group>
    </group>
  );
}
