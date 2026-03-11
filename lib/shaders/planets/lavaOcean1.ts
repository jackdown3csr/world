/**
 * Lava Ocean 1 — Blue-White Hot Lava variant.
 * Higher-temperature lava: blue-white to cyan magma instead of orange.
 * More extensive dark crust coverage (higher sea level), fewer but wider
 * lava channels, violet atmospheric haze, different visual identity.
 */

import { PLANET_NOISE, MOON_SHADOW_GLSL } from "../planetNoise";

const HEIGHT_FN = /* glsl */ `
  float typeHeight(vec3 p, vec3 seed3, float seed) {
    float continent = fbm(p * 2.2 + seed3);
    float h = max(continent - 0.05, 0.0) * 1.2;
    float ridge = 1.0 - abs(snoise(p * 4.0 + seed3.yzx));
    h += ridge * ridge * 0.12 * step(0.05, continent);
    return h;
  }
`;

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
    vec3 displaced = position + normal * h * rad * 0.020;
    vPos       = position;
    vec4 wp    = modelMatrix * vec4(displaced, 1.0);
    vWorldPos  = wp.xyz;
    vWorldNorm = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const FRAG = /* glsl */ `
  uniform vec3  uStarPos;
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

    vec3 lightDir = normalize(uStarPos - vWorldPos);
    vec3 viewDir  = normalize(cameraPosition - vWorldPos);

    float eps  = 0.02;
    float h0   = typeHeight(p, seed3, uSeed);
    float hx   = typeHeight(normalize(p + vec3(eps,0.,0.)), seed3, uSeed);
    float hy   = typeHeight(normalize(p + vec3(0.,eps,0.)), seed3, uSeed);
    vec3 grad  = vec3(hx-h0, hy-h0, 0.) / eps;
    vec3 bumpN = normalize(vWorldNorm + grad * 0.8);

    float NdotL_raw = dot(bumpN, lightDir);
    float day       = smoothstep(-0.10, 0.10, NdotL_raw);
    float NdotL     = max(NdotL_raw, 0.);

    // ── More extensive crust (higher threshold = more crust visible) ──
    float landN = fbm(p * 2.2 + seed3) * 0.60 + fbm(p * 6.0 + seed3.zxy) * 0.40;
    float seaLevel = 0.32;
    float oceanMask = 1.0 - smoothstep(seaLevel - 0.06, seaLevel + 0.06, landN);

    // ── Wider lava channels with slow flow ──
    float flowT = uTime * 0.010;
    vec3 flowP = p + vec3(
      sin(flowT * 0.61 + uSeed * 4.3) * 0.05,
      cos(flowT * 0.47 + uSeed * 7.1) * 0.05,
      sin(flowT * 0.31 + uSeed * 2.9) * 0.05
    );
    float flowNoise = fbm(flowP * 2.8 + seed3.yzx) * 0.5 + 0.5;
    float lavaTemp  = mix(0.50, 1.0, smoothstep(0.25, 0.75, flowNoise)) * oceanMask;

    // ── Blue-white hot lava palette ──
    vec3 lavaHot  = hsv(vec3(0.55 + uHue * 0.08 + uSeed * 0.06, 0.15, 1.00));  // near-white blue
    vec3 lavaMid  = hsv(vec3(0.58 + uHue * 0.08 + uSeed * 0.06, 0.45, 0.90));  // cyan-blue
    vec3 lavaCool = hsv(vec3(0.62 + uHue * 0.08 + uSeed * 0.06, 0.60, 0.50));  // darker blue

    vec3 lavaColor = mix(
      mix(lavaCool, lavaMid, smoothstep(0.3, 0.7, lavaTemp)),
      lavaHot,
      smoothstep(0.78, 1.0, lavaTemp)
    );

    // ── Dark crust with violet tint ──
    vec3 crustDark  = hsv(vec3(0.75 + uHue * 0.08 + uSeed * 0.06, 0.22, 0.08));
    vec3 crustLight = hsv(vec3(0.70 + uHue * 0.08 + uSeed * 0.06, 0.18, 0.18));
    float crustNoise = fbm(p * 5.0 + seed3.zxy) * 0.5 + 0.5;
    vec3 crustColor = mix(crustDark, crustLight, crustNoise);

    // ── Wide boundary fissures ──
    float boundaryMask = smoothstep(0.0, 0.15, oceanMask) * smoothstep(1.0, 0.85, oceanMask);
    float fissN = 1.0 - abs(snoise(p * 5.0 + seed3 + vec3(uTime * 0.020)));
    float fissure = pow(max(fissN, 0.0), 6.0) * boundaryMask;
    vec3 fissGlow = hsv(vec3(0.56 + uHue * 0.08 + uSeed * 0.06, 0.50, 1.0));

    vec3 albedo = mix(crustColor, lavaColor, oceanMask);

    // ── Lighting ──
    float diffuse = mix(NdotL * 0.70 + 0.05, 0.80, oceanMask);
    vec3 color = albedo * diffuse;

    // Emissive lava + fissures
    color += lavaColor * lavaTemp * oceanMask * 0.55;
    color += fissGlow * fissure * 0.75;

    // Night glow
    float nightMask = 1.0 - day;
    color += lavaColor * lavaTemp * oceanMask * nightMask * 0.50;

    // Crust specular
    vec3 halfV = normalize(lightDir + viewDir);
    float spec = pow(max(dot(bumpN, halfV), 0.0), 50.0) * (1.0 - oceanMask) * NdotL;
    color += vec3(0.75, 0.72, 0.82) * spec * 0.14;

    // ── Violet atmospheric haze ──
    float vdn = max(dot(vWorldNorm, viewDir), 0.0);
    float rim = pow(1.0 - vdn, 3.0);
    vec3 hazeCol = hsv(vec3(0.75 + uHue * 0.08 + uSeed * 0.06, 0.50, 0.88));
    color += hazeCol * rim * 0.10;
    color += lavaMid * rim * oceanMask * 0.08;
    color += hazeCol * rim * day * 0.06;

    color *= 1.0 - moonTransitShadow(vWorldPos) * 0.70;
    color = pow(max(color, vec3(0.0)), vec3(1.0 / 2.2));
    gl_FragColor = vec4(color, 1.0);
  }
`;
