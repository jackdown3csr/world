"use client";

import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import BridgeObject from "./BridgeObject";
import type { BridgeSceneObject } from "@/lib/bridges";

const FRAME_MAT = new THREE.MeshStandardMaterial({
  color: "#324857",
  metalness: 0.92,
  roughness: 0.18,
  emissive: "#0f2233",
  emissiveIntensity: 0.26,
});

const CORE_MAT = new THREE.MeshStandardMaterial({
  color: "#8fe8ff",
  metalness: 0.24,
  roughness: 0.34,
  emissive: "#33dbff",
  emissiveIntensity: 1.15,
});

const ARC_MAT = new THREE.MeshBasicMaterial({
  color: "#ffd18f",
  transparent: true,
  opacity: 0.46,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

interface CanonicalBridgePortalProps {
  bridge: BridgeSceneObject;
  onSelect: (bridgeId: string) => void;
  showLabel?: boolean;
  paused?: boolean;
}

export default function CanonicalBridgePortal({
  bridge,
  onSelect,
  showLabel = true,
  paused = false,
}: CanonicalBridgePortalProps) {
  const rigRef = useRef<THREE.Group>(null);
  const outerRingRef = useRef<THREE.Mesh>(null);
  const innerRingRef = useRef<THREE.Mesh>(null);
  const simTimeRef = useRef(0);

  const activityStrength = bridge.status === "active"
    ? 1
    : bridge.status === "quiet"
      ? 0.5
      : 0.18;

  const nodes = useMemo(() => Array.from({ length: 6 }, (_, index) => {
    const angle = (index / 6) * Math.PI * 2;
    const radius = bridge.bodyRadius * 0.92;
    return {
      key: `node-${index}`,
      position: [Math.cos(angle) * radius, Math.sin(angle) * radius, 0] as [number, number, number],
      scale: index % 2 === 0 ? 1.15 : 0.92,
    };
  }), [bridge.bodyRadius]);

  useFrame((_, delta) => {
    if (!paused) simTimeRef.current += delta;
    const t = simTimeRef.current;

    if (rigRef.current) {
      rigRef.current.position.y = Math.sin(t * 0.24) * (1.2 + activityStrength * 1.8);
      rigRef.current.rotation.x = 0.22 + Math.sin(t * 0.13) * 0.04;
      rigRef.current.rotation.y = -0.28 + Math.sin(t * 0.1) * 0.05;
      rigRef.current.rotation.z = Math.sin(t * 0.18) * 0.025;
    }

    if (outerRingRef.current && !paused) outerRingRef.current.rotation.z += delta * (0.08 + activityStrength * 0.08);
    if (innerRingRef.current && !paused) innerRingRef.current.rotation.z -= delta * (0.15 + activityStrength * 0.12);

    FRAME_MAT.emissiveIntensity = 0.24 + activityStrength * 0.25;
    CORE_MAT.emissiveIntensity = 0.95 + activityStrength * 0.45;
  });

  const R = bridge.bodyRadius;

  return (
    <BridgeObject bridge={bridge} onSelect={onSelect} showLabel={showLabel}>
      <group ref={rigRef}>
        <pointLight color="#58ddff" intensity={1.4 + activityStrength * 1.8} distance={170} decay={2} />
        <pointLight color="#ffcf91" intensity={0.8 + activityStrength * 1.2} distance={120} decay={2} position={[0, 0, -10]} />

        <mesh ref={outerRingRef} material={FRAME_MAT} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[R * 0.94, 2.4, 24, 96]} />
        </mesh>

        <mesh ref={innerRingRef} material={FRAME_MAT} rotation={[Math.PI / 2, 0, Math.PI / 6]}>
          <torusGeometry args={[R * 0.62, 1.2, 16, 72]} />
        </mesh>

        <mesh material={CORE_MAT}>
          <octahedronGeometry args={[R * 0.34, 1]} />
        </mesh>

        <mesh material={ARC_MAT} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[R * 0.48, 0.34, 12, 48, Math.PI]} />
        </mesh>

        <mesh material={ARC_MAT} rotation={[Math.PI / 2, 0, Math.PI / 3]}>
          <torusGeometry args={[R * 0.72, 0.22, 12, 48, Math.PI * 0.8]} />
        </mesh>

        {nodes.map((node) => (
          <group key={node.key} position={node.position} scale={node.scale}>
            <mesh material={FRAME_MAT}>
              <boxGeometry args={[5, 5, 5]} />
            </mesh>
            <mesh material={CORE_MAT} position={[0, 0, 3.5]}>
              <sphereGeometry args={[1.1, 10, 10]} />
            </mesh>
          </group>
        ))}
      </group>
    </BridgeObject>
  );
}
