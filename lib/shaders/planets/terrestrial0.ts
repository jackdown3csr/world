/**
 * Terrestrial 0 — Super-Earth archetype.
 * Classic habitable world: green continents, blue oceans, white cloud cover,
 * polar ice caps, warm atmospheric glow.
 */

import { PLANET_NOISE, MOON_SHADOW_GLSL } from "../planetNoise";

const HEIGHT_FN = /* glsl */ `
  float typeHeight(vec3 p, vec3 seed3, float seed) {
    float cont = fbm(p * 2.0 + seed3) * 0.6 + fbm(p * 5.0 + seed3 * 1.3) * 0.3;
    return cont * 0.06;
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
    vec3 bumpN = normalize(vWorldNorm + grad * 0.6);

    float NdotL_raw = dot(bumpN, lightDir);
    float day       = smoothstep(-0.08, 0.08, NdotL_raw);
    float NdotL     = max(NdotL_raw, 0.);

    // ── Continent/ocean threshold ──
    float seaLevel = 0.028;
    float land = smoothstep(seaLevel - 0.004, seaLevel + 0.004, h0);

    // ── Ocean ──
    float hShift = uHue * 0.25 + uSeed * 0.18;
    vec3 deepSea = hsv(vec3(fract(0.60 + hShift), 0.65, 0.35));
    vec3 shallow = hsv(vec3(fract(0.55 + hShift), 0.50, 0.55));
    float depth  = smoothstep(0.005, seaLevel, h0);
    vec3 ocean   = mix(deepSea, shallow, depth);

    // ── Land biomes by latitude and altitude ──
    float alt = smoothstep(seaLevel, 0.06, h0); // 0=coast, 1=mountain
    vec3 lowland  = hsv(vec3(fract(0.28 + hShift), 0.55, 0.45)); // green
    vec3 highland = hsv(vec3(fract(0.22 + hShift), 0.40, 0.55)); // olive
    vec3 mountain = hsv(vec3(fract(0.10 + hShift), 0.20, 0.65)); // grey-tan
    vec3 desert   = hsv(vec3(fract(0.12 + hShift), 0.45, 0.72)); // near equator dry
    vec3 tundra   = hsv(vec3(fract(0.20 + hShift), 0.18, 0.68)); // high latitude

    float eqDist = abs(lat);
    vec3 landCol = mix(lowland, highland, alt);
    landCol = mix(landCol, mountain, smoothstep(0.6, 0.9, alt));
    // Equatorial desert band
    landCol = mix(landCol, desert, smoothstep(0.20, 0.02, eqDist) * (1.0 - alt) * 0.5);
    // High-latitude tundra
    landCol = mix(landCol, tundra, smoothstep(0.55, 0.75, eqDist));

    vec3 albedo = mix(ocean, landCol, land);

    // ── Polar ice caps ──
    float ice = smoothstep(0.72, 0.88, eqDist);
    albedo = mix(albedo, vec3(0.90, 0.92, 0.95), ice * 0.80);

    // ── Cloud cover ──
    float c1 = fbm(p * 4.0 + seed3 * 2.0 + uTime * 0.012);
    float c2 = fbm(p * 8.0 + seed3 * 3.5 - uTime * 0.007);
    float cloud = smoothstep(0.38, 0.65, c1) * 0.55
                + smoothstep(0.48, 0.72, c2) * 0.30;
    albedo = mix(albedo, vec3(0.94, 0.95, 0.96), cloud);

    // ── Ocean specular (separate from land) ──
    vec3 halfV = normalize(lightDir + viewDir);
    float spec = pow(max(dot(bumpN, halfV), 0.), 40.0);
    float oceanGlint = spec * (1.0 - land) * 0.35 * day;

    // ── Diffuse ──
    vec3 color = albedo * NdotL + vec3(1., 0.97, 0.90) * oceanGlint;

    // ── Land specular (rougher) ──
    float landSpec = pow(max(dot(bumpN, halfV), 0.), 16.0);
    color += vec3(0.95, 0.92, 0.85) * landSpec * land * 0.10 * day;

    // ── Atmosphere Fresnel — warm blue ──
    vec3 atmosCol = hsv(vec3(fract(0.57 + hShift), 0.40, 0.92));
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
