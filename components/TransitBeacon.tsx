"use client";

import React, { useCallback, useEffect, useRef } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import SpriteLabel from "./SpriteLabel";
import TransitBeaconVisual from "./transitBeacon/TransitBeaconVisual";
import { registerSceneObject, unregisterSceneObject } from "@/lib/sceneRegistry";

interface TransitBeaconProps {
  id: string;
  label: string;
  hint?: string;
  position: [number, number, number];
  bodyRadius: number;
  showLabel?: boolean;
  interactive?: boolean;
  paused?: boolean;
  onSelect: (id: string) => void;
}

export default function TransitBeacon({
  id,
  label,
  hint,
  position,
  bodyRadius,
  showLabel = true,
  interactive = true,
  paused = false,
  onSelect,
}: TransitBeaconProps) {
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (!groupRef.current) return;
    registerSceneObject(id, groupRef.current, bodyRadius, "bridge");
    return () => unregisterSceneObject(id);
  }, [bodyRadius, id]);

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(id);
  }, [id, onSelect]);

  const handlePointerOver = useCallback(() => {
    document.body.style.cursor = "pointer";
  }, []);

  const handlePointerOut = useCallback(() => {
    document.body.style.cursor = "auto";
  }, []);

  return (
    <group ref={groupRef} position={position}>
      <mesh
        userData={{ walletAddress: id, bodyRadius, bodyType: "bridge" }}
        onClick={interactive ? handleClick : undefined}
        onPointerOver={interactive ? handlePointerOver : undefined}
        onPointerOut={interactive ? handlePointerOut : undefined}
      >
        <sphereGeometry args={[bodyRadius * 0.72, 18, 18]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <TransitBeaconVisual radius={bodyRadius} paused={paused} />

      {showLabel && (
        <group position={[0, -(bodyRadius + 18), 0]}>
          <SpriteLabel
            text={label}
            color="#a8f4ff"
            fontSize={0.56}
            opacity={0.92}
            alwaysVisible
            onClick={interactive ? () => onSelect(id) : undefined}
          />
          {hint ? (
            <SpriteLabel
              localOffset={[0, -0.72, 0]}
              text={hint.toUpperCase()}
              color="#7ca6b6"
              fontSize={0.32}
              opacity={0.74}
            />
          ) : null}
        </group>
      )}
    </group>
  );
}
