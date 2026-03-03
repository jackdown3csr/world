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
    vec3 lightDir = normalize(-vWorldPos);
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

    // ── Albedo: banded atmosphere ────────────────────────
    float warp = fbm(p*1.5+seed3) * 0.18;
    float dLat = lat + warp;

    float bF = 5.0 + uVariant*9.0 + uSeed*3.0;
    float b1 = sin(dLat*bF         + uTime*0.06)*0.5+0.5;
    float b2 = sin(dLat*bF*2.1     + uTime*0.11+uSeed*3.14)*0.5+0.5;

    // Storm spot
    float sLat = 0.22+(fract(uSeed*7.7)-0.5)*0.18;
    float sLon = fract(uSeed*11.3)*6.2832;
    vec3 sC   = vec3(cos(sLat)*cos(sLon), sin(sLat), cos(sLat)*sin(sLon));
    float sM  = smoothstep(0.30, 0.06, length(p-normalize(sC)));

    // Colour: deep blue (Neptune) vs teal (Uranus)
    float hB   = mix(0.57, 0.48, uVariant) + uHue*0.11;
    float satB = mix(0.90, 0.55, uVariant);
    vec3 deep  = hsv(vec3(hB,       satB,     0.28));
    vec3 mid   = hsv(vec3(hB+0.04,  satB*0.9, 0.52));
    vec3 brite = hsv(vec3(hB+0.08,  satB*0.6, 0.74));
    vec3 stC2  = hsv(vec3(hB+0.10,  0.38,     0.86));

    vec3 albedo = mix(deep, mid,   smoothstep(0.3,0.7,b1));
    albedo = mix(albedo, brite, smoothstep(0.6,0.9,b2)*0.4);
    albedo = mix(albedo, stC2,  sM);
    albedo = mix(albedo, hsv(vec3(hB-0.03,0.40,0.68)), smoothstep(0.58,0.92,abs(lat)));

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
    float aurora = aMask * aWave * 0.35 * day;
    vec3 aCol    = mix(vec3(0.2,0.4,1.0), vec3(0.5,0.1,0.8), aWave);
    color += aCol * aurora;

    // ── Atmosphere Fresnel rim ───────────────────────────
    vec3  atmosCol  = hsv(vec3(hB+0.02, 0.72, 0.94));
    float atmosStr  = 0.65;
    float vdn       = max(dot(bumpN, viewDir), 0.);
    float sunFacing = smoothstep(-0.15, 0.35, dot(vWorldNorm, lightDir));
    float fres      = pow(1.-vdn, 3.5) * sunFacing;
    float hazeStr   = pow(1.-vdn, 1.2) * smoothstep(0.0, 0.6, dot(vWorldNorm, lightDir));
    color += atmosCol * (fres*0.9 + hazeStr*0.35) * atmosStr;

    // ── Ambient floor ────────────────────────────────────
    color += albedo * 0.010;

    // ── Moon transit shadows ──────────────────────────────
    color *= 1.0 - moonTransitShadow(vWorldPos) * 0.85;

    // ── Gamma ────────────────────────────────────────────
    color = pow(max(color,vec3(0.001)), vec3(1./2.2));
    gl_FragColor = vec4(color, 1.0);
  }
`;
