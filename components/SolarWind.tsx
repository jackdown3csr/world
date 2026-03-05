"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const N        = 800;
const MAX_DIST = 600;
const MIN_DIST = 16;
const SPEED_LO = 0.6;
const SPEED_HI = 2.8;

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
    gl_PointSize = clamp(360.0 / -mv.z, 0.6, 3.5);
    gl_Position  = projectionMatrix * mv;
  }
`;
const FRAG = /* glsl */ `
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.1, d) * vAlpha;
    vec3 col = mix(__LO__, __HI__, d);
    gl_FragColor = vec4(col, a * 0.70);
  }
`;

export default function SolarWind({ origin = [0, 0, 0], color = "warm" }: {
  origin?: [number, number, number];
  color?:  "warm" | "cool";
}) {
  /* Per-particle state (NOT reactive — mutated in useFrame) */
  const vels = useRef<Float32Array>(null as unknown as Float32Array);
  const originVec = useMemo(() => new THREE.Vector3(...origin), [origin[0], origin[1], origin[2]]); // eslint-disable-line react-hooks/exhaustive-deps

  // Warm: white-gold solar wind; Cool: blue-white O-type stellar wind
  const windColor = color === "cool"
    ? { lo: "vec3(0.75, 0.90, 1.00)", hi: "vec3(0.55, 0.75, 1.00)" }
    : { lo: "vec3(1.0, 0.92, 0.65)",  hi: "vec3(1.0, 0.78, 0.42)"  };

  const { geo, mat } = useMemo(() => {
    const pos   = new Float32Array(N * 3);
    const alpha = new Float32Array(N);
    const vel   = new Float32Array(N * 3);

    for (let i = 0; i < N; i++) {
      const r   = MIN_DIST + Math.random() * (MAX_DIST - MIN_DIST);
      const dir = randDir();
      const spd = SPEED_LO + Math.random() * (SPEED_HI - SPEED_LO);
      pos[i * 3]     = origin[0] + dir.x * r;
      pos[i * 3 + 1] = origin[1] + dir.y * r;
      pos[i * 3 + 2] = origin[2] + dir.z * r;
      vel[i * 3]     = dir.x * spd;
      vel[i * 3 + 1] = dir.y * spd;
      vel[i * 3 + 2] = dir.z * spd;
      alpha[i] = 0.10 + Math.random() * 0.40;
    }

    vels.current = vel;

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aAlpha",   new THREE.BufferAttribute(alpha, 1));

    const m = new THREE.ShaderMaterial({
      vertexShader:   VERT,
      fragmentShader: FRAG.replace("__LO__", windColor.lo).replace("__HI__", windColor.hi),
      transparent:    true,
      depthWrite:     false,
      blending:       THREE.AdditiveBlending,
    });

    return { geo: g, mat: m };
  }, [windColor.lo, windColor.hi]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, delta) => {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const vel = vels.current;
    const dt  = Math.min(delta, 0.05); // cap for tab-switch spikes

    for (let i = 0; i < N; i++) {
      const ix = i * 3;
      pos.array[ix]     += vel[ix]     * dt;
      pos.array[ix + 1] += vel[ix + 1] * dt;
      pos.array[ix + 2] += vel[ix + 2] * dt;

      const dx = pos.array[ix] - originVec.x;
      const dy = pos.array[ix + 1] - originVec.y;
      const dz = pos.array[ix + 2] - originVec.z;
      if (dx * dx + dy * dy + dz * dz > MAX_DIST * MAX_DIST) {
        // respawn near star, new random direction
        const dir = randDir();
        const spd = SPEED_LO + Math.random() * (SPEED_HI - SPEED_LO);
        const r   = MIN_DIST + Math.random() * 6;
        pos.array[ix]     = originVec.x + dir.x * r;
        pos.array[ix + 1] = originVec.y + dir.y * r;
        pos.array[ix + 2] = originVec.z + dir.z * r;
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
