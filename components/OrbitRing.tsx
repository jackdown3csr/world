"use client";

import React, { useMemo } from "react";
import { Line } from "@react-three/drei";
import * as THREE from "three";

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
    const segments = 192;
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      pts.push([Math.cos(angle) * radius, 0, Math.sin(angle) * radius]);
    }
    return pts;
  }, [radius]);

  const radii = useMemo(() => {
    const spread = Math.max(0.8, radius * 0.0016);
    return {
      outer: radius + spread,
      base: radius,
      inner: Math.max(0, radius - spread * 0.55),
    };
  }, [radius]);

  const tones = useMemo(() => {
    const base = new THREE.Color(color);
    const haze = base.clone().lerp(new THREE.Color("#8ab8ff"), 0.18);
    const core = base.clone().lerp(new THREE.Color("#d8e7ff"), 0.42);
    return {
      haze: `#${haze.getHexString()}`,
      base: `#${base.getHexString()}`,
      core: `#${core.getHexString()}`,
    };
  }, [color]);

  // Moon orbit rings (low opacity) use a single line; planet orbits get the 3-line halo
  const simple = opacity < 0.14;

  return (
    <group rotation={[tilt, 0, 0]}>
      {!simple && (
        <Line
          points={points}
          color={tones.haze}
          opacity={opacity * 0.18}
          transparent
          lineWidth={1}
          position={[0, 0, 0]}
          scale={[radii.outer / radius, 1, radii.outer / radius]}
        />
      )}
      <Line
        points={points}
        color={simple ? tones.base : tones.base}
        opacity={simple ? opacity : opacity * 0.82}
        transparent
        lineWidth={1}
      />
      {!simple && (
        <Line
          points={points}
          color={tones.core}
          opacity={opacity * 0.42}
          transparent
          lineWidth={1}
          position={[0, 0, 0]}
          scale={[radii.inner / radius, 1, radii.inner / radius]}
        />
      )}
    </group>
  );
}
