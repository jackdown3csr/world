/**
 * Gas Giant 1 — Jupiter archetype.
 * Dense narrow bands (14+), large Great Red Spot with spiral swirl,
 * white ovals, strong polar darkening, warm orange/brown/cream palette.
 */

import { PLANET_NOISE, MOON_SHADOW_GLSL } from "../planetNoise";

const HEIGHT_FN = /* glsl */ `
  float typeHeight(vec3 p, vec3 seed3, float seed) {
    return sin(p.y * 16.0) * 0.008;
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

    // ── Dense narrow bands — the Jovian signature ──
    float wind = fbm(p * 2.0 + seed3) * 0.08;
    float dLat = lat + wind;
    float b1 = sin(dLat * 18.0  + uTime * 0.018) * 0.5 + 0.5;
    float b2 = sin(dLat * 26.0  + uTime * 0.010 + 2.1) * 0.5 + 0.5;
    float b3 = sin(dLat * 40.0  + uTime * 0.025 + 4.5) * 0.5 + 0.5;

    // ── Colour palette: orange / brown / ivory / ochre ──
    float hShift = uHue * 0.25 + uSeed * 0.18;
    vec3 zone  = hsv(vec3(fract(0.10 + hShift), 0.28, 0.96));  // ivory
    vec3 belt  = hsv(vec3(fract(0.06 + hShift), 0.62, 0.52));  // deep brown
    vec3 mid   = hsv(vec3(fract(0.08 + hShift), 0.48, 0.72));  // orange-ochre

    vec3 albedo = mix(belt, zone, smoothstep(0.28, 0.72, b1));
    albedo = mix(albedo, mid, smoothstep(0.40, 0.80, b2) * 0.40);
    // Fine tertiary band detail
    albedo *= 1.0 - (1.0 - smoothstep(0.45, 0.55, b3)) * 0.12;

    // ── Great Red Spot with spiral swirl ──
    // Located ~22°S, longitude seeded by uSeed
    float grsLat  = -0.22;
    float grsLon  = fract(uSeed * 3.77) * 6.2832;
    float lon     = atan(p.z, p.x);
    float dx      = lon - grsLon;
    dx = dx - 6.2832 * floor(dx / 6.2832 + 0.5);
    float grsDist = length(vec2(dx * 1.4, (lat - grsLat) * 3.2));
    float grsMask = smoothstep(0.55, 0.15, grsDist);
    // Internal spiral
    float swirlAngle = atan(lat - grsLat, dx) + grsDist * 8.0 - uTime * 0.06;
    float swirl = sin(swirlAngle * 3.0) * 0.5 + 0.5;
    vec3 grsCore = hsv(vec3(fract(0.03 + hShift), 0.72, 0.55));  // deep brick red
    vec3 grsEdge = hsv(vec3(fract(0.06 + hShift), 0.55, 0.75));  // soft ochre
    vec3 grsCol  = mix(grsCore, grsEdge, swirl * 0.4 + grsDist * 0.6);
    albedo = mix(albedo, grsCol, grsMask * 0.90);

    // ── White ovals in southern hemisphere ──
    for(int i = 0; i < 3; i++){
      float oLat = -0.45 + float(i) * 0.12;
      float oLon = fract(uSeed * (2.3 + float(i) * 1.7)) * 6.2832;
      float odx  = lon - oLon;
      odx = odx - 6.2832 * floor(odx / 6.2832 + 0.5);
      float oDist = length(vec2(odx * 3.0, (lat - oLat) * 5.0));
      float oMask = smoothstep(0.45, 0.10, oDist);
      albedo = mix(albedo, vec3(0.94, 0.92, 0.88), oMask * 0.60);
    }

    // ── Strong polar darkening ──
    albedo *= 1.0 - smoothstep(0.62, 0.95, abs(lat)) * 0.52;

    // ── Metallic shimmer in belt regions ──
    float beltMask = smoothstep(0.5, 0.3, b1); // where b1 is low → belt
    float sheen = pow(max(dot(bumpN, viewDir), 0.), 5.0) * beltMask * 0.08;
    albedo += vec3(0.95, 0.85, 0.65) * sheen;

    // ── Diffuse ──
    vec3 color = albedo * NdotL;

    // ── Specular ──
    vec3 halfV = normalize(lightDir + viewDir);
    float spec = pow(max(dot(bumpN, halfV), 0.), 18.0);
    color += vec3(1., 0.95, 0.85) * spec * 0.20 * day;

    // ── Atmosphere Fresnel rim ──
    vec3  atmosCol = hsv(vec3(fract(0.09 + hShift), 0.35, 0.92));
    float atmosStr = 0.35 * (1.0 - uHasRing * 0.55);
    float vdn      = max(dot(bumpN, viewDir), 0.);
    float sunFacing = smoothstep(-0.15, 0.35, dot(vWorldNorm, lightDir));
    float fres     = pow(1. - vdn, 3.5) * sunFacing;
    color += atmosCol * fres * atmosStr;

    color *= 1.0 - moonTransitShadow(vWorldPos) * 0.85;
    color = pow(max(color, vec3(0.001)), vec3(1./2.2));
    gl_FragColor = vec4(color, 1.0);
  }
`;
