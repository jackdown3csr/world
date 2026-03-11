/**
 * Protoplanetary 1 — Green-Red Chaotic variant.
 * No clear spiral structure — instead chaotic fragmented accretion.
 * Green-tinted nebular gas, numerous red-hot impact spots,
 * asymmetric bright patches, turbulent knots.
 * Highly irregular shape — maximally asymmetric accretion.
 */

import { PLANET_NOISE, MOON_SHADOW_GLSL } from "../planetNoise";

const HEIGHT_FN = /* glsl */ `
  float typeHeight(vec3 p, vec3 seed3, float seed) {
    // Very large-scale asymmetric mass concentration — chaotic accretion
    float h = fbm(p * 0.6 + seed3 * 0.7) * 0.28;
    // Mid-frequency bulges and dents
    h += fbm(p * 3.0 + seed3) * 0.08;
    // Fine chaotic texture
    h += snoise(p * 7.0 + seed3.zxy) * 0.04;
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
    float lon  = atan(p.z, p.x);
    vec3 seed3 = vec3(uSeed*13.7, uSeed*7.3, uSeed*5.1);

    vec3 lightDir = normalize(uStarPos - vWorldPos);
    vec3 viewDir  = normalize(cameraPosition - vWorldPos);

    float NdotL_raw = dot(vWorldNorm, lightDir);
    float day       = smoothstep(-0.15, 0.15, NdotL_raw);
    float NdotL     = max(NdotL_raw, 0.);

    // ── Chaotic multi-scale turbulence (no organized spirals) ──
    float tDrift = uTime * 0.035;
    vec3 tp = p + vec3(sin(tDrift * 0.61) * 0.10, cos(tDrift * 0.43) * 0.10, sin(tDrift * 0.29) * 0.10);
    float turb1 = fbm(tp * 2.5 + seed3);
    float turb2 = fbm(tp * 6.0 + seed3.yzx + vec3(2.3, 4.7, 1.1));
    float turb3 = fbm(tp * 12.0 + seed3.zxy + vec3(7.1, 0.3, 5.9));
    float turb  = turb1 * 0.50 + turb2 * 0.35 + turb3 * 0.15;

    // ── Fragmented accretion knots (FBM-distorted, non-circular) ──
    float knots = 0.0;
    for(int i = 0; i < 5; i++){
      float fi = float(i);
      vec3 kCenter = normalize(vec3(
        sin(uSeed * 21.3 + fi * 47.7),
        cos(uSeed * 37.1 + fi * 31.3) * 0.8,
        sin(uSeed * 63.9 + fi * 19.1)
      ));
      float d = acos(clamp(dot(p, kCenter), -1.0, 1.0));
      // Distort angular distance with noise → irregular blobs, not circles
      d += fbm(p * 3.5 + seed3.yzx + vec3(fi * 5.3)) * 0.18;
      float r = 0.14 + fract(uSeed * 6.1 + fi * 0.53) * 0.20;
      knots += smoothstep(r, r * 0.20, d) * (0.6 + fract(fi * 0.37) * 0.4);
    }
    knots = clamp(knots, 0.0, 1.0);

    // ── Green-tinted nebular gas palette ──
    float hShift = uHue * 0.22 + uSeed * 0.15;
    vec3 gasDark  = hsv(vec3(fract(0.35 + hShift), 0.55, 0.28));
    vec3 gasMid   = hsv(vec3(fract(0.38 + hShift), 0.50, 0.50));
    vec3 gasLight = hsv(vec3(fract(0.42 + hShift), 0.35, 0.72));

    vec3 hotRed    = hsv(vec3(fract(0.01), 0.85, 0.80));
    vec3 hotYellow = hsv(vec3(fract(0.10), 0.75, 1.00));

    vec3 albedo = mix(gasDark, gasMid, smoothstep(0.30, 0.60, turb));
    albedo = mix(albedo, gasLight, smoothstep(0.55, 0.80, turb2) * 0.45);

    // ── Turbulent clump patches ──
    float clumpN = fbm(tp * 4.5 + seed3 * 2.0);
    float clumpMask = smoothstep(0.55, 0.70, clumpN) * 0.30;
    albedo = mix(albedo, gasDark * 0.5, clumpMask);

    // ── Hot accretion spots ──
    vec3 hotColor = mix(hotRed, hotYellow, smoothstep(0.5, 0.9, knots));
    albedo = mix(albedo, hotColor, knots * 0.80);

    // Irregular asymmetry (multi-scale FBM for patchy, non-uniform look)
    float asymm = fbm(p * 1.2 + seed3 * 0.5) * 0.4
                + fbm(p * 3.0 + seed3.zxy * 1.3) * 0.2 + 0.4;
    albedo *= clamp(asymm, 0.45, 1.0);

    // Irregular polar darkening (noise-modulated threshold)
    float polarThresh = 0.55 + fbm(p * 1.8 + seed3 * 1.7) * 0.25;
    albedo *= mix(1.0, 0.55, smoothstep(polarThresh, polarThresh + 0.30, abs(lat)));

    // ── Self-lit core + accretion emission ──
    float coreMask = 1.0 - smoothstep(0.0, 0.65, length(p.xz));
    vec3 coreGlow  = hsv(vec3(fract(0.08), 0.70, 1.0));

    float selfLit = 0.18 + knots * 0.60 + coreMask * 0.15;
    float diffuse = max(NdotL * 0.70, selfLit);
    vec3 color = albedo * diffuse;

    color += hotColor * knots * 0.55;
    color += coreGlow * coreMask * 0.12;

    // ── Haze rim ──
    float vdn = max(dot(vWorldNorm, viewDir), 0.0);
    float rim = pow(1.0 - vdn, 2.5);
    vec3 hazeLit   = hsv(vec3(fract(0.38 + hShift), 0.40, 0.92));
    vec3 hazeNight = hsv(vec3(fract(0.05), 0.65, 0.85));
    color += mix(hazeNight, hazeLit, day) * rim * 0.30;

    vec3 halfV = normalize(lightDir + viewDir);
    float spec = pow(max(dot(vWorldNorm, halfV), 0.0), 10.0);
    color += vec3(0.85, 0.92, 0.80) * spec * 0.12 * day;

    color *= 1.0 - moonTransitShadow(vWorldPos) * 0.75;
    color = pow(max(color, vec3(0.0)), vec3(1.0 / 2.2));
    gl_FragColor = vec4(color, 1.0);
  }
`;
