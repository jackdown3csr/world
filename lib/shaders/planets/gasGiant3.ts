/**
 * Gas Giant 3 — Storm Giant archetype.
 * Cool blue-grey-white palette, turbulent chaotic surface with multiple
 * vortex systems, minimal banding, anti-cyclonic white ovals,
 * auroral polar glow.
 */

import { PLANET_NOISE, MOON_SHADOW_GLSL } from "../planetNoise";

const HEIGHT_FN = /* glsl */ `
  float typeHeight(vec3 p, vec3 seed3, float seed) {
    return fbm(p * 4.0 + seed3) * 0.012;
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
    vec3 displaced = position + normal * h * rad * 0.003;
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
    vec3 bumpN = normalize(vWorldNorm + grad * 0.05);

    float NdotL_raw = dot(bumpN, lightDir);
    float day       = smoothstep(-0.08, 0.08, NdotL_raw);
    float NdotL     = max(NdotL_raw, 0.);

    // ── Turbulent base texture — high-frequency FBM chaos ──
    float turb = fbm(p * 5.0 + seed3 + uTime * 0.005);
    float t2   = fbm(p * 9.0 + seed3 * 1.3 - uTime * 0.008);
    // Faint residual banding (storm giant still rotates)
    float faintBand = sin(lat * 10.0 + turb * 1.8 + uTime * 0.015) * 0.5 + 0.5;

    // ── Cool blue-grey-white palette ──
    float hShift = uHue * 0.25 + uSeed * 0.18;
    vec3 coldBlue  = hsv(vec3(fract(0.58 + hShift), 0.38, 0.72));
    vec3 stormGrey = hsv(vec3(fract(0.56 + hShift), 0.15, 0.55));
    vec3 cloudWhite = hsv(vec3(fract(0.55 + hShift), 0.06, 0.92));

    vec3 albedo = mix(stormGrey, coldBlue, smoothstep(0.3, 0.7, turb));
    albedo = mix(albedo, cloudWhite, smoothstep(0.5, 0.8, t2) * 0.35);
    // Faint band modulation
    albedo = mix(albedo, coldBlue * 0.8, (1.0 - faintBand) * 0.15);

    // ── Multiple large vortex systems ──
    for(int i = 0; i < 4; i++){
      float vLat = -0.6 + float(i) * 0.35 + fract(uSeed * (1.7 + float(i) * 2.3)) * 0.15;
      float vLon = fract(uSeed * (3.1 + float(i) * 1.1)) * 6.2832;
      float vdx = lon - vLon;
      vdx = vdx - 6.2832 * floor(vdx / 6.2832 + 0.5);
      float vRad = 0.15 + fract(uSeed * (7.3 + float(i))) * 0.12;
      float dist = length(vec2(vdx * 2.0, (lat - vLat) * 3.0));
      float vMask = smoothstep(vRad + 0.08, vRad * 0.3, dist);

      // Spiral arms inside the vortex
      float sAngle = atan(lat - vLat, vdx) + dist * 10.0 - uTime * 0.05;
      float spiral = sin(sAngle * 2.0) * 0.5 + 0.5;

      // Each vortex has slightly different colouring
      vec3 vortexCol = (i < 2)
        ? hsv(vec3(fract(0.60 + hShift), 0.50, 0.42))  // dark blue-grey
        : hsv(vec3(fract(0.54 + hShift), 0.20, 0.82));  // bright blue-white

      albedo = mix(albedo, mix(vortexCol, cloudWhite, spiral * 0.3), vMask * 0.65);
    }

    // ── Anti-cyclonic white ovals — bright patches ──
    for(int j = 0; j < 3; j++){
      float oLat = fract(uSeed * (5.1 + float(j) * 3.7)) * 1.2 - 0.6;
      float oLon = fract(uSeed * (8.3 + float(j) * 2.1)) * 6.2832;
      float odx = lon - oLon;
      odx = odx - 6.2832 * floor(odx / 6.2832 + 0.5);
      float oDist = length(vec2(odx * 4.0, (lat - oLat) * 6.0));
      float oMask = smoothstep(0.35, 0.06, oDist);
      albedo = mix(albedo, cloudWhite, oMask * 0.55);
    }

    // ── Auroral polar glow — faint blue shimmer ──
    float aurora = smoothstep(0.72, 0.95, abs(lat));
    vec3 auroraCol = hsv(vec3(fract(0.55 + hShift), 0.50, 0.85));
    albedo += auroraCol * aurora * 0.10;

    // ── Diffuse ──
    vec3 color = albedo * NdotL;

    // ── Specular — scattered storm tops are reflective ──
    vec3 halfV = normalize(lightDir + viewDir);
    float spec = pow(max(dot(bumpN, halfV), 0.), 22.0);
    color += vec3(0.90, 0.92, 1.) * spec * 0.22 * day;

    // ── Atmosphere Fresnel rim — cool blue ──
    vec3  atmosCol = hsv(vec3(fract(0.57 + hShift), 0.40, 0.92));
    float atmosStr = 0.38 * (1.0 - uHasRing * 0.55);
    float vdn      = max(dot(bumpN, viewDir), 0.);
    float sunFacing = smoothstep(-0.15, 0.35, dot(vWorldNorm, lightDir));
    float fres     = pow(1. - vdn, 3.5) * sunFacing;
    color += atmosCol * fres * atmosStr;

    color *= 1.0 - moonTransitShadow(vWorldPos) * 0.85;
    color = pow(max(color, vec3(0.001)), vec3(1./2.2));
    gl_FragColor = vec4(color, 1.0);
  }
`;
