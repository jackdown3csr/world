"use client";

import React, { useRef, useMemo, useEffect, useState, useCallback } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { RingParticleData } from "@/lib/layout";
import WalletTooltip from "./WalletTooltip";

interface WalletRingProps {
  ringWallets:     RingParticleData[];
  hostRadius:      number;
  selectedAddress: string | null;
  onSelectAddress: (address: string) => void;
  showLabels?:     boolean;
  showRenamedOnly?: boolean;
}

const RING_INNER_MULT = 1.6;   // inner edge = hostRadius × this
const RING_OUTER_MULT = 4.2;   // outer edge = hostRadius × this
const CASSINI_CENTER  = 0.58;  // fraction where Cassini gap sits
const CASSINI_WIDTH   = 0.04;  // gap half-width in normalised radius

const particleGeo = new THREE.IcosahedronGeometry(1, 1);
const particleMat = new THREE.MeshStandardMaterial({
  roughness: 0.45,
  metalness: 0.25,
});

/** Place a ring particle — skip the Cassini gap */
function ringRadius(t: number, inner: number, outer: number): number {
  // Push particles away from the gap
  const gap = CASSINI_CENTER;
  const hw  = CASSINI_WIDTH;
  let adj = t;
  if (adj > gap - hw && adj < gap + hw) {
    adj = adj < gap ? gap - hw : gap + hw;
  }
  return inner + adj * (outer - inner);
}

export default function WalletRing({
  ringWallets, hostRadius, selectedAddress, onSelectAddress, showLabels, showRenamedOnly,
}: WalletRingProps) {
  const meshRef  = useRef<THREE.InstancedMesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const count    = ringWallets.length;

  const [hoveredIdx, setHoveredIdx] = useState<number>(-1);

  const inner = hostRadius * RING_INNER_MULT;
  const outer = hostRadius * RING_OUTER_MULT;

  // Precompute positions for tooltip lookup
  const positions = useMemo(() => {
    return ringWallets.map((rp) => {
      const r = ringRadius(rp.radialT, inner, outer);
      const y = (rp.seed - 0.5) * 0.18;
      return new THREE.Vector3(
        Math.cos(rp.angle) * r,
        y,
        Math.sin(rp.angle) * r,
      );
    });
  }, [ringWallets, inner, outer]);

  // Instanced mesh setup
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || count === 0) return;

    const mat4  = new THREE.Matrix4();
    const quat  = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const rp  = ringWallets[i];
      const pos = positions[i];

      quat.setFromEuler(new THREE.Euler(rp.seed * 3, rp.hue * 5, rp.seed * 2));
      scale.setScalar(rp.size);
      mat4.compose(pos, quat, scale);
      mesh.setMatrixAt(i, mat4);
      color.setHSL(rp.hue, 0.35 + rp.seed * 0.35, 0.45 + rp.seed * 0.25);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [ringWallets, count, positions]);

  // Slow disc rotation + track camera distance to group for labels
  const { camera } = useThree();
  const [nearIndices, setNearIndices] = useState<Set<number>>(new Set());

  const LABEL_DIST = 35;  // show label when camera is within this distance

  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += 0.008 * delta;

    // Every ~6 frames, recompute which particles are near the camera
    if (groupRef.current && Math.random() < 0.17) {
      const worldPos = new THREE.Vector3();
      const near = new Set<number>();
      for (let i = 0; i < count; i++) {
        worldPos.copy(positions[i]);
        groupRef.current.localToWorld(worldPos);
        if (worldPos.distanceTo(camera.position) < LABEL_DIST) {
          near.add(i);
        }
      }
      setNearIndices(near);
    }
  });

  const onPointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const idx = e.instanceId ?? -1;
    setHoveredIdx(idx);
    document.body.style.cursor = idx >= 0 ? "pointer" : "auto";
  }, []);

  const onPointerOut = useCallback(() => {
    setHoveredIdx(-1);
    document.body.style.cursor = "auto";
  }, []);

  const onClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const idx = e.instanceId ?? -1;
    if (idx >= 0 && idx < count) {
      onSelectAddress(ringWallets[idx].wallet.address);
    }
  }, [count, onSelectAddress, ringWallets]);

  // Dust underlayer — flat disc in XZ plane (same as particles)
  const dustMat = useMemo(
    () => new THREE.MeshBasicMaterial({
      color: "#887755",
      transparent: true,
      opacity: 0.018,
      side: THREE.DoubleSide,
      depthWrite: false,
    }), []);

  if (count === 0) return null;

  return (
    <group ref={groupRef}
      rotation={[Math.PI * 0.44, 0, 0.15]}>

      {/* faint dust disc — rotated to XZ plane to match particles */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[inner, outer, 180]} />
        <primitive object={dustMat} attach="material" />
      </mesh>

      {/* wallet particles */}
      <instancedMesh
        ref={meshRef}
        args={[particleGeo, particleMat, count]}
        userData={{ walletAddresses: ringWallets.map(rp => rp.wallet.address.toLowerCase()), bodyType: "ring" }}
        frustumCulled={false}
        onPointerMove={onPointerMove}
        onPointerOut={onPointerOut}
        onClick={onClick}
      >
        <primitive object={particleGeo} attach="geometry" />
        <primitive object={particleMat} attach="material" />
      </instancedMesh>

      {/* tooltip */}
      {hoveredIdx >= 0 && hoveredIdx < count && (
        <Html
          position={[positions[hoveredIdx].x, positions[hoveredIdx].y + 0.25, positions[hoveredIdx].z]}
          center
          zIndexRange={[10000, 0]}
          style={{ pointerEvents: "none" }}
        >
          <WalletTooltip wallet={ringWallets[hoveredIdx].wallet} />
        </Html>
      )}

      {/* Labels: shown when camera is close enough OR wallet is selected */}
      {ringWallets.map((rp, i) => {
        if (hoveredIdx === i) return null; // tooltip handles this one
        const isSelected = selectedAddress?.toLowerCase() === rp.wallet.address.toLowerCase();
        const isNear = nearIndices.has(i);
        const isRenamed = !showRenamedOnly || !!rp.wallet.customName;
        const showGlobal = showLabels && isRenamed;
        if (!isSelected && !isNear && !showGlobal) return null;

        const pos = positions[i];
        const label = rp.wallet.customName
          || `${rp.wallet.address.slice(0, 6)}\u2026${rp.wallet.address.slice(-4)}`;
        return (
          <Html
            key={rp.wallet.address}
            position={[pos.x, pos.y + rp.size + 0.12, pos.z]}
            center
            zIndexRange={[isSelected ? 9000 : 4500, 0]}
            style={{ pointerEvents: "none" }}
          >
            <div style={{
              color: isSelected ? "#a0d8ff" : "#506878",
              fontSize: isSelected ? 9 : 7,
              fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
              fontWeight: isSelected ? 700 : 500,
              whiteSpace: "nowrap",
              textShadow: "0 0 6px rgba(0,0,0,0.95), 0 0 12px rgba(0,0,0,0.7)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              opacity: isSelected ? 1.0 : 0.65,
            }}>
              {label}
            </div>
          </Html>
        );
      })}
    </group>
  );
}
