/**
 * Procedural moon shader — 6 distinct moon types, each unique per wallet.
 *
 * Types:
 *   0 = Luna      (our Moon — grey highlands + dark maria basins, large craters)
 *   1 = Europa    (smooth white-blue ice, distinctive red-brown crack linea)
 *   2 = Io        (sulfur yellow-orange, dark calderas, volcanic plains)
 *   3 = Callisto  (ancient dark surface, saturated heavy cratering, sparse highlights)
 *   4 = Ganymede  (mixed terrain — dark grooved regions + icy bright patches)
 *   5 = Titan     (smooth orange-amber, hazy atmosphere, subtle dune banding)
 *
 * Design principle: LARGE features only. No brain-frequency noise.
 * Surfaces are mostly smooth; topology comes from craters and large structures.
 */

import * as THREE from "three";
import { NOISE_GLSL } from "../glsl";

export type MoonType = 0 | 1 | 2 | 3 | 4 | 5;
export const MOON_TYPE_COUNT = 6;

/* ── Shared functions (included in both vertex + fragment) ───────── */
const SHARED_GLSL = /* glsl */ `
  ${NOISE_GLSL}

  /* Low-frequency smooth fbm — only 2 octaves to avoid brainy noise */
  float smoothFbm(vec3 p) {
    return snoise(p) * 0.6 + snoise(p * 2.1) * 0.4;
  }

  /*
   * Single clean crater:
   *   d = normalised angular distance (0=centre, 1=rim edge)
   *   Returns height contribution — flat floor, raised rim, ejecta.
   */
  float craterShape(float d) {
    if (d >= 1.0) return 0.0;
    // flat floor slightly below surface
    float floor  = -smoothstep(0.0, 0.55, d) * 0.65;
    // raised rim
    float rim    =  smoothstep(0.50, 0.78, d) * smoothstep(1.0, 0.78, d) * 0.55;
    // ejecta blanket fading outside
    float ejecta =  smoothstep(1.0, 0.80, d) * 0.12;
    return floor + rim + ejecta;
  }

  /*
   * Multiple craters at deterministic positions.
   * maxR controls how large each crater can be (radians).
   */
  float craterField(vec3 p, float seed, float maxR, int count) {
    float h = 0.0;
    for (int i = 0; i < 8; i++) {
      if (i >= count) break;
      float fi = float(i);
      vec3 c = normalize(vec3(
        sin(seed * 73.1 + fi * 41.7),
        cos(seed * 29.3 + fi * 67.9),
        sin(seed * 57.8 + fi * 13.3)
      ));
      float r = 0.10 + fract(seed * 6.3 + fi * 0.41) * maxR;
      float d = acos(clamp(dot(p, c), -1.0, 1.0)) / r;
      h += craterShape(d) * (0.4 + fract(seed * 11.7 + fi * 0.29) * 0.6);
    }
    return clamp(h, -1.0, 1.0);
  }

  /* Unified height field — same function drives vertex displacement AND bump */
  float moonHeight(vec3 p, vec3 seed3, float moonType, float seed) {
    float h = 0.0;

    if (moonType < 0.5) {
      // ── LUNA: large smooth basins (maria) + highland bumps + craters ──
      // Very gentle large-scale undulation — the "highlands vs maria" dichotomy
      float macro = smoothFbm(p * 1.2 + seed3) * 0.35;
      h += macro;
      // Large craters (prominent, few)
      h += craterField(p, seed,            0.28, 4) * 0.50;
      // Medium craters
      h += craterField(p, seed + 3.0,      0.14, 5) * 0.28;
      // Small craters (keep count low to avoid brainy look)
      h += craterField(p, seed + 7.0,      0.07, 4) * 0.14;
    }
    else if (moonType < 1.5) {
      // ── EUROPA: nearly perfectly smooth — just subtle tectonic warps ──
      h += smoothFbm(p * 1.0 + seed3) * 0.08;
      // Very rare small impacts (young surface)
      h += craterField(p, seed + 10.0, 0.06, 3) * 0.10;
      // Crack lineae: subtle ridges along great-circle-like paths
      float crack1 = abs(snoise(p * 3.5 + seed3));
      h += smoothstep(0.12, 0.05, crack1) * 0.08;
    }
    else if (moonType < 2.5) {
      // ── IO: mostly flat volcanic plains, discrete calderas ──
      h += smoothFbm(p * 1.5 + seed3) * 0.12;
      // Calderas as inverted craters (depression only)
      for (int i = 0; i < 5; i++) {
        float fi = float(i);
        vec3 c = normalize(vec3(
          sin(seed * 111.3 + fi * 59.1),
          cos(seed * 43.7  + fi * 81.3) * 0.7,
          sin(seed * 77.2  + fi * 29.6)
        ));
        float r = 0.06 + fract(seed * 8.9 + fi * 0.53) * 0.12;
        float d = acos(clamp(dot(p, c), -1.0, 1.0)) / r;
        if (d < 1.0) {
          // Flat caldera floor, subtle raised rim
          h -= smoothstep(0.0, 0.65, d) * 0.50 * step(d, 0.9);
          h += smoothstep(0.85, 1.0, d) * smoothstep(1.0, 0.85, d) * 0.18;
        }
      }
    }
    else if (moonType < 3.5) {
      // ── CALLISTO: ancient, saturation-cratered, very rough at large scale ──
      h += smoothFbm(p * 1.4 + seed3) * 0.20;
      // Very dense large craters — the whole surface is covered
      h += craterField(p, seed,        0.22, 7) * 0.45;
      h += craterField(p, seed + 4.0,  0.12, 7) * 0.28;
      h += craterField(p, seed + 9.0,  0.06, 6) * 0.14;
    }
    else if (moonType < 4.5) {
      // ── GANYMEDE: grooved terrain + icy smooth patches ──
      // Grooves: parallel-ish tectonic ridges
      float groove = sin(dot(p, normalize(vec3(
        sin(seed * 31.7), cos(seed * 19.3), sin(seed * 53.9)
      ))) * 15.0 + seed * 6.28) * 0.5 + 0.5;
      h += groove * smoothstep(0.5, 0.8, smoothFbm(p * 1.8 + seed3) * 0.5 + 0.5) * 0.22;
      h += smoothFbm(p * 1.3 + seed3) * 0.18;
      h += craterField(p, seed, 0.16, 4) * 0.28;
    }
    else {
      // ── TITAN: nearly smooth, very gentle dune-like undulation ──
      h += smoothFbm(p * 0.9 + seed3) * 0.10;
      // Subtle parallel dune banding
      vec3 northDir = normalize(vec3(sin(seed * 7.3), 0.1, cos(seed * 7.3)));
      float dune = sin(dot(p - northDir * dot(p, northDir), vec3(0., 1., 0.)) * 6.0
                   + snoise(p * 1.5 + seed3) * 1.2) * 0.5 + 0.5;
      h += dune * 0.06;
    }

    return h;
  }
`;

