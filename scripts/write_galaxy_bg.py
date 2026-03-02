"""
Writes components/GalaxyBackground.tsx — procedural shader skybox.
Animated nebula clouds + dense starfield on a large inverted sphere.
No texture files needed. Zero seams.
"""
import pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent

code = r'''
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

  /* ── starfield layer ───────────────────────────────── */
  float stars(vec3 dir, float scale, float threshold) {
    vec3 cell = floor(dir * scale);
    vec3 local = fract(dir * scale) - 0.5;
    /* one star per cell — random position + brightness */
    vec3 rnd = hash33(cell);
    vec3 offset = (rnd - 0.5) * 0.9;
    float d = length(local - offset);
    float bright = smoothstep(threshold, threshold * 0.3, d);
    /* colour temperature from hash */
    float temp = rnd.z;
    bright *= 0.6 + 0.4 * temp;
    /* twinkling */
    bright *= 0.75 + 0.25 * sin(uTime * (1.5 + rnd.y * 3.0) + rnd.x * 6.28);
    return bright;
  }

  void main() {
    vec3 dir = normalize(vDir);

    /* ── nebula ──────────────────────────────────────── */
    vec3 np = dir * 1.8 + vec3(uTime * 0.002, uTime * 0.001, 0.0);
    float n1 = fbm4(np);
    float n2 = fbm4(np * 2.3 + 7.7);
    float n3 = fbm4(np * 0.7 + 3.3);

    /* two-tone nebula colouring */
    vec3 nebA  = vec3(0.12, 0.04, 0.22);   /* deep purple */
    vec3 nebB  = vec3(0.02, 0.12, 0.28);   /* dark teal */
    vec3 nebC  = vec3(0.20, 0.06, 0.08);   /* dark crimson */
    vec3 nebula = mix(nebA, nebB, smoothstep(0.3, 0.7, n1));
    nebula = mix(nebula, nebC, smoothstep(0.55, 0.80, n2) * 0.5);
    float nebMask = smoothstep(0.35, 0.65, n1) * 0.55;

    /* dust lanes (darker streaks) */
    float dust = smoothstep(0.48, 0.52, n3) * 0.3;

    /* ── starfield — 3 density layers ────────────────── */
    float s  = 0.0;
    s += stars(dir, 120.0, 0.045) * 1.0;   /* sparse bright */
    s += stars(dir, 300.0, 0.055) * 0.5;   /* medium density */
    s += stars(dir, 700.0, 0.065) * 0.25;  /* dense faint */

    /* dim stars in bright nebula areas */
    s *= 1.0 - nebMask * 0.5;

    /* colour: mostly white, slight random colour cast */
    vec3 starCol = vec3(0.90, 0.92, 1.0) * s;
    /* sprinkle some warm & blue stars */
    starCol += vec3(1.0, 0.7, 0.4) * stars(dir, 90.0, 0.04) * 0.3;
    starCol += vec3(0.5, 0.7, 1.0) * stars(dir, 150.0, 0.05) * 0.2;

    /* ── Milky Way band — subtle bright band along one axis ── */
    float galactic = exp(-8.0 * dir.y * dir.y);
    vec3 milky = vec3(0.08, 0.07, 0.12) * galactic;
    float milkyStars = stars(dir, 500.0, 0.07) * galactic * 0.4;
    milky += vec3(0.8, 0.85, 1.0) * milkyStars;

    /* ── composite ───────────────────────────────────── */
    vec3 bg = vec3(0.005, 0.005, 0.015);   /* deep space base */
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
      }),
    [],
  );

  useFrame((state) => {
    mat.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <mesh>
      <sphereGeometry args={[SKY_RADIUS, 64, 64]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}
'''.strip()

out = ROOT / "components" / "GalaxyBackground.tsx"
out.write_text(code + "\n", encoding="utf-8")
print(f"Written {len(code)} chars to {out}")
