/**
 * Saturn ring disc shader — multi-band structure with Cassini Division
 * and dynamic gaps at moon orbit radii.
 *
 * Visual-only disc; wallet particles (instanced rocks) sit on top.
 */

import * as THREE from "three";

/* ── Vertex shader ─────────────────────────────────────────── */

const VERT = /* glsl */ `
  varying float vRadius;
  varying float vAngle;
  varying vec3  vWorldPos;

  void main() {
    // RingGeometry lives in XY plane; radius = distance from origin
    vRadius   = length(position.xy);
    vAngle    = atan(position.y, position.x);
    vec4 wp   = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

/* ── Fragment shader ───────────────────────────────────────── */

const FRAG = /* glsl */ `
  uniform vec3  uStarPos;
  uniform float uInnerRadius;
  uniform float uOuterRadius;
  uniform float uSeed;
  uniform float uTime;
  uniform float uMoonOrbits[6];
  uniform int   uMoonCount;

  varying float vRadius;
  varying float vAngle;
  varying vec3  vWorldPos;

  /* ── Ring band density ──────────────────────────────────── */
  float ringBands(float t) {
    float d = 0.0;

    // D Ring: 0.00–0.11  (very faint innermost ring)
    d += smoothstep(0.00, 0.02, t) * smoothstep(0.13, 0.10, t) * 0.10;

    // C Ring: 0.11–0.26  (translucent, "crepe ring")
    float cBand = smoothstep(0.09, 0.13, t) * smoothstep(0.28, 0.25, t);
    cBand *= 0.80 + 0.20 * (0.5 + 0.5 * sin(t * 180.0 + uSeed * 13.0));
    d += cBand * 0.30;

    // B Ring: 0.28–0.545  (brightest, densest)
    float bBand = smoothstep(0.26, 0.30, t) * smoothstep(0.565, 0.545, t);
    // Internal structure — fine banding
    bBand *= 0.60 + 0.40 * (0.5 + 0.5 * sin(t * 220.0 + uSeed * 17.0));
    bBand *= 0.85 + 0.15 * (0.5 + 0.5 * sin(t * 55.0  + uSeed * 9.0));
    d += bBand * 0.85;

    // ── Cassini Division: 0.545–0.62  (prominent dark gap) ──
    // Just a gap — density stays ~0

    // A Ring: 0.62–0.84
    float aBand = smoothstep(0.60, 0.64, t) * smoothstep(0.86, 0.84, t);
    aBand *= 0.65 + 0.35 * (0.5 + 0.5 * sin(t * 160.0 + uSeed * 11.0));
    d += aBand * 0.55;

    // Encke gap: narrow gap within A ring at t ≈ 0.77
    d *= smoothstep(0.004, 0.014, abs(t - 0.77));

    // Keeler gap: even narrower gap at t ≈ 0.835
    d *= smoothstep(0.002, 0.008, abs(t - 0.835));

    // ── Roche Division: 0.84–0.90 ──

    // F Ring: 0.91–0.97  (narrow outer ring)
    d += smoothstep(0.89, 0.92, t) * smoothstep(0.99, 0.97, t) * 0.25;

    return d;
  }

  /* ── Simple hash for noise ──────────────────────────────── */
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    float t = clamp(
      (vRadius - uInnerRadius) / (uOuterRadius - uInnerRadius),
      0.0, 1.0
    );

    // Base band density
    float density = ringBands(t);

    // ── Moon gaps ──
    for (int i = 0; i < 6; i++) {
      if (i >= uMoonCount) break;
      float moonT = clamp(
        (uMoonOrbits[i] - uInnerRadius) / (uOuterRadius - uInnerRadius),
        0.0, 1.0
      );
      // Gap width — wide enough to be clearly visible
      float gapHW = 0.035;
      density *= smoothstep(0.0, gapHW, abs(t - moonT));
    }

    // ── Subtle azimuthal variation (spoke-like) ──
    float spoke = 0.92 + 0.08 * sin(vAngle * 5.0 + t * 30.0 + uSeed * 20.0);
    density *= spoke;

    // ── Micro-grain noise ──
    float grain = 0.90 + 0.10 * hash2(vec2(vAngle * 50.0, t * 200.0 + uSeed));
    density *= grain;

    // ── Color: warm Saturn palette ──
    vec3 innerColor = vec3(0.88, 0.74, 0.48);   // warm gold
    vec3 midColor   = vec3(0.82, 0.72, 0.55);   // amber
    vec3 outerColor = vec3(0.68, 0.72, 0.78);   // cooler grey-blue

    vec3 col = t < 0.5
      ? mix(innerColor, midColor, t * 2.0)
      : mix(midColor, outerColor, (t - 0.5) * 2.0);

    // Brightness variation per band
    col *= 0.78 + density * 0.30;

    // Subtle per-seed tint
    col += vec3(uSeed * 0.04, uSeed * 0.02, -uSeed * 0.03);

    // ── Illumination + forward scattering ──
    // Sun is at origin; ring lives at vWorldPos
    vec3 sunDir  = normalize(uStarPos - vWorldPos);
    vec3 viewDir = normalize(cameraPosition - vWorldPos);

    // Basic diffuse — both sides lit, back slightly dimmer
    float lit = 0.55 + 0.45 * abs(sunDir.y);
    col *= lit;

    // Forward-scatter: when the viewer looks *through* the ring toward the
    // sun, translucent ice grains scatter light forward (Henyey-Greenstein
    // approximation).  cosTheta ≈ 1 means sun is behind ring from viewer.
    float cosTheta = dot(viewDir, sunDir);
    float g  = 0.75;                     // asymmetry parameter (strong forward peak)
    float g2 = g * g;
    float hg = (1.0 - g2) / pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5);
    // Normalise so hg≈1 at perpendicular, peaks when backlit
    hg = hg / ((1.0 - g2) / pow(1.0 + g2, 1.5));
    // Thin rings scatter more; dense B-ring scatters less
    float scatterStrength = mix(0.8, 0.15, density);
    col += col * scatterStrength * (hg - 1.0) * 0.60;

    // ── Edge fade ──
    float edge = smoothstep(0.0, 0.015, t) * smoothstep(1.0, 0.985, t);

    float alpha = density * edge * 0.62;

    gl_FragColor = vec4(col, alpha);
  }
`;

/* ── Material factory ──────────────────────────────────────── */

export function createSaturnRingMaterial(
  innerRadius: number,
  outerRadius: number,
  moonOrbits:  number[],
  seed:        number,
): THREE.ShaderMaterial {
  // Pad moon orbits array to 6
  const orbits = new Float32Array(6);
  moonOrbits.forEach((r, i) => { if (i < 6) orbits[i] = r; });

  return new THREE.ShaderMaterial({
    vertexShader:   VERT,
    fragmentShader: FRAG,
    uniforms: {
      uStarPos:     { value: new THREE.Vector3(0, 0, 0) },
      uInnerRadius: { value: innerRadius },
      uOuterRadius: { value: outerRadius },
      uSeed:        { value: seed },
      uTime:        { value: 0.0 },
      uMoonOrbits:  { value: Array.from(orbits) },
      uMoonCount:   { value: Math.min(moonOrbits.length, 6) },
    },
    side:        THREE.DoubleSide,
    transparent: true,
    depthWrite:  false,
  });
}
