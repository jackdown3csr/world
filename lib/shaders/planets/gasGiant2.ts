/**
 * Gas Giant 2 — Hot Jupiter archetype.
 * Tidally locked: bright incandescent day-side, dark crimson night-side.
 * Jet-stream chevron streaks, strong equatorial thermal glow, dramatic
 * terminator transition.
 */

import { PLANET_NOISE, MOON_SHADOW_GLSL } from "../planetNoise";

const HEIGHT_FN = /* glsl */ `
  float typeHeight(vec3 p, vec3 seed3, float seed) {
    return fbm(p * 3.0 + seed3) * 0.006;
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
    vec3 displaced = position + normal * h * rad * 0.002;
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
    vec3 bumpN = normalize(vWorldNorm + grad * 0.03);

    float NdotL_raw = dot(bumpN, lightDir);
    float day       = smoothstep(-0.08, 0.08, NdotL_raw);
    float NdotL     = max(NdotL_raw, 0.);

    // ── Day/night irradiation factor ──
    // tidally locked → one hemisphere always faces star
    float irrad = smoothstep(-0.35, 0.55, NdotL_raw);  // smooth terminator

    // ── Jet-stream chevron patterns ──
    // Longitude-stretching flow creates V-shaped features at band edges
    float wind = fbm(p * 2.5 + seed3) * 0.10;
    float dLat = lat + wind;
    float chevron = sin(dLat * 12.0 + sin(lon * 5.0 + uTime * 0.05) * 0.4) * 0.5 + 0.5;
    float jet     = sin(dLat * 24.0 + uTime * 0.03 + 1.3) * 0.5 + 0.5;

    // ── Temperature-driven palette ──
    float hShift = uHue * 0.25 + uSeed * 0.18;
    // Day side: white-yellow core → orange edges
    vec3 dayHot   = hsv(vec3(fract(0.12 + hShift), 0.10, 0.98));  // white-yellow
    vec3 dayWarm  = hsv(vec3(fract(0.08 + hShift), 0.55, 0.82));  // bright orange
    // Night side: deep crimson → near-black
    vec3 nightWarm = hsv(vec3(fract(0.02 + hShift), 0.80, 0.28)); // deep crimson
    vec3 nightCold = hsv(vec3(fract(0.00 + hShift), 0.70, 0.08)); // near-black

    vec3 daySurface  = mix(dayWarm, dayHot, smoothstep(0.3, 0.8, chevron));
    vec3 nightSurface = mix(nightCold, nightWarm, smoothstep(0.3, 0.7, jet) * 0.35);

    vec3 albedo = mix(nightSurface, daySurface, irrad);

    // ── Bright equatorial thermal belt ──
    float eqHeat = smoothstep(0.35, 0.0, abs(lat)) * irrad;
    albedo = mix(albedo, dayHot, eqHeat * 0.25);

    // ── Streaky high-speed winds ──
    float streak = fbm(vec3(lon * 4.0 + uTime * 0.08, lat * 30.0, uSeed)) * 0.5 + 0.5;
    float streakMask = smoothstep(0.55, 0.85, streak) * 0.20;
    albedo = mix(albedo, dayHot, streakMask * irrad);

    // ── Mild polar cooling ──
    float poleCool = smoothstep(0.55, 0.90, abs(lat)) * 0.25;
    albedo = mix(albedo, nightWarm, poleCool);

    // ── Lit surface (note: partly self-luminous on night side) ──
    float selfGlow = (1.0 - irrad) * 0.08;
    vec3 color = albedo * max(NdotL + selfGlow, selfGlow);

    // ── Hot specular highlight ──
    vec3 halfV = normalize(lightDir + viewDir);
    float spec = pow(max(dot(bumpN, halfV), 0.), 14.0);
    color += vec3(1., 0.92, 0.72) * spec * 0.28 * day;

    // ── Atmosphere Fresnel — intense orange/red glow ──
    vec3  atmosCol = hsv(vec3(fract(0.05 + hShift), 0.65, 0.95));
    float atmosStr = 0.45 * (1.0 - uHasRing * 0.55);
    float vdn      = max(dot(bumpN, viewDir), 0.);
    float sunFacing = smoothstep(-0.15, 0.35, dot(vWorldNorm, lightDir));
    float fres     = pow(1. - vdn, 3.0) * sunFacing;
    // Night-side atmosphere also glows faintly (thermal emission)
    float nightFres = pow(1. - vdn, 4.0) * (1.0 - sunFacing) * 0.15;
    color += atmosCol * fres * atmosStr + atmosCol * nightFres * 0.10;

    color *= 1.0 - moonTransitShadow(vWorldPos) * 0.85;
    color = pow(max(color, vec3(0.001)), vec3(1./2.2));
    gl_FragColor = vec4(color, 1.0);
  }
`;