const VERT = /* glsl */ `
  uniform float uMoonType;
  uniform float uSeed;

  ${SHARED_GLSL}

  varying vec3 vPos;
  varying vec3 vWorldPos;
  varying vec3 vWorldNorm;

  void main() {
    vec3 p     = normalize(position);
    vec3 seed3 = vec3(uSeed * 13.7, uSeed * 7.3, uSeed * 5.1);

    float h      = moonHeight(p, seed3, uMoonType, uSeed);
    float radius = length(position);

    // Per-type displacement amplitude
    float dispScale;
    if      (uMoonType < 0.5) dispScale = 0.040;  // Luna — craters + maria
    else if (uMoonType < 1.5) dispScale = 0.010;  // Europa — nearly smooth
    else if (uMoonType < 2.5) dispScale = 0.022;  // Io — calderas
    else if (uMoonType < 3.5) dispScale = 0.045;  // Callisto — heavily cratered
    else if (uMoonType < 4.5) dispScale = 0.030;  // Ganymede — grooved
    else                       dispScale = 0.008;  // Titan — nearly flat

    vec3 displaced = position + normal * h * radius * dispScale;

    vPos = position;
    vec4 wp = modelMatrix * vec4(displaced, 1.0);
    vWorldPos  = wp.xyz;
    vWorldNorm = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FRAG = /* glsl */ `
  uniform vec3  uStarPos;
  uniform float uMoonType;   // 0–5
  uniform float uHue;        // 0–1 per-wallet colour shift
  uniform float uSeed;       // 0–1 per-wallet noise seed
  uniform float uTime;
  uniform vec3  uHostPos;    // planet world position (for shadow)
  uniform float uHostRadius; // planet radius (0 = no shadow)

  varying vec3 vPos;
  varying vec3 vWorldPos;
  varying vec3 vWorldNorm;

  ${SHARED_GLSL}

  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  void main() {
    vec3 p     = normalize(vPos);
    vec3 seed3 = vec3(uSeed * 13.7, uSeed * 7.3, uSeed * 5.1);

    // ── Lighting ──────────────────────────────────────────
    vec3 lightDir = normalize(uStarPos - vWorldPos);
    vec3 viewDir  = normalize(cameraPosition - vWorldPos);

    // ── Type-specific bump normal from shared height field ─
    float eps = 0.015;
    float h0 = moonHeight(p, seed3, uMoonType, uSeed);
    float hx = moonHeight(normalize(p + vec3(eps, 0.0, 0.0)), seed3, uMoonType, uSeed);
    float hy = moonHeight(normalize(p + vec3(0.0, eps, 0.0)), seed3, uMoonType, uSeed);
    vec3 grad = vec3(hx - h0, hy - h0, 0.0) / eps;

    // Bump strength per type
    float bumpStr;
    if      (uMoonType < 0.5) bumpStr = 1.4;   // Luna — visible crater walls
    else if (uMoonType < 1.5) bumpStr = 0.4;   // Europa — very subtle
    else if (uMoonType < 2.5) bumpStr = 0.9;   // Io — caldera rims
    else if (uMoonType < 3.5) bumpStr = 1.5;   // Callisto — heavy craters
    else if (uMoonType < 4.5) bumpStr = 1.1;   // Ganymede — grooves
    else                       bumpStr = 0.2;   // Titan — nearly flat

    vec3 bumpN = normalize(vWorldNorm + grad * bumpStr);

    float NdotL = max(dot(bumpN, lightDir), 0.0);
    float day   = smoothstep(-0.03, 0.03, dot(bumpN, lightDir));

    vec3 albedo   = vec3(0.5);
    float specStr = 0.06;
    float specPow = 16.0;
    float rimStr  = 0.0;
    vec3  rimCol  = vec3(0.0);

    // ════════════════════════════════════════════════════════
    //  TYPE 0: LUNA (our Moon)
    //  Grey highlands (bright) + dark volcanic maria basins + craters
    // ════════════════════════════════════════════════════════
    if (uMoonType < 0.5) {
      // Large-scale maria vs highland colour from smooth macro noise
      float macro = smoothFbm(p * 1.2 + seed3) * 0.5 + 0.5;
      vec3 highland = hsv2rgb(vec3(0.08 + uHue*0.04, 0.05 + uSeed*0.06, 0.58 + uSeed*0.08));
      vec3 maria    = hsv2rgb(vec3(0.07 + uHue*0.03, 0.06 + uSeed*0.05, 0.25 + uSeed*0.06));
      albedo = mix(maria, highland, smoothstep(0.35, 0.70, macro));

      // Crater colouring — dark floors, bright rims (ejecta)
      float crFld = craterField(p, uSeed,       0.28, 4);
      float crMed = craterField(p, uSeed + 3.0, 0.14, 5);
      float crSml = craterField(p, uSeed + 7.0, 0.07, 4);
      float cr = clamp(crFld * 0.6 + crMed * 0.3 + crSml * 0.1, -1.0, 1.0);
      albedo = mix(albedo, maria * 0.5,     max(-cr, 0.0));
      albedo = mix(albedo, highland * 1.25, max( cr, 0.0) * 0.7);

      specStr = 0.04; specPow = 8.0;

    // ════════════════════════════════════════════════════════
    //  TYPE 1: EUROPA
    //  Bright white-blue ice, distinctive red-brown crack linea
    // ════════════════════════════════════════════════════════
    } else if (uMoonType < 1.5) {
      vec3 iceWhite = hsv2rgb(vec3(0.57 + uHue*0.04, 0.06 + uSeed*0.05, 0.92 + uSeed*0.05));
      vec3 iceBlue  = hsv2rgb(vec3(0.60 + uHue*0.04, 0.18 + uSeed*0.08, 0.78 + uSeed*0.08));
      float bg = smoothFbm(p * 1.1 + seed3) * 0.5 + 0.5;
      albedo = mix(iceWhite, iceBlue, smoothstep(0.4, 0.7, bg));

      // Red-brown crack network (linea) — low-frequency crack pattern
      float crack1 = abs(snoise(p * 3.2 + seed3));
      float crack2 = abs(snoise(p * 4.8 + seed3.yzx + vec3(1.7)));
      float crackMask = smoothstep(0.12, 0.04, crack1) + smoothstep(0.10, 0.03, crack2) * 0.6;
      crackMask = clamp(crackMask, 0.0, 1.0);
      vec3 linea = hsv2rgb(vec3(0.05 + uHue*0.04, 0.58 + uSeed*0.15, 0.38 + uSeed*0.10));
      albedo = mix(albedo, linea, crackMask * 0.85);

      // Very rare small impacts
      float crSml = craterField(p, uSeed + 10.0, 0.05, 3);
      albedo = mix(albedo, iceWhite * 0.80, max(-crSml, 0.0) * 0.3);

      specStr = 0.35; specPow = 55.0;
      rimStr = 0.18; rimCol = vec3(0.70, 0.86, 1.0);

    // ════════════════════════════════════════════════════════
    //  TYPE 2: IO
    //  Yellow-orange-white sulfur plains, dark calderas, lava glow
    // ════════════════════════════════════════════════════════
    } else if (uMoonType < 2.5) {
      float bg = smoothFbm(p * 1.4 + seed3) * 0.5 + 0.5;
      vec3 sulphurY = hsv2rgb(vec3(0.13 + uHue*0.04, 0.75 + uSeed*0.10, 0.82 + uSeed*0.08));
      vec3 sulphurO = hsv2rgb(vec3(0.06 + uHue*0.03, 0.80 + uSeed*0.10, 0.68 + uSeed*0.08));
      vec3 paleSulf = hsv2rgb(vec3(0.15 + uHue*0.03, 0.35 + uSeed*0.10, 0.90 + uSeed*0.05));
      albedo = mix(sulphurO, sulphurY, smoothstep(0.3, 0.7, bg));
      // Pale sulfur dioxide frost patches
      float frost = smoothstep(0.65, 0.80, smoothFbm(p * 2.0 + seed3.zxy) * 0.5 + 0.5);
      albedo = mix(albedo, paleSulf, frost * 0.45);

      // Calderas — dark basalt floor, subtle rim, animated lava glow
      for (int i = 0; i < 5; i++) {
        float fi = float(i);
        vec3 c = normalize(vec3(
          sin(uSeed * 111.3 + fi * 59.1),
          cos(uSeed * 43.7  + fi * 81.3) * 0.7,
          sin(uSeed * 77.2  + fi * 29.6)
        ));
        float r = 0.07 + fract(uSeed * 8.9 + fi * 0.53) * 0.10;
        float d = acos(clamp(dot(p, c), -1.0, 1.0)) / r;
        if (d < 1.2) {
          float caldera = smoothstep(1.0, 0.0, d);
          // Dark basalt floor
          vec3 basalt = hsv2rgb(vec3(0.05 + uHue*0.02, 0.30, 0.12 + uSeed*0.06));
          albedo = mix(albedo, basalt, caldera * 0.85);
          // Lava glow at hottest part — animated
          float glow = smoothstep(0.35, 0.0, d);
          float pulse = 0.75 + 0.25 * sin(uTime * 1.2 + fi * 2.5 + uSeed * 6.28);
          vec3 lava = mix(vec3(1.0, 0.15, 0.0), vec3(1.0, 0.70, 0.1), caldera);
          albedo += lava * glow * 0.55 * pulse;
        }
      }
      specStr = 0.06; specPow = 10.0;

    // ════════════════════════════════════════════════════════
    //  TYPE 3: CALLISTO
    //  Very dark ancient surface, saturated with craters at all scales
    // ════════════════════════════════════════════════════════
    } else if (uMoonType < 3.5) {
      float bg = smoothFbm(p * 1.3 + seed3) * 0.5 + 0.5;
      vec3 darkBase = hsv2rgb(vec3(0.06 + uHue*0.04, 0.25 + uSeed*0.10, 0.14 + uSeed*0.05));
      vec3 midBrown = hsv2rgb(vec3(0.07 + uHue*0.03, 0.18 + uSeed*0.08, 0.26 + uSeed*0.06));
      albedo = mix(darkBase, midBrown, smoothstep(0.35, 0.70, bg));

      // Multi-scale cratering
      float crLg = craterField(p, uSeed,        0.22, 7) * 0.55;
      float crMd = craterField(p, uSeed + 4.0,  0.12, 7) * 0.30;
      float crSm = craterField(p, uSeed + 9.0,  0.06, 6) * 0.15;
      float cr = clamp(crLg + crMd + crSm, -1.0, 1.0);
      // Crater floors even darker
      albedo = mix(albedo, darkBase * 0.40, max(-cr, 0.0) * 0.70);
      // Bright ejecta/rim — ice revealed by impact
      vec3 iceEjecta = hsv2rgb(vec3(0.60, 0.08, 0.62 + uSeed*0.10));
      albedo = mix(albedo, iceEjecta, max(cr, 0.0) * 0.55);

      specStr = 0.03; specPow = 6.0;

    // ════════════════════════════════════════════════════════
    //  TYPE 4: GANYMEDE
    //  Mixed terrain — dark grooved regions + icy bright patches
    // ════════════════════════════════════════════════════════
    } else if (uMoonType < 4.5) {
      float bg = smoothFbm(p * 1.2 + seed3) * 0.5 + 0.5;
      vec3 dark  = hsv2rgb(vec3(0.08 + uHue*0.04, 0.20 + uSeed*0.08, 0.24 + uSeed*0.06));
      vec3 light = hsv2rgb(vec3(0.58 + uHue*0.04, 0.06 + uSeed*0.06, 0.68 + uSeed*0.10));
      // Large-scale dark/light terrain dichotomy
      float terrain = smoothstep(0.38, 0.65, bg);
      albedo = mix(dark, light, terrain);

      // Groove pattern in dark regions
      vec3 gDir = normalize(vec3(sin(uSeed*31.7), cos(uSeed*19.3), sin(uSeed*53.9)));
      float groove = sin(dot(p, gDir) * 14.0 + uSeed * 6.28) * 0.5 + 0.5;
      float grv = groove * (1.0 - terrain);  // only on dark terrain
      albedo = mix(albedo, dark * 0.6, grv * smoothstep(0.45, 0.55, groove) * 0.5);
      albedo = mix(albedo, light * 0.8, grv * smoothstep(0.55, 0.65, groove) * 0.3);

      // Craters
      float cr = craterField(p, uSeed, 0.16, 5);
      albedo = mix(albedo, dark * 0.45,  max(-cr, 0.0) * 0.65);
      albedo = mix(albedo, light * 1.15, max( cr, 0.0) * 0.55);

      specStr = 0.10; specPow = 18.0;
      rimStr = 0.07; rimCol = light;

    // ════════════════════════════════════════════════════════
    //  TYPE 5: TITAN
    //  Smooth orange-amber, atmospheric haze, subtle dune banding
    // ════════════════════════════════════════════════════════
    } else {
      float bg  = smoothFbm(p * 0.9 + seed3 + vec3(uTime * 0.002, 0.0, 0.0)) * 0.5 + 0.5;
      float bg2 = smoothFbm(p * 1.6 + seed3.yzx) * 0.5 + 0.5;
      float hazeHue = fract(0.04 + uHue * 0.12);
      vec3 deep  = hsv2rgb(vec3(hazeHue,        0.72 + uSeed*0.12, 0.35 + uSeed*0.08));
      vec3 amber = hsv2rgb(vec3(hazeHue + 0.03, 0.58 + uSeed*0.12, 0.55 + uSeed*0.10));
      vec3 pale  = hsv2rgb(vec3(hazeHue + 0.07, 0.32 + uSeed*0.10, 0.72 + uSeed*0.08));
      albedo = mix(deep, amber, smoothstep(0.3, 0.65, bg));
      albedo = mix(albedo, pale, smoothstep(0.60, 0.80, bg2) * 0.35);

      // Latitudinal banding (like Titan's haze layers)
      float lat = p.y;
      float band = sin(lat * 5.0 + smoothFbm(p * 1.2 + seed3) * 0.8) * 0.5 + 0.5;
      albedo = mix(albedo, amber * 0.85, smoothstep(0.45, 0.55, band) * 0.20);

      specStr = 0.08; specPow = 20.0;
      rimStr = 0.40;
      rimCol = hsv2rgb(vec3(hazeHue + 0.06, 0.40 + uSeed*0.08, 0.90 + uSeed*0.06));
    }

    // ── Diffuse ───────────────────────────────────────────
    vec3 color = albedo * NdotL;

    // ── Specular ──────────────────────────────────────────
    if (specPow > 0.0) {
      vec3 halfV = normalize(lightDir + viewDir);
      float spec = pow(max(dot(bumpN, halfV), 0.0), specPow);
      color += vec3(1.0, 0.97, 0.90) * spec * specStr * day;
    }

    // ── Atmosphere / fresnel rim ──────────────────────────
    float vdn      = max(dot(bumpN, viewDir), 0.0);
    float fres     = pow(1.0 - vdn, 3.5);
    float sunFace  = smoothstep(-0.1, 0.3, dot(bumpN, lightDir));
    if (rimStr > 0.0) {
      color += rimCol * fres * rimStr * sunFace;
    }
    // Subtle edge darkening for all types
    float edgeDark = pow(1.0 - vdn, 2.0) * 0.08;
    color = mix(color, vec3(0.0), edgeDark);

    // ── Shadow from host planet ───────────────────────────
    // Ray from fragment toward sun (origin); check if planet sphere blocks the light.
    if (uHostRadius > 0.0) {
      vec3 toSun = normalize(uStarPos - vWorldPos);
      vec3 oc    = vWorldPos - uHostPos;
      float b    = dot(oc, toSun);
      float c    = dot(oc, oc) - uHostRadius * uHostRadius;
      float disc = b * b - c;
      if (disc > 0.0) {
        float sqrtDisc = sqrt(disc);
        float t1 = -b - sqrtDisc;
        // t1 > small eps means planet is ahead of us toward sun → in shadow
        if (t1 > 0.01) {
          // Soft penumbra: angular radius of planet from fragment vs angular offset
          float distToHost = length(oc);
          float angularR   = uHostRadius / distToHost;
          // How far off-axis are we from the shadow cylinder center?
          // Project oc onto plane perpendicular to toSun → offset
          vec3  onAxis = toSun * dot(oc, toSun);
          float offset = length(oc - onAxis) / distToHost;
          float penumbra = smoothstep(angularR * 1.15, angularR * 0.7, offset);
          color *= mix(1.0, 0.06, penumbra);
        }
      }
    }

    // ── Gamma ─────────────────────────────────────────────
    color = pow(max(color, vec3(0.001)), vec3(1.0 / 2.2));
    gl_FragColor = vec4(color, 1.0);
  }
