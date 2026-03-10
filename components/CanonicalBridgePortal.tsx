"use client";

import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import BridgeObject from "./BridgeObject";
import type { BridgeSceneObject } from "@/lib/bridges";

const FRAME_MAT = new THREE.MeshStandardMaterial({
  color: "#2b3e4e",
  metalness: 0.94,
  roughness: 0.14,
  emissive: "#0c1e2c",
  emissiveIntensity: 0.22,
});

const ACCENT_MAT = new THREE.MeshStandardMaterial({
  color: "#1b3e52",
  metalness: 0.88,
  roughness: 0.24,
  emissive: "#0a2232",
  emissiveIntensity: 0.32,
});

const CORE_MAT = new THREE.MeshStandardMaterial({
  color: "#aaeeff",
  metalness: 0.10,
  roughness: 0.30,
  emissive: "#33dcff",
  emissiveIntensity: 1.2,
  transparent: true,
  opacity: 0.88,
});

const GLOW_MAT = new THREE.MeshBasicMaterial({
  color: "#22ddff",
  transparent: true,
  opacity: 0.10,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
});

interface CanonicalBridgePortalProps {
  bridge: BridgeSceneObject;
  onSelect: (bridgeId: string) => void;
  showLabel?: boolean;
  interactive?: boolean;
  paused?: boolean;
}

