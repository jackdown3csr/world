"use client";

/**
 * SceneCanvas — the WebGL canvas and all 3D scene content.
 * All state flows in via props; no hooks except refs forwarded from SolarSystem.
 */

import React, { forwardRef, useImperativeHandle, useEffect, useMemo, useRef, useState } from "react";
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
import SputnikProbe from "./SputnikProbe";
import CanonicalBridgePortal from "./CanonicalBridgePortal";
import HyperlanePortal from "./HyperlanePortal";
import TransitBeacon from "./TransitBeacon";
import { SpriteLabelManager } from "./SpriteLabel";
import { lookupSceneBody } from "@/lib/sceneRegistry";
import type { SceneFocusBody } from "@/lib/sceneRegistry";
import TransactionFlow from "./TransactionFlow";
import type { TransactionFlowEffect } from "@/lib/blockExplorer/types";

import type {
  SceneEffectDefinition,
  SceneGlobalObject,
  SceneSystemDecorator,
  SceneSystemDefinition,
  SceneSystemId,
} from "@/lib/sceneSystems";

// findSceneBody replaced by lookupSceneBody from @/lib/sceneRegistry

function getFocusPingColor(bodyType: string) {
  switch (bodyType) {
    case "comet":
      return "#c8f6ff";
    case "rogue":
      return "#ff8d7a";
    case "bridge":
      return "#7bf7ff";
    case "star":
      return "#ffd27a";
    default:
      return "#74efff";
  }
}

function getFocusPingRadius(body: SceneFocusBody) {
  if (body.bodyType === "star") {
    const overviewRadius = body.focusRadius ?? body.bodyRadius * 1.5;
    return THREE.MathUtils.clamp(overviewRadius * 0.18, 86, 220);
  }
  if (body.bodyType === "bridge") {
    return Math.max(body.bodyRadius * 1.8, 44);
  }
  if (body.bodyType === "comet" || body.bodyType === "rogue") {
    return Math.max(body.bodyRadius * 2.8, 18);
  }
  return Math.max(body.bodyRadius * 2.35, 12);
}

