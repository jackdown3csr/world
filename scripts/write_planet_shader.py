"""
Writes lib/planetShader.ts — full planet rendering pipeline.
Run: python scripts/write_planet_shader.py
"""
import pathlib

# ── GLSL: noise + helpers (extends lib/glsl.ts NOISE_GLSL) ────────────────
NOISE_EXTRA = r"""
  // Additional noise octave with explicit frequency/amplitude
  float fbm4(vec3 p) {
    return snoise(p)*0.500 + snoise(p*2.0)*0.250
         + snoise(p*4.0)*0.125 + snoise(p*8.0)*0.0625;
  }

  // Domain-warped FBM — adds swirl/turbulence feel
  float wfbm(vec3 p, float warp) {
    vec3 q = vec3(fbm(p + vec3(1.7, 9.2, 0.0)),
                  fbm(p + vec3(8.3, 2.8, 3.1)),
                  fbm(p + vec3(1.3, 3.9, 7.1)));
    return fbm(p + warp * q);
  }

  // Gradient of fbm for bump normals (finite differences)
  // Returns tangent-plane-projected gradient suitable for normal perturbation
  vec3 fbmGrad(vec3 p, float scale, float eps) {
    float h0 = fbm(p * scale);
    float hx = fbm((p + vec3(eps, 0.0, 0.0)) * scale);
    float hy = fbm((p + vec3(0.0, eps, 0.0)) * scale);
    float hz = fbm((p + vec3(0.0, 0.0, eps)) * scale);
    vec3 grad = vec3(hx - h0, hy - h0, hz - h0) / eps;
    // Project onto tangent plane of the sphere (remove radial component)
    vec3 n = normalize(p);
    return grad - dot(grad, n) * n;
  }

  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }
"""

VERTEX_SHADER = r"""
  varying vec3 vPos;
  varying vec3 vWorldPos;
  varying vec3 vWorldNorm;

  void main() {
    vPos      = position;
    vec4 wp   = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vWorldNorm = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
"""

