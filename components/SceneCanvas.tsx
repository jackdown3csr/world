"use client";

/**
 * SceneCanvas — the WebGL canvas and all 3D scene content.
 * All state flows in via props; no hooks except refs forwarded from SolarSystem.
 */

import React, { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { RefObject } from "react";

import FreeLookControls from "./FreeLookControls";
import type { FreeLookHandle } from "./FreeLookControls";
import CameraController from "./CameraController";
import type { CameraMode } from "./CameraController";

import StarSystem from "./StarSystem";
import GalaxyBackground from "./GalaxyBackground";
import Comet from "./Comet";
import RoguePlanet from "./RoguePlanet";
import FaucetSatellite from "./FaucetSatellite";
import EpochSatellite from "./EpochSatellite";
import { SpriteLabelManager } from "./SpriteLabel";

import type { SolarSystemData } from "@/lib/layout/types";
import type { WalletEntry } from "@/lib/types";
import type { VestingWalletEntry } from "@/lib/types";
import type { FaucetStats } from "@/hooks/useFaucet";

/* ── Screenshot helper — must live inside Canvas to access gl ── */
export interface ScreenshotHandle { capture: () => void; }
const ScreenshotHelper = forwardRef<ScreenshotHandle>(function ScreenshotHelper(_, ref) {
  const { gl, scene, camera } = useThree();
  useImperativeHandle(ref, () => ({
    capture() {
      gl.render(scene, camera);
      const dataURL = gl.domElement.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = dataURL;
      a.download = `vescrow-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.png`;
      a.click();
    },
  }), [gl, scene, camera]);
  return null;
});

/* ── Active-system detector — check camera proximity each frame ── */
const VESTING_POS = new THREE.Vector3(16000, 3000, 0);
function ActiveSystemDetector({ onChange }: { onChange: (s: "warm" | "cool") => void }) {
  const lastRef = useRef<"warm" | "cool">("warm");
  useFrame(({ camera }) => {
    const warmDist = camera.position.lengthSq();
    const coolDist = camera.position.distanceToSquared(VESTING_POS);
    const active = warmDist <= coolDist ? "warm" : "cool";
    if (active !== lastRef.current) {
      lastRef.current = active;
      onChange(active);
    }
  });
  return null;
}

export interface SceneCanvasProps {
  isMobile: boolean;
  solarData: SolarSystemData;
  vestingData: SolarSystemData;
  totalVotingPower: string;
  totalLocked: string;
  vestingTotalEntitled: string;
  vestingTotalClaimed: string;
  blockFlash: number;
  showOrbits: boolean;
  showAllNames: boolean;
  showRenamedOnly: boolean;
  showTrails: boolean;
  photoMode: boolean;
  selectedAddress: string | null;
  panelOpen: boolean;
  cameraMode: CameraMode;
  flyModeEnabled: boolean;
  resetRequested: boolean;
  controlsRef: RefObject<OrbitControlsImpl>;
  freelookRef: RefObject<FreeLookHandle>;
  screenshotRef: RefObject<ScreenshotHandle>;
  wallets: WalletEntry[];
  vestingWallets: VestingWalletEntry[];
  faucetStats: FaucetStats | null;
  currentEpoch: number;
  vestingBeltOuterRadius: number;
  onSelect: (addr: string) => void;
  onDeselect: () => void;
  onShiftSelectVescrow: (addr: string) => void;
  onShiftSelectVesting: (addr: string) => void;
  onRogueClick: () => void;
  onModeChange: (mode: CameraMode) => void;
  onZoomChange: (zoom: number) => void;
  onCameraDebug: (debug: { pos: [number,number,number]; target: [number,number,number]; distTarget: number; distOrigin: number; tracking: string | null } | null) => void;
  onResetDone: () => void;
  selectionVersion: number;
}

export default function SceneCanvas({
  isMobile,
  solarData,
  vestingData,
  totalVotingPower,
  totalLocked,
  vestingTotalEntitled,
  vestingTotalClaimed,
  blockFlash,
  showOrbits,
  showAllNames,
  showRenamedOnly,
  showTrails,
  photoMode,
  selectedAddress,
  panelOpen,
  cameraMode,
  flyModeEnabled,
  resetRequested,
  controlsRef,
  freelookRef,
  screenshotRef,
  wallets,
  vestingWallets,
  faucetStats,
  currentEpoch,
  vestingBeltOuterRadius,
  onSelect,
  onDeselect,
  onShiftSelectVescrow,
  onShiftSelectVesting,
  onRogueClick,
  onModeChange,
  onZoomChange,
  onCameraDebug,
  onResetDone,
  selectionVersion,
}: SceneCanvasProps) {
  const [activeSystem, setActiveSystem] = useState<"warm" | "cool">("warm");

  return (
    <Canvas
      camera={{ position: [0, 500, 1600], fov: 55, near: 0.1, far: 60000 }}
      style={{ width: "100%", height: "100%" }}
      gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
      dpr={[1, isMobile ? 1.5 : 2]}
    >
      <ambientLight intensity={0.025} />
      <SpriteLabelManager />
      <ActiveSystemDetector onChange={setActiveSystem} />
      <GalaxyBackground />
      <Comet onSelect={onSelect} showLabel={showAllNames && !photoMode} />
      <RoguePlanet onRogueClick={onRogueClick} />
      <FaucetSatellite stats={faucetStats} showLabel={showAllNames && !photoMode} onSelect={onSelect} />

      {/* ── veGNET / VESCROW system ── */}
      <StarSystem
        solarData={solarData}
        palette="warm"
        starLabel="VESCROW"
        totalVotingPower={totalVotingPower}
        totalLocked={totalLocked}
        blockNumber={blockFlash}
        showOrbits={showOrbits}
        showAllNames={showAllNames}
        showRenamedOnly={showRenamedOnly || activeSystem !== "warm"}
        showTrails={showTrails}
        photoMode={photoMode}
        showSolarWind
        selectedAddress={selectedAddress}
        panelOpen={panelOpen}
        onSelect={onSelect}
        onDeselect={onDeselect}
        onStarSelect={() => onSelect("__star_warm__")}
        onShiftSelect={onShiftSelectVescrow}
      />

      {/* ── Vesting system — blue O-type star ── */}
      <StarSystem
        solarData={vestingData}
        position={[16000, 3000, 0]}
        palette="cool"
        starLabel="VESTING"
        totalVotingPower={vestingTotalEntitled}
        totalLocked={vestingTotalClaimed}
        showOrbits={showOrbits}
        showAllNames={showAllNames}
        showRenamedOnly={showRenamedOnly || activeSystem !== "cool"}
        showTrails={showTrails}
        photoMode={photoMode}
        showSolarWind
        diskMode
        selectedAddress={selectedAddress}
        panelOpen={panelOpen}
        onSelect={onSelect}
        onDeselect={onDeselect}
        onStarSelect={() => onSelect("__star_cool__")}
        onShiftSelect={onShiftSelectVesting}
      />

      {/* Epoch beacon — outermost orbit of the vesting system */}
      <group position={[16000, 3000, 0]}>
        <EpochSatellite
          epoch={currentEpoch}
          orbitRadius={vestingBeltOuterRadius + 30}
          showLabel={showAllNames && !photoMode}
          onSelect={onSelect}
        />
      </group>

      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        minDistance={0.3}
        maxDistance={22000}
        enableDamping
        dampingFactor={0.05}
        enabled={cameraMode === "orbit"}
      />

      {flyModeEnabled && (
        <FreeLookControls ref={freelookRef} enabled={cameraMode === "fly"} />
      )}

      <CameraController
        selectedAddress={selectedAddress}
        selectionVersion={selectionVersion}
        cameraMode={cameraMode}
        controlsRef={controlsRef}
        freelookRef={freelookRef}
        onModeChange={onModeChange}
        onZoomChange={onZoomChange}
        onCameraDebug={onCameraDebug}
        resetRequested={resetRequested}
        onResetDone={onResetDone}
      />
      <ScreenshotHelper ref={screenshotRef} />
    </Canvas>
  );
}
