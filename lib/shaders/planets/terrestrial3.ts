/**
 * Terrestrial 3 — Alien Teal archetype.
 * Exotic biosphere: teal/cyan vegetation, purple-blue oceans, amber
 * highland deserts, thin wispy clouds, warm pink atmospheric rim.
 */

import { PLANET_NOISE, MOON_SHADOW_GLSL } from "../planetNoise";

const HEIGHT_FN = /* glsl */ `
  float typeHeight(vec3 p, vec3 seed3, float seed) {
    float t = fbm(p * 2.2 + seed3) * 0.55 + fbm(p * 5.5 + seed3 * 1.5) * 0.25;
    return t * 0.055;
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
    vec3 displaced = position + normal * h * rad * 0.012;
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
    vec3 bumpN = normalize(vWorldNorm + grad * 0.6);

    float NdotL_raw = dot(bumpN, lightDir);
    float day       = smoothstep(-0.08, 0.08, NdotL_raw);
    float NdotL     = max(NdotL_raw, 0.);

    // ── Continent/ocean split ──
    float seaLevel = 0.025;
    float land = smoothstep(seaLevel - 0.003, seaLevel + 0.003, h0);

    float hShift = uHue * 0.25 + uSeed * 0.18;

    // ── Purple-blue alien ocean ──
    vec3 deepSea  = hsv(vec3(fract(0.72 + hShift), 0.55, 0.30));
    vec3 shallSea = hsv(vec3(fract(0.68 + hShift), 0.45, 0.48));
    float depth = smoothstep(0.0, seaLevel, h0);
    vec3 ocean = mix(deepSea, shallSea, depth);

    // ── Alien biome colours ──
    float alt = smoothstep(seaLevel, 0.055, h0);
    vec3 tealVeg  = hsv(vec3(fract(0.47 + hShift), 0.58, 0.50));  // teal forest
    vec3 cyanLow  = hsv(vec3(fract(0.45 + hShift), 0.52, 0.60));  // cyan grassland
    vec3 amberHigh = hsv(vec3(fract(0.12 + hShift), 0.48, 0.62)); // amber highland
    vec3 darkPeak = hsv(vec3(fract(0.70 + hShift), 0.30, 0.38));  // dark peaks

    float biomeN = fbm(p * 6.0 + seed3 * 2.5) * 0.5 + 0.5;
    vec3 landCol = mix(cyanLow, tealVeg, smoothstep(0.3, 0.6, biomeN));
    landCol = mix(landCol, amberHigh, smoothstep(0.5, 0.8, alt));
    landCol = mix(landCol, darkPeak, smoothstep(0.8, 0.95, alt));
    // Equatorial teal belt is richest
    landCol = mix(landCol, tealVeg * 1.15, smoothstep(0.30, 0.05, abs(lat)) * 0.25);

    vec3 albedo = mix(ocean, landCol, land);

    // ── High-latitude pale (alien tundra) ──
    vec3 alienTundra = hsv(vec3(fract(0.50 + hShift), 0.20, 0.72));
    albedo = mix(albedo, alienTundra, smoothstep(0.58, 0.78, abs(lat)) * land * 0.50);

    // ── Polar ice — pinkish ──
    vec3 alienIce = hsv(vec3(fract(0.85 + hShift), 0.18, 0.88));
    float ice = smoothstep(0.76, 0.92, abs(lat));
    albedo = mix(albedo, alienIce, ice * 0.65);

    // ── Thin wispy clouds ──
    float c1 = fbm(p * 5.0 + seed3 * 2.5 + uTime * 0.010);
    float cloudMask = smoothstep(0.48, 0.72, c1) * 0.30;
    albedo = mix(albedo, vec3(0.90, 0.88, 0.92), cloudMask);

    // ── Diffuse ──
    vec3 color = albedo * NdotL;

    // ── Specular ──
    vec3 halfV = normalize(lightDir + viewDir);
    float seaSpec = pow(max(dot(bumpN, halfV), 0.), 36.0);
    color += vec3(0.90, 0.85, 0.95) * seaSpec * (1.0 - land) * 0.30 * day;
    float landSpec = pow(max(dot(bumpN, halfV), 0.), 14.0);
    color += vec3(0.88, 0.92, 0.90) * landSpec * land * 0.08 * day;

    // ── Atmosphere Fresnel — warm pink ──
    vec3 atmosCol = hsv(vec3(fract(0.88 + hShift), 0.35, 0.90));
    float atmosStr = 0.34 * (1.0 - uHasRing * 0.55);
    float vdn      = max(dot(bumpN, viewDir), 0.);
    float sunFacing = smoothstep(-0.15, 0.35, dot(vWorldNorm, lightDir));
    float fres     = pow(1. - vdn, 3.5) * sunFacing;
    color += atmosCol * fres * atmosStr;

    color *= 1.0 - moonTransitShadow(vWorldPos) * 0.85;
    color = pow(max(color, vec3(0.001)), vec3(1./2.2));
    gl_FragColor = vec4(color, 1.0);
  }
`;
