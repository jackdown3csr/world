"use client";

import React, { useRef, useMemo, useEffect, useCallback } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

import type { WalletEntry } from "@/lib/types";
import { hashToLatLon, hashToHue, latLonToXYZ } from "@/lib/hashToLatLon";
import { scaleBalance } from "@/lib/scaleBalance";
import WalletTooltip from "./WalletTooltip";

/* ── Constants ────────────────────────────────────────────── */

const MAX_INSTANCES = 5_000;
const SPHERE_RADIUS = 1.01; // slightly above planet surface
const CITY_WIDTH = 0.006;
const LERP_SPEED = 5; // ease‑in speed (higher = faster settle)

/* ── Shared geometry & material ───────────────────────────── */

const cityGeometry = new THREE.BoxGeometry(CITY_WIDTH, CITY_WIDTH, 1);
// Shift geometry so bottom face sits at origin (tower grows outward)
cityGeometry.translate(0, 0, 0.5);

const cityMaterial = new THREE.MeshStandardMaterial({
  roughness: 0.4,
  metalness: 0.6,
  emissive: new THREE.Color("#4488ff"),
  emissiveIntensity: 0.6,
  toneMapped: false,
});

/* ── Helper: orient a matrix so Z points outward from sphere ─ */

const _pos = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _mat = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();

function buildInstanceMatrix(
  x: number,
  y: number,
  z: number,
  scaleZ: number,
): THREE.Matrix4 {
  _pos.set(x, y, z);
  // lookAt from origin → position gives outward direction
  _mat.lookAt(new THREE.Vector3(0, 0, 0), _pos, _up);
  _mat.decompose(_pos, _quat, _scale); // extract rotation

  const m = new THREE.Matrix4();
  m.compose(
    new THREE.Vector3(x, y, z),
    _quat,
    new THREE.Vector3(1, 1, Math.max(scaleZ, 0.001)),
  );
  return m;
}

/* ── Component ────────────────────────────────────────────── */

interface CitiesProps {
  wallets: WalletEntry[];
}

export default function Cities({ wallets }: CitiesProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // Per‑instance animation state (persistent across renders)
  const animState = useRef<{
    currentScales: Float32Array;
    targetScales: Float32Array;
    positions: Float32Array; // x,y,z triples
    rotations: THREE.Quaternion[];
    count: number;
    animating: boolean;
  }>({
    currentScales: new Float32Array(MAX_INSTANCES),
    targetScales: new Float32Array(MAX_INSTANCES),
    positions: new Float32Array(MAX_INSTANCES * 3),
    rotations: [],
    count: 0,
    animating: false,
  });

  // Per‑instance color buffer
  const colorArray = useMemo(
    () => new Float32Array(MAX_INSTANCES * 3),
    [],
  );

  // Hovered city index (-1 = none)
  const [hovered, setHovered] = React.useState<number>(-1);

  /* ──────────── Update targets when wallets change ────────── */
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const st = animState.current;
    const count = Math.min(wallets.length, MAX_INSTANCES);
    st.count = count;
    mesh.count = count;

    // Ensure rotations array is long enough
    while (st.rotations.length < count) {
      st.rotations.push(new THREE.Quaternion());
    }

    const tempColor = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const w = wallets[i];
      const { lat, lon } = hashToLatLon(w.address);
      const [x, y, z] = latLonToXYZ(lat, lon, SPHERE_RADIUS);

      // Store position
      st.positions[i * 3] = x;
      st.positions[i * 3 + 1] = y;
      st.positions[i * 3 + 2] = z;

      // Compute outward rotation
      _pos.set(x, y, z);
      _mat.lookAt(new THREE.Vector3(0, 0, 0), _pos, _up);
      _mat.decompose(_pos, st.rotations[i], _scale);

      // Target scale
      const target = scaleBalance(w.rawBalanceWei);
      st.targetScales[i] = target;

      // If this is a NEW instance (currentScale was 0 and we haven't set it),
      // leave currentScale at 0 so it animates in.

      // Per‑instance color (hue from address hash)
      const hue = hashToHue(w.address);
      tempColor.setHSL(hue / 360, 0.7, 0.55);
      colorArray[i * 3] = tempColor.r;
      colorArray[i * 3 + 1] = tempColor.g;
      colorArray[i * 3 + 2] = tempColor.b;
    }

    // Apply colors
    mesh.instanceColor = new THREE.InstancedBufferAttribute(
      colorArray.slice(0, count * 3),
      3,
    );
    mesh.instanceColor.needsUpdate = true;

    st.animating = true;
  }, [wallets, colorArray]);

  /* ──────────── Per-frame animation ──────────────────────── */
  useFrame((_state, delta) => {
    const mesh = meshRef.current;
    const st = animState.current;
    if (!mesh || st.count === 0) return;

    let stillAnimating = false;
    const factor = 1 - Math.exp(-LERP_SPEED * delta);

    const _compose = new THREE.Matrix4();
    const _p = new THREE.Vector3();
    const _s = new THREE.Vector3();

    for (let i = 0; i < st.count; i++) {
      const current = st.currentScales[i];
      const target = st.targetScales[i];

      // Lerp
      const next = current + (target - current) * factor;
      st.currentScales[i] = next;

      if (Math.abs(next - target) > 0.0005) {
        stillAnimating = true;
      }

      // Rebuild matrix
      _p.set(
        st.positions[i * 3],
        st.positions[i * 3 + 1],
        st.positions[i * 3 + 2],
      );
      _s.set(1, 1, Math.max(next, 0.001));
      _compose.compose(_p, st.rotations[i], _s);

      mesh.setMatrixAt(i, _compose);
    }

    mesh.instanceMatrix.needsUpdate = true;
    st.animating = stillAnimating;
  });

  /* ──────────── Pointer events ───────────────────────────── */
  const onPointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const id = e.instanceId;
    setHovered(id !== undefined ? id : -1);
  }, []);

  const onPointerLeave = useCallback(() => {
    setHovered(-1);
  }, []);

  /* ──────────── Tooltip position ─────────────────────────── */
  const hoveredWallet = hovered >= 0 ? wallets[hovered] : null;
  const tooltipPos = useMemo(() => {
    if (hovered < 0) return null;
    const st = animState.current;
    const ix = hovered * 3;
    // Place tooltip slightly above the city top
    const scale = st.currentScales[hovered] || 0.02;
    const nx = st.positions[ix];
    const ny = st.positions[ix + 1];
    const nz = st.positions[ix + 2];
    // Direction from origin
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    const offset = SPHERE_RADIUS + scale + 0.06;
    return new THREE.Vector3(
      (nx / len) * offset,
      (ny / len) * offset,
      (nz / len) * offset,
    );
  }, [hovered, wallets]);

  /* ──────────── Render ───────────────────────────────────── */
  return (
    <group>
      <instancedMesh
        ref={meshRef}
        args={[cityGeometry, cityMaterial, MAX_INSTANCES]}
        frustumCulled={false}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      />

      {/* Tooltip */}
      {hoveredWallet && tooltipPos && (
        <Html position={tooltipPos} center zIndexRange={[100, 0]}>
          <WalletTooltip
            address={hoveredWallet.address}
            balanceFormatted={hoveredWallet.balanceFormatted}
          />
        </Html>
      )}
    </group>
  );
}