FRAGMENT_SHADER = r"""
  // ── Uniforms ────────────────────────────────────────────────
  uniform int   uType;   // 0=rocky 1=terrestrial 2=ice_giant 3=gas_giant
  uniform float uHue;
  uniform float uSeed;
  uniform float uTime;

  // ── Varyings ─────────────────────────────────────────────────
  varying vec3 vPos;
  varying vec3 vWorldPos;
  varying vec3 vWorldNorm;

  // ── Built-ins ────────────────────────────────────────────────
  // cameraPosition, modelMatrix are provided by Three.js

""" + r"""
  //=============================================================
  // NOISE + HELPERS (injected at compile time)
  //=============================================================
  NOISE_PLACEHOLDER

  //=============================================================
  // BUMP NORMAL
  // Computes perturbed world-space normal from the FBM gradient.
  //=============================================================
  vec3 computeBumpNormal(vec3 p_os, float scale, float strength) {
    // Tangent-projected gradient of fbm in object space
    vec3 tGrad = fbmGrad(p_os + vec3(uSeed * 13.7, uSeed * 7.3, uSeed * 31.1), scale, 0.018);
    // Perturbed object-space normal
    vec3 n_os  = normalize(p_os + tGrad * strength);
    // Transform to world space (sphere has uniform scale so mat3(modelMatrix) is fine)
    return normalize(mat3(modelMatrix) * n_os);
  }

  //=============================================================
  // CRATER FUNCTION
  // Returns a surface-height modifier: negative = pit, positive = rim
  //=============================================================
  float crater(vec3 p, vec3 centre, float r) {
    float d = acos(clamp(dot(p, centre), -1.0, 1.0)) / r;
    if (d > 1.0) return 0.0;
    float rim   =  smoothstep(0.65, 0.93, d) * 0.60;
    float floor_ = smoothstep(0.00, 0.60, d);
    return -floor_ * 0.70 + rim;
  }

  //=============================================================
  // ROCKY   (type 0)
  //=============================================================
  vec3 rockyAlbedo(vec3 p, float lat) {
    // Multi-scale terrain
    float terrain = fbm(p * 2.2 + vec3(uSeed*13.7, uSeed*7.3, uSeed*23.1)) * 0.55
                  + fbm(p * 6.0 + vec3(uSeed*31.1, uSeed*17.9, uSeed* 5.7)) * 0.30
                  + fbm(p *13.0 + vec3(uSeed* 5.1, uSeed*41.3, uSeed*11.9)) * 0.15;
    float t = smoothstep(0.25, 0.75, terrain);

    float palette = fract(uSeed * 0.71);
    vec3 hiC = (palette < 0.5)
      ? hsv2rgb(vec3(0.07 + uHue*0.09, 0.26, 0.62))  // ochre/tan
      : hsv2rgb(vec3(0.02 + uHue*0.07, 0.62, 0.52));  // Martian rust
    vec3 loC = (palette < 0.5)
      ? hsv2rgb(vec3(0.06 + uHue*0.06, 0.18, 0.24))  // dark basalt
      : hsv2rgb(vec3(0.03 + uHue*0.05, 0.48, 0.20));  // dark red plains
    vec3 eject = hsv2rgb(vec3(uHue*0.07, 0.06, 0.46));

    vec3 col = mix(loC, hiC, t);
    // Fine-scale grit overlay
    col = mix(col, eject, fbm(p*28.0 + vec3(uSeed*77.1)) * 0.22);

    // Impact craters — 6 seeded positions
    vec3 cc[6];
    cc[0] = normalize(vec3(sin(uSeed*91.1), cos(uSeed*37.3), sin(uSeed*63.7)));
    cc[1] = normalize(vec3(sin(uSeed*53.7), cos(uSeed*81.3), cos(uSeed*27.1)));
    cc[2] = normalize(vec3(cos(uSeed*19.9), sin(uSeed*47.3), cos(uSeed*83.1)));
    cc[3] = normalize(vec3(cos(uSeed*73.1), cos(uSeed*29.7), sin(uSeed*57.3)));
    cc[4] = normalize(vec3(sin(uSeed*61.3), sin(uSeed*13.7), cos(uSeed*41.9)));
    cc[5] = normalize(vec3(cos(uSeed*37.9), sin(uSeed*67.1), sin(uSeed*23.3)));
    float cr = crater(p,cc[0],0.50) + crater(p,cc[1],0.34)
             + crater(p,cc[2],0.24) + crater(p,cc[3],0.17)
             + crater(p,cc[4],0.11) + crater(p,cc[5],0.07);
    cr = clamp(cr, -0.70, 0.60);
    col = mix(col, loC * 0.40, max(-cr, 0.0));
    col = mix(col, hiC * 1.30, max( cr, 0.0));

    // Mars-style polar frost
    if (palette > 0.35) {
      float frost = smoothstep(0.76, 0.94, abs(lat)) * (0.5 + fbm(p*7.0)*0.5);
      col = mix(col, vec3(0.94, 0.91, 0.89), frost);
    }
    return col;
  }

  //=============================================================
  // TERRESTRIAL   (type 1)
  //=============================================================
  vec3 terrestrialAlbedo(vec3 p, float lat, out float oceanMask, out float cloudAlpha) {
    float landN  = fbm(p * 2.0 + vec3(uSeed*11.3, uSeed*17.1, uSeed*23.7)) * 0.60
                 + fbm(p * 5.0 + vec3(uSeed*31.7,  uSeed*5.3, uSeed*43.1)) * 0.30
                 + fbm(p *11.0 + vec3(uSeed* 7.3, uSeed*29.1, uSeed* 9.7)) * 0.10;
    oceanMask  = 1.0 - smoothstep(0.44, 0.56, landN);
    float shallow = 1.0 - smoothstep(0.00, 0.07, abs(landN - 0.50));
    float polar   = smoothstep(0.66, 0.92, abs(lat));
    float tropical = 1.0 - smoothstep(0.00, 0.55, abs(lat));

    // Ocean
    vec3 deepOcn  = hsv2rgb(vec3(0.61 + uHue*0.04, 0.85, 0.28));
    vec3 shallOcn = hsv2rgb(vec3(0.55 + uHue*0.05, 0.68, 0.50));
    vec3 ocean    = mix(deepOcn, shallOcn, shallow);

    // Land biomes
    vec3 jungle  = hsv2rgb(vec3(0.31 + uHue*0.06, 0.74, 0.30));
    vec3 savanna = hsv2rgb(vec3(0.13 + uHue*0.06, 0.58, 0.48));
    vec3 desert  = hsv2rgb(vec3(0.10 + uHue*0.05, 0.54, 0.64));
    vec3 tundra  = hsv2rgb(vec3(0.38 + uHue*0.04, 0.22, 0.50));
    vec3 snow    = vec3(0.90, 0.93, 0.97);

    vec3 land = mix(jungle, savanna, clamp(tropical*0.5 + fbm(p*6.0+vec3(uSeed))*0.5, 0.0, 1.0));
    land = mix(land, desert,  smoothstep(0.3, 0.7, fbm(p*9.0+vec3(uSeed*3.1))) * tropical * 0.55);
    land = mix(land, tundra,  smoothstep(0.46, 0.68, abs(lat)));
    land = mix(land, snow,    polar);

    vec3 col = mix(ocean, land, 1.0 - oceanMask);

    // Two animated cloud layers
    vec3 cp1 = p + vec3(uTime * 0.009, 0.0, 0.0);
    vec3 cp2 = p + vec3(-uTime * 0.006, uTime * 0.004, 0.0);
    float cl1 = fbm(cp1 * 3.8 + vec3(uSeed * 5.1));
    float cl2 = fbm(cp2 * 7.5 + vec3(uSeed * 9.3));
    cloudAlpha = smoothstep(0.48, 0.68, cl1 * 0.6 + cl2 * 0.4) * 0.90;
    vec3 cloudCol = mix(vec3(0.88, 0.91, 0.96), snow, polar * 0.6);
    col = mix(col, cloudCol, cloudAlpha);

    return col;
  }

  //=============================================================
  // ICE GIANT   (type 2)
  //=============================================================
  vec3 iceGiantAlbedo(vec3 p, float lat) {
    float distLat = lat + fbm(p * 1.5 + vec3(uSeed*7.1)) * 0.18;
    float bandF   = 7.0 + uSeed * 4.0;
    float b1 = sin(distLat * bandF          + uTime * 0.06) * 0.5 + 0.5;
    float b2 = sin(distLat * bandF * 2.1    + uTime * 0.11 + uSeed * 3.14) * 0.5 + 0.5;
    float b3 = sin(distLat * bandF * 0.47   + uTime * 0.04) * 0.5 + 0.5;

    float stLat = 0.22 + (fract(uSeed*7.7) - 0.5) * 0.18;
    float stLon = fract(uSeed * 11.3) * 6.2832;
    vec3 stC   = vec3(cos(stLat)*cos(stLon), sin(stLat), cos(stLat)*sin(stLon));
    float stD  = length(p - normalize(stC));
    float stMask = smoothstep(0.30, 0.06, stD);

    float hueB = 0.57 + uHue * 0.11;
    vec3 deep   = hsv2rgb(vec3(hueB,        0.90, 0.28));
    vec3 mid    = hsv2rgb(vec3(hueB + 0.04, 0.80, 0.52));
    vec3 bright = hsv2rgb(vec3(hueB + 0.08, 0.56, 0.74));
    vec3 stCol  = hsv2rgb(vec3(hueB + 0.10, 0.38, 0.86));
    vec3 polC   = hsv2rgb(vec3(hueB - 0.03, 0.40, 0.68));

    vec3 col = mix(deep, mid,    smoothstep(0.30, 0.70, b1));
    col = mix(col, bright,       smoothstep(0.62, 0.92, b2) * 0.42);
    col = mix(col, deep * 0.8,   smoothstep(0.42, 0.78, b3) * 0.28);
    // White wind streaks
    col = mix(col, vec3(0.88, 0.94, 1.00), fbm(p*18.0+vec3(uSeed)) * smoothstep(0.65, 0.88, b1) * 0.28);
    col = mix(col, stCol,        stMask);
    col = mix(col, polC,         smoothstep(0.58, 0.92, abs(lat)));
    return col;
  }

  //=============================================================
  // GAS GIANT   (type 3)
  //=============================================================
  vec3 gasGiantAlbedo(vec3 p, float lat, out float cloudAlpha) {
    float wind   = fbm(p * 1.5 + vec3(uSeed*3.1)) * 0.26 + fbm(p*4.0+vec3(uSeed*9.7)) * 0.10;
    float dLat   = lat + wind;
    float bF     = 12.0 + uSeed * 7.0;
    float b1  = sin(dLat * bF           + uTime * 0.018) * 0.5 + 0.5;
    float b2  = sin(dLat * bF * 1.618   + uTime * 0.031 + uSeed * 2.0) * 0.5 + 0.5;
    float b3  = sin(dLat * bF * 0.5     + uTime * 0.011) * 0.5 + 0.5;

    // Band-edge shear turbulence
    float edge = 1.0 - abs(fract(dLat * bF / 6.2832) * 2.0 - 1.0);
    float turbF = wfbm(p * 5.5 + vec3(uTime * 0.022, uSeed * 7.0, 0.0), 0.5);
    float turb  = smoothstep(0.72, 0.97, edge) * turbF;

    // Great Red Spot
    float gLat = -(0.23 + fract(uSeed*7.3) * 0.14);
    float gLon =  fract(uSeed * 3.9) * 6.2832;
    float gA   = 0.22 + fract(uSeed * 5.5) * 0.11;
    float gB   = gA * 0.50;
    vec3 gCtr  = vec3(cos(gLat)*cos(gLon), sin(gLat), cos(gLat)*sin(gLon));
    vec3 toSpot = p - normalize(gCtr);
    float gX   = dot(toSpot, vec3( cos(gLon), 0.0, sin(gLon)));
    float gY   = dot(toSpot, vec3(0.0, 1.0, 0.0));
    float gD   = sqrt((gX/gA)*(gX/gA) + (gY/gB)*(gY/gB));
    float gM   = smoothstep(1.0, 0.20, gD);
    float gSwirl = sin(atan(gY, gX) * 5.0 + uTime * 0.07) * 0.5 + 0.5;

    // Secondary ovals
    float sLat = 0.19 + fract(uSeed*19.1) * 0.13;
    vec3 sCtr  = vec3(cos(sLat)*cos(gLon+1.9), sin(sLat), cos(sLat)*sin(gLon+1.9));
    float sM   = smoothstep(0.20, 0.05, length(p - normalize(sCtr))) * 0.60;

    // Palette
    vec3 zone  = hsv2rgb(vec3(fract(0.09 + uHue*0.22), 0.30, 0.92));
    vec3 belt  = hsv2rgb(vec3(fract(0.06 + uHue*0.18), 0.70, 0.48));
    vec3 warm  = hsv2rgb(vec3(fract(0.05 + uHue*0.16), 0.74, 0.72));
    vec3 grsC  = hsv2rgb(vec3(fract(0.02 + uHue*0.11), 0.86, 0.68));

    vec3 col = mix(belt, zone,   smoothstep(0.35, 0.65, b1));
    col = mix(col, warm,         smoothstep(0.48, 0.76, b2) * 0.36);
    col = mix(col, mix(belt, zone, 0.5), turb * 0.62);
    // GRS
    vec3 grsBlend = mix(grsC, mix(grsC, zone*0.5, 0.5), gSwirl*0.5);
    col = mix(col, grsBlend,     gM);
    col = mix(col, warm * 1.1,   sM);
    // Polar darkening
    col *= 1.0 - smoothstep(0.55, 1.0, abs(lat)) * 0.38;

    // Cloud top alpha (for specular modulation only)
    cloudAlpha = smoothstep(0.35, 0.65, b1) * 0.45 + turb * 0.25;
    return col;
  }

  //=============================================================
  // MAIN
  //=============================================================
  void main() {
    vec3 p   = normalize(vPos);    // unit-sphere object-space position
    float lat = p.y;

    // Sun at world origin
    vec3 lightDir = normalize(-vWorldPos);
    vec3 viewDir  = normalize(cameraPosition - vWorldPos);

    // ── Bump normal ──────────────────────────────────────────
    float bumpScale  = (uType == 3) ? 1.8 : (uType == 2) ? 2.4 : 3.0;
    float bumpStr    = (uType == 3) ? 0.18 : (uType == 2) ? 0.22 : 0.50;
    vec3 bumpN = computeBumpNormal(p, bumpScale, bumpStr);

    // ── Terminator (day/night boundary) ─────────────────────
    float NdotL_raw = dot(bumpN, lightDir);
    // Sharp terminator for rocky, soft for gas/water worlds
    float penum = (uType == 0) ? 0.04 : (uType == 1) ? 0.14 : 0.10;
    float dayMask = smoothstep(-penum, penum, NdotL_raw);
    float NdotL   = max(NdotL_raw, 0.0);

    // ── Per-type albedo ──────────────────────────────────────
    vec3  albedo;
    float oceanMask   = 0.0;
    float cloudAlpha  = 0.0;
    float specPow     = 0.0;     // specular power (0 = no spec)
    vec3  atmosCol;
    float atmosStr;

    if (uType == 0) {
      // Rocky
      albedo   = rockyAlbedo(p, lat);
      atmosCol = hsv2rgb(vec3(0.05 + uHue*0.05, 0.28, 0.75));
      atmosStr = 0.05;
      specPow  = 8.0;   // dusty sheen

    } else if (uType == 1) {
      // Terrestrial
      albedo   = terrestrialAlbedo(p, lat, oceanMask, cloudAlpha);
      atmosCol = hsv2rgb(vec3(0.59 + uHue*0.03, 0.62, 0.98));
      atmosStr = 0.55;
      specPow  = 96.0;  // ocean mirror

    } else if (uType == 2) {
      // Ice giant
      albedo   = iceGiantAlbedo(p, lat);
      atmosCol = hsv2rgb(vec3(0.58 + uHue*0.09, 0.72, 0.94));
      atmosStr = 0.65;
      specPow  = 48.0;  // icy sheen

    } else {
      // Gas giant
      float dummyCloud;
      albedo   = gasGiantAlbedo(p, lat, cloudAlpha);
      atmosCol = hsv2rgb(vec3(fract(0.09 + uHue*0.15), 0.50, 0.98));
      atmosStr = 0.35;
      specPow  = 24.0;  // cloud tops
    }

    // ── Diffuse lighting ─────────────────────────────────────
    // Ambient (0.05) + Lambertian
    vec3 color = albedo * (0.05 + NdotL * 0.95);

    // ── Specular (Blinn-Phong) ───────────────────────────────
    if (specPow > 0.0) {
      vec3 halfV = normalize(lightDir + viewDir);
      float spec = pow(max(dot(bumpN, halfV), 0.0), specPow);
      // Ocean: full spec; clouds reduce it; rocky: very low
      float specMask = (uType == 1) ? oceanMask * (1.0 - cloudAlpha * 0.8) :
                       (uType == 0) ? 0.12 : 0.32;
      color += vec3(1.00, 0.97, 0.88) * spec * specMask * dayMask;
    }

    // ── Night lights (terrestrial only) ──────────────────────
    if (uType == 1) {
      float cityNoise = fbm(p * 5.5 + vec3(uSeed*3.1, uSeed*7.7, 0.5))
                      * fbm(p * 12.0 + vec3(uSeed*11.3));
      float cities = smoothstep(0.52, 0.72, cityNoise) * (1.0 - dayMask)
                   * (1.0 - cloudAlpha * 0.85);  // clouds hide cities
      color += vec3(1.00, 0.90, 0.52) * cities * 0.42;
    }

    // ── Atmosphere rim (Fresnel) ─────────────────────────────
    float fresnelDot = max(dot(bumpN, viewDir), 0.0);
    // Inner bright rim: pow 3.5
    float fresnel1   = pow(1.0 - fresnelDot, 3.5);
    // Outer haze ring: pow 1.3 * dayMask-dependent side bias
    float fresnel2   = pow(1.0 - fresnelDot, 1.3) * smoothstep(-0.25, 0.55, dot(vWorldNorm, lightDir));
    color += atmosCol * (fresnel1 * 0.85 + fresnel2 * 0.40) * atmosStr;

    // ── Gamma correction (linear → sRGB) ────────────────────
    color = pow(max(color, vec3(0.0)), vec3(1.0 / 2.2));

    gl_FragColor = vec4(color, 1.0);
  }
"""

