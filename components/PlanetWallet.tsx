"use client";

import React, { useRef, useMemo, useState, useCallback, useEffect } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import SpriteLabel from "./SpriteLabel";
import * as THREE from "three";

import type { PlanetData } from "@/lib/layout";
import { createPlanetMaterial, createMarsMaterial } from "@/lib/shaders/planetMaterial";
import { PLANET_GEOS, ATMOS_HAZE_GEO, ATMOS_RIM_GEO, ATMOS_EXPIRY_GEO } from "@/lib/geometryPool";
import WalletTooltip, { type WalletTooltipVariant } from "./WalletTooltip";
import MoonBody from "./MoonBody";
import SaturnSystem from "./SaturnSystem";

/* ── Shared atmosphere shader source (extracted for prototype caching) ─── */
const ATMOS_VERT = /* glsl */ `
  varying vec3 vNorm;
  varying vec3 vWorldPos;
  void main() {
    vNorm = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const ATMOS_RIM_FRAG = /* glsl */ `
  uniform vec3  uStarPos;
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uFalloff;
  varying vec3 vNorm;
  varying vec3 vWorldPos;
  void main() {
    vec3 viewDir  = normalize(cameraPosition - vWorldPos);
    vec3 sunDir   = normalize(uStarPos - vWorldPos);
    float sunFace = smoothstep(-0.1, 0.35, dot(vNorm, sunDir));
    float rim  = 1.0 - max(dot(vNorm, viewDir), 0.0);
    float glow = pow(rim, uFalloff) * uIntensity * sunFace;
    float edgeFade = smoothstep(1.0, 0.72, rim);
    glow *= edgeFade;
    gl_FragColor = vec4(uColor * glow, glow);
  }
`;

const ATMOS_HAZE_FRAG = /* glsl */ `
  uniform vec3  uStarPos;
  uniform vec3  uColorLow;
  uniform vec3  uColorHigh;
  uniform float uHue;
  varying vec3  vNorm;
  varying vec3  vWorldPos;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    vec3 sunDir  = normalize(uStarPos - vWorldPos);
    float NdotS  = dot(vNorm, sunDir);
    float sunFacing = smoothstep(-0.15, 0.3, NdotS);
    float fresnel = 1.0 - max(dot(vNorm, viewDir), 0.0);
    float rayleigh = pow(fresnel, 2.2);
    float alpha = (rayleigh * 0.38 + fresnel * fresnel * fresnel * 0.24) * sunFacing;
    vec3 col = mix(uColorHigh, uColorLow, pow(fresnel, 1.5));
    float sunDot = max(NdotS, 0.0);
    col += vec3(0.06, 0.05, 0.02) * sunDot * (1.0 - fresnel);
    alpha += sunDot * 0.06 * (1.0 - fresnel * fresnel);
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.55));
  }
`;

const EXPIRY_GLOW_FRAG = /* glsl */ `
  uniform vec3  uColor;
  uniform float uIntensity;
  uniform float uTime;
  varying vec3  vNorm;
  varying vec3  vWorldPos;
  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float rim    = 1.0 - max(dot(vNorm, viewDir), 0.0);
    float pulse  = 0.60 + 0.40 * sin(uTime * 2.8);
    float glow   = pow(rim, 2.2) * uIntensity * pulse;
    gl_FragColor = vec4(uColor * glow, glow * 0.9);
  }
