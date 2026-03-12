"use client";

/**
 * TransactionFlow — renders one live blockchain transaction as a curved
 * arc between two scene bodies, with a tiny shuttle-like packet moving
 * along the path.
 *
 * Pure visual component: no data fetching, no classification.
 * Renders until expiresAt passes, using live body positions from the registry.
 */

import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { lookupSceneBody } from "@/lib/sceneRegistry";
import type { TransactionFlowEffect } from "@/lib/blockExplorer/types";

/* ── Color palettes ──────────────────────────────────────── */
const PALETTE = {
  ecosystem: {
    arc:     new THREE.Color("#00c8ff"),
    packets: new THREE.Color("#00e5ff"),
    glow:    new THREE.Color("#50f0ff"),
  },
  generic: {
    arc:     new THREE.Color("#3898d0"),
    packets: new THREE.Color("#40a8e0"),
    glow:    new THREE.Color("#50b8f0"),
  },
};

const PACKET_COUNT   = 1;
const TRAIL_SEGS     = 48;
const TRAIL_LENGTH   = 0.72;
const FALLBACK_RING_INNER = 280;
const FALLBACK_RING_OUTER = 540;
const FALLBACK_Y_SPREAD = 180;
const PACKET_AXIS = new THREE.Vector3(1, 0, 0);

/* ── Module-level scratch vector (never allocated in render) ─ */
const _pt = new THREE.Vector3();
const _nextPt = new THREE.Vector3();
const _dir = new THREE.Vector3();

/** Map system ID → system star scene ID */
const SYSTEM_TO_STAR: Record<string, string> = {
  "vescrow":         "__star_vescrow__",
  "vesting":         "__star_vesting__",
  "gubi-pool":       "__star_gubi_pool__",
  "staking-remnant": "__star_staking_remnant__",
  "transit-beacon":  "__transit_beacon__",
};

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function buildFallbackWalletPosition(id: string, fallbackSystem: string): THREE.Vector3 | null {
  const starId = SYSTEM_TO_STAR[fallbackSystem];
  if (!starId) return null;
  const star = lookupSceneBody(starId);
  if (!star) return null;

  const seedA = hashString(`${id}:a`);
  const seedB = hashString(`${id}:b`);
  const seedC = hashString(`${id}:c`);

  const angle = (seedA / 0xffffffff) * Math.PI * 2;
  const radius = FALLBACK_RING_INNER + (seedB / 0xffffffff) * (FALLBACK_RING_OUTER - FALLBACK_RING_INNER);
  const y = ((seedC / 0xffffffff) * 2 - 1) * FALLBACK_Y_SPREAD;

  return star.position.clone().add(new THREE.Vector3(
    Math.cos(angle) * radius,
    y,
    Math.sin(angle) * radius,
  ));
}

function resolvePosition(id: string | null): THREE.Vector3 | null {
  if (!id) return null;
  const direct = lookupSceneBody(id);
  if (direct) return direct.position.clone();
  const starId = SYSTEM_TO_STAR[id];
  if (starId) {
    const star = lookupSceneBody(starId);
    if (star) return star.position.clone();
  }
  return null;
}

function getEffectPosition(primaryId: string | null, fallbackSystem: string): THREE.Vector3 | null {
  const primary = resolvePosition(primaryId);
  if (primary) return primary;
  if (primaryId) {
    const fallbackWallet = buildFallbackWalletPosition(primaryId, fallbackSystem);
    if (fallbackWallet) return fallbackWallet;
  }
  const starId = SYSTEM_TO_STAR[fallbackSystem];
  if (starId) {
    const star = lookupSceneBody(starId);
    if (star) return star.position.clone();
  }
  return null;
}

/** Quadratic bezier: P(t) = (1-t)² P0 + 2(1-t)t P1 + t² P2 */
function quadBezier(
  out: THREE.Vector3,
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  t: number,
): void {
  const mt = 1 - t;
  out.x = mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x;
  out.y = mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y;
  out.z = mt * mt * p0.z + 2 * mt * t * p1.z + t * t * p2.z;
}