# Build final fragment shader by injecting noise
NOISE_GLSL_FULL = r"""
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  float fbm(vec3 p) {
    float v = 0.0; float a = 0.5;
    for (int i = 0; i < 6; i++) { v += a * snoise(p); p *= 2.0; a *= 0.5; }
    return v;
  }
"""

FRAGMENT_FINAL = FRAGMENT_SHADER.replace("NOISE_PLACEHOLDER", NOISE_GLSL_FULL + NOISE_EXTRA)

# TypeScript factory
TS = r'''/**
 * Planet rendering pipeline — createPlanetMaterial factory.
 *
 * Features per planet type:
 *   rocky       — terrain FBM + crater bumps + polar frost, sharp terminator
 *   terrestrial — continents/ocean + animated clouds + night city lights + ocean specular
 *   ice_giant   — methane-blue animated bands + storm spot + icy specular
 *   gas_giant   — distorted wide bands + GRS + shear turbulence + cloud tops
 *
 * All planets share: procedural bump normal (FBM gradient), Fresnel atmosphere
 * rim, Blinn-Phong specular, soft terminator, sRGB gamma output.
 *
 * Performance: one ShaderMaterial per PlanetType (shared compiled program),
 * unique uniforms per instance (hue, seed, time).
 */

import * as THREE from "three";
import type { PlanetType } from "./orbitalUtils";

export const PLANET_TYPE_INT: Record<PlanetType, number> = {
  rocky: 0, terrestrial: 1, ice_giant: 2, gas_giant: 3,
};

/* ── Vertex shader ────────────────────────────────────────── */
const VERT = /* glsl */ `VERT_PLACEHOLDER`;

/* ── Fragment shader ──────────────────────────────────────── */
const FRAG = /* glsl */ `FRAG_PLACEHOLDER`;

/* ── Ring disc shaders (Saturn-style) ────────────────────── */
export const RING_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

export const RING_FRAG = /* glsl */ `
  uniform float uHue;
  uniform float uSeed;
  varying vec2 vUv;
  void main() {
    float r    = vUv.x;
    float b1   = sin(r * 58.0  + uSeed * 17.0) * 0.5 + 0.5;
    float b2   = sin(r * 142.0 + uSeed * 43.0) * 0.5 + 0.5;
    float b3   = sin(r * 330.0 + uSeed * 79.0) * 0.5 + 0.5;
    float dens = b1 * 0.55 + b2 * 0.30 + b3 * 0.15;
    // Cassini division + Encke gap
    float g1 = smoothstep(0.003, 0.016, abs(r - 0.385)) * smoothstep(0.003, 0.016, abs(r - 0.405));
    float g2 = smoothstep(0.002, 0.008, abs(r - 0.725));
    dens *= g1 * g2;
    float edge  = smoothstep(0.0, 0.06, r) * smoothstep(1.0, 0.88, r);
    float alpha = dens * edge * 0.74;
    vec3 golden = vec3(0.88, 0.73, 0.46);
    vec3 icy    = vec3(0.79, 0.88, 0.96);
    vec3 col    = mix(golden, icy, uSeed) * (0.52 + dens * 0.48);
    // Simple gamma
    col = pow(max(col, vec3(0.001)), vec3(1.0/2.2));
    gl_FragColor = vec4(col, alpha);
  }
`;

/**
 * Create a ShaderMaterial for a planet body.
 * Each call produces an INDEPENDENT material so uniforms can be
 * updated individually per body without affecting siblings.
 */
export function createPlanetMaterial(
  type: PlanetType,
  hue:  number,
  seed: number,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader:   VERT,
    fragmentShader: FRAG,
    uniforms: {
      uType: { value: PLANET_TYPE_INT[type] },
      uHue:  { value: hue  },
      uSeed: { value: seed },
      uTime: { value: 0    },
    },
  });
}

/**
 * Create a ring material (Saturn-style disc).
 */
export function createRingMaterial(hue: number, seed: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader:   RING_VERT,
    fragmentShader: RING_FRAG,
    uniforms: {
      uHue:  { value: hue  },
      uSeed: { value: seed },
    },
    side:        THREE.DoubleSide,
    transparent: true,
    depthWrite:  false,
  });
}
'''

TS = TS.replace("VERT_PLACEHOLDER", VERTEX_SHADER.replace("`", "\\`"))
TS = TS.replace("FRAG_PLACEHOLDER", FRAGMENT_FINAL.replace("`", "\\`"))

out = pathlib.Path(r"c:\Users\honza\Documents\gitclones\world\world\lib\planetShader.ts")
out.write_text(TS, encoding="utf-8")
print(f"Written {len(TS)} chars to {out}")
