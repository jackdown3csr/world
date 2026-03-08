"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import BridgeObject from "./BridgeObject";
import type { BridgeSceneObject } from "@/lib/bridges";

// ─── shared materials ─────────────────────────────────────────────────────────

const RING_MAT = new THREE.MeshStandardMaterial({
  color: "#4a6275",
  metalness: 0.94,
  roughness: 0.10,
  emissive: "#0b1d2e",
  emissiveIntensity: 0.20,
});

const PANEL_MAT = new THREE.MeshStandardMaterial({
  color: "#38505f",
  metalness: 0.90,
  roughness: 0.20,
  emissive: "#0e2438",
  emissiveIntensity: 0.28,
});

const NODE_MAT = new THREE.MeshStandardMaterial({
  color: "#7ae4f2",
  metalness: 0.22,
  roughness: 0.36,
  emissive: "#2ad8ee",
  emissiveIntensity: 1.5,
});

const EDGE_MAT = new THREE.MeshStandardMaterial({
  color: "#5bb8c8",
  metalness: 0.55,
  roughness: 0.28,
  emissive: "#1fb8cc",
  emissiveIntensity: 0.75,
});

// ─── vortex shader ────────────────────────────────────────────────────────────

const VORTEX_VERT = /* glsl */ `
  uniform float uPulseTime;
  uniform float uOutboundPulse;
  uniform float uInboundPulse;
  varying vec2 vUv;
  void main() {
    vUv = uv * 2.0 - 1.0;
    vec3 pos = position;
    float r = length(vUv);
    float pulseWave = sin(r * 18.0 - uPulseTime * 10.0);
    float pulseStrength = (uOutboundPulse * 0.16 + uInboundPulse * 0.12) * smoothstep(1.0, 0.12, r);
    pos.z += pulseWave * pulseStrength;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const VORTEX_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uPulseTime;
  uniform float uOutboundPulse;
  uniform float uInboundPulse;
  varying vec2 vUv;

  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;

    float ang = atan(vUv.y, vUv.x);

    // spiral arms – two counter-rotating layers
    float s1 = sin(ang * 5.0 - uTime * 2.0 + r * 16.0) * 0.5 + 0.5;
    float s2 = sin(ang * 3.0 + uTime * 0.9 - r *  9.0) * 0.5 + 0.5;
    float swirl = s1 * 0.65 + s2 * 0.35;

    // concentric energy rings
    float ring1 = smoothstep(0.045, 0.0, abs(r - 0.28));
    float ring2 = smoothstep(0.035, 0.0, abs(r - 0.54));
    float ring3 = smoothstep(0.025, 0.0, abs(r - 0.76));
    float rings  = ring1 + ring2 * 0.72 + ring3 * 0.45;

    // masks
    float hole = smoothstep(0.0, 0.16, r);          // dark center
    float fade = smoothstep(1.0, 0.20, r);           // radial fade to ring edge
    float pulse = 0.62 + 0.38 * sin(uTime * 1.4);
    float transactionWave = sin(r * 22.0 - uPulseTime * 11.0) * 0.5 + 0.5;

    float glow = swirl * fade * hole;

    // palette: deep space blue → electric blue → cyan white
    vec3 deep   = vec3(0.02, 0.04, 0.20);
    vec3 mid    = vec3(0.05, 0.30, 0.80);
    vec3 bright = vec3(0.40, 0.92, 0.98);
    vec3 white  = vec3(0.80, 0.98, 1.00);
    vec3 outbound = vec3(0.44, 0.94, 1.00);
    vec3 inbound = vec3(1.00, 0.72, 0.46);

    vec3 col = mix(deep, mid,    glow * 0.55 + fade * 0.22);
    col      = mix(col,  bright, glow * glow * 0.60);
    col     += white * rings * (0.75 + pulse * 0.25);
    col     += outbound * transactionWave * uOutboundPulse * (0.35 + rings * 0.35);
    col     += inbound * (1.0 - transactionWave) * uInboundPulse * (0.32 + rings * 0.32);

    float alpha = (glow * 0.78 + rings * 0.68 + transactionWave * uOutboundPulse * 0.24 + (1.0 - transactionWave) * uInboundPulse * 0.22) * fade * 0.94;
    alpha *= smoothstep(1.0, 0.86, r);

    gl_FragColor = vec4(col * (0.88 + 0.12 * alpha), alpha);
  }
`;

