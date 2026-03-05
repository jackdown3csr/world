/**
 * Protoplanetary planet shader — vesting system.
 * A young, still-accreting world: chaotic turbulent atmosphere,
 * spiral infall patterns, glowing hot-spot core, semi-transparent outer haze.
 * Blue-purple gas + hot orange/white accretion shocks.
 */

import { PLANET_NOISE, MOON_SHADOW_GLSL } from "./planetNoise";

/* ── Height function ──────────────────────────────────────── */

const HEIGHT_FN = /* glsl */ `
  float typeHeight(vec3 p, vec3 seed3, float seed) {
    // Irregular, turbulent — no regular banding
    float h = fbm(p * 2.2 + seed3) * 0.06;
    h += snoise(p * 5.0 + seed3.yzx) * 0.02;
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

    vec3 displaced = position + normal * h * rad * 0.010;

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

    float NdotL_raw = dot(vWorldNorm, lightDir);
    float day       = smoothstep(-0.15, 0.15, NdotL_raw);
    float NdotL     = max(NdotL_raw, 0.);

    // ── Spiral arm pattern ────────────────────────────────
    // Two logarithmic spirals wound around the spin axis (Y).
    // atan(p.z, p.x) gives longitude; combine with radius from pole to
    // make a spiral that tightens toward the equator.
    float lon    = atan(p.z, p.x);           // -π..π
    float rPole  = length(p.xz);             // 0 at poles, 1 at equator
    float spiral1 = sin(lon * 2.0 + log(max(rPole, 0.01) * 8.0 + 1.0) * 4.5
                        + uTime * 0.055 + uSeed * 6.28) * 0.5 + 0.5;
    float spiral2 = sin(lon * 2.0 + log(max(rPole, 0.01) * 8.0 + 1.0) * 4.5
                        + uTime * 0.055 + uSeed * 6.28 + 3.14159) * 0.5 + 0.5;
    // Arms only visible away from poles (disk plane)
    float armMask = smoothstep(0.0, 0.55, rPole) * smoothstep(1.0, 0.75, rPole);
    float armStr  = max(spiral1, spiral2) * armMask;

    // ── Chaotic turbulence ────────────────────────────────
    // Much higher frequency FBM than gas giant — more violent, less organised
    float tDrift = uTime * 0.028;
    vec3  tp     = p + vec3(sin(tDrift * 0.71) * 0.08, cos(tDrift * 0.53) * 0.08, sin(tDrift * 0.37) * 0.08);

    float turb1  = fbm(tp * 3.0 + seed3);
    float turb2  = fbm(tp * 7.0 + seed3.yzx + vec3(1.7, 3.1, 5.3));
    float turb3  = fbm(tp * 14.0 + seed3.zxy + vec3(9.1, 2.7, 6.3));
    float turb   = turb1 * 0.55 + turb2 * 0.30 + turb3 * 0.15;

    // ── Hot-spot accretion shocks ─────────────────────────
    // Small bright blobs where infalling material impacts;
    // scattered asymmetrically around the planet
    float shocked = 0.0;
    for (int i = 0; i < 3; i++) {
      float fi  = float(i);
      vec3 hotC = normalize(vec3(
        sin(uSeed*31.7 + fi*57.3),
        cos(uSeed*19.3 + fi*43.1) * 0.6,
        sin(uSeed*53.9 + fi*81.7)
      ));
      float d = acos(clamp(dot(p, hotC), -1.0, 1.0));
      float r = 0.18 + fract(uSeed * 4.7 + fi * 0.37) * 0.22;
      shocked += smoothstep(r, r * 0.3, d);
    }
    shocked = clamp(shocked, 0.0, 1.0);

    // ── Colour palette (blue-purple gas + orange shocks) ──
    // Base palette varies by uVariant: can lean more blue, more purple, or more violet
    float hShift = uHue * 0.15;

    // Cool outer gas: deep blue-purple
    vec3 gasCool  = hsv(vec3(fract(0.68 + hShift + uVariant * 0.08), 0.72, 0.35));
    // Mid gas: brighter blue/cyan
    vec3 gasMid   = hsv(vec3(fract(0.62 + hShift),                   0.60, 0.62));
    // Turbulent streaks: lighter violet
    vec3 gasLight = hsv(vec3(fract(0.75 + hShift + uVariant * 0.05), 0.45, 0.80));
    // Accretion shock: hot white-orange
    vec3 shockHot = hsv(vec3(fract(0.12 + uHue * 0.04),              0.80, 1.00));
    vec3 shockMid = hsv(vec3(fract(0.08 + uHue * 0.04),              0.88, 0.88));
    // Spiral arm colour: slightly warmer than base gas (infall heating)
    vec3 armColor = hsv(vec3(fract(0.58 + hShift),                   0.55, 0.75));

    // Build base atmosphere from turbulence
    vec3 albedo = mix(gasCool, gasMid,   smoothstep(0.35, 0.65, turb));
    albedo      = mix(albedo,  gasLight, smoothstep(0.62, 0.85, turb2) * 0.40);

    // Overlay spiral arms
    albedo = mix(albedo, armColor, armStr * 0.55);

    // Accretion shocks
    vec3 shockColor = mix(shockMid, shockHot, smoothstep(0.5, 1.0, shocked));
    albedo = mix(albedo, shockColor, shocked * 0.75);

    // Polar darkening — accreting material collapses toward equator
    albedo *= mix(1.0, 0.55, smoothstep(0.50, 0.95, abs(lat)));

    // ── Hot inner glow (self-luminosity of the core) ──────
    // The very centre of a protoplanet is extremely hot;
    // approximate by boosting brightness at low viewing angles.
    float coreMask  = 1.0 - smoothstep(0.0, 0.7, length(p.xz));  // brighter at poles (depth trick)
    vec3  coreGlow  = hsv(vec3(fract(0.10 + uHue * 0.04), 0.65, 1.0));

    // ── Diffuse lighting ─────────────────────────────────
    // Protoplanets are partially self-lit (internal heat + accretion shocks)
    float selfLit = 0.22 + shocked * 0.55 + coreMask * 0.18;
    float diffuse = max(NdotL * 0.75, selfLit);
    vec3 color    = albedo * diffuse;

    // ── Emissive shocks + core ────────────────────────────
    color += shockColor * shocked  * 0.65;
    color += coreGlow   * coreMask * 0.15;

    // ── Atmospheric haze rim ──────────────────────────────
    float vdn      = max(dot(vWorldNorm, viewDir), 0.0);
    float rim      = pow(1.0 - vdn, 2.5);
    // Limb haze: blue-white on lit side, orange on dark (backlit accretion disk glow)
    vec3 hazeLit   = hsv(vec3(fract(0.62 + hShift), 0.55, 0.95));
    vec3 hazeNight = hsv(vec3(fract(0.10 + uHue * 0.04), 0.70, 0.90));
    vec3 hazeColor = mix(hazeNight, hazeLit, day);
    color += hazeColor * rim * 0.35;

    // Specular — muted, gas doesn't have a clear reflective surface
    vec3  halfV = normalize(lightDir + viewDir);
    float spec  = pow(max(dot(vWorldNorm, halfV), 0.0), 12.0);
    color += vec3(0.80, 0.85, 1.0) * spec * 0.14 * day;

    // ── Moon transit shadows ──────────────────────────────
    color *= 1.0 - moonTransitShadow(vWorldPos) * 0.75;

    // ── Gamma ─────────────────────────────────────────────
    color = pow(max(color, vec3(0.0)), vec3(1.0 / 2.2));
    gl_FragColor = vec4(color, 1.0);
  }
`;
