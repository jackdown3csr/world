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
    gl_FragDepth = 1.0;  /* push depth to far plane so halo billboards pass depthTest here */
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
      depthTest: true, side: THREE.DoubleSide,
    }), [color, alpha, falloff]);
  useFrame(() => { if (ref.current) ref.current.quaternion.copy(camera.quaternion); });
  const s = SUN_RADIUS * scale;
  return (
    <mesh ref={ref} renderOrder={-99}>
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
      depthTest: true,
      side: THREE.DoubleSide,
    }), []);

  useFrame((state) => {
    if (ref.current) ref.current.quaternion.copy(camera.quaternion);
    mat.uniforms.uTime.value = state.clock.elapsedTime;
  });

  const s = SUN_RADIUS * 5;
  return (
    <mesh ref={ref} renderOrder={-99}>
      <planeGeometry args={[s * 2, s * 2]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}

/* == CME (Coronal Mass Ejection) expanding plasma bubble == */
const cmeVert = /* glsl */ `
  uniform float uProgress;
  varying vec3 vNorm;
  varying vec3 vWorldPos;

  // Lightweight multi-octave hash noise for irregular ejecta surface
  float h3(vec3 p) {
    p = fract(p * vec3(127.1, 311.7, 74.7));
    p += dot(p, p.yxz + 19.19);
    return fract((p.x + p.y) * p.z);
  }
  float bumps(vec3 p) {
    float s = 0.0; float a = 0.5;
    for (int i = 0; i < 4; i++) { s += a * h3(p); p *= 2.1; p.xy += 0.37; a *= 0.5; }
    return s;
  }

  void main() {
    vNorm = normalize(mat3(modelMatrix) * normal);
    // Irregular ejecta: ragged when fresh, smooths as it disperses
    float warp = (bumps(normal * 4.0 + uProgress * 3.7) * 2.0 - 1.0)
                 * 0.22 * (1.0 - uProgress * 0.75);
    vec3 displaced = position * (1.0 + warp);
    vec4 wp = modelMatrix * vec4(displaced, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const cmeFrag = /* glsl */ `
  uniform float uAlpha;
  uniform float uProgress;
  varying vec3 vNorm;
  varying vec3 vWorldPos;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float NdotV  = abs(dot(normalize(vNorm), viewDir));
    float rim    = 1.0 - NdotV;

    // Leading shock front (sharp limb)
    float shockRim  = pow(rim, 1.3);
    // Soft inner plasma body (face-on glow)
    float innerBody = pow(NdotV, 3.0) * 0.45;
    // Combine for bubble appearance
    float shape = shockRim * 0.85 + innerBody;

    // Colour: hot white-yellow (fresh) → orange → deep red (expanded)
    vec3 hotColor  = vec3(1.00, 0.95, 0.65);
    vec3 midColor  = vec3(1.00, 0.48, 0.08);
    vec3 coolColor = vec3(0.85, 0.14, 0.04);
    float t = uProgress;
    vec3 plasmaCol = t < 0.45
      ? mix(hotColor, midColor,  t / 0.45)
      : mix(midColor, coolColor, (t - 0.45) / 0.55);
    // Rim is always brighter / hotter looking
    vec3 col = plasmaCol + vec3(0.35, 0.12, 0.0) * shockRim;

    float alpha = shape * uAlpha;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

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



  // ── CME (Coronal Mass Ejection) — expanding plasma bubble on each new block ──
  const cmeMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader:   cmeVert,
    fragmentShader: cmeFrag,
    uniforms: {
      uAlpha:    { value: 0 },
      uProgress: { value: 0 },
    },
    blending:    THREE.AdditiveBlending,
    transparent: true,
    depthWrite:  false,
    depthTest:   true,
    side:        THREE.DoubleSide,
  }), []);
  const cmeRef      = useRef<THREE.Mesh>(null);
  const cmeProgress = useRef(1.0);   // starts at 1 (invisible/done)
  const cmeActive   = useRef(false);
  const prevBlock   = useRef<number>(-1);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    surfaceMat.uniforms.uTime.value = t;

    // CME — trigger on new block
    if (blockNumber !== undefined && blockNumber !== prevBlock.current && blockNumber > 0) {
      prevBlock.current = blockNumber;
      cmeProgress.current = 0.0;
      cmeActive.current   = true;
      if (cmeRef.current) cmeRef.current.scale.setScalar(1.0);
    }
    if (cmeActive.current && cmeRef.current) {
      cmeProgress.current = Math.min(1.0, cmeProgress.current + delta / 3.2);
      if (cmeProgress.current >= 1.0) {
        cmeActive.current = false;
        cmeMat.uniforms.uAlpha.value = 0;
      } else {
        // Expand from 1× to 13× sun radius
        const scale = 1.0 + cmeProgress.current * 12.0;
        cmeRef.current.scale.setScalar(scale);
        // Alpha: fast rise (first 8%), slow smooth decay
        const p = cmeProgress.current;
        const a = p < 0.08
          ? p * 12.5
          : Math.pow(1.0 - (p - 0.08) / 0.92, 1.35);
        cmeMat.uniforms.uAlpha.value    = a * 0.65;
        cmeMat.uniforms.uProgress.value = p;
      }
    }
  });

  return (
    <group>
      {/* photosphere */}
      <mesh>
        <sphereGeometry args={[SUN_RADIUS, 128, 128]} />
        <primitive object={surfaceMat} attach="material" />
      </mesh>

      {/* CME expanding plasma bubble (triggered each block) */}
      <mesh ref={cmeRef}>
        <sphereGeometry args={[SUN_RADIUS, 48, 32]} />
        <primitive object={cmeMat} attach="material" />
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
