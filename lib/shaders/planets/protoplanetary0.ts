/**
 * Protoplanetary 0 — Blue-Purple Spiral variant.
 * Young accreting world: dominant logarithmic spiral arms,
 * blue-purple gas, hot orange/white accretion shock spots,
 * strong core glow, turbulent haze.
 * Lumpy asymmetric shape — still forming, not yet spherical.
 */

import { PLANET_NOISE, MOON_SHADOW_GLSL } from "../planetNoise";

const HEIGHT_FN = /* glsl */ `
  float typeHeight(vec3 p, vec3 seed3, float seed) {
    // Large-scale asymmetric lumpiness — this body is still accreting
    float h = fbm(p * 0.8 + seed3 * 0.5) * 0.22;
    // Mid-frequency surface undulation
    h += fbm(p * 2.2 + seed3) * 0.10;
    // Fine turbulent detail
    h += snoise(p * 5.0 + seed3.yzx) * 0.04;
    return h;
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
    vec3 displaced = position + normal * h * rad * 0.030;
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

    float NdotL_raw = dot(vWorldNorm, lightDir);
    float day       = smoothstep(-0.15, 0.15, NdotL_raw);
    float NdotL     = max(NdotL_raw, 0.);

    // ── Organic spiral arms (FBM-distorted longitude) ──
    float lon   = atan(p.z, p.x);
    float rPole = length(p.xz);
    // Distort longitude with noise so arms aren't perfectly mathematical
    float lonWarp = fbm(p * 2.5 + seed3 * 0.3) * 1.2;
    float warpedLon = lon + lonWarp;
    // Vary arm width with noise
    float armWidth = 4.0 + fbm(p * 1.8 + seed3.zxy) * 2.0;
    float spiral1 = sin(warpedLon * 2.0 + log(max(rPole, 0.01) * 8.0 + 1.0) * armWidth
                        + uTime * 0.055 + uSeed * 6.28) * 0.5 + 0.5;
    float spiral2 = sin(warpedLon * 2.0 + log(max(rPole, 0.01) * 8.0 + 1.0) * armWidth
                        + uTime * 0.055 + uSeed * 6.28 + 3.14159) * 0.5 + 0.5;
    float armMask = smoothstep(0.0, 0.50, rPole) * smoothstep(1.0, 0.70, rPole);
    float armStr  = max(spiral1, spiral2) * armMask;

    // ── Chaotic turbulence ──
    float tDrift = uTime * 0.028;
    vec3 tp = p + vec3(sin(tDrift * 0.71) * 0.08, cos(tDrift * 0.53) * 0.08, sin(tDrift * 0.37) * 0.08);
    float turb1 = fbm(tp * 3.0 + seed3);
    float turb2 = fbm(tp * 7.0 + seed3.yzx + vec3(1.7, 3.1, 5.3));
    float turb  = turb1 * 0.60 + turb2 * 0.40;

    // ── Accretion shocks (elongated along spiral arms) ──
    float shocked = 0.0;
    for(int i = 0; i < 3; i++){
      float fi = float(i);
      vec3 hotC = normalize(vec3(
        sin(uSeed*31.7 + fi*57.3),
        cos(uSeed*19.3 + fi*43.1) * 0.6,
        sin(uSeed*53.9 + fi*81.7)
      ));
      float d = acos(clamp(dot(p, hotC), -1.0, 1.0));
      // Distort distance with noise → non-circular blobs
      d += fbm(p * 4.0 + seed3 + vec3(fi * 3.7)) * 0.15;
      float r = 0.20 + fract(uSeed * 4.7 + fi * 0.37) * 0.25;
      // Elongate along spiral arm direction
      float armBoost = armStr * 0.35;
      shocked += smoothstep(r + armBoost, r * 0.25, d);
    }
    shocked = clamp(shocked, 0.0, 1.0);

    // ── Blue-purple palette ──
    float hShift = uHue * 0.22 + uSeed * 0.15;
    vec3 gasCool  = hsv(vec3(fract(0.68 + hShift), 0.72, 0.35));
    vec3 gasMid   = hsv(vec3(fract(0.62 + hShift), 0.60, 0.62));
    vec3 gasLight = hsv(vec3(fract(0.75 + hShift), 0.45, 0.80));
    vec3 shockHot = hsv(vec3(fract(0.12), 0.80, 1.00));
    vec3 shockMid = hsv(vec3(fract(0.08), 0.88, 0.88));
    vec3 armColor = hsv(vec3(fract(0.58 + hShift), 0.55, 0.75));

    vec3 albedo = mix(gasCool, gasMid, smoothstep(0.35, 0.65, turb));
    albedo = mix(albedo, gasLight, smoothstep(0.62, 0.85, turb2) * 0.40);
    albedo = mix(albedo, armColor, armStr * 0.55);

    vec3 shockColor = mix(shockMid, shockHot, smoothstep(0.5, 1.0, shocked));
    albedo = mix(albedo, shockColor, shocked * 0.75);

    // Irregular polar darkening (FBM-modulated threshold)
    float polarThresh = 0.50 + fbm(p * 1.5 + seed3 * 1.3) * 0.25;
    albedo *= mix(1.0, 0.55, smoothstep(polarThresh, polarThresh + 0.35, abs(lat)));

    // ── Self-lit core glow ──
    float coreMask = 1.0 - smoothstep(0.0, 0.7, length(p.xz));
    vec3 coreGlow  = hsv(vec3(fract(0.10), 0.65, 1.0));

    float selfLit = 0.22 + shocked * 0.55 + coreMask * 0.18;
    float diffuse = max(NdotL * 0.75, selfLit);
    vec3 color = albedo * diffuse;

    color += shockColor * shocked * 0.65;
    color += coreGlow * coreMask * 0.15;

    // ── Haze rim ──
    float vdn = max(dot(vWorldNorm, viewDir), 0.0);
    float rim = pow(1.0 - vdn, 2.5);
    vec3 hazeLit   = hsv(vec3(fract(0.62 + hShift), 0.55, 0.95));
    vec3 hazeNight = hsv(vec3(fract(0.10), 0.70, 0.90));
    color += mix(hazeNight, hazeLit, day) * rim * 0.35;

    vec3 halfV = normalize(lightDir + viewDir);
    float spec = pow(max(dot(vWorldNorm, halfV), 0.0), 12.0);
    color += vec3(0.80, 0.85, 1.0) * spec * 0.14 * day;

    color *= 1.0 - moonTransitShadow(vWorldPos) * 0.75;
    color = pow(max(color, vec3(0.0)), vec3(1.0 / 2.2));
    gl_FragColor = vec4(color, 1.0);
  }
`;
