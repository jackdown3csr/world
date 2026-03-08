import * as THREE from "three";

import { NOISE_GLSL } from "@/lib/glsl";
import { SUN_RADIUS } from "@/lib/layout";

import {
  DWARF_PARAMS,
  DYING_PARAMS,
  type StarPalette,
  VESCROW_PARAMS,
  VESTING_PARAMS,
  getStarVariant,
} from "./config";

const SURFACE_GLSL = {
  warm: { white: "vec3(1.00,0.99,0.94)", yellow: "vec3(1.00,0.88,0.45)", orange: "vec3(1.00,0.60,0.15)", dark: "vec3(0.55,0.20,0.04)", edge: "vec3(1.00,0.40,0.06)", filLo: "vec3(1.00,0.35,0.05)", filHi: "vec3(1.00,0.80,0.30)" },
  cool: { white: "vec3(0.98,0.96,0.90)", yellow: "vec3(0.88,0.90,0.86)", orange: "vec3(0.54,0.72,0.68)", dark: "vec3(0.10,0.20,0.18)", edge: "vec3(0.78,0.84,0.82)", filLo: "vec3(0.60,0.74,0.70)", filHi: "vec3(0.94,0.94,0.88)" },
  dwarf: { white: "vec3(0.96,0.98,1.00)", yellow: "vec3(0.92,0.96,1.00)", orange: "vec3(0.66,0.86,1.00)", dark: "vec3(0.12,0.18,0.35)", edge: "vec3(0.88,0.96,1.00)", filLo: "vec3(0.58,0.78,1.00)", filHi: "vec3(0.95,0.99,1.00)" },
  dying: { white: "vec3(1.00,0.92,0.80)", yellow: "vec3(0.92,0.54,0.28)", orange: "vec3(0.52,0.14,0.08)", dark: "vec3(0.08,0.02,0.02)", edge: "vec3(1.00,0.48,0.20)", filLo: "vec3(0.75,0.20,0.08)", filHi: "vec3(1.00,0.64,0.34)" },
} as const;

const FLARE_GLSL = {
  warm: { white: "vec3(1.00,0.99,0.95)", warm: "vec3(1.00,0.90,0.60)", orange: "vec3(1.00,0.65,0.25)" },
  cool: { white: "vec3(0.98,0.96,0.90)", warm: "vec3(0.82,0.86,0.82)", orange: "vec3(0.54,0.72,0.68)" },
  dwarf: { white: "vec3(0.98,0.99,1.00)", warm: "vec3(0.85,0.94,1.00)", orange: "vec3(0.62,0.82,0.98)" },
  dying: { white: "vec3(1.00,0.90,0.76)", warm: "vec3(0.94,0.42,0.16)", orange: "vec3(0.44,0.08,0.04)" },
} as const;

