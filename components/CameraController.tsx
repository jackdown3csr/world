"use client";

import { useRef, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { FreeLookHandle } from "./FreeLookControls";

/**
 * Hybrid camera controller:
 *   • FREE-FLY mode (default, after reset, after Escape):
 *       – FreeLookControls handles input (drag=look, scroll=fly)
 *       – OrbitControls is disabled
 *   • ORBIT mode (after clicking a body):
 *       – OrbitControls orbits the body
 *       – FreeLookControls is disabled
 *   • Smooth snap animation between transitions
 */

export type CameraMode = "fly" | "orbit";

interface CameraControllerProps {
  selectedAddress: string | null;
  selectionVersion: number;
  cameraMode: CameraMode;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  freelookRef: React.RefObject<FreeLookHandle | null>;
  onModeChange?: (mode: CameraMode) => void;
  onZoomChange?: (distance: number) => void;
  onCameraDebug?: (info: {
    pos: [number, number, number];
    target: [number, number, number];
    distTarget: number;
    distOrigin: number;
    tracking: string | null;
  }) => void;
  resetRequested?: boolean;
  onResetDone?: () => void;
}

const DEFAULT_POS    = new THREE.Vector3(0, 500, 1600);
const DEFAULT_TARGET = new THREE.Vector3(0, 0, 0);

/* Reusable temporaries */
const _mat4  = new THREE.Matrix4();
const _pos   = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _quat  = new THREE.Quaternion();
const _v3    = new THREE.Vector3();
const _up    = new THREE.Vector3(0, 1, 0);

/** Compute lookAt quaternion */
function lookAtQuat(eye: THREE.Vector3, target: THREE.Vector3): THREE.Quaternion {
  _mat4.lookAt(eye, target, _up);
  return new THREE.Quaternion().setFromRotationMatrix(_mat4);
}

function findBody(
  scene: THREE.Scene,
  addr: string,
  camera?: THREE.Camera,
): { position: THREE.Vector3; bodyRadius: number; bodyType: string } | null {
  const matches: { position: THREE.Vector3; bodyRadius: number; bodyType: string }[] = [];
  scene.traverse((obj) => {
    const ud = obj.userData;
    if (!ud) return;
    if (ud.walletAddress === addr) {
      const wp = new THREE.Vector3();
      obj.getWorldPosition(wp);
      matches.push({ position: wp, bodyRadius: ud.bodyRadius ?? 1, bodyType: ud.bodyType ?? "planet" });
      return;
    }
    if (ud.walletAddresses && Array.isArray(ud.walletAddresses) && obj instanceof THREE.InstancedMesh) {
      const idx = (ud.walletAddresses as string[]).indexOf(addr);
      if (idx >= 0) {
        obj.getMatrixAt(idx, _mat4);
        _pos.setFromMatrixPosition(_mat4);
        obj.localToWorld(_pos);
        _mat4.decompose(_v3, _quat, _scale);
        matches.push({ position: _pos.clone(), bodyRadius: _scale.x, bodyType: ud.bodyType ?? "asteroid" });
      }
    }
  });
  if (matches.length === 0) return null;
  if (matches.length === 1 || !camera) return matches[0];
  // Multiple matches (address exists in both systems) → pick closest to camera
  let best = matches[0];
  let bestDist = camera.position.distanceToSquared(best.position);
  for (let i = 1; i < matches.length; i++) {
    const d = camera.position.distanceToSquared(matches[i].position);
    if (d < bestDist) { best = matches[i]; bestDist = d; }
  }
  return best;
}

export default function CameraController({
  selectedAddress,
  selectionVersion,
  cameraMode: externalMode,
  controlsRef,
  freelookRef,
  onModeChange,
  onZoomChange,
  onCameraDebug,
  resetRequested,
  onResetDone,
}: CameraControllerProps) {
  const { camera, scene, gl } = useThree();
  const prevVersion = useRef(0);
  const lastDist    = useRef(-1);
  const prevReset   = useRef(false);

  /* Mode state */
  const mode = useRef<CameraMode>("orbit");

  /* Tracking state */
  const trackingAddr = useRef<string | null>(null);
  const lastBodyPos  = useRef(new THREE.Vector3());

  /* Snap state (works for both modes) */
  const snapGoalCam    = useRef(new THREE.Vector3());
  const snapGoalTarget = useRef(new THREE.Vector3());
  const isSnapping     = useRef(false);
  const snapToMode     = useRef<CameraMode>("orbit"); // which mode after snap completes

  /* Remember if user was in fly mode before clicking a body */
  const wasInFlyMode = useRef(false);

  /** Switch mode and enable/disable controls accordingly */
  function setMode(m: CameraMode) {
    mode.current = m;
    const ctrl = controlsRef.current;
    if (ctrl) ctrl.enabled = (m === "orbit");
    onModeChange?.(m);
  }

  /* ── Sync internal mode when external prop changes (e.g. fly toggle) ── */
  useEffect(() => {
    if (externalMode !== mode.current) {
      mode.current = externalMode;
      const ctrl = controlsRef.current;
      if (ctrl) {
        ctrl.enabled = (externalMode === "orbit");
        if (externalMode === "orbit") {
          // Set orbit target to a point in front of the camera so it doesn't
          // snap back to the Sun at (0,0,0)
          const dir = new THREE.Vector3();
          camera.getWorldDirection(dir);
          const dist = camera.position.distanceTo(ctrl.target);
          const lookDist = Math.max(dist * 0.5, 50);
          ctrl.target.copy(camera.position).addScaledVector(dir, lookDist);
          ctrl.update();
        }
      }
      if (externalMode === "fly") {
        freelookRef.current?.syncFromCamera();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalMode]);

  /* ── Escape key → stop tracking body, return to fly if was flying ── */
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && mode.current === "orbit" && trackingAddr.current) {
        trackingAddr.current = null;
        isSnapping.current   = false;
        // If user was in fly mode before selecting the body, restore fly
        if (wasInFlyMode.current) {
          wasInFlyMode.current = false;
          setMode("fly");
          freelookRef.current?.syncFromCamera();
        }
        // Otherwise just stop tracking, stay in orbit
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((_state, delta) => {
    const ctrl = controlsRef.current;

    /* ── Handle reset → snap to overview, switch to orbit ── */
    if (resetRequested && !prevReset.current) {
      snapGoalCam.current.copy(DEFAULT_POS);
      snapGoalTarget.current.copy(DEFAULT_TARGET);
      isSnapping.current   = true;
      snapToMode.current   = "orbit";
      trackingAddr.current = null;
      prevReset.current    = true;
      onResetDone?.();
    }
    if (!resetRequested) prevReset.current = false;

    /* ── Report zoom level ── */
    if (onZoomChange) {
      const d = mode.current === "orbit" && ctrl
        ? camera.position.distanceTo(ctrl.target)
        : camera.position.length();
      if (Math.abs(d - lastDist.current) > 2) {
        lastDist.current = d;
        onZoomChange(d);
      }
    }

    /* ── Camera debug ── */
    if (onCameraDebug) {
      const p = camera.position;
      const t = ctrl && mode.current === "orbit"
        ? ctrl.target
        : _v3.copy(p).addScaledVector(camera.getWorldDirection(new THREE.Vector3()), 100);
      onCameraDebug({
        pos:        [p.x, p.y, p.z],
        target:     [t.x, t.y, t.z],
        distTarget: p.distanceTo(t),
        distOrigin: p.length(),
        tracking:   trackingAddr.current,
      });
    }

    /* ── Stop tracking if selection cleared ── */
    if (!selectedAddress && trackingAddr.current) {
      trackingAddr.current = null;
      // If we were orbiting, stay in orbit mode until user presses Escape or Reset
    }

    /* ── Detect new selection ── */
    const isNewSelection = selectionVersion !== prevVersion.current;
    if (isNewSelection) {
      prevVersion.current = selectionVersion;

      if (!selectedAddress) {
        trackingAddr.current = null;
        return;
      }

      const addr = selectedAddress.toLowerCase();
      const body = findBody(scene, addr, camera);
      if (!body) return;

      /* Zoom distance by body type */
      let dist: number;
      switch (body.bodyType) {
        case "star":   dist = body.bodyRadius * 5; break;          // overview of whole star
        case "planet": dist = Math.max(body.bodyRadius * 4, 12); break;
        case "moon":   dist = Math.max(body.bodyRadius * 8, 4);  break;
        case "ring":   dist = Math.max(body.bodyRadius * 12, 8); break;
        case "comet":  dist = 55; break;
        case "satellite": dist = 30; break;
        default:       dist = Math.max(body.bodyRadius * 12, 8); break;
      }

      const radDir = body.position.clone();
      const len    = radDir.length();
      if (len > 1) radDir.divideScalar(len); else radDir.set(0, 0, 1);

      const camPos = body.position.clone()
        .add(radDir.clone().multiplyScalar(dist * 0.7))
        .add(new THREE.Vector3(0, dist * 0.4, 0));

      snapGoalCam.current.copy(camPos);
      snapGoalTarget.current.copy(body.position);
      isSnapping.current = true;
      snapToMode.current = "orbit";

      /* Remember if we came from fly mode */
      wasInFlyMode.current = (mode.current === "fly" || externalMode === "fly");

      trackingAddr.current = addr;
      lastBodyPos.current.copy(body.position);
      return;
    }

    /* ── Smooth snap interpolation ── */
    if (isSnapping.current) {
      const alpha = 1 - Math.exp(-9 * delta);

      if (snapToMode.current === "orbit" && ctrl) {
        // Lerp both camera position and orbit target
        camera.position.lerp(snapGoalCam.current, alpha);
        ctrl.target.lerp(snapGoalTarget.current, alpha);
        ctrl.update();
      } else {
        // Fly-mode snap: lerp position, slerp quaternion toward lookAt
        camera.position.lerp(snapGoalCam.current, alpha);
        const goalQ = lookAtQuat(snapGoalCam.current, snapGoalTarget.current);
        camera.quaternion.slerp(goalQ, alpha);
      }

      // Keep lastBodyPos synced during snap
      if (trackingAddr.current) {
        const b = findBody(scene, trackingAddr.current, camera);
        if (b) lastBodyPos.current.copy(b.position);
      }

      const camDist = camera.position.distanceTo(snapGoalCam.current);
      const tgtDist = snapToMode.current === "orbit" && ctrl
        ? ctrl.target.distanceTo(snapGoalTarget.current)
        : 0;

      if (camDist < 0.5 && tgtDist < 0.5) {
        isSnapping.current = false;
        setMode(snapToMode.current);
        if (snapToMode.current === "fly") {
          freelookRef.current?.syncFromCamera();
        }
      }
      return;
    }

    /* ── Orbit mode: continuous tracking ── */
    if (mode.current === "orbit" && ctrl && trackingAddr.current) {
      const body = findBody(scene, trackingAddr.current, camera);
      if (!body) { trackingAddr.current = null; return; }

      const dx = body.position.x - lastBodyPos.current.x;
      const dy = body.position.y - lastBodyPos.current.y;
      const dz = body.position.z - lastBodyPos.current.z;
      lastBodyPos.current.copy(body.position);

      if (dx * dx + dy * dy + dz * dz < 1e-8) return;

      ctrl.target.x += dx; ctrl.target.y += dy; ctrl.target.z += dz;
      camera.position.x += dx; camera.position.y += dy; camera.position.z += dz;
      ctrl.update();
    }

    /* ── Fly mode: no per-frame work needed (FreeLookControls handles input) ── */
  });

  return null;
}
