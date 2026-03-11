/**
 * Rocky planet shader (rank 15–20).
 * Mercury/Moon grey, Mars-like red/ochre, or Ceres-like brown/tan.
 * Deep craters, ridged highlands, polar frost.
 */

import { PLANET_NOISE, MOON_SHADOW_GLSL } from "./planetNoise";

/* ── Height function (drives vertex displacement + bump normals) ── */

const HEIGHT_FN = /* glsl */ `
  float typeHeight(vec3 p, vec3 seed3, float seed) {
    float h = 0.0;
    // Large-scale terrain variation
    h += fbm(p * 2.5 + seed3) * 0.35;
    // Medium craters — gentler than before
    h += craters(p, seed, 0.25, 4) * 0.30;
    // Subtle ridge lines (not the dominant feature)
    float ridge = 1.0 - abs(snoise(p * 3.5 + seed3));
    h += ridge * ridge * 0.12;
    // Fine detail noise
    h += snoise(p * 8.0 + seed3.yzx) * 0.08;
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
    vec3 bumpN = normalize(vWorldNorm + grad * 0.9);

    float NdotL_raw = dot(bumpN, lightDir);
    float day       = smoothstep(-0.03, 0.03, NdotL_raw);
    float NdotL     = max(NdotL_raw, 0.);

    // ── Albedo ───────────────────────────────────────────
    float n1 = fbm(p * 2.2 + seed3) * 0.65 + fbm(p * 7.0 + seed3.yzx) * 0.35;
    float t  = smoothstep(0.2, 0.8, n1);

    // ── 5 archetype palettes driven by uVariant ─────────
    //   < 0.20 : Mercury grey/silver — deep craters, no frost
    //   < 0.40 : Dark obsidian/charcoal — subtle metallic sheen, no frost
    //   < 0.60 : Mars-like red/ochre — medium craters, polar frost
    //   < 0.80 : Sandy tan/beige — heavy cratering, light frost
    //   >= 0.80: Icy grey-blue — heavy frost, scattered craters

    vec3 hiC, loC;
    float frostCoverage, craterScale, ridgeStr;

    if (uVariant < 0.20) {
      // Mercury — grey/silver regolith
      hiC = hsv(vec3(0.07 + uHue * 0.03, 0.08, 0.62));
      loC = hsv(vec3(0.08 + uHue * 0.02, 0.05, 0.28));
      frostCoverage = 0.0;
      craterScale   = 0.28 + uSeed * 0.08;
      ridgeStr      = 0.12;
    } else if (uVariant < 0.40) {
      // Dark obsidian — charcoal with metallic sheen
      hiC = hsv(vec3(0.70 + uHue * 0.04, 0.12, 0.35));
      loC = hsv(vec3(0.72 + uHue * 0.03, 0.08, 0.12));
      frostCoverage = 0.0;
      craterScale   = 0.18 + uSeed * 0.06;
      ridgeStr      = 0.08;
    } else if (uVariant < 0.60) {
      // Mars-like — rusty red/ochre
      hiC = hsv(vec3(0.03 + uHue * 0.04, 0.65, 0.55));
      loC = hsv(vec3(0.01 + uHue * 0.03, 0.55, 0.20));
      frostCoverage = 0.82;
      craterScale   = 0.25 + uSeed * 0.07;
      ridgeStr      = 0.12;
    } else if (uVariant < 0.80) {
      // Sandy tan/beige — heavily cratered
      hiC = hsv(vec3(0.10 + uHue * 0.04, 0.35, 0.62));
      loC = hsv(vec3(0.09 + uHue * 0.03, 0.25, 0.30));
      frostCoverage = 0.88;
      craterScale   = 0.35 + uSeed * 0.10;
      ridgeStr      = 0.18;
    } else {
      // Icy grey-blue — frozen surface
      hiC = hsv(vec3(0.58 + uHue * 0.04, 0.22, 0.60));
      loC = hsv(vec3(0.56 + uHue * 0.03, 0.15, 0.32));
      frostCoverage = 0.60;
      craterScale   = 0.20 + uSeed * 0.06;
      ridgeStr      = 0.10;
    }

    vec3 albedo = mix(loC, hiC, t);

    // Craters — scale varies per archetype + seed
    vec3 c0 = normalize(vec3(sin(uSeed*91.1), cos(uSeed*37.3), sin(uSeed*63.7)));
    vec3 c1 = normalize(vec3(sin(uSeed*53.7), cos(uSeed*81.3), cos(uSeed*27.1)));
    vec3 c2 = normalize(vec3(cos(uSeed*19.9), sin(uSeed*47.3), cos(uSeed*83.1)));

    float cr = 0.0;
    float d0 = acos(clamp(dot(p,c0),-1.,1.)) / (0.35 + craterScale * 0.5);
    if(d0<1.) cr += -smoothstep(0.,0.6,d0)*0.7+smoothstep(0.6,0.93,d0)*0.6;
    float d1 = acos(clamp(dot(p,c1),-1.,1.)) / (0.24 + craterScale * 0.3);
    if(d1<1.) cr += -smoothstep(0.,0.6,d1)*0.7+smoothstep(0.6,0.93,d1)*0.6;
    float d2 = acos(clamp(dot(p,c2),-1.,1.)) / (0.16 + craterScale * 0.2);
    if(d2<1.) cr += -smoothstep(0.,0.6,d2)*0.7+smoothstep(0.6,0.93,d2)*0.6;
    cr = clamp(cr, -0.7, 0.6);
    albedo = mix(albedo, loC*0.4, max(-cr,0.));
    albedo = mix(albedo, hiC*1.3, max( cr,0.));

    // Metallic sheen for obsidian variant
    if (uVariant >= 0.20 && uVariant < 0.40) {
      float metalFleck = pow(snoise(p * 12.0 + seed3) * 0.5 + 0.5, 3.0) * 0.15;
      albedo += vec3(0.6, 0.65, 0.7) * metalFleck;
    }

    // Polar frost — coverage varies per archetype
    if (frostCoverage > 0.01) {
      float frost = smoothstep(frostCoverage, 0.96, abs(lat));
      albedo = mix(albedo, vec3(0.93, 0.91, 0.89), frost);
    }
    // Icy variant gets extra frost everywhere
    if (uVariant >= 0.80) {
      float globalFrost = smoothstep(0.55, 0.75, fbm(p * 3.0 + seed3.zxy) * 0.5 + abs(lat) * 0.5);
      albedo = mix(albedo, vec3(0.88, 0.92, 0.96), globalFrost * 0.45);
    }

    // ── Diffuse ──────────────────────────────────────────
    vec3 color = albedo * NdotL;

    // ── Specular ─────────────────────────────────────────
    vec3 halfV = normalize(lightDir+viewDir);
    float spec = pow(max(dot(bumpN,halfV),0.), 16.0);
    color += vec3(1.,0.97,0.88) * spec * 0.05 * day;

    // ── Atmosphere Fresnel rim ───────────────────────────
    // Rocky worlds: very thin — only visible on sunlit side
    vec3  atmosCol  = hsv(vec3(0.05+uHue*0.05, 0.25, 0.75));
    float atmosStr  = 0.05;
    float vdn       = max(dot(bumpN, viewDir), 0.);
    float sunFacing = smoothstep(-0.1, 0.3, dot(vWorldNorm, lightDir));
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
