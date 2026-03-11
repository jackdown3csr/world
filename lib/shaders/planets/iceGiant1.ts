/**
 * Ice Giant 1 — Uranus archetype.
 * Teal-green, extraordinarily smooth and serene, barely visible bands,
 * bright polar cap/collar, axial tilt creates unique lighting.
 */

import { PLANET_NOISE, MOON_SHADOW_GLSL } from "../planetNoise";

const HEIGHT_FN = /* glsl */ `
  float typeHeight(vec3 p, vec3 seed3, float seed) {
    return sin(p.y * 6.0) * 0.004;
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
    vec3 displaced = position + normal * h * rad * 0.001;
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
    vec3 seed3 = vec3(uSeed*13.7, uSeed*7.3, uSeed*5.1);

    vec3 lightDir = normalize(uStarPos - vWorldPos);
    vec3 viewDir  = normalize(cameraPosition - vWorldPos);

    float eps  = 0.02;
    float h0   = typeHeight(p, seed3, uSeed);
    float hx   = typeHeight(normalize(p + vec3(eps,0.,0.)), seed3, uSeed);
    float hy   = typeHeight(normalize(p + vec3(0.,eps,0.)), seed3, uSeed);
    vec3 grad  = vec3(hx-h0, hy-h0, 0.) / eps;
    vec3 bumpN = normalize(vWorldNorm + grad * 0.02);

    float NdotL_raw = dot(bumpN, lightDir);
    float day       = smoothstep(-0.08, 0.08, NdotL_raw);
    float NdotL     = max(NdotL_raw, 0.);

    // ── Almost featureless — very faint banding ──
    float wind = fbm(p * 1.0 + seed3) * 0.04;
    float dLat = lat + wind;
    float b1 = sin(dLat * 8.0 + uTime * 0.008) * 0.5 + 0.5;

    // ── Teal-green palette — uniform, desaturated ──
    float hShift = uHue * 0.25 + uSeed * 0.18;
    vec3 tealBase = hsv(vec3(fract(0.48 + hShift), 0.35, 0.72));
    vec3 tealDark = hsv(vec3(fract(0.50 + hShift), 0.40, 0.62));
    vec3 tealLit  = hsv(vec3(fract(0.47 + hShift), 0.28, 0.80));

    vec3 albedo = mix(tealDark, tealBase, smoothstep(0.35, 0.65, b1));
    // Very subtle lighter patches
    float subtle = fbm(p * 3.0 + seed3 * 1.5) * 0.5 + 0.5;
    albedo = mix(albedo, tealLit, smoothstep(0.50, 0.75, subtle) * 0.10);

    // ── Bright polar collar/cap ──
    // Uranus has a distinctive bright polar cap on its sunlit pole
    float northCap = smoothstep(0.60, 0.85, lat);
    float southCap = smoothstep(0.60, 0.85, -lat);
    float polarCap = max(northCap, southCap * 0.6);
    vec3 capCol = hsv(vec3(fract(0.46 + hShift), 0.18, 0.90));
    albedo = mix(albedo, capCol, polarCap * 0.45);
    // Bright collar ring at cap edge
    float collar = smoothstep(0.58, 0.64, abs(lat)) * smoothstep(0.72, 0.66, abs(lat));
    albedo = mix(albedo, vec3(0.88, 0.92, 0.90), collar * 0.35);

    // ── Rare faint cloud patch ──
    float cloud = fbm(p * 10.0 + seed3 * 3.0 + uTime * 0.006);
    float cloudMask = smoothstep(0.62, 0.78, cloud);
    albedo = mix(albedo, vec3(0.90, 0.92, 0.88), cloudMask * 0.12);

    // ── light equatorial darkening (methane absorption) ──
    albedo *= 1.0 - smoothstep(0.20, 0.0, abs(lat)) * 0.08;

    // ── Diffuse ──
    vec3 color = albedo * NdotL;

    // ── Specular — smooth surface, mild highlight ──
    vec3 halfV = normalize(lightDir + viewDir);
    float spec = pow(max(dot(bumpN, halfV), 0.), 30.0);
    color += vec3(0.88, 0.94, 0.92) * spec * 0.15 * day;

    // ── Atmosphere Fresnel — teal-cyan ──
    vec3  atmosCol = hsv(vec3(fract(0.47 + hShift), 0.40, 0.88));
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
