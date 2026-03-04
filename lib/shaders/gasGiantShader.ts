/**
 * Gas-giant planet shader (rank 1–4).
 * Jupiter-like: banded atmosphere, Great Red Spot, metallic shimmer,
 * white oval storms, polar darkening.
 */

import { PLANET_NOISE, MOON_SHADOW_GLSL } from "./planetNoise";

/* ── Height function ──────────────────────────────────────── */

const HEIGHT_FN = /* glsl */ `
  float typeHeight(vec3 p, vec3 seed3, float seed) {
    return sin(p.y * 12.0) * 0.015;
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

    vec3 displaced = position + normal * h * rad * 0.002;

    vPos       = position;
    vec4 wp    = modelMatrix * vec4(displaced, 1.0);
    vWorldPos  = wp.xyz;
    vWorldNorm = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

/* ── Fragment shader ────────────────────────────────────────── */

export const FRAG = /* glsl */ `
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

    // ── Lighting ─────────────────────────────────────────
    vec3 lightDir = normalize(-vWorldPos);
    vec3 viewDir  = normalize(cameraPosition - vWorldPos);

    // ── Bump normals ─────────────────────────────────────
    float eps  = 0.02;
    float h0   = typeHeight(p, seed3, uSeed);
    float hx   = typeHeight(normalize(p + vec3(eps,0.,0.)), seed3, uSeed);
    float hy   = typeHeight(normalize(p + vec3(0.,eps,0.)), seed3, uSeed);
    vec3 grad  = vec3(hx-h0, hy-h0, 0.) / eps;
    vec3 bumpN = normalize(vWorldNorm + grad * 0.06);

    float NdotL_raw = dot(bumpN, lightDir);
    float day       = smoothstep(-0.08, 0.08, NdotL_raw);
    float NdotL     = max(NdotL_raw, 0.);

    // ── Albedo: banded atmosphere ────────────────────────
    float wind = fbm(p*1.5+seed3)*0.26 + fbm(p*4.0+seed3.yzx)*0.10;
    float dLat = lat + wind;

    float bF = 10.0+uVariant*8.0+uSeed*5.0;
    float b1 = sin(dLat*bF          +uTime*0.018)*0.5+0.5;
    float b2 = sin(dLat*bF*1.618    +uTime*0.031+uSeed*2.)*0.5+0.5;
    float b3 = sin(dLat*bF*0.5      +uTime*0.011)*0.5+0.5;

    // GRS
    float gLat = -(0.23+fract(uSeed*7.3)*0.14);
    float gLon =  fract(uSeed*3.9)*6.2832;
    float gA   = 0.16+uVariant*0.16+fract(uSeed*5.5)*0.08;
    vec3 gCtr  = vec3(cos(gLat)*cos(gLon), sin(gLat), cos(gLat)*sin(gLon));
    float gDX  = dot(p-normalize(gCtr), vec3(cos(gLon),0.,sin(gLon)))/gA;
    float gDY  = dot(p-normalize(gCtr), vec3(0.,1.,0.))/(gA*0.5);
    float gM   = smoothstep(1., 0.2, sqrt(gDX*gDX+gDY*gDY));
    float gSw  = sin(atan(gDY,gDX)*5.+uTime*0.07)*0.5+0.5;

    // White oval storms
    float wLat = 0.38+fract(uSeed*4.1)*0.2;
    float wLon = fract(uSeed*8.7)*6.2832;
    vec3 wCtr  = vec3(cos(wLat)*cos(wLon), sin(wLat), cos(wLat)*sin(wLon));
    float wM   = smoothstep(0.15, 0.04, length(p-normalize(wCtr)));

    // Colour palette
    float hShift = uHue*0.22;
    vec3 zone  = hsv(vec3(fract(0.09+hShift), 0.30+uVariant*0.10, 0.92));
    vec3 belt  = hsv(vec3(fract(0.06+hShift), 0.70, 0.48-uVariant*0.10));
    vec3 warm  = hsv(vec3(fract(0.05+hShift), 0.74, 0.72));
    vec3 grsC  = hsv(vec3(fract(0.02+hShift), 0.86, 0.68));

    vec3 albedo = mix(belt, zone, smoothstep(0.35,0.65,b1));
    albedo = mix(albedo, warm, smoothstep(0.48,0.76,b2)*0.36);
    // white zone highlights
    albedo = mix(albedo, vec3(0.92,0.91,0.88), smoothstep(0.72,0.88,b3)*0.16);
    // Metallic shimmer in belts
    float shimmer = smoothstep(0.3,0.6,b1) * smoothstep(0.7,0.5,b1) * 0.12;
    albedo += vec3(0.95,0.90,0.80) * shimmer;
    // GRS
    albedo = mix(albedo, mix(grsC,mix(grsC,zone*0.5,0.5),gSw*0.5), gM);
    // White oval
    albedo = mix(albedo, vec3(0.94,0.93,0.90), wM * 0.6);
    // Polar darkening
    albedo *= 1.-smoothstep(0.55,1.,abs(lat))*0.36;
    float cloudAlpha = smoothstep(0.4,0.7,b1)*0.38;

    // ── Diffuse ──────────────────────────────────────────
    vec3 color = albedo * NdotL;

    // ── Specular ─────────────────────────────────────────
    vec3 halfV = normalize(lightDir+viewDir);
    float spec = pow(max(dot(bumpN,halfV),0.), 24.0);
    color += vec3(1.,0.97,0.88) * spec * 0.30 * day;

    // ── Atmosphere Fresnel rim (partially suppressed when planet has wallet ring) ──
    vec3  atmosCol  = hsv(vec3(fract(0.09+hShift), 0.50, 0.98));
    float atmosStr  = 0.35 * (1.0 - uHasRing * 0.55);
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
