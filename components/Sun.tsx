"use client";

import React, { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { NOISE_GLSL } from "@/lib/glsl";
import { SUN_RADIUS } from "@/lib/layout";

/* == surface shader (photosphere) == */
const surfaceVert = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vNorm;
  varying vec3 vWorldPos;
  void main() {
    vPos  = position;
    vNorm = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
  }
`;

const surfaceFrag = /* glsl */ `
  uniform float uTime;
  varying vec3 vPos;
  varying vec3 vNorm;
  varying vec3 vWorldPos;

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

    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float mu   = max(dot(vNorm, viewDir), 0.0);

    /* limb darkening */
    float limb = 0.55 + 0.45 * pow(mu, 0.35);
    col *= limb;

    float edge = pow(1.0 - mu, 4.0);
    col = mix(col, vec3(1.0, 0.40, 0.06), edge * 0.45);

    /* ── subtle prominence / filament highlights ── */
    float fn = fbm(p * 3.0 + vec3(uTime*0.012, uTime*0.007, 0.0));
    float faceMask = pow(mu, 0.4);
    float filament = smoothstep(0.35, 0.65, fn) * faceMask;
    vec3 filCol = mix(vec3(1.0, 0.35, 0.05), vec3(1.0, 0.80, 0.30), fn);
    col += filCol * filament * 0.45;

    col *= 1.5;

    gl_FragColor = vec4(col, 1.0);
  }