function FocusPing({
  selectedAddress,
  selectionVersion,
  persistent = false,
}: {
  selectedAddress: string | null;
  selectionVersion: number;
  persistent?: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const echoRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const liveRef = useRef(false);
  const targetAddrRef = useRef<string | null>(null);
  const startedAtRef = useRef(0);
  const baseRadiusRef = useRef(18);
  const prevVersionRef = useRef(selectionVersion);
  const pingColorRef = useRef("#74efff");
  const DURATION = 0.72;

  React.useEffect(() => {
    if (selectionVersion === prevVersionRef.current) return;
    prevVersionRef.current = selectionVersion;

    if (!selectedAddress) {
      liveRef.current = false;
      targetAddrRef.current = null;
      if (groupRef.current) groupRef.current.visible = false;
      return;
    }

    const body = lookupSceneBody(selectedAddress.toLowerCase());
    if (!body) {
      liveRef.current = false;
      targetAddrRef.current = null;
      if (groupRef.current) groupRef.current.visible = false;
      return;
    }

    targetAddrRef.current = selectedAddress.toLowerCase();
    startedAtRef.current = performance.now() * 0.001;
    baseRadiusRef.current = getFocusPingRadius(body);
    pingColorRef.current = getFocusPingColor(body.bodyType);
    liveRef.current = true;

    if (groupRef.current) {
      groupRef.current.visible = true;
      groupRef.current.position.copy(body.position);
    }
  }, [selectedAddress, selectionVersion]);

  useFrame(({ camera: frameCamera }) => {
    if (!liveRef.current || !groupRef.current || !targetAddrRef.current) return;

    const elapsed = performance.now() * 0.001 - startedAtRef.current;
    if (!persistent && elapsed >= DURATION) {
      liveRef.current = false;
      groupRef.current.visible = false;
      return;
    }

    const body = lookupSceneBody(targetAddrRef.current);
    if (!body) {
      liveRef.current = false;
      groupRef.current.visible = false;
      return;
    }

    const radiusScale = persistent
      ? (body.bodyType === "star" ? 0.42 : body.bodyType === "bridge" ? 0.58 : 0.7)
      : 1;
    const t = persistent
      ? (0.5 + Math.sin(elapsed * 3.2) * 0.5)
      : THREE.MathUtils.clamp(elapsed / DURATION, 0, 1);
    const eased = persistent ? t : 1 - Math.pow(1 - t, 2.4);
    const fade = persistent ? 0.58 : 1 - t;
    const baseRadius = getFocusPingRadius(body);
    const renderRadius = baseRadius * radiusScale;
    const pulseScale = persistent ? 1.08 + eased * 0.12 : 1 + eased * 1.6;
    const echoScale = persistent ? 0.96 + eased * 0.1 : 0.8 + eased * 1.15;

    baseRadiusRef.current = baseRadius;
    groupRef.current.visible = true;
    groupRef.current.position.copy(body.position);
    groupRef.current.quaternion.copy(frameCamera.quaternion);

    if (coreRef.current) {
      coreRef.current.scale.setScalar(renderRadius * pulseScale);
      const material = coreRef.current.material as THREE.MeshBasicMaterial;
      material.color.set(pingColorRef.current);
      material.opacity = (persistent ? 0.11 : 0.34) * fade;
    }

    if (echoRef.current) {
      echoRef.current.scale.setScalar(renderRadius * echoScale);
      const material = echoRef.current.material as THREE.MeshBasicMaterial;
      material.color.set(pingColorRef.current);
      material.opacity = (persistent ? 0.08 : 0.22) * (persistent ? 0.78 + eased * 0.12 : 1 - eased) * fade;
    }

    if (glowRef.current) {
      glowRef.current.scale.setScalar(renderRadius * (persistent ? 0.68 + eased * 0.1 : 0.55 + eased * 0.5));
      const material = glowRef.current.material as THREE.MeshBasicMaterial;
      material.color.set(pingColorRef.current);
      material.opacity = (persistent ? 0.035 : 0.1) * fade;
    }
  });

  return (
    <group ref={groupRef} visible={false} renderOrder={30}>
      <mesh ref={glowRef}>
        <circleGeometry args={[1, 40]} />
        <meshBasicMaterial
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          color="#74efff"
        />
      </mesh>
      <mesh ref={echoRef}>
        <ringGeometry args={[0.86, 1, 56]} />
        <meshBasicMaterial
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          color="#74efff"
        />
      </mesh>
      <mesh ref={coreRef}>
        <ringGeometry args={[0.93, 1, 64]} />
        <meshBasicMaterial
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          color="#74efff"
        />
      </mesh>
    </group>
  );
}

/* ── Screenshot helper — must live inside Canvas to access gl ── */
export interface ScreenshotHandle { capture: () => void; }
const ScreenshotHelper = forwardRef<ScreenshotHandle>(function ScreenshotHelper(_, ref) {
  const { gl, scene, camera } = useThree();
  const filenamePrefix = "sector-galactica";
  useImperativeHandle(ref, () => ({
    capture() {
      gl.render(scene, camera);
      const dataURL = gl.domElement.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = dataURL;
      a.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.png`;
      a.click();
    },
  }), [gl, scene, camera]);
  return null;
});

/* ── Active-system detector — check camera proximity each frame ── */
function ActiveSystemDetector({
  systems,
  onChange,
}: {
  systems: SceneSystemDefinition[];
  onChange: (id: SceneSystemId) => void;
}) {
  const lastRef = useRef<SceneSystemId>(systems[0]?.id ?? "vescrow");
  const systemPositions = useMemo(
    () => systems.map((system) => new THREE.Vector3(...system.position)),
    [systems],
  );

  useFrame(({ camera }) => {
    if (!systems.length || !systemPositions.length) return;

    let active = systems[0].id;
    let bestDist = camera.position.distanceToSquared(systemPositions[0]);

    for (let index = 1; index < systems.length; index += 1) {
      const dist = camera.position.distanceToSquared(systemPositions[index]);
      if (dist < bestDist) {
        bestDist = dist;
        active = systems[index].id;
      }
    }

    if (active !== lastRef.current) {
      lastRef.current = active;
      onChange(active);
    }
  });
  return null;
}

/** Pre-compile every shader program in the scene graph on mount so the GPU
 *  doesn't stall when distant star systems first enter the camera frustum. */
function ShaderWarmup() {
  const { gl, scene, camera } = useThree();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    // compile() walks the full scene hierarchy regardless of frustum culling
    gl.compile(scene, camera);
  }, [gl, scene, camera]);
  return null;
}

function CameraLensController({ fov }: { fov: number }) {
  const { camera } = useThree();
  const targetFov = React.useRef(fov);
  targetFov.current = fov;

  useFrame((_, delta) => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const diff = targetFov.current - camera.fov;
    if (Math.abs(diff) < 0.05) {
      if (diff !== 0) { camera.fov = targetFov.current; camera.updateProjectionMatrix(); }
      return;
    }
    // Smooth exponential lerp — ~90 % of the way in 0.12 s
    const speed = 18;
    camera.fov += diff * Math.min(speed * delta, 0.92);
    camera.updateProjectionMatrix();
  });

  return null;
}

const PHOTO_FOV_MIN = 10;
const PHOTO_FOV_MAX = 90;

/**
 * Intercepts mouse-wheel in photo-mode orbit to change FOV instead of
 * camera distance.  Produces smooth, small increments.
 */
function PhotoFovWheel({
  photoMode,
  cameraMode,
  photoFov,
  onFovChange,
}: {
  photoMode: boolean;
  cameraMode: string;
  photoFov: number;
  onFovChange?: (fov: number) => void;
}) {
  const { gl } = useThree();
  const onFovRef = React.useRef(onFovChange);
  onFovRef.current = onFovChange;
  const photoRef = React.useRef(photoMode);
  photoRef.current = photoMode;
  const modeRef = React.useRef(cameraMode);
  modeRef.current = cameraMode;
  const fovRef = React.useRef(photoFov);

  // Keep fovRef in sync with externally-driven changes (presets, +/− keys).
  React.useEffect(() => {
    fovRef.current = photoFov;
  }, [photoFov]);

  React.useEffect(() => {
    const canvas = gl.domElement;
    function onWheel(e: WheelEvent) {
      if (!photoRef.current || modeRef.current !== "orbit") return;
      e.preventDefault();
      // Small, progressive step: ~1° per scroll notch
      const step = THREE.MathUtils.clamp(e.deltaY * 0.012, -2.5, 2.5);
      fovRef.current = THREE.MathUtils.clamp(fovRef.current + step, PHOTO_FOV_MIN, PHOTO_FOV_MAX);
      const rounded = Math.round(fovRef.current);
      onFovRef.current?.(rounded);
    }
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [gl]);

  return null;
}

export interface SceneCanvasProps {
  isMobile: boolean;
  frameInsetRight: number;
  systems: SceneSystemDefinition[];
  globalObjects: SceneGlobalObject[];
  effects: SceneEffectDefinition[];
  showOrbits: boolean;
  showAllNames: boolean;
  showRenamedOnly: boolean;
  photoMode: boolean;
  photoFov: number;
  simulationPaused: boolean;
  selectedAddress: string | null;
  cameraFocusAddress: string | null;
  panelOpen: boolean;
  cameraMode: CameraMode;
  flyModeEnabled: boolean;
  flyAutopilotActive?: boolean;
  cinematicFlyEnabled: boolean;
  resetRequested: boolean;
  controlsRef: RefObject<OrbitControlsImpl>;
  freelookRef: RefObject<FreeLookHandle>;
  screenshotRef: RefObject<ScreenshotHandle>;
  onSelect: (addr: string) => void;
  onDeselect: () => void;
  onShiftSelectEntry: (systemId: SceneSystemId, addr: string) => void;
  onModeChange: (mode: CameraMode) => void;
  onZoomChange: (zoom: number) => void;
  onCameraDebug: (debug: { pos: [number,number,number]; target: [number,number,number]; distTarget: number; distOrigin: number; tracking: string | null } | null) => void;
  onAutoFlightChange?: (active: boolean) => void;
  onFovChange?: (fov: number) => void;
  getFlyTarget?: () => THREE.Vector3 | null;
  onResetDone: () => void;
  selectionVersion: number;
}

export default function SceneCanvas({
  isMobile,
  frameInsetRight,
  systems,
  globalObjects,
  effects,
  showOrbits,
  showAllNames,
  showRenamedOnly,
  photoMode,
  photoFov,
  simulationPaused,
  selectedAddress,
  cameraFocusAddress,
  panelOpen,
  cameraMode,
  flyModeEnabled,
  flyAutopilotActive,
  cinematicFlyEnabled,
  resetRequested,
  controlsRef,
  freelookRef,
  screenshotRef,
  onSelect,
  onDeselect,
  onShiftSelectEntry,
  onModeChange,
  onZoomChange,
  onCameraDebug,
  onAutoFlightChange,
  onFovChange,
  getFlyTarget,
  onResetDone,
  selectionVersion,
}: SceneCanvasProps) {
  const [activeSystem, setActiveSystem] = useState<SceneSystemId>(systems[0]?.id ?? "vescrow");
  const activeFlyMode = cinematicFlyEnabled ? "cinematic" : flyModeEnabled ? "flight" : null;
  const interactionEnabled = !flyModeEnabled && cameraMode !== "fly";
  const visualFocusAddress = selectedAddress;
  const starPositions = useMemo(() => systems.map((system) => system.position), [systems]);

  const getBlockPulseTick = (systemId: SceneSystemId) => {
    for (const e of effects) {
      if (e.kind === "block-pulse" && e.systemId === systemId) return e.tick;
    }
    return undefined;
  };

  const transactionFlowEffects = useMemo(
    () => effects.filter((e): e is TransactionFlowEffect => e.kind === "transaction-flow"),
    [effects],
  );

  const renderDecorator = (system: SceneSystemDefinition, decorator: SceneSystemDecorator) => {
    switch (decorator.kind) {
      case "epoch-satellite":
        return (
          <group key={decorator.id} position={system.position}>
            <EpochSatellite
              epoch={decorator.epoch}
              orbitRadius={decorator.orbitRadius}
              showLabel={showAllNames && !photoMode}
              onSelect={onSelect}
              interactive={interactionEnabled}
              paused={simulationPaused}
            />
          </group>
        );
      case "faucet-satellite":
        return (
          <group key={decorator.id} position={system.position}>
            <FaucetSatellite
              stats={decorator.stats}
              orbitRadius={decorator.orbitRadius}
              showLabel={showAllNames && !photoMode}
              onSelect={onSelect}
              interactive={interactionEnabled}
              paused={simulationPaused}
            />
          </group>
        );
      case "sputnik-probe":
        return (
          <group key={decorator.id} position={system.position}>
            <SputnikProbe
              orbitRadius={decorator.orbitRadius}
              selected={visualFocusAddress?.toLowerCase() === decorator.id.toLowerCase()}
              onSelect={onSelect}
              interactive={interactionEnabled}
              paused={simulationPaused}
            />
          </group>
        );
      default:
        return null;
    }
  };

  const renderGlobalObject = (sceneObject: SceneGlobalObject) => {
    switch (sceneObject.kind) {
      case "comet":
        return (
          <Comet
            key={sceneObject.id}
            starPositions={starPositions}
            paused={simulationPaused}
            onSelect={onSelect}
            interactive={interactionEnabled}
            showLabel={(showAllNames || visualFocusAddress === sceneObject.id) && !photoMode}
          />
        );
      case "rogue-planet":
        return (
          <RoguePlanet
            key={sceneObject.id}
            starPositions={starPositions}
            paused={simulationPaused}
            onSelect={onSelect}
            interactive={interactionEnabled}
          />
        );
      case "bridge":
        return sceneObject.bridge.kind === "hyperlane" ? (
          <HyperlanePortal
            key={sceneObject.id}
            bridge={sceneObject.bridge}
            onSelect={onSelect}
            showLabel={(showAllNames || visualFocusAddress === sceneObject.id) && !photoMode}
            interactive={interactionEnabled}
            paused={simulationPaused}
          />
        ) : (
          <CanonicalBridgePortal
            key={sceneObject.id}
            bridge={sceneObject.bridge}
            onSelect={onSelect}
            showLabel={(showAllNames || visualFocusAddress === sceneObject.id) && !photoMode}
            interactive={interactionEnabled}
            paused={simulationPaused}
          />
        );
      case "transit-beacon":
        return (
          <TransitBeacon
            key={sceneObject.id}
            id={sceneObject.id}
            label={sceneObject.label}
            hint={sceneObject.hint}
            position={sceneObject.position}
            bodyRadius={sceneObject.bodyRadius}
            onSelect={onSelect}
            showLabel={(showAllNames || visualFocusAddress === sceneObject.id) && !photoMode}
            interactive={interactionEnabled}
            paused={simulationPaused}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Canvas
      camera={{ position: [0, 500, 1600], fov: 55, near: 0.1, far: 60000 }}
      style={{ width: "100%", height: "100%" }}
      gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
      dpr={[1, isMobile ? 1.5 : 2]}
    >
      <ambientLight intensity={0.025} />
      <ShaderWarmup />
      <CameraLensController fov={photoFov} />
      <SpriteLabelManager />
      <ActiveSystemDetector systems={systems} onChange={setActiveSystem} />
      <GalaxyBackground paused={simulationPaused} />
      {globalObjects.map((sceneObject) => renderGlobalObject(sceneObject))}

      {systems.map((system) => (
        <StarSystem
          key={system.id}
          solarData={system.data}
          position={system.position}
          palette={system.palette}
          starLabel={system.label}
          totalVotingPower={system.starPrimaryMetric}
          totalLocked={system.starSecondaryMetric}
          blockNumber={system.id === "vescrow" ? getBlockPulseTick(system.id) : undefined}
          showOrbits={showOrbits}
          showAllNames={showAllNames && activeSystem === system.id}
          showSystemLabel={showAllNames || visualFocusAddress === system.starId}
          showRenamedOnly={showRenamedOnly || activeSystem !== system.id}
          photoMode={photoMode}
          paused={simulationPaused}
          selectedAddress={visualFocusAddress}
          panelOpen={panelOpen}
          onSelect={onSelect}
          onDeselect={onDeselect}
          onStarSelect={() => onSelect(system.starId)}
          onShiftSelect={(addr) => onShiftSelectEntry(system.id, addr)}
          diskMode={system.detailVariant === "vesting"}
          starId={system.starId}
          starScale={system.starScale}
          detailVariant={system.detailVariant}
          interactionEnabled={interactionEnabled}
          interactiveBelt={system.id !== "staking-remnant"}
          showBeltLabels={showAllNames && activeSystem === system.id && system.id !== "staking-remnant"}
          beltTone={"default"}
          showSolarWind={system.id !== "gubi-pool"}
          systemId={system.id}
        />
      ))}

      {systems.flatMap((system) =>
        (system.decorators ?? []).map((decorator) => renderDecorator(system, decorator)),
      )}

      <FocusPing
        selectedAddress={cameraFocusAddress}
        selectionVersion={selectionVersion}
        persistent={Boolean(flyAutopilotActive)}
      />

      {transactionFlowEffects.map((effect) => (
        <TransactionFlow key={effect.id} effect={effect} />
      ))}

      <PhotoFovWheel photoMode={photoMode} cameraMode={cameraMode} photoFov={photoFov} onFovChange={onFovChange} />

      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        minDistance={0.3}
        maxDistance={22000}
        enableDamping
        dampingFactor={0.05}
        enableZoom={!photoMode}
        enabled={cameraMode === "orbit"}
      />

      {activeFlyMode && (
        <FreeLookControls ref={freelookRef} enabled={cameraMode === "fly"} mode={activeFlyMode} fov={photoFov} onAutoFlightChange={onAutoFlightChange} onFovChange={onFovChange} getFlyTarget={getFlyTarget} />
      )}

      <CameraController
        selectedAddress={cameraFocusAddress}
        selectionVersion={selectionVersion}
        cameraMode={cameraMode}
        frameInsetRight={frameInsetRight}
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
