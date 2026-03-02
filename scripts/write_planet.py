"""Writes the new PlanetWallet.tsx with improved shaders and rings."""
import pathlib, textwrap

CODE = r'''"use client";

import React, { useRef, useMemo, useState, useCallback } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

import type { PlanetData, PlanetType } from "@/lib/orbitalUtils";
import { NOISE_GLSL } from "@/lib/glsl";
import WalletTooltip from "./WalletTooltip";
import MoonBody from "./MoonBody";

const PLANET_TYPE_INT: Record<PlanetType, number> = {
  rocky: 0, terrestrial: 1, ice_giant: 2, gas_giant: 3,
};

/* ══════════════════════════════════════════════════════════════
   VERTEX SHADER — shared
══════════════════════════════════════════════════════════════ */
const vertexShader = /* glsl */ `
  varying vec3 vPosition;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  void main() {
    vPosition    = position;
    vec4 wp      = modelMatrix * vec4(position, 1.0);
    vWorldPosition = wp.xyz;
    vWorldNormal   = normalize(mat3(modelMatrix) * normal);
    gl_Position    = projectionMatrix * viewMatrix * wp;
  }
`;

/* ══════════════════════════════════════════════════════════════
   FRAGMENT SHADER — procedural surface, 4 planet archetypes
══════════════════════════════════════════════════════════════ */
const fragmentShader = /* glsl */ `
  uniform float uHue;
  uniform float uSeed;
  uniform int   uPlanetType;
  uniform float uTime;

  varying vec3 vPosition;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  ${NOISE_GLSL}

  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  // Circular crater: negative = pit, positive = rim highlight
  float crater(vec3 p, vec3 ctr, float r) {
    float d = acos(clamp(dot(p, ctr), -1.0, 1.0)) / r;
    if (d > 1.0) return 0.0;
    float rim   = smoothstep(0.70, 0.92, d) * 0.55;
    float floor_ = smoothstep(0.0,  0.55, d);
    return -floor_ * 0.65 + rim;
  }

  void main() {
    vec3 pos = normalize(vPosition);
    float lat = pos.y;

    // Multi-octave FBM layers shared across all types
    float n1 = fbm(pos * 2.5  + vec3(uSeed*13.7, uSeed*7.3,  uSeed*23.1));
    float n2 = fbm(pos * 6.0  + vec3(uSeed*31.1, uSeed*17.9, uSeed*5.7 ));
    float n3 = fbm(pos * 14.0 + vec3(uSeed*5.1,  uSeed*41.3, uSeed*11.9));
    float n4 = fbm(pos * 32.0 + vec3(uSeed*67.0, uSeed*23.1, uSeed*49.7));

    vec3  color;
    vec3  atmosColor;
    float atmosStr;
    float specular = 0.0;

    /* ──────────────────────────────────────────────────────────
       0  ROCKY  —  Mercury / Mars  ( barren, cratered, dusty )
    ────────────────────────────────────────────────────────── */
    if (uPlanetType == 0) {

      // Elevation-based terrain  (highlands bright, lowlands dark)
      float elev    = n1*0.50 + n2*0.30 + n3*0.15 + n4*0.05;
      float terrain = smoothstep(0.28, 0.72, elev);

      // Colour palette depends on address seed (grey/tan vs rust/red)
      float palette = fract(uSeed * 0.71);
      vec3 hiC = (palette < 0.5)
        ? hsv2rgb(vec3(0.07 + uHue*0.08, 0.28, 0.60))   // ochre highlands
        : hsv2rgb(vec3(0.02 + uHue*0.06, 0.60, 0.50));   // rust highlands
      vec3 loC = (palette < 0.5)
        ? hsv2rgb(vec3(0.06 + uHue*0.06, 0.20, 0.26))   // dark basalt
        : hsv2rgb(vec3(0.03 + uHue*0.04, 0.45, 0.22));   // dark red plains
      vec3 gry = hsv2rgb(vec3(uHue*0.08, 0.07, 0.42));   // grey ejecta

      color = mix(loC, hiC, terrain);
      color = mix(color, gry, n4 * 0.28);

      // 5 craters — positions from uSeed
      vec3 cc[5];
      cc[0] = normalize(vec3(sin(uSeed*91.1), cos(uSeed*37.3), sin(uSeed*63.7)));
      cc[1] = normalize(vec3(sin(uSeed*53.7), cos(uSeed*81.3), cos(uSeed*27.1)));
      cc[2] = normalize(vec3(cos(uSeed*19.9), sin(uSeed*47.3), cos(uSeed*83.1)));
      cc[3] = normalize(vec3(cos(uSeed*73.1), cos(uSeed*29.7), sin(uSeed*57.3)));
      cc[4] = normalize(vec3(sin(uSeed*61.3), sin(uSeed*13.7), cos(uSeed*41.9)));

      float cr = crater(pos,cc[0],0.55) + crater(pos,cc[1],0.38)
               + crater(pos,cc[2],0.28) + crater(pos,cc[3],0.19)
               + crater(pos,cc[4],0.12);
      cr = clamp(cr, -0.65, 0.55);
      color = mix(color, loC * 0.45, max(-cr, 0.0));  // pit floor dark
      color = mix(color, hiC * 1.25, max( cr, 0.0));  // rim bright

      // Polar frost cap on Mars-like worlds
      if (palette > 0.35) {
        float frost = smoothstep(0.78, 0.95, abs(lat)) * (0.6 + n2*0.4);
        color = mix(color, vec3(0.92, 0.90, 0.88), frost);
      }

      atmosColor = hsv2rgb(vec3(0.04 + uHue*0.05, 0.30, 0.70));
      atmosStr   = 0.05;

    /* ──────────────────────────────────────────────────────────
       1  TERRESTRIAL  —  Earth / ocean world ( oceans, clouds )
    ────────────────────────────────────────────────────────── */
    } else if (uPlanetType == 1) {

      // Ocean / land threshold from multi-scale noise
      float landNoise = n1*0.65 + n2*0.25 + n3*0.10;
      float landMask  = smoothstep(0.43, 0.58, landNoise);
      float shallow   = 1.0 - smoothstep(0.00, 0.07, abs(landNoise - 0.50));
      float polar     = smoothstep(0.68, 0.92, abs(lat));
      float tropical  = 1.0 - smoothstep(0.0, 0.55, abs(lat));

      // Ocean colours
      vec3 deepOcn  = hsv2rgb(vec3(0.60 + uHue*0.04, 0.84, 0.30));
      vec3 shallOcn = hsv2rgb(vec3(0.55 + uHue*0.05, 0.67, 0.52));
      vec3 ocean    = mix(deepOcn, shallOcn, shallow);

      // Land biomes
      vec3 jungle  = hsv2rgb(vec3(0.30 + uHue*0.06, 0.72, 0.32));
      vec3 savanna = hsv2rgb(vec3(0.13 + uHue*0.06, 0.56, 0.50));
      vec3 desert  = hsv2rgb(vec3(0.10 + uHue*0.05, 0.52, 0.64));
      vec3 tundra  = hsv2rgb(vec3(0.38 + uHue*0.04, 0.22, 0.54));
      vec3 snow    = vec3(0.90, 0.93, 0.97);
      vec3 cloud   = vec3(0.88, 0.91, 0.96);

      vec3 land = mix(jungle, savanna, tropical*0.5 + n2*0.3);
      land = mix(land, desert, smoothstep(0.3,0.7,n3)*tropical*0.6);
      land = mix(land, tundra, smoothstep(0.48,0.68,abs(lat)));

      color = mix(ocean, land, landMask);
      color = mix(color, snow, polar);

      // Animated cloud cover (two layers at different speeds)
      float cl1 = fbm(pos*3.5 + vec3(uTime*0.007,  0.0,          uSeed*5.1));
      float cl2 = fbm(pos*7.5 + vec3(uTime*0.013, uSeed*3.3,  0.0));
      float clouds = smoothstep(0.50, 0.68, cl1*0.6 + cl2*0.4);
      color = mix(color, cloud, clouds * 0.88);

      // Ocean specular (exposed ocean, cloudless)
      specular = (1.0 - landMask) * (1.0 - clouds) * 0.60;

      atmosColor = hsv2rgb(vec3(0.58 + uHue*0.03, 0.60, 0.96));
      atmosStr   = 0.50;

    /* ──────────────────────────────────────────────────────────
       2  ICE GIANT  —  Neptune / Uranus ( methane blue, storms )
    ────────────────────────────────────────────────────────── */
    } else if (uPlanetType == 2) {

      // Animated wind bands
      float bandLat  = lat + n1*0.20;
      float bandFreq = 7.0 + uSeed*4.0;
      float bands    = sin(bandLat*bandFreq        + uTime*0.06) *0.5+0.5;
      float bands2   = sin(bandLat*bandFreq*2.1    + uTime*0.11 + uSeed*3.14)*0.5+0.5;
      float bands3   = sin(bandLat*bandFreq*0.47   + uTime*0.04)*0.5+0.5;

      // Dark Storm Spot (Great Dark Spot of Neptune)
      float stLat = 0.20 + (fract(uSeed*7.7)-0.5)*0.20;
      float stLon = fract(uSeed*11.3) * 6.2832;
      vec3 stC = vec3(cos(stLat)*cos(stLon), sin(stLat), cos(stLat)*sin(stLon));
      float stD = length(pos - normalize(stC));
      float stMask = smoothstep(0.32, 0.08, stD);

      float hueB  = 0.56 + uHue*0.12;
      vec3 deep   = hsv2rgb(vec3(hueB,        0.88, 0.28));
      vec3 mid    = hsv2rgb(vec3(hueB+0.04,   0.78, 0.50));
      vec3 bright = hsv2rgb(vec3(hueB+0.07,   0.55, 0.72));
      vec3 stCol  = hsv2rgb(vec3(hueB+0.10,   0.38, 0.85));
      vec3 polar  = hsv2rgb(vec3(hueB-0.02,   0.38, 0.68));

      color = mix(deep,  mid,    smoothstep(0.3,0.7, bands));
      color = mix(color, bright, smoothstep(0.6,0.9, bands2)*0.42);
      color = mix(color, deep,   smoothstep(0.4,0.8, bands3)*0.28);
      // White streak highlights (high-speed winds)
      color = mix(color, vec3(0.88,0.94,1.00), n4 * smoothstep(0.62,0.85,bands)*0.28);
      // Storm oval
      color = mix(color, stCol, stMask);
      // Polar brightening
      color = mix(color, polar, smoothstep(0.58,0.90,abs(lat)));

      atmosColor = hsv2rgb(vec3(hueB+0.02, 0.72, 0.92));
      atmosStr   = 0.60;

    /* ──────────────────────────────────────────────────────────
       3  GAS GIANT  —  Jupiter / Saturn ( bands, GRS, turbulence )
    ────────────────────────────────────────────────────────── */
    } else {

      // Latitude-distorted horizontal bands
      float bandFreq  = 11.0 + uSeed*7.0;
      float bandFreq2 = bandFreq * 1.618;
      float wind      = n1*0.28 + n2*0.12;
      float distLat   = lat + wind;
      float bands     = sin(distLat*bandFreq  + uTime*0.020)*0.5+0.5;
      float bands2    = sin(distLat*bandFreq2 + uTime*0.035 + uSeed*2.0)*0.5+0.5;
      float bands3    = sin(distLat*bandFreq *0.5+ uTime*0.012)*0.5+0.5;

      // Turbulence at band edges (shear instability)
      float edgeT  = 1.0 - abs(fract(distLat*bandFreq/6.2832)*2.0 - 1.0);
      float turbF  = fbm(pos*6.0 + vec3(uTime*0.025, uSeed*7.0, 0.0));
      float turb   = smoothstep(0.70,0.95,edgeT) * turbF;

      // Great Red Spot (seeded, elliptical, slowly rotating)
      float grsLat = -(0.22 + fract(uSeed*7.3)*0.16);
      float grsLon = fract(uSeed*3.9)*6.2832;
      float grsA   = 0.24 + fract(uSeed*5.5)*0.12;
      float grsB   = grsA * 0.52;
      vec3 grsCtr  = vec3(cos(grsLat)*cos(grsLon), sin(grsLat), cos(grsLat)*sin(grsLon));
      vec3 toS     = pos - normalize(grsCtr);
      float grsX   = dot(toS, vec3( cos(grsLon), 0.0, sin(grsLon)));
      float grsY   = dot(toS, vec3(0.0, 1.0, 0.0));
      float grsDist= sqrt((grsX/grsA)*(grsX/grsA) + (grsY/grsB)*(grsY/grsB));
      float grsMask= smoothstep(1.0, 0.25, grsDist);
      float swirl  = sin(atan(grsY,grsX)*5.0 + uTime*0.07)*0.5+0.5;

      // Smaller secondary ovals
      float sOvLat = 0.18 + fract(uSeed*19.1)*0.14;
      vec3 sOvC    = vec3(cos(sOvLat)*cos(grsLon+1.8), sin(sOvLat), cos(sOvLat)*sin(grsLon+1.8));
      float sOvD   = length(pos - normalize(sOvC));
      float sOvMask= smoothstep(0.22,0.05,sOvD) * 0.6;

      // Palette (warm Jupiter oranges, hue-shifted per wallet)
      vec3 zone   = hsv2rgb(vec3(fract(0.09 + uHue*0.20), 0.32, 0.90));  // cream zone
      vec3 belt   = hsv2rgb(vec3(fract(0.06 + uHue*0.18), 0.68, 0.48));  // dark belt
      vec3 warm   = hsv2rgb(vec3(fract(0.05 + uHue*0.15), 0.72, 0.70));  // orange
      vec3 grsCol = hsv2rgb(vec3(fract(0.02 + uHue*0.10), 0.85, 0.68));  // GRS brick-red
      vec3 white_ = vec3(0.92, 0.91, 0.88);                               // zone highlights

      color = mix(belt, zone,   smoothstep(0.35,0.65,bands));
      color = mix(color, warm,  smoothstep(0.45,0.75,bands2)*0.38);
      color = mix(color, white_, smoothstep(0.72,0.88,bands3)*0.20);
      // Edge turbulence
      color = mix(color, mix(belt,zone,0.5), turb * 0.65);
      // GRS
      vec3 grsBlend = mix(grsCol, mix(grsCol, zone*0.5, 0.5), swirl*0.5);
      color = mix(color, grsBlend, grsMask);
      // Secondary oval
      color = mix(color, warm*1.1, sOvMask);
      // Polar darkening (like real gas giants)
      color *= 1.0 - smoothstep(0.55,1.0,abs(lat))*0.35;

      atmosColor = hsv2rgb(vec3(fract(0.08 + uHue*0.15), 0.52, 0.95));
      atmosStr   = 0.32;
    }

    /* ─── Shared lighting ──────────────────────────────────────
       Diffuse from sun + specular (Blinn-Phong) + fresnel atmo  */
    vec3 normal   = normalize(vWorldNormal);
    vec3 lightDir = normalize(-vWorldPosition);       // sun at world origin
    float diff    = max(dot(normal, lightDir), 0.0);

    vec3 viewDir  = normalize(cameraPosition - vWorldPosition);
    vec3 halfV    = normalize(lightDir + viewDir);
    float spec    = pow(max(dot(normal, halfV), 0.0), 64.0) * specular;

    color *= 0.05 + diff * 0.95;
    color += vec3(1.00, 0.97, 0.88) * spec;

    // Atmosphere fresnel rim
    float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);
    color += atmosColor * fresnel * atmosStr;

    gl_FragColor = vec4(color, 1.0);
  }
`;

/* ── Ring disc shaders (Saturn-style) ─────────────────────── */
const ringVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ringFrag = /* glsl */ `
  uniform float uHue;
  uniform float uSeed;
  varying vec2 vUv;

  void main() {
    // vUv.x ranges 0→1 across the ring geometry; map to radial 0→1
    float r = vUv.x;

    // Concentric density bands (like Saturn's A/B/C rings)
    float b1 = sin(r * 55.0 + uSeed * 17.0) * 0.5 + 0.5;
    float b2 = sin(r * 130.0 + uSeed * 43.0) * 0.5 + 0.5;
    float b3 = sin(r * 320.0 + uSeed * 79.0) * 0.5 + 0.5;
    float dens = b1 * 0.55 + b2 * 0.30 + b3 * 0.15;

    // Two gap divisions (Cassini + Encke analog)
    float g1 = smoothstep(0.003, 0.015, abs(r - 0.38)) *
               smoothstep(0.003, 0.015, abs(r - 0.40));
    float g2 = smoothstep(0.001, 0.007, abs(r - 0.72));
    dens *= g1 * g2;

    // Fade at inner and outer edges
    float edge = smoothstep(0.0, 0.06, r) * smoothstep(1.0, 0.88, r);
    float alpha = dens * edge * 0.72;

    // Colour: golden/icy mix seeded per planet
    vec3 golden = vec3(0.88, 0.74, 0.48);
    vec3 icy    = vec3(0.80, 0.88, 0.96);
    vec3 col    = mix(golden, icy, uSeed) * (0.55 + dens * 0.45);

    gl_FragColor = vec4(col, alpha);
  }
`;

/* ── Component ───────────────────────────────────────────── */
interface PlanetWalletProps {
  data:     PlanetData;
  selected: boolean;
  onSelect: () => void;
}

export default function PlanetWallet({ data, selected, onSelect }: PlanetWalletProps) {
  const orbitRef = useRef<THREE.Group>(null);
  const meshRef  = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  const material = useMemo(
    () => new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uHue:        { value: data.hue },
        uSeed:       { value: data.seed },
        uPlanetType: { value: PLANET_TYPE_INT[data.planetType] },
        uTime:       { value: 0 },
      },
    }),
    [data.hue, data.seed, data.planetType],
  );

  const ringMat = useMemo(
    () => new THREE.ShaderMaterial({
      vertexShader:  ringVert,
      fragmentShader: ringFrag,
      uniforms: {
        uHue:  { value: data.hue },
        uSeed: { value: data.seed },
      },
      side:        THREE.DoubleSide,
      transparent: true,
      depthWrite:  false,
    }),
    [data.hue, data.seed],
  );

  useFrame((state, delta) => {
    if (orbitRef.current) orbitRef.current.rotation.y += data.orbitSpeed * delta;
    if (meshRef.current)  meshRef.current.rotation.y  += 0.22 * delta;
    material.uniforms.uTime.value = state.clock.elapsedTime;
  });

  const onPointerEnter = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer";
  }, []);
  const onPointerLeave = useCallback(() => {
    setHovered(false); document.body.style.cursor = "auto";
  }, []);
  const onClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation(); onSelect();
  }, [onSelect]);

  // Ring geometry — ringGeometry UVs: x = radial 0→1
  const ringInner = data.radius * 1.38;
  const ringOuter = data.radius * 2.50;

  return (
    <group rotation={[data.tilt, 0, 0]}>
      <group ref={orbitRef} rotation-y={data.initialAngle}>

        {/* Planet sphere */}
        <mesh
          ref={meshRef}
          position={[data.orbitRadius, 0, 0]}
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
          onClick={onClick}
        >
          <sphereGeometry args={[data.radius, 64, 64]} />
          <primitive object={material} attach="material" />
        </mesh>

        {/* Saturn-style rings */}
        {data.hasRings && (
          <group
            position={[data.orbitRadius, 0, 0]}
            rotation={[Math.PI * 0.42, fract(data.seed) * 0.8, 0]}
          >
            <mesh>
              <ringGeometry args={[ringInner, ringOuter, 160]} />
              <primitive object={ringMat} attach="material" />
            </mesh>
          </group>
        )}

        {/* Tooltip */}
        {(hovered || selected) && (
          <Html
            position={[data.orbitRadius, data.radius + 0.5, 0]}
            center
            zIndexRange={[100, 0]}
          >
            <WalletTooltip wallet={data.wallet} />
          </Html>
        )}

        {/* Moons */}
        {data.moons.map((moon, i) => (
          <MoonBody
            key={moon.wallet.address + i}
            data={moon}
            planetOrbit={data.orbitRadius}
            selected={false}
            onSelect={() => {}}
          />
        ))}
      </group>
    </group>
  );
}

// Helper used inside JSX (not GLSL)
function fract(x: number) { return x - Math.floor(x); }
'''

out = pathlib.Path(r"c:\Users\honza\Documents\gitclones\world\world\components\PlanetWallet.tsx")
out.write_text(CODE, encoding="utf-8")
print(f"Written {len(CODE)} chars to {out}")