const surfaceVert = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vNorm;
  varying vec3 vWorldPos;
  void main() {
    vPos = position;
    vNorm = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const vescrowSurfaceVert = /* glsl */ `
  uniform float uTime;
  uniform float uPulseSpeed;
  uniform float uPulseAmp;
  uniform float uTurbulence;
  varying vec3 vPos;
  varying vec3 vNorm;
  varying vec3 vWorldPos;
  varying float vDisplacement;

  ${NOISE_GLSL}

  void main() {
    vPos = position;
    vec3 p = normalize(position);

    float pulse1 = sin(uTime * uPulseSpeed) * 0.55;
    float pulse2 = sin(uTime * uPulseSpeed * 1.47 + 1.4) * 0.30;
    float pulse3 = sin(uTime * uPulseSpeed * 2.31 + 3.6) * 0.15;
    float pulse = (pulse1 + pulse2 + pulse3) * 0.5 + 0.5;

    float n1 = fbm(p * 3.5 + vec3(uTime * 0.018));
    float n2 = fbm(p * 7.0 - vec3(uTime * 0.012, 0.0, uTime * 0.009));
    float turbDisp = (n1 * 0.6 + n2 * 0.4 - 0.5) * uTurbulence * 0.035;

    float disp = turbDisp + pulse * uPulseAmp;
    vDisplacement = disp;

    vec3 displaced = position * (1.0 + disp);
    vNorm = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vWorldPos = (modelMatrix * vec4(displaced, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

const vescrowSurfaceFrag = /* glsl */ `
  uniform float uTime;
  uniform float uPlasmaSpeed;
  uniform float uHotspotIntensity;
  varying vec3 vPos;
  varying vec3 vNorm;
  varying vec3 vWorldPos;
  varying float vDisplacement;

  ${NOISE_GLSL}

  float granule(vec3 p) {
    vec3 fp = floor(p); vec3 fr = fract(p);
    float d = 1.0;
    for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++) for(int z=-1;z<=1;z++) {
      vec3 o = vec3(float(x),float(y),float(z));
      vec3 rp = fp + o;
      vec3 h = fract(sin(rp * vec3(127.1,311.7,74.7) + rp.yzx * vec3(269.5,183.3,246.1)) * 43758.5);
      d = min(d, length(fr - o - h));
    }
    return d;
  }

  void main() {
    vec3 p = normalize(vPos);

    vec3 flowA = vec3(uTime * uPlasmaSpeed * 0.016, uTime * uPlasmaSpeed * 0.010, 0.0);
    vec3 flowB = vec3(-uTime * uPlasmaSpeed * 0.012, 0.0, uTime * uPlasmaSpeed * 0.014);
    float plasma1 = fbm(p * 2.0 + flowA);
    float plasma2 = fbm(p * 4.5 + flowB);
    float plasma3 = fbm(p * 9.0 + flowA * 0.7 - flowB * 0.5);
    float plasma = plasma1 * 0.45 + plasma2 * 0.35 + plasma3 * 0.20;

    float gran1 = granule(p * 5.0 + flowA * 0.8);
    float gran2 = granule(p * 11.0 + flowB * 0.6);
    float cell = mix(gran1, gran2, 0.40);
    float bright = 1.0 - smoothstep(0.10, 0.46, cell);

    float hotField = fbm(p * 1.8 + vec3(uTime * 0.008, uTime * 0.005, -uTime * 0.006));
    float hotSpots = smoothstep(0.55, 0.80, hotField) * uHotspotIntensity;

    float activity = fbm(p * 3.0 + vec3(uTime * 0.010));
    float faculae = smoothstep(0.58, 0.78, activity) * 0.35;

    vec3 hotWhite = vec3(1.00, 0.98, 0.88);
    vec3 brightGold = vec3(1.00, 0.90, 0.42);
    vec3 warmOrange = vec3(1.00, 0.62, 0.16);
    vec3 deepAmber = vec3(0.72, 0.30, 0.06);

    float hotness = smoothstep(0.28, 0.72, plasma);
    vec3 col = mix(warmOrange, brightGold, hotness);
    col = mix(col, hotWhite, pow(bright, 1.4) * (0.55 + hotness * 0.35));
    col = mix(col, hotWhite, hotSpots);
    col += brightGold * faculae;

    float coolLanes = smoothstep(0.52, 0.38, plasma) * 0.22;
    col = mix(col, deepAmber, coolLanes * (1.0 - bright * 0.6));
    col += hotWhite * max(vDisplacement, 0.0) * 3.5;

    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float mu = max(dot(vNorm, viewDir), 0.0);
    float limb = 0.48 + 0.52 * pow(mu, 0.32);
    col *= limb;

    float edge = pow(1.0 - mu, 3.5);
    col = mix(col, warmOrange, edge * 0.50);
    col += hotWhite * edge * 0.12;

    float fn = fbm(p * 3.5 + vec3(uTime * 0.014, uTime * 0.008, 0.0));
    float faceMask = pow(mu, 0.4);
    float filament = smoothstep(0.35, 0.65, fn) * faceMask;
    vec3 filCol = mix(warmOrange, brightGold, fn);
    col += filCol * filament * 0.40;

    col *= 1.25 + hotness * 0.20 + bright * 0.10 + hotSpots * 0.35;

    gl_FragColor = vec4(col, 1.0);
  }
