"use client";

import React, { useMemo } from "react";
import { Line } from "@react-three/drei";

interface OrbitRingProps {
  radius: number;
  tilt?: number;
  color?: string;
  opacity?: number;
}

/**
 * Subtle circular orbit line in the XZ plane (optionally tilted).
 */
export default function OrbitRing({
  radius,
  tilt = 0,
  color = "#334466",
  opacity = 0.15,
}: OrbitRingProps) {
  const points = useMemo(() => {
    const pts: [number, number, number][] = [];
    const segments = 128;
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      pts.push([Math.cos(angle) * radius, 0, Math.sin(angle) * radius]);
    }
    return pts;
  }, [radius]);

  return (
    <group rotation={[tilt, 0, 0]}>
      <Line
        points={points}
        color={color}
        opacity={opacity}
        transparent
        lineWidth={1}
      />
    </group>
  );
}
