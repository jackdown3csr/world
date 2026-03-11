/**
 * Rocky 0 — Mercury archetype.
 * Grey/silver, heavily cratered, no atmosphere, sharp terminator,
 * hot/cold gradient, subtle highland/lowland albedo variation.
 */

import { PLANET_NOISE, MOON_SHADOW_GLSL } from "../planetNoise";

const HEIGHT_FN = /* glsl */ `
  float typeHeight(vec3 p, vec3 seed3, float seed) {
    float base = fbm(p * 2.0 + seed3) * 0.4;
    float detail = fbm(p * 8.0 + seed3 * 2.0) * 0.2;
    float c = craters(p * 3.0 + seed3, seed, 0.25, 6) * 0.35;
    return (base + detail - c) * 0.07;
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
    vec3 displaced = position + normal * h * rad * 0.018;
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
    vec3 bumpN = normalize(vWorldNorm + grad * 1.2);

    float NdotL_raw = dot(bumpN, lightDir);
    // Sharp terminator — no atmosphere to soften it
    float day       = smoothstep(-0.02, 0.02, NdotL_raw);
    float NdotL     = max(NdotL_raw, 0.);

    // ── Grey/silver surface ──
    float hShift = uHue * 0.25 + uSeed * 0.18;
    vec3 highland = hsv(vec3(fract(0.08 + hShift), 0.06, 0.58));  // light grey
    vec3 lowland  = hsv(vec3(fract(0.06 + hShift), 0.10, 0.40));  // dark grey
    vec3 craterDark = hsv(vec3(fract(0.05 + hShift), 0.12, 0.28));// deep shadow

    float alt = smoothstep(0.01, 0.06, h0);
    vec3 albedo = mix(lowland, highland, alt);

    // ── Crater darkening (in the depressions) ──
    float craterDepth = smoothstep(0.03, 0.01, h0);
    albedo = mix(albedo, craterDark, craterDepth * 0.50);

    // ── Bright ray ejecta around fresh craters ──
    float ejecta = fbm(p * 14.0 + seed3 * 3.0);
    float ejMask = smoothstep(0.60, 0.75, ejecta) * craterDepth;
    albedo = mix(albedo, highland * 1.3, ejMask * 0.35);

    // ── Large dark "mare" basins (lava-filled lowlands) ──
    float mare = fbm(p * 1.5 + seed3 * 0.8);
    float mareMask = smoothstep(0.35, 0.25, mare) * smoothstep(0.03, 0.02, h0);
    vec3 mareCol = hsv(vec3(fract(0.06 + hShift), 0.14, 0.22));
    albedo = mix(albedo, mareCol, mareMask * 0.55);

    // ── Diffuse — sharp shadows, no ambient ──
    vec3 color = albedo * NdotL;

    // ── Specular — dry rock, low ──
    vec3 halfV = normalize(lightDir + viewDir);
    float spec = pow(max(dot(bumpN, halfV), 0.), 12.0);
    color += vec3(0.90, 0.88, 0.85) * spec * 0.08 * day;

    // ── No atmosphere (minimal rimlight) ──
    float vdn = max(dot(bumpN, viewDir), 0.);
    float faintRim = pow(1.0 - vdn, 5.0) * 0.03;
    color += vec3(0.7, 0.7, 0.75) * faintRim * day;

    color *= 1.0 - moonTransitShadow(vWorldPos) * 0.85;
    color = pow(max(color, vec3(0.001)), vec3(1./2.2));
    gl_FragColor = vec4(color, 1.0);
  }
`;
