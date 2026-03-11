/**
 * Ice Giant 2 — Methane World archetype.
 * Blue-green base, dramatic high-contrast banding, scattered bright white
 * methane cloud patches, active convective plumes.
 */

import { PLANET_NOISE, MOON_SHADOW_GLSL } from "../planetNoise";

const HEIGHT_FN = /* glsl */ `
  float typeHeight(vec3 p, vec3 seed3, float seed) {
    return sin(p.y * 14.0) * 0.009 + fbm(p * 3.0 + seed3) * 0.005;
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

    // ── Dramatic high-contrast bands ──
    float wind = fbm(p * 2.2 + seed3) * 0.12;
    float dLat = lat + wind;
    float b1 = sin(dLat * 16.0 + uTime * 0.018) * 0.5 + 0.5;
    float b2 = sin(dLat * 24.0 + uTime * 0.012 + 1.5) * 0.5 + 0.5;
    // Sharp band edges rather than smooth sinusoidal
    float sharpB1 = smoothstep(0.35, 0.65, b1);

    // ── Blue-green palette with high saturation ──
    float hShift = uHue * 0.25 + uSeed * 0.18;
    vec3 darkCyan = hsv(vec3(fract(0.52 + hShift), 0.60, 0.40));
    vec3 brightTeal = hsv(vec3(fract(0.50 + hShift), 0.50, 0.78));
    vec3 deepBlue = hsv(vec3(fract(0.56 + hShift), 0.55, 0.55));

    vec3 albedo = mix(darkCyan, brightTeal, sharpB1);
    albedo = mix(albedo, deepBlue, smoothstep(0.4, 0.8, b2) * 0.30);

    // ── Bright white methane clouds — scattered patches ──
    float mc1 = fbm(p * 6.0 + seed3 * 1.5 + uTime * 0.008);
    float mc2 = fbm(p * 12.0 + seed3 * 2.7 - uTime * 0.005);
    float methaneMask1 = smoothstep(0.45, 0.72, mc1);
    float methaneMask2 = smoothstep(0.55, 0.78, mc2) * 0.6;
    vec3 methaneWhite = vec3(0.92, 0.94, 0.96);
    albedo = mix(albedo, methaneWhite, methaneMask1 * 0.45);
    albedo = mix(albedo, methaneWhite, methaneMask2 * 0.30);

    // ── Convective plumes — bright elongated features along bands ──
    for(int i = 0; i < 3; i++){
      float pLat = -0.4 + float(i) * 0.35 + fract(uSeed * (6.1 + float(i))) * 0.1;
      float pLon = fract(uSeed * (2.3 + float(i) * 3.1)) * 6.2832;
      float pdx = lon - pLon;
      pdx = pdx - 6.2832 * floor(pdx / 6.2832 + 0.5);
      // Elongated along longitude
      float pDist = length(vec2(pdx * 1.2, (lat - pLat) * 5.0));
      float pMask = smoothstep(0.40, 0.08, pDist);
      albedo = mix(albedo, methaneWhite, pMask * 0.55);
    }

    // ── Moderate polar darkening ──
    albedo *= 1.0 - smoothstep(0.60, 0.92, abs(lat)) * 0.30;

    // ── Diffuse ──
    vec3 color = albedo * NdotL;

    // ── Specular ──
    vec3 halfV = normalize(lightDir + viewDir);
    float spec = pow(max(dot(bumpN, halfV), 0.), 22.0);
    color += vec3(0.88, 0.93, 0.98) * spec * 0.18 * day;

    // ── Atmosphere Fresnel — cyan-green ──
    vec3  atmosCol = hsv(vec3(fract(0.50 + hShift), 0.45, 0.90));
    float atmosStr = 0.36 * (1.0 - uHasRing * 0.55);
    float vdn      = max(dot(bumpN, viewDir), 0.);
    float sunFacing = smoothstep(-0.15, 0.35, dot(vWorldNorm, lightDir));
    float fres     = pow(1. - vdn, 3.5) * sunFacing;
    color += atmosCol * fres * atmosStr;

    color *= 1.0 - moonTransitShadow(vWorldPos) * 0.85;
    color = pow(max(color, vec3(0.001)), vec3(1./2.2));
    gl_FragColor = vec4(color, 1.0);
  }
`;
