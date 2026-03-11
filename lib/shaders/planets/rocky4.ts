/**
 * Rocky 4 — Icy Rock archetype.
 * Grey-blue, heavy frost/ice coverage, scattered craters, bright
 * cryovolcanic spots (like Ceres), faint sublimation haze.
 */

import { PLANET_NOISE, MOON_SHADOW_GLSL } from "../planetNoise";

const HEIGHT_FN = /* glsl */ `
  float typeHeight(vec3 p, vec3 seed3, float seed) {
    float base = fbm(p * 2.0 + seed3) * 0.40;
    float detail = fbm(p * 6.0 + seed3 * 1.8) * 0.20;
    float c = craters(p * 3.0 + seed3, seed, 0.22, 5) * 0.25;
    return (base + detail - c) * 0.06;
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
    float lon  = atan(p.z, p.x);
    vec3 seed3 = vec3(uSeed*13.7, uSeed*7.3, uSeed*5.1);

    vec3 lightDir = normalize(uStarPos - vWorldPos);
    vec3 viewDir  = normalize(cameraPosition - vWorldPos);

    float eps  = 0.02;
    float h0   = typeHeight(p, seed3, uSeed);
    float hx   = typeHeight(normalize(p + vec3(eps,0.,0.)), seed3, uSeed);
    float hy   = typeHeight(normalize(p + vec3(0.,eps,0.)), seed3, uSeed);
    vec3 grad  = vec3(hx-h0, hy-h0, 0.) / eps;
    vec3 bumpN = normalize(vWorldNorm + grad * 1.0);

    float NdotL_raw = dot(bumpN, lightDir);
    float day       = smoothstep(-0.03, 0.03, NdotL_raw);
    float NdotL     = max(NdotL_raw, 0.);

    // ── Grey-blue icy base ──
    float hShift = uHue * 0.25 + uSeed * 0.18;
    vec3 greyBlue = hsv(vec3(fract(0.58 + hShift), 0.20, 0.50));
    vec3 icyWhite = hsv(vec3(fract(0.56 + hShift), 0.10, 0.78));
    vec3 darkRock = hsv(vec3(fract(0.60 + hShift), 0.18, 0.30));

    float alt = smoothstep(0.0, 0.06, h0);
    vec3 albedo = mix(darkRock, greyBlue, smoothstep(0.15, 0.50, alt));
    albedo = mix(albedo, icyWhite, smoothstep(0.55, 0.85, alt));

    // ── Heavy frost coverage ──
    float frostN = fbm(p * 5.0 + seed3 * 2.0);
    float frostMask = smoothstep(0.30, 0.55, frostN);
    vec3 frostCol = hsv(vec3(fract(0.55 + hShift), 0.12, 0.82));
    albedo = mix(albedo, frostCol, frostMask * 0.50);

    // Even more frost near poles
    float polarFrost = smoothstep(0.40, 0.70, abs(lat));
    albedo = mix(albedo, icyWhite, polarFrost * 0.40);

    // ── Cryovolcanic bright spots ──
    // Like Ceres' Occator Crater — bright salt/ice deposits
    for(int i = 0; i < 5; i++){
      float sLat = fract(uSeed * (2.7 + float(i) * 3.3)) * 1.6 - 0.8;
      float sLon = fract(uSeed * (5.1 + float(i) * 2.1)) * 6.2832;
      float sdx = lon - sLon;
      sdx = sdx - 6.2832 * floor(sdx / 6.2832 + 0.5);
      float sDist = length(vec2(sdx * 4.0, (lat - sLat) * 5.0));
      float sMask = smoothstep(0.20, 0.02, sDist);
      // Extra bright core
      float sCore = smoothstep(0.08, 0.0, sDist);
      albedo = mix(albedo, vec3(0.92, 0.94, 0.96), sMask * 0.55);
      albedo = mix(albedo, vec3(0.98, 0.98, 1.0), sCore * 0.70);
    }

    // ── Crater darkening ──
    float craterDark = smoothstep(0.01, -0.005, h0);
    albedo *= 1.0 - craterDark * 0.30;

    // ── Diffuse ──
    vec3 color = albedo * NdotL;

    // ── Specular — icy surface, moderate shine ──
    vec3 halfV = normalize(lightDir + viewDir);
    float spec = pow(max(dot(bumpN, halfV), 0.), 28.0);
    color += vec3(0.90, 0.92, 0.98) * spec * 0.20 * day;

    // ── Faint sublimation haze ──
    vec3 atmosCol = hsv(vec3(fract(0.57 + hShift), 0.20, 0.80));
    float atmosStr = 0.08;
    float vdn      = max(dot(bumpN, viewDir), 0.);
    float sunFacing = smoothstep(-0.10, 0.30, dot(vWorldNorm, lightDir));
    float fres     = pow(1. - vdn, 4.5) * sunFacing;
    color += atmosCol * fres * atmosStr;

    color *= 1.0 - moonTransitShadow(vWorldPos) * 0.85;
    color = pow(max(color, vec3(0.001)), vec3(1./2.2));
    gl_FragColor = vec4(color, 1.0);
  }
`;
