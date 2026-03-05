/**
 * Lava Ocean planet shader — vesting system.
 * Inverted terrestrial: seas of molten rock, islands of cooling crust.
 * Day side — dark obsidian continents criss-crossed with glowing cracks.
 * Night side — the oceans glow by themselves; no city lights, just magma.
 */

import { PLANET_NOISE, MOON_SHADOW_GLSL } from "./planetNoise";

/* ── Height function ──────────────────────────────────────── */

const HEIGHT_FN = /* glsl */ `
  float typeHeight(vec3 p, vec3 seed3, float seed) {
    float h = 0.0;
    // Plate-like continents
    float continent = fbm(p * 1.8 + seed3);
    h += max(continent - 0.08, 0.0) * 1.4;
    // Ridge detail on crust
    float ridge = 1.0 - abs(snoise(p * 5.5 + seed3.yzx));
    h += ridge * ridge * 0.15 * step(0.08, continent);
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

    vec3 displaced = position + normal * h * rad * 0.022;

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
    float day       = smoothstep(-0.10, 0.10, NdotL_raw);
    float NdotL     = max(NdotL_raw, 0.);

    // ── Ocean / crust mask ───────────────────────────────
    // landN > seaLevel → crust island; landN < seaLevel → lava ocean
    float landN    = fbm(p * 1.8 + seed3) * 0.65 + fbm(p * 5.0 + seed3.zxy) * 0.35;
    float seaLevel = 0.38 + uVariant * 0.18;
    // oceanMask: 1 = lava ocean, 0 = crust island
    float oceanMask = 1.0 - smoothstep(seaLevel - 0.07, seaLevel + 0.07, landN);

    // ── Slow lava flow animation ─────────────────────────
    // Drift the ocean noise slowly to simulate convection currents
    float flowT = uTime * 0.012;
    vec3  flowP = p + vec3(
      sin(flowT * 0.71 + uSeed * 3.1) * 0.06,
      cos(flowT * 0.53 + uSeed * 5.7) * 0.06,
      sin(flowT * 0.37 + uSeed * 2.3) * 0.06
    );
    float flowNoise = fbm(flowP * 3.5 + seed3.yzx) * 0.5 + 0.5;

    // Temperature variation across the lava ocean surface
    float lavaTemp = mix(0.55, 1.0, smoothstep(0.3, 0.8, flowNoise));
    lavaTemp *= oceanMask;  // only in ocean area

    // ── Lava ocean color ─────────────────────────────────
    // Temperature gradient: deep hot core → cooler surface channels
    vec3 lavaHot  = hsv(vec3(0.13 + uHue * 0.03, 0.70, 1.00));  // yellow-orange
    vec3 lavaMid  = hsv(vec3(0.06 + uHue * 0.03, 0.88, 0.90));  // orange
    vec3 lavaCool = hsv(vec3(0.01 + uHue * 0.02, 0.85, 0.45));  // dark red channels

    vec3 lavaColor = mix(
      mix(lavaCool, lavaMid, smoothstep(0.3, 0.7, lavaTemp)),
      lavaHot,
      smoothstep(0.75, 1.0, lavaTemp)
    );

    // ── Crust color ───────────────────────────────────────
    vec3 crustDark  = hsv(vec3(0.03 + uHue * 0.03, 0.20, 0.09));  // near-black basalt
    vec3 crustLight = hsv(vec3(0.05 + uHue * 0.03, 0.18, 0.20));  // grey cooled rock

    float crustNoise = fbm(p * 4.0 + seed3.zxy) * 0.5 + 0.5;
    vec3 crustColor  = mix(crustDark, crustLight, crustNoise);

    // ── Crust boundary cracks ─────────────────────────────
    // Where ocean meets crust (mask gradient) = active fracture zones, glowing bright
    float boundaryMask = smoothstep(0.0, 0.12, oceanMask) * smoothstep(1.0, 0.88, oceanMask);
    float crackN = 1.0 - abs(snoise(p * 6.5 + seed3 + vec3(uTime * 0.025)));
    float crack  = pow(max(crackN, 0.0), 8.0) * boundaryMask;
    vec3  crackGlow = hsv(vec3(0.07 + uHue * 0.03, 0.85, 1.0));

    // ── Base albedo ───────────────────────────────────────
    vec3 albedo = mix(crustColor, lavaColor, oceanMask);

    // ── Diffuse lighting ─────────────────────────────────
    // Lava ocean: self-lit, barely needs star.  Crust: normal diffuse.
    float diffuse = mix(
      NdotL * 0.75 + 0.05,  // crust — lit by star
      0.85,                  // lava — self-illuminated
      oceanMask
    );
    vec3 color = albedo * diffuse;

    // ── Emissive: lava ocean glow ─────────────────────────
    // Glow is always on — the hotter the surface, the brighter it shines
    color += lavaColor * lavaTemp * oceanMask * 0.60;

    // ── Emissive: boundary crack glow ────────────────────
    color += crackGlow * crack * 0.80;

    // ── Night side: lava is the only light source ────────
    // On the night hemisphere the ocean still glows intensely
    float nightMask = 1.0 - day;
    color += lavaColor * lavaTemp * oceanMask * nightMask * 0.45;

    // ── Specular on crust (obsidian sheen) ───────────────
    vec3  halfV  = normalize(lightDir + viewDir);
    float spec   = pow(max(dot(bumpN, halfV), 0.0), 64.0)
                   * (1.0 - oceanMask) * NdotL;
    color += vec3(0.8, 0.75, 0.7) * spec * 0.12;

    // ── Heat-haze rim ────────────────────────────────────
    float vdn = max(dot(vWorldNorm, viewDir), 0.0);
    float rim = pow(1.0 - vdn, 3.5);
    color += lavaMid * rim * oceanMask * 0.12;

    // Thin bright limb on day side
    float dayRim = rim * day * 0.07;
    color += hsv(vec3(0.06 + uHue * 0.03, 0.6, 1.0)) * dayRim;

    // ── Moon transit shadows ──────────────────────────────
    color *= 1.0 - moonTransitShadow(vWorldPos) * 0.70;

    // ── Gamma ─────────────────────────────────────────────
    color = pow(max(color, vec3(0.0)), vec3(1.0 / 2.2));
    gl_FragColor = vec4(color, 1.0);
  }
`;
