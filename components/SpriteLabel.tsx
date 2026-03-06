"use client";

import React, { useRef, useEffect, useCallback } from "react";
import { Billboard, Text } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

const FONT_URL = "/jetbrains-mono-400.woff";

/** Scale factor: group.scale = cameraDistance × DISTANCE_SCALE.
 *  0.025 is the sweet spot between 0.012 (invisible) and 0.04 (too big). */
const DISTANCE_SCALE = 0.025;

/** Labels farther than this from the camera are hidden (no draw call). */
const CULL_DISTANCE = 3000;

const _v3 = new THREE.Vector3();

/* ── Module-level registry: all mounted SpriteLabel groups ── */
const _registry = new Map<THREE.Group, boolean>();

/** Single useFrame that distance-scales every registered SpriteLabel.
 *  Mount once inside <Canvas>. */
export function SpriteLabelManager() {
  useFrame(({ camera }) => {
    _registry.forEach((always, g) => {
      g.getWorldPosition(_v3);
      const d = camera.position.distanceTo(_v3);
      if (!always && d > CULL_DISTANCE) {
        g.visible = false;
      } else {
        g.visible = true;
        g.scale.setScalar(d * DISTANCE_SCALE);
      }
    });
  });
  return null;
}

export interface SpriteLabelProps {
  text: string;
  /** World-space position (applied to outer group, NOT affected by distance scale). */
  position?: [number, number, number];
  /** Local offset inside the distance-scaled group (scales with camera distance).
   *  Use this for stacking multiple labels at the same world position. */
  localOffset?: [number, number, number];
  color?: string;
  fontSize?: number;
  opacity?: number;
  fontWeight?: number;
  outlineWidth?: number;
  outlineColor?: string;
  anchorX?: "left" | "center" | "right";
  anchorY?: "top" | "middle" | "bottom";
  renderOrder?: number;
  onClick?: () => void;
  /** Skip distance culling — label stays visible at any range. */
  alwaysVisible?: boolean;
}

export default function SpriteLabel({
  text,
  position,
  localOffset,
  color = "#80a8b8",
  fontSize = 0.35,
  opacity = 0.8,
  outlineWidth = 0.04,
  outlineColor = "#000000",
  anchorX = "center",
  anchorY = "bottom",
  renderOrder = 1,
  onClick,
  alwaysVisible = false,
}: SpriteLabelProps) {
  const groupRef = useRef<THREE.Group>(null!);

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    if (!onClick) return;
    e.stopPropagation();
    onClick();
  }, [onClick]);
  const handlePointerOver = useCallback(() => {
    if (onClick) document.body.style.cursor = "pointer";
  }, [onClick]);
  const handlePointerOut = useCallback(() => {
    if (onClick) document.body.style.cursor = "auto";
  }, [onClick]);

  useEffect(() => {
    const g = groupRef.current;
    if (g) _registry.set(g, alwaysVisible);
    return () => { if (g) _registry.delete(g); };
  }, [alwaysVisible]);

  return (
    <group ref={groupRef} position={position}>
      <Billboard follow lockX={false} lockY={false} lockZ={false} position={localOffset}>
        <Text
          font={FONT_URL}
          fontSize={fontSize}
          color={color}
          anchorX={anchorX}
          anchorY={anchorY}
          outlineWidth={outlineWidth}
          outlineColor={outlineColor}
          fillOpacity={opacity}
          letterSpacing={0.08}
          renderOrder={renderOrder}
          depthOffset={-1}
          onClick={onClick ? handleClick : undefined}
          onPointerOver={onClick ? handlePointerOver : undefined}
          onPointerOut={onClick ? handlePointerOut : undefined}
        >
          {text.toUpperCase()}
        </Text>
      </Billboard>
    </group>
  );
}
