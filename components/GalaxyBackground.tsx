"use client";

import React, { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Procedural space background — large inverted sphere with a custom shader.
 * Features:
 *   • Dense layered starfield (3 density layers, twinkling)
 *   • Soft coloured nebula clouds (fbm noise)
 *   • Subtle dust lanes
 *   • Animated slow drift
 *   • Zero texture files, zero seams
 */

const SKY_RADIUS = 14000;

const vert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const frag = /* glsl */ `
  uniform float uTime;
  varying vec3 vDir;

  /* ── hash helpers ──────────────────────────────────── */
  float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }
  vec3 hash33(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
             dot(p, vec3(269.5, 183.3, 246.1)),
             dot(p, vec3(113.5, 271.9, 124.6)));
    return fract(sin(p) * 43758.5453123);
  }

  /* ── simplex-ish value noise (fast, no artifacts) ─── */
  float vnoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash13(i);
    float b = hash13(i + vec3(1,0,0));
    float c = hash13(i + vec3(0,1,0));
    float d = hash13(i + vec3(1,1,0));
    float e = hash13(i + vec3(0,0,1));
    float ff= hash13(i + vec3(1,0,1));
    float g = hash13(i + vec3(0,1,1));
    float h = hash13(i + vec3(1,1,1));
    return mix(mix(mix(a,b,f.x), mix(c,d,f.x), f.y),
               mix(mix(e,ff,f.x), mix(g,h,f.x), f.y), f.z);
  }

  float fbm4(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * vnoise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }

  /* ── starfield layer (soft glow) ───────────────── */
  float stars(vec3 dir, float scale, float size) {
    vec3 cell = floor(dir * scale);
    vec3 local = fract(dir * scale) - 0.5;
    /* one star per cell — random position + brightness */
    vec3 rnd = hash33(cell);
    vec3 offset = (rnd - 0.5) * 0.9;
    float d = length(local - offset);
    /* Gaussian falloff — soft glow instead of hard dots */
    float bright = exp(-d * d / (size * size * 0.08));
    /* colour temperature from hash */
    float temp = rnd.z;
    bright *= 0.5 + 0.5 * temp;
    /* static — no shimmer */
    return bright;
  }

  void main() {
    vec3 dir = normalize(vDir);

    /* ── nebula ──────────────────────────────────────── */
    vec3 np = dir * 1.8 + vec3(uTime * 0.002, uTime * 0.001, 0.0);
    float n1 = fbm4(np);
    float n2 = fbm4(np * 2.3 + 7.7);
    float n3 = fbm4(np * 0.7 + 3.3);

    /* two-tone nebula colouring — very subtle, deep space */
    vec3 nebA  = vec3(0.015, 0.018, 0.04);   /* near-black blue */
    vec3 nebB  = vec3(0.008, 0.03, 0.045);   /* dark teal */
    vec3 nebC  = vec3(0.035, 0.015, 0.01);   /* faint warm dust */
    vec3 nebula = mix(nebA, nebB, smoothstep(0.3, 0.7, n1));
    nebula = mix(nebula, nebC, smoothstep(0.55, 0.80, n2) * 0.25);
    float nebMask = smoothstep(0.40, 0.70, n1) * 0.08;

    /* dust lanes (darker streaks) */
    float dust = smoothstep(0.48, 0.52, n3) * 0.3;

    /* ── starfield — 2 layers (sparse bright + faint dense) ── */
    float s  = 0.0;
    s += stars(dir, 100.0, 0.06) * 0.35;   /* sparse bright */
    s += stars(dir, 400.0, 0.04) * 0.08;   /* dense faint */

    /* dim stars in bright nebula areas */
    s *= 1.0 - nebMask * 0.5;

    /* colour: mostly white, faint warm/cool tint */
    vec3 starCol = vec3(0.88, 0.90, 1.0) * s;
    starCol += vec3(0.9, 0.65, 0.35) * stars(dir, 80.0, 0.05) * 0.05;
    starCol += vec3(0.45, 0.65, 1.0) * stars(dir, 160.0, 0.04) * 0.04;

    /* ── Milky Way band — faint glow along galactic plane ── */
    float galactic = exp(-12.0 * dir.y * dir.y);
    vec3 milky = vec3(0.012, 0.012, 0.018) * galactic;
    float milkyStars = stars(dir, 350.0, 0.04) * galactic * 0.08;
    milky += vec3(0.7, 0.75, 0.9) * milkyStars;

    /* ── composite ───────────────────────────────────── */
    vec3 bg = vec3(0.001, 0.001, 0.004);   /* near-black deep space */
    vec3 color = bg;
    color += milky;
    color += nebula * nebMask;
    color -= dust * nebMask * 0.3;
    color += starCol;

    /* subtle vignette toward edges helps depth */
    color = max(color, vec3(0.0));

    /* gamma */
    color = pow(color, vec3(1.0 / 2.2));

    gl_FragColor = vec4(color, 1.0);
  }
`;

export default function GalaxyBackground() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        uniforms: { uTime: { value: 0 } },
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
      }),
    [],
  );

  useFrame((state) => {
    mat.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <mesh renderOrder={-1000}>
      <sphereGeometry args={[SKY_RADIUS, 64, 64]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}
