"use client";

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

/**
 * Camera controller that:
 * 1. Snaps camera to the selected body's ACTUAL world position (scene traversal)
 * 2. Continuously follows (tracks) the body as it orbits
 * 3. Uses selectionVersion so re-clicking the same body still snaps
 * 4. Reports camera distance for zoom-based label visibility
 * 5. Handles reset-to-overview
 */

interface CameraControllerProps {
  selectedAddress: string | null;
  selectionVersion: number;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  onZoomChange?: (distance: number) => void;
  onCameraDebug?: (info: {
    pos: [number,number,number];
    target: [number,number,number];
    distTarget: number;
    distOrigin: number;
    tracking: string | null;
  }) => void;
  resetRequested?: boolean;
  onResetDone?: () => void;
}

const DEFAULT_POS = new THREE.Vector3(0, 500, 1600);
const DEFAULT_TARGET = new THREE.Vector3(0, 0, 0);

/* Reusable temporaries (avoid GC) */
const _mat4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _v3 = new THREE.Vector3();

/** Find a body's current world position by traversing the scene graph */
function findBody(
  scene: THREE.Scene,
  addr: string
): { position: THREE.Vector3; bodyRadius: number; bodyType: string } | null {
  let result: { position: THREE.Vector3; bodyRadius: number; bodyType: string } | null = null;

  scene.traverse((obj) => {
    if (result) return;
    const ud = obj.userData;
    if (!ud) return;

    /* Individual mesh — planet or moon */
    if (ud.walletAddress === addr) {
      const wp = new THREE.Vector3();
      obj.getWorldPosition(wp);
      result = {
        position: wp,
        bodyRadius: ud.bodyRadius ?? 1,
        bodyType: ud.bodyType ?? "planet",
      };
      return;
    }

    /* InstancedMesh — ring particles or asteroids */
    if (
      ud.walletAddresses &&
      Array.isArray(ud.walletAddresses) &&
      obj instanceof THREE.InstancedMesh
    ) {
      const idx = (ud.walletAddresses as string[]).indexOf(addr);
      if (idx >= 0) {
        obj.getMatrixAt(idx, _mat4);
        _pos.setFromMatrixPosition(_mat4);
        obj.localToWorld(_pos);
        _mat4.decompose(_v3, _quat, _scale);
        result = {
          position: _pos.clone(),
          bodyRadius: _scale.x,
          bodyType: ud.bodyType ?? "asteroid",
        };
        return;
      }
    }
  });

  return result;
}

export default function CameraController({
  selectedAddress,
  selectionVersion,
  controlsRef,
  onZoomChange,
  onCameraDebug,
  resetRequested,
  onResetDone,
}: CameraControllerProps) {
  const { camera, scene } = useThree();
  const prevVersion = useRef(0);
  const lastDist = useRef(-1);
  const prevReset = useRef(false);

  /* Tracking state */
  const trackingAddr = useRef<string | null>(null);

  useFrame(() => {
    const ctrl = controlsRef.current;
    if (!ctrl) return;

    /* ── handle reset ── */
    if (resetRequested && !prevReset.current) {
      camera.position.copy(DEFAULT_POS);
      ctrl.target.copy(DEFAULT_TARGET);
      ctrl.update();
      trackingAddr.current = null;
      prevReset.current = true;
      onResetDone?.();
    }
    if (!resetRequested) prevReset.current = false;

    /* ── report zoom level ── */
    if (onZoomChange) {
      // Distance from camera to its target — not from world origin
      const d = camera.position.distanceTo(ctrl.target);
      if (Math.abs(d - lastDist.current) > 2) {
        lastDist.current = d;
        onZoomChange(d);
      }
    }

    /* ── camera debug ── */
    if (onCameraDebug) {
      const p = camera.position;
      const t = ctrl.target;
      onCameraDebug({
        pos: [p.x, p.y, p.z],
        target: [t.x, t.y, t.z],
        distTarget: p.distanceTo(t),
        distOrigin: p.length(),
        tracking: trackingAddr.current,
      });
    }

    /* ── stop tracking if selection was cleared ── */
    if (!selectedAddress && trackingAddr.current) {
      trackingAddr.current = null;
    }

    /* ── detect new selection (by version) ── */
    const isNewSelection = selectionVersion !== prevVersion.current;
    if (isNewSelection) {
      prevVersion.current = selectionVersion;

      if (!selectedAddress) {
        trackingAddr.current = null;
        return;
      }

      const addr = selectedAddress.toLowerCase();
      const body = findBody(scene, addr);
      if (!body) return;

      /* Compute zoom distance */
      let dist: number;
      switch (body.bodyType) {
        case "planet":
          dist = Math.max(body.bodyRadius * 4, 12);
          break;
        case "moon":
          dist = Math.max(body.bodyRadius * 8, 4);
          break;
        case "ring":
          dist = Math.max(body.bodyRadius * 12, 8);
          break;
        case "comet":
          dist = 55;   // wide enough to see coma + tail base
          break;
        default:
          dist = Math.max(body.bodyRadius * 12, 8);
          break;
      }

      /* Position camera outside orbit, slightly above */
      const dir = body.position.clone();
      const len = dir.length();
      if (len > 1) dir.divideScalar(len);
      else dir.set(0, 0, 1);

      const camPos = body.position.clone()
        .add(dir.clone().multiplyScalar(dist * 0.7))
        .add(new THREE.Vector3(0, dist * 0.4, 0));

      /* Snap camera + target */
      ctrl.target.copy(body.position);
      camera.position.copy(camPos);
      ctrl.update();

      /* Start tracking */
      trackingAddr.current = addr;
      return;
    }

    /* ── continuous tracking: keep camera rig centred on the body ── */
    if (!trackingAddr.current) return;

    const body = findBody(scene, trackingAddr.current);
    if (!body) {
      trackingAddr.current = null;
      return;
    }

    /*
     * Preserve the user's current orbit angle + zoom by keeping the
     * camera's offset from the controls target unchanged.
     * We simply teleport both target and camera so that target = body.
     */
    const offset = camera.position.clone().sub(ctrl.target);
    ctrl.target.copy(body.position);
    camera.position.copy(body.position).add(offset);
    ctrl.update();
  });

  return null;
}
