/**
 * Ice Giant 3 — Purple Ice archetype.
 * Purple-magenta dominant hue, equatorial chain of small cyclonic storms,
 * vivid auroral bands near poles, moderate banding with wavy disruptions.
 */

import { PLANET_NOISE, MOON_SHADOW_GLSL } from "../planetNoise";

const HEIGHT_FN = /* glsl */ `
  float typeHeight(vec3 p, vec3 seed3, float seed) {
    return sin(p.y * 11.0) * 0.007 + fbm(p * 4.0 + seed3) * 0.004;
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

    // ── Moderate banding with wavy disruptions ──
    float wind = fbm(p * 2.0 + seed3) * 0.14;
    float wav  = sin(lon * 7.0 + lat * 4.0 + uTime * 0.03) * 0.03;
    float dLat = lat + wind + wav;
    float b1 = sin(dLat * 13.0 + uTime * 0.014) * 0.5 + 0.5;
    float b2 = sin(dLat * 20.0 + uTime * 0.022 + 2.3) * 0.5 + 0.5;

    // ── Purple-magenta palette ──
    float hShift = uHue * 0.25 + uSeed * 0.18;
    vec3 deepPurple = hsv(vec3(fract(0.78 + hShift), 0.55, 0.55));
    vec3 magenta    = hsv(vec3(fract(0.82 + hShift), 0.48, 0.72));
    vec3 lavender   = hsv(vec3(fract(0.76 + hShift), 0.30, 0.86));

    vec3 albedo = mix(deepPurple, magenta, smoothstep(0.30, 0.70, b1));
    albedo = mix(albedo, lavender, smoothstep(0.50, 0.80, b2) * 0.30);

    // ── Equatorial chain of small cyclonic storms ──
    float eqBand = smoothstep(0.25, 0.0, abs(lat));
    for(int i = 0; i < 6; i++){
      float sLon = float(i) * 1.047 + fract(uSeed * (3.7 + float(i))) * 0.4;
      float sdx = lon - sLon;
      sdx = sdx - 6.2832 * floor(sdx / 6.2832 + 0.5);
      float sDist = length(vec2(sdx * 3.5, lat * 5.5));
      float sMask = smoothstep(0.30, 0.05, sDist) * eqBand;
      // Tiny swirl inside each
      float sAngle = atan(lat, sdx) + sDist * 12.0 - uTime * 0.08;
      float sw = sin(sAngle * 2.5) * 0.5 + 0.5;
      vec3 stormCol = mix(deepPurple * 0.88, lavender, sw * 0.55);
      albedo = mix(albedo, stormCol, sMask * 0.60);
    }

    // ── Vivid aurora near poles (FBM-distorted, pushed to true caps) ──
    float aurN = smoothstep(0.82, 0.96, lat);
    float aurS = smoothstep(0.82, 0.96, -lat);
    float aurNoise = fbm(p * 3.0 + seed3 + vec3(uTime * 0.006, 0., 0.));
    float aurFlicker = sin(lon * 4.0 + uTime * 0.25 + aurNoise * 2.5) * 0.5 + 0.5;
    vec3 auroraNorth = hsv(vec3(fract(0.72 + hShift), 0.65, 0.90));
    vec3 auroraSouth = hsv(vec3(fract(0.85 + hShift), 0.60, 0.85));
    // Curtain-like intensity variation
    float curtain = smoothstep(0.2, 0.8, aurFlicker);
    albedo += auroraNorth * aurN * curtain * 0.20;
    albedo += auroraSouth * aurS * (1.0 - curtain) * 0.16;

    // ── Mild polar darkening (partly offset by aurora) ──
    albedo *= 1.0 - smoothstep(0.75, 0.96, abs(lat)) * 0.20;

    // ── Diffuse ──
    vec3 color = albedo * NdotL;

    // ── Aurora self-emission on dark side ──
    float aurSelf = (aurN + aurS) * 0.08 * curtain;
    color += auroraNorth * aurN * aurSelf * (1.0 - day);
    color += auroraSouth * aurS * aurSelf * (1.0 - day);

    // ── Specular ──
    vec3 halfV = normalize(lightDir + viewDir);
    float spec = pow(max(dot(bumpN, halfV), 0.), 24.0);
    color += vec3(0.92, 0.85, 0.98) * spec * 0.16 * day;

    // ── Atmosphere Fresnel — purple-pink ──
    vec3  atmosCol = hsv(vec3(fract(0.80 + hShift), 0.45, 0.90));
    float atmosStr = 0.38 * (1.0 - uHasRing * 0.55);
    float vdn      = max(dot(bumpN, viewDir), 0.);
    float sunFacing = smoothstep(-0.15, 0.35, dot(vWorldNorm, lightDir));
    float fres     = pow(1. - vdn, 3.5) * sunFacing;
    color += atmosCol * fres * atmosStr;

    color *= 1.0 - moonTransitShadow(vWorldPos) * 0.85;
    color = pow(max(color, vec3(0.001)), vec3(1./2.2));
    gl_FragColor = vec4(color, 1.0);
  }
`;
