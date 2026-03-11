"use client";

import { useRef, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { FreeLookHandle } from "./FreeLookControls";
import { lookupSceneBody } from "@/lib/sceneRegistry";

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

type FocusBodyType =
  | "star"
  | "planet"
  | "moon"
  | "ring"
  | "comet"
  | "bridge"
  | "rogue"
  | "satellite"
  | "asteroid"
  | "unknown";

interface CameraControllerProps {
  selectedAddress: string | null;
  selectionVersion: number;
  cameraMode: CameraMode;
  frameInsetRight?: number;
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
const _snapCam = new THREE.Vector3();
const _snapTarget = new THREE.Vector3();
const _goalQuat = new THREE.Quaternion();

/** Compute lookAt quaternion */
function lookAtQuat(eye: THREE.Vector3, target: THREE.Vector3): THREE.Quaternion {
  _mat4.lookAt(eye, target, _up);
  return new THREE.Quaternion().setFromRotationMatrix(_mat4);
}

function smootherStep(t: number) {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

function getSnapProfile(bodyType: FocusBodyType, travelDistance: number) {
  const normalizedDistance = THREE.MathUtils.clamp(travelDistance / 1800, 0, 1);

  let baseDuration = 1.02;
  let distanceFactor = 0.38;
  let arcStrength = 0.08;

  switch (bodyType) {
    case "star":
      baseDuration = 1.45;
      distanceFactor = 0.55;
      arcStrength = 0.14;
      break;
    case "planet":
      baseDuration = 1.0;
      distanceFactor = 0.34;
      arcStrength = 0.08;
      break;
    case "moon":
    case "satellite":
      baseDuration = 0.88;
      distanceFactor = 0.24;
      arcStrength = 0.05;
      break;
    case "comet":
    case "bridge":
    case "rogue":
      baseDuration = 1.14;
      distanceFactor = 0.42;
      arcStrength = 0.1;
      break;
    case "ring":
      baseDuration = 1.08;
      distanceFactor = 0.32;
      arcStrength = 0.07;
      break;
    default:
      break;
  }

  return {
    duration: THREE.MathUtils.clamp(baseDuration + normalizedDistance * distanceFactor, 0.72, 1.95),
    arcHeight: travelDistance * arcStrength,
  };
}

// findBody replaced by lookupSceneBody from @/lib/sceneRegistry

export default function CameraController({
  selectedAddress,
  selectionVersion,
  cameraMode: externalMode,
  frameInsetRight = 0,
  controlsRef,
  freelookRef,
  onModeChange,
  onZoomChange,
  onCameraDebug,
  resetRequested,
  onResetDone,
}: CameraControllerProps) {
  const { camera, gl } = useThree();
  const prevVersion = useRef(0);
  const lastDist    = useRef(-1);
  const prevReset   = useRef(false);

  /* Mode state */
  const mode = useRef<CameraMode>("orbit");

  /* Tracking state */
  const trackingAddr = useRef<string | null>(null);
  const lastBodyPos  = useRef(new THREE.Vector3());

  /* Snap state (works for both modes) */
  const snapStartCam   = useRef(new THREE.Vector3());
  const snapStartTarget = useRef(new THREE.Vector3());
  const snapGoalCam    = useRef(new THREE.Vector3());
  const snapGoalTarget = useRef(new THREE.Vector3());
  const isSnapping     = useRef(false);
  const snapElapsed    = useRef(0);
  const snapDuration   = useRef(1);
  const snapArcHeight  = useRef(0);
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
      if (e.repeat) return;
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

    const captureCurrentTarget = () => {
      if (ctrl) return ctrl.target.clone();
      const dir = camera.getWorldDirection(new THREE.Vector3());
      return camera.position.clone().addScaledVector(dir, 400);
    };

    /* ── Handle reset → snap to overview, switch to orbit ── */
    if (resetRequested && !prevReset.current) {
      snapStartCam.current.copy(camera.position);
      snapStartTarget.current.copy(captureCurrentTarget());
      snapGoalCam.current.copy(DEFAULT_POS);
      snapGoalTarget.current.copy(DEFAULT_TARGET);
      isSnapping.current   = true;
      snapElapsed.current  = 0;
      {
        const resetProfile = getSnapProfile("star", snapStartCam.current.distanceTo(DEFAULT_POS));
        snapDuration.current = resetProfile.duration;
        snapArcHeight.current = Math.min(resetProfile.arcHeight, 260);
      }
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
      const body = lookupSceneBody(addr);
      if (!body) return;
      const bodyType = (body.bodyType ?? "unknown") as FocusBodyType;

      /* Zoom distance by body type */
      let dist: number;
      switch (bodyType) {
        case "star":   dist = Math.max(body.bodyRadius * 12, 900); break;  // system overview, not a surface close-up
        case "planet": dist = Math.max(body.bodyRadius * 4, 12); break;
        case "moon":   dist = Math.max(body.bodyRadius * 8, 4);  break;
        case "ring":     dist = Math.max(body.bodyRadius * 8, 1.2); break;
        case "asteroid":  dist = Math.max(body.bodyRadius * 8, 1.2); break;
        case "comet":     dist = 55; break;
        case "bridge":    dist = Math.max(body.bodyRadius * 3.4, 120); break;
        case "rogue":     dist = Math.max(body.bodyRadius * 14, 110); break;
        case "satellite": dist = 30; break;
        default:          dist = Math.max(body.bodyRadius * 12, 8); break;
      }

      // Slightly tighter framing helps orbit tracking feel more "locked" to the object.
      if (bodyType !== "star") {
        dist *= 0.92;
      }

      let camPos: THREE.Vector3;
      if (bodyType === "star") {
        const overviewRadius = body.focusRadius ?? body.bodyRadius * 8;
        dist = Math.max(overviewRadius * 1.55, 480);
        const starViewDir = new THREE.Vector3(0.78, 0.34, 1.0).normalize();
        camPos = body.position.clone().addScaledVector(starViewDir, dist);
      } else {
        const radDir = body.position.clone();
        const len    = radDir.length();
        if (len > 1) radDir.divideScalar(len); else radDir.set(0, 0, 1);

        // Tangential direction — perpendicular to radial in the XZ orbital plane.
        // Camera comes from the side + slightly toward the star so the lit face is visible.
        const tangent = new THREE.Vector3(-radDir.z, 0, radDir.x); // unit vector, already normalized

        camPos = body.position.clone()
          .addScaledVector(tangent, dist * 0.65)    // side offset
          .addScaledVector(radDir, -dist * 0.22)    // lean toward star → lit hemisphere faces camera
          .add(new THREE.Vector3(0, dist * 0.42, 0)); // elevation
      }

      const framedTarget = body.position.clone();
      if (bodyType !== "star" && frameInsetRight > 0 && camera instanceof THREE.PerspectiveCamera) {
        const viewportWidth = Math.max(gl.domElement.clientWidth, 1);
        const screenOffsetX = -Math.min((frameInsetRight / viewportWidth) * 0.25, 0.085);
        if (Math.abs(screenOffsetX) > 0.001) {
          const forward = body.position.clone().sub(camPos).normalize();
          const right = new THREE.Vector3().crossVectors(forward, _up).normalize();
          const focusDistance = camPos.distanceTo(body.position);
          const halfWidth = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * focusDistance * camera.aspect;
          framedTarget.addScaledVector(right, -screenOffsetX * halfWidth);
        }
      }

      snapStartCam.current.copy(camera.position);
      snapStartTarget.current.copy(captureCurrentTarget());
      snapGoalCam.current.copy(camPos);
      snapGoalTarget.current.copy(framedTarget);
      isSnapping.current = true;
      snapElapsed.current = 0;
      {
        const snapProfile = getSnapProfile(bodyType, snapStartCam.current.distanceTo(camPos));
        snapDuration.current = snapProfile.duration;
        snapArcHeight.current = Math.min(snapProfile.arcHeight, 320);
      }
      snapToMode.current = "orbit";

      /* Remember if we came from fly mode */
      wasInFlyMode.current = (mode.current === "fly" || externalMode === "fly");

      trackingAddr.current = addr;
      lastBodyPos.current.copy(body.position);
      return;
    }

    /* ── Smooth snap interpolation ── */
    if (isSnapping.current) {
      snapElapsed.current += delta;
      const rawT = snapDuration.current <= 0 ? 1 : snapElapsed.current / snapDuration.current;
      const easedT = smootherStep(rawT);
      const arcLift = Math.sin(Math.PI * easedT) * snapArcHeight.current;

      _snapCam.copy(snapStartCam.current).lerp(snapGoalCam.current, easedT);
      _snapTarget.copy(snapStartTarget.current).lerp(snapGoalTarget.current, easedT);

      if (arcLift > 0.001) {
        _snapCam.y += arcLift;
        _snapTarget.y += arcLift * 0.18;
      }

      if (snapToMode.current === "orbit" && ctrl) {
        camera.position.copy(_snapCam);
        ctrl.target.copy(_snapTarget);
        ctrl.update();
      } else {
        camera.position.copy(_snapCam);
        _goalQuat.copy(lookAtQuat(_snapCam, _snapTarget));
        camera.quaternion.slerp(_goalQuat, THREE.MathUtils.clamp(1 - Math.exp(-10 * delta), 0, 1));
      }

      // Track moving body during snap — shifts snap goal to follow orbiting/rotating objects
      if (trackingAddr.current) {
        const b = lookupSceneBody(trackingAddr.current);
        if (b) {
          const dx = b.position.x - lastBodyPos.current.x;
          const dy = b.position.y - lastBodyPos.current.y;
          const dz = b.position.z - lastBodyPos.current.z;
          lastBodyPos.current.copy(b.position);
          if (dx * dx + dy * dy + dz * dz > 1e-8) {
            snapGoalCam.current.x += dx;
            snapGoalCam.current.y += dy;
            snapGoalCam.current.z += dz;
            snapGoalTarget.current.x += dx;
            snapGoalTarget.current.y += dy;
            snapGoalTarget.current.z += dz;
          }
        }
      }

      const camDist = camera.position.distanceTo(snapGoalCam.current);
      const tgtDist = snapToMode.current === "orbit" && ctrl
        ? ctrl.target.distanceTo(snapGoalTarget.current)
        : 0;

      if (rawT >= 1 || (camDist < 0.5 && tgtDist < 0.5)) {
        camera.position.copy(snapGoalCam.current);
        if (ctrl && snapToMode.current === "orbit") {
          ctrl.target.copy(snapGoalTarget.current);
          ctrl.update();
        }
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
      const body = lookupSceneBody(trackingAddr.current);
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
