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

    // ── 5 archetype palettes driven by uVariant ─────────
    //   < 0.20 : Classic Earth — lush green, blue ocean, balanced land/sea
    //   < 0.40 : Desert world — mostly land, red-brown, small seas, dusty
    //   < 0.60 : Alien teal — teal vegetation, purple-blue oceans
    //   < 0.80 : Ocean world — high sea level, scattered archipelagos, heavy clouds
    //   >= 0.80: Cold world — grey-green tundra, partly frozen seas, thin clouds

    float seaLevel, cloudStr, cityStr;
    vec3 jungle, desert, deepO, shalO, tundra, snow;

    if (uVariant < 0.20) {
      // Classic Earth
      seaLevel = 0.44 + uSeed * 0.08;
      cloudStr = 0.85;
      cityStr  = 0.38;
      deepO  = hsv(vec3(0.61 + uHue * 0.04, 0.85, 0.28));
      shalO  = hsv(vec3(0.55 + uHue * 0.05, 0.68, 0.50));
      jungle = hsv(vec3(0.30 + uHue * 0.04, 0.65, 0.28));
      desert = hsv(vec3(0.09 + uHue * 0.03, 0.45, 0.60));
      tundra = hsv(vec3(0.38 + uHue * 0.04, 0.20, 0.50));
      snow   = vec3(0.90, 0.93, 0.97);
    } else if (uVariant < 0.40) {
      // Desert world — mostly land, reddish-brown, small seas
      seaLevel = 0.28 + uSeed * 0.06;
      cloudStr = 0.45;
      cityStr  = 0.25;
      deepO  = hsv(vec3(0.58 + uHue * 0.04, 0.70, 0.22));
      shalO  = hsv(vec3(0.52 + uHue * 0.05, 0.55, 0.40));
      jungle = hsv(vec3(0.08 + uHue * 0.03, 0.50, 0.32));
      desert = hsv(vec3(0.04 + uHue * 0.04, 0.60, 0.58));
      tundra = hsv(vec3(0.06 + uHue * 0.03, 0.30, 0.45));
      snow   = vec3(0.85, 0.82, 0.78);
    } else if (uVariant < 0.60) {
      // Alien teal — teal vegetation, purple-blue oceans
      seaLevel = 0.42 + uSeed * 0.10;
      cloudStr = 0.70;
      cityStr  = 0.30;
      deepO  = hsv(vec3(0.72 + uHue * 0.04, 0.75, 0.25));
      shalO  = hsv(vec3(0.68 + uHue * 0.05, 0.60, 0.45));
      jungle = hsv(vec3(0.46 + uHue * 0.06, 0.55, 0.32));
      desert = hsv(vec3(0.50 + uHue * 0.04, 0.40, 0.52));
      tundra = hsv(vec3(0.54 + uHue * 0.04, 0.25, 0.48));
      snow   = vec3(0.88, 0.90, 0.95);
    } else if (uVariant < 0.80) {
      // Ocean world — high sea level, archipelagos, heavy clouds
      seaLevel = 0.62 + uSeed * 0.08;
      cloudStr = 1.0;
      cityStr  = 0.15;
      deepO  = hsv(vec3(0.60 + uHue * 0.04, 0.88, 0.22));
      shalO  = hsv(vec3(0.54 + uHue * 0.05, 0.72, 0.48));
      jungle = hsv(vec3(0.32 + uHue * 0.04, 0.60, 0.30));
      desert = hsv(vec3(0.11 + uHue * 0.03, 0.40, 0.55));
      tundra = hsv(vec3(0.40 + uHue * 0.04, 0.22, 0.52));
      snow   = vec3(0.92, 0.95, 0.98);
    } else {
      // Cold world — grey-green tundra, partly frozen seas
      seaLevel = 0.38 + uSeed * 0.06;
      cloudStr = 0.50;
      cityStr  = 0.20;
      deepO  = hsv(vec3(0.56 + uHue * 0.04, 0.50, 0.24));
      shalO  = hsv(vec3(0.52 + uHue * 0.05, 0.35, 0.42));
      jungle = hsv(vec3(0.28 + uHue * 0.03, 0.35, 0.30));
      desert = hsv(vec3(0.10 + uHue * 0.04, 0.28, 0.48));
      tundra = hsv(vec3(0.34 + uHue * 0.04, 0.18, 0.44));
      snow   = vec3(0.88, 0.90, 0.92);
    }

    float oceanMask = 1.0 - smoothstep(seaLevel - 0.07, seaLevel + 0.07, landN);
    float polar     = smoothstep(0.64, 0.92, abs(lat));
    float trop      = 1.0 - smoothstep(0., 0.55, abs(lat));

    vec3 ocean = mix(deepO, shalO, smoothstep(seaLevel-0.04, seaLevel, landN));

    vec3 land = mix(jungle, desert, smoothstep(0.3,0.7,trop*0.6+landN*0.4));
    land = mix(land, tundra, smoothstep(0.44,0.68,abs(lat)));
    land = mix(land, snow, polar);
    // Cold world gets extra ice on seas
    if (uVariant >= 0.80) {
      ocean = mix(ocean, vec3(0.80, 0.85, 0.90), polar * 0.6 + smoothstep(0.50, 0.75, abs(lat)) * 0.3);
    }
    vec3 albedo = mix(ocean, land, 1.-oceanMask);

    // Clouds — density varies by archetype
    float cl = fbm(p*4.0 + vec3(uTime*0.008,0.,uSeed*5.1) + seed3*0.5);
    float cloudAlpha = smoothstep(0.48, 0.68, cl) * cloudStr;
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
    color += vec3(1.0, 0.88, 0.50) * city * cityStr;

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
