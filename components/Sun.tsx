"use client";

import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { SUN_RADIUS } from "@/lib/layout";

import SpriteLabel from "./SpriteLabel";
import {
  DwarfCoronaShell,
  DyingEmberField,
  DyingGasEnvelope,
  HaloLayer,
  LensFlare,
  VescrowCoronaShell,
  VestingAtmosphereShell,
} from "./sun/StarVisuals";
import {
  SUN_PALETTES,
  getCmeAlphaMultiplier,
  getHaloLayers,
  getLabelAnchorRadius,
  getLensFlareConfig,
  getPointLightConfig,
  getStarVariant,
  type StarPalette,
} from "./sun/config";
import { createCmeMaterial, createSurfaceMaterial } from "./sun/starMaterials";

export type { StarPalette } from "./sun/config";

interface SunProps {
  totalVotingPower?: string;
  totalLocked?: string;
  blockNumber?: number;
  position?: [number, number, number];
  palette?: StarPalette;
  label?: string;
  starId?: string;
  scale?: number;
  overviewRadius?: number;
  onSelect?: () => void;
  paused?: boolean;
}

export default function Sun({
  totalVotingPower,
  totalLocked,
  blockNumber,
  position = [0, 0, 0],
  palette = "warm",
  label,
  starId = "__star__",
  scale = 1,
  overviewRadius,
  onSelect,
  paused = false,
}: SunProps) {
  const pal = SUN_PALETTES[palette];
  const variant = getStarVariant(palette);
  const surfaceMat = useMemo(() => createSurfaceMaterial(palette), [palette]);
  const cmeMat = useMemo(() => createCmeMaterial(), []);
  const cmeRef = useRef<THREE.Mesh>(null);
  const simTimeRef = useRef(0);
  const cmeProgress = useRef(1.0);
  const cmeActive = useRef(false);
  const prevBlock = useRef<number>(-1);

  useFrame((_, delta) => {
    if (!paused) simTimeRef.current += delta;
    surfaceMat.uniforms.uTime.value = simTimeRef.current;

    if (!paused && blockNumber !== undefined && blockNumber !== prevBlock.current && blockNumber > 0) {
      prevBlock.current = blockNumber;
      cmeProgress.current = 0.0;
      cmeActive.current = true;
      if (cmeRef.current) cmeRef.current.scale.setScalar(1.0);
    }

    if (!paused && cmeActive.current && cmeRef.current) {
      cmeProgress.current = Math.min(1.0, cmeProgress.current + delta / 3.2);
      if (cmeProgress.current >= 1.0) {
        cmeActive.current = false;
        cmeMat.uniforms.uAlpha.value = 0;
      } else {
        const progress = cmeProgress.current;
        cmeRef.current.scale.setScalar(1.0 + progress * 12.0);
        cmeMat.uniforms.uAlpha.value = (progress < 0.08
          ? progress * 12.5
          : Math.pow(1.0 - (progress - 0.08) / 0.92, 1.35)) * getCmeAlphaMultiplier(palette);
        cmeMat.uniforms.uProgress.value = progress;
      }
    }
  });

  const haloLayers = getHaloLayers(palette);
  const flareConfig = getLensFlareConfig(palette);
  const pointLight = getPointLightConfig(palette);
  const labelYOffset = -(getLabelAnchorRadius(palette) * scale);

  return (
    <group position={position}>
      <group scale={scale}>
        <mesh
          userData={{ walletAddress: starId, bodyRadius: SUN_RADIUS * scale, focusRadius: overviewRadius, bodyType: "star" }}
          onClick={onSelect ? (e) => { e.stopPropagation(); onSelect(); } : undefined}
          onPointerOver={onSelect ? () => { document.body.style.cursor = "pointer"; } : undefined}
          onPointerOut={() => { document.body.style.cursor = "auto"; }}
        >
          <sphereGeometry args={[SUN_RADIUS, 128, 128]} />
          <primitive object={surfaceMat} attach="material" />
        </mesh>

        <mesh ref={cmeRef}>
          <sphereGeometry args={[SUN_RADIUS, 48, 32]} />
          <primitive object={cmeMat} attach="material" />
        </mesh>

        <LensFlare palette={palette} paused={paused} scaleMult={flareConfig.scaleMult} opacity={flareConfig.opacity} />

        {variant === "vescrow" && <VescrowCoronaShell paused={paused} />}
        {variant === "vesting" && <VestingAtmosphereShell paused={paused} />}
        {variant === "dwarf" && <DwarfCoronaShell paused={paused} />}
        {variant === "dying" && <DyingGasEnvelope paused={paused} />}
        {variant === "dying" && <DyingEmberField paused={paused} />}

        {haloLayers.map((layer) => (
          <HaloLayer
            key={`${layer.scale}-${layer.alpha}`}
            scale={layer.scale}
            color={layer.color}
            alpha={layer.alpha}
            falloff={layer.falloff}
          />
        ))}

        <pointLight
          intensity={pointLight.intensity}
          distance={pointLight.distance}
          decay={pointLight.decay}
          color={pal.point}
        />
      </group>

      {(totalVotingPower || totalLocked) && (
        <group position={[0, labelYOffset, 0]}>
          <SpriteLabel
            text={label ?? "VESCROW"}
            color={pal.label.name}
            fontSize={0.55}
            opacity={1}
            onClick={onSelect}
            alwaysVisible
          />
          {totalVotingPower && (
            <SpriteLabel
              localOffset={[0, -0.8, 0]}
              text={totalVotingPower}
              color={pal.label.accent}
              fontSize={0.42}
              opacity={0.9}
            />
          )}
          {totalLocked && (
            <SpriteLabel
              localOffset={[0, -1.5, 0]}
              text={totalLocked}
              color={pal.label.sub}
              fontSize={0.38}
              opacity={0.85}
            />
          )}
        </group>
      )}
    </group>
  );
}
