"use client";

import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const SKY_RADIUS = 12000;

const FAR_STAR_COUNT = 14000;
const MID_STAR_COUNT = 2600;
const GALAXY_STAR_COUNT = 9000;
const CLUSTER_A_COUNT = 1400;
const CLUSTER_B_COUNT = 900;

const GALAXY_AXIS = new THREE.Vector3(0.28, 0.9, -0.33).normalize();
const CLUSTER_A_DIR = new THREE.Vector3(-0.62, 0.2, -0.75).normalize();
const CLUSTER_B_DIR = new THREE.Vector3(0.58, -0.32, -0.74).normalize();

function randomDirection() {
  const u = Math.random();
  const v = Math.random();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  const sinPhi = Math.sin(phi);

  return new THREE.Vector3(
    sinPhi * Math.cos(theta),
    Math.cos(phi),
    sinPhi * Math.sin(theta),
  );
}

function randomPointInShell(innerRadius: number, outerRadius: number) {
  return randomDirection().multiplyScalar(
    innerRadius + Math.random() * (outerRadius - innerRadius),
  );
}

function buildBasis(axis: THREE.Vector3) {
  const tangentA = new THREE.Vector3(1, 0, 0);
  if (Math.abs(axis.dot(tangentA)) > 0.9) tangentA.set(0, 1, 0);
  tangentA.cross(axis).normalize();
  const tangentB = axis.clone().cross(tangentA).normalize();
  return { tangentA, tangentB };
}

function starColor() {
  const t = Math.random();
  if (t < 0.14) return new THREE.Color(0.72, 0.82, 1.0);
  if (t < 0.84) return new THREE.Color(1.0, 0.985, 0.96);
  if (t < 0.95) return new THREE.Color(1.0, 0.9, 0.72);
  return new THREE.Color(1.0, 0.76, 0.5);
}

function buildStarfield(count: number, innerRadius: number, outerRadius: number, brightChance: number) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const p = randomPointInShell(innerRadius, outerRadius);
    const c = starColor();

    positions[i * 3 + 0] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;

    colors[i * 3 + 0] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;

    sizes[i] =
      Math.random() < brightChance
        ? 1.0 + Math.random() * 1.0
        : 0.28 + Math.random() * 0.42;
  }

  return { positions, colors, sizes };
}

function buildBrokenGalaxyBand(count: number, innerRadius: number, outerRadius: number) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  const { tangentA, tangentB } = buildBasis(GALAXY_AXIS);

  for (let i = 0; i < count; i++) {
    const seg = Math.random();

    let baseAngle = 0;
    if (seg < 0.34) baseAngle = -1.6 + Math.random() * 1.0;
    else if (seg < 0.68) baseAngle = 0.15 + Math.random() * 1.1;
    else baseAngle = 2.2 + Math.random() * 0.9;

    const angleJitter = (Math.random() - 0.5) * 0.18;
    const angle = baseAngle + angleJitter;

    const along = tangentA
      .clone()
      .multiplyScalar(Math.cos(angle))
      .add(tangentB.clone().multiplyScalar(Math.sin(angle)));

    const verticalSpread = (Math.random() - 0.5) * 0.08;
    const lateralSpread = (Math.random() - 0.5) * 0.03;

    const dir = along
      .clone()
      .add(GALAXY_AXIS.clone().multiplyScalar(verticalSpread))
      .add(tangentB.clone().multiplyScalar(lateralSpread * 0.5))
      .normalize();

    const radius = innerRadius + Math.random() * (outerRadius - innerRadius);
    const p = dir.multiplyScalar(radius);
    const c = Math.random() < 0.82
      ? new THREE.Color(1.0, 0.97, 0.94)
      : Math.random() < 0.5
        ? new THREE.Color(0.74, 0.83, 1.0)
        : new THREE.Color(1.0, 0.86, 0.64);

    positions[i * 3 + 0] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;

    colors[i * 3 + 0] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;

    sizes[i] = 0.18 + Math.random() * 0.34;
  }

  return { positions, colors, sizes };
}

function buildDiffuseCluster(
  count: number,
  direction: THREE.Vector3,
  radius: number,
  angularRadius: number,
  elliptical = 1,
) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const { tangentA, tangentB } = buildBasis(direction);

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spread = Math.pow(Math.random(), 1.35) * angularRadius;

    const localX = Math.cos(angle) * spread * elliptical;
    const localY = Math.sin(angle) * spread * 0.72;

    const dir = direction
      .clone()
      .add(tangentA.clone().multiplyScalar(localX))
      .add(tangentB.clone().multiplyScalar(localY))
      .normalize();

    const distance = radius - 700 + Math.random() * 1400;
    const p = dir.multiplyScalar(distance);
    const c = Math.random() < 0.84
      ? new THREE.Color(1.0, 0.97, 0.94)
      : Math.random() < 0.5
        ? new THREE.Color(0.76, 0.85, 1.0)
        : new THREE.Color(1.0, 0.84, 0.62);

    positions[i * 3 + 0] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;

    colors[i * 3 + 0] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;

    sizes[i] =
      Math.random() < 0.025
        ? 1.1 + Math.random() * 0.8
        : 0.16 + Math.random() * 0.3;
  }

  return { positions, colors, sizes };
}

