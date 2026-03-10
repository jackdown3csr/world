"use client";

import React, { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { SUN_RADIUS } from "@/lib/layout";

import { DWARF_PARAMS, DYING_PARAMS, type StarPalette, VESCROW_PARAMS, VESTING_PARAMS } from "./config";
import {
  createDwarfCoronaMaterial,
  createDyingEmberResources,
  createDyingGasEnvelopeMaterial,
  createHaloMaterial,
  createLensFlareMaterial,
  createVescrowCoronaMaterial,
  createVestingAtmosphereMaterial,
} from "./starMaterials";

function useAnimatedShaderTime(material: THREE.ShaderMaterial, paused: boolean) {
  const simTimeRef = useRef(0);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 1 / 30);
    if (!paused) simTimeRef.current += delta;
    material.uniforms.uTime.value = simTimeRef.current;
  });
}

export function HaloLayer({
  scale,
  color,
  alpha,
  falloff,
}: {
  scale: number;
  color: string;
  alpha: number;
  falloff: number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  const mat = useMemo(() => createHaloMaterial(color, alpha, falloff), [color, alpha, falloff]);

  useFrame(() => {
    if (ref.current) ref.current.quaternion.copy(camera.quaternion);
  });

  const size = SUN_RADIUS * scale;
  return (
    <mesh ref={ref} renderOrder={-99}>
      <planeGeometry args={[size * 2, size * 2]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}

export function LensFlare({
  palette,
  paused = false,
  scaleMult = 5,
  opacity = 1,
}: {
  palette: StarPalette;
  paused?: boolean;
  scaleMult?: number;
  opacity?: number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  const mat = useMemo(() => createLensFlareMaterial(palette, opacity), [palette, opacity]);

  useAnimatedShaderTime(mat, paused);

  useFrame(() => {
    if (ref.current) ref.current.quaternion.copy(camera.quaternion);
  });

  const size = SUN_RADIUS * scaleMult;
  return (
    <mesh ref={ref} renderOrder={-99}>
      <planeGeometry args={[size * 2, size * 2]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}

export function VescrowCoronaShell({ paused = false }: { paused?: boolean }) {
  const mat = useMemo(() => createVescrowCoronaMaterial(), []);
  useAnimatedShaderTime(mat, paused);

  return (
    <mesh renderOrder={-98}>
      <sphereGeometry args={[SUN_RADIUS * VESCROW_PARAMS.coronaScale, 72, 72]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}

export function DwarfCoronaShell({ paused = false }: { paused?: boolean }) {
  const mat = useMemo(() => createDwarfCoronaMaterial(), []);
  useAnimatedShaderTime(mat, paused);

  return (
    <mesh renderOrder={-98}>
      <sphereGeometry args={[SUN_RADIUS * DWARF_PARAMS.coronaScale, 72, 72]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}

export function VestingAtmosphereShell({ paused = false }: { paused?: boolean }) {
  const mat = useMemo(() => createVestingAtmosphereMaterial(), []);
  useAnimatedShaderTime(mat, paused);

  return (
    <mesh renderOrder={-98}>
      <sphereGeometry args={[SUN_RADIUS * VESTING_PARAMS.atmosphereScale, 72, 72]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}

export function DyingGasEnvelope({ paused = false }: { paused?: boolean }) {
  const mat = useMemo(() => createDyingGasEnvelopeMaterial(), []);
  useAnimatedShaderTime(mat, paused);

  return (
    <mesh renderOrder={-98}>
      <sphereGeometry args={[SUN_RADIUS * DYING_PARAMS.gasScale, 72, 72]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}

export function DyingEmberField({ paused = false }: { paused?: boolean }) {
  const { geo, mat } = useMemo(() => createDyingEmberResources(), []);
  useAnimatedShaderTime(mat, paused);

  return (
    <points renderOrder={-96}>
      <primitive object={geo} attach="geometry" />
      <primitive object={mat} attach="material" />
    </points>
  );
}
