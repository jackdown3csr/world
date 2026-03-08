"use client";

import React, { useCallback, useEffect, useRef, type ReactNode } from "react";
import { type ThreeEvent } from "@react-three/fiber";
import SpriteLabel from "./SpriteLabel";
import type { BridgeSceneObject } from "@/lib/bridges";
import * as THREE from "three";
import { registerSceneObject, unregisterSceneObject } from "@/lib/sceneRegistry";

interface BridgeObjectProps {
  bridge: BridgeSceneObject;
  onSelect: (bridgeId: string) => void;
  showLabel?: boolean;
  children: ReactNode;
}

export default function BridgeObject({ bridge, onSelect, showLabel = true, children }: BridgeObjectProps) {
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (!groupRef.current) return;
    registerSceneObject(bridge.id, groupRef.current, bridge.bodyRadius, "bridge");
    return () => unregisterSceneObject(bridge.id);
  }, [bridge.id, bridge.bodyRadius]);

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(bridge.id);
  }, [bridge.id, onSelect]);
  const statLines = bridge.stats.labelMetrics;

  const handlePointerOver = useCallback(() => {
    document.body.style.cursor = "pointer";
  }, []);

  const handlePointerOut = useCallback(() => {
    document.body.style.cursor = "auto";
  }, []);

  return (
    <group ref={groupRef} position={bridge.position}>
      <mesh
        userData={{
          walletAddress: bridge.id,
          bodyRadius: bridge.bodyRadius,
          bodyType: "bridge",
        }}
        onClick={handleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        <sphereGeometry args={[bridge.bodyRadius * 0.95, 16, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {children}

      {showLabel && (
        <group position={[0, -(bridge.bodyRadius + 18), 0]}>
          <SpriteLabel
            text={bridge.label}
            color="#9cecff"
            fontSize={0.55}
            opacity={1}
            onClick={() => onSelect(bridge.id)}
            alwaysVisible
          />
          {statLines.map((line, index) => (
            <SpriteLabel
              key={`${line.label}-${line.value}`}
              localOffset={[0, -0.8 - index * 0.7, 0]}
              text={`${line.label.toUpperCase()} ${line.value}`}
              color={line.accent ?? (index === 0 ? "#40eeff" : "#d8c080")}
              fontSize={index === 0 ? 0.42 : 0.38}
              opacity={index === 0 ? 0.9 : 0.85}
            />
          ))}
        </group>
      )}
    </group>
  );
}
