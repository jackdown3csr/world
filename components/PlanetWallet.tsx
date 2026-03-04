"use client";

import React, { useRef, useMemo, useState, useCallback, useEffect } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

import type { PlanetData } from "@/lib/layout";
import { createPlanetMaterial, createMarsMaterial } from "@/lib/shaders/planetMaterial";
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
  showTrails?: boolean;
  onShiftSelect?: (addr: string) => void;
}

const TRAIL_N   = 60;
const TRAIL_SEC = 30;

export default function PlanetWallet({ data, selected, panelOpen, onSelect, onDeselect, selectedAddress, onSelectAddress, showLabel, showMoonLabels, showRingLabels, showRenamedOnly, showTrails, onShiftSelect }: PlanetWalletProps) {
  const orbitRef = useRef<THREE.Group>(null);
  const meshRef  = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  // One ShaderMaterial per planet — unique uniforms (hue, seed, type, time)
  const material = useMemo(
    () => data.isMars
      ? createMarsMaterial(data.hue, data.seed)
      : createPlanetMaterial(data.planetType, data.hue, data.seed, data.ringWallets.length > 0),
    [data.planetType, data.hue, data.seed, data.ringWallets.length, data.isMars],
  );

  // ── Outer rim-glow shell (BackSide) — non-rocky (except Mars), non-Saturn planets ──
  const atmosRimMat = useMemo(() => {
    // Mars gets its own dusty orange-pink glow even though it's rocky
    const isMarsGlow = data.isMars;
    if (data.planetType === "rocky" && !isMarsGlow) return null;
    if (data.ringWallets.length > 0) return null;
    const colorMap: Record<string, THREE.Color> = {
      gas_giant:   new THREE.Color(0.75, 0.65, 0.50),
      ice_giant:   new THREE.Color(0.45, 0.75, 1.0),
      terrestrial: new THREE.Color(0.30, 0.58, 1.0),
      // Mars: dusty salmon/orange atmosphere
      rocky:       new THREE.Color(0.82, 0.40, 0.18),
    };
    const intensityMap: Record<string, number> = {
      gas_giant: 0.25, ice_giant: 0.50, terrestrial: 0.55,
      rocky: 0.30,   // Mars — subtle but visible
    };
    const falloffMap: Record<string, number> = {
      gas_giant: 5.5, ice_giant: 4.5, terrestrial: 3.8,
      rocky: 4.2,    // Mars
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
  }, [data.planetType, data.ringWallets.length, data.isMars]);

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

  // ── Lock-expiry warning glow ──
  // Pulses red (≤ 30 days), amber (≤ 90 days), or silent.
  const expiryGlowMat = useMemo(() => {
    const lockEnd = data.wallet.lockEnd;
    if (!lockEnd || lockEnd === 0) return null;
    const daysLeft = (lockEnd - Date.now() / 1000) / 86400;
    if (daysLeft > 90) return null;

    const color     = daysLeft <= 30
      ? new THREE.Color(1.00, 0.18, 0.04)   // urgent red
      : new THREE.Color(0.95, 0.55, 0.05);  // caution amber
    const intensity = daysLeft <= 30 ? 0.55 : 0.35;

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
      `,
      uniforms: {
        uColor:     { value: color },
        uIntensity: { value: intensity },
        uTime:      { value: 0 },
      },
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }, [data.wallet.lockEnd]);

  // ── LOD geometries (distance-adaptive tessellation) ──
  const _lodPos = useMemo(() => new THREE.Vector3(), []);
  const planetGeos = useMemo(() => [
    new THREE.SphereGeometry(data.radius, 64, 64),   // close
    new THREE.SphereGeometry(data.radius, 32, 32),   // mid
    new THREE.SphereGeometry(data.radius, 16, 16),   // far
  ], [data.radius]);
  const lodRef = useRef(0);
  useEffect(() => () => { planetGeos.forEach(g => g.dispose()); }, [planetGeos]);

  // ── Orbit trail geometry ──
  const trailPositions = useMemo(() => new Float32Array(TRAIL_N * 3), []);
  const trailColors    = useMemo(() => new Float32Array(TRAIL_N * 3), []);
  const trailGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(trailPositions, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("color",    new THREE.BufferAttribute(trailColors,    3).setUsage(THREE.DynamicDrawUsage));
    return g;
  }, [trailPositions, trailColors]);
  const trailMat = useMemo(
    () => new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent:  true,
      opacity:      0.40,
      depthWrite:   false,
      blending:     THREE.AdditiveBlending,
    }),
    [],
  );
  const trailLine = useMemo(() => {
    const line = new THREE.Line(trailGeo, trailMat);
    line.frustumCulled = false;   // bounding sphere never updates; skip culling
    return line;
  }, [trailGeo, trailMat]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (orbitRef.current) orbitRef.current.rotation.y = data.initialAngle + data.orbitSpeed * t;
    if (meshRef.current)  meshRef.current.rotation.y  = 0.04 * t;
    material.uniforms.uTime.value = t;
    if (expiryGlowMat) expiryGlowMat.uniforms.uTime.value = t;

    // LOD: swap sphere tessellation based on camera distance
    if (meshRef.current) {
      meshRef.current.getWorldPosition(_lodPos);
      const d = _lodPos.distanceTo(state.camera.position);
      const lod = d < 80 ? 0 : d < 300 ? 1 : 2;
      if (lod !== lodRef.current) {
        lodRef.current = lod;
        meshRef.current.geometry = planetGeos[lod];
      }
    }

    // Analytically compute moon world positions for transit shadow uniforms.
    // Transform chain: Rx(planet.tilt) → Ry(planetAngle) → T(orbitR) → Rx(moon.tilt) → Ry(moonAngle) → T(moon.orbitR)
    // ── Update trail ──
    if (showTrails) {
      const pos = trailGeo.attributes.position as THREE.BufferAttribute;
      const col = trailGeo.attributes.color    as THREE.BufferAttribute;
      for (let i = 0; i < TRAIL_N; i++) {
        const frac  = i / (TRAIL_N - 1);           // 0 = oldest tail, 1 = current head
        const ti    = t - TRAIL_SEC * (1 - frac);
        const angle = data.initialAngle + data.orbitSpeed * ti;
        pos.setXYZ(i, data.orbitRadius * Math.cos(angle), 0, data.orbitRadius * Math.sin(angle));
        col.setXYZ(i, 0.0, frac * 0.45, frac * 0.75);  // fade from black → dim cyan
      }
      pos.needsUpdate = true;
      col.needsUpdate = true;
    }

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
      {/* Orbit trail — lives in tilted-group local space so tilt is inherited */}
      {showTrails && <primitive object={trailLine} />}

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
          <primitive object={planetGeos[lodRef.current]} attach="geometry" />
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

        {/* Lock-expiry warning pulse — behind other glows */}
        {expiryGlowMat && (
          <mesh position={[data.orbitRadius, 0, 0]}>
            <sphereGeometry args={[data.radius * 1.22, 32, 32]} />
            <primitive object={expiryGlowMat} attach="material" />
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
            }}>              <span style={{ color: "rgba(0,229,255,0.55)", marginRight: 4 }}>#{data.vpRank}</span>              {data.wallet.customName || `${data.wallet.address.slice(0, 6)}\u2026${data.wallet.address.slice(-4)}`}
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
