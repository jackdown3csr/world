"use client";

/**
 * CASCOPEA — a procedural comet with real orbital mechanics.
 *
 * Orbital model: Keplerian ellipse (Halley-class eccentricity).
 * Visuals:
 *   • Nucleus  — small dark/icy sphere, proper diffuse lighting
 *   • Coma     — soft additive glow halo
 *   • Ion tail — blue-white points, straight anti-solar, scales near sun
 *   • Dust tail — golden points, slightly curved along orbit, scales near sun
 */

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Html } from "@react-three/drei";

// ── Orbital elements ──────────────────────────────────────────────────
//   Semi-major axis chosen so perihelion ≈ 85 (inside inner planets)
//   and aphelion ≈ 1215 (well beyond asteroid belt).
const A        = 650;                     // semi-major axis
const ECC      = 0.87;                    // eccentricity (Halley-esque)
const INC      = 22 * (Math.PI / 180);   // inclination
const ARG_PERI = 0.8;                    // argument of perihelion (rad)
const LAN      = 2.1;                    // longitude of ascending node (rad)
const PERIOD   = 280;                    // orbital period (seconds, full loop)

// Pre-compute rotation matrix constants
const cosO = Math.cos(LAN), sinO = Math.sin(LAN);
const cosI = Math.cos(INC), sinI = Math.sin(INC);

