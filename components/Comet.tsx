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

import { useEffect, useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { registerSceneObject, unregisterSceneObject } from "@/lib/sceneRegistry";
import SpriteLabel from "./SpriteLabel";

// ── Orbital elements ──────────────────────────────────────────────────
//   Interstellar-scale orbit: perihelion ≈ 100 (inside vescrow inner planets)
//   aphelion ≈ 7900 (deep space, toward vesting star direction).
//   Focus at origin (vescrow star). Rare, dramatic fly-by.
const A        = 4000;                    // semi-major axis
const ECC      = 0.975;                   // very eccentric — near-parabolic visitor
const INC      = 28 * (Math.PI / 180);   // inclination
const ARG_PERI = 0.3;                    // argument of perihelion (rad)
const LAN      = 0.15;                   // longitude of ascending node — aphelion tilted toward +X
const PERIOD   = 7200;                    // orbital period (seconds, full loop — rare event)

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

// ── Nucleus shader (irregular potato-shape via vertex displacement) ───
const NUCLEUS_VERT = /* glsl */`
  uniform vec3 uSunDir;
  varying vec3 vNormal;
  varying vec3 vPos;
  varying vec3 vDisplacedPos;

  // Hash & value noise
  float h13(vec3 p){p=fract(p*0.1031);p+=dot(p,p.zyx+31.32);return fract((p.x+p.y)*p.z);}
  float vn(vec3 p){
    vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(mix(h13(i),h13(i+vec3(1,0,0)),f.x),mix(h13(i+vec3(0,1,0)),h13(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(h13(i+vec3(0,0,1)),h13(i+vec3(1,0,1)),f.x),mix(h13(i+vec3(0,1,1)),h13(i+vec3(1,1,1)),f.x),f.y),f.z);
  }
  float fbm3(vec3 p){
    return vn(p)*0.55 + vn(p*2.03 + 1.7)*0.28 + vn(p*4.01 + 3.1)*0.17;
  }

  // Displacement function — lumpy bilobed potato
  float displace(vec3 n) {
    // Base lumpiness — low-freq lobes
    float lump  = fbm3(n * 1.4 + 0.5) * 0.45;
    // Medium bumps & ridges
    float ridge = fbm3(n * 3.2 + 7.3) * 0.20;
    // Bilobed concavity (67P-style neck between two lobes)
    float neck  = 1.0 - smoothstep(0.15, 0.55, abs(n.y - 0.05));
    float pinch = neck * 0.30;
    // Deep concavity / pit on one side
    float pit = smoothstep(0.80, 0.98, dot(n, normalize(vec3(0.5,-0.3,0.7))));
    // Crag outcrops
    float crag = max(0.0, vn(n * 6.0 + 2.1) - 0.55) * 0.5;
    return lump + ridge + crag - pinch - pit * 0.25;
  }

  void main() {
    vec3 n = normalize(normal);
    vec3 p = normalize(position);
    float disp = displace(p);
    // Displace vertex along normal
    vec3 displaced = position + n * (disp - 0.25) * 0.55;

    // Compute displaced normal via finite differences
    float eps = 0.015;
    vec3 t1 = normalize(abs(n.y) < 0.99 ? cross(n, vec3(0,1,0)) : cross(n, vec3(1,0,0)));
    vec3 t2 = cross(n, t1);
    float d0 = displace(normalize(p + t1 * eps));
    float d1 = displace(normalize(p - t1 * eps));
    float d2 = displace(normalize(p + t2 * eps));
    float d3 = displace(normalize(p - t2 * eps));
    vec3 dispN = normalize(n + t1 * (d0-d1) * 8.0 + t2 * (d2-d3) * 8.0);

    vNormal = normalize(normalMatrix * dispN);
    vPos    = p;
    vDisplacedPos = displaced;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;
const NUCLEUS_FRAG = /* glsl */`
  uniform vec3 uSunDir;
  varying vec3 vNormal;
  varying vec3 vPos;
  varying vec3 vDisplacedPos;

  float h13(vec3 p){p=fract(p*0.1031);p+=dot(p,p.zyx+31.32);return fract((p.x+p.y)*p.z);}
  float vn(vec3 p){
    vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(mix(h13(i),h13(i+vec3(1,0,0)),f.x),mix(h13(i+vec3(0,1,0)),h13(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(h13(i+vec3(0,0,1)),h13(i+vec3(1,0,1)),f.x),mix(h13(i+vec3(0,1,1)),h13(i+vec3(1,1,1)),f.x),f.y),f.z);
  }

  void main() {
    vec3 n = normalize(vNormal);
    vec3 p = normalize(vPos);

    // Very dark charcoal base (~4% albedo like real comets)
    float rough = vn(p*4.2)*0.50 + vn(p*9.7)*0.30 + vn(p*22.0)*0.20;
    vec3 base = mix(vec3(0.020,0.020,0.025), vec3(0.09,0.085,0.07), rough);

    // Fine surface dust / regolith variation
    float dust = vn(p*14.0 + 5.3) * 0.12;
    base += vec3(0.06,0.05,0.03) * dust;

    // Ice patches — bright blue-white sublimating areas
    float ice = smoothstep(0.58,0.68, vn(p*3.1+0.7))
              + smoothstep(0.62,0.70, vn(p*5.8+2.3)) * 0.5;
    ice = clamp(ice, 0.0, 1.0);
    base = mix(base, vec3(0.75,0.85,0.95), ice * 0.70);

    // Diffuse (sun)
    float NdotL = max(dot(n, uSunDir), 0.0);
    // Slightly warm terminator
    float wrap = max(dot(n, uSunDir) * 0.5 + 0.5, 0.0);
    vec3 color = base * (NdotL * 0.85 + wrap * 0.08 + 0.015);

    // Active jets / outgassing on sunlit face
    float jet = smoothstep(0.55,0.90, vn(p*7.3)) * smoothstep(0.0,0.3, dot(n,uSunDir));
    color += vec3(0.30,0.55,0.40) * jet * (1.0-ice) * 0.18;

    // Subtle rim light
    float rim = pow(1.0 - max(dot(n, uSunDir), 0.0), 3.0) * 0.04;
    color += vec3(0.4,0.5,0.7) * rim;

    color = pow(max(color, vec3(0.0)), vec3(1.0/2.2));
    gl_FragColor = vec4(color, 1.0);
  }
`;

// ── Coma glow billboard shader ────────────────────────────────────────
const COMA_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const COMA_FRAG = /* glsl */`
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    /* hard circular clip — nothing beyond radius 1.0 */
    if (d > 1.0) discard;
    /* smooth fade to zero well before edge */
    float mask = smoothstep(1.0, 0.4, d);
    /* soft radial falloff — bright core, gentle fade */
    float glow  = exp(-d * 3.5) * 0.60;
    float outer = exp(-d * 1.4) * 0.18;
    float total = (glow + outer) * mask;
    vec3 col = mix(vec3(0.55, 0.80, 1.0), vec3(0.85, 0.95, 1.0), exp(-d * 5.0));
    gl_FragColor = vec4(col * total, total);
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
    gl_PointSize = max(aSize * (800.0 / -mv.z), 1.5);
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

const SPRAY_FRAG = /* glsl */`
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = pow(1.0 - d*2.0, 1.5) * vAlpha;
    gl_FragColor = vec4(0.78, 0.91, 1.0, a);
  }
`;

const ION_N   = 700;
const DUST_N  = 500;
const SPRAY_N = 200;
const NUCLEUS_R    = 0.45;
const TAIL_VIS_DIST = 2500;   // tail starts fading beyond this distance from nearest star
const TAIL_MIN     = 0.15;   // minimum tail strength (faint even at aphelion)
const MAX_SIM_DELTA = 1 / 30; // cap large frame gaps so the comet does not jump on tab resume
const RESET_DELTA_THRESHOLD = 0.25; // large gaps are treated as a resume/reset instead of motion
const START_PHASE = 0.68;     // deterministic spawn point along the orbit

/** Seeded pseudo-random (deterministic, no Math.random) */
function sr(s: number): number { const x = Math.sin(s * 127.1 + 311.7) * 43758.5; return x - Math.floor(x); }

export const COMET_ADDRESS = "cascopea";

export default function Comet({ starPositions, onSelect, showLabel = true, interactive = true, paused = false }: { starPositions: [number, number, number][]; onSelect?: (addr: string) => void; showLabel?: boolean; interactive?: boolean; paused?: boolean }) {
  const groupRef    = useRef<THREE.Group>(null);
  const comaRef     = useRef<THREE.Mesh>(null);
  const nucMatRef   = useRef<THREE.ShaderMaterial | null>(null);
  const ionGeoRef   = useRef<THREE.BufferGeometry>(null!);
  const dustGeoRef  = useRef<THREE.BufferGeometry>(null!);
  const sprayGeoRef = useRef<THREE.BufferGeometry>(null!);
  const simTimeRef  = useRef(PERIOD * START_PHASE);
  const lastTickMsRef = useRef<number | null>(null);

  useEffect(() => {
    const resetTick = () => {
      lastTickMsRef.current = null;
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        resetTick();
      } else {
        lastTickMsRef.current = performance.now();
      }
    };

    window.addEventListener("focus", resetTick);
    window.addEventListener("pageshow", resetTick);
    window.addEventListener("blur", resetTick);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", resetTick);
      window.removeEventListener("pageshow", resetTick);
      window.removeEventListener("blur", resetTick);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!groupRef.current) return;
    registerSceneObject(COMET_ADDRESS, groupRef.current, NUCLEUS_R, "comet");
    return () => unregisterSceneObject(COMET_ADDRESS);
  }, []);

  // ── Nucleus mat ──
  const nucleusMat = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      vertexShader: NUCLEUS_VERT, fragmentShader: NUCLEUS_FRAG,
      uniforms: { uSunDir: { value: new THREE.Vector3(0, 0, 1) } },
    });
    nucMatRef.current = m;
    return m;
  }, []);

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

  // ── Spray/jet mat (inner coma particles) ──
  const sprayMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: TAIL_VERT, fragmentShader: SPRAY_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }), []);

  // ── Coma glow billboard mat ──
  const comaMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: COMA_VERT, fragmentShader: COMA_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  }), []);

  // ── Pre-generated deterministic particle seeds ──
  const ionSeeds = useMemo(() => Array.from({ length: ION_N }, (_, i) => ({
    t:     Math.pow(sr(i * 3.1 + 0.1), 0.65),   // distance 0–1 along tail, weighted near
    ang:   sr(i * 1.7 + 0.3) * Math.PI * 2,
    cone:  sr(i * 2.3 + 0.9) * 0.05,
    sz:    sr(i * 0.7 + 0.5),
    speed: 0.04 + sr(i * 1.1 + 0.6) * 0.08,   // streaming speed along tail
  })), []);

  const dustSeeds = useMemo(() => Array.from({ length: DUST_N }, (_, i) => ({
    t:     Math.pow(sr(i * 2.9 + 0.2), 0.60),
    ang:   sr(i * 1.3 + 0.5) * Math.PI * 2,
    cone:  sr(i * 2.1 + 1.2) * 0.18,
    curve: sr(i * 0.9 + 0.1) - 0.3,  // offset along orbit tangent (-0.3…0.7)
    sz:    sr(i * 0.4 + 0.2),
    speed: 0.02 + sr(i * 0.6 + 0.4) * 0.05,   // slower streaming than ion
  })), []);

  // ── Spray/jet seeds (outgassing from surface, drifting anti-sunward) ──
  const spraySeeds = useMemo(() => Array.from({ length: SPRAY_N }, (_, i) => {
    const theta = sr(i * 2.1 + 0.3) * Math.PI * 2;
    const phi   = Math.acos(2 * sr(i * 1.7 + 0.9) - 1);
    return {
      dx:      Math.sin(phi) * Math.cos(theta),
      dy:      Math.sin(phi) * Math.sin(theta),
      dz:      Math.cos(phi),
      t:       sr(i * 3.3 + 0.1),
      sz:      0.3 + sr(i * 0.8 + 0.5) * 0.5,
      speed:   0.04 + sr(i * 1.5 + 0.2) * 0.08,   // slow drift
      sunHeat: 0.4 + sr(i * 2.5 + 0.7) * 0.6,
    };
  }), []);

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

  // ── Spray geometry ──
  const sprayGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SPRAY_N * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aAlpha",   new THREE.BufferAttribute(new Float32Array(SPRAY_N),     1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aSize",    new THREE.BufferAttribute(new Float32Array(SPRAY_N),     1).setUsage(THREE.DynamicDrawUsage));
    sprayGeoRef.current = g;
    return g;
  }, []);

  // Reusable vectors (avoid GC)
  const _pos  = useMemo(() => new THREE.Vector3(), []);
  const _vel  = useMemo(() => new THREE.Vector3(), []);
  const _anti = useMemo(() => new THREE.Vector3(), []);   // anti-solar = tail direction
  const _rt   = useMemo(() => new THREE.Vector3(), []);   // perpendicular right
  const _up   = useMemo(() => new THREE.Vector3(), []);   // perpendicular up
  const _tmp  = useMemo(() => new THREE.Vector3(), []);
  const _star = useMemo(() => new THREE.Vector3(), []);   // nearest star position
  const sceneStars = useMemo(
    () => starPositions.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    [starPositions],
  );
  const initialPos = useMemo(() => {
    const pos = new THREE.Vector3();
    const vel = new THREE.Vector3();
    getOrbitalState(PERIOD * START_PHASE, pos, vel);
    return [pos.x, pos.y, pos.z] as [number, number, number];
  }, []);

  useFrame((state) => {
    const nowMs = performance.now();
    let simDelta = 0;

    if (lastTickMsRef.current != null) {
      const rawDelta = Math.max(0, (nowMs - lastTickMsRef.current) / 1000);
      simDelta = rawDelta > RESET_DELTA_THRESHOLD ? 0 : Math.min(rawDelta, MAX_SIM_DELTA);
    }

    lastTickMsRef.current = nowMs;

    if (!paused && simDelta > 0) {
      simTimeRef.current = (simTimeRef.current + simDelta) % PERIOD;
    }

    const t = simTimeRef.current;
    const camera = state.camera;
    getOrbitalState(t, _pos, _vel);

    // Move group to comet world position
    groupRef.current?.position.copy(_pos);

    // Find nearest scene star for anti-solar computation
    let minDistSq = Number.POSITIVE_INFINITY;
    for (const starPos of sceneStars) {
      const distSq = _pos.distanceToSquared(starPos);
      if (distSq < minDistSq) {
        minDistSq = distSq;
        _star.copy(starPos);
      }
    }
    const dist = Math.sqrt(minDistSq);

    // Billboard coma — always face camera
    if (comaRef.current) comaRef.current.quaternion.copy(camera.quaternion);

    // Sun-facing direction (for nucleus shader lighting) — toward nearest star
    _tmp.copy(_star).sub(_pos).normalize();
    if (nucMatRef.current) nucMatRef.current.uniforms.uSunDir.value.copy(_tmp);

    // Anti-solar direction (tail points away from nearest star)
    _anti.copy(_pos).sub(_star).normalize();

    // Perpendicular basis (right/up axes of tail cross-section)
    if (Math.abs(_anti.y) < 0.95) _tmp.set(0, 1, 0); else _tmp.set(1, 0, 0);
    _rt.crossVectors(_anti, _tmp).normalize();
    _up.crossVectors(_rt, _anti).normalize();

    // Tail length & brightness scale with proximity to nearest star
    const proximity  = Math.max(TAIL_MIN, Math.pow(Math.max(0, 1 - dist / TAIL_VIS_DIST), 0.7));
    const ionLength  = 120  + proximity * 600;
    const dustLength = 80  + proximity * 400;

    // ── Ion tail ──
    const iPos = ionGeoRef.current.attributes.position as THREE.BufferAttribute;
    const iAlp = ionGeoRef.current.attributes.aAlpha   as THREE.BufferAttribute;
    const iSz  = ionGeoRef.current.attributes.aSize    as THREE.BufferAttribute;
    for (let i = 0; i < ION_N; i++) {
      const s  = ionSeeds[i];
      const et = (s.t + t * s.speed) % 1;   // cycling parametric position
      const d  = et * ionLength;
      const cr = d * s.cone;
      const cx = _rt.x * Math.cos(s.ang) + _up.x * Math.sin(s.ang);
      const cy = _rt.y * Math.cos(s.ang) + _up.y * Math.sin(s.ang);
      const cz = _rt.z * Math.cos(s.ang) + _up.z * Math.sin(s.ang);
      iPos.setXYZ(i, _anti.x * d + cx * cr, _anti.y * d + cy * cr, _anti.z * d + cz * cr);
      iAlp.setX(i,  (1.0 - et * 0.70) * 0.85 * proximity);
      iSz.setX(i,   (2.0 + s.sz * 2.5 + (1 - et) * 4.0) * proximity);
    }
    iPos.needsUpdate = true; iAlp.needsUpdate = true; iSz.needsUpdate = true;

    // ── Dust tail (curves along orbit tangent) ──
    const dPos = dustGeoRef.current.attributes.position as THREE.BufferAttribute;
    const dAlp = dustGeoRef.current.attributes.aAlpha   as THREE.BufferAttribute;
    const dSz  = dustGeoRef.current.attributes.aSize    as THREE.BufferAttribute;
    for (let i = 0; i < DUST_N; i++) {
      const s  = dustSeeds[i];
      const et = (s.t + t * s.speed) % 1;   // cycling parametric position
      const d  = et * dustLength;
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
      dAlp.setX(i,  (1.0 - et * 0.60) * 0.70 * proximity);
      dSz.setX(i,   (2.5 + s.sz * 2.5 + (1 - et) * 3.0) * proximity);
    }
    dPos.needsUpdate = true; dAlp.needsUpdate = true; dSz.needsUpdate = true;

    // ── Spray / jet particles (outgassing, drifting tailward) ──
    const sPos = sprayGeoRef.current.attributes.position as THREE.BufferAttribute;
    const sAlp = sprayGeoRef.current.attributes.aAlpha   as THREE.BufferAttribute;
    const sSz  = sprayGeoRef.current.attributes.aSize    as THREE.BufferAttribute;
    const JET_LEN = 18;    // coma envelope around nucleus
    // sunDir = -_anti (toward sun), used to bias which jets are active
    const sunX = -_anti.x, sunY = -_anti.y, sunZ = -_anti.z;
    for (let i = 0; i < SPRAY_N; i++) {
      const s = spraySeeds[i];
      const sunFacing = s.dx * sunX + s.dy * sunY + s.dz * sunZ;
      const activity  = Math.max(0.1, sunFacing * s.sunHeat + (1 - s.sunHeat) * 0.35);
      const at = (s.t + t * s.speed) % 1;
      const d  = NUCLEUS_R + at * JET_LEN;
      // Gentle tailward drift as particle ages
      const drift = at * at * 4.0;
      sPos.setXYZ(i,
        s.dx * d + _anti.x * drift,
        s.dy * d + _anti.y * drift,
        s.dz * d + _anti.z * drift,
      );
      const fadeout = Math.pow(1.0 - at, 1.8);    // steep fade, bright only near nucleus
      sAlp.setX(i, fadeout * activity * 0.55 * proximity);
      sSz.setX(i,  (s.sz * 3.5 + fadeout * 4.0) * Math.max(proximity, 0.4));
    }
    sPos.needsUpdate = true; sAlp.needsUpdate = true; sSz.needsUpdate = true;
  });

  return (
    <group ref={groupRef} position={initialPos}>
      {/* Invisible hit-detection sphere — nucleus is sub-pixel at typical distances */}
      <mesh
        userData={{ walletAddress: COMET_ADDRESS, bodyRadius: NUCLEUS_R, bodyType: "comet" }}
        onClick={interactive ? (e) => { e.stopPropagation(); onSelect?.(COMET_ADDRESS); } : undefined}
      >
        <sphereGeometry args={[12, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Nucleus */}
      <mesh>
        <sphereGeometry args={[NUCLEUS_R, 32, 24]} />
        <primitive object={nucleusMat} attach="material" />
      </mesh>

      {/* Coma glow billboard */}
      <mesh ref={comaRef} material={comaMat}>
        <planeGeometry args={[14, 14]} />
      </mesh>

      {/* Spray / jet particles — active outgassing */}
      <points geometry={sprayGeo} material={sprayMat} frustumCulled={false} />

      {/* Ion tail — straight, blue-white */}
      <points geometry={ionGeo} material={ionMat} frustumCulled={false} />

      {/* Dust tail — curved, golden */}
      <points geometry={dustGeo} material={dustMat} frustumCulled={false} />

      {/* Label */}
      {showLabel && (
        <SpriteLabel
          position={[0, NUCLEUS_R + 6, 0]}
          text="CASCOPEA"
          color="#a8d0ff"
          fontSize={0.35}
          opacity={0.45}
          outlineWidth={0}
          onClick={interactive ? () => onSelect?.(COMET_ADDRESS) : undefined}
          alwaysVisible
        />
      )}
    </group>
  );
}
