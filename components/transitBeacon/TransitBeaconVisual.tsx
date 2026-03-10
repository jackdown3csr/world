"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface TransitBeaconVisualProps {
  radius: number;
  paused?: boolean;
}

export default function TransitBeaconVisual({
  radius,
  paused = false,
}: TransitBeaconVisualProps) {
  const rootRef   = useRef<THREE.Group>(null);
  const dishRef   = useRef<THREE.Group>(null);
  const beaconRef = useRef<THREE.Mesh>(null);

  const r = radius;

  const mat = useMemo(() => ({
    hull:  new THREE.MeshStandardMaterial({ color: "#cac4ba", roughness: 0.50, metalness: 0.74 }),
    trim:  new THREE.MeshStandardMaterial({ color: "#a8b4c2", roughness: 0.26, metalness: 0.96 }),
    solar: new THREE.MeshStandardMaterial({ color: "#16222c", roughness: 0.84, metalness: 0.22 }),
    dark:  new THREE.MeshStandardMaterial({ color: "#1a252e", roughness: 0.90, metalness: 0.40 }),
    emitter: new THREE.MeshBasicMaterial({
      color: "#50d8ff",
      transparent: true, opacity: 0.26,
      depthWrite: false, toneMapped: false,
      blending: THREE.AdditiveBlending,
    }),
  }), []);

  useFrame((state, delta) => {
    if (paused) return;
    const t  = state.clock.elapsedTime;
    const dt = Math.min(delta, 0.05);

    // Gentle slow drift — orbit-like tumble
    if (rootRef.current) {
      rootRef.current.rotation.y += dt * 0.07;
      rootRef.current.rotation.x =  Math.sin(t * 0.19) * 0.06;
    }

    // Dish slowly tracks — pans around Y
    if (dishRef.current) {
      dishRef.current.rotation.y = Math.sin(t * 0.38) * 0.28;
      dishRef.current.rotation.z = -0.05 + Math.sin(t * 0.27) * 0.06;
    }

    // Beacon pulse
    if (beaconRef.current) {
      const pulse = 1 + (Math.sin(t * 2.6) * 0.5 + 0.5) * 0.3;
      beaconRef.current.scale.setScalar(pulse);
      (beaconRef.current.material as THREE.MeshBasicMaterial).opacity = 0.12 + (pulse - 1) * 0.3;
    }
  });

  // Proportions — r = TRANSIT_BEACON_RADIUS (36 world units)
  const busL      = r * 1.05;   // length along X
  const busW      = r * 0.26;   // square cross-section side
  const wingSpan  = r * 0.70;   // each wing half-span in Y (extending up/down from bus edge)
  const wingChord = r * 0.36;   // wing extent along X
  const dishR     = r * 0.30;   // dish aperture radius (modest)

  // Wing Y-center: bus edge + gap + half-span
  const wingY = busW * 0.5 + r * 0.04 + wingSpan * 0.5;

  return (
    <group ref={rootRef}>

      {/* ── Satellite bus ── */}
      <mesh material={mat.hull}>
        <boxGeometry args={[busL, busW, busW]} />
      </mesh>

      {/* Narrow trim rings at thirds */}
      {[-0.32, 0, 0.32].map((frac, i) => (
        <mesh key={i} position={[frac * busL, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={mat.trim}>
          <torusGeometry args={[busW * 0.54, r * 0.008, 5, 14]} />
        </mesh>
      ))}

      {/* End caps */}
      <mesh position={[-busL * 0.5, 0, 0]} rotation={[0, Math.PI / 2, 0]} material={mat.dark}>
        <cylinderGeometry args={[busW * 0.48, busW * 0.48, r * 0.025, 8]} />
      </mesh>
      <mesh position={[ busL * 0.5, 0, 0]} rotation={[0, Math.PI / 2, 0]} material={mat.dark}>
        <cylinderGeometry args={[busW * 0.38, busW * 0.46, r * 0.040, 8]} />
      </mesh>

      {/* ── Solar wings ±Y ── */}
      {([-1, 1] as const).map((side) => (
        <group key={side} position={[r * 0.03, side * wingY, 0]}>
          {/* Main panel — flat in XZ plane, spanning in Y (via rotation) */}
          <mesh material={mat.solar}>
            <boxGeometry args={[wingChord, wingSpan, r * 0.007]} />
          </mesh>

          {/* Cell divider ribs (3 vertical, along Y) */}
          {[-0.28, 0, 0.28].map((frac, j) => (
            <mesh key={j} position={[frac * wingChord, 0, 0]} material={mat.trim}>
              <boxGeometry args={[r * 0.009, wingSpan + r * 0.01, r * 0.010]} />
            </mesh>
          ))}

          {/* Top & bottom edge frame bars */}
          {[-1, 1].map((e, j) => (
            <mesh key={j} position={[0, e * wingSpan * 0.495, 0]} material={mat.trim}>
              <boxGeometry args={[wingChord + r * 0.015, r * 0.010, r * 0.012]} />
            </mesh>
          ))}

          {/* Hinge strut connecting wing to bus */}
          <mesh position={[-wingChord * 0.5 - r * 0.02, -side * wingSpan * 0.5, 0]} material={mat.trim}>
            <cylinderGeometry args={[r * 0.010, r * 0.010, r * 0.06 + busW * 0.5 * 0.5, 5]} />
          </mesh>
        </group>
      ))}

      {/* ── Dish on -X face ── */}
      <group ref={dishRef} position={[-busL * 0.5 - r * 0.02, 0, 0]}>
        {/* Collar */}
        <mesh rotation={[0, Math.PI / 2, 0]} material={mat.trim}>
          <cylinderGeometry args={[r * 0.07, r * 0.05, r * 0.05, 10]} />
        </mesh>

        {/* Dish bowl — spherical cap opening toward -X */}
        {/* phiStart=0, phiLength=2π (full circle), thetaStart=0, thetaLength=π/2 (cap)
            then rotated so +Y pole points to -X */}
        <mesh rotation={[0, 0, Math.PI / 2]} material={mat.hull}>
          <sphereGeometry args={[dishR, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.44]} />
        </mesh>

        {/* Dish rim */}
        <mesh rotation={[0, Math.PI / 2, 0]} material={mat.trim}>
          <torusGeometry args={[dishR, r * 0.010, 5, 26]} />
        </mesh>

        {/* Feed horn */}
        <mesh position={[-r * 0.06, 0, 0]} rotation={[0, Math.PI / 2, 0]} material={mat.trim}>
          <cylinderGeometry args={[r * 0.014, r * 0.006, r * 0.14, 6]} />
        </mesh>

        {/* Pulse emitter */}
        <mesh ref={beaconRef} position={[-r * 0.14, 0, 0]} material={mat.emitter}>
          <sphereGeometry args={[r * 0.022, 8, 8]} />
        </mesh>
      </group>

      {/* ── Short omni antennae at +X end ── */}
      {[
        { y:  busW * 0.38, z:  0,          rz:  0.18 },
        { y: -busW * 0.22, z:  busW * 0.30, rz: -0.12 },
        { y:  busW * 0.10, z: -busW * 0.32, rz:  0.08 },
      ].map((a, i) => (
        <mesh
          key={i}
          position={[busL * 0.5 + r * 0.14, a.y, a.z]}
          rotation={[0, 0, Math.PI / 2 + a.rz]}
          material={mat.trim}
        >
          <cylinderGeometry args={[r * 0.007, r * 0.003, r * 0.32, 5]} />
        </mesh>
      ))}

    </group>
  );
}
