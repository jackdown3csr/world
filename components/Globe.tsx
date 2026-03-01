"use client";

import React, { useRef, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

import { useWallets } from "@/hooks/useWallets";
import Planet from "./Planet";
import Cities from "./Cities";

/**
 * Top‑level 3D scene: canvas, camera, lights, planet, cities, controls.
 * Auto‑rotates when idle (no pointer interaction for 5 s).
 */
export default function Globe() {
  const { wallets } = useWallets();
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout>>();

  const IDLE_DELAY = 5_000; // ms before auto‑rotate starts

  const startIdleTimer = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    // Stop auto-rotate immediately on interaction
    if (controlsRef.current) controlsRef.current.autoRotate = false;

    idleTimer.current = setTimeout(() => {
      if (controlsRef.current) controlsRef.current.autoRotate = true;
    }, IDLE_DELAY);
  }, []);

  return (
    <Canvas
      camera={{ position: [0, 0, 3.2], fov: 45, near: 0.1, far: 100 }}
      style={{ width: "100%", height: "100%" }}
      gl={{ antialias: true, alpha: false }}
      onPointerDown={startIdleTimer}
      onPointerUp={startIdleTimer}
      onWheel={startIdleTimer}
    >
      {/* Lighting */}
      <ambientLight intensity={0.25} />
      <directionalLight position={[5, 3, 5]} intensity={1.2} />
      <pointLight position={[-5, -3, -5]} intensity={0.3} color="#4488ff" />

      {/* Star background */}
      <Stars
        radius={80}
        depth={60}
        count={3000}
        factor={4}
        saturation={0.1}
        fade
        speed={0.5}
      />

      {/* Planet surface + atmosphere */}
      <Planet />

      {/* Instanced wallet cities */}
      <Cities wallets={wallets} />

      {/* Camera controls */}
      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        minDistance={1.6}
        maxDistance={6}
        autoRotate
        autoRotateSpeed={0.4}
        enableDamping
        dampingFactor={0.08}
      />
    </Canvas>
  );
}
