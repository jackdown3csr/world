/**
 * Mars shader — dedicated shader for the highest-ranked rocky planet.
 *
 * Unique features:
 *  - Olympus Mons: giant shield volcano with caldera & aureole
 *  - Valles Marineris: long equatorial canyon system
 *  - Tharsis Bulge: elevated volcanic plateau
 *  - Dual asymmetric polar ice caps (south larger, bluish dry-ice tint)
 *  - Crustal dichotomy: darker southern highlands vs lighter northern lowlands
 *  - Rust-red iron oxide terrain with ochre/sienna variations
 *  - Animated dust storms
 *  - Thin dusty CO₂ atmosphere Fresnel (4× stronger than generic rocky)
 *  - Warm terminator sunset glow
 */

import { PLANET_NOISE, MOON_SHADOW_GLSL } from "./planetNoise";

/* ── Height function ──────────────────────────────────────── */

const HEIGHT_FN = /* glsl */ `
  // Olympus Mons — broad shield dome with caldera
  float olympusMons(vec3 p, vec3 centre) {
    float ang = acos(clamp(dot(p, centre), -1.0, 1.0));
    float dome    = smoothstep(0.42, 0.04, ang) * 0.75;
    float caldera = smoothstep(0.065, 0.0, ang) * 0.35;
    float rim     = smoothstep(0.10, 0.065, ang) * smoothstep(0.04, 0.065, ang) * 0.12;
    return dome - caldera + rim;
  }

  // Valles Marineris — equatorial canyon scar
  float vallesMarineris(vec3 p, float canyonLon, float seed) {
    float lat = asin(clamp(p.y, -1.0, 1.0));
    float lon = atan(p.z, p.x);
    float lonDist = abs(lon - canyonLon);
    if (lonDist > 3.14159) lonDist = 6.28318 - lonDist;
    float along   = smoothstep(0.65, 0.52, lonDist);
    float latC    = -0.09;
    float across  = smoothstep(0.13, 0.07, abs(lat - latC));
    float rough   = snoise(p * 18.0 + vec3(seed * 5.3)) * 0.18;
    return along * across * (0.55 + rough);
  }

  // Tharsis Bulge — broad volcanic plateau
  float tharsisBulge(vec3 p, vec3 centre) {
    float ang = acos(clamp(dot(p, centre), -1.0, 1.0));
    return smoothstep(0.58, 0.12, ang) * 0.22;
  }

  float typeHeight(vec3 p, vec3 seed3, float seed) {
    float h = 0.0;

    // Large-scale terrain
    h += fbm(p * 2.0 + seed3) * 0.30;

    // Crustal dichotomy: southern hemisphere elevated (highlands)
    h += smoothstep(0.1, -0.3, p.y) * 0.14;

    // Craters (fewer than generic rocky — Mars has a weathered look)
    h += craters(p, seed, 0.18, 4) * 0.20;

    // Fine detail
    h += snoise(p * 6.0 + seed3.yzx) * 0.055;
    h += snoise(p * 14.0 + seed3.zxy) * 0.025;

    // Olympus Mons (~18°N)
    vec3 olympusDir = normalize(vec3(
      cos(seed * 4.7 + 1.2),
      0.31,
      sin(seed * 4.7 + 1.2)
    ));
    h += olympusMons(p, olympusDir);

    // Tharsis Bulge (offset from Olympus)
    vec3 tharsisDir = normalize(vec3(
      cos(seed * 4.7 + 1.6),
      0.06,
      sin(seed * 4.7 + 1.6)
    ));
    h += tharsisBulge(p, tharsisDir);

    // Valles Marineris (canyon — negative)
    float canyonLon = seed * 4.7 + 2.9;
    h -= vallesMarineris(p, canyonLon, seed) * 0.42;

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

    // Stronger displacement than generic rocky — Mars has real topography
    vec3 displaced = position + normal * h * rad * 0.030;

    vPos       = position;
    vec4 wp    = modelMatrix * vec4(displaced, 1.0);
    vWorldPos  = wp.xyz;
    vWorldNorm = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

/* ── Fragment shader ────────────────────────────────────────── */

export const FRAG = /* glsl */ `
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
    vec3 lightDir = normalize(-vWorldPos);
    vec3 viewDir  = normalize(cameraPosition - vWorldPos);

    // ── Bump normals ─────────────────────────────────────
    float eps = 0.015;
    float h0  = typeHeight(p, seed3, uSeed);
    float hx  = typeHeight(normalize(p + vec3(eps,0.,0.)), seed3, uSeed);
    float hy  = typeHeight(normalize(p + vec3(0.,eps,0.)), seed3, uSeed);
    vec3 grad  = vec3(hx-h0, hy-h0, 0.) / eps;
    vec3 bumpN = normalize(vWorldNorm + grad * 1.1);

    float NdotL_raw = dot(bumpN, lightDir);
    float day       = smoothstep(-0.03, 0.03, NdotL_raw);
    float NdotL     = max(NdotL_raw, 0.);

    // ── Albedo: Mars terrain ─────────────────────────────
    float n1 = fbm(p * 2.2 + seed3) * 0.55 + fbm(p * 5.5 + seed3.yzx) * 0.45;
    float t  = smoothstep(0.2, 0.8, n1);

    // Rust-red Mars palette
    vec3 hiC  = hsv(vec3(0.035 + uHue*0.012, 0.72, 0.58));   // bright rust
    vec3 loC  = hsv(vec3(0.015 + uHue*0.008, 0.62, 0.20));   // dark iron
    vec3 midC = hsv(vec3(0.055 + uHue*0.010, 0.50, 0.42));   // ochre/sienna

    vec3 albedo = mix(loC, midC, smoothstep(0.15, 0.45, t));
    albedo      = mix(albedo, hiC, smoothstep(0.50, 0.85, t));

    // ── Crustal dichotomy ────────────────────────────────
    float southH = smoothstep(0.1, -0.4, lat);
    albedo = mix(albedo, albedo * vec3(0.84, 0.76, 0.70), southH * 0.42);
    float northH = smoothstep(-0.05, 0.3, lat);
    albedo = mix(albedo, albedo * vec3(1.08, 1.04, 0.97), northH * 0.18);

    // ── Olympus Mons colouring ───────────────────────────
    vec3 olympusDir = normalize(vec3(
      cos(uSeed * 4.7 + 1.2),
      0.31,
      sin(uSeed * 4.7 + 1.2)
    ));
    float olympusAng = acos(clamp(dot(p, olympusDir), -1.0, 1.0));
    // Aureole: lighter ring
    float aureole = smoothstep(0.50, 0.28, olympusAng) * smoothstep(0.05, 0.18, olympusAng);
    albedo = mix(albedo, hiC * 1.18, aureole * 0.38);
    // Caldera: dark basalt
    float calderaCol = smoothstep(0.07, 0.02, olympusAng);
    albedo = mix(albedo, loC * 0.5, calderaCol * 0.65);

    // ── Valles Marineris colouring ───────────────────────
    float canyonLon   = uSeed * 4.7 + 2.9;
    float canyonDepth = vallesMarineris(p, canyonLon, uSeed);
    // Canyon floor: exposed dark bedrock
    albedo = mix(albedo, loC * 0.32, canyonDepth * 0.72);
    // Canyon rim: erosion lighter deposits
    float canyonEdge = smoothstep(0.15, 0.4, canyonDepth) * smoothstep(0.62, 0.4, canyonDepth);
    albedo = mix(albedo, midC * 1.22, canyonEdge * 0.28);

    // ── Animated dust storms ─────────────────────────────
    float stormN = fbm(p * 3.0 + vec3(uTime * 0.010, 0.0, uTime * 0.006) + seed3);
    float storm  = smoothstep(0.26, 0.40, stormN) * smoothstep(0.56, 0.40, stormN);
    vec3 dustCol = hsv(vec3(0.06, 0.32, 0.66));
    albedo       = mix(albedo, dustCol, storm * 0.28);

    // ── Craters ──────────────────────────────────────────
    vec3 cr0 = normalize(vec3(sin(uSeed*91.1), cos(uSeed*37.3), sin(uSeed*63.7)));
    vec3 cr1 = normalize(vec3(sin(uSeed*53.7), cos(uSeed*81.3), cos(uSeed*27.1)));
    vec3 cr2 = normalize(vec3(cos(uSeed*19.9), sin(uSeed*47.3), cos(uSeed*83.1)));
    float cr = 0.0;
    float d0 = acos(clamp(dot(p,cr0),-1.,1.))/0.38;
    if(d0<1.) cr += -smoothstep(0.,0.6,d0)*0.55+smoothstep(0.6,0.93,d0)*0.45;
    float d1 = acos(clamp(dot(p,cr1),-1.,1.))/0.26;
    if(d1<1.) cr += -smoothstep(0.,0.6,d1)*0.55+smoothstep(0.6,0.93,d1)*0.45;
    float d2 = acos(clamp(dot(p,cr2),-1.,1.))/0.16;
    if(d2<1.) cr += -smoothstep(0.,0.6,d2)*0.55+smoothstep(0.6,0.93,d2)*0.45;
    cr = clamp(cr, -0.55, 0.45);
    albedo = mix(albedo, loC * 0.38, max(-cr, 0.));
    albedo = mix(albedo, hiC * 1.22, max( cr, 0.));

    // ── Polar ice caps ───────────────────────────────────
    // North cap: brighter, pure white
    float northEdge = snoise(p * 11.0 + seed3) * 0.06;
    float northCap  = smoothstep(0.76 + northEdge, 0.90 + northEdge, lat);
    albedo = mix(albedo, vec3(0.94, 0.95, 0.96), northCap * 0.88);

    // South cap: larger, dry-ice bluish tint
    float southEdge = snoise(p * 9.0 + seed3.zxy) * 0.07;
    float southCap  = smoothstep(-0.68 + southEdge, -0.84 + southEdge, lat);
    vec3 iceCol = vec3(0.88, 0.92, 0.99);
    albedo = mix(albedo, iceCol, southCap * 0.92);

    // ── Diffuse ──────────────────────────────────────────
    vec3 color = albedo * NdotL;

    // ── Specular (very faint — dry dusty surface) ────────
    vec3 halfV = normalize(lightDir + viewDir);
    float spec = pow(max(dot(bumpN, halfV), 0.), 22.0);
    color += vec3(1.0, 0.90, 0.78) * spec * 0.03 * day;

    // ── Thin CO₂ atmosphere ──────────────────────────────
    // Dusty orange-pink glow, much stronger than generic rocky
    vec3  atmosCol  = hsv(vec3(0.045 + uHue*0.015, 0.42, 0.78));
    float atmosStr  = 0.22;
    float vdn       = max(dot(bumpN, viewDir), 0.);
    float sunFacing = smoothstep(-0.1, 0.30, dot(vWorldNorm, lightDir));
    float fres      = pow(1.0 - vdn, 3.5) * sunFacing;
    float hazeStr   = pow(1.0 - vdn, 1.2) * smoothstep(0.0, 0.6, dot(vWorldNorm, lightDir));
    color += atmosCol * (fres * 0.9 + hazeStr * 0.35) * atmosStr;

    // Warm sunset glow at terminator
    float terminator = smoothstep(-0.05, 0.15, NdotL_raw) * smoothstep(0.28, 0.05, NdotL_raw);
    color += vec3(0.50, 0.18, 0.05) * terminator * 0.14;

    // ── Moon transit shadows ─────────────────────────────
    color *= 1.0 - moonTransitShadow(vWorldPos) * 0.85;

    // ── Gamma ────────────────────────────────────────────
    color = pow(max(color, vec3(0.001)), vec3(1.0/2.2));
    gl_FragColor = vec4(color, 1.0);
  }
`;