`;

/* ── Prototype cache: one compiled program for all moons ────────── */
let moonProto: THREE.ShaderMaterial | null = null;

/** Create a moon shader material. moonType 0–5, hue/seed 0–1.
 *  Cloned from a single prototype so Three.js reuses the compiled GPU program. */
export function createMoonMaterial(
  moonType: MoonType,
  hue: number,
  seed: number,
): THREE.ShaderMaterial {
  if (!moonProto) {
    moonProto = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uMoonType:   { value: 0 },
        uHue:        { value: 0 },
        uSeed:       { value: 0 },
        uTime:       { value: 0 },
        uHostPos:    { value: new THREE.Vector3() },
        uHostRadius: { value: 0.0 },
        uStarPos:    { value: new THREE.Vector3(0, 0, 0) },
      },
    });
  }
  const mat = moonProto.clone();
  mat.uniforms.uMoonType   = { value: moonType };
  mat.uniforms.uHue        = { value: hue };
  mat.uniforms.uSeed       = { value: seed };
  mat.uniforms.uTime       = { value: 0 };
  mat.uniforms.uHostPos    = { value: new THREE.Vector3() };
  mat.uniforms.uHostRadius = { value: 0.0 };
  mat.uniforms.uStarPos    = { value: new THREE.Vector3(0, 0, 0) };
  return mat;
}
