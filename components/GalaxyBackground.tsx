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

  /* ── value noise + fbm ─────────────────────────────── */
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
    float v = 0.0; float a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
  float fbm6(vec3 p) {
    float v = 0.0; float a = 0.5;
    for (int i = 0; i < 6; i++) { v += a * vnoise(p); p *= 2.07; a *= 0.48; }
    return v;
  }

  /* ── starfield: sharp point-like stars ─────────────── */
  /* Each cell has one random star. Brightness peaks sharply at centre.  */
  float starLayer(vec3 dir, float scale, float threshold) {
    vec3 cell  = floor(dir * scale);
    vec3 local = fract(dir * scale) - 0.5;
    vec3 rnd   = hash33(cell);
    /* skip most cells — only a fraction have visible stars */
    if (rnd.x > threshold) return 0.0;
    vec3 offset = (rnd - 0.5) * 0.85;
    float d = length(local - offset);
    /* sharp Gaussian — real stars are pin-points */
    float bright = exp(-d * d * 2800.0);
    /* brightness variation from hash */
    bright *= 0.3 + 0.7 * rnd.y;
    return bright;
  }

  /* star with colour temperature (returns RGB) */
  vec3 starColoured(vec3 dir, float scale, float threshold) {
    vec3 cell  = floor(dir * scale);
    vec3 local = fract(dir * scale) - 0.5;
    vec3 rnd   = hash33(cell);
    if (rnd.x > threshold) return vec3(0.0);
    vec3 offset = (rnd - 0.5) * 0.85;
    float d = length(local - offset);
    float bright = exp(-d * d * 2800.0) * (0.3 + 0.7 * rnd.y);
    /* colour from temperature: cool blue → white → warm orange */
    float temp = rnd.z;
    vec3 col;
    if (temp < 0.3)      col = vec3(0.70, 0.80, 1.00);  /* blue-white */
    else if (temp < 0.7) col = vec3(1.00, 0.98, 0.95);  /* white */
    else if (temp < 0.9) col = vec3(1.00, 0.88, 0.65);  /* warm yellow */
    else                 col = vec3(1.00, 0.70, 0.45);   /* deep orange */
    return col * bright;
  }

  void main() {
    vec3 dir = normalize(vDir);

    /* ── multi-layer starfield ───────────────────────── */
    /* 5 layers at different densities create realistic star distribution */
    vec3 starTotal = vec3(0.0);
    starTotal += starColoured(dir,  60.0, 0.015) * 1.40;  /* rare bright giants */
    starTotal += starColoured(dir, 120.0, 0.04)  * 0.65;  /* medium stars */
    starTotal += starColoured(dir, 250.0, 0.07)  * 0.30;  /* common faint */
    starTotal += starColoured(dir, 500.0, 0.10)  * 0.12;  /* dense dim field */
    starTotal += starColoured(dir, 900.0, 0.13)  * 0.05;  /* ultra-faint background */

    /* subtle twinkle on the brightest layer */
    float twinkle = 0.85 + 0.15 * sin(hash13(floor(dir * 60.0)) * 50.0 + uTime * 1.8);
    starTotal.rgb *= vec3(twinkle, twinkle, twinkle) *
      vec3(1.0, 1.0, 1.0) + vec3(0.0, 0.0, 0.0) * (1.0 - twinkle);

    /* ── Milky Way — dense star band + faint unresolved glow ────── */
    float galLat   = abs(dir.y);
    float galBand  = exp(-18.0 * galLat * galLat);           /* tight core */
    float galWide  = exp(-4.0 * galLat * galLat) * 0.3;     /* broad wings */
    float galMask  = galBand + galWide;

    /* dark rift structure — breaks up the band organically */
    float riftNoise = fbm4(dir * 4.5 + vec3(0.0, 0.0, 5.1));
    float rift      = smoothstep(0.38, 0.55, riftNoise);    /* 0 = dark lane, 1 = bright */
    galMask *= mix(0.2, 1.0, rift);

    /* extra resolved stars in the galactic plane */
    vec3 milkyStars = starColoured(dir, 700.0, 0.22) * galBand * 0.10;
    milkyStars += starColoured(dir, 1200.0, 0.28) * galBand * 0.04;
    milkyStars += starColoured(dir, 1800.0, 0.32) * galMask * 0.02;

    /* faint unresolved stellar background — warm neutral, NOT blue */
    vec3 milkyGlow = vec3(0.008, 0.007, 0.008) * galMask;

    /* ── sparse nebula accents (only near galactic plane) ────── */
    /* Very small, rare colour patches — NOT a uniform wash       */
    float nebInput = fbm4(dir * 6.0 + vec3(2.3, 7.1, 0.5));
    /* narrow band-pass: only a thin slice of noise values glow */
    float nebMask  = smoothstep(0.56, 0.60, nebInput) * smoothstep(0.68, 0.60, nebInput);
    nebMask *= galBand * 0.06;   /* only in the galactic plane, very faint */
    vec3 nebCol = mix(
      vec3(0.018, 0.006, 0.004),   /* warm H-alpha reddish */
      vec3(0.004, 0.008, 0.014),   /* cool reflection blue */
      step(0.5, fract(nebInput * 7.3))
    );

    /* ── composite ───────────────────────────────────── */
    vec3 color = vec3(0.0);          /* pure black base */
    color += starTotal;
    color += milkyStars;
    color += milkyGlow;
    color += nebCol * nebMask;
    color = max(color, vec3(0.0));

    /* very mild filmic tone-map to tame the brightest stars */
    color = color / (1.0 + color * 0.4);

    /* gamma */
    color = pow(color, vec3(1.0 / 2.2));

    gl_FragColor = vec4(color, 1.0);
  }
`;

export default function GalaxyBackground() {
  const meshRef = React.useRef<THREE.Mesh>(null);

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
    // Follow camera so the sphere is always centred on it —
    // the shader uses normalize(vDir) so the visual is purely directional,
    // this just prevents the far-plane clipping the back face when the
    // camera moves far from the world origin.
    if (meshRef.current) {
      meshRef.current.position.copy(state.camera.position);
    }
  });

  return (
    <mesh ref={meshRef} renderOrder={-1000}>
      <sphereGeometry args={[SKY_RADIUS, 64, 64]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}
