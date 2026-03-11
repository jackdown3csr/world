/**
 * Terrestrial 4 — Ice Age archetype.
 * Frozen world: massive polar ice caps extending to mid-latitudes,
 * grey-green tundra, partially frozen seas, thin cloud wisps.
 */

import { PLANET_NOISE, MOON_SHADOW_GLSL } from "../planetNoise";

const HEIGHT_FN = /* glsl */ `
  float typeHeight(vec3 p, vec3 seed3, float seed) {
    float t = fbm(p * 2.0 + seed3) * 0.5 + fbm(p * 4.5 + seed3 * 1.4) * 0.3;
    return t * 0.05;
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
    vec3 bumpN = normalize(vWorldNorm + grad * 0.5);

    float NdotL_raw = dot(bumpN, lightDir);
    float day       = smoothstep(-0.08, 0.08, NdotL_raw);
    float NdotL     = max(NdotL_raw, 0.);

    // ── Partially frozen seas ──
    float seaLevel = 0.022;
    float land = smoothstep(seaLevel - 0.003, seaLevel + 0.003, h0);

    float hShift = uHue * 0.25 + uSeed * 0.18;
    vec3 coldSea   = hsv(vec3(fract(0.58 + hShift), 0.42, 0.32)); // dark cold
    vec3 frozenSea = hsv(vec3(fract(0.55 + hShift), 0.15, 0.72)); // ice

    // Sea freezes at higher latitudes
    float seaFreeze = smoothstep(0.35, 0.60, abs(lat));
    vec3 ocean = mix(coldSea, frozenSea, seaFreeze);

    // ── Frozen terrain zones ──
    float alt = smoothstep(seaLevel, 0.05, h0);
    vec3 tundra   = hsv(vec3(fract(0.24 + hShift), 0.25, 0.48));  // grey-green
    vec3 barren   = hsv(vec3(fract(0.15 + hShift), 0.18, 0.45));  // cold grey
    vec3 snowPeak = hsv(vec3(fract(0.55 + hShift), 0.08, 0.88));  // snow
    vec3 softGreen = hsv(vec3(fract(0.28 + hShift), 0.35, 0.50)); // equatorial

    vec3 landCol = mix(tundra, barren, smoothstep(0.4, 0.7, alt));
    landCol = mix(landCol, snowPeak, smoothstep(0.7, 0.92, alt));
    // Narrow equatorial green belt (the only not-frozen zone)
    float eqBelt = smoothstep(0.28, 0.05, abs(lat)) * (1.0 - alt);
    landCol = mix(landCol, softGreen, eqBelt * 0.45);

    vec3 albedo = mix(ocean, landCol, land);

    // ── Massive ice caps extending to mid-latitudes ──
    float iceNoise = fbm(p * 4.0 + seed3 * 1.8) * 0.08;
    float iceLine  = 0.38 + iceNoise;  // ~38° latitude — very large caps
    float iceStrength = smoothstep(iceLine, iceLine + 0.20, abs(lat));
    vec3 glacierBlue = hsv(vec3(fract(0.55 + hShift), 0.18, 0.90));
    vec3 pureSnow    = vec3(0.92, 0.93, 0.96);
    vec3 iceCol = mix(glacierBlue, pureSnow, smoothstep(0.50, 0.85, abs(lat)));
    albedo = mix(albedo, iceCol, iceStrength * 0.85);

    // ── Glacier flow lines in ice caps ──
    float gFlow = fbm(vec3(lon * 5.0, lat * 15.0, uSeed + 3.0));
    float gMask = iceStrength * smoothstep(0.45, 0.65, gFlow) * 0.15;
    albedo = mix(albedo, glacierBlue * 0.7, gMask);

    // ── Thin cloud wisps ──
    float cloud = fbm(p * 5.0 + seed3 * 3.0 + uTime * 0.008);
    float cloudMask = smoothstep(0.52, 0.75, cloud) * 0.20;
    albedo = mix(albedo, vec3(0.92, 0.93, 0.95), cloudMask);

    // ── Diffuse ──
    vec3 color = albedo * NdotL;

    // ── Specular — ice is reflective ──
    vec3 halfV = normalize(lightDir + viewDir);
    float iceSpec = pow(max(dot(bumpN, halfV), 0.), 35.0);
    color += vec3(0.92, 0.94, 0.98) * iceSpec * iceStrength * 0.30 * day;
    float seaSpec = pow(max(dot(bumpN, halfV), 0.), 40.0);
    color += vec3(0.90, 0.92, 0.96) * seaSpec * (1.0 - land) * 0.25 * day;

    // ── Atmosphere Fresnel — cold pale blue ──
    vec3 atmosCol = hsv(vec3(fract(0.56 + hShift), 0.30, 0.88));
    float atmosStr = 0.32 * (1.0 - uHasRing * 0.55);
    float vdn      = max(dot(bumpN, viewDir), 0.);
    float sunFacing = smoothstep(-0.15, 0.35, dot(vWorldNorm, lightDir));
    float fres     = pow(1. - vdn, 3.5) * sunFacing;
    color += atmosCol * fres * atmosStr;

    color *= 1.0 - moonTransitShadow(vWorldPos) * 0.85;
    color = pow(max(color, vec3(0.001)), vec3(1./2.2));
    gl_FragColor = vec4(color, 1.0);
  }
`;