function buildControl(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3 {
  const mid   = new THREE.Vector3().lerpVectors(from, to, 0.5);
  const dist  = from.distanceTo(to);
  const lift  = Math.min(dist * 0.18, 1800);
  const chord = new THREE.Vector3().subVectors(to, from);
  const perp  = new THREE.Vector3().crossVectors(chord, new THREE.Vector3(0, 1, 0));
  if (perp.lengthSq() < 0.001) perp.crossVectors(chord, new THREE.Vector3(0, 0, 1));
  perp.normalize().multiplyScalar(lift);
  return mid.add(perp);
}

/* ── Trail as gaussian dots — visible at any zoom level ──── */

/**
 * Vertex: each trail sample has an aT attribute (0=tail → 1=head).
 * gl_PointSize ramps from small at tail to larger at head, scaled by
 * camera distance so the trail stays legible across zoom levels.
 */
const TRAIL_VERT = /* glsl */ `
  attribute float aT;
  uniform float uDistScale;
  varying float vT;
  void main() {
    vT = aT;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float dist = max(-mv.z, 1.0);
    gl_PointSize = clamp((2.5 + aT * 14.0) * uDistScale / dist, 2.5, 48.0);
    gl_Position  = projectionMatrix * mv;
  }
`;

/**
 * Fragment: soft gaussian disk, brighter toward the head.
 */
const TRAIL_FRAG = /* glsl */ `
  uniform vec3  uColor;
  uniform float uAlpha;
  varying float vT;
  void main() {
    float d      = length(gl_PointCoord - 0.5) * 2.0;
    float circle = smoothstep(1.0, 0.12, d);
    float bright = 0.12 + vT * vT * 0.88;
    gl_FragColor = vec4(uColor, circle * uAlpha * bright);
  }
`;

/* ── Main component ─────────────────────────────────────── */
export interface TransactionFlowProps {
  effect: TransactionFlowEffect;
}

export default function TransactionFlow({ effect }: TransactionFlowProps) {
  const groupRef    = useRef<THREE.Group>(null);
  const packetRefs  = useRef<THREE.Mesh[]>([]);
  const glowRefs    = useRef<THREE.Mesh[]>([]);
  const liveRef     = useRef(true);
  const progressRef = useRef(0);

  const palette = PALETTE[effect.paletteHint];
  const isVestingClaim = effect.classification === "vesting-claim";

  const packetOffsets = useMemo(() => [0], []);
  const isLongRange = effect.fromSystemId !== effect.toSystemId;
  const longScale = isLongRange ? 5.0 : 1;
  const trailDistScale = isLongRange ? 900 : 220;
  const packetSize: [number, number, number] = isVestingClaim
    ? [8.2, 2.2, 2.2]
    : effect.paletteHint === "ecosystem"
      ? [10.5 * longScale, 2.8 * longScale, 2.8 * longScale]
      : [7.2 * longScale, 2.2 * longScale, 2.2 * longScale];
  const glowSize: [number, number, number] = [
    packetSize[0] * 1.32,
    packetSize[1] * 1.7,
    packetSize[2] * 1.7,
  ];

  /* Trail geometry — Points of gaussian dots, updated imperatively each frame */
  const { trailGeo, trailMat, trailPoints } = useMemo(() => {
    const n = TRAIL_SEGS + 1;
    const positions = new Float32Array(n * 3);
    const aT = new Float32Array(n);
    for (let i = 0; i < n; i++) aT[i] = i / TRAIL_SEGS; // 0=tail → 1=head
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aT", new THREE.BufferAttribute(aT, 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader:   TRAIL_VERT,
      fragmentShader: TRAIL_FRAG,
      uniforms: {
        uColor:     { value: palette.arc.clone() },
        uAlpha:     { value: 0 },
        uDistScale: { value: trailDistScale },
      },
      transparent: true,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending,
      toneMapped:  false,
    });
    return { trailGeo: geo, trailMat: mat, trailPoints: new THREE.Points(geo, mat) };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    liveRef.current = true;
    progressRef.current = 0;
    return () => {
      trailGeo.dispose();
      trailMat.dispose();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    const now = Date.now();
    if (!liveRef.current || now > effect.expiresAt) {
      liveRef.current = false;
      groupRef.current.visible = false;
      return;
    }

    const f = getEffectPosition(effect.fromId, effect.fromSystemId);
    const t = getEffectPosition(effect.toId,   effect.toSystemId);

    if (!f || !t || f.distanceTo(t) < 0.1) {
      groupRef.current.visible = false;
      return;
    }

    groupRef.current.visible = true;
    const ctrl = buildControl(f, t);

    const rawProgress = (now - effect.startedAt) / Math.max(effect.expiresAt - effect.startedAt, 1);
    if (rawProgress < 0) {
      groupRef.current.visible = false;
      return;
    }

    const progress = Math.min(Math.max(rawProgress, 0), 1);
    progressRef.current = progress;

    // Gentle envelope: quick fade in, broad readable mid-section, soft fade out.
    const fadein = Math.min(progress / 0.12, 1);
    const fadeout = Math.min((1 - progress) / 0.16, 1);
    const alpha = Math.max(0, Math.min(fadein, fadeout));

    for (let i = 0; i < PACKET_COUNT; i++) {
      const mesh = packetRefs.current[i];
      const glow = glowRefs.current[i];
      if (!mesh || !glow) continue;

      const tVal = Math.min(progressRef.current + packetOffsets[i], 1);
      quadBezier(_pt, f, ctrl, t, tVal);
      mesh.position.copy(_pt);
      glow.position.copy(_pt);

      const lookAhead = Math.min(tVal + 0.02, 1);
      quadBezier(_nextPt, f, ctrl, t, lookAhead);
      _dir.subVectors(_nextPt, _pt);
      if (_dir.lengthSq() > 0.0001) {
        _dir.normalize();
        mesh.quaternion.setFromUnitVectors(PACKET_AXIS, _dir);
        glow.quaternion.copy(mesh.quaternion);
      }

      // Wake trail — gaussian dot arc behind the shuttle, updated every frame
      {
        const tStart = Math.max(0, tVal - TRAIL_LENGTH);
        const posAttr = trailGeo.getAttribute("position") as THREE.BufferAttribute;
        const buf     = posAttr.array as Float32Array;
        for (let k = 0; k <= TRAIL_SEGS; k++) {
          const tk = tStart + (tVal - tStart) * (k / TRAIL_SEGS);
          quadBezier(_pt, f, ctrl, t, tk);
          buf[k * 3]     = _pt.x;
          buf[k * 3 + 1] = _pt.y;
          buf[k * 3 + 2] = _pt.z;
        }
        posAttr.needsUpdate = true;
        trailMat.uniforms.uAlpha.value =
          alpha * Math.sin(tVal * Math.PI) *
          (isVestingClaim ? 0.60 : effect.paletteHint === "ecosystem" ? 0.88 : 0.78);
      }

      const edgeAlpha  = Math.sin(tVal * Math.PI);
      const packetAlpha = alpha * edgeAlpha *
        (isVestingClaim
          ? 0.42
          : effect.paletteHint === "ecosystem"
            ? 0.68
            : 0.58);

      (mesh.material as THREE.MeshBasicMaterial).opacity = packetAlpha;
      (glow.material as THREE.MeshBasicMaterial).opacity = packetAlpha * (isVestingClaim ? 0.08 : 0.12);
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={trailPoints} renderOrder={5} />

      {packetOffsets.map((_, i) => (
        <group key={i}>
          <mesh
            ref={(el) => { if (el) glowRefs.current[i] = el; }}
            renderOrder={8}
          >
            <boxGeometry args={glowSize} />
            <meshBasicMaterial
              color={palette.glow}
              transparent
              opacity={0}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
          <mesh
            ref={(el) => { if (el) packetRefs.current[i] = el; }}
            renderOrder={9}
          >
            <boxGeometry args={packetSize} />
            <meshBasicMaterial
              color={palette.packets}
              transparent
              opacity={0}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}