/** Newton-Raphson Kepler solver (10 iterations, always converges for e<1) */
function solveKepler(M: number, e: number): number {
  let E = M;
  for (let i = 0; i < 10; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  return E;
}

/** World-space position + normalised velocity along orbit at time t (seconds). */
function getOrbitalState(t: number, outPos: THREE.Vector3, outVel: THREE.Vector3) {
  const M  = ((2 * Math.PI * t) / PERIOD) % (2 * Math.PI);
  const E  = solveKepler(M, ECC);
  const nu = 2 * Math.atan2(
    Math.sqrt(1 + ECC) * Math.sin(E / 2),
    Math.sqrt(1 - ECC) * Math.cos(E / 2),
  );
  const r   = A * (1 - ECC * ECC) / (1 + ECC * Math.cos(nu));
  const xO  = r * Math.cos(nu + ARG_PERI);
  const zO  = r * Math.sin(nu + ARG_PERI);

  // Perifocal → ecliptic via Ω (LAN) + i (INC)
  outPos.set(
    xO * cosO - zO * cosI * sinO,
    zO * sinI,
    xO * sinO + zO * cosI * cosO,
  );

  // Velocity via finite difference (small Δt)
  const dM  = 0.0006;
  const Ep  = solveKepler(M + dM, ECC);
  const nup = 2 * Math.atan2(Math.sqrt(1 + ECC) * Math.sin(Ep / 2), Math.sqrt(1 - ECC) * Math.cos(Ep / 2));
  const rp  = A * (1 - ECC * ECC) / (1 + ECC * Math.cos(nup));
  const xOp = rp * Math.cos(nup + ARG_PERI);
  const zOp = rp * Math.sin(nup + ARG_PERI);
  outVel.set(
    xOp * cosO - zOp * cosI * sinO - outPos.x,
    zOp * sinI                     - outPos.y,
    xOp * sinO + zOp * cosI * cosO - outPos.z,
  ).normalize();
}

// ── Nucleus shader ────────────────────────────────────────────────────
const NUCLEUS_VERT = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vPos;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPos    = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const NUCLEUS_FRAG = /* glsl */`
  uniform vec3 uSunDir;
  varying vec3 vNormal;
  varying vec3 vPos;

  float h13(vec3 p){p=fract(p*0.1031);p+=dot(p,p.zyx+31.32);return fract((p.x+p.y)*p.z);}
  float vn(vec3 p){
    vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(mix(h13(i),h13(i+vec3(1,0,0)),f.x),mix(h13(i+vec3(0,1,0)),h13(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(h13(i+vec3(0,0,1)),h13(i+vec3(1,0,1)),f.x),mix(h13(i+vec3(0,1,1)),h13(i+vec3(1,1,1)),f.x),f.y),f.z);
  }

  void main() {
    vec3 n = normalize(vNormal);
    vec3 p = normalize(vPos);

    // Dark charcoal base (real comets are very dark, ~4% albedo)
    float rough = vn(p*4.2)*0.5 + vn(p*9.7)*0.35 + vn(p*20.0)*0.15;
    vec3 base = mix(vec3(0.025,0.025,0.030), vec3(0.11,0.10,0.08), rough);

    // Ice patches — bright blue-white sublimating surface
    float ice = smoothstep(0.60,0.70, vn(p*3.1+0.7))
              + smoothstep(0.64,0.72, vn(p*5.8+2.3)) * 0.5;
    ice = clamp(ice, 0.0, 1.0);
    base = mix(base, vec3(0.80,0.88,0.98), ice * 0.75);

    // Diffuse (sun)
    float NdotL = max(dot(n, uSunDir), 0.0);
    vec3 color  = base * (NdotL * 0.95 + 0.015);

    // Active jets / outgassing on sunlit face
    float jet = smoothstep(0.58,0.92, vn(p*7.3)) * smoothstep(0.0,0.3, dot(n,uSunDir));
    color += vec3(0.35,0.60,0.45) * jet * (1.0-ice) * 0.20;

    color = pow(max(color, vec3(0.0)), vec3(1.0/2.2));
    gl_FragColor = vec4(color, 1.0);
  }
`;

// ── Coma shader ───────────────────────────────────────────────────────
const COMA_VERT = /* glsl */`
  varying vec3 vP;
  void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`;
const COMA_FRAG = /* glsl */`
  varying vec3 vP;
  void main() {
    float d = length(vP); // 0=centre, ≤1 inside sphere
    float a = pow(1.0 - clamp(d, 0.0, 1.0), 2.2) * 0.50;
    vec3 col = mix(vec3(0.65,0.85,1.0), vec3(0.95,0.97,0.75), d * 0.6);
    gl_FragColor = vec4(col, a);
  }
`;

// ── Tail (Points) shader ──────────────────────────────────────────────
const TAIL_VERT = /* glsl */`
  attribute float aAlpha;
  attribute float aSize;
  varying float vAlpha;
  void main() {
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position  = projectionMatrix * mv;
    gl_PointSize = aSize * (250.0 / -mv.z);
  }
`;
const ION_FRAG = /* glsl */`
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = (1.0 - d*2.0) * vAlpha;
    gl_FragColor = vec4(0.50, 0.78, 1.0, a);
  }
`;
const DUST_FRAG = /* glsl */`
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = (1.0 - d*2.0) * vAlpha;
    gl_FragColor = vec4(1.0, 0.88, 0.48, a);
  }
`;

const ION_N  = 320;
const DUST_N = 220;
const NUCLEUS_R = 1.8;
const COMA_R    = 13;
const TAIL_VIS_DIST = 580;   // beyond this solar distance the tail fades out

/** Seeded pseudo-random (deterministic, no Math.random) */
function sr(s: number): number { const x = Math.sin(s * 127.1 + 311.7) * 43758.5; return x - Math.floor(x); }

export const COMET_ADDRESS = "cascopea";

export default function Comet({ onSelect }: { onSelect?: (addr: string) => void }) {
  const groupRef  = useRef<THREE.Group>(null);
  const nucMatRef = useRef<THREE.ShaderMaterial | null>(null);
  const ionGeoRef  = useRef<THREE.BufferGeometry>(null!);
  const dustGeoRef = useRef<THREE.BufferGeometry>(null!);

  // ── Nucleus mat ──
  const nucleusMat = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      vertexShader: NUCLEUS_VERT, fragmentShader: NUCLEUS_FRAG,
      uniforms: { uSunDir: { value: new THREE.Vector3(0, 0, 1) } },
    });
    nucMatRef.current = m;
    return m;
  }, []);

  // ── Coma mat ──
  const comaMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: COMA_VERT, fragmentShader: COMA_FRAG,
    transparent: true, depthWrite: false, side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
  }), []);

  // ── Ion tail mat ──
  const ionMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: TAIL_VERT, fragmentShader: ION_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }), []);

  // ── Dust tail mat ──
  const dustMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: TAIL_VERT, fragmentShader: DUST_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }), []);

  // ── Pre-generated deterministic particle seeds ──
  const ionSeeds = useMemo(() => Array.from({ length: ION_N }, (_, i) => ({
    t:    Math.pow(sr(i * 3.1 + 0.1), 0.65),   // distance 0–1 along tail, weighted near
    ang:  sr(i * 1.7 + 0.3) * Math.PI * 2,
    cone: sr(i * 2.3 + 0.9) * 0.05,
    sz:   sr(i * 0.7 + 0.5),
  })), []);

  const dustSeeds = useMemo(() => Array.from({ length: DUST_N }, (_, i) => ({
    t:     Math.pow(sr(i * 2.9 + 0.2), 0.60),
    ang:   sr(i * 1.3 + 0.5) * Math.PI * 2,
    cone:  sr(i * 2.1 + 1.2) * 0.10,
    curve: sr(i * 0.9 + 0.1) - 0.3,  // offset along orbit tangent (-0.3…0.7)
    sz:    sr(i * 0.4 + 0.2),
  })), []);

  // ── Ion geometry ──
  const ionGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(ION_N * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aAlpha",   new THREE.BufferAttribute(new Float32Array(ION_N),     1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aSize",    new THREE.BufferAttribute(new Float32Array(ION_N),     1).setUsage(THREE.DynamicDrawUsage));
    ionGeoRef.current = g;
    return g;
  }, []);

  // ── Dust geometry ──
  const dustGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(DUST_N * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aAlpha",   new THREE.BufferAttribute(new Float32Array(DUST_N),     1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aSize",    new THREE.BufferAttribute(new Float32Array(DUST_N),     1).setUsage(THREE.DynamicDrawUsage));
    dustGeoRef.current = g;
    return g;
  }, []);

  // Reusable vectors (avoid GC)
  const _pos  = useMemo(() => new THREE.Vector3(), []);
  const _vel  = useMemo(() => new THREE.Vector3(), []);
  const _anti = useMemo(() => new THREE.Vector3(), []);   // anti-solar = tail direction
  const _rt   = useMemo(() => new THREE.Vector3(), []);   // perpendicular right
  const _up   = useMemo(() => new THREE.Vector3(), []);   // perpendicular up
  const _tmp  = useMemo(() => new THREE.Vector3(), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    getOrbitalState(t, _pos, _vel);

    const dist = _pos.length();

    // Move group to comet world position
    groupRef.current?.position.copy(_pos);

    // Sun-facing direction (for nucleus shader lighting)
    _tmp.copy(_pos).negate().normalize();
    if (nucMatRef.current) nucMatRef.current.uniforms.uSunDir.value.copy(_tmp);

    // Anti-solar direction (tail points away from origin/sun)
    _anti.copy(_pos).normalize();

    // Perpendicular basis (right/up axes of tail cross-section)
    if (Math.abs(_anti.y) < 0.95) _tmp.set(0, 1, 0); else _tmp.set(1, 0, 0);
    _rt.crossVectors(_anti, _tmp).normalize();
    _up.crossVectors(_rt, _anti).normalize();

    // Tail length & brightness scale with proximity to sun
    const proximity  = Math.pow(Math.max(0, 1 - dist / TAIL_VIS_DIST), 1.3);
    const ionLength  = 45  + proximity * 240;
    const dustLength = 35  + proximity * 170;

    // ── Ion tail ──
    const iPos = ionGeoRef.current.attributes.position as THREE.BufferAttribute;
    const iAlp = ionGeoRef.current.attributes.aAlpha   as THREE.BufferAttribute;
    const iSz  = ionGeoRef.current.attributes.aSize    as THREE.BufferAttribute;
    for (let i = 0; i < ION_N; i++) {
      const s  = ionSeeds[i];
      const d  = s.t * ionLength;
      const cr = d * s.cone;
      const cx = _rt.x * Math.cos(s.ang) + _up.x * Math.sin(s.ang);
      const cy = _rt.y * Math.cos(s.ang) + _up.y * Math.sin(s.ang);
      const cz = _rt.z * Math.cos(s.ang) + _up.z * Math.sin(s.ang);
      iPos.setXYZ(i, _anti.x * d + cx * cr, _anti.y * d + cy * cr, _anti.z * d + cz * cr);
      iAlp.setX(i,  (1.0 - s.t * 0.85) * 0.40 * proximity);
      iSz.setX(i,   (0.4 + s.sz * 0.7 + (1 - s.t) * 0.9) * Math.max(proximity, 0.1));
    }
    iPos.needsUpdate = true; iAlp.needsUpdate = true; iSz.needsUpdate = true;

    // ── Dust tail (curves along orbit tangent) ──
    const dPos = dustGeoRef.current.attributes.position as THREE.BufferAttribute;
    const dAlp = dustGeoRef.current.attributes.aAlpha   as THREE.BufferAttribute;
    const dSz  = dustGeoRef.current.attributes.aSize    as THREE.BufferAttribute;
    for (let i = 0; i < DUST_N; i++) {
      const s  = dustSeeds[i];
      const d  = s.t * dustLength;
      const cr = d * s.cone;
      const cx = _rt.x * Math.cos(s.ang) + _up.x * Math.sin(s.ang);
      const cy = _rt.y * Math.cos(s.ang) + _up.y * Math.sin(s.ang);
      const cz = _rt.z * Math.cos(s.ang) + _up.z * Math.sin(s.ang);
      // Orbit-tangent curve bias for dust
      const bc = s.curve * d * 0.20;
      dPos.setXYZ(i,
        _anti.x * d + cx * cr + _vel.x * bc,
        _anti.y * d + cy * cr + _vel.y * bc,
        _anti.z * d + cz * cr + _vel.z * bc,
      );
      dAlp.setX(i,  (1.0 - s.t * 0.75) * 0.32 * proximity);
      dSz.setX(i,   (0.5 + s.sz * 0.8 + (1 - s.t) * 0.7) * Math.max(proximity, 0.1));
    }
    dPos.needsUpdate = true; dAlp.needsUpdate = true; dSz.needsUpdate = true;
  });

  return (
    <group ref={groupRef}>
      {/* Nucleus */}
      <mesh
        userData={{ walletAddress: COMET_ADDRESS, bodyRadius: NUCLEUS_R, bodyType: "comet" }}
        onClick={(e) => { e.stopPropagation(); onSelect?.(COMET_ADDRESS); }}
      >
        <sphereGeometry args={[NUCLEUS_R, 24, 18]} />
        <primitive object={nucleusMat} attach="material" />
      </mesh>

      {/* Coma glow */}
      <mesh>
        <sphereGeometry args={[COMA_R, 20, 16]} />
        <primitive object={comaMat} attach="material" />
      </mesh>

      {/* Ion tail — straight, blue-white */}
      <points geometry={ionGeo} material={ionMat} />

      {/* Dust tail — curved, golden */}
      <points geometry={dustGeo} material={dustMat} />

      {/* Label */}
      <Html position={[0, COMA_R + 4, 0]} center style={{ pointerEvents: "none", whiteSpace: "nowrap" }}>
        <div style={{
          fontFamily: "'JetBrains Mono','SF Mono',monospace",
          fontSize: 9,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "rgba(140,190,255,0.45)",
          textShadow: "none",
        }}>
          cascopea
        </div>
      </Html>
    </group>
  );
}