`;

/* ── Prototype caches: one compiled program per shader type ──────── */
let atmosRimProto: THREE.ShaderMaterial | null = null;
let atmosHazeProto: THREE.ShaderMaterial | null = null;
let expiryGlowProto: THREE.ShaderMaterial | null = null;

function cloneAtmosRimMat(color: THREE.Color, intensity: number, falloff: number): THREE.ShaderMaterial {
  if (!atmosRimProto) {
    atmosRimProto = new THREE.ShaderMaterial({
      vertexShader: ATMOS_VERT, fragmentShader: ATMOS_RIM_FRAG,
      uniforms: { uColor: { value: new THREE.Color() }, uIntensity: { value: 0 }, uFalloff: { value: 0 }, uStarPos: { value: new THREE.Vector3() } },
      transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
    });
  }
  const mat = atmosRimProto.clone();
  mat.uniforms.uColor     = { value: color };
  mat.uniforms.uIntensity = { value: intensity };
  mat.uniforms.uFalloff   = { value: falloff };
  mat.uniforms.uStarPos   = { value: new THREE.Vector3(0, 0, 0) };
  return mat;
}

function cloneAtmosHazeMat(hue: number): THREE.ShaderMaterial {
  if (!atmosHazeProto) {
    atmosHazeProto = new THREE.ShaderMaterial({
      vertexShader: ATMOS_VERT, fragmentShader: ATMOS_HAZE_FRAG,
      uniforms: { uColorLow: { value: new THREE.Color() }, uColorHigh: { value: new THREE.Color() }, uHue: { value: 0 }, uStarPos: { value: new THREE.Vector3() } },
      transparent: true, side: THREE.FrontSide, depthWrite: false, blending: THREE.AdditiveBlending,
    });
  }
  const mat = atmosHazeProto.clone();
  mat.uniforms.uColorLow  = { value: new THREE.Color(0.22, 0.52, 1.0) };
  mat.uniforms.uColorHigh = { value: new THREE.Color(0.55, 0.78, 1.0) };
  mat.uniforms.uHue       = { value: hue };
  mat.uniforms.uStarPos   = { value: new THREE.Vector3(0, 0, 0) };
  return mat;
}

function cloneExpiryGlowMat(color: THREE.Color, intensity: number): THREE.ShaderMaterial {
  if (!expiryGlowProto) {
    expiryGlowProto = new THREE.ShaderMaterial({
      vertexShader: ATMOS_VERT, fragmentShader: EXPIRY_GLOW_FRAG,
      uniforms: { uColor: { value: new THREE.Color() }, uIntensity: { value: 0 }, uTime: { value: 0 } },
      transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
    });
  }
  const mat = expiryGlowProto.clone();
  mat.uniforms.uColor     = { value: color };
  mat.uniforms.uIntensity = { value: intensity };
  mat.uniforms.uTime      = { value: 0 };
  return mat;
}

interface PlanetWalletProps {
  data:     PlanetData;
  starWorldPosition: [number, number, number];
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
  onShiftSelect?: (addr: string) => void;
  detailVariant?: WalletTooltipVariant;
  paused?: boolean;
}

export default function PlanetWallet({ data, starWorldPosition, selected, panelOpen, onSelect, onDeselect, selectedAddress, onSelectAddress, showLabel, showMoonLabels, showRingLabels, showRenamedOnly, onShiftSelect, detailVariant = "wallet", paused = false }: PlanetWalletProps) {
  const orbitRef = useRef<THREE.Group>(null);
  const meshRef  = useRef<THREE.Mesh>(null);
  const simTimeRef = useRef(0);
  const [hovered, setHovered] = useState(false);
  const starWorldPos = useMemo(
    () => new THREE.Vector3(starWorldPosition[0], starWorldPosition[1], starWorldPosition[2]),
    [starWorldPosition],
  );

  // One ShaderMaterial per planet — unique uniforms (hue, seed, type, time)
  const material = useMemo(
    () => data.isMars
      ? createMarsMaterial(data.hue, data.seed)
      : createPlanetMaterial(data.planetType, data.hue, data.seed, data.ringWallets.length > 0),
    [data.planetType, data.hue, data.seed, data.ringWallets.length, data.isMars],
  );

  // ── Outer rim-glow shell (BackSide) — non-rocky (except Mars), non-Saturn planets ──
  const atmosRimMat = useMemo(() => {
    const isMarsGlow = data.isMars;
    if (data.planetType === "rocky" && !isMarsGlow) return null;
    if (data.ringWallets.length > 0) return null;
    const colorMap: Record<string, THREE.Color> = {
      gas_giant:   new THREE.Color(0.75, 0.65, 0.50),
      ice_giant:   new THREE.Color(0.45, 0.75, 1.0),
      terrestrial: new THREE.Color(0.30, 0.58, 1.0),
      rocky:       new THREE.Color(0.82, 0.40, 0.18),
    };
    const intensityMap: Record<string, number> = {
      gas_giant: 0.25, ice_giant: 0.50, terrestrial: 0.55,
      rocky: 0.30,
    };
    const falloffMap: Record<string, number> = {
      gas_giant: 5.5, ice_giant: 4.5, terrestrial: 3.8,
      rocky: 4.2,
    };
    return cloneAtmosRimMat(
      colorMap[data.planetType] ?? new THREE.Color(0.5, 0.7, 1.0),
      intensityMap[data.planetType] ?? 0.4,
      falloffMap[data.planetType] ?? 4.5,
    );
  }, [data.planetType, data.ringWallets.length, data.isMars]);

  // ── Inner Rayleigh haze shell (FrontSide) — terrestrial planets only ──
  const atmosHazeMat = useMemo(() => {
    if (data.planetType !== "terrestrial") return null;
    if (data.ringWallets.length > 0) return null;
    return cloneAtmosHazeMat(data.hue);
  }, [data.planetType, data.ringWallets.length, data.hue]);

  // ── Lock-expiry warning glow ──
  const expiryGlowMat = useMemo(() => {
    const lockEnd = data.wallet.lockEnd;
    if (!lockEnd || lockEnd === 0) return null;
    const daysLeft = (lockEnd - Date.now() / 1000) / 86400;
    if (daysLeft > 90) return null;

    const color     = daysLeft <= 30
      ? new THREE.Color(1.00, 0.18, 0.04)
      : new THREE.Color(0.95, 0.55, 0.05);
    const intensity = daysLeft <= 30 ? 0.55 : 0.35;

    return cloneExpiryGlowMat(color, intensity);
  }, [data.wallet.lockEnd]);

  // ── LOD geometries (shared unit-sphere pool, scaled by mesh.scale) ──
  const _lodPos = useMemo(() => new THREE.Vector3(), []);
  const lodRef = useRef(0);

  useFrame((state, delta) => {
    if (!paused) simTimeRef.current += delta;
    const t = simTimeRef.current;
    if (orbitRef.current) orbitRef.current.rotation.y = data.initialAngle + data.orbitSpeed * t;
    if (meshRef.current)  meshRef.current.rotation.y  = 0.04 * t;
    material.uniforms.uTime.value = t;
    material.uniforms.uStarPos.value.copy(starWorldPos);
    if (expiryGlowMat) expiryGlowMat.uniforms.uTime.value = t;
    if (atmosRimMat) atmosRimMat.uniforms.uStarPos.value.copy(starWorldPos);
    if (atmosHazeMat) atmosHazeMat.uniforms.uStarPos.value.copy(starWorldPos);

    // LOD: swap sphere tessellation based on camera distance
    if (meshRef.current) {
      meshRef.current.getWorldPosition(_lodPos);
      const d = _lodPos.distanceTo(state.camera.position);
      const lod = d < 80 ? 0 : d < 300 ? 1 : 2;
      if (lod !== lodRef.current) {
        lodRef.current = lod;
        meshRef.current.geometry = PLANET_GEOS[lod];
      }
    }

    // Analytically compute moon world positions for transit shadow uniforms.
    // Transform chain: Rx(planet.tilt) → Ry(planetAngle) → T(orbitR) → Rx(moon.tilt) → Ry(moonAngle) → T(moon.orbitR)

    if (data.moons.length > 0) {
      const planetAngle = data.initialAngle + data.orbitSpeed * t;
      const cp = Math.cos(planetAngle), sp = Math.sin(planetAngle);
      const cpt = Math.cos(data.tilt),  spt = Math.sin(data.tilt);
      const moonPositions = material.uniforms.uMoonPos.value as THREE.Vector3[];
      const moonRadii     = material.uniforms.uMoonRad.value as number[];

      data.moons.forEach((moon, i) => {
        if (i >= 6) return;
        const moonAngle = moon.initialAngle + moon.orbitSpeed * t;
        const cmoon = Math.cos(moonAngle), smoon = Math.sin(moonAngle);
        const cm = Math.cos(moon.tilt), sm = Math.sin(moon.tilt);

        // Moon orbit rotation (in moonOrbit local frame)
        const lx = moon.orbitRadius * cmoon;
        const lz = moon.orbitRadius * smoon;
        // Apply moon orbital tilt Rx(moon.tilt)
        const ly2 =  -lz * sm;
        const lz2 =   lz * cm;
        // Add planet-centre offset
        const ox = lx + data.orbitRadius, oy = ly2, oz = lz2;
        // Apply planet orbit rotation Ry(planetAngle)
        const wx = ox * cp - oz * sp;
        const wy = oy;
        const wz = ox * sp + oz * cp;
        // Apply planet axial tilt Rx(planet.tilt)
        moonPositions[i].set(wx, wy * cpt - wz * spt, wy * spt + wz * cpt);
        moonRadii[i] = moon.radius;
      });
      material.uniforms.uMoonCount.value = Math.min(data.moons.length, 6);
    }
  });

  const onPointerEnter = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer";
  }, []);
  const onPointerLeave = useCallback(() => {
    setHovered(false); document.body.style.cursor = "auto";
  }, []);
  const onClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.nativeEvent.shiftKey && onShiftSelect) {
      onShiftSelect(data.wallet.address);
    } else {
      onSelect();
    }
  }, [onSelect, onShiftSelect, data.wallet.address]);

  return (
    <group rotation={[data.tilt, 0, 0]}>
      <group ref={orbitRef}>

        {/* Planet sphere */}
        <mesh
          ref={meshRef}
          position={[data.orbitRadius, 0, 0]}
          scale={data.radius}
          userData={{ walletAddress: data.wallet.address.toLowerCase(), bodyRadius: data.radius, bodyType: "planet" }}
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
          onClick={onClick}
        >
          <primitive object={PLANET_GEOS[lodRef.current]} attach="geometry" />
          <primitive object={material} attach="material" />
        </mesh>

        {/* Inner Rayleigh haze — terrestrial only (semi-transparent atmosphere above surface) */}
        {atmosHazeMat && (
          <mesh position={[data.orbitRadius, 0, 0]} scale={data.radius * 1.018}>
            <primitive object={ATMOS_HAZE_GEO} attach="geometry" />
            <primitive object={atmosHazeMat} attach="material" />
          </mesh>
        )}

        {/* Outer rim glow — all non-rocky non-Saturn planets */}
        {atmosRimMat && (
          <mesh position={[data.orbitRadius, 0, 0]} scale={data.radius * 1.06}>
            <primitive object={ATMOS_RIM_GEO} attach="geometry" />
            <primitive object={atmosRimMat} attach="material" />
          </mesh>
        )}

        {/* Lock-expiry warning pulse — behind other glows */}
        {expiryGlowMat && (
          <mesh position={[data.orbitRadius, 0, 0]} scale={data.radius * 1.22}>
            <primitive object={ATMOS_EXPIRY_GEO} attach="geometry" />
            <primitive object={expiryGlowMat} attach="material" />
          </mesh>
        )}

        {/* Saturn ring + moon system (same tilt plane) */}
        {data.ringWallets.length > 0 && (
          <group position={[data.orbitRadius, 0, 0]}>
            <SaturnSystem
              data={data}
              starWorldPosition={starWorldPosition}
              selectedAddress={selectedAddress}
              onSelectAddress={onSelectAddress}
              onDeselect={onDeselect}
              panelOpen={panelOpen}
              showMoonLabels={showMoonLabels}
              showRingLabels={showRingLabels}
              showRenamedOnly={showRenamedOnly}
              paused={paused}
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
            <WalletTooltip wallet={data.wallet} onClose={(selected && panelOpen) ? onDeselect : undefined} variant={detailVariant} />
          </Html>
        )}

        {/* Persistent name label */}
        {showLabel && !hovered && !(selected && panelOpen) && (
          (!showRenamedOnly || data.wallet.customName) ? (
          <SpriteLabel
            position={[data.orbitRadius, data.radius + 0.4, 0]}
            text={`${detailVariant === "vesting" ? "◈ " : detailVariant === "pool" ? "" : `#${data.vpRank} `}${data.wallet.customName || `${data.wallet.address.slice(0, 6)}\u2026${data.wallet.address.slice(-4)}`}`}
            color={detailVariant === "vesting" ? "#7ccedd" : detailVariant === "pool" ? "#ffe08a" : "#90b8d0"}
            fontSize={0.4}
            opacity={0.85}
            onClick={onSelect}
          />
          ) : null
        )}

        {/* Moons (non-Saturn planets only — Saturn moons handled by SaturnSystem) */}
        {data.ringWallets.length === 0 && data.moons.map((moon, i) => (
          <MoonBody
            key={moon.wallet.address + i}
            data={moon}
            starWorldPosition={starWorldPosition}
            planetOrbit={data.orbitRadius}
            hostRadius={data.radius}
            selected={selectedAddress?.toLowerCase() === moon.wallet.address.toLowerCase()}
            panelOpen={panelOpen}
            onSelect={() => onSelectAddress(moon.wallet.address)}
            onDeselect={onDeselect}
            showLabel={showMoonLabels}
            showRenamedOnly={showRenamedOnly}
            detailVariant={detailVariant}
            paused={paused}
          />
        ))}
      </group>
    </group>
  );
}