function StarPoints({
  positions,
  colors,
  sizes,
  opacity = 1,
  sizeAttenuation = 0.08,
  maxPointSize = 2.2,
  blending = THREE.NormalBlending,
}: {
  positions: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
  opacity?: number;
  sizeAttenuation?: number;
  maxPointSize?: number;
  blending?: THREE.Blending;
}) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    return g;
  }, [positions, colors, sizes]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        vertexColors: true,
        blending,
        uniforms: {
          uPixelRatio: {
            value: typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio, 2),
          },
          uOpacity: { value: opacity },
          uSizeAttenuation: { value: sizeAttenuation },
          uMaxPointSize: { value: maxPointSize },
        },
        vertexShader: `
          attribute float aSize;
          varying vec3 vColor;
          uniform float uPixelRatio;
          uniform float uSizeAttenuation;
          uniform float uMaxPointSize;

          void main() {
            vColor = color;

            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mvPosition;

            float baseSize = aSize * uPixelRatio;
            float perspectiveSize = baseSize * (600.0 / max(-mvPosition.z, 1.0));
            gl_PointSize = mix(baseSize, perspectiveSize, uSizeAttenuation);
            gl_PointSize = clamp(gl_PointSize, 0.7, uMaxPointSize);
          }
        `,
        fragmentShader: `
          varying vec3 vColor;
          uniform float uOpacity;

          void main() {
            vec2 uv = gl_PointCoord - vec2(0.5);
            float d = length(uv);

            float alpha = smoothstep(0.52, 0.06, d) * uOpacity;
            float core = smoothstep(0.16, 0.0, d);
            alpha = alpha * 0.78 + core * 0.22 * uOpacity;

            gl_FragColor = vec4(vColor, alpha);
          }
        `,
      }),
    [blending, maxPointSize, opacity, sizeAttenuation],
  );

  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={-999} />;
}

export default function GalaxyBackground({ paused = false }: { paused?: boolean }) {
  const rootRef = useRef<THREE.Group>(null);

  const farStars = useMemo(
    () => buildStarfield(FAR_STAR_COUNT, SKY_RADIUS - 1500, SKY_RADIUS - 150, 0.008),
    [],
  );
  const midStars = useMemo(
    () => buildStarfield(MID_STAR_COUNT, SKY_RADIUS - 1200, SKY_RADIUS - 120, 0.06),
    [],
  );
  const galaxyBand = useMemo(
    () => buildBrokenGalaxyBand(GALAXY_STAR_COUNT, SKY_RADIUS - 900, SKY_RADIUS - 80),
    [],
  );
  const clusterA = useMemo(
    () => buildDiffuseCluster(CLUSTER_A_COUNT, CLUSTER_A_DIR, SKY_RADIUS - 700, 0.11, 1.2),
    [],
  );
  const clusterB = useMemo(
    () => buildDiffuseCluster(CLUSTER_B_COUNT, CLUSTER_B_DIR, SKY_RADIUS - 820, 0.08, 0.9),
    [],
  );

  useFrame((state) => {
    if (!rootRef.current) return;
    rootRef.current.position.copy(state.camera.position);
    if (paused) return;
  });

  return (
    <group ref={rootRef}>
      <mesh renderOrder={-1002}>
        <sphereGeometry args={[SKY_RADIUS, 32, 32]} />
        <meshBasicMaterial
          color="#01030a"
          side={THREE.BackSide}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>

      <StarPoints
        positions={farStars.positions}
        colors={farStars.colors}
        sizes={farStars.sizes}
        opacity={0.5}
        sizeAttenuation={0.03}
        maxPointSize={1.6}
        blending={THREE.NormalBlending}
      />

      <StarPoints
        positions={midStars.positions}
        colors={midStars.colors}
        sizes={midStars.sizes}
        opacity={0.7}
        sizeAttenuation={0.08}
        maxPointSize={2.1}
        blending={THREE.NormalBlending}
      />

      <StarPoints
        positions={galaxyBand.positions}
        colors={galaxyBand.colors}
        sizes={galaxyBand.sizes}
        opacity={0.13}
        sizeAttenuation={0.08}
        maxPointSize={1.5}
        blending={THREE.NormalBlending}
      />

      <StarPoints
        positions={clusterA.positions}
        colors={clusterA.colors}
        sizes={clusterA.sizes}
        opacity={0.17}
        sizeAttenuation={0.1}
        maxPointSize={1.8}
        blending={THREE.NormalBlending}
      />

      <StarPoints
        positions={clusterB.positions}
        colors={clusterB.colors}
        sizes={clusterB.sizes}
        opacity={0.14}
        sizeAttenuation={0.08}
        maxPointSize={1.6}
        blending={THREE.NormalBlending}
      />
    </group>
  );
}
