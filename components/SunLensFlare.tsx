"use client";

/**
 * SunLensFlare — procedural screen-space lens flare when looking towards the sun.
 *
 * Renders multiple flare elements (ghosts, halo, starburst) along the
 * sun→screen-center axis. Fades out when the sun is off-screen or behind
 * the camera. Entirely GPU-driven — no textures needed.
 */

import React, { useRef, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/* ── Flare element definition ─────────────────────────────── */

interface FlareGhost {
  /** Position along the sun→center axis. 0 = sun, 1 = center, 2 = opposite */
  t:       number;
  /** Scale relative to base size */
  scale:   number;
  /** Colour */
  color:   THREE.Color;
  /** Opacity */
  opacity: number;
}

const GHOSTS: FlareGhost[] = [
  { t: 0.20, scale: 0.06, color: new THREE.Color(1.0, 0.95, 0.8),  opacity: 0.25 },
  { t: 0.45, scale: 0.12, color: new THREE.Color(0.6, 0.8,  1.0),  opacity: 0.12 },
  { t: 0.70, scale: 0.04, color: new THREE.Color(1.0, 0.7,  0.3),  opacity: 0.20 },
  { t: 1.00, scale: 0.20, color: new THREE.Color(0.5, 0.7,  1.0),  opacity: 0.06 },
  { t: 1.30, scale: 0.08, color: new THREE.Color(1.0, 0.85, 0.5),  opacity: 0.15 },
  { t: 1.60, scale: 0.15, color: new THREE.Color(0.4, 0.6,  1.0),  opacity: 0.08 },
  { t: 1.90, scale: 0.05, color: new THREE.Color(1.0, 0.9,  0.6),  opacity: 0.18 },
];

/* ── Shader: circular gradient with ring structure ────────── */

const FLARE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FLARE_FRAG = /* glsl */ `
  uniform vec3  uColor;
  uniform float uOpacity;
  uniform float uGhostType;  // 0 = filled disc, 1 = ring
  varying vec2  vUv;

  void main() {
    vec2 c = vUv - 0.5;
    float d = length(c) * 2.0;

    float alpha;
    if (uGhostType < 0.5) {
      // Soft filled disc
      alpha = smoothstep(1.0, 0.2, d) * uOpacity;
    } else {
      // Thin ring
      float ring = smoothstep(0.05, 0.0, abs(d - 0.7)) * 0.6
                 + smoothstep(0.08, 0.0, abs(d - 0.85)) * 0.4;
      alpha = ring * uOpacity;
    }

    gl_FragColor = vec4(uColor, alpha);
  }
`;

/* ── Halo shader ──────────────────────────────────────────── */

const HALO_FRAG = /* glsl */ `
  uniform vec3  uColor;
  uniform float uOpacity;
  varying vec2  vUv;

  void main() {
    vec2 c = vUv - 0.5;
    float d = length(c) * 2.0;
    // Soft glow halo
    float glow = exp(-d * d * 3.0) * 0.7 + exp(-d * 8.0) * 0.3;
    float alpha = glow * uOpacity;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

/* ── Starburst shader ─────────────────────────────────────── */

const BURST_FRAG = /* glsl */ `
  uniform vec3  uColor;
  uniform float uOpacity;
  uniform float uTime;
  varying vec2  vUv;

  void main() {
    vec2 c = vUv - 0.5;
    float d = length(c) * 2.0;
    float angle = atan(c.y, c.x);

    // 6-ray star pattern + slow rotation
    float rays = pow(abs(cos(angle * 3.0 + uTime * 0.15)), 12.0);
    // secondary finer rays
    rays += pow(abs(cos(angle * 6.0 - uTime * 0.08)), 20.0) * 0.4;

    float falloff = exp(-d * d * 4.5);
    float alpha = rays * falloff * uOpacity;

    gl_FragColor = vec4(uColor, alpha);
  }
`;

/* ── Component ────────────────────────────────────────────── */

export default function SunLensFlare() {
  const { camera, size } = useThree();
  const groupRef = useRef<THREE.Group>(null);

  // Ghost sprites (planes positioned in world space, face camera)
  const ghostMats = useMemo(() => GHOSTS.map((g, i) => new THREE.ShaderMaterial({
    vertexShader:   FLARE_VERT,
    fragmentShader: FLARE_FRAG,
    uniforms: {
      uColor:     { value: g.color },
      uOpacity:   { value: 0 },
      uGhostType: { value: i % 3 === 0 ? 1.0 : 0.0 },  // every 3rd = ring
    },
    transparent: true,
    depthWrite:  false,
    depthTest:   false,
    blending:    THREE.AdditiveBlending,
    side:        THREE.DoubleSide,
  })), []);

  // Main halo around sun
  const haloMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader:   FLARE_VERT,
    fragmentShader: HALO_FRAG,
    uniforms: {
      uColor:   { value: new THREE.Color(1.0, 0.92, 0.7) },
      uOpacity: { value: 0 },
    },
    transparent: true,
    depthWrite:  false,
    depthTest:   false,
    blending:    THREE.AdditiveBlending,
    side:        THREE.DoubleSide,
  }), []);

  // Starburst
  const burstMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader:   FLARE_VERT,
    fragmentShader: BURST_FRAG,
    uniforms: {
      uColor:   { value: new THREE.Color(1.0, 0.95, 0.8) },
      uOpacity: { value: 0 },
      uTime:    { value: 0 },
    },
    transparent: true,
    depthWrite:  false,
    depthTest:   false,
    blending:    THREE.AdditiveBlending,
    side:        THREE.DoubleSide,
  }), []);

  // Refs for ghost meshes
  const ghostRefs = useRef<(THREE.Mesh | null)[]>([]);
  const haloRef   = useRef<THREE.Mesh>(null);
  const burstRef  = useRef<THREE.Mesh>(null);

  // Shared plane geometry
  const planeGeo = useMemo(() => new THREE.PlaneGeometry(1, 1), []);

  useFrame((state) => {
    const sunWorldPos = new THREE.Vector3(0, 0, 0);  // sun is at origin

    // Project sun to NDC (-1..1)
    const sunNDC = sunWorldPos.clone().project(camera);

    // Is sun in front of camera?
    const sunDir    = sunWorldPos.clone().sub(camera.position);
    const camFwd    = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const dotFwd    = sunDir.dot(camFwd);
    const behindCam = dotFwd < 0;

    // Off-screen fade: distance from screen center in NDC
    const ndcDist   = Math.sqrt(sunNDC.x * sunNDC.x + sunNDC.y * sunNDC.y);
    const offScreen = ndcDist > 1.3 || behindCam;

    // Master intensity: fades near edge, 0 when off
    const edgeFade  = offScreen ? 0 : Math.max(0, 1.0 - ndcDist * 0.7);

    // Distance-based intensity: stronger when closer to sun
    const dist = camera.position.length();
    const distFade = Math.min(1.0, 600 / Math.max(dist, 1));

    const intensity = edgeFade * distFade;

    // Billboard: make all flare elements face camera
    const camQuat = camera.quaternion;

    // Flare axis: sun position on screen → screen center → extend opposite
    // In world space we place ghosts along sun→camera→beyond line
    const camPos   = camera.position;
    const toCamera = camPos.clone().sub(sunWorldPos).normalize();

    // Update time
    burstMat.uniforms.uTime.value = state.clock.elapsedTime;

    // Halo — always at sun position, billboard
    if (haloRef.current) {
      haloRef.current.position.copy(sunWorldPos);
      haloRef.current.quaternion.copy(camQuat);
      const haloSize = 280 * distFade;
      haloRef.current.scale.set(haloSize, haloSize, 1);
      haloMat.uniforms.uOpacity.value = intensity * 0.35;
    }

    // Starburst — at sun, larger
    if (burstRef.current) {
      burstRef.current.position.copy(sunWorldPos);
      burstRef.current.quaternion.copy(camQuat);
      const burstSize = 420 * distFade;
      burstRef.current.scale.set(burstSize, burstSize, 1);
      burstMat.uniforms.uOpacity.value = intensity * 0.20;
    }

    // Ghost elements along the flare axis
    GHOSTS.forEach((g, i) => {
      const mesh = ghostRefs.current[i];
      if (!mesh) return;

      // Position: lerp from sun towards camera and beyond
      const ghostPos = sunWorldPos.clone().lerp(camPos, g.t * 0.5);
      mesh.position.copy(ghostPos);
      mesh.quaternion.copy(camQuat);

      const s = g.scale * dist * 0.4;
      mesh.scale.set(s, s, 1);

      ghostMats[i].uniforms.uOpacity.value = intensity * g.opacity;
    });
  });

  return (
    <group ref={groupRef}>
      {/* Halo glow */}
      <mesh ref={haloRef} geometry={planeGeo} material={haloMat} renderOrder={999} />

      {/* Starburst rays */}
      <mesh ref={burstRef} geometry={planeGeo} material={burstMat} renderOrder={999} />

      {/* Ghost elements */}
      {GHOSTS.map((_, i) => (
        <mesh
          key={i}
          ref={el => { ghostRefs.current[i] = el; }}
          geometry={planeGeo}
          material={ghostMats[i]}
          renderOrder={999}
        />
      ))}
    </group>
  );
}
