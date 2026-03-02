import pathlib

content = '''"use client";

import React, { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { NOISE_GLSL } from "@/lib/glsl";
import { SUN_RADIUS } from "@/lib/orbitalUtils";

/* == surface shader (photosphere) == */
const surfaceVert = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vNorm;
  void main() {
    vPos  = position;
    vNorm = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
  }
`;

const surfaceFrag = /* glsl */ `
  uniform float uTime;
  varying vec3 vPos;
  varying vec3 vNorm;

  ${NOISE_GLSL}

  float granule(vec3 p) {
    vec3 fp = floor(p); vec3 fr = fract(p);
    float d = 1.0;
    for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++) for(int z=-1;z<=1;z++) {
      vec3 o = vec3(float(x),float(y),float(z));
      vec3 rp = fp+o;
      vec3 h  = fract(sin(rp * vec3(127.1,311.7,74.7) + rp.yzx*vec3(269.5,183.3,246.1)) * 43758.5);
      d = min(d, length(fr - o - h));
    }
    return d;
  }

  void main() {
    vec3 p = normalize(vPos);
    float gran1 = granule(p * 4.5 + vec3(uTime*0.006));
    float gran2 = granule(p * 10.0 + vec3(uTime*0.014, uTime*0.009, 0.0));
    float cell  = mix(gran1, gran2, 0.45);
    float bright = 1.0 - smoothstep(0.12, 0.50, cell);

    float activity = fbm(p * 2.0 + vec3(uTime*0.004));
    float spots    = smoothstep(0.52, 0.68, activity) * 0.35;
    float fac = smoothstep(0.60, 0.80, activity) * 0.25;

    vec3 white  = vec3(1.00, 0.99, 0.94);
    vec3 yellow = vec3(1.00, 0.88, 0.45);
    vec3 orange = vec3(1.00, 0.60, 0.15);
    vec3 dark   = vec3(0.55, 0.20, 0.04);

    vec3 col = mix(orange, yellow, bright);
    col      = mix(col, white, bright * bright * 0.70);
    col      = mix(col, dark, spots);
    col     += white * fac;

    float mu   = max(dot(vNorm, vec3(0.0,0.0,1.0)), 0.0);
    float limb = 0.55 + 0.45 * pow(mu, 0.35);
    col *= limb;

    float edge = pow(1.0 - mu, 4.0);
    col = mix(col, vec3(1.0, 0.40, 0.06), edge * 0.50);
    col *= 1.6;

    gl_FragColor = vec4(col, 1.0);
  }
`;

/* == prominence / filament layer == */
const promVert = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vNorm;
  void main() {
    vPos  = position;
    vNorm = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
  }
`;

const promFrag = /* glsl */ `
  uniform float uTime;
  varying vec3 vPos;
  varying vec3 vNorm;

  ${NOISE_GLSL}

  void main() {
    vec3 p  = normalize(vPos);
    float mu = max(dot(vNorm, vec3(0.0,0.0,1.0)), 0.0);
    float limbMask = pow(1.0 - mu, 5.0);
    float n = fbm(p * 3.0 + vec3(uTime*0.012, uTime*0.007, 0.0));
    float filament = smoothstep(0.35, 0.65, n) * limbMask;

    vec3 col = mix(vec3(1.0, 0.35, 0.05), vec3(1.0, 0.80, 0.30), n) * filament;
    float alpha = filament * 0.75;
    gl_FragColor = vec4(col, alpha);
  }
`;

/* == corona / glow halo == */
const haloVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
  }
`;

const haloFrag = /* glsl */ `
  uniform vec3  uColor;
  uniform float uAlpha;
  uniform float uFalloff;
  varying vec2 vUv;
  void main() {
    float d   = length(vUv - 0.5) * 2.0;
    float glow = pow(max(1.0 - d, 0.0), uFalloff);
    gl_FragColor = vec4(uColor * glow, glow * uAlpha);
  }
`;

/* == lens-flare / god-ray == */
const flareVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
  }
`;

const flareFrag = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;

  void main() {
    vec2 c = vUv - 0.5;
    float d = length(c);

    float angle = atan(c.y, c.x);
    float rays = 0.0;
    rays += pow(abs(cos(angle * 3.0)), 80.0) * 0.9;
    rays += pow(abs(cos(angle * 2.0 + 0.785)), 120.0) * 0.5;
    rays += pow(abs(cos(angle * 6.0 + uTime * 0.05)), 200.0) * 0.3;

    float radial = exp(-d * 2.8);
    rays *= radial;

    float core = exp(-d * 8.0) * 1.2;
    float midGlow = exp(-d * 3.5) * 0.4;

    vec3 coreCol = vec3(1.0, 0.98, 0.92) * core;
    vec3 midCol  = vec3(1.0, 0.85, 0.50) * midGlow;
    vec3 rayCol  = vec3(1.0, 0.78, 0.38) * rays;

    vec3 col = coreCol + midCol + rayCol;

    float ring = smoothstep(0.18, 0.20, d) * smoothstep(0.24, 0.22, d);
    col += vec3(1.0, 0.90, 0.70) * ring * 0.15;

    float alpha = max(max(col.r, col.g), col.b);
    gl_FragColor = vec4(col, alpha);
  }
`;

/* == HaloLayer (billboard) == */
function HaloLayer({ scale, color, alpha, falloff }:
  { scale: number; color: string; alpha: number; falloff: number }) {
  const ref   = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  const mat   = useMemo(
    () => new THREE.ShaderMaterial({
      vertexShader: haloVert, fragmentShader: haloFrag,
      uniforms: {
        uColor:   { value: new THREE.Color(color) },
        uAlpha:   { value: alpha },
        uFalloff: { value: falloff },
      },
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
      side: THREE.DoubleSide,
    }), [color, alpha, falloff]);
  useFrame(() => { if (ref.current) ref.current.quaternion.copy(camera.quaternion); });
  const s = SUN_RADIUS * scale;
  return (
    <mesh ref={ref}>
      <planeGeometry args={[s * 2, s * 2]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}

/* == LensFlare (camera-facing billboard) == */
function LensFlare() {
  const ref = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  const mat = useMemo(
    () => new THREE.ShaderMaterial({
      vertexShader: flareVert, fragmentShader: flareFrag,
      uniforms: { uTime: { value: 0 } },
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    }), []);

  useFrame((state) => {
    if (ref.current) ref.current.quaternion.copy(camera.quaternion);
    mat.uniforms.uTime.value = state.clock.elapsedTime;
  });

  const s = SUN_RADIUS * 6;
  return (
    <mesh ref={ref} renderOrder={10}>
      <planeGeometry args={[s * 2, s * 2]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}

/* == Sun component == */
export default function Sun() {
  const surfaceMat = useMemo(
    () => new THREE.ShaderMaterial({
      vertexShader: surfaceVert, fragmentShader: surfaceFrag,
      uniforms: { uTime: { value: 0 } },
    }), []);

  const promMat = useMemo(
    () => new THREE.ShaderMaterial({
      vertexShader: promVert, fragmentShader: promFrag,
      uniforms: { uTime: { value: 0 } },
      transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
    }), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    surfaceMat.uniforms.uTime.value = t;
    promMat.uniforms.uTime.value    = t;
  });

  return (
    <group>
      {/* photosphere */}
      <mesh>
        <sphereGeometry args={[SUN_RADIUS, 128, 128]} />
        <primitive object={surfaceMat} attach="material" />
      </mesh>

      {/* prominence / filament shell */}
      <mesh>
        <sphereGeometry args={[SUN_RADIUS * 1.015, 96, 96]} />
        <primitive object={promMat} attach="material" />
      </mesh>

      {/* lens-flare / god-rays */}
      <LensFlare />

      {/* corona layers */}
      <HaloLayer scale={1.15} color="#fffef0" alpha={1.0}  falloff={3.5} />
      <HaloLayer scale={1.50} color="#fff8d0" alpha={0.75} falloff={2.8} />
      <HaloLayer scale={2.20} color="#ffdd55" alpha={0.50} falloff={2.2} />
      <HaloLayer scale={3.50} color="#ffbb22" alpha={0.30} falloff={1.7} />
      <HaloLayer scale={6.00} color="#ff8811" alpha={0.14} falloff={1.2} />
      <HaloLayer scale={10.0} color="#ff5500" alpha={0.06} falloff={0.8} />
      <HaloLayer scale={18.0} color="#ff3300" alpha={0.02} falloff={0.5} />

      <pointLight intensity={28} distance={12000} decay={0.10} color="#fff5e0" />
    </group>
  );
}
'''

pathlib.Path('components/Sun.tsx').write_text(content.lstrip(), encoding='utf-8')
print('OK', len(content))
