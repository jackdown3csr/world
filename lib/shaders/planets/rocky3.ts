/**
 * Rocky 3 — Sandy Asteroid archetype.
 * Tan/beige, extremely cratered rubble-pile surface, shallow frost in
 * crater shadows, fine regolith texture, no atmosphere.
 */

import { PLANET_NOISE, MOON_SHADOW_GLSL } from "../planetNoise";

const HEIGHT_FN = /* glsl */ `
  float typeHeight(vec3 p, vec3 seed3, float seed) {
    float base = fbm(p * 2.5 + seed3) * 0.35;
    float fine = fbm(p * 10.0 + seed3 * 2.5) * 0.15;
    float c1 = craters(p * 2.0 + seed3, seed, 0.25, 6) * 0.30;
    float c2 = craters(p * 6.0 + seed3 * 1.5, seed, 0.15, 4) * 0.15;
    return (base + fine - c1 - c2) * 0.08;
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
    vec3 displaced = position + normal * h * rad * 0.020;
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
    vec3 bumpN = normalize(vWorldNorm + grad * 1.4);

    float NdotL_raw = dot(bumpN, lightDir);
    float day       = smoothstep(-0.02, 0.02, NdotL_raw);
    float NdotL     = max(NdotL_raw, 0.);

    // ── Tan/beige regolith surface ──
    float hShift = uHue * 0.25 + uSeed * 0.18;
    vec3 tanBase   = hsv(vec3(fract(0.10 + hShift), 0.35, 0.60));
    vec3 beigeHigh = hsv(vec3(fract(0.12 + hShift), 0.28, 0.72));
    vec3 darkCrater = hsv(vec3(fract(0.08 + hShift), 0.30, 0.32));

    float alt = smoothstep(-0.02, 0.06, h0);
    vec3 albedo = mix(darkCrater, tanBase, smoothstep(0.15, 0.50, alt));
    albedo = mix(albedo, beigeHigh, smoothstep(0.60, 0.90, alt));

    // ── Fine regolith texture ──
    float regolith = fbm(p * 18.0 + seed3 * 4.0);
    albedo *= 0.90 + regolith * 0.20;

    // ── Deep crater shadows ──
    float craterShadow = smoothstep(0.01, -0.01, h0);
    albedo *= 1.0 - craterShadow * 0.40;

    // ── Shallow frost in permanently shadowed craters near poles ──
    float polarFrost = smoothstep(0.55, 0.80, abs(lat)) * craterShadow;
    vec3 frostCol = vec3(0.82, 0.84, 0.88);
    albedo = mix(albedo, frostCol, polarFrost * 0.50);

    // ── Bright ejecta blankets ──
    float ejecta = fbm(p * 12.0 + seed3 * 3.0);
    float ejNear = smoothstep(0.0, 0.02, h0) * smoothstep(0.05, 0.02, h0);
    float ejMask = smoothstep(0.55, 0.72, ejecta) * ejNear;
    albedo = mix(albedo, beigeHigh * 1.2, ejMask * 0.35);

    // ── Diffuse — hard shadows, no atmosphere ──
    vec3 color = albedo * NdotL;

    // ── Specular — dusty rock, very low ──
    vec3 halfV = normalize(lightDir + viewDir);
    float spec = pow(max(dot(bumpN, halfV), 0.), 10.0);
    color += vec3(0.88, 0.85, 0.78) * spec * 0.06 * day;

    // ── No atmosphere ──
    float vdn = max(dot(bumpN, viewDir), 0.);
    float faintRim = pow(1.0 - vdn, 6.0) * 0.015;
    color += vec3(0.6, 0.6, 0.6) * faintRim * day;

    color *= 1.0 - moonTransitShadow(vWorldPos) * 0.85;
    color = pow(max(color, vec3(0.001)), vec3(1./2.2));
    gl_FragColor = vec4(color, 1.0);
  }
`;
