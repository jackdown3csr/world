/**
 * Gas Giant 0 — Saturn archetype.
 * Wide soft gold/cream bands, hexagonal north-polar vortex,
 * ring-shadow equatorial band, thin elongated storm feature.
 */

import { PLANET_NOISE, MOON_SHADOW_GLSL } from "../planetNoise";

const HEIGHT_FN = /* glsl */ `
  float typeHeight(vec3 p, vec3 seed3, float seed) {
    return sin(p.y * 8.0) * 0.010;
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

    // ── Wide soft bands — Saturn has fewer, broader bands ──
    float wind = fbm(p * 1.2 + seed3) * 0.12;
    float dLat = lat + wind;
    float b1 = sin(dLat * 7.0  + uTime * 0.012) * 0.5 + 0.5;
    float b2 = sin(dLat * 11.0 + uTime * 0.020 + 1.7) * 0.5 + 0.5;

    // ── Colour palette: warm gold / cream / ivory ──
    float hShift = uHue * 0.25 + uSeed * 0.18;
    vec3 zone = hsv(vec3(fract(0.12 + hShift), 0.20, 0.94));   // cream
    vec3 belt = hsv(vec3(fract(0.10 + hShift), 0.42, 0.68));   // amber
    vec3 warm = hsv(vec3(fract(0.08 + hShift), 0.28, 0.82));   // light gold

    vec3 albedo = mix(belt, zone, smoothstep(0.30, 0.70, b1));
    albedo = mix(albedo, warm, smoothstep(0.50, 0.80, b2) * 0.30);

    // ── Hexagonal north-polar vortex ──
    // Standing Rossby wave produces a hexagonal pattern at ~78°N
    float nPole = smoothstep(0.75, 0.88, lat);
    float lon   = atan(p.z, p.x);
    float hex   = sin(lon * 3.0 + uTime * 0.04) * 0.5 + 0.5;
    float hexRing = smoothstep(0.78, 0.82, lat) * smoothstep(0.90, 0.86, lat);
    // Darken hexagonal boundary
    albedo = mix(albedo, hsv(vec3(fract(0.08 + hShift), 0.50, 0.35)),
                 hexRing * smoothstep(0.3, 0.7, hex) * 0.6);
    // Dark polar center
    albedo = mix(albedo, hsv(vec3(fract(0.06 + hShift), 0.55, 0.22)),
                 smoothstep(0.90, 0.96, lat) * 0.7);
    // Mild south polar darkening
    albedo *= 1.0 - smoothstep(0.70, 0.95, -lat) * 0.25;

    // ── Thin elongated storm (not a round GRS) ──
    float sLat = 0.32 + fract(uSeed * 5.1) * 0.1;
    float sLon = fract(uSeed * 9.3) * 6.2832;
    float dx = (lon - sLon);
    dx = dx - 6.2832 * floor(dx / 6.2832 + 0.5);
    float stormMask = smoothstep(0.35, 0.0, abs(dx) / 0.5)
                    * smoothstep(0.08, 0.0, abs(lat - sLat));
    albedo = mix(albedo, hsv(vec3(fract(0.09 + hShift), 0.48, 0.80)), stormMask * 0.5);

    // ── Ring-shadow equatorial band ──
    // Dark band where the ring casts shadow (visible between ±15°)
    float ringShadow = smoothstep(0.18, 0.04, abs(lat)) * 0.22;
    albedo *= 1.0 - ringShadow;

    // ── Diffuse ──
    vec3 color = albedo * NdotL;

    // ── Specular ──
    vec3 halfV = normalize(lightDir + viewDir);
    float spec = pow(max(dot(bumpN, halfV), 0.), 20.0);
    color += vec3(1., 0.96, 0.86) * spec * 0.18 * day;

    // ── Atmosphere Fresnel rim ──
    vec3  atmosCol = hsv(vec3(fract(0.11 + hShift), 0.35, 0.96));
    float atmosStr = 0.30 * (1.0 - uHasRing * 0.55);
    float vdn      = max(dot(bumpN, viewDir), 0.);
    float sunFacing = smoothstep(-0.15, 0.35, dot(vWorldNorm, lightDir));
    float fres     = pow(1. - vdn, 3.5) * sunFacing;
    color += atmosCol * fres * atmosStr;

    color *= 1.0 - moonTransitShadow(vWorldPos) * 0.85;
    color = pow(max(color, vec3(0.001)), vec3(1./2.2));
    gl_FragColor = vec4(color, 1.0);
  }
`;
