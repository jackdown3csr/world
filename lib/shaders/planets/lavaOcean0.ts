/**
 * Lava Ocean 0 — Classic Orange Magma variant.
 * Dark obsidian crust islands, orange/red magma seas, glowing boundary
 * cracks, self-lit night side, convective lava flow animation.
 */

import { PLANET_NOISE, MOON_SHADOW_GLSL } from "../planetNoise";

const HEIGHT_FN = /* glsl */ `
  float typeHeight(vec3 p, vec3 seed3, float seed) {
    float continent = fbm(p * 1.8 + seed3);
    float h = max(continent - 0.08, 0.0) * 1.4;
    float ridge = 1.0 - abs(snoise(p * 5.5 + seed3.yzx));
    h += ridge * ridge * 0.15 * step(0.08, continent);
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
    vec3 displaced = position + normal * h * rad * 0.022;
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
    vec3 bumpN = normalize(vWorldNorm + grad * 0.9);

    float NdotL_raw = dot(bumpN, lightDir);
    float day       = smoothstep(-0.10, 0.10, NdotL_raw);
    float NdotL     = max(NdotL_raw, 0.);

    // ── Ocean/crust mask ──
    float landN = fbm(p * 1.8 + seed3) * 0.65 + fbm(p * 5.0 + seed3.zxy) * 0.35;
    float seaLevel = 0.38;
    float oceanMask = 1.0 - smoothstep(seaLevel - 0.07, seaLevel + 0.07, landN);

    // ── Lava convection animation ──
    float flowT = uTime * 0.012;
    vec3 flowP = p + vec3(
      sin(flowT * 0.71 + uSeed * 3.1) * 0.06,
      cos(flowT * 0.53 + uSeed * 5.7) * 0.06,
      sin(flowT * 0.37 + uSeed * 2.3) * 0.06
    );
    float flowNoise = fbm(flowP * 3.5 + seed3.yzx) * 0.5 + 0.5;
    float lavaTemp  = mix(0.55, 1.0, smoothstep(0.3, 0.8, flowNoise)) * oceanMask;

    // ── Orange/red lava palette ──
    vec3 lavaHot  = hsv(vec3(0.13 + uHue * 0.08 + uSeed * 0.06, 0.70, 1.00));
    vec3 lavaMid  = hsv(vec3(0.06 + uHue * 0.08 + uSeed * 0.06, 0.88, 0.90));
    vec3 lavaCool = hsv(vec3(0.01 + uHue * 0.02, 0.85, 0.45));

    vec3 lavaColor = mix(
      mix(lavaCool, lavaMid, smoothstep(0.3, 0.7, lavaTemp)),
      lavaHot,
      smoothstep(0.75, 1.0, lavaTemp)
    );

    // ── Crust ──
    vec3 crustDark  = hsv(vec3(0.03 + uHue * 0.08 + uSeed * 0.06, 0.20, 0.09));
    vec3 crustLight = hsv(vec3(0.05 + uHue * 0.08 + uSeed * 0.06, 0.18, 0.20));
    float crustNoise = fbm(p * 4.0 + seed3.zxy) * 0.5 + 0.5;
    vec3 crustColor = mix(crustDark, crustLight, crustNoise);

    // ── Boundary cracks ──
    float boundaryMask = smoothstep(0.0, 0.12, oceanMask) * smoothstep(1.0, 0.88, oceanMask);
    float crackN = 1.0 - abs(snoise(p * 6.5 + seed3 + vec3(uTime * 0.025)));
    float crack  = pow(max(crackN, 0.0), 8.0) * boundaryMask;
    vec3 crackGlow = hsv(vec3(0.07 + uHue * 0.08 + uSeed * 0.06, 0.85, 1.0));

    vec3 albedo = mix(crustColor, lavaColor, oceanMask);

    // ── Lighting ──
    float diffuse = mix(NdotL * 0.75 + 0.05, 0.85, oceanMask);
    vec3 color = albedo * diffuse;

    // Emissive lava + cracks
    color += lavaColor * lavaTemp * oceanMask * 0.60;
    color += crackGlow * crack * 0.80;

    // Night-side lava glow
    float nightMask = 1.0 - day;
    color += lavaColor * lavaTemp * oceanMask * nightMask * 0.45;

    // Crust specular
    vec3 halfV = normalize(lightDir + viewDir);
    float spec = pow(max(dot(bumpN, halfV), 0.0), 64.0) * (1.0 - oceanMask) * NdotL;
    color += vec3(0.8, 0.75, 0.7) * spec * 0.12;

    // Heat-haze rim
    float vdn = max(dot(vWorldNorm, viewDir), 0.0);
    float rim = pow(1.0 - vdn, 3.5);
    color += lavaMid * rim * oceanMask * 0.12;
    color += hsv(vec3(0.06 + uHue * 0.08 + uSeed * 0.06, 0.6, 1.0)) * rim * day * 0.07;

    color *= 1.0 - moonTransitShadow(vWorldPos) * 0.70;
    color = pow(max(color, vec3(0.0)), vec3(1.0 / 2.2));
    gl_FragColor = vec4(color, 1.0);
  }
`;
