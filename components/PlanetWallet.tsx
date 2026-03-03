"use client";

import React, { useRef, useMemo, useState, useCallback } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

import type { PlanetData } from "@/lib/layout";
import { createPlanetMaterial } from "@/lib/shaders/planetMaterial";
import WalletTooltip from "./WalletTooltip";
import MoonBody from "./MoonBody";
import SaturnSystem from "./SaturnSystem";

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

  // ── Outer rim-glow shell (BackSide) — all non-rocky, non-Saturn planets ──
  const atmosRimMat = useMemo(() => {
    if (data.planetType === "rocky") return null;
    if (data.ringWallets.length > 0) return null;
    const colorMap: Record<string, THREE.Color> = {
      gas_giant:   new THREE.Color(0.75, 0.65, 0.50),
      ice_giant:   new THREE.Color(0.45, 0.75, 1.0),
      terrestrial: new THREE.Color(0.30, 0.58, 1.0),
    };
    const intensityMap: Record<string, number> = {
      gas_giant: 0.25, ice_giant: 0.50, terrestrial: 0.55,
    };
    const falloffMap: Record<string, number> = {
      gas_giant: 5.5, ice_giant: 4.5, terrestrial: 3.8,
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
          vec3 viewDir  = normalize(cameraPosition - vWorldPos);
          vec3 sunDir   = normalize(-vWorldPos);
          float sunFace = smoothstep(-0.1, 0.35, dot(vNorm, sunDir));
          float rim  = 1.0 - max(dot(vNorm, viewDir), 0.0);
          float glow = pow(rim, uFalloff) * uIntensity * sunFace;
          float edgeFade = smoothstep(1.0, 0.72, rim);
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

  // ── Inner Rayleigh haze shell (FrontSide) — terrestrial planets only ──
  // Simulates the visible semi-transparent atmosphere layer above the surface.
  const atmosHazeMat = useMemo(() => {
    if (data.planetType !== "terrestrial") return null;
    if (data.ringWallets.length > 0) return null;
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
        uniform vec3  uColorLow;   // horizon colour
        uniform vec3  uColorHigh;  // zenith colour (from camera pov)
        uniform float uHue;
        varying vec3  vNorm;
        varying vec3  vWorldPos;

        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          vec3 sunDir  = normalize(-vWorldPos);
          float NdotS  = dot(vNorm, sunDir);

          // sunFacing: 1 on day side, 0 on night, smooth terminator
          float sunFacing = smoothstep(-0.15, 0.3, NdotS);

          // Fresnel: 0 face-on, 1 at grazing edge
          float fresnel = 1.0 - max(dot(vNorm, viewDir), 0.0);

          // Rayleigh scattering at limb
          float rayleigh = pow(fresnel, 2.2);

          // Haze alpha — day side only
          float alpha = (rayleigh * 0.38 + fresnel * fresnel * fresnel * 0.24) * sunFacing;

          // Colour gradient
          vec3 col = mix(uColorHigh, uColorLow, pow(fresnel, 1.5));

          // Day-side warm tint near terminator
          float sunDot = max(NdotS, 0.0);
          col += vec3(0.06, 0.05, 0.02) * sunDot * (1.0 - fresnel);
          alpha += sunDot * 0.06 * (1.0 - fresnel * fresnel);

          gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.55));
        }
      `,
      uniforms: {
        uColorLow:  { value: new THREE.Color(0.22, 0.52, 1.0) },   // limb — deep blue
        uColorHigh: { value: new THREE.Color(0.55, 0.78, 1.0) },   // zenith — azure
        uHue:       { value: data.hue },
      },
      transparent: true,
      side: THREE.FrontSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }, [data.planetType, data.ringWallets.length, data.hue]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (orbitRef.current) orbitRef.current.rotation.y = data.initialAngle + data.orbitSpeed * t;
    if (meshRef.current)  meshRef.current.rotation.y  = 0.04 * t;
    // Animate clouds / bands
    material.uniforms.uTime.value = t;
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
      <group ref={orbitRef}>

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

        {/* Inner Rayleigh haze — terrestrial only (semi-transparent atmosphere above surface) */}
        {atmosHazeMat && (
          <mesh position={[data.orbitRadius, 0, 0]}>
            <sphereGeometry args={[data.radius * 1.018, 64, 64]} />
            <primitive object={atmosHazeMat} attach="material" />
          </mesh>
        )}

        {/* Outer rim glow — all non-rocky non-Saturn planets */}
        {atmosRimMat && (
          <mesh position={[data.orbitRadius, 0, 0]}>
            <sphereGeometry args={[data.radius * 1.06, 48, 48]} />
            <primitive object={atmosRimMat} attach="material" />
          </mesh>
        )}

        {/* Saturn ring + moon system (same tilt plane) */}
        {data.ringWallets.length > 0 && (
          <group position={[data.orbitRadius, 0, 0]}>
            <SaturnSystem
              data={data}
              selectedAddress={selectedAddress}
              onSelectAddress={onSelectAddress}
              onDeselect={onDeselect}
              panelOpen={panelOpen}
              showMoonLabels={showMoonLabels}
              showRingLabels={showRingLabels}
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

        {/* Moons (non-Saturn planets only — Saturn moons handled by SaturnSystem) */}
        {data.ringWallets.length === 0 && data.moons.map((moon, i) => (
          <MoonBody
            key={moon.wallet.address + i}
            data={moon}
            planetOrbit={data.orbitRadius}
            hostRadius={data.radius}
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
