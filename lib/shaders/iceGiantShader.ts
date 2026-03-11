/**
 * Ice-giant planet shader (rank 5–8).
 * Neptune/Uranus-like: deep blue to teal bands, storm spots, polar aurora.
 */

import { PLANET_NOISE, MOON_SHADOW_GLSL } from "./planetNoise";

/* ── Height function ──────────────────────────────────────── */

const HEIGHT_FN = /* glsl */ `
  float typeHeight(vec3 p, vec3 seed3, float seed) {
    return snoise(p * 3.0 + seed3) * 0.04;
  }
`;

/* ── Vertex shader ──────────────────────────────────────────── */

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

    vec3 displaced = position + normal * h * rad * 0.004;

    vPos       = position;
    vec4 wp    = modelMatrix * vec4(displaced, 1.0);
    vWorldPos  = wp.xyz;
    vWorldNorm = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

/* ── Fragment shader ────────────────────────────────────────── */

export const FRAG = /* glsl */ `
  uniform vec3  uStarPos;
  uniform float uHue;
  uniform float uSeed;
  uniform float uTime;
  uniform float uVariant;
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

    // ── Lighting ─────────────────────────────────────────
    vec3 lightDir = normalize(uStarPos - vWorldPos);
    vec3 viewDir  = normalize(cameraPosition - vWorldPos);

    // ── Bump normals ─────────────────────────────────────
    float eps  = 0.02;
    float h0   = typeHeight(p, seed3, uSeed);
    float hx   = typeHeight(normalize(p + vec3(eps,0.,0.)), seed3, uSeed);
    float hy   = typeHeight(normalize(p + vec3(0.,eps,0.)), seed3, uSeed);
    vec3 grad  = vec3(hx-h0, hy-h0, 0.) / eps;
    vec3 bumpN = normalize(vWorldNorm + grad * 0.12);

    float NdotL_raw = dot(bumpN, lightDir);
    float day       = smoothstep(-0.08, 0.08, NdotL_raw);
    float NdotL     = max(NdotL_raw, 0.);

    // ── Archetype selection ──────────────────────────────
    // 4 distinct ice giant looks driven by uVariant:
    //   < 0.25 : Classic Neptune — vivid blue, active bands, dark spot, companion clouds
    //   < 0.50 : Uranus — teal-green, very smooth, faint bands, pale polar collar
    //   < 0.75 : Methane World — blue-green, high-contrast cloud layers, bright polar cap
    //   >= 0.75: Purple Ice — purple-magenta tint, moderate banding, chain of small storms

    float bandFreq, windStr, stormSize, auroraStr, polarBright;
    float hB, satB;
    vec3 deep, mid, brite, stC2;

    if (uVariant < 0.25) {
      // Classic Neptune
      bandFreq   = 8.0 + uSeed * 5.0;
      windStr    = 0.22;
      stormSize  = 0.22 + uSeed * 0.06;
      auroraStr  = 0.30;
      polarBright = 0.10;
      hB   = 0.60 + uHue * 0.08;
      satB = 0.90;
      deep  = hsv(vec3(hB,       satB,      0.22));
      mid   = hsv(vec3(hB + 0.03, satB * 0.9, 0.48));
      brite = hsv(vec3(hB + 0.06, satB * 0.6, 0.72));
      stC2  = hsv(vec3(hB + 0.08, 0.40,      0.88));
    } else if (uVariant < 0.50) {
      // Uranus — smooth, teal
      bandFreq   = 3.0 + uSeed * 2.0;
      windStr    = 0.08;
      stormSize  = 0.06 + uSeed * 0.03;
      auroraStr  = 0.12;
      polarBright = 0.25;
      hB   = 0.48 + uHue * 0.10;
      satB = 0.52;
      deep  = hsv(vec3(hB,       satB,      0.38));
      mid   = hsv(vec3(hB + 0.02, satB * 0.8, 0.56));
      brite = hsv(vec3(hB + 0.04, satB * 0.5, 0.76));
      stC2  = hsv(vec3(hB + 0.05, 0.28,      0.84));
    } else if (uVariant < 0.75) {
      // Methane World — blue-green, high contrast
      bandFreq   = 12.0 + uSeed * 4.0;
      windStr    = 0.18;
      stormSize  = 0.12 + uSeed * 0.04;
      auroraStr  = 0.20;
      polarBright = 0.35;
      hB   = 0.52 + uHue * 0.09;
      satB = 0.75;
      deep  = hsv(vec3(hB,       satB,      0.18));
      mid   = hsv(vec3(hB + 0.05, satB * 0.85, 0.42));
      brite = hsv(vec3(hB + 0.10, satB * 0.5,  0.78));
      stC2  = hsv(vec3(hB + 0.08, 0.35,       0.90));
    } else {
      // Purple Ice Giant
      bandFreq   = 7.0 + uSeed * 3.0;
      windStr    = 0.20;
      stormSize  = 0.10 + uSeed * 0.04;
      auroraStr  = 0.50;
      polarBright = 0.15;
      hB   = 0.74 + uHue * 0.08;
      satB = 0.70;
      deep  = hsv(vec3(hB,       satB,      0.24));
      mid   = hsv(vec3(hB - 0.03, satB * 0.85, 0.46));
      brite = hsv(vec3(hB - 0.06, satB * 0.55, 0.70));
      stC2  = hsv(vec3(hB - 0.04, 0.42,       0.85));
    }

    // ── Albedo: banded atmosphere ────────────────────────
    float warp = fbm(p * 1.5 + seed3) * windStr;
    float dLat = lat + warp;

    float b1 = sin(dLat * bandFreq          + uTime * 0.06) * 0.5 + 0.5;
    float b2 = sin(dLat * bandFreq * 2.1    + uTime * 0.11 + uSeed * 3.14) * 0.5 + 0.5;

    // Storm spot — size varies by archetype
    float sLat = 0.22 + (fract(uSeed * 7.7) - 0.5) * 0.18;
    float sLon = fract(uSeed * 11.3) * 6.2832;
    vec3 sC   = vec3(cos(sLat) * cos(sLon), sin(sLat), cos(sLat) * sin(sLon));
    float sM  = smoothstep(stormSize + 0.08, stormSize * 0.3, length(p - normalize(sC)));

    // Chain of small storms for Purple Ice Giant
    float chainM = 0.0;
    if (uVariant >= 0.75) {
      for (int i = 0; i < 3; i++) {
        float fi = float(i);
        float cLat2 = -0.15 + fi * 0.15;
        float cLon2 = fract(uSeed * (5.3 + fi * 3.7)) * 6.2832;
        vec3 cC2 = vec3(cos(cLat2) * cos(cLon2), sin(cLat2), cos(cLat2) * sin(cLon2));
        chainM += smoothstep(0.10, 0.03, length(p - normalize(cC2)));
      }
      chainM = min(chainM, 1.0);
    }

    // Companion cloud for Neptune archetype
    float compM = 0.0;
    if (uVariant < 0.25) {
      float cLat3 = sLat + 0.12;
      float cLon3 = sLon + 0.3;
      vec3 cC3 = vec3(cos(cLat3) * cos(cLon3), sin(cLat3), cos(cLat3) * sin(cLon3));
      compM = smoothstep(0.08, 0.02, length(p - normalize(cC3)));
    }

    vec3 albedo = mix(deep, mid,   smoothstep(0.3, 0.7, b1));
    albedo = mix(albedo, brite, smoothstep(0.6, 0.9, b2) * 0.4);
    albedo = mix(albedo, stC2,  sM);
    albedo = mix(albedo, stC2,  chainM * 0.7);
    albedo = mix(albedo, vec3(0.92, 0.94, 0.98), compM * 0.8);
    // Polar region — brightening or color shift
    float polarMix = smoothstep(0.58, 0.92, abs(lat));
    albedo = mix(albedo, hsv(vec3(hB - 0.03, satB * 0.4, 0.55 + polarBright)), polarMix);

    // ── Diffuse ──────────────────────────────────────────
    vec3 color = albedo * NdotL;

    // ── Specular ─────────────────────────────────────────
    vec3 halfV = normalize(lightDir+viewDir);
    float spec = pow(max(dot(bumpN,halfV),0.), 48.0);
    color += vec3(1.,0.97,0.88) * spec * 0.30 * day;

    // ── Polar aurora ─────────────────────────────────────
    float aLat   = abs(lat);
    float aMask  = smoothstep(0.72, 0.88, aLat) * smoothstep(0.98, 0.90, aLat);
    float aWave  = sin(p.x*18.0 + uTime*0.5 + uSeed*30.0)*0.5+0.5;
    float aurora = aMask * aWave * auroraStr * day;
    vec3 aCol    = uVariant >= 0.75
      ? mix(vec3(0.6,0.1,0.9), vec3(0.9,0.2,0.5), aWave)   // purple variant → pink/violet aurora
      : mix(vec3(0.2,0.4,1.0), vec3(0.5,0.1,0.8), aWave);
    color += aCol * aurora;

    // ── Atmosphere Fresnel rim ───────────────────────────
    vec3  atmosCol  = hsv(vec3(hB+0.02, 0.72, 0.94));
    float atmosStr  = 0.65;
    float vdn       = max(dot(bumpN, viewDir), 0.);
    float sunFacing = smoothstep(-0.15, 0.35, dot(vWorldNorm, lightDir));
    float fres      = pow(1.-vdn, 3.5) * sunFacing;
    float hazeStr   = pow(1.-vdn, 1.2) * smoothstep(0.0, 0.6, dot(vWorldNorm, lightDir));
    color += atmosCol * (fres*0.9 + hazeStr*0.35) * atmosStr;

    // ── Moon transit shadows ──────────────────────────────
    color *= 1.0 - moonTransitShadow(vWorldPos) * 0.85;

    // ── Gamma ────────────────────────────────────────────
    color = pow(max(color,vec3(0.001)), vec3(1./2.2));
    gl_FragColor = vec4(color, 1.0);
  }
`;