`;

function makeSurfaceFrag(palette: StarPalette) {
  const c = SURFACE_GLSL[palette];
  return /* glsl */ `
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
        vec3 rp = fp + o;
        vec3 h = fract(sin(rp * vec3(127.1,311.7,74.7) + rp.yzx * vec3(269.5,183.3,246.1)) * 43758.5);
        d = min(d, length(fr - o - h));
      }
      return d;
    }

    void main() {
      vec3 p = normalize(vPos);
      float gran1 = granule(p * 4.5 + vec3(uTime * 0.006));
      float gran2 = granule(p * 10.0 + vec3(uTime * 0.014, uTime * 0.009, 0.0));
      float cell = mix(gran1, gran2, 0.45);
      float bright = 1.0 - smoothstep(0.12, 0.50, cell);

      float activity = fbm(p * 2.0 + vec3(uTime * 0.004));
      float spots = smoothstep(0.52, 0.68, activity) * 0.35;
      float fac = smoothstep(0.60, 0.80, activity) * 0.25;

      vec3 white = ${c.white};
      vec3 yellow = ${c.yellow};
      vec3 orange = ${c.orange};
      vec3 dark = ${c.dark};

      vec3 col = mix(orange, yellow, bright);
      col = mix(col, white, bright * bright * 0.70);
      col = mix(col, dark, spots);
      col += white * fac;

      vec3 viewDir = normalize(cameraPosition - vWorldPos);
      float mu = max(dot(vNorm, viewDir), 0.0);
      float limb = 0.55 + 0.45 * pow(mu, 0.35);
      col *= limb;

      float edge = pow(1.0 - mu, 4.0);
      col = mix(col, ${c.edge}, edge * 0.45);

      float fn = fbm(p * 3.0 + vec3(uTime * 0.012, uTime * 0.007, 0.0));
      float faceMask = pow(mu, 0.4);
      float filament = smoothstep(0.35, 0.65, fn) * faceMask;
      vec3 filCol = mix(${c.filLo}, ${c.filHi}, fn);
      col += filCol * filament * 0.45;

      col *= 1.1;
      gl_FragColor = vec4(col, 1.0);
    }
  `;
}

const dwarfSurfaceFrag = /* glsl */ `
  uniform float uTime;
  uniform float uFlowSpeed;
  uniform float uPlasmaTightness;
  varying vec3 vPos;
  varying vec3 vNorm;
  varying vec3 vWorldPos;

  ${NOISE_GLSL}

  float granule(vec3 p) {
    vec3 fp = floor(p); vec3 fr = fract(p);
    float d = 1.0;
    for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++) for(int z=-1;z<=1;z++) {
      vec3 o = vec3(float(x),float(y),float(z));
      vec3 rp = fp + o;
      vec3 h = fract(sin(rp * vec3(127.1,311.7,74.7) + rp.yzx * vec3(269.5,183.3,246.1)) * 43758.5);
      d = min(d, length(fr - o - h));
    }
    return d;
  }

  void main() {
    vec3 p = normalize(vPos);
    vec3 flowA = vec3(uTime * uFlowSpeed * 0.018, uTime * uFlowSpeed * 0.010, 0.0);
    vec3 flowB = vec3(-uTime * uFlowSpeed * 0.010, 0.0, uTime * uFlowSpeed * 0.014);
    float baseFlow = fbm(p * 2.2 + flowA);
    float fineFlow = fbm(p * 5.2 + flowB);
    float sheen = fbm(p * 10.0 + vec3(0.0, uTime * 0.012, uTime * 0.006));

    float gran = granule(p * 6.2 + flowA * 0.7);
    float cells = 1.0 - smoothstep(0.14, 0.48, gran);

    float hotCore = smoothstep(0.34, 0.82, baseFlow * 0.72 + fineFlow * 0.28 + 0.12);
    float cyanLanes = smoothstep(0.52, 0.78, fineFlow) * 0.45;
    float sparkle = smoothstep(0.74, 0.92, sheen) * 0.24;

    vec3 whiteCore = vec3(0.97, 0.99, 1.00);
    vec3 iceBlue = vec3(0.84, 0.94, 1.00);
    vec3 cyanGlow = vec3(0.48, 0.86, 1.00);
    vec3 blueBody = vec3(0.28, 0.54, 0.98);
    vec3 deepBlue = vec3(0.08, 0.16, 0.34);

    vec3 col = mix(blueBody, iceBlue, hotCore);
    col = mix(col, whiteCore, pow(cells, 1.5) * (0.45 + hotCore * 0.35));
    col += cyanGlow * cyanLanes;
    col += whiteCore * sparkle;
    col = mix(col, deepBlue, (1.0 - hotCore) * (1.0 - uPlasmaTightness) * 0.4);

    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float mu = max(dot(vNorm, viewDir), 0.0);
    float limb = 0.72 + 0.28 * pow(mu, 0.42);
    col *= limb;

    float rim = pow(1.0 - mu, 4.8);
    col += cyanGlow * rim * 0.55;
    col += whiteCore * rim * 0.16;

    col *= 1.18 + hotCore * 0.18 + cells * 0.08;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const vestingSurfaceVert = /* glsl */ `
  uniform float uTime;
  uniform float uPulseSpeed;
  uniform float uPulseAmp;
  varying vec3 vPos;
  varying vec3 vNorm;
  varying vec3 vWorldPos;

  ${NOISE_GLSL}

  void main() {
    vPos = position;
    vec3 p = normalize(position);

    float breath1 = sin(uTime * uPulseSpeed) * 0.65;
    float breath2 = sin(uTime * uPulseSpeed * 0.37 + 1.8) * 0.25;
    float breath3 = sin(uTime * uPulseSpeed * 0.13 + 3.9) * 0.10;
    float breath = (breath1 + breath2 + breath3) * 0.5 + 0.5;

    float wave = fbm(p * 1.6 + vec3(uTime * 0.003, uTime * 0.002, 0.0));
    float disp = breath * uPulseAmp + (wave - 0.5) * 0.008;

    vec3 displaced = position * (1.0 + disp);
    vNorm = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vWorldPos = (modelMatrix * vec4(displaced, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

const vestingSurfaceFrag = /* glsl */ `
  uniform float uTime;
  uniform float uDriftSpeed;
  uniform float uBandIntensity;
  varying vec3 vPos;
  varying vec3 vNorm;
  varying vec3 vWorldPos;

  ${NOISE_GLSL}

  void main() {
    vec3 p = normalize(vPos);

    vec3 driftA = vec3(uTime * uDriftSpeed * 0.012, uTime * uDriftSpeed * 0.007, 0.0);
    vec3 driftB = vec3(-uTime * uDriftSpeed * 0.008, 0.0, uTime * uDriftSpeed * 0.010);
    float layer1 = fbm(p * 1.4 + driftA);
    float layer2 = fbm(p * 2.8 + driftB);
    float layer3 = fbm(p * 5.5 + driftA * 0.6 + driftB * 0.4);
    float deep = layer1 * 0.50 + layer2 * 0.35 + layer3 * 0.15;

    float bandNoise = fbm(vec3(p.x * 0.8, p.y * 3.0 + uTime * 0.004, p.z * 0.8) + driftA * 0.3);
    float bands = smoothstep(0.38, 0.62, bandNoise) * uBandIntensity;

    float fine = fbm(p * 9.0 + vec3(uTime * 0.005, -uTime * 0.003, uTime * 0.004));
    float detail = smoothstep(0.40, 0.65, fine) * 0.18;

    vec3 ivoryWhite = vec3(0.98, 0.96, 0.90);
    vec3 warmIvory = vec3(0.95, 0.92, 0.84);
    vec3 paleTeal = vec3(0.72, 0.84, 0.82);
    vec3 silverMist = vec3(0.78, 0.82, 0.80);

    float hotness = smoothstep(0.30, 0.75, deep);
    vec3 col = mix(paleTeal, warmIvory, hotness);
    col = mix(col, ivoryWhite, pow(hotness, 1.8) * 0.65);

    vec3 bandCol = mix(silverMist, ivoryWhite, bands);
    col = mix(col, bandCol, bands * 0.45);
    col += ivoryWhite * detail;

    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float mu = max(dot(vNorm, viewDir), 0.0);
    float limb = 0.60 + 0.40 * pow(mu, 0.30);
    col *= limb;

    float edge = pow(1.0 - mu, 3.2);
    vec3 edgeCol = mix(paleTeal, silverMist, 0.5);
    col = mix(col, edgeCol, edge * 0.50);
    col *= 1.06 + hotness * 0.12 + bands * 0.08;

    gl_FragColor = vec4(col, 1.0);
  }
`;

const dyingSurfaceVert = /* glsl */ `
  uniform float uTime;
  uniform float uPulseSpeed;
  uniform float uPulseAmp;
  uniform float uTurbulence;
  varying vec3 vPos;
  varying vec3 vNorm;
  varying vec3 vWorldPos;
  varying float vDisplacement;

  ${NOISE_GLSL}

  void main() {
    vPos = position;
    vec3 p = normalize(position);

    float pulse1 = sin(uTime * uPulseSpeed) * 0.5 + 0.5;
    float pulse2 = sin(uTime * uPulseSpeed * 1.73 + 2.1) * 0.5 + 0.5;
    float pulse3 = sin(uTime * uPulseSpeed * 0.62 + 4.3) * 0.5 + 0.5;
    float pulse = pulse1 * 0.5 + pulse2 * 0.3 + pulse3 * 0.2;

    float n1 = fbm(p * 3.0 + vec3(uTime * 0.02));
    float n2 = fbm(p * 6.0 - vec3(uTime * 0.015, 0.0, uTime * 0.01));
    float turbDisp = (n1 * 0.6 + n2 * 0.4 - 0.5) * uTurbulence * 0.05;

    float disp = turbDisp + pulse * uPulseAmp;
    vDisplacement = disp;

    vec3 displaced = position * (1.0 + disp);
    vNorm = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vWorldPos = (modelMatrix * vec4(displaced, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

const dyingSurfaceFrag = /* glsl */ `
  uniform float uTime;
  uniform float uHeatBias;
  uniform float uTurbulence;
  varying vec3 vPos;
  varying vec3 vNorm;
  varying vec3 vWorldPos;
  varying float vDisplacement;

  ${NOISE_GLSL}

  float granule(vec3 p) {
    vec3 fp = floor(p); vec3 fr = fract(p);
    float d = 1.0;
    for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++) for(int z=-1;z<=1;z++) {
      vec3 o = vec3(float(x),float(y),float(z));
      vec3 rp = fp + o;
      vec3 h = fract(sin(rp * vec3(127.1,311.7,74.7) + rp.yzx * vec3(269.5,183.3,246.1)) * 43758.5);
      d = min(d, length(fr - o - h));
    }
    return d;
  }

  void main() {
    vec3 p = normalize(vPos);

    float t1 = fbm(p * 2.5 + vec3(uTime * 0.008));
    float t2 = fbm(p * 5.5 + vec3(uTime * 0.018, -uTime * 0.012, 0.0));
    float t3 = fbm(p * 11.0 + vec3(-uTime * 0.025, uTime * 0.014, uTime * 0.008));
    float turb = t1 * 0.5 + t2 * 0.35 + t3 * 0.15;

    float hotField = fbm(p * 1.5 + vec3(uTime * 0.005, 0.0, uTime * 0.004));
    float hotZone = smoothstep(0.30, 0.70, hotField + uHeatBias - 0.5);

    vec3 hotWhite = vec3(1.00, 0.95, 0.82);
    vec3 hotYellow = vec3(1.00, 0.78, 0.32);
    vec3 warmOrange = vec3(0.92, 0.38, 0.10);
    vec3 coolRed = vec3(0.48, 0.10, 0.04);
    vec3 darkCool = vec3(0.10, 0.02, 0.01);

    vec3 hotCol = mix(hotYellow, hotWhite, pow(turb, 0.7) * (0.6 + vDisplacement * 3.0));
    vec3 coolCol = mix(coolRed, warmOrange, turb * 0.8);
    vec3 col = mix(coolCol, hotCol, hotZone);

    float cracks = fbm(p * 8.0 + vec3(uTime * 0.007));
    float crackMask = smoothstep(0.42, 0.56, cracks) * (1.0 - hotZone) * 0.55;
    col = mix(col, darkCool, crackMask);

    float gran = granule(p * 4.0 + vec3(uTime * 0.006));
    float cellBright = 1.0 - smoothstep(0.1, 0.45, gran);
    col *= 0.85 + cellBright * 0.25;

    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float mu = max(dot(vNorm, viewDir), 0.0);
    float limb = 0.35 + 0.65 * pow(mu, 0.22);
    col *= limb;

    float edge = pow(1.0 - mu, 3.5);
    col = mix(col, vec3(1.0, 0.52, 0.18), edge * 0.55);
    col *= 1.5 + hotZone * 0.8 + vDisplacement * 2.0;

    gl_FragColor = vec4(col, 1.0);
  }
`;

const haloVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const haloFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAlpha;
  uniform float uFalloff;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float glow = pow(max(1.0 - d, 0.0), uFalloff);
    gl_FragColor = vec4(uColor * glow, glow * uAlpha);
  }
`;

const flareVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

function makeFlareFrag(palette: StarPalette) {
  const c = FLARE_GLSL[palette];
  return /* glsl */ `
    uniform float uTime;
    varying vec2 vUv;

    ${NOISE_GLSL}

    void main() {
      vec2 cc = vUv - 0.5;
      float d = length(cc);
      float mask = smoothstep(0.50, 0.20, d);

      float core = exp(-d * 18.0) * 0.85;
      float innerGlow = exp(-d * 8.0) * 0.40;
      float outerGlow = exp(-d * 3.5) * 0.12;
      float hStretch = exp(-abs(cc.y) * 35.0) * exp(-abs(cc.x) * 1.8) * 0.12;
      float vStretch = exp(-abs(cc.x) * 45.0) * exp(-abs(cc.y) * 2.5) * 0.04;

      float angle = atan(cc.y, cc.x);
      vec3 noiseCoord = vec3(cos(angle) * 2.0, sin(angle) * 2.0, uTime * 0.015);
      float n = fbm(noiseCoord * 1.5);
      float wisps = n * exp(-d * 3.0) * 0.10;

      float angularVar = fbm(vec3(angle * 1.2, d * 3.0, uTime * 0.008));
      float softRays = pow(angularVar, 2.0) * exp(-d * 4.0) * 0.07;

      float brightness = core + innerGlow + outerGlow + hStretch + vStretch + wisps + softRays;

      vec3 white = ${c.white};
      vec3 warm = ${c.warm};
      vec3 orange = ${c.orange};

      vec3 col = mix(orange, warm, exp(-d * 4.0));
      col = mix(col, white, exp(-d * 10.0));
      col *= brightness;
      col *= mask;

      float alpha = max(max(col.r, col.g), col.b);
      gl_FragColor = vec4(col, alpha);
    }
  `;
}

export const vescrowCoronaVert = /* glsl */ `
  uniform float uTime;
  varying vec3 vNorm;
  varying vec3 vWorldPos;
  varying vec3 vLocalPos;

  ${NOISE_GLSL}

  void main() {
    vec3 p = normalize(position);
    float ripple = fbm(p * 3.0 + vec3(uTime * 0.014, -uTime * 0.008, uTime * 0.010));
    float displacement = (ripple - 0.5) * 0.015;
    vec3 displaced = position * (1.0 + displacement);

    vLocalPos = p;
    vNorm = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vWorldPos = (modelMatrix * vec4(displaced, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

export const vescrowCoronaFrag = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  varying vec3 vNorm;
  varying vec3 vWorldPos;
  varying vec3 vLocalPos;

  ${NOISE_GLSL}

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float mu = abs(dot(normalize(vNorm), viewDir));
    float rim = 1.0 - mu;

    float n = fbm(vLocalPos * 3.5 + vec3(uTime * 0.016, -uTime * 0.010, uTime * 0.012));
    float wisps = smoothstep(0.38, 0.70, n);

    float aura = pow(rim, 3.8) * (0.65 + wisps * 0.35);
    float opacity = aura * uOpacity;

    vec3 hotWhite = vec3(1.00, 0.97, 0.85);
    vec3 gold = vec3(1.00, 0.82, 0.35);
    vec3 orange = vec3(1.00, 0.55, 0.12);
    vec3 col = mix(orange, gold, wisps);
    col = mix(col, hotWhite, pow(rim, 4.5));
    col *= 1.8;

    gl_FragColor = vec4(col, clamp(opacity, 0.0, 1.0));
  }
`;

export const dwarfCoronaVert = /* glsl */ `
  uniform float uTime;
  varying vec3 vNorm;
  varying vec3 vWorldPos;
  varying vec3 vLocalPos;

  ${NOISE_GLSL}

  void main() {
    vec3 p = normalize(position);
    float ripple = fbm(p * 3.8 + vec3(uTime * 0.010, 0.0, -uTime * 0.008));
    float displacement = (ripple - 0.5) * 0.015;
    vec3 displaced = position * (1.0 + displacement);

    vLocalPos = p;
    vNorm = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vWorldPos = (modelMatrix * vec4(displaced, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

export const dwarfCoronaFrag = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  varying vec3 vNorm;
  varying vec3 vWorldPos;
  varying vec3 vLocalPos;

  ${NOISE_GLSL}

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float mu = abs(dot(normalize(vNorm), viewDir));
    float rim = 1.0 - mu;

    float n = fbm(vLocalPos * 4.2 + vec3(uTime * 0.012, -uTime * 0.008, uTime * 0.010));
    float crisp = smoothstep(0.42, 0.72, n);

    float aura = pow(rim, 5.2) * (0.72 + crisp * 0.28);
    float opacity = aura * uOpacity;

    vec3 white = vec3(0.95, 0.99, 1.00);
    vec3 cyan = vec3(0.48, 0.86, 1.00);
    vec3 blue = vec3(0.36, 0.62, 1.00);
    vec3 col = mix(blue, cyan, crisp);
    col = mix(col, white, pow(rim, 6.0));
    col *= 1.65;

    gl_FragColor = vec4(col, clamp(opacity, 0.0, 1.0));
  }
`;

export const vestingAtmoVert = /* glsl */ `
  uniform float uTime;
  varying vec3 vNorm;
  varying vec3 vWorldPos;
  varying vec3 vLocalPos;

  ${NOISE_GLSL}

  void main() {
    vec3 p = normalize(position);
    vLocalPos = p;

    float n = fbm(p * 2.0 + vec3(uTime * 0.005, uTime * 0.003, -uTime * 0.004));
    float displacement = (n - 0.5) * 0.015;

    vec3 displaced = position * (1.0 + displacement);
    vNorm = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vWorldPos = (modelMatrix * vec4(displaced, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

export const vestingAtmoFrag = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  varying vec3 vNorm;
  varying vec3 vWorldPos;
  varying vec3 vLocalPos;

  ${NOISE_GLSL}

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float ndotv = abs(dot(normalize(vNorm), viewDir));
    float rim = 1.0 - ndotv;

    float n1 = fbm(vLocalPos * 1.8 + vec3(uTime * 0.006, uTime * 0.004, -uTime * 0.003));
    float n2 = fbm(vLocalPos * 3.2 - vec3(uTime * 0.004, -uTime * 0.005, uTime * 0.003));
    float density = smoothstep(0.28, 0.62, n1 * 0.6 + n2 * 0.4);

    float rimGlow = pow(rim, 2.2) * 0.60;
    float innerHaze = pow(rim, 0.9) * density * 0.12;
    float opacity = (rimGlow + innerHaze) * uOpacity;

    vec3 ivoryRim = vec3(0.96, 0.94, 0.88);
    vec3 silverMid = vec3(0.78, 0.84, 0.82);
    vec3 tealDeep = vec3(0.45, 0.62, 0.58);
    vec3 col = mix(tealDeep, silverMid, rim * 0.7);
    col = mix(col, ivoryRim, pow(rim, 2.0));
    col *= 1.35;

    gl_FragColor = vec4(col, clamp(opacity, 0.0, 1.0));
  }
`;

const gasEnvelopeVert = /* glsl */ `
  uniform float uTime;
  varying vec3 vNorm;
  varying vec3 vWorldPos;
  varying vec3 vLocalPos;

  ${NOISE_GLSL}

  void main() {
    vec3 p = normalize(position);
    vLocalPos = p;

    float n1 = fbm(p * 2.0 + vec3(uTime * 0.012, uTime * 0.009, -uTime * 0.007));
    float n2 = fbm(p * 3.5 - vec3(uTime * 0.008, -uTime * 0.011, uTime * 0.006));
    float displacement = (n1 * 0.6 + n2 * 0.4 - 0.5) * 0.18;

    vec3 displaced = position * (1.0 + displacement);
    vNorm = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vWorldPos = (modelMatrix * vec4(displaced, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

const gasEnvelopeFrag = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  varying vec3 vNorm;
  varying vec3 vWorldPos;
  varying vec3 vLocalPos;

  ${NOISE_GLSL}

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float ndotv = abs(dot(normalize(vNorm), viewDir));
    float rim = 1.0 - ndotv;

    float n = fbm(vLocalPos * 3.0 + vec3(uTime * 0.014, uTime * 0.01, -uTime * 0.008));
    float density = smoothstep(0.25, 0.65, n);

    float rimGlow = pow(rim, 3.0) * 0.75;
    float innerWisp = pow(rim, 1.2) * density * 0.18;
    float opacity = (rimGlow + innerWisp) * uOpacity;

    vec3 hotRim = vec3(1.0, 0.48, 0.12);
    vec3 midGas = vec3(0.80, 0.22, 0.06);
    vec3 innerGas = vec3(0.45, 0.10, 0.03);
    vec3 col = mix(innerGas, midGas, rim * 0.8);
    col = mix(col, hotRim, pow(rim, 2.5));
    col *= 1.5;

    gl_FragColor = vec4(col, clamp(opacity, 0.0, 1.0));
  }
`;

const cmeVert = /* glsl */ `
  uniform float uProgress;
  varying vec3 vNorm;
  varying vec3 vWorldPos;

  float h3(vec3 p) {
    p = fract(p * vec3(127.1, 311.7, 74.7));
    p += dot(p, p.yxz + 19.19);
    return fract((p.x + p.y) * p.z);
  }

  float bumps(vec3 p) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      s += a * h3(p);
      p *= 2.1;
      p.xy += 0.37;
      a *= 0.5;
    }
    return s;
  }

  void main() {
    vNorm = normalize(mat3(modelMatrix) * normal);
    float warp = (bumps(normal * 4.0 + uProgress * 3.7) * 2.0 - 1.0) * 0.06 * (1.0 - uProgress * 0.85);
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
    float ndotv = abs(dot(normalize(vNorm), viewDir));
    float rim = 1.0 - ndotv;
    float shockRim = pow(rim, 5.5);
    float shape = shockRim;

    vec3 hotColor = vec3(1.00, 0.92, 0.60);
    vec3 midColor = vec3(1.00, 0.55, 0.15);
    vec3 coolColor = vec3(0.90, 0.28, 0.06);
    float t = uProgress;
    vec3 plasmaCol = t < 0.45
      ? mix(hotColor, midColor, t / 0.45)
      : mix(midColor, coolColor, (t - 0.45) / 0.55);

    gl_FragColor = vec4(plasmaCol, clamp(shape * uAlpha, 0.0, 1.0));
  }
`;

const emberVert = /* glsl */ `
  attribute float aLife;
  attribute float aSpeed;
  attribute float aSize;
  uniform float uTime;
  uniform float uSunRadius;
  uniform float uEmberSpeed;
  varying float vAlpha;
  varying float vHeat;

  void main() {
    float t = fract(uTime * aSpeed * uEmberSpeed + aLife);
    float r = uSunRadius * (1.08 + t * 5.0);

    vec3 dir = normalize(position);
    vec3 tangent = normalize(cross(dir, vec3(0.0, 1.0, 0.001)));
    vec3 bitangent = normalize(cross(dir, tangent));
    float wT = sin(uTime * 0.4 + aLife * 6.2832) * 0.35;
    float wB = cos(uTime * 0.35 + aLife * 4.1) * 0.25;
    vec3 pos = dir * r + (tangent * wT + bitangent * wB) * uSunRadius * t;

    vAlpha = t < 0.08 ? t * 12.5 : pow(1.0 - (t - 0.08) / 0.92, 1.5);
    vHeat = 1.0 - t;

    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = aSize * vAlpha * (500.0 / -mvPos.z);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const emberFrag = /* glsl */ `
  varying float vAlpha;
  varying float vHeat;

  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float circle = 1.0 - smoothstep(0.0, 1.0, d);

    vec3 hotColor = vec3(1.0, 0.88, 0.55);
    vec3 coolColor = vec3(1.0, 0.35, 0.08);
    vec3 ashColor = vec3(0.6, 0.15, 0.05);
    vec3 col = mix(ashColor, coolColor, vHeat * 0.6);
    col = mix(col, hotColor, vHeat * vHeat);
    col *= 3.0;

    gl_FragColor = vec4(col, circle * vAlpha * 0.9);
  }
`;

function createBaseMaterial(params: ConstructorParameters<typeof THREE.ShaderMaterial>[0]): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial(params);
}

export function createSurfaceMaterial(palette: StarPalette): THREE.ShaderMaterial {
  switch (getStarVariant(palette)) {
    case "dying":
      return createBaseMaterial({
        vertexShader: dyingSurfaceVert,
        fragmentShader: dyingSurfaceFrag,
        uniforms: {
          uTime: { value: 0 },
          uPulseSpeed: { value: DYING_PARAMS.pulseSpeed },
          uPulseAmp: { value: DYING_PARAMS.pulseAmplitude },
          uTurbulence: { value: DYING_PARAMS.turbulence },
          uHeatBias: { value: DYING_PARAMS.heatBias },
        },
        transparent: false,
        depthWrite: true,
        depthTest: true,
      });
    case "vesting":
      return createBaseMaterial({
        vertexShader: vestingSurfaceVert,
        fragmentShader: vestingSurfaceFrag,
        uniforms: {
          uTime: { value: 0 },
          uPulseSpeed: { value: VESTING_PARAMS.pulseSpeed },
          uPulseAmp: { value: VESTING_PARAMS.pulseAmplitude },
          uDriftSpeed: { value: VESTING_PARAMS.driftSpeed },
          uBandIntensity: { value: VESTING_PARAMS.bandIntensity },
        },
        transparent: false,
        depthWrite: true,
        depthTest: true,
      });
    case "vescrow":
      return createBaseMaterial({
        vertexShader: vescrowSurfaceVert,
        fragmentShader: vescrowSurfaceFrag,
        uniforms: {
          uTime: { value: 0 },
          uPulseSpeed: { value: VESCROW_PARAMS.pulseSpeed },
          uPulseAmp: { value: VESCROW_PARAMS.pulseAmplitude },
          uTurbulence: { value: VESCROW_PARAMS.turbulence },
          uPlasmaSpeed: { value: VESCROW_PARAMS.plasmaSpeed },
          uHotspotIntensity: { value: VESCROW_PARAMS.hotspotIntensity },
        },
        transparent: false,
        depthWrite: true,
        depthTest: true,
      });
    case "dwarf":
      return createBaseMaterial({
        vertexShader: surfaceVert,
        fragmentShader: dwarfSurfaceFrag,
        uniforms: {
          uTime: { value: 0 },
          uFlowSpeed: { value: DWARF_PARAMS.flowSpeed },
          uPlasmaTightness: { value: DWARF_PARAMS.plasmaTightness },
        },
        transparent: false,
        depthWrite: true,
        depthTest: true,
      });
    case "generic":
    default:
      return createBaseMaterial({
        vertexShader: surfaceVert,
        fragmentShader: makeSurfaceFrag(palette),
        uniforms: { uTime: { value: 0 } },
        transparent: false,
        depthWrite: true,
        depthTest: true,
      });
  }
}

export function createHaloMaterial(color: string, alpha: number, falloff: number): THREE.ShaderMaterial {
  return createBaseMaterial({
    vertexShader: haloVert,
    fragmentShader: haloFrag,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uAlpha: { value: alpha },
      uFalloff: { value: falloff },
    },
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
  });
}

export function createLensFlareMaterial(palette: StarPalette, opacity: number): THREE.ShaderMaterial {
  return createBaseMaterial({
    vertexShader: flareVert,
    fragmentShader: makeFlareFrag(palette),
    uniforms: { uTime: { value: 0 } },
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    opacity,
  });
}

export function createVescrowCoronaMaterial(): THREE.ShaderMaterial {
  return createBaseMaterial({
    vertexShader: vescrowCoronaVert,
    fragmentShader: vescrowCoronaFrag,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: VESCROW_PARAMS.coronaOpacity },
    },
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
  });
}

export function createDwarfCoronaMaterial(): THREE.ShaderMaterial {
  return createBaseMaterial({
    vertexShader: dwarfCoronaVert,
    fragmentShader: dwarfCoronaFrag,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: DWARF_PARAMS.coronaOpacity },
    },
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
  });
}

export function createVestingAtmosphereMaterial(): THREE.ShaderMaterial {
  return createBaseMaterial({
    vertexShader: vestingAtmoVert,
    fragmentShader: vestingAtmoFrag,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: VESTING_PARAMS.atmosphereOpacity },
    },
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
  });
}

export function createDyingGasEnvelopeMaterial(): THREE.ShaderMaterial {
  return createBaseMaterial({
    vertexShader: gasEnvelopeVert,
    fragmentShader: gasEnvelopeFrag,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: DYING_PARAMS.gasOpacity },
    },
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
  });
}

