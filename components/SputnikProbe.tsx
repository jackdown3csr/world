"use client";

/**
 * SputnikProbe — hidden easter-egg satellite resembling Sputnik 1.
 *
 * Visual: polished aluminium sphere with 4 trailing whip antennas,
 * a faint blinking beacon, and a subtle metallic sheen.
 *
 * Label and orbit ring are never shown. On hover / click a small
 * HUD tooltip reveals cryptic info about an upcoming token.
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import SpriteLabel from "./SpriteLabel";
import * as THREE from "three";
import { registerSceneObject, unregisterSceneObject } from "@/lib/sceneRegistry";

export const SPUTNIK_ADDRESS = "__sputnik__";
const BODY_RADIUS = 1.6;

/* ── Materials ────────────────────────────────────────────── */
const matShell = new THREE.MeshStandardMaterial({
  color: "#c0c8d0",
  metalness: 0.92,
  roughness: 0.12,
});
const matAntenna = new THREE.MeshStandardMaterial({
  color: "#a0aab4",
  metalness: 0.85,
  roughness: 0.2,
});
const matBeacon = new THREE.MeshStandardMaterial({
  color: "#ff4422",
  emissive: "#ff2200",
  emissiveIntensity: 0.6,
  metalness: 0.2,
  roughness: 0.5,
});

const _worldQ = new THREE.Quaternion();

/* ── Antenna geometry parameters ──────────────────────────── */
const ANTENNA_LENGTH = 4.2;
const ANTENNA_SPREAD = 35 * (Math.PI / 180); // 35° backward sweep

interface SputnikProbeProps {
  orbitRadius: number;
  selected?: boolean;
  onSelect?: (addr: string) => void;
  interactive?: boolean;
  paused?: boolean;
}

