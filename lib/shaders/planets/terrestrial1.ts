/**
 * Terrestrial 1 — Desert World archetype.
 * Mostly arid land: vast red-brown-tan deserts, small inland seas,
 * visible dust storm swirls, sparse high-altitude clouds.
 */

import { PLANET_NOISE, MOON_SHADOW_GLSL } from "../planetNoise";

const HEIGHT_FN = /* glsl */ `
  float typeHeight(vec3 p, vec3 seed3, float seed) {
    float t = fbm(p * 2.5 + seed3) * 0.5 + fbm(p * 6.0 + seed3 * 1.7) * 0.3;
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
    vec3 displaced = position + normal * h * rad * 0.014;
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

    // ── Small inland seas ──
    float seaLevel = 0.012;
    float land = smoothstep(seaLevel - 0.003, seaLevel + 0.003, h0);

    float hShift = uHue * 0.25 + uSeed * 0.18;
    vec3 seaCol = hsv(vec3(fract(0.55 + hShift), 0.50, 0.38));

    // ── Desert terrain zones ──
    float alt = smoothstep(seaLevel, 0.05, h0);
    vec3 sand      = hsv(vec3(fract(0.10 + hShift), 0.52, 0.78));  // bright sand
    vec3 redDust   = hsv(vec3(fract(0.05 + hShift), 0.58, 0.58));  // red-brown
    vec3 darkRock  = hsv(vec3(fract(0.07 + hShift), 0.35, 0.40));  // dark basalt
    vec3 saltFlat  = hsv(vec3(fract(0.12 + hShift), 0.15, 0.82));  // bright mineral

    // Mix terrain by altitude and noise
    float terrainNoise = fbm(p * 7.0 + seed3 * 2.0) * 0.5 + 0.5;
    vec3 landCol = mix(sand, redDust, smoothstep(0.3, 0.6, terrainNoise));
    landCol = mix(landCol, darkRock, smoothstep(0.7, 0.95, alt));
    // Scattered salt flats in low areas
    float saltMask = smoothstep(0.15, 0.05, alt) * smoothstep(0.55, 0.75, terrainNoise);
    landCol = mix(landCol, saltFlat, saltMask * 0.6);

    vec3 albedo = mix(seaCol, landCol, land);

    // ── Dust storms — large swirling features ──
    for(int i = 0; i < 2; i++){
      float dsLat = fract(uSeed * (4.3 + float(i) * 7.1)) * 0.8 - 0.4;
      float dsLon = fract(uSeed * (2.1 + float(i) * 3.9)) * 6.2832;
      float ddx = lon - dsLon + uTime * 0.008;
      ddx = ddx - 6.2832 * floor(ddx / 6.2832 + 0.5);
      float dDist = length(vec2(ddx * 1.6, (lat - dsLat) * 2.5));
      float dMask = smoothstep(0.55, 0.10, dDist) * land;
      // Swirl pattern
      float sAngle = atan(lat - dsLat, ddx) + dDist * 6.0;
      float swirl  = sin(sAngle * 2.0) * 0.5 + 0.5;
      vec3 dustCol = hsv(vec3(fract(0.08 + hShift), 0.38, 0.75));
      albedo = mix(albedo, dustCol, dMask * mix(0.3, 0.6, swirl));
    }

    // ── Sparse thin clouds ──
    float cloud = fbm(p * 5.0 + seed3 * 3.0 + uTime * 0.010);
    float cloudMask = smoothstep(0.55, 0.78, cloud) * 0.18;
    albedo = mix(albedo, vec3(0.92, 0.88, 0.82), cloudMask);

    // ── Very small polar frost ──
    float frost = smoothstep(0.82, 0.94, abs(lat));
    albedo = mix(albedo, vec3(0.88, 0.86, 0.82), frost * 0.50);

    // ── Diffuse ──
    vec3 color = albedo * NdotL;

    // ── Specular — mostly rough land, sea glint ──
    vec3 halfV = normalize(lightDir + viewDir);
    float spec = pow(max(dot(bumpN, halfV), 0.), 20.0);
    color += vec3(1., 0.95, 0.85) * spec * (1.0 - land) * 0.25 * day;
    float landSpec = pow(max(dot(bumpN, halfV), 0.), 8.0);
    color += vec3(0.95, 0.88, 0.75) * landSpec * land * 0.06 * day;

    // ── Atmosphere Fresnel — amber haze ──
    vec3 atmosCol = hsv(vec3(fract(0.08 + hShift), 0.40, 0.85));
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