`;

/* prominence / filament effect is now integrated into surfaceFrag above */

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

/* == soft bloom / anamorphic flare == */
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

  ${NOISE_GLSL}

  void main() {
    vec2 c = vUv - 0.5;
    float d = length(c);

    /* circular mask — fade before square edges */
    float mask = smoothstep(0.50, 0.20, d);

    /* ── 1. soft central bloom (white-hot core) ── */
    float core     = exp(-d * 18.0) * 0.85;
    float innerGlow = exp(-d * 8.0) * 0.40;
    float outerGlow = exp(-d * 3.5) * 0.12;

    /* ── 2. subtle anamorphic horizontal streak (like a real lens) ── */
    float hStretch = exp(-abs(c.y) * 35.0) * exp(-abs(c.x) * 1.8) * 0.25;
    float vStretch = exp(-abs(c.x) * 45.0) * exp(-abs(c.y) * 2.5) * 0.08;

    /* ── 3. noise-based corona wisps (organic, not geometric) ── */
    float angle = atan(c.y, c.x);
    vec3 noiseCoord = vec3(
      cos(angle) * 2.0,
      sin(angle) * 2.0,
      uTime * 0.015
    );
    float n = fbm(noiseCoord * 1.5);
    float wisps = n * exp(-d * 3.0) * 0.20;

    /* subtle angular variation (very soft, organic) */
    float angularVar = fbm(vec3(angle * 1.2, d * 3.0, uTime * 0.008));
    float softRays = pow(angularVar, 2.0) * exp(-d * 4.0) * 0.15;

    /* ── combine everything ── */
    float brightness = core + innerGlow + outerGlow + hStretch + vStretch + wisps + softRays;

    vec3 white  = vec3(1.00, 0.99, 0.95);
    vec3 warm   = vec3(1.00, 0.90, 0.60);
    vec3 orange = vec3(1.00, 0.65, 0.25);

    /* colour shifts from white core → warm middle → orange edge */
    vec3 col = mix(orange, warm, exp(-d * 4.0));
    col = mix(col, white, exp(-d * 10.0));
    col *= brightness;

    col *= mask;
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
      depthTest: false, side: THREE.DoubleSide,
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

  const s = SUN_RADIUS * 5;
  return (
    <mesh ref={ref}>
      <planeGeometry args={[s * 2, s * 2]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}

/* == Sun component == */
interface SunProps {
  totalVotingPower?: string;
  totalLocked?: string;
  blockNumber?: number;   // changes each block → triggers a flash
}

export default function Sun({ totalVotingPower, totalLocked, blockNumber }: SunProps) {
  const surfaceMat = useMemo(
    () => new THREE.ShaderMaterial({
      vertexShader: surfaceVert, fragmentShader: surfaceFrag,
      uniforms: { uTime: { value: 0 } },
    }), []);



  // ── Block-flash corona ──
  const flashMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: haloVert,
    fragmentShader: haloFrag,
    uniforms: {
      uColor:   { value: new THREE.Color("#fff8d0") },
      uAlpha:   { value: 0 },
      uFalloff: { value: 1.8 },
    },
    blending:    THREE.AdditiveBlending,
    transparent: true,
    depthWrite:  false,
    depthTest:   false,
    side:        THREE.DoubleSide,
  }), []);
  const flashRef     = useRef<THREE.Mesh>(null);
  const flashAmount  = useRef(0);         // 0–1 decaying value
  const prevBlock    = useRef<number>(-1);
  const { camera } = useThree();

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    surfaceMat.uniforms.uTime.value = t;

    // Flash on new block
    if (blockNumber !== undefined && blockNumber !== prevBlock.current && blockNumber > 0) {
      prevBlock.current = blockNumber;
      flashAmount.current = 1.0;
    }
    if (flashAmount.current > 0) {
      flashAmount.current = Math.max(0, flashAmount.current - delta * 2.8);
      flashMat.uniforms.uAlpha.value = flashAmount.current * 0.45;
    }
    if (flashRef.current) flashRef.current.quaternion.copy(camera.quaternion);
  });

  return (
    <group>
      {/* photosphere */}
      <mesh>
        <sphereGeometry args={[SUN_RADIUS, 128, 128]} />
        <primitive object={surfaceMat} attach="material" />
      </mesh>

      {/* block-flash halo */}
      <mesh ref={flashRef}>
        <planeGeometry args={[SUN_RADIUS * 2 * 9, SUN_RADIUS * 2 * 9]} />
        <primitive object={flashMat} attach="material" />
      </mesh>

      {/* soft bloom billboard */}
      <LensFlare />

      {/* corona layers — fewer, softer */}
      <HaloLayer scale={1.12} color="#fffef0" alpha={0.90} falloff={4.0} />
      <HaloLayer scale={1.45} color="#fff4c8" alpha={0.55} falloff={3.0} />
      <HaloLayer scale={2.20} color="#ffe080" alpha={0.30} falloff={2.2} />
      <HaloLayer scale={3.80} color="#ffaa33" alpha={0.14} falloff={1.5} />
      <HaloLayer scale={7.00} color="#ff7711" alpha={0.05} falloff={1.0} />

      <pointLight intensity={28} distance={12000} decay={0.10} color="#fff5e0" />

      {/* Strength label */}
      {(totalVotingPower || totalLocked) && (
        <Html
          position={[0, -(SUN_RADIUS + 16), 0]}
          center
          zIndexRange={[6000, 0]}
          style={{ pointerEvents: "none" }}
        >
          <div style={{
            color: "#5a7a90",
            fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
            fontSize: 10,
            textAlign: "center",
            whiteSpace: "nowrap",
            textShadow: "0 0 12px rgba(0,0,0,0.95), 0 0 30px rgba(0,0,0,0.7)",
            letterSpacing: "0.08em",
            lineHeight: 1.8,
            textTransform: "uppercase",
          }}>
            <div style={{ color: "#ffc860", fontSize: 13, fontWeight: 700, letterSpacing: "0.18em", marginBottom: 2 }}>
              VESCROW
            </div>
            {totalVotingPower && (
              <div style={{ color: "#00e5ff", fontSize: 11, fontWeight: 600 }}>
                {totalVotingPower}
              </div>
            )}
            {totalLocked && (
              <div style={{ color: "#c0a050" }}>
                {totalLocked}
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}
