/**
 * Ice Giant 0 — Neptune archetype.
 * Vivid deep blue, active dark spot (Great Dark Spot analog) with bright
 * companion clouds, moderate banding, blue-purple atmospheric rim.
 */

import { PLANET_NOISE, MOON_SHADOW_GLSL } from "../planetNoise";

const HEIGHT_FN = /* glsl */ `
  float typeHeight(vec3 p, vec3 seed3, float seed) {
    return sin(p.y * 10.0) * 0.008;
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
    vec3 bumpN = normalize(vWorldNorm + grad * 0.04);

    float NdotL_raw = dot(bumpN, lightDir);
    float day       = smoothstep(-0.08, 0.08, NdotL_raw);
    float NdotL     = max(NdotL_raw, 0.);

    // ── Moderate banding ──
    float wind = fbm(p * 1.8 + seed3) * 0.10;
    float dLat = lat + wind;
    float b1 = sin(dLat * 12.0 + uTime * 0.015) * 0.5 + 0.5;
    float b2 = sin(dLat * 20.0 + uTime * 0.008 + 2.0) * 0.5 + 0.5;

    // ── Deep blue palette ──
    float hShift = uHue * 0.25 + uSeed * 0.18;
    vec3 deep   = hsv(vec3(fract(0.62 + hShift), 0.65, 0.45));  // deep navy
    vec3 azure  = hsv(vec3(fract(0.60 + hShift), 0.55, 0.72));  // vivid blue
    vec3 bright = hsv(vec3(fract(0.58 + hShift), 0.35, 0.88));  // bright azure

    vec3 albedo = mix(deep, azure, smoothstep(0.30, 0.70, b1));
    albedo = mix(albedo, bright, smoothstep(0.55, 0.85, b2) * 0.25);

    // ── Great Dark Spot — oval dark storm with bright companion ──
    float gdsLat = -0.20 + fract(uSeed * 5.7) * 0.15;
    float gdsLon = fract(uSeed * 2.9) * 6.2832;
    float dx = lon - gdsLon;
    dx = dx - 6.2832 * floor(dx / 6.2832 + 0.5);
    float gdsDist = length(vec2(dx * 2.0, (lat - gdsLat) * 3.5));
    float gdsMask = smoothstep(0.40, 0.10, gdsDist);

    // Dark core
    vec3 darkSpot = hsv(vec3(fract(0.64 + hShift), 0.70, 0.18));
    albedo = mix(albedo, darkSpot, gdsMask * 0.75);

    // Bright companion cloud (offset south-east of the dark spot)
    float compDist = length(vec2((dx - 0.15) * 3.0, (lat - gdsLat + 0.10) * 6.0));
    float compMask = smoothstep(0.30, 0.04, compDist);
    albedo = mix(albedo, vec3(0.88, 0.90, 0.95), compMask * 0.70);

    // ── Secondary smaller dark spot ──
    float ds2Lat = 0.35 + fract(uSeed * 8.1) * 0.1;
    float ds2Lon = fract(uSeed * 4.3) * 6.2832;
    float dx2 = lon - ds2Lon;
    dx2 = dx2 - 6.2832 * floor(dx2 / 6.2832 + 0.5);
    float ds2Dist = length(vec2(dx2 * 3.0, (lat - ds2Lat) * 5.0));
    float ds2Mask = smoothstep(0.30, 0.06, ds2Dist);
    albedo = mix(albedo, darkSpot * 1.3, ds2Mask * 0.50);

    // ── Scattered high-altitude bright clouds ──
    float clouds = fbm(p * 8.0 + seed3 * 2.0 + uTime * 0.01);
    float cloudMask = smoothstep(0.42, 0.68, clouds) * 0.22;
    albedo = mix(albedo, vec3(0.90, 0.92, 0.96), cloudMask);

    // ── Polar darkening ──
    albedo *= 1.0 - smoothstep(0.65, 0.95, abs(lat)) * 0.35;

    // ── Diffuse ──
    vec3 color = albedo * NdotL;

    // ── Specular ──
    vec3 halfV = normalize(lightDir + viewDir);
    float spec = pow(max(dot(bumpN, halfV), 0.), 24.0);
    color += vec3(0.85, 0.90, 1.) * spec * 0.18 * day;

    // ── Atmosphere Fresnel — blue-purple ──
    vec3  atmosCol = hsv(vec3(fract(0.64 + hShift), 0.50, 0.90));
    float atmosStr = 0.40 * (1.0 - uHasRing * 0.55);
    float vdn      = max(dot(bumpN, viewDir), 0.);
    float sunFacing = smoothstep(-0.15, 0.35, dot(vWorldNorm, lightDir));
    float fres     = pow(1. - vdn, 3.5) * sunFacing;
    color += atmosCol * fres * atmosStr;

    color *= 1.0 - moonTransitShadow(vWorldPos) * 0.85;
    color = pow(max(color, vec3(0.001)), vec3(1./2.2));
    gl_FragColor = vec4(color, 1.0);
  }
`;
