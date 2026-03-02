/**
 * Procedural moon shader — 6 distinct moon types, each unique per wallet.
 *
 * Types:
 *   0 = Cratered   (Luna / Mercury — grey regolith, impact craters, ridges)
 *   1 = Icy        (Europa / Enceladus — white-blue, crack trenches, smooth plains)
 *   2 = Volcanic   (Io — yellow-orange, calderas, lava, volcanic peaks)
 *   3 = Dusty      (Callisto — ancient dark-brown, heavy multi-scale craters)
 *   4 = Metallic   (iron-nickel — silver-grey, crystalline ridges, angular facets)
 *   5 = Haze       (Titan — orange-amber, thick atmosphere, gentle dunes)
 *
 * Vertex displacement + matching fragment bump normals give visible topology.
 * All deterministic from uSeed + uHue so same wallet = same look.
 */

import * as THREE from "three";
import { NOISE_GLSL } from "../glsl";

export type MoonType = 0 | 1 | 2 | 3 | 4 | 5;
export const MOON_TYPE_COUNT = 6;

/* ── Shared functions (included in both vertex + fragment) ───────── */
const SHARED_GLSL = /* glsl */ `
  ${NOISE_GLSL}

  /* Procedural craters — returns depth (-1..1) */
  float craters(vec3 p, float seed, float scale, int count) {
    float cr = 0.0;
    for (int i = 0; i < 6; i++) {
      if (i >= count) break;
      float fi = float(i);
      vec3 center = normalize(vec3(
        sin(seed * 91.1 + fi * 47.3),
        cos(seed * 37.3 + fi * 83.1),
        sin(seed * 63.7 + fi * 19.9)
      ));
      float r = 0.12 + fract(seed * 7.7 + fi * 0.37) * scale;
      float d = acos(clamp(dot(p, center), -1.0, 1.0)) / r;
      if (d < 1.0) {
        cr += -smoothstep(0.0, 0.55, d) * 0.8 + smoothstep(0.55, 0.95, d) * 0.5;
      }
    }
    return clamp(cr, -1.0, 1.0);
  }

  /* Unified height field — same function drives vertex displacement AND bump */
  float moonHeight(vec3 p, vec3 seed3, float moonType, float seed) {
    float h = 0.0;

    if (moonType < 0.5) {
      // ── CRATERED: deep basins + highland ridges + small craters ──
      h += fbm(p * 3.5 + seed3) * 0.3;
      h += craters(p, seed, 0.20, 6) * 0.6;
      h += craters(p, seed + 3.0, 0.08, 6) * 0.25;
      // Ridged mountains: sharp peaks from folded noise
      float ridge = 1.0 - abs(snoise(p * 5.0 + seed3));
      h += ridge * ridge * 0.35;
    }
    else if (moonType < 1.5) {
      // ── ICY: smooth plains with sharp crack trenches ──
      h += fbm(p * 2.0 + seed3) * 0.15;
      float crack = abs(fbm(p * 12.0 + seed3 * 2.0));
      h -= smoothstep(0.04, 0.0, crack) * 0.6;        // deep cracks
      h += smoothstep(0.08, 0.04, crack) * 0.3;        // ridge walls
      h += craters(p, seed + 10.0, 0.10, 3) * 0.2;
    }
    else if (moonType < 2.5) {
      // ── VOLCANIC: calderas + volcanic peaks ──
      h += fbm(p * 2.0 + seed3) * 0.25;
      float peak = 1.0 - abs(snoise(p * 3.0 + seed3.yzx));
      h += pow(peak, 3.0) * 0.8;                       // sharp peaks
      for (int i = 0; i < 4; i++) {
        float fi = float(i);
        vec3 hotspot = normalize(vec3(
          sin(seed * 123.4 + fi * 67.8),
          cos(seed * 45.6  + fi * 89.0) * 0.6,
          sin(seed * 78.9  + fi * 34.5)
        ));
        float d = acos(clamp(dot(p, hotspot), -1.0, 1.0));
        h -= smoothstep(0.18, 0.02, d) * 0.7;          // caldera pit
        h += smoothstep(0.22, 0.18, d) * 0.3;          // rim
      }
    }
    else if (moonType < 3.5) {
      // ── DUSTY: ancient, multi-scale heavy cratering ──
      h += craters(p, seed, 0.22, 6) * 0.55;
      h += craters(p, seed + 5.0, 0.10, 6) * 0.3;
      h += craters(p, seed + 10.0, 0.05, 6) * 0.15;
      h += fbm(p * 2.8 + seed3) * 0.2;
    }
    else if (moonType < 4.5) {
      // ── METALLIC: crystalline ridges + angular plateaus ──
      float facets = snoise(p * 4.0 + seed3);
      h += abs(facets) * 0.5;                           // angular plateaus
      float ridge1 = 1.0 - abs(snoise(p * 7.0 + seed3.zyx));
      h += pow(ridge1, 4.0) * 0.6;                     // sharp crystal ridges
      h += fbm(p * 6.0 + seed3) * 0.15;
    }
    else {
      // ── HAZE: nearly smooth, gentle undulations ──
      h += fbm(p * 2.0 + seed3) * 0.15;
      h += sin(p.y * 8.0 + fbm(p * 3.0 + seed3) * 2.0) * 0.1;
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
    if      (uMoonType < 0.5) dispScale = 0.12;   // cratered — deep basins
    else if (uMoonType < 1.5) dispScale = 0.05;   // icy — crack ridges only
    else if (uMoonType < 2.5) dispScale = 0.10;   // volcanic — calderas + peaks
    else if (uMoonType < 3.5) dispScale = 0.10;   // dusty — pitted
    else if (uMoonType < 4.5) dispScale = 0.08;   // metallic — angular
    else                       dispScale = 0.025;  // haze — nearly smooth

    vec3 displaced = position + normal * h * radius * dispScale;

    vPos = position;
    vec4 wp = modelMatrix * vec4(displaced, 1.0);
    vWorldPos  = wp.xyz;
    vWorldNorm = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FRAG = /* glsl */ `
  uniform float uMoonType;   // 0–5
  uniform float uHue;        // 0–1 per-wallet colour shift
  uniform float uSeed;       // 0–1 per-wallet noise seed
  uniform float uTime;

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
    vec3 lightDir = normalize(-vWorldPos);
    vec3 viewDir  = normalize(cameraPosition - vWorldPos);

    // ── Type-specific bump normal from shared height field ─
    float eps = 0.015;
    float h0 = moonHeight(p, seed3, uMoonType, uSeed);
    float hx = moonHeight(normalize(p + vec3(eps, 0.0, 0.0)), seed3, uMoonType, uSeed);
    float hy = moonHeight(normalize(p + vec3(0.0, eps, 0.0)), seed3, uMoonType, uSeed);
    vec3 grad = vec3(hx - h0, hy - h0, 0.0) / eps;

    // Strong bump for rocky types, mild for atmospheric
    float bumpStr;
    if      (uMoonType < 0.5) bumpStr = 2.5;   // cratered
    else if (uMoonType < 1.5) bumpStr = 1.5;   // icy
    else if (uMoonType < 2.5) bumpStr = 2.2;   // volcanic
    else if (uMoonType < 3.5) bumpStr = 2.5;   // dusty
    else if (uMoonType < 4.5) bumpStr = 2.0;   // metallic
    else                       bumpStr = 0.5;   // haze

    vec3 bumpN = normalize(vWorldNorm + grad * bumpStr);

    float NdotL = max(dot(bumpN, lightDir), 0.0);
    float day   = smoothstep(-0.03, 0.03, dot(bumpN, lightDir));

    vec3 albedo   = vec3(0.5);
    float specStr = 0.08;
    float specPow = 16.0;
    float rimStr  = 0.0;
    vec3  rimCol  = vec3(0.0);

    // ════════════════════════════════════════════════════════
    //  TYPE 0: CRATERED (Luna / Mercury)
    // ════════════════════════════════════════════════════════
    if (uMoonType < 0.5) {
      float n = fbm(p * 2.5 + seed3) * 0.6 + fbm(p * 8.0 + seed3.yzx) * 0.4;
      float t = smoothstep(0.2, 0.8, n);

      vec3 hiC = hsv2rgb(vec3(fract(uHue * 0.08 + 0.06), 0.08 + uSeed * 0.12, 0.55 + uSeed * 0.15));
      vec3 loC = hsv2rgb(vec3(fract(uHue * 0.08 + 0.08), 0.05 + uSeed * 0.08, 0.22 + uSeed * 0.10));
      albedo = mix(loC, hiC, t);

      float cr = craters(p, uSeed, 0.18, 6);
      albedo = mix(albedo, loC * 0.35, max(-cr, 0.0));
      albedo = mix(albedo, hiC * 1.2,  max( cr, 0.0) * 0.5);

      float frost = smoothstep(0.78, 0.95, abs(p.y)) * step(0.5, uSeed);
      albedo = mix(albedo, vec3(0.88, 0.87, 0.85), frost * 0.5);

      specStr = 0.05;
      specPow = 8.0;

    // ════════════════════════════════════════════════════════
    //  TYPE 1: ICY (Europa / Enceladus)
    // ════════════════════════════════════════════════════════
    } else if (uMoonType < 1.5) {
      float n1 = fbm(p * 3.0 + seed3);
      float n2 = fbm(p * 7.0 + seed3.zxy);

      float iceHue = fract(0.50 + uHue * 0.25);
      vec3 iceWhite = hsv2rgb(vec3(iceHue, 0.05 + uSeed * 0.08, 0.90 + uSeed * 0.05));
      vec3 iceDeep  = hsv2rgb(vec3(fract(iceHue + 0.05), 0.30 + uSeed * 0.15, 0.72 + uSeed * 0.10));
      albedo = mix(iceWhite, iceDeep, smoothstep(0.3, 0.7, n1));

      float crack = abs(fbm(p * 12.0 + seed3 * 2.0));
      float crackMask = smoothstep(0.02, 0.0, crack) * 0.7;
      vec3 crackCol = hsv2rgb(vec3(fract(uHue * 0.3 + 0.04), 0.50 + uSeed * 0.15, 0.30 + uSeed * 0.10));
      albedo = mix(albedo, crackCol, crackMask);

      float terrain = smoothstep(0.4, 0.6, n2);
      albedo = mix(albedo, iceDeep * 0.85, terrain * 0.2);

      float cr = craters(p, uSeed + 10.0, 0.10, 3);
      albedo = mix(albedo, iceWhite * 0.7, max(-cr, 0.0) * 0.3);

      specStr = 0.30;
      specPow = 48.0;
      rimStr  = 0.15;
      rimCol  = vec3(0.7, 0.85, 1.0);

    // ════════════════════════════════════════════════════════
    //  TYPE 2: VOLCANIC (Io)
    // ════════════════════════════════════════════════════════
    } else if (uMoonType < 2.5) {
      float n = fbm(p * 2.0 + seed3);

      float volHue = fract(0.02 + uHue * 0.16);
      vec3 sulphur = hsv2rgb(vec3(fract(volHue + 0.10), 0.75 + uSeed * 0.15, 0.70 + uSeed * 0.10));
      vec3 pale    = hsv2rgb(vec3(fract(volHue + 0.14), 0.30 + uSeed * 0.15, 0.85 + uSeed * 0.08));
      vec3 dark    = hsv2rgb(vec3(fract(volHue - 0.02), 0.65 + uSeed * 0.15, 0.20 + uSeed * 0.08));

      albedo = mix(sulphur, pale, smoothstep(0.3, 0.7, n));

      float deposits = smoothstep(0.55, 0.70, fbm(p * 5.0 + seed3.yzx));
      albedo = mix(albedo, dark, deposits * 0.6);

      for (int i = 0; i < 4; i++) {
        float fi = float(i);
        vec3 hotspot = normalize(vec3(
          sin(uSeed * 123.4 + fi * 67.8),
          cos(uSeed * 45.6  + fi * 89.0) * 0.6,
          sin(uSeed * 78.9  + fi * 34.5)
        ));
        float d = acos(clamp(dot(p, hotspot), -1.0, 1.0));
        float caldera = smoothstep(0.15, 0.02, d);
        float glow    = smoothstep(0.25, 0.05, d);
        vec3 lavaCol = mix(vec3(1.0, 0.3, 0.0), vec3(1.0, 0.8, 0.2), caldera);
        albedo = mix(albedo, dark * 0.5, caldera * 0.6);
        albedo += lavaCol * glow * 0.5 * (0.8 + 0.2 * sin(uTime * 1.5 + fi * 2.0));
      }

      specStr = 0.08;
      specPow = 12.0;

    // ════════════════════════════════════════════════════════
    //  TYPE 3: DUSTY (Callisto)
    // ════════════════════════════════════════════════════════
    } else if (uMoonType < 3.5) {
      float n = fbm(p * 2.8 + seed3) * 0.55 + fbm(p * 6.0 + seed3.yzx) * 0.45;
      float t = smoothstep(0.25, 0.75, n);

      float dustHue = fract(0.05 + uHue * 0.07);
      vec3 darkBrown = hsv2rgb(vec3(dustHue, 0.30 + uSeed * 0.15, 0.15 + uSeed * 0.06));
      vec3 midBrown  = hsv2rgb(vec3(fract(dustHue + 0.03), 0.22 + uSeed * 0.12, 0.28 + uSeed * 0.08));
      vec3 lightDust = hsv2rgb(vec3(fract(dustHue + 0.06), 0.16 + uSeed * 0.10, 0.38 + uSeed * 0.10));
      albedo = mix(darkBrown, midBrown, t);
      albedo = mix(albedo, lightDust, smoothstep(0.65, 0.85, n) * 0.4);

      float cr = craters(p, uSeed, 0.22, 6);
      cr += craters(p, uSeed + 5.0, 0.10, 6) * 0.5;
      cr = clamp(cr, -1.0, 1.0);
      albedo = mix(albedo, darkBrown * 0.5, max(-cr, 0.0) * 0.5);
      albedo = mix(albedo, lightDust * 1.1, max(cr, 0.0) * 0.3);

      float rays = abs(fbm(p * 14.0 + seed3 * 3.0));
      float rayMask = smoothstep(0.04, 0.0, rays) * 0.25;
      albedo = mix(albedo, lightDust * 1.3, rayMask);

      specStr = 0.03;
      specPow = 6.0;

    // ════════════════════════════════════════════════════════
    //  TYPE 4: METALLIC (iron-nickel)
    // ════════════════════════════════════════════════════════
    } else if (uMoonType < 4.5) {
      float n1 = fbm(p * 3.0 + seed3);
      float n2 = fbm(p * 9.0 + seed3.zyx);

      float metHue = fract(uHue * 0.7 + 0.55);
      vec3 silver   = hsv2rgb(vec3(metHue, 0.04 + uSeed * 0.10, 0.68 + uSeed * 0.12));
      vec3 darkIron = hsv2rgb(vec3(fract(metHue - 0.02), 0.08 + uSeed * 0.08, 0.30 + uSeed * 0.10));
      vec3 rust     = hsv2rgb(vec3(fract(metHue + 0.40), 0.40 + uSeed * 0.15, 0.35 + uSeed * 0.10));

      albedo = mix(darkIron, silver, smoothstep(0.3, 0.7, n1));

      float facets = abs(snoise(p * 6.0 + seed3));
      float facetEdge = smoothstep(0.05, 0.0, facets);
      albedo = mix(albedo, silver * 1.3, facetEdge * 0.3);

      float rustPatch = smoothstep(0.5, 0.7, n2);
      albedo = mix(albedo, rust, rustPatch * 0.35);

      float cr = craters(p, uSeed + 20.0, 0.12, 4);
      albedo = mix(albedo, darkIron * 0.6, max(-cr, 0.0) * 0.4);

      specStr = 0.45;
      specPow = 64.0;
      rimStr  = 0.08;
      rimCol  = silver;

    // ════════════════════════════════════════════════════════
    //  TYPE 5: HAZE (Titan)
    // ════════════════════════════════════════════════════════
    } else {
      float n = fbm(p * 1.8 + seed3 + vec3(uTime * 0.003, 0.0, 0.0));
      float n2 = fbm(p * 4.0 + seed3.yzx + vec3(0.0, uTime * 0.005, 0.0));

      float hazeHue = fract(0.03 + uHue * 0.30);
      vec3 deepOrange = hsv2rgb(vec3(hazeHue, 0.65 + uSeed * 0.15, 0.40 + uSeed * 0.10));
      vec3 amber      = hsv2rgb(vec3(fract(hazeHue + 0.04), 0.48 + uSeed * 0.15, 0.58 + uSeed * 0.12));
      vec3 paleGold   = hsv2rgb(vec3(fract(hazeHue + 0.08), 0.28 + uSeed * 0.12, 0.75 + uSeed * 0.10));

      albedo = mix(deepOrange, amber, smoothstep(0.3, 0.6, n));
      albedo = mix(albedo, paleGold, smoothstep(0.5, 0.8, n2) * 0.35);

      float lat = p.y;
      float bands = sin(lat * 12.0 + n * 2.0) * 0.5 + 0.5;
      albedo = mix(albedo, amber * 0.8, smoothstep(0.4, 0.6, bands) * 0.2);

      float surface = fbm(p * 8.0 + seed3 * 4.0);
      albedo = mix(albedo, deepOrange * 0.6, smoothstep(0.6, 0.8, surface) * 0.15);

      specStr = 0.12;
      specPow = 24.0;
      rimStr  = 0.35;
      rimCol  = hsv2rgb(vec3(fract(hazeHue + 0.06), 0.40 + uSeed * 0.10, 0.85 + uSeed * 0.08));
    }

    // ── Diffuse ───────────────────────────────────────────
    vec3 color = albedo * (0.06 + NdotL * 0.94);

    // ── Specular ──────────────────────────────────────────
    if (specPow > 0.0) {
      vec3 halfV = normalize(lightDir + viewDir);
      float spec = pow(max(dot(bumpN, halfV), 0.0), specPow);
      color += vec3(1.0, 0.97, 0.90) * spec * specStr * day;
    }

    // ── Atmosphere / fresnel rim ──────────────────────────
    float vdn  = max(dot(bumpN, viewDir), 0.0);
    float fres = pow(1.0 - vdn, 3.5);
    if (rimStr > 0.0) {
      color += rimCol * fres * rimStr;
    }
    // Subtle edge darkening for all types
    float edgeDark = pow(1.0 - vdn, 2.0) * 0.08;
    color = mix(color, vec3(0.0), edgeDark);

    // ── Gamma ─────────────────────────────────────────────
    color = pow(max(color, vec3(0.001)), vec3(1.0 / 2.2));
    gl_FragColor = vec4(color, 1.0);
  }
`;

/** Create a moon shader material. moonType 0–5, hue/seed 0–1. */
export function createMoonMaterial(
  moonType: MoonType,
  hue: number,
  seed: number,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uMoonType: { value: moonType },
      uHue:      { value: hue },
      uSeed:     { value: seed },
      uTime:     { value: 0 },
    },
  });
}
