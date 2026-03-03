"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const N        = 1400;
const MAX_DIST = 780;
const MIN_DIST = 14;
const SPEED_LO = 0.5;
const SPEED_HI = 2.2;

function randDir(): THREE.Vector3 {
  const theta = Math.random() * Math.PI * 2;
  const phi   = Math.acos(2 * Math.random() - 1);
  return new THREE.Vector3(
    Math.sin(phi) * Math.cos(theta),
    Math.sin(phi) * Math.sin(theta),
    Math.cos(phi),
  );
}

const VERT = /* glsl */ `
  attribute float aAlpha;
  varying float vAlpha;
  void main() {
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(240.0 / -mv.z, 0.4, 2.2);
    gl_Position  = projectionMatrix * mv;
  }
`;
const FRAG = /* glsl */ `
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.2, d) * vAlpha;
    gl_FragColor = vec4(0.50, 0.80, 1.0, a * 0.55);
  }
`;

export default function SolarWind() {
  /* Per-particle state (NOT reactive — mutated in useFrame) */
  const vels = useRef<Float32Array>(null as unknown as Float32Array);

  const { geo, mat } = useMemo(() => {
    const pos   = new Float32Array(N * 3);
    const alpha = new Float32Array(N);
    const vel   = new Float32Array(N * 3);

    for (let i = 0; i < N; i++) {
      const r   = MIN_DIST + Math.random() * (MAX_DIST - MIN_DIST);
      const dir = randDir();
      const spd = SPEED_LO + Math.random() * (SPEED_HI - SPEED_LO);
      pos[i * 3]     = dir.x * r;
      pos[i * 3 + 1] = dir.y * r;
      pos[i * 3 + 2] = dir.z * r;
      vel[i * 3]     = dir.x * spd;
      vel[i * 3 + 1] = dir.y * spd;
      vel[i * 3 + 2] = dir.z * spd;
      alpha[i] = 0.06 + Math.random() * 0.28;
    }

    vels.current = vel;

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aAlpha",   new THREE.BufferAttribute(alpha, 1));

    const m = new THREE.ShaderMaterial({
      vertexShader:   VERT,
      fragmentShader: FRAG,
      transparent:    true,
      depthWrite:     false,
      blending:       THREE.AdditiveBlending,
    });

    return { geo: g, mat: m };
  }, []);

  useFrame((_, delta) => {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const vel = vels.current;
    const dt  = Math.min(delta, 0.05); // cap for tab-switch spikes

    for (let i = 0; i < N; i++) {
      const ix = i * 3;
      pos.array[ix]     += vel[ix]     * dt;
      pos.array[ix + 1] += vel[ix + 1] * dt;
      pos.array[ix + 2] += vel[ix + 2] * dt;

      const x = pos.array[ix], y = pos.array[ix + 1], z = pos.array[ix + 2];
      if (x * x + y * y + z * z > MAX_DIST * MAX_DIST) {
        // respawn near sun, new random direction
        const dir = randDir();
        const spd = SPEED_LO + Math.random() * (SPEED_HI - SPEED_LO);
        const r   = MIN_DIST + Math.random() * 6;
        pos.array[ix]     = dir.x * r;
        pos.array[ix + 1] = dir.y * r;
        pos.array[ix + 2] = dir.z * r;
        vel[ix]     = dir.x * spd;
        vel[ix + 1] = dir.y * spd;
        vel[ix + 2] = dir.z * spd;
      }
    }
    pos.needsUpdate = true;
  });

  return (
    <points material={mat} geometry={geo} frustumCulled={false} />
  );
}
