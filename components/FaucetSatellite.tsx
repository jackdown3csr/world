"use client";

import React, { useRef, useState, useCallback } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { FaucetStats } from "@/hooks/useFaucet";

const FAUCET_ADDRESS = "faucet";
const ORBIT_RADIUS  = 195;   // between Sun and first planet (FIRST_ORBIT ~224)
const ORBIT_SPEED   = 0.018; // faster than planets
const ORBIT_TILT    = 35 * (Math.PI / 180); // 35° inclination — clearly artificial
const BODY_W        = 2.2;
const BODY_H        = 1.0;
const BODY_D        = 1.0;
const PANEL_W       = 3.2;
const PANEL_H       = 0.08;
const PANEL_D       = 1.2;
const BODY_RADIUS   = 3;     // virtual radius for camera zoom distance

const matBody   = new THREE.MeshStandardMaterial({ color: "#8aaabb", metalness: 0.85, roughness: 0.25 });
const matPanel  = new THREE.MeshStandardMaterial({ color: "#1a3a6a", metalness: 0.3,  roughness: 0.55, emissive: "#0a1f42", emissiveIntensity: 0.4 });
const matAntenna = new THREE.MeshStandardMaterial({ color: "#c0d8e0", metalness: 0.9, roughness: 0.15 });

const _sunDir = new THREE.Vector3();

interface FaucetSatelliteProps {
  stats: FaucetStats | null;
  showLabel?: boolean;
  onSelect?: (addr: string) => void;
}

export default function FaucetSatellite({ stats, showLabel = true, onSelect }: FaucetSatelliteProps) {
  const groupRef  = useRef<THREE.Group>(null);
  const bodyRef   = useRef<THREE.Group>(null);
  const labelRef  = useRef<THREE.Group>(null);
  const angleRef  = useRef(Math.PI * 0.7); // start offset from other bodies
  const [hovered, setHovered] = useState(false);

  const onClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect?.(FAUCET_ADDRESS);
  }, [onSelect]);

  useFrame((_, delta) => {
    angleRef.current += ORBIT_SPEED * delta;
    const a = angleRef.current;
    if (groupRef.current) {
      groupRef.current.position.set(
        Math.cos(a) * ORBIT_RADIUS,
        Math.sin(a) * ORBIT_RADIUS * Math.sin(ORBIT_TILT),
        Math.sin(a) * ORBIT_RADIUS * Math.cos(ORBIT_TILT),
      );
    }
    // Orient body so panels face the Sun (origin)
    if (bodyRef.current && groupRef.current) {
      _sunDir.copy(groupRef.current.position).negate().normalize();
      bodyRef.current.getWorldPosition(_sunDir);
      bodyRef.current.lookAt(0, 0, 0);
    }
    // Counter-rotate label group so it stays upright in world space
    if (labelRef.current && groupRef.current) {
      labelRef.current.quaternion.identity();
      const worldQ = groupRef.current.getWorldQuaternion(new THREE.Quaternion());
      labelRef.current.quaternion.copy(worldQ.invert());
    }
  });

  return (
    <group ref={groupRef}>
      {/* Hover + click detection sphere on the stable parent */}
      <mesh
        userData={{ walletAddress: FAUCET_ADDRESS, bodyRadius: BODY_RADIUS, bodyType: "satellite" }}
        onPointerEnter={() => { setHovered(true); document.body.style.cursor = "pointer"; }}
        onPointerLeave={() => { setHovered(false); document.body.style.cursor = "auto"; }}
        onClick={onClick}
      >
        <sphereGeometry args={[6, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <group ref={bodyRef}>
        {/* Main body */}
        <mesh material={matBody}>
          <boxGeometry args={[BODY_W, BODY_H, BODY_D]} />
        </mesh>

        {/* Solar panel left */}
        <mesh position={[-(BODY_W / 2 + PANEL_W / 2 + 0.1), 0, 0]} material={matPanel}>
          <boxGeometry args={[PANEL_W, PANEL_H, PANEL_D]} />
        </mesh>

        {/* Solar panel right */}
        <mesh position={[(BODY_W / 2 + PANEL_W / 2 + 0.1), 0, 0]} material={matPanel}>
          <boxGeometry args={[PANEL_W, PANEL_H, PANEL_D]} />
        </mesh>

        {/* Antenna dish stub */}
        <mesh position={[0, BODY_H / 2 + 0.35, 0]} material={matAntenna}>
          <cylinderGeometry args={[0.08, 0.08, 0.7, 6]} />
        </mesh>
        <mesh position={[0, BODY_H / 2 + 0.75, 0]} material={matAntenna} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.35, 0.04, 6, 12, Math.PI]} />
        </mesh>
      </group>

      {/* Glow point */}
      <pointLight color="#00aaff" intensity={hovered ? 1.5 : 0.35} distance={20} decay={2} />

      {/* Label + tooltip in a group that counter-rotates to stay upright */}
      <group ref={labelRef}>
        {/* Label — same behaviour as planet labels: only when showLabel is true */}
        {showLabel && (
          <Html position={[0, 5, 0]} center zIndexRange={[5000, 0]} style={{ pointerEvents: "none" }}>
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
              FAUCET{stats ? ` · ${stats.totalClaims}` : ""}
            </div>
          </Html>
        )}

        {/* Hover tooltip: full stats */}
        {hovered && (
          <Html position={[0, 9, 0]} center zIndexRange={[8000, 0]} style={{ pointerEvents: "none" }}>
            <div style={{
              background: "rgba(2, 6, 14, 0.93)",
              border: "1px solid rgba(0,229,255,0.2)",
              borderLeft: "2px solid rgba(0,229,255,0.6)",
              padding: "8px 12px",
              fontFamily: "'JetBrains Mono','SF Mono',monospace",
              fontSize: 10,
              color: "#8aafcc",
              whiteSpace: "nowrap",
            }}>
              <div style={{ color: "#d8f6ff", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 6, textTransform: "uppercase", fontSize: 9 }}>
                ◈ GNET Faucet
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 3 }}>
                <span style={{ color: "rgba(0,229,255,0.5)", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.1em" }}>total claims</span>
                <span style={{ color: "#00e5ff" }}>{stats ? stats.totalClaims.toLocaleString() : "…"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 3 }}>
                <span style={{ color: "rgba(0,229,255,0.5)", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.1em" }}>distributed</span>
                <span style={{ color: "#00e5ff" }}>{stats ? `${stats.totalDistributed} GNET` : "…"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <span style={{ color: "rgba(0,229,255,0.5)", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.1em" }}>balance</span>
                <span style={{ color: "#00e5ff" }}>{stats ? `${stats.balance} GNET` : "…"}</span>
              </div>
            </div>
          </Html>
        )}
      </group>
    </group>
  );
}