export default function CanonicalBridgePortal({
  bridge,
  onSelect,
  showLabel = true,
  interactive = true,
  paused = false,
}: CanonicalBridgePortalProps) {
  const rigRef = useRef<THREE.Group>(null);
  const outerRingRef = useRef<THREE.Mesh>(null);
  const innerRingRef = useRef<THREE.Mesh>(null);
  const simTimeRef = useRef(0);

  const activityStrength = bridge.status === "active"
    ? 1 : bridge.status === "quiet" ? 0.5 : 0.18;

  const R = bridge.bodyRadius;

  // Derived hex-frame geometry data (all relative to R)
  const geo = useMemo(() => {
    const CR = R * 0.92;                        // hex circumradius
    const APO = CR * Math.cos(Math.PI / 6);     // apothem (midpoint-to-center)
    const CHORD = CR;                            // edge length = circumradius for regular hexagon

    // 6 corner vertices, flat-top orientation
    const verts = Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
      return { x: Math.cos(a) * CR, y: Math.sin(a) * CR, angle: a };
    });

    // 6 girder midpoints (one per edge)
    const girders = Array.from({ length: 6 }, (_, i) => {
      const a = ((i + 0.5) / 6) * Math.PI * 2 - Math.PI / 6;
      return { x: Math.cos(a) * APO, y: Math.sin(a) * APO, angle: a, chord: CHORD };
    });

    // 3 alternating outer-arm anchor vertices
    const outArms = verts.filter((_, i) => i % 2 === 0);

    return { verts, girders, outArms, CHORD };
  }, [R]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 1 / 30);
    if (!paused) simTimeRef.current += delta;
    const t = simTimeRef.current;

    if (rigRef.current) {
      rigRef.current.position.y = Math.sin(t * 0.24) * (1.2 + activityStrength * 1.8);
      rigRef.current.rotation.x = 0.22 + Math.sin(t * 0.13) * 0.04;
      rigRef.current.rotation.y = -0.28 + Math.sin(t * 0.1) * 0.05;
      rigRef.current.rotation.z = Math.sin(t * 0.18) * 0.025;
    }

    if (outerRingRef.current && !paused) {
      outerRingRef.current.rotation.z += delta * (0.06 + activityStrength * 0.06);
    }
    if (innerRingRef.current && !paused) {
      innerRingRef.current.rotation.z -= delta * (0.11 + activityStrength * 0.10);
    }

    FRAME_MAT.emissiveIntensity = 0.20 + activityStrength * 0.22;
    CORE_MAT.emissiveIntensity = 0.95 + activityStrength * 0.50;
  });

  // Structural proportions
  const BW  = Math.max(3.2, R * 0.036);  // main beam cross-section
  const CS  = BW * 1.9;                  // corner joint cube size
  const SW  = BW * 0.52;                 // spoke / arm cross-section
  const ARM = R * 0.42;                  // outrigger arm length beyond vertex

  return (
    <BridgeObject bridge={bridge} onSelect={onSelect} showLabel={showLabel} interactive={interactive}>
      <group ref={rigRef}>
        {/* Lighting */}
        <pointLight color="#55ddff" intensity={1.2 + activityStrength * 1.6} distance={160} decay={2} />

        {/* ── Outer slewing precision ring ── */}
        <mesh ref={outerRingRef} material={FRAME_MAT} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[R * 0.97, 1.6, 14, 72]} />
        </mesh>

        {/* ── Hex structural frame: 6 box-beam girders ──
            Box long axis = X; edge direction = g.angle + π/2,
            so rotation.z = g.angle + π/2 aligns X with the edge. */}
        {geo.girders.map((g, i) => (
          <mesh
            key={`g${i}`}
            position={[g.x, g.y, 0]}
            rotation={[0, 0, g.angle + Math.PI / 2]}
            material={FRAME_MAT}
          >
            <boxGeometry args={[g.chord, BW, BW]} />
          </mesh>
        ))}

        {/* ── Corner joint fittings (taller than beam so joints read clearly) ── */}
        {geo.verts.map((v, i) => (
          <mesh key={`c${i}`} position={[v.x, v.y, 0]} material={FRAME_MAT}>
            <boxGeometry args={[CS, CS, CS * 1.5]} />
          </mesh>
        ))}

        {/* ── 3 interior diagonal spokes (vertex[i] → opposite vertex[i+3])
            Box long axis = Y; rotation.z = v.angle − π/2 aligns Y radially. */}
        {[0, 1, 2].map((i) => (
          <mesh
            key={`sp${i}`}
            rotation={[0, 0, geo.verts[i].angle - Math.PI / 2]}
            material={ACCENT_MAT}
          >
            <boxGeometry args={[SW, geo.CHORD * 2, SW]} />
          </mesh>
        ))}

        {/* ── Inner counter-rotating alignment ring ── */}
        <mesh ref={innerRingRef} material={ACCENT_MAT} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[R * 0.50, 0.85, 12, 52]} />
        </mesh>

        {/* ── 3 outrigger arms at alternating vertices ── */}
        {geo.outArms.map((v, i) => {
          const mag = Math.sqrt(v.x * v.x + v.y * v.y);
          const nx = v.x / mag, ny = v.y / mag;
          return (
            <group key={`arm${i}`}>
              {/* Arm shaft: long axis Y, rotation aligns it radially */}
              <mesh
                position={[v.x + nx * ARM * 0.5, v.y + ny * ARM * 0.5, 0]}
                rotation={[0, 0, v.angle - Math.PI / 2]}
                material={FRAME_MAT}
              >
                <boxGeometry args={[SW, ARM, SW]} />
              </mesh>
              {/* Arm tip fitting */}
              <mesh position={[v.x + nx * ARM, v.y + ny * ARM, 0]} material={ACCENT_MAT}>
                <boxGeometry args={[CS * 0.85, CS * 0.85, CS * 1.2]} />
              </mesh>
            </group>
          );
        })}

        {/* ── Central hub: glowing octagonal disk + tiny sphere ── */}
        <mesh material={CORE_MAT} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[R * 0.12, R * 0.12, R * 0.016, 8, 1]} />
        </mesh>
        <mesh material={GLOW_MAT} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[R * 0.28, R * 0.28, 0.4, 16, 1]} />
        </mesh>
        <mesh material={CORE_MAT}>
          <sphereGeometry args={[R * 0.055, 10, 10]} />
        </mesh>
      </group>
    </BridgeObject>
  );
}
