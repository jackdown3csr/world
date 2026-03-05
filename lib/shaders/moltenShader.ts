/**
 * Molten planet shader — vesting system.
 * Cooling lava crust with a glowing multi-scale crack network.
 * Active plate tectonics; magma seeps through fractures.
 */

import { PLANET_NOISE, MOON_SHADOW_GLSL } from "./planetNoise";

/* ── Height function ──────────────────────────────────────── */

const HEIGHT_FN = /* glsl */ `
  float typeHeight(vec3 p, vec3 seed3, float seed) {
    float h = 0.0;
    // Large plate-like slabs
    h += fbm(p * 1.8 + seed3) * 0.30;
    // Mid-scale surface bulge
    h += fbm(p * 4.5 + seed3.yzx) * 0.12;
    // Fine texture
    h += snoise(p * 10.0 + seed3.zxy) * 0.04;
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

    vec3 displaced = position + normal * h * rad * 0.018;

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
    vec3 seed3 = vec3(uSeed*13.7, uSeed*7.3, uSeed*5.1);

    // ── Lighting ─────────────────────────────────────────
    vec3 lightDir = normalize(uStarPos - vWorldPos);
    vec3 viewDir  = normalize(cameraPosition - vWorldPos);

    // ── Crack network ─────────────────────────────────────
    // "1 - |snoise|" creates ridge/fold networks at zero-crossings of noise.
    // High pow() exponent = only the sharpest ridges survive → narrow cracks.

    // Very slow drift so cracks appear to shift and breathe over time
    float t  = uTime * 0.04;
    vec3  tp = p + vec3(sin(t * 0.7), cos(t * 0.5), sin(t * 0.3)) * 0.04;

    // Large tectonic plate boundaries
    float l1 = 1.0 - abs(snoise(tp * 2.1 + seed3));
    float largeCrack = pow(max(l1, 0.0), 5.0);

    // Medium fractures between plates
    float l2 = 1.0 - abs(snoise(tp * 4.8 + seed3.yzx + vec3(3.1, 1.7, 2.3)));
    float medCrack = pow(max(l2, 0.0), 7.0);

    // Fine surface cracks (no time drift — these are stable surface detail)
    float l3 = 1.0 - abs(snoise(p * 11.0 + seed3.zxy + vec3(7.3, 5.1, 9.7)));
    float smallCrack = pow(max(l3, 0.0), 10.0);

    // Combined crack intensity: 0 = cooled crust, 1 = active magma vein
    float crack = max(largeCrack * 0.85, max(medCrack * 0.60, smallCrack * 0.25));

    // Slow heat pulse — all cracks breathe together
    float pulse = 0.5 + 0.5 * sin(uTime * 0.18 + uSeed * 6.28);
    crack *= mix(0.85, 1.0, pulse);

    // ── Cooling crust albedo ─────────────────────────────
    float crustNoise = fbm(p * 3.0 + seed3) * 0.5 + 0.5;
    vec3 crustDark  = hsv(vec3(0.02 + uHue * 0.04, 0.28, 0.07));  // near-black basalt
    vec3 crustLight = hsv(vec3(0.05 + uHue * 0.04, 0.22, 0.17));  // dark grey lava rock
    vec3 crustColor = mix(crustDark, crustLight, crustNoise);

    // ── Magma color by temperature ───────────────────────
    // Crack intensity maps to a temperature gradient:
    //   1.0 → white-yellow (hottest)  0.6 → orange  0.0 → deep red (cooling edge)
    vec3 magmaHot  = hsv(vec3(0.13 + uHue * 0.03, 0.75, 1.00));  // yellow-white core
    vec3 magmaMid  = hsv(vec3(0.06 + uHue * 0.03, 0.90, 0.95));  // orange
    vec3 magmaCool = hsv(vec3(0.01 + uHue * 0.02, 0.88, 0.52));  // deep red

    vec3 magmaColor = mix(
      mix(magmaCool, magmaMid, smoothstep(0.0, 0.6, crack)),
      magmaHot,
      smoothstep(0.6, 1.0, crack)
    );

    // ── Blend crust + magma ──────────────────────────────
    float crackBlend = smoothstep(0.05, 0.35, crack);
    vec3 baseColor   = mix(crustColor, magmaColor, crackBlend);

    // ── Diffuse lighting ─────────────────────────────────
    // Crust: normal diffuse from star.  Magma: self-illuminated — barely needs star.
    float NdotL = max(dot(vWorldNorm, lightDir), 0.0);
    float diffuse = mix(
      NdotL * 0.70 + 0.04,  // crust: diffuse + tiny ambient
      0.88,                  // magma: nearly constant (self-lit)
      crackBlend
    );
    vec3 color = baseColor * diffuse;

    // ── Emissive glow ─────────────────────────────────────
    // Crack glow independent of star position — intrinsic luminosity
    float emissive = crack * crack * 1.5;
    color += magmaColor * emissive * 0.55;

    // ── Heat-shimmer rim ─────────────────────────────────
    float vdn = max(dot(vWorldNorm, viewDir), 0.0);
    float rim = pow(1.0 - vdn, 3.5);
    color += magmaMid * rim * 0.10;

    // ── Specular on cooled crust (obsidian sheen) ────────
    vec3  halfV = normalize(lightDir + viewDir);
    float spec  = pow(max(dot(vWorldNorm, halfV), 0.0), 28.0)
                  * (1.0 - crackBlend) * NdotL;
    color += vec3(0.75, 0.65, 0.55) * spec * 0.10;

    // ── Moon transit shadows ──────────────────────────────
    color *= 1.0 - moonTransitShadow(vWorldPos) * 0.70;

    // ── Gamma ─────────────────────────────────────────────
    color = pow(max(color, vec3(0.0)), vec3(1.0 / 2.2));
    gl_FragColor = vec4(color, 1.0);
  }
`;
