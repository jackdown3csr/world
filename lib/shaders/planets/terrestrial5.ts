/**
 * Terrestrial 5 — Volcanic Terrestrial archetype.
 * Active volcanism: dark basaltic land with orange-glowing volcanic chains,
 * mineral-dark oceans, thick ash/sulfur clouds, orange atmospheric glow.
 */

import { PLANET_NOISE, MOON_SHADOW_GLSL } from "../planetNoise";

const HEIGHT_FN = /* glsl */ `
  float typeHeight(vec3 p, vec3 seed3, float seed) {
    float t = fbm(p * 2.5 + seed3) * 0.5 + fbm(p * 7.0 + seed3 * 2.0) * 0.25;
    return t * 0.06;
  }
`;

export const VERT = /* glsl */ `
  uniform float uSeed;
  ${PLANET_NOISE}
  ${HEIGHT_FN}
  varying vec3 vPos;
  varying vec3 vWorldPos;
  varying vec3 vWorldNorm;
  void main(){
    vec3 p     = normalize(position);
    vec3 seed3 = vec3(uSeed*13.7, uSeed*7.3, uSeed*5.1);
    float h    = typeHeight(p, seed3, uSeed);
    float rad  = length(position);
    vec3 displaced = position + normal * h * rad * 0.015;
    vPos       = position;
    vec4 wp    = modelMatrix * vec4(displaced, 1.0);
    vWorldPos  = wp.xyz;
    vWorldNorm = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const FRAG = /* glsl */ `
  uniform vec3  uStarPos;
  uniform float uHue;
  uniform float uSeed;
  uniform float uTime;
  uniform float uVariant;
  uniform float uHasRing;
  varying vec3 vPos;
  varying vec3 vWorldPos;
  varying vec3 vWorldNorm;

  ${PLANET_NOISE}
  ${HEIGHT_FN}
  ${MOON_SHADOW_GLSL}

  void main(){
    vec3 p     = normalize(vPos);
    float lat  = p.y;
    float lon  = atan(p.z, p.x);
    vec3 seed3 = vec3(uSeed*13.7, uSeed*7.3, uSeed*5.1);

    vec3 lightDir = normalize(uStarPos - vWorldPos);
    vec3 viewDir  = normalize(cameraPosition - vWorldPos);

    float eps  = 0.02;
    float h0   = typeHeight(p, seed3, uSeed);
    float hx   = typeHeight(normalize(p + vec3(eps,0.,0.)), seed3, uSeed);
    float hy   = typeHeight(normalize(p + vec3(0.,eps,0.)), seed3, uSeed);
    vec3 grad  = vec3(hx-h0, hy-h0, 0.) / eps;
    vec3 bumpN = normalize(vWorldNorm + grad * 0.7);

    float NdotL_raw = dot(bumpN, lightDir);
    float day       = smoothstep(-0.08, 0.08, NdotL_raw);
    float NdotL     = max(NdotL_raw, 0.);

    // ── Mineral-dark ocean ──
    float seaLevel = 0.020;
    float land = smoothstep(seaLevel - 0.003, seaLevel + 0.003, h0);

    float hShift = uHue * 0.25 + uSeed * 0.18;
    vec3 darkOcean = hsv(vec3(fract(0.58 + hShift), 0.30, 0.15));
    vec3 shoreOcean = hsv(vec3(fract(0.10 + hShift), 0.28, 0.25));
    float depth = smoothstep(0.0, seaLevel, h0);
    vec3 ocean = mix(darkOcean, shoreOcean, depth);

    // ── Dark basaltic terrain ──
    float alt = smoothstep(seaLevel, 0.06, h0);
    vec3 basalt     = hsv(vec3(fract(0.07 + hShift), 0.20, 0.20));
    vec3 darkPlains = hsv(vec3(fract(0.05 + hShift), 0.25, 0.28));
    vec3 ashGrey    = hsv(vec3(fract(0.08 + hShift), 0.10, 0.35));
    vec3 landCol = mix(darkPlains, basalt, smoothstep(0.3, 0.6, alt));
    landCol = mix(landCol, ashGrey, smoothstep(0.7, 0.95, alt));

    vec3 albedo = mix(ocean, landCol, land);

    // ── Volcanic glow — chains of active volcanoes ──
    // Two volcanic ridge systems following different noise corridors
    float ridge1 = fbm(p * 3.5 + seed3 * 1.2);
    float ridge2 = fbm(p * 4.0 + seed3 * 2.8 + vec3(2.0));
    float volcMask1 = smoothstep(0.48, 0.56, ridge1) * smoothstep(0.64, 0.56, ridge1);
    float volcMask2 = smoothstep(0.50, 0.58, ridge2) * smoothstep(0.66, 0.58, ridge2);
    float volcMask  = max(volcMask1, volcMask2) * land;

    // Glow intensity varies with time (pulsing eruptions)
    float pulse = sin(uTime * 0.08 + lon * 3.0 + lat * 5.0) * 0.3 + 0.7;
    vec3 lavaGlow  = hsv(vec3(fract(0.06 + hShift), 0.95, 0.95)); // bright orange
    vec3 lavaDeep  = hsv(vec3(fract(0.02 + hShift), 0.90, 0.60)); // deep red
    vec3 volcCol   = mix(lavaDeep, lavaGlow, pulse);
    albedo = mix(albedo, volcCol, volcMask * 0.75);

    // Individual large volcano hotspots
    for(int i = 0; i < 4; i++){
      float vLat = fract(uSeed * (3.3 + float(i) * 4.7)) * 1.4 - 0.7;
      float vLon = fract(uSeed * (6.1 + float(i) * 2.3)) * 6.2832;
      float vdx = lon - vLon;
      vdx = vdx - 6.2832 * floor(vdx / 6.2832 + 0.5);
      float vDist = length(vec2(vdx * 3.0, (lat - vLat) * 3.5));
      float vMask = smoothstep(0.25, 0.02, vDist) * land;
      albedo = mix(albedo, lavaGlow, vMask * 0.85 * pulse);
    }

    // ── Thick ash/sulfur clouds ──
    float c1 = fbm(p * 3.0 + seed3 * 2.5 + uTime * 0.006);
    float c2 = fbm(p * 6.0 + seed3 * 3.5 - uTime * 0.004);
    float ashCloud = smoothstep(0.32, 0.58, c1) * 0.40;
    ashCloud += smoothstep(0.45, 0.68, c2) * 0.20;
    vec3 ashCol = hsv(vec3(fract(0.08 + hShift), 0.22, 0.42)); // dark yellowish
    albedo = mix(albedo, ashCol, ashCloud);

    // ── No proper ice — maybe faint sulfur frost at poles ──
    float frost = smoothstep(0.85, 0.95, abs(lat));
    vec3 sulfurFrost = hsv(vec3(fract(0.14 + hShift), 0.35, 0.58));
    albedo = mix(albedo, sulfurFrost, frost * 0.30);

    // ── Diffuse ──
    vec3 color = albedo * NdotL;

    // ── Self-emission from volcanic glow (visible on night side) ──
    float selfGlow = volcMask * pulse * 0.35;
    color += volcCol * selfGlow * (1.0 - day * 0.6);

    // ── Specular ──
    vec3 halfV = normalize(lightDir + viewDir);
    float spec = pow(max(dot(bumpN, halfV), 0.), 16.0);
    color += vec3(1., 0.88, 0.65) * spec * 0.12 * day;

    // ── Atmosphere Fresnel — orange-amber haze ──
    vec3 atmosCol = hsv(vec3(fract(0.07 + hShift), 0.55, 0.82));
    float atmosStr = 0.35 * (1.0 - uHasRing * 0.55);
    float vdn      = max(dot(bumpN, viewDir), 0.);
    float sunFacing = smoothstep(-0.15, 0.35, dot(vWorldNorm, lightDir));
    float fres     = pow(1. - vdn, 3.5) * sunFacing;
    color += atmosCol * fres * atmosStr;

    color *= 1.0 - moonTransitShadow(vWorldPos) * 0.85;
    color = pow(max(color, vec3(0.001)), vec3(1./2.2));
    gl_FragColor = vec4(color, 1.0);
  }
`;
