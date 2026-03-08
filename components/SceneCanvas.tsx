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
import CanonicalBridgePortal from "./CanonicalBridgePortal";
import HyperlanePortal from "./HyperlanePortal";
import { SpriteLabelManager } from "./SpriteLabel";

import type {
  SceneEffectDefinition,
  SceneGlobalObject,
  SceneSystemDecorator,
  SceneSystemDefinition,
  SceneSystemId,
} from "@/lib/sceneSystems";

type SceneFocusBody = {
  position: THREE.Vector3;
  bodyRadius: number;
  focusRadius?: number;
  bodyType: string;
};

const _lookupMat4 = new THREE.Matrix4();
const _lookupPos = new THREE.Vector3();
const _lookupScale = new THREE.Vector3();
const _lookupQuat = new THREE.Quaternion();
const _lookupV3 = new THREE.Vector3();

function findSceneBody(
  scene: THREE.Scene,
  addr: string,
  camera?: THREE.Camera,
): SceneFocusBody | null {
  const matches: SceneFocusBody[] = [];
  scene.traverse((obj) => {
    const ud = obj.userData;
    if (!ud) return;
    if (ud.walletAddress === addr) {
      const wp = new THREE.Vector3();
      obj.getWorldPosition(wp);
      matches.push({
        position: wp,
        bodyRadius: ud.bodyRadius ?? 1,
        focusRadius: ud.focusRadius,
        bodyType: ud.bodyType ?? "planet",
      });
      return;
    }
    if (ud.walletAddresses && Array.isArray(ud.walletAddresses) && obj instanceof THREE.InstancedMesh) {
      const idx = (ud.walletAddresses as string[]).indexOf(addr);
      if (idx >= 0) {
        obj.getMatrixAt(idx, _lookupMat4);
        _lookupPos.setFromMatrixPosition(_lookupMat4);
        obj.localToWorld(_lookupPos);
        _lookupMat4.decompose(_lookupV3, _lookupQuat, _lookupScale);
        matches.push({
          position: _lookupPos.clone(),
          bodyRadius: _lookupScale.x,
          focusRadius: ud.focusRadius,
          bodyType: ud.bodyType ?? "asteroid",
        });
      }
    }
  });

  if (matches.length === 0) return null;
  if (matches.length === 1 || !camera) return matches[0];

  let best = matches[0];
  let bestDist = camera.position.distanceToSquared(best.position);
  for (let i = 1; i < matches.length; i += 1) {
    const dist = camera.position.distanceToSquared(matches[i].position);
    if (dist < bestDist) {
      best = matches[i];
      bestDist = dist;
    }
  }
  return best;
}

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
}: {
  selectedAddress: string | null;
  selectionVersion: number;
}) {
  const { scene, camera } = useThree();
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

    const body = findSceneBody(scene, selectedAddress.toLowerCase(), camera);
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
  }, [camera, scene, selectedAddress, selectionVersion]);

  useFrame(({ camera: frameCamera }) => {
    if (!liveRef.current || !groupRef.current || !targetAddrRef.current) return;

    const elapsed = performance.now() * 0.001 - startedAtRef.current;
    if (elapsed >= DURATION) {
      liveRef.current = false;
      groupRef.current.visible = false;
      return;
    }

    const body = findSceneBody(scene, targetAddrRef.current, frameCamera);
    if (!body) {
      liveRef.current = false;
      groupRef.current.visible = false;
      return;
    }

    const t = THREE.MathUtils.clamp(elapsed / DURATION, 0, 1);
    const eased = 1 - Math.pow(1 - t, 2.4);
    const fade = 1 - t;
    const baseRadius = getFocusPingRadius(body);
    const pulseScale = 1 + eased * 1.6;
    const echoScale = 0.8 + eased * 1.15;

    baseRadiusRef.current = baseRadius;
    groupRef.current.visible = true;
    groupRef.current.position.copy(body.position);
    groupRef.current.quaternion.copy(frameCamera.quaternion);

    if (coreRef.current) {
      coreRef.current.scale.setScalar(baseRadius * pulseScale);
      const material = coreRef.current.material as THREE.MeshBasicMaterial;
      material.color.set(pingColorRef.current);
      material.opacity = 0.34 * fade;
    }

    if (echoRef.current) {
      echoRef.current.scale.setScalar(baseRadius * echoScale);
      const material = echoRef.current.material as THREE.MeshBasicMaterial;
      material.color.set(pingColorRef.current);
      material.opacity = 0.22 * (1 - eased) * fade;
    }

    if (glowRef.current) {
      glowRef.current.scale.setScalar(baseRadius * (0.55 + eased * 0.5));
      const material = glowRef.current.material as THREE.MeshBasicMaterial;
      material.color.set(pingColorRef.current);
      material.opacity = 0.1 * fade;
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
function ActiveSystemDetector({
  systems,
  onChange,
}: {
  systems: SceneSystemDefinition[];
  onChange: (id: SceneSystemId) => void;
}) {
  const lastRef = useRef<SceneSystemId>(systems[0]?.id ?? "vescrow");
  useFrame(({ camera }) => {
    if (!systems.length) return;

    let active = systems[0].id;
    let bestDist = camera.position.distanceToSquared(
      new THREE.Vector3(...systems[0].position),
    );

    for (let index = 1; index < systems.length; index += 1) {
      const dist = camera.position.distanceToSquared(
        new THREE.Vector3(...systems[index].position),
      );
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

function CameraLensController({ fov }: { fov: number }) {
  const { camera } = useThree();

  React.useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    if (Math.abs(camera.fov - fov) < 0.01) return;
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }, [camera, fov]);

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
  onResetDone,
  selectionVersion,
}: SceneCanvasProps) {
  const [activeSystem, setActiveSystem] = useState<SceneSystemId>(systems[0]?.id ?? "vescrow");
  const activeFlyMode = cinematicFlyEnabled ? "cinematic" : flyModeEnabled ? "flight" : null;

  const getBlockPulseTick = (systemId: SceneSystemId) => (
    effects.find((effect) => effect.kind === "block-pulse" && effect.systemId === systemId)?.tick
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
              paused={simulationPaused}
            />
          </group>
        );
      default:
        return null;
    }
  };

  const renderGlobalObject = (sceneObject: SceneGlobalObject) => {
    const starPositions = systems.map((system) => system.position);
    switch (sceneObject.kind) {
      case "comet":
        return (
          <Comet
            key={sceneObject.id}
            starPositions={starPositions}
            paused={simulationPaused}
            onSelect={onSelect}
            showLabel={showAllNames && !photoMode}
          />
        );
      case "rogue-planet":
        return (
          <RoguePlanet
            key={sceneObject.id}
            starPositions={starPositions}
            paused={simulationPaused}
            onSelect={onSelect}
          />
        );
      case "bridge":
        return sceneObject.bridge.kind === "hyperlane" ? (
          <HyperlanePortal
            key={sceneObject.id}
            bridge={sceneObject.bridge}
            onSelect={onSelect}
            showLabel={showAllNames && !photoMode}
            paused={simulationPaused}
          />
        ) : (
          <CanonicalBridgePortal
            key={sceneObject.id}
            bridge={sceneObject.bridge}
            onSelect={onSelect}
            showLabel={showAllNames && !photoMode}
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
          showAllNames={showAllNames}
          showRenamedOnly={showRenamedOnly || activeSystem !== system.id}
          photoMode={photoMode}
          paused={simulationPaused}
          selectedAddress={selectedAddress}
          panelOpen={panelOpen}
          onSelect={onSelect}
          onDeselect={onDeselect}
          onStarSelect={() => onSelect(system.starId)}
          onShiftSelect={(addr) => onShiftSelectEntry(system.id, addr)}
          diskMode={system.detailVariant === "vesting"}
          starId={system.starId}
          starScale={system.starScale}
          detailVariant={system.detailVariant}
          interactiveBelt={system.id !== "staking-remnant"}
          showBeltLabels={system.id !== "staking-remnant"}
          beltTone={"default"}
          showSolarWind={system.id !== "gubi-pool"}
        />
      ))}

      {systems.flatMap((system) =>
        (system.decorators ?? []).map((decorator) => renderDecorator(system, decorator)),
      )}

      <FocusPing
        selectedAddress={cameraFocusAddress}
        selectionVersion={selectionVersion}
      />

      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        minDistance={0.3}
        maxDistance={22000}
        enableDamping
        dampingFactor={0.05}
        enabled={cameraMode === "orbit"}
      />

      {activeFlyMode && (
        <FreeLookControls ref={freelookRef} enabled={cameraMode === "fly"} mode={activeFlyMode} />
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
