/**
 * Terrestrial 2 — Ocean World archetype.
 * Almost entirely water: deep blue dominant, tiny scattered archipelagos,
 * heavy swirling cloud cover, strong specular glint.
 */

import { PLANET_NOISE, MOON_SHADOW_GLSL } from "../planetNoise";

const HEIGHT_FN = /* glsl */ `
  float typeHeight(vec3 p, vec3 seed3, float seed) {
    float t = fbm(p * 2.0 + seed3) * 0.4 + fbm(p * 7.0 + seed3 * 2.0) * 0.2;
    return t * 0.04;
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
    vec3 displaced = position + normal * h * rad * 0.008;
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
    vec3 bumpN = normalize(vWorldNorm + grad * 0.4);

    float NdotL_raw = dot(bumpN, lightDir);
    float day       = smoothstep(-0.08, 0.08, NdotL_raw);
    float NdotL     = max(NdotL_raw, 0.);

    // ── Very high sea level — only ~8% land ──
    float seaLevel = 0.032;
    float land = smoothstep(seaLevel - 0.002, seaLevel + 0.002, h0);

    // ── Deep ocean colour with depth variation ──
    float hShift = uHue * 0.25 + uSeed * 0.18;
    vec3 deepOcean  = hsv(vec3(fract(0.62 + hShift), 0.70, 0.25));
    vec3 midOcean   = hsv(vec3(fract(0.59 + hShift), 0.60, 0.42));
    vec3 shallowSea = hsv(vec3(fract(0.55 + hShift), 0.48, 0.58));
    float depth = smoothstep(0.0, seaLevel, h0);
    vec3 ocean = mix(deepOcean, midOcean, smoothstep(0.2, 0.6, depth));
    ocean = mix(ocean, shallowSea, smoothstep(0.7, 0.95, depth));

    // ── Tiny volcanic archipelagos ──
    vec3 islandGreen = hsv(vec3(fract(0.30 + hShift), 0.50, 0.45));
    vec3 islandRock  = hsv(vec3(fract(0.10 + hShift), 0.30, 0.50));
    float islandAlt = smoothstep(seaLevel, seaLevel + 0.012, h0);
    vec3 islandCol = mix(islandGreen, islandRock, islandAlt);

    vec3 albedo = mix(ocean, islandCol, land);

    // ── Heavy cloud cover — swirling cyclones ──
    float c1 = fbm(p * 3.5 + seed3 * 2.0 + uTime * 0.014);
    float c2 = fbm(p * 7.0 + seed3 * 3.0 - uTime * 0.009);
    float cloudBase = smoothstep(0.30, 0.58, c1) * 0.50;
    float cloudHigh = smoothstep(0.40, 0.68, c2) * 0.35;
    float cloud = cloudBase + cloudHigh;

    // Cyclone spirals
    for(int i = 0; i < 2; i++){
      float cLat = fract(uSeed * (3.7 + float(i) * 5.3)) * 1.0 - 0.5;
      float cLon = fract(uSeed * (7.1 + float(i) * 2.9)) * 6.2832;
      float cdx = lon - cLon;
      cdx = cdx - 6.2832 * floor(cdx / 6.2832 + 0.5);
      float cDist = length(vec2(cdx * 2.0, (lat - cLat) * 2.5));
      float cMask = smoothstep(0.45, 0.08, cDist);
      float sAngle = atan(lat - cLat, cdx) + cDist * 8.0 - uTime * 0.06;
      float arm = sin(sAngle * 2.0) * 0.5 + 0.5;
      cloud = max(cloud, cMask * mix(0.5, 0.8, arm));
    }

    albedo = mix(albedo, vec3(0.93, 0.94, 0.96), cloud);

    // ── Polar ice ──
    float ice = smoothstep(0.76, 0.90, abs(lat));
    albedo = mix(albedo, vec3(0.88, 0.90, 0.94), ice * 0.65);

    // ── Diffuse ──
    vec3 color = albedo * NdotL;

    // ── Strong ocean specular glint ──
    vec3 halfV = normalize(lightDir + viewDir);
    float spec = pow(max(dot(bumpN, halfV), 0.), 50.0);
    float oceanMask = (1.0 - land) * (1.0 - cloud * 0.8);
    color += vec3(1., 0.97, 0.92) * spec * oceanMask * 0.45 * day;

    // ── Cloud specular (diffuse, soft) ──
    float cloudSpec = pow(max(dot(bumpN, halfV), 0.), 10.0);
    color += vec3(0.96, 0.96, 0.98) * cloudSpec * cloud * 0.08 * day;

    // ── Atmosphere Fresnel — deep blue ──
    vec3 atmosCol = hsv(vec3(fract(0.60 + hShift), 0.48, 0.90));
    float atmosStr = 0.42 * (1.0 - uHasRing * 0.55);
    float vdn      = max(dot(bumpN, viewDir), 0.);
    float sunFacing = smoothstep(-0.15, 0.35, dot(vWorldNorm, lightDir));
    float fres     = pow(1. - vdn, 3.5) * sunFacing;
    color += atmosCol * fres * atmosStr;

    color *= 1.0 - moonTransitShadow(vWorldPos) * 0.85;
    color = pow(max(color, vec3(0.001)), vec3(1./2.2));
    gl_FragColor = vec4(color, 1.0);
  }
`;
