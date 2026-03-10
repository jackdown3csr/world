"use client";

/**
 * EpochSatellite — Voyager / Cassini-style deep-space probe orbiting just
 * outside the vesting protoplanetary disk. Displays the current reward epoch.
 *
 * Visual: decagonal bus, large parabolic HGA dish, magnetometer boom,
 * RTG boom, and instrument scan platform.
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import SpriteLabel from "./SpriteLabel";
import * as THREE from "three";
import { registerSceneObject, unregisterSceneObject } from "@/lib/sceneRegistry";

export const EPOCH_ADDRESS = "__epoch__";
const BODY_RADIUS   = 2.2;

/* ── Shared materials ────────────────────────────────────── */
const matBus     = new THREE.MeshStandardMaterial({ color: "#8a9aaa", metalness: 0.8,  roughness: 0.25 });
const matFoil    = new THREE.MeshStandardMaterial({ color: "#c8b060", metalness: 0.5,  roughness: 0.45, emissive: "#3a2800", emissiveIntensity: 0.15 }); // gold MLI foil
const matDish    = new THREE.MeshStandardMaterial({ color: "#e8e0d0", metalness: 0.3,  roughness: 0.5,  side: THREE.DoubleSide });
const matBoom    = new THREE.MeshStandardMaterial({ color: "#c0d0dd", metalness: 0.9,  roughness: 0.15 });
const matRTG     = new THREE.MeshStandardMaterial({ color: "#2a2a2a", metalness: 0.6,  roughness: 0.4,  emissive: "#1a0505", emissiveIntensity: 0.3 });
const matSensor  = new THREE.MeshStandardMaterial({ color: "#4488aa", metalness: 0.7,  roughness: 0.3,  emissive: "#002233", emissiveIntensity: 0.4 });

const _worldQ = new THREE.Quaternion();
const _panelFacingFix = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
const _styleOffset = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(0, THREE.MathUtils.degToRad(10), 0),
);

interface EpochSatelliteProps {
  epoch: number;
  orbitRadius: number;
  showLabel?: boolean;
  onSelect?: (addr: string) => void;
  interactive?: boolean;
  paused?: boolean;
}

