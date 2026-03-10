"use client";

import { useEffect, useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { registerSceneObject, unregisterSceneObject } from "@/lib/sceneRegistry";

/* ── Orbital parameters ── */
const ORBIT_R  = 580;          // AU-scale units, outer system
const INCL     = 65 * (Math.PI / 180); // high inclination — clearly not one of us
const PERIOD   = 950;          // seconds per full orbit
const OMEGA    = (2 * Math.PI) / PERIOD;
const PHASE    = 2.17;         // arbitrary starting phase
const ROGUE_R  = 4.2;          // body radius
export const ROGUE_ADDRESS = "__rogue__";

/* The single cryptic identifying hash shown on click */
export const ROGUE_HASH =
  "0x3f7a91b4e2c85d0f6a1b9e47c3d28f05a6e94b71c2d85f3e0a791b4c6d2e8f01";

/* ── Dark displaced shader ── */
const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  varying vec3 vNorm;
  varying vec3 vPos;
  varying vec3 vWorldPos;
  varying float vDisp;

  // Quick hash-based "noise"
  float h31(vec3 p) {
    p = fract(p * vec3(443.8975, 397.2973, 491.1871));
    p += dot(p, p.yxz + 19.19);
    return fract((p.x + p.y) * p.z);
  }
  float n3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(h31(i),           h31(i+vec3(1,0,0)), f.x),
          mix(h31(i+vec3(0,1,0)), h31(i+vec3(1,1,0)), f.x), f.y),
      mix(mix(h31(i+vec3(0,0,1)), h31(i+vec3(1,0,1)), f.x),
          mix(h31(i+vec3(0,1,1)), h31(i+vec3(1,1,1)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * n3(p); p = p * 2.1 + uSeed; a *= 0.5; }
    return v;
  }

  float dispAt(vec3 pos) {
    vec3 p = pos * 2.8 + uSeed;
    return fbm(p) * 0.28 + fbm(p * 2.0 + 7.3) * 0.12;
  }

  void main() {
    float d = dispAt(position);
    vDisp = d;
    vec3 displaced = position + normal * d * 0.6;

    // Recompute normal via finite differences
    float eps = 0.005;
    vec3 t1 = normalize(abs(normal.y) < 0.99 ? cross(normal, vec3(0,1,0)) : cross(normal, vec3(1,0,0)));
    vec3 t2 = cross(normal, t1);
    float d1 = dispAt(position + t1 * eps);
    float d2 = dispAt(position + t2 * eps);
    vec3 p1 = (position + t1 * eps) + normal * d1 * 0.6;
    vec3 p2 = (position + t2 * eps) + normal * d2 * 0.6;
    vNorm = normalize((modelMatrix * vec4(cross(p1 - displaced, p2 - displaced), 0.0)).xyz);

    vPos  = position;
    vWorldPos = (modelMatrix * vec4(displaced, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3  uStarPos;
  varying vec3 vNorm;
  varying vec3 vPos;
  varying vec3 vWorldPos;
  varying float vDisp;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float NdotV  = max(dot(vNorm, viewDir), 0.0);

    // Base: near-black with faint deep crimson seams
    vec3 col = vec3(0.035, 0.018, 0.022);

    // Displacement-driven crack glow — very subtle deep red
    float crack = smoothstep(0.28, 0.50, vDisp);
    col += crack * vec3(0.12, 0.02, 0.005);

    // Faint specular from the sun (world origin)
    vec3 sunDir = normalize(uStarPos - vWorldPos);
    float spec  = pow(max(dot(reflect(-sunDir, vNorm), viewDir), 0.0), 18.0);
    col += spec * vec3(0.04, 0.02, 0.025);

    // Edge fades to nearly-black
    float rim = 1.0 - NdotV;
    col      *= (0.6 + rim * 0.4);

    gl_FragColor = vec4(col, 1.0);
  }
`;

interface RoguePlanetProps {
  starPositions: [number, number, number][];
  onSelect?: (addr: string) => void;
  interactive?: boolean;
  paused?: boolean;
}

export default function RoguePlanet({ starPositions, onSelect, interactive = true, paused = false }: RoguePlanetProps) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef  = useRef<THREE.Mesh>(null);
  const simTimeRef = useRef(0);

  useEffect(() => {
    if (!groupRef.current) return;
    registerSceneObject(ROGUE_ADDRESS, groupRef.current, ROGUE_R, "rogue");
    return () => unregisterSceneObject(ROGUE_ADDRESS);
  }, []);
  const worldPos = useMemo(() => new THREE.Vector3(), []);
  const nearestStar = useMemo(() => new THREE.Vector3(), []);
  const sceneStars = useMemo(
    () => starPositions.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    [starPositions],
  );

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader:   VERT,
        fragmentShader: FRAG,
        uniforms: {
          uTime:    { value: 0 },
          uSeed:    { value: 7.31 },
          uStarPos: { value: new THREE.Vector3(0, 0, 0) },
        },
      }),
    [],
  );

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 1 / 30);
    if (!paused) simTimeRef.current += delta;
    const t     = simTimeRef.current;
    const angle = PHASE + OMEGA * t;
    if (groupRef.current) {
      groupRef.current.position.set(
        ORBIT_R * Math.cos(angle),
        ORBIT_R * Math.sin(INCL) * Math.sin(angle),   // inclined orbit
        ORBIT_R * Math.cos(INCL) * Math.sin(angle),
      );
      groupRef.current.getWorldPosition(worldPos);
      let minDistSq = Number.POSITIVE_INFINITY;
      for (const starPos of sceneStars) {
        const distSq = worldPos.distanceToSquared(starPos);
        if (distSq < minDistSq) {
          minDistSq = distSq;
          nearestStar.copy(starPos);
        }
      }
      material.uniforms.uStarPos.value.copy(nearestStar);
    }
    if (meshRef.current) meshRef.current.rotation.y = 0.012 * t;
    material.uniforms.uTime.value = t;
  });

  return (
    <group ref={groupRef}>
      <mesh
        ref={meshRef}
        userData={{ walletAddress: ROGUE_ADDRESS, bodyRadius: ROGUE_R, bodyType: "rogue" }}
        onPointerEnter={interactive ? (e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; } : undefined}
        onPointerLeave={interactive ? () => { document.body.style.cursor = "auto"; } : undefined}
        onClick={interactive ? (e) => { e.stopPropagation(); onSelect?.(ROGUE_ADDRESS); } : undefined}
      >
        <sphereGeometry args={[ROGUE_R, 64, 48]} />
        <primitive object={material} attach="material" />
      </mesh>
    </group>
  );
}
