/**
 * Terrestrial planet shader (rank 9–14).
 * Oceans, continents, clouds, city night-lights, polar aurora.
 */

import { PLANET_NOISE, MOON_SHADOW_GLSL } from "./planetNoise";

/* ── Height function ──────────────────────────────────────── */

const HEIGHT_FN = /* glsl */ `
  float typeHeight(vec3 p, vec3 seed3, float seed) {
    float h = 0.0;
    float continent = fbm(p * 2.0 + seed3);
    h += max(continent - 0.1, 0.0) * 1.2;
    float ridge = 1.0 - abs(snoise(p * 6.0 + seed3.yzx));
    h += ridge * ridge * 0.2 * step(0.1, continent);
    return h;
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

    vec3 displaced = position + normal * h * rad * 0.025;

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
    float hz   = typeHeight(normalize(p + vec3(0.,0.,eps)), seed3, uSeed);
    vec3 grad  = vec3(hx-h0, hy-h0, hz-h0) / eps;
    vec3 bumpN = normalize(vWorldNorm + grad * 0.8);

    float NdotL_raw = dot(bumpN, lightDir);
    float day       = smoothstep(-0.12, 0.12, NdotL_raw);
    float NdotL     = max(NdotL_raw, 0.);

    // ── Albedo: ocean / land / clouds ────────────────────
    float landN    = fbm(p*2.0+seed3)*0.65 + fbm(p*5.5+seed3.zxy)*0.35;
    float seaLevel = 0.42 + uVariant * 0.22;
    float oceanMask = 1.0 - smoothstep(seaLevel - 0.07, seaLevel + 0.07, landN);
    float polar     = smoothstep(0.64, 0.92, abs(lat));
    float trop      = 1.0 - smoothstep(0., 0.55, abs(lat));

    vec3 deepO = hsv(vec3(0.61+uHue*0.04, 0.85, 0.28));
    vec3 shalO = hsv(vec3(0.55+uHue*0.05, 0.68, 0.50));
    vec3 ocean = mix(deepO, shalO, smoothstep(seaLevel-0.04, seaLevel, landN));

    vec3 jungle, desert;
    if (uVariant < 0.40) {
      jungle = hsv(vec3(0.30+uHue*0.04, 0.65, 0.28));
      desert = hsv(vec3(0.09+uHue*0.03, 0.45, 0.60));
    } else if (uVariant < 0.70) {
      jungle = hsv(vec3(0.46+uHue*0.06, 0.55, 0.32));
      desert = hsv(vec3(0.04+uHue*0.03, 0.50, 0.52));
    } else {
      jungle = hsv(vec3(0.10+uHue*0.03, 0.40, 0.35));
      desert = hsv(vec3(0.07+uHue*0.04, 0.55, 0.65));
    }
    vec3 tundra = hsv(vec3(0.38+uHue*0.04, 0.20, 0.50));
    vec3 snow   = vec3(0.90,0.93,0.97);

    vec3 land = mix(jungle, desert, smoothstep(0.3,0.7,trop*0.6+landN*0.4));
    land = mix(land, tundra, smoothstep(0.44,0.68,abs(lat)));
    land = mix(land, snow, polar);
    vec3 albedo = mix(ocean, land, 1.-oceanMask);

    // Clouds
    float cl = fbm(p*4.0 + vec3(uTime*0.008,0.,uSeed*5.1) + seed3*0.5);
    float cloudAlpha = smoothstep(0.48, 0.68, cl) * 0.85;
    albedo = mix(albedo, mix(vec3(0.88,0.91,0.96),snow,polar*0.5), cloudAlpha);

    // ── Diffuse ──────────────────────────────────────────
    vec3 color = albedo * NdotL;

    // ── Specular (ocean) ─────────────────────────────────
    vec3 halfV = normalize(lightDir+viewDir);
    float spec = pow(max(dot(bumpN,halfV),0.), 96.0);
    float sm   = oceanMask*(1.-cloudAlpha*0.8);
    color += vec3(1.,0.97,0.88)*spec*sm*day;

    // ── Night lights ─────────────────────────────────────
    float city = smoothstep(0.55, 0.75, h0*h0) * (1.-day) * (1.-cloudAlpha*0.85);
    color += vec3(1.0, 0.88, 0.50) * city * 0.38;

    // ── Polar aurora ─────────────────────────────────────
    float aLat   = abs(lat);
    float aMask  = smoothstep(0.72, 0.88, aLat) * smoothstep(0.98, 0.90, aLat);
    float aWave  = sin(p.x*18.0 + uTime*0.5 + uSeed*30.0)*0.5+0.5;
    float aurora = aMask * aWave * 0.35 * day;
    vec3 aCol    = mix(vec3(0.1,0.9,0.3), vec3(0.3,0.2,0.9), aWave);
    color += aCol * aurora;

    // ── Atmosphere Fresnel rim ───────────────────────────
    // Only visible on the lit side — multiply by sunFacing so night stays dark
    vec3  atmosCol  = hsv(vec3(0.59+uHue*0.03, 0.60, 0.98));
    float atmosStr  = 0.55;
    float vdn       = max(dot(bumpN, viewDir), 0.);
    float sunFacing = smoothstep(-0.25, 0.35, dot(vWorldNorm, lightDir));
    float fres      = pow(1.-vdn, 3.5) * sunFacing;
    float hazeStr   = pow(1.-vdn, 1.2) * smoothstep(0.0, 0.6, dot(vWorldNorm, lightDir));
    color += atmosCol * (fres*0.9 + hazeStr*0.35) * atmosStr;

    // ── Moon transit shadows ──────────────────────────────
    color *= 1.0 - moonTransitShadow(vWorldPos) * 0.85;

    // ── Gamma ────────────────────────────────────────────
    color = pow(max(color, vec3(0.001)), vec3(1./2.2));
    gl_FragColor = vec4(color, 1.0);
  }
`;