// ─── component ────────────────────────────────────────────────────────────────

interface HyperlanePortalProps {
  bridge: BridgeSceneObject;
  onSelect: (bridgeId: string) => void;
  showLabel?: boolean;
  paused?: boolean;
}

export default function HyperlanePortal({ bridge, onSelect, showLabel = true, paused = false }: HyperlanePortalProps) {
  const rigRef  = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Group>(null);
  const simTimeRef = useRef(0);
  const outboundPulseRef = useRef(0);
  const inboundPulseRef = useRef(0);
  const pulseBootstrappedRef = useRef(false);
  const lastOutboundPulseAtRef = useRef<number | null>(null);
  const lastInboundPulseAtRef = useRef<number | null>(null);
  const outboundStrength = Math.min(1, bridge.stats.outboundRecentTransfers / 4);
  const inboundStrength = Math.min(1, bridge.stats.inboundRecentTransfers / 4);
  const activityStrength = bridge.status === "active"
    ? 1
    : bridge.status === "quiet"
      ? 0.5
      : 0.2;

  const R = bridge.bodyRadius; // 34

  const coreMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: VORTEX_VERT,
    fragmentShader: VORTEX_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uPulseTime: { value: 0 },
      uOutboundPulse: { value: 0 },
      uInboundPulse: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  }), []);

  useEffect(() => {
    if (!pulseBootstrappedRef.current) {
      pulseBootstrappedRef.current = true;
      lastOutboundPulseAtRef.current = bridge.stats.lastOutboundAt;
      lastInboundPulseAtRef.current = bridge.stats.lastInboundAt;
      return;
    }

    if (bridge.stats.lastOutboundAt && bridge.stats.lastOutboundAt !== lastOutboundPulseAtRef.current) {
      outboundPulseRef.current = 1;
      lastOutboundPulseAtRef.current = bridge.stats.lastOutboundAt;
    }

    if (bridge.stats.lastInboundAt && bridge.stats.lastInboundAt !== lastInboundPulseAtRef.current) {
      inboundPulseRef.current = 1;
      lastInboundPulseAtRef.current = bridge.stats.lastInboundAt;
    }
  }, [bridge.stats.lastInboundAt, bridge.stats.lastOutboundAt]);

  // 12 panel segments evenly around the ring perimeter.
  // Every 3rd (i % 3 === 0) is a larger "node" with a glowing emitter sphere.
  const segments = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => {
      const angle  = (i / 12) * Math.PI * 2;
      const isNode = i % 3 === 0;
      const rPos   = R * 0.84;
      return {
        key:    `seg-${i}`,
        isNode,
        pos:    [Math.cos(angle) * rPos, Math.sin(angle) * rPos, 0] as [number, number, number],
        rot:    [0, 0, angle] as [number, number, number],
        // box: [radial extent, tangential extent, axial depth]
        box:    isNode ? [6.5, 8.5, 4.8] : [4.8, 6.0, 3.4] as [number, number, number],
        fwd:    isNode ? 2.8 : 2.0,   // Z offset of front emitter
      };
    }), [R]);

  useFrame((_, delta) => {
    if (!paused) simTimeRef.current += delta;
    const t = simTimeRef.current;
    outboundPulseRef.current = Math.max(0, outboundPulseRef.current - delta * 0.58);
    inboundPulseRef.current = Math.max(0, inboundPulseRef.current - delta * 0.58);
    const pulseStrength = Math.max(outboundPulseRef.current, inboundPulseRef.current);
    if (rigRef.current) {
      rigRef.current.position.y = Math.sin(t * (0.22 + activityStrength * 0.12)) * (1.4 + activityStrength * 1.5);
      rigRef.current.rotation.y = 0.20 + Math.sin(t * 0.10) * (0.03 + activityStrength * 0.04);
      rigRef.current.rotation.x = 0.09 + Math.sin(t * 0.14) * (0.01 + activityStrength * 0.03);
      const pulseScale = 1 + pulseStrength * 0.045;
      rigRef.current.scale.setScalar(pulseScale);
    }
    if (ringRef.current && !paused) ringRef.current.rotation.z += delta * (0.018 + activityStrength * 0.028);
    coreMat.uniforms.uTime.value = t;
    coreMat.uniforms.uPulseTime.value = t;
    coreMat.uniforms.uOutboundPulse.value = outboundPulseRef.current;
    coreMat.uniforms.uInboundPulse.value = inboundPulseRef.current;
    RING_MAT.emissiveIntensity = 0.20 + outboundPulseRef.current * 0.18 + inboundPulseRef.current * 0.12;
    EDGE_MAT.emissiveIntensity = 0.75 + outboundPulseRef.current * 0.38 + inboundPulseRef.current * 0.22;
  });

  return (
    <BridgeObject bridge={bridge} onSelect={onSelect} showLabel={showLabel}>
      <group ref={rigRef}>
        <pointLight color="#4de8ff" intensity={1.4 + activityStrength * 2.2} distance={160 + activityStrength * 40} decay={2} />
        <pointLight color="#1a6aff" intensity={0.6 + activityStrength * 1.4} distance={210 + activityStrength * 40} decay={2} position={[0, 0, -22]} />

        {/* ── rotating technical ring ────────────────────────────────────── */}
        <group ref={ringRef}>

          {/* main structural torus */}
          <mesh material={RING_MAT}>
            <torusGeometry args={[R * 0.84, 2.8, 28, 128]} />
          </mesh>

          {/* inner glowing aperture edge */}
          <mesh material={NODE_MAT} position={[0, 0, 0.4]}>
            <torusGeometry args={[R * 0.77, 0.55, 14, 90]} />
          </mesh>

          {/* outer accent band */}
          <mesh material={EDGE_MAT} position={[0, 0, -0.5]}>
            <torusGeometry args={[R * 0.92, 0.85, 14, 90]} />
          </mesh>

          <mesh position={[0, 0, 1.2]}>
            <torusGeometry args={[R * 0.68, 0.20 + outboundStrength * 0.24, 14, 96]} />
            <meshBasicMaterial
              color="#74efff"
              transparent
              opacity={0.12 + outboundStrength * 0.5}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>

          <mesh position={[0, 0, -1.35]}>
            <torusGeometry args={[R * 0.61, 0.18 + inboundStrength * 0.24, 14, 96]} />
            <meshBasicMaterial
              color="#ffb16e"
              transparent
              opacity={0.10 + inboundStrength * 0.45}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>

          {/* 12 panel segments */}
          {segments.map((seg) => (
            <group key={seg.key} position={seg.pos} rotation={seg.rot}>
              {/* main panel body */}
              <mesh material={PANEL_MAT}>
                <boxGeometry args={seg.box as [number, number, number]} />
              </mesh>
              {/* front emitter: sphere for nodes, thin strip for regular */}
              {seg.isNode ? (
                <mesh position={[0, 0, seg.fwd]} material={NODE_MAT}>
                  <sphereGeometry args={[1.35, 10, 10]} />
                </mesh>
              ) : (
                <mesh position={[0, 0, seg.fwd]} material={EDGE_MAT}>
                  <boxGeometry args={[2.8, 4.4, 0.5]} />
                </mesh>
              )}
            </group>
          ))}
        </group>

        {/* ── vortex – coplanar with the ring, in rigRef XY plane ──────── */}
        <mesh>
          {/* plane sized to fill ring aperture (inner radius = R*0.84 − 2.8) */}
          <planeGeometry args={[R * 1.54, R * 1.54]} />
          <primitive object={coreMat} attach="material" />
        </mesh>
      </group>
    </BridgeObject>
  );
}