export function createCmeMaterial(): THREE.ShaderMaterial {
  return createBaseMaterial({
    vertexShader: cmeVert,
    fragmentShader: cmeFrag,
    uniforms: {
      uAlpha: { value: 0 },
      uProgress: { value: 0 },
    },
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
  });
}

export function createDyingEmberResources(): { geo: THREE.BufferGeometry; mat: THREE.ShaderMaterial } {
  const count = DYING_PARAMS.emberCount;
  const dirs = new Float32Array(count * 3);
  const lifes = new Float32Array(count);
  const speeds = new Float32Array(count);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    dirs[i * 3] = Math.sin(phi) * Math.cos(theta);
    dirs[i * 3 + 1] = Math.sin(phi) * Math.sin(theta);
    dirs[i * 3 + 2] = Math.cos(phi);
    lifes[i] = Math.random();
    speeds[i] = 0.5 + Math.random() * 0.5;
    sizes[i] = 2.0 + Math.random() * 6.0;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(dirs, 3));
  geo.setAttribute("aLife", new THREE.BufferAttribute(lifes, 1));
  geo.setAttribute("aSpeed", new THREE.BufferAttribute(speeds, 1));
  geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

  const mat = createBaseMaterial({
    vertexShader: emberVert,
    fragmentShader: emberFrag,
    uniforms: {
      uTime: { value: 0 },
      uSunRadius: { value: SUN_RADIUS },
      uEmberSpeed: { value: DYING_PARAMS.emberSpeed },
    },
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });

  return { geo, mat };
}