export default function SputnikProbe({
  orbitRadius,
  selected = false,
  onSelect,
  interactive = true,
  paused = false,
}: SputnikProbeProps) {
  const groupRef = useRef<THREE.Group>(null);
  const probeRef = useRef<THREE.Group>(null);
  const labelRef = useRef<THREE.Group>(null);
  const beaconRef = useRef<THREE.PointLight>(null);
  const angleRef = useRef(Math.PI * 0.35);
  const [hovered, setHovered] = useState(false);

  const orbitSpeed = 0.012;
  const tilt = 52 * (Math.PI / 180); // high-inclination orbit

  useEffect(() => {
    if (!groupRef.current) return;
    registerSceneObject(SPUTNIK_ADDRESS, groupRef.current, BODY_RADIUS, "satellite");
    return () => unregisterSceneObject(SPUTNIK_ADDRESS);
  }, []);

  const onClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      onSelect?.(SPUTNIK_ADDRESS);
    },
    [onSelect],
  );

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 1 / 30);
    if (!paused) angleRef.current += orbitSpeed * delta;
    const a = angleRef.current;

    if (groupRef.current) {
      groupRef.current.position.set(
        Math.cos(a) * orbitRadius,
        Math.sin(a) * orbitRadius * Math.sin(tilt),
        Math.sin(a) * orbitRadius * Math.cos(tilt),
      );
    }

    // Orient probe so antennas trail behind the direction of travel
    if (probeRef.current && groupRef.current) {
      const tangent = new THREE.Vector3(
        -Math.sin(a),
        Math.cos(a) * Math.sin(tilt),
        Math.cos(a) * Math.cos(tilt),
      ).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const mat = new THREE.Matrix4().lookAt(
        new THREE.Vector3(0, 0, 0),
        tangent,
        up,
      );
      probeRef.current.quaternion.setFromRotationMatrix(mat);
    }

    // Blink beacon
    if (beaconRef.current) {
      const t = state.clock.elapsedTime;
      // short blink every ~2.8 s
      const pulse = Math.sin(t * 2.25) > 0.92 ? 1.0 : 0.0;
      beaconRef.current.intensity = pulse * 0.6;
    }

    // Counter-rotate label group so it stays upright in world space
    if (labelRef.current && groupRef.current) {
      labelRef.current.quaternion.identity();
      labelRef.current.quaternion.copy(groupRef.current.getWorldQuaternion(_worldQ).invert());
    }
  });

  return (
    <group ref={groupRef}>
      {/* Hit-test sphere */}
      <mesh
        userData={{ walletAddress: SPUTNIK_ADDRESS, bodyRadius: BODY_RADIUS, bodyType: "satellite" }}
        onPointerEnter={
          interactive
            ? () => {
                setHovered(true);
                document.body.style.cursor = "pointer";
              }
            : undefined
        }
        onPointerLeave={
          interactive
            ? () => {
                setHovered(false);
                document.body.style.cursor = "auto";
              }
            : undefined
        }
        onClick={interactive ? onClick : undefined}
      >
        <sphereGeometry args={[4, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <group ref={probeRef} scale={0.9}>
        {/* Main pressure sphere */}
        <mesh material={matShell}>
          <sphereGeometry args={[1.0, 16, 16]} />
        </mesh>

        {/* Seam ring around equator */}
        <mesh material={matAntenna} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.01, 0.03, 6, 24]} />
        </mesh>

        {/* 4 whip antennas — swept back at ANTENNA_SPREAD from the rear pole */}
        {[0, 1, 2, 3].map((i) => {
          const azimuth = (i * Math.PI) / 2; // 90° apart
          const dir = new THREE.Vector3(
            Math.sin(ANTENNA_SPREAD) * Math.cos(azimuth),
            Math.sin(ANTENNA_SPREAD) * Math.sin(azimuth),
            -Math.cos(ANTENNA_SPREAD),
          ).normalize();
          const quat = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            dir,
          );
          const euler = new THREE.Euler().setFromQuaternion(quat);
          const base = dir.clone().multiplyScalar(1.0);
          const mid = dir.clone().multiplyScalar(ANTENNA_LENGTH / 2 + 0.5);

          return (
            <React.Fragment key={i}>
              {/* Antenna mount nub */}
              <mesh material={matAntenna} position={[base.x, base.y, base.z]} rotation={euler}>
                <cylinderGeometry args={[0.06, 0.04, 0.2, 6]} />
              </mesh>
              {/* Antenna rod */}
              <mesh material={matAntenna} position={[mid.x, mid.y, mid.z]} rotation={euler}>
                <cylinderGeometry args={[0.025, 0.015, ANTENNA_LENGTH, 4]} />
              </mesh>
            </React.Fragment>
          );
        })}

        {/* Beacon light on top */}
        <mesh material={matBeacon} position={[0, 0, 1.05]}>
          <sphereGeometry args={[0.08, 8, 8]} />
        </mesh>
      </group>

      {/* Blinking beacon light */}
      <pointLight
        ref={beaconRef}
        color="#ff3300"
        intensity={0}
        distance={8}
        decay={2}
      />

      {/* Soft ambient glow on hover or selected */}
      {(hovered || selected) && (
        <pointLight color="#aaddff" intensity={selected ? 0.6 : 0.4} distance={12} decay={2} />
      )}

      {/* Labels + tooltip in counter-rotating group (stays upright) */}
      <group ref={labelRef}>
        {/* Hover hint — just a short cryptic label */}
        {interactive && hovered && !selected && (
          <SpriteLabel
            position={[0, 6, 0]}
            text="◈ unidentified probe"
            color="#ff9944"
            fontSize={0.3}
            opacity={0.5}
          />
        )}

        {/* Full info panel — only after focus/click */}
        {selected && (
          <Html position={[0, 8, 0]} center zIndexRange={[8000, 0]} style={{ pointerEvents: "none" }}>
            <div
              style={{
                background: "rgba(2, 6, 14, 0.93)",
                border: "1px solid rgba(255,140,0,0.2)",
                borderLeft: "2px solid rgba(255,140,0,0.5)",
                padding: "8px 12px",
                fontFamily: "'JetBrains Mono','SF Mono',monospace",
                fontSize: 10,
                color: "#8aafcc",
                whiteSpace: "nowrap",
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  color: "#ffcc66",
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  marginBottom: 6,
                  textTransform: "uppercase",
                  fontSize: 9,
                }}
              >
                ◈ SECTOR (SEC-GNET)
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 3 }}>
                <span style={{ color: "rgba(255,180,60,0.5)", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  type
                </span>
                <span style={{ color: "#ffcc66" }}>Research Probe</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 3 }}>
                <span style={{ color: "rgba(255,180,60,0.5)", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  status
                </span>
                <span style={{ color: "#ff9944" }}>signal detected</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <span style={{ color: "rgba(255,180,60,0.5)", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  mission
                </span>
                <span style={{ color: "#8a7a60" }}>▒▒▒ classified ▒▒▒</span>
              </div>
            </div>
          </Html>
        )}
      </group>
    </group>
  );
}
