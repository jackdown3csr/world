/**
 * Rocky 2 — Rust World archetype.
 * Red-ochre general rusty desert, scattered craters, polar frost caps,
 * thin haze layer, similar to Mars but without hero features.
 */

import { PLANET_NOISE, MOON_SHADOW_GLSL } from "../planetNoise";

const HEIGHT_FN = /* glsl */ `
  float typeHeight(vec3 p, vec3 seed3, float seed) {
    float base = fbm(p * 2.0 + seed3) * 0.45;
    float fine = fbm(p * 6.0 + seed3 * 1.6) * 0.25;
    float c = craters(p * 2.5 + seed3, seed, 0.20, 4) * 0.20;
    return (base + fine - c) * 0.06;
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
    vec3 displaced = position + normal * h * rad * 0.016;
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
    vec3 bumpN = normalize(vWorldNorm + grad * 0.9);

    float NdotL_raw = dot(bumpN, lightDir);
    float day       = smoothstep(-0.05, 0.05, NdotL_raw);
    float NdotL     = max(NdotL_raw, 0.);

    // ── Red-ochre terrain ──
    float hShift = uHue * 0.25 + uSeed * 0.18;
    vec3 rust     = hsv(vec3(fract(0.04 + hShift), 0.62, 0.55));  // rusty red
    vec3 ochre    = hsv(vec3(fract(0.07 + hShift), 0.55, 0.62));  // ochre-tan
    vec3 darkDust = hsv(vec3(fract(0.02 + hShift), 0.50, 0.35));  // dark red
    vec3 paleSand = hsv(vec3(fract(0.10 + hShift), 0.38, 0.72));  // light sand

    float alt = smoothstep(0.01, 0.06, h0);
    float terrN = fbm(p * 5.0 + seed3 * 2.0) * 0.5 + 0.5;

    vec3 albedo = mix(darkDust, rust, smoothstep(0.2, 0.5, alt));
    albedo = mix(albedo, ochre, smoothstep(0.5, 0.8, alt));
    albedo = mix(albedo, paleSand, smoothstep(0.55, 0.80, terrN) * 0.30);

    // ── Crater floors are darker ──
    float craterFloor = smoothstep(0.02, 0.005, h0);
    albedo = mix(albedo, darkDust * 0.7, craterFloor * 0.40);

    // ── Polar frost caps ──
    float frost = smoothstep(0.68, 0.85, abs(lat));
    vec3 frostCol = hsv(vec3(fract(0.08 + hShift), 0.12, 0.85));
    albedo = mix(albedo, frostCol, frost * 0.65);

    // ── Diffuse ──
    vec3 color = albedo * NdotL;

    // ── Specular — dry rock ──
    vec3 halfV = normalize(lightDir + viewDir);
    float spec = pow(max(dot(bumpN, halfV), 0.), 12.0);
    color += vec3(0.95, 0.85, 0.72) * spec * 0.08 * day;

    // ── Thin haze atmosphere ──
    vec3 atmosCol = hsv(vec3(fract(0.05 + hShift), 0.35, 0.75));
    float atmosStr = 0.15 * (1.0 - uHasRing * 0.55);
    float vdn      = max(dot(bumpN, viewDir), 0.);
    float sunFacing = smoothstep(-0.15, 0.35, dot(vWorldNorm, lightDir));
    float fres     = pow(1. - vdn, 4.0) * sunFacing;
    color += atmosCol * fres * atmosStr;

    color *= 1.0 - moonTransitShadow(vWorldPos) * 0.85;
    color = pow(max(color, vec3(0.001)), vec3(1./2.2));
    gl_FragColor = vec4(color, 1.0);
  }
`;
