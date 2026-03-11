/**
 * Rocky 1 — Dark Obsidian archetype.
 * Near-black surface with subtle metallic/glassy sheen, minimal cratering,
 * smooth volcanic glass appearance, faint mineral veining.
 */

import { PLANET_NOISE, MOON_SHADOW_GLSL } from "../planetNoise";

const HEIGHT_FN = /* glsl */ `
  float typeHeight(vec3 p, vec3 seed3, float seed) {
    float base = fbm(p * 3.0 + seed3) * 0.3;
    float gentle = sin(p.y * 5.0 + p.x * 3.0) * 0.1;
    return (base + gentle) * 0.035;
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
    vec3 displaced = position + normal * h * rad * 0.012;
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
    float lon  = atan(p.z, p.x);
    vec3 seed3 = vec3(uSeed*13.7, uSeed*7.3, uSeed*5.1);

    vec3 lightDir = normalize(uStarPos - vWorldPos);
    vec3 viewDir  = normalize(cameraPosition - vWorldPos);

    float eps  = 0.02;
    float h0   = typeHeight(p, seed3, uSeed);
    float hx   = typeHeight(normalize(p + vec3(eps,0.,0.)), seed3, uSeed);
    float hy   = typeHeight(normalize(p + vec3(0.,eps,0.)), seed3, uSeed);
    vec3 grad  = vec3(hx-h0, hy-h0, 0.) / eps;
    vec3 bumpN = normalize(vWorldNorm + grad * 0.6);

    float NdotL_raw = dot(bumpN, lightDir);
    float day       = smoothstep(-0.03, 0.03, NdotL_raw);
    float NdotL     = max(NdotL_raw, 0.);

    // ── Very dark surface — near-black basalt/obsidian ──
    float hShift = uHue * 0.25 + uSeed * 0.18;
    vec3 obsidian  = hsv(vec3(fract(0.72 + hShift), 0.15, 0.10));
    vec3 darkGlass = hsv(vec3(fract(0.68 + hShift), 0.12, 0.15));
    vec3 sheen     = hsv(vec3(fract(0.65 + hShift), 0.20, 0.22));

    float alt = smoothstep(0.005, 0.035, h0);
    vec3 albedo = mix(obsidian, darkGlass, alt);

    // ── Subtle mineral veining ──
    float vein = fbm(vec3(lon * 6.0 + uSeed, lat * 8.0 + uSeed * 3.0, uSeed * 5.0));
    float veinMask = smoothstep(0.48, 0.52, vein) * smoothstep(0.56, 0.52, vein);
    vec3 veinCol = hsv(vec3(fract(0.55 + hShift), 0.25, 0.25));
    albedo = mix(albedo, veinCol, veinMask * 0.40);

    // ── Faint colour variation — some regions slightly lighter ──
    float regionN = fbm(p * 2.0 + seed3 * 0.5);
    albedo = mix(albedo, sheen, smoothstep(0.4, 0.7, regionN) * 0.20);

    // ── Diffuse ──
    vec3 color = albedo * NdotL;

    // ── Strong specular — glassy/metallic surface ──
    vec3 halfV = normalize(lightDir + viewDir);
    float spec = pow(max(dot(bumpN, halfV), 0.), 60.0);
    vec3 specCol = hsv(vec3(fract(0.60 + hShift), 0.10, 0.80));
    color += specCol * spec * 0.45 * day;

    // ── Secondary broad specular (metallic sheen) ──
    float broadSpec = pow(max(dot(bumpN, halfV), 0.), 8.0);
    color += specCol * 0.3 * broadSpec * 0.10 * day;

    // ── Minimal atmosphere — near-vacuum ──
    float vdn = max(dot(bumpN, viewDir), 0.);
    float faintRim = pow(1.0 - vdn, 5.0) * 0.02;
    color += vec3(0.5, 0.5, 0.6) * faintRim * day;

    color *= 1.0 - moonTransitShadow(vWorldPos) * 0.85;
    color = pow(max(color, vec3(0.001)), vec3(1./2.2));
    gl_FragColor = vec4(color, 1.0);
  }
`;