export default function EpochSatellite({
  epoch,
  orbitRadius,
  showLabel = true,
  onSelect,
  interactive = true,
  paused = false,
}: EpochSatelliteProps) {
  const groupRef   = useRef<THREE.Group>(null);
  const probeRef   = useRef<THREE.Group>(null);
  const labelRef   = useRef<THREE.Group>(null);
  const scanRef    = useRef<THREE.Group>(null);
  const angleRef   = useRef(Math.PI * 1.3);
  const scanTimeRef = useRef(0);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (!groupRef.current) return;
    registerSceneObject(EPOCH_ADDRESS, groupRef.current, BODY_RADIUS, "satellite");
    return () => unregisterSceneObject(EPOCH_ADDRESS);
  }, []);

  const orbitSpeed = 0.005;
  const tilt       = 18 * (Math.PI / 180);

  const onClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect?.(EPOCH_ADDRESS);
  }, [onSelect]);

  /* ── Parabolic dish geometry (lathe profile) ─────────── */
  const dishGeo = useMemo(() => {
    const pts: THREE.Vector2[] = [];
    const R = 1.45;
    const depth = 0.34;
    const segs = 16;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;           // 0 = center, 1 = rim
      const r = t * R;
      const y = depth * t * t;      // parabolic curve
      pts.push(new THREE.Vector2(r, -y));
    }
    return new THREE.LatheGeometry(pts, 24);
  }, []);

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 1 / 30);
    if (!paused) {
      angleRef.current += orbitSpeed * delta;
      scanTimeRef.current += delta;
    }
    const a = angleRef.current;
    if (groupRef.current) {
      groupRef.current.position.set(
        Math.cos(a) * orbitRadius,
        Math.sin(a) * orbitRadius * Math.sin(tilt),
        Math.sin(a) * orbitRadius * Math.cos(tilt),
      );
    }
    // Orient dish towards star (origin of the parent group)
    if (probeRef.current && groupRef.current) {
      probeRef.current.lookAt(
        -groupRef.current.position.x,
        -groupRef.current.position.y,
        -groupRef.current.position.z,
      );
      probeRef.current.quaternion.multiply(_panelFacingFix);
      probeRef.current.quaternion.multiply(_styleOffset);
    }
    // Slow scan platform sweep
    if (scanRef.current) {
      scanRef.current.rotation.y = Math.sin(scanTimeRef.current * 0.4) * 0.8;
    }
    // Counter-rotate labels to stay screen-aligned
    if (labelRef.current && groupRef.current) {
      labelRef.current.quaternion.identity();
      labelRef.current.quaternion.copy(groupRef.current.getWorldQuaternion(_worldQ).invert());
    }
  });

  return (
    <group ref={groupRef}>
      {/* Hit-test sphere */}
      <mesh
        userData={{ walletAddress: EPOCH_ADDRESS, bodyRadius: BODY_RADIUS, bodyType: "satellite" }}
        onPointerEnter={interactive ? () => { setHovered(true); document.body.style.cursor = "pointer"; } : undefined}
        onPointerLeave={interactive ? () => { setHovered(false); document.body.style.cursor = "auto"; } : undefined}
        onClick={interactive ? onClick : undefined}
      >
        <sphereGeometry args={[3.5, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <group ref={probeRef} scale={0.58}>
        {/* ── Spacecraft bus (decagonal prism, gold foil) ── */}
        <mesh material={matFoil}>
          <cylinderGeometry args={[1.0, 1.0, 0.7, 10]} />
        </mesh>

        {/* ── High-Gain Antenna dish (parabola) ── */}
        <mesh geometry={dishGeo} material={matDish} position={[0, 0.55, 0]} />
        {/* Feed horn at dish center */}
        <mesh material={matBoom} position={[0, 0.45, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 0.5, 6]} />
        </mesh>
        {/* Sub-reflector */}
        <mesh material={matBus} position={[0, 0.15, 0]}>
          <sphereGeometry args={[0.12, 8, 8]} />
        </mesh>

        {/* ── Magnetometer boom (long thin rod) ── */}
        <mesh material={matBoom} position={[3.5, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.03, 0.03, 5.0, 4]} />
        </mesh>
        {/* Mag sensor tip */}
        <mesh material={matSensor} position={[6.0, 0, 0]}>
          <boxGeometry args={[0.2, 0.2, 0.2]} />
        </mesh>

        {/* ── RTG boom (opposite side, shorter) ── */}
        <mesh material={matBoom} position={[-2.0, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.04, 0.04, 2.5, 4]} />
        </mesh>
        {/* RTG canister */}
        <mesh material={matRTG} position={[-3.4, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.18, 0.18, 0.8, 8]} />
        </mesh>
        {/* RTG fins (4 radiator fins) */}
        {[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((rot, i) => (
          <mesh key={i} material={matRTG} position={[-3.4, 0, 0]} rotation={[rot, 0, Math.PI / 2]}>
            <boxGeometry args={[0.02, 0.35, 0.6]} />
          </mesh>
        ))}

        {/* ── Scan platform (articulated instrument cluster) ── */}
        <group ref={scanRef} position={[0, -0.5, 1.2]}>
          {/* Boom to platform */}
          <mesh material={matBoom} position={[0, 0, -0.5]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 1.0, 4]} />
          </mesh>
          {/* Platform box */}
          <mesh material={matBus} position={[0, 0, 0.1]}>
            <boxGeometry args={[0.4, 0.3, 0.5]} />
          </mesh>
          {/* Camera/sensor lens */}
          <mesh material={matSensor} position={[0, 0, 0.4]}>
            <cylinderGeometry args={[0.1, 0.08, 0.15, 8]} />
          </mesh>
        </group>
      </group>

      {/* Subtle glow */}
      <pointLight
        color="#55bbcc"
        intensity={interactive && hovered ? 0.7 : 0.08}
        distance={12}
        decay={2}
      />

      {/* Labels in counter-rotating group so they stay upright */}
      <group ref={labelRef}>
        {showLabel && (
          <SpriteLabel
            position={[0, 3.8, 0]}
            text={epoch > 0 ? `Epoch - ${epoch}` : "Epoch - \u2014"}
            color="#7ccedd"
            fontSize={0.26}
            opacity={0.56}
            onClick={interactive ? () => onSelect?.(EPOCH_ADDRESS) : undefined}
          />
        )}

        {interactive && hovered && (
          <Html position={[0, 6, 0]} center zIndexRange={[8000, 0]} style={{ pointerEvents: "none" }}>
            <div
              style={{
                background: "rgba(2, 6, 14, 0.93)",
                border: "1px solid rgba(0,200,220,0.25)",
                borderLeft: "2px solid rgba(0,200,220,0.6)",
                padding: "7px 10px",
                fontFamily: "'JetBrains Mono','SF Mono',monospace",
                fontSize: 9,
                color: "#8aafcc",
                whiteSpace: "nowrap",
              }}
            >
              <div
                style={{
                  color: "#d0f0ff",
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  marginBottom: 6,
                  textTransform: "uppercase",
                  fontSize: 9,
                }}
              >
                ◈ Reward Epoch
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <span style={{ color: "rgba(0,200,220,0.5)", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  current
                </span>
                <span style={{ color: "#00e5ff" }}>
                  {epoch > 0 ? `Epoch - ${epoch}` : "Epoch - \u2014"}
                </span>
              </div>
            </div>
          </Html>
        )}
      </group>
    </group>
  );
}
