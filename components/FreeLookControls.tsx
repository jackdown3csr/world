"use client";

/**
 * FreeLookControls — KSP-style fly camera.
 *
 * W / S          → pitch down / up
 * A / D          → yaw left / right
 * Q / E          → roll left / right
 * CapsLock       → toggle fine control
 * R              → toggle RCS translation
 * Shift          → throttle up (hold = gradual ramp)
 * Ctrl           → throttle down (hold = gradual ramp)
 * Z              → full throttle (100%)
 * X              → cut throttle (0%)
 * H / N          → RCS forward / back
 * J / L          → RCS left / right
 * I / K          → RCS down / up
 * Mouse drag     → look around (yaw + pitch)
 * Scroll         → smooth FOV zoom in cinematic photo mode
 * Touch: 1 finger = look, 2 finger pinch = thrust
 *
 * Throttle is persistent — 0..100%, persists when key released.
 * Speed is distance-scaled but capped at MAX_SPEED (world-units/s) for a sense of scale.
 * Rotation uses smooth angular velocity with damping.
 * Disabled when `enabled` is false (orbit mode takes over).
 * Exposes `syncFromCamera()` and `getTelemetry()` for HUD.
 */

import { useEffect, useImperativeHandle, forwardRef, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";

export interface FlyTelemetry {
  yaw: number;
  pitch: number;
  roll: number;
  speed: number;          // current world-units/s
  thrust: number;         // 0 .. 1  (persistent throttle level)
  fineControl: boolean;
  rcsEnabled: boolean;
  altitude: number;       // camera.position.y
  distance: number;       // from origin
  autoFlightActive: boolean;
  autoFlightProgress: number;
}

export interface FreeLookHandle {
  syncFromCamera(): void;
  getTelemetry(): FlyTelemetry;
  lookAt(target: THREE.Vector3, durationMs?: number): void;
  flyTo(target: THREE.Vector3, stopDistance?: number): void;
  cancelFlyTo(): void;
}

interface FreeLookControlsProps {
  enabled: boolean;
  mode?: "flight" | "cinematic";
  fov?: number;
  onAutoFlightChange?: (active: boolean) => void;
  onFovChange?: (fov: number) => void;
  getFlyTarget?: () => THREE.Vector3 | null;
}

const SENSITIVITY   = 0.0015;
const MAX_DIST      = 20000;

const SPEED_MULT    = 0.8;           // base speed multiplier
const MAX_SPEED     = 600;           // world-units/s — caps warp feel at far distances

const YAW_RATE      = 0.7;
const PITCH_RATE    = 0.5;
const ROLL_RATE     = 0.9;
const ANG_DAMPING   = 4.5;

/** Throttle ramp: how fast throttle goes from 0→1 when holding Shift (per second) */
const THROTTLE_RAMP = 0.4;
const AUTOPILOT_MIN_SPEED = 80;
const AUTOPILOT_MAX_SPEED = 2600;
const AUTOPILOT_BASE_ACCEL = 620;
const AUTOPILOT_BOOST_ACCEL = 1450;
const AUTOPILOT_BRAKE = 1250;

const FreeLookControls = forwardRef<FreeLookHandle, FreeLookControlsProps>(
  function FreeLookControlsInner({ enabled, mode = "flight", fov, onAutoFlightChange, onFovChange, getFlyTarget }, ref) {
    const { camera, gl, scene } = useThree();

    const enabledRef = useRef(enabled);
    enabledRef.current = enabled;
    const modeRef = useRef(mode);
    modeRef.current = mode;

    const yaw   = useRef(0);
    const pitch  = useRef(0);
    const roll   = useRef(0);

    const angVel     = useRef({ yaw: 0, pitch: 0, roll: 0 });

    /** Persistent throttle: 0 (stop) .. 1 (full forward) */
    const throttle   = useRef(0);
    const lastSpeed  = useRef(0);
    const fineControl = useRef(false);
    const rcsEnabled = useRef(false);
    const stars = useRef<{ object: THREE.Object3D; radius: number }[]>([]);

    const keys = useRef({
      w: false, s: false,        // pitch down / up
      a: false, d: false,        // yaw left / right
      q: false, e: false,        // roll left / right
      shift: false,              // throttle up
      ctrl: false,               // throttle down
      h: false, n: false,        // rcs forward / back
      j: false, l: false,        // rcs left / right
      i: false, k: false,        // rcs down / up
    });

    const _fwd = useRef(new THREE.Vector3());
    const _right = useRef(new THREE.Vector3());
    const _up = useRef(new THREE.Vector3());
    const _move = useRef(new THREE.Vector3());
    const _nextPos = useRef(new THREE.Vector3());
    const _starPos = useRef(new THREE.Vector3());
    const _starOffset = useRef(new THREE.Vector3());
    const _lookMat = useRef(new THREE.Matrix4());
    const _lookEuler = useRef(new THREE.Euler());
    const _lookMatrix = useRef(new THREE.Matrix4());

    const lookStartQuat = useRef(new THREE.Quaternion());
    const lookGoalQuat = useRef(new THREE.Quaternion());
    const lookElapsed = useRef(0);
    const lookDuration = useRef(0);
    const lookActive = useRef(false);
    const flyToTarget = useRef(new THREE.Vector3());
    const flyToStopDistance = useRef(80);
    const flyToActive = useRef(false);
    const flyToInitialDistance = useRef(0);
    const flyToSpeed = useRef(0);
    const onAutoFlightChangeRef = useRef(onAutoFlightChange);
    onAutoFlightChangeRef.current = onAutoFlightChange;
    const onFovChangeRef = useRef(onFovChange);
    onFovChangeRef.current = onFovChange;
    const getFlyTargetRef = useRef(getFlyTarget);
    getFlyTargetRef.current = getFlyTarget;
    const cinematicFov = useRef(fov ?? 55);

    const FINE_FACTOR = 0.34;
    const RCS_SPEED_FACTOR = 0.018;  // keep RCS as fine corrections, not large translations
    const RCS_MAX_FRACTION = 0.07;   // cap at 7% of max speed
    const FOV_MIN = 10;
    const FOV_MAX = 90;
    const FOV_RAMP = 25; // degrees per second
    const STAR_CLEARANCE = 18;

    function syncEulerFromCamera() {
      _lookEuler.current.setFromQuaternion(camera.quaternion, "YXZ");
      yaw.current = _lookEuler.current.y;
      pitch.current = _lookEuler.current.x;
      roll.current = _lookEuler.current.z;
    }

    function keepOutsideStars(position: THREE.Vector3) {
      for (const star of stars.current) {
        star.object.getWorldPosition(_starPos.current);
        const minDistance = star.radius + STAR_CLEARANCE;
        const offset = _starOffset.current.copy(position).sub(_starPos.current);
        const distance = offset.length();

        if (distance < minDistance) {
          if (distance < 0.0001) {
            camera.getWorldDirection(offset);
            offset.multiplyScalar(-1);
          }
          position.copy(_starPos.current).add(offset.normalize().multiplyScalar(minDistance));
        }
      }
    }

    function setAutoFlightActive(next: boolean) {
      if (flyToActive.current === next) return;
      flyToActive.current = next;
      onAutoFlightChangeRef.current?.(next);
    }

    function cancelAutoFlight() {
      flyToSpeed.current = 0;
      setAutoFlightActive(false);
    }

    useImperativeHandle(ref, () => ({
      syncFromCamera() {
        syncEulerFromCamera();
      },
      getTelemetry(): FlyTelemetry {
        return {
          yaw:         yaw.current,
          pitch:       pitch.current,
          roll:        roll.current,
          speed:       lastSpeed.current,
          thrust:      modeRef.current === "flight" ? throttle.current : 0,
          fineControl: fineControl.current,
          rcsEnabled:  modeRef.current === "flight" ? rcsEnabled.current : false,
          altitude:    camera.position.y,
          distance:    camera.position.length(),
          autoFlightActive: flyToActive.current,
          autoFlightProgress: flyToActive.current
            ? THREE.MathUtils.clamp(1 - (Math.max(camera.position.distanceTo(flyToTarget.current) - flyToStopDistance.current, 0) / Math.max(flyToInitialDistance.current, 1)), 0, 1)
            : 0,
        };
      },
      lookAt(target: THREE.Vector3, durationMs = 720) {
        const dir = target.clone().sub(camera.position);
        if (dir.lengthSq() < 0.0001) return;

        cancelAutoFlight();
        lookStartQuat.current.copy(camera.quaternion);
        _lookMatrix.current.lookAt(camera.position, target, camera.up);
        lookGoalQuat.current.setFromRotationMatrix(_lookMatrix.current);
        lookElapsed.current = 0;
        lookDuration.current = Math.max(durationMs / 1000, 0.12);
        lookActive.current = true;
        angVel.current.yaw = 0;
        angVel.current.pitch = 0;
        angVel.current.roll = 0;
      },
      flyTo(target: THREE.Vector3, stopDistance = 80) {
        const distance = camera.position.distanceTo(target);
        flyToTarget.current.copy(target);
        flyToStopDistance.current = Math.max(stopDistance, 8);
        flyToInitialDistance.current = Math.max(distance - flyToStopDistance.current, 1);
        flyToSpeed.current = 0;
        setAutoFlightActive(true);
        lookActive.current = false;
        throttle.current = 0;
        angVel.current.yaw = 0;
        angVel.current.pitch = 0;
        angVel.current.roll = 0;
      },
      cancelFlyTo() {
        cancelAutoFlight();
      },
    }), [camera]);

    useEffect(() => {
      const nextStars: { object: THREE.Object3D; radius: number }[] = [];
      scene.traverse((obj) => {
        const ud = obj.userData;
        if (ud?.bodyType === "star") {
          nextStars.push({ object: obj, radius: ud.bodyRadius ?? 80 });
        }
      });
      stars.current = nextStars;
    }, [scene]);

    useEffect(() => {
      syncEulerFromCamera();
    }, [camera]);

    useEffect(() => {
      if (fov !== undefined) cinematicFov.current = fov;
    }, [fov]);

    useFrame((_state, delta) => {
      if (!enabledRef.current) return;

      const k  = keys.current;
      const av = angVel.current;
      const rotationFactor = fineControl.current ? FINE_FACTOR : 1;
      const hasManualRotationInput = k.w || k.s || k.a || k.d || k.q || k.e;
      const hasManualTranslationInput = k.shift || k.ctrl || k.h || k.n || k.j || k.l || k.i || k.k;

      if (hasManualRotationInput && lookActive.current) {
        lookActive.current = false;
      }

      if ((hasManualRotationInput || hasManualTranslationInput) && flyToActive.current) {
        cancelAutoFlight();
      }

      if (lookActive.current) {
        lookElapsed.current += delta;
        const rawT = lookDuration.current <= 0 ? 1 : lookElapsed.current / lookDuration.current;
        const easedT = THREE.MathUtils.smootherstep(rawT, 0, 1);
        camera.quaternion.copy(lookStartQuat.current).slerp(lookGoalQuat.current, easedT);
        syncEulerFromCamera();

        if (rawT >= 1) {
          camera.quaternion.copy(lookGoalQuat.current);
          syncEulerFromCamera();
          lookActive.current = false;
        }
      }

      if (flyToActive.current && modeRef.current === "flight") {
        // Refresh target position each frame so orbiting bodies are tracked live
        const livePos = getFlyTargetRef.current?.();
        if (livePos) flyToTarget.current.copy(livePos);

        _starOffset.current.copy(flyToTarget.current).sub(camera.position);
        const distanceToTarget = _starOffset.current.length();
        const stopDistance = flyToStopDistance.current;
        const remainingDistance = Math.max(distanceToTarget - stopDistance, 0);

        if (remainingDistance <= 0.5) {
          _lookMatrix.current.lookAt(camera.position, flyToTarget.current, camera.up);
          lookGoalQuat.current.setFromRotationMatrix(_lookMatrix.current);
          camera.quaternion.copy(lookGoalQuat.current);
          syncEulerFromCamera();
          cancelAutoFlight();
          lastSpeed.current = 0;
          throttle.current = 0;
          return;
        }

        _lookMatrix.current.lookAt(camera.position, flyToTarget.current, camera.up);
        lookGoalQuat.current.setFromRotationMatrix(_lookMatrix.current);
        const turnStrength = remainingDistance > 5000 ? 2.8 : 4.8;
        camera.quaternion.slerp(lookGoalQuat.current, THREE.MathUtils.clamp(1 - Math.exp(-turnStrength * delta), 0, 1));
        syncEulerFromCamera();

        const cruiseSpeed = THREE.MathUtils.clamp(
          Math.max(flyToInitialDistance.current * 0.22, AUTOPILOT_MIN_SPEED),
          AUTOPILOT_MIN_SPEED,
          AUTOPILOT_MAX_SPEED,
        );
        const accel = flyToInitialDistance.current > 9000 ? AUTOPILOT_BOOST_ACCEL : AUTOPILOT_BASE_ACCEL;
        const brakingDistance = Math.max(
          stopDistance * 2.8,
          (flyToSpeed.current * flyToSpeed.current) / (2 * AUTOPILOT_BRAKE),
        );

        if (remainingDistance <= brakingDistance) {
          flyToSpeed.current = Math.max(AUTOPILOT_MIN_SPEED * 0.45, flyToSpeed.current - AUTOPILOT_BRAKE * delta);
        } else {
          flyToSpeed.current = Math.min(cruiseSpeed, flyToSpeed.current + accel * delta);
        }

        const travel = Math.min(flyToSpeed.current * delta, remainingDistance);

        _fwd.current.copy(_starOffset.current).normalize();
        _nextPos.current.copy(camera.position).addScaledVector(_fwd.current, travel);
        keepOutsideStars(_nextPos.current);
        camera.position.copy(_nextPos.current);
        lastSpeed.current = travel / Math.max(delta, 0.0001);

        const d2 = camera.position.length();
        if (d2 < 0.5) camera.position.setLength(0.5);
        if (d2 > MAX_DIST) camera.position.setLength(MAX_DIST);
        return;
      }

      if (modeRef.current === "cinematic") {
        // ── Rotation: WASD / QE — same smoothed angular velocity as flight ──
        const targetPitchC = ((k.s ? 1 : 0) - (k.w ? 1 : 0)) * PITCH_RATE * rotationFactor;
        const targetYawC   = ((k.a ? 1 : 0) - (k.d ? 1 : 0)) * YAW_RATE   * rotationFactor;
        const targetRollC  = ((k.q ? 1 : 0) - (k.e ? 1 : 0)) * ROLL_RATE  * rotationFactor;

        const blend = 1 - Math.exp(-ANG_DAMPING * delta);
        av.yaw   += (targetYawC   - av.yaw)   * blend;
        av.pitch += (targetPitchC - av.pitch) * blend;
        av.roll  += (targetRollC  - av.roll)  * blend;

        if (Math.abs(av.yaw) > 0.0001 || Math.abs(av.pitch) > 0.0001 || Math.abs(av.roll) > 0.0001) {
          yaw.current   += av.yaw   * delta;
          pitch.current += av.pitch * delta;
          roll.current  += av.roll  * delta;
          pitch.current  = Math.max(-Math.PI * 0.48, Math.min(Math.PI * 0.48, pitch.current));
          const q = new THREE.Quaternion();
          q.setFromEuler(new THREE.Euler(pitch.current, yaw.current, roll.current, "YXZ"));
          camera.quaternion.copy(q);
        }

        // ── Translation: H/N/J/L/I/K — RCS-style fine corrections ──
        _move.current.set(0, 0, 0);
        const dist = camera.position.length();
        const rcsSpeed = Math.min(Math.max(dist * RCS_SPEED_FACTOR, 0.4), MAX_SPEED * RCS_MAX_FRACTION)
          * SPEED_MULT * delta * rotationFactor;

        camera.getWorldDirection(_fwd.current);
        _up.current.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
        _right.current.crossVectors(_fwd.current, _up.current).normalize();

        const fwd  = (k.h ? 1 : 0) - (k.n ? 1 : 0);
        const side = (k.l ? 1 : 0) - (k.j ? 1 : 0);
        const vert = (k.i ? 1 : 0) - (k.k ? 1 : 0);

        _move.current
          .addScaledVector(_fwd.current, fwd  * rcsSpeed)
          .addScaledVector(_right.current, side * rcsSpeed)
          .addScaledVector(_up.current, vert * rcsSpeed);

        if (_move.current.lengthSq() > 0) {
          _nextPos.current.copy(camera.position).add(_move.current);
          keepOutsideStars(_nextPos.current);
          camera.position.copy(_nextPos.current);
          lastSpeed.current = _move.current.length() / Math.max(delta, 0.0001);
        } else {
          lastSpeed.current = 0;
        }

        // ── Zoom: Shift = zoom in (↓ FOV), Ctrl = zoom out (↑ FOV) ──
        if (k.shift || k.ctrl) {
          const prevFov = cinematicFov.current;
          if (k.shift) cinematicFov.current = Math.max(FOV_MIN, prevFov - FOV_RAMP * delta);
          if (k.ctrl)  cinematicFov.current = Math.min(FOV_MAX, prevFov + FOV_RAMP * delta);
          if (camera instanceof THREE.PerspectiveCamera) {
            camera.fov = cinematicFov.current;
            camera.updateProjectionMatrix();
          }
          const rounded = Math.round(cinematicFov.current);
          if (rounded !== Math.round(prevFov)) onFovChangeRef.current?.(rounded);
        }

        const d2 = camera.position.length();
        if (d2 < 0.5) camera.position.setLength(0.5);
        if (d2 > MAX_DIST) camera.position.setLength(MAX_DIST);
        return;
      }

      /* W = pitch down (nose down), S = pitch up (nose up) */
      const targetPitch = ((k.s ? 1 : 0) - (k.w ? 1 : 0)) * PITCH_RATE * rotationFactor;
      const targetYaw   = ((k.a ? 1 : 0) - (k.d ? 1 : 0)) * YAW_RATE * rotationFactor;
      /* Q = roll left, E = roll right */
      const targetRoll  = ((k.q ? 1 : 0) - (k.e ? 1 : 0)) * ROLL_RATE * rotationFactor;

      const blend = 1 - Math.exp(-ANG_DAMPING * delta);
      av.yaw   += (targetYaw   - av.yaw)   * blend;
      av.pitch += (targetPitch - av.pitch) * blend;
      av.roll  += (targetRoll  - av.roll)  * blend;

      if (Math.abs(av.yaw) > 0.0001 || Math.abs(av.pitch) > 0.0001 || Math.abs(av.roll) > 0.0001) {
        yaw.current   += av.yaw   * delta;
        pitch.current += av.pitch * delta;
        roll.current  += av.roll  * delta;
        pitch.current  = Math.max(-Math.PI * 0.48, Math.min(Math.PI * 0.48, pitch.current));

        const q = new THREE.Quaternion();
        q.setFromEuler(new THREE.Euler(pitch.current, yaw.current, roll.current, "YXZ"));
        camera.quaternion.copy(q);
      }

      /* ── Throttle: Shift = up, Ctrl = down, persists when released ── */
      if (k.shift) throttle.current = Math.min(throttle.current + THROTTLE_RAMP * delta, 1);
      if (k.ctrl)  throttle.current = Math.max(throttle.current - THROTTLE_RAMP * delta, 0);

      _move.current.set(0, 0, 0);

      /* Move at current throttle (even if no key held) */
      if (throttle.current > 0.001) {
        const dist      = camera.position.length();
        const baseSpeed = Math.min(Math.max(dist * 0.18, 4), MAX_SPEED);
        const speed     = baseSpeed * SPEED_MULT * delta;

        camera.getWorldDirection(_fwd.current);
        _move.current.addScaledVector(_fwd.current, throttle.current * speed);
        lastSpeed.current = throttle.current * baseSpeed * SPEED_MULT;
      } else {
        lastSpeed.current = 0;
      }

      if (rcsEnabled.current) {
        const dist = camera.position.length();
        const rcsSpeed = Math.min(Math.max(dist * RCS_SPEED_FACTOR, 0.4), MAX_SPEED * RCS_MAX_FRACTION)
          * SPEED_MULT
          * delta
          * (fineControl.current ? FINE_FACTOR : 1);

        camera.getWorldDirection(_fwd.current);
        _up.current.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
        _right.current.crossVectors(_fwd.current, _up.current).normalize();

        const forward = (k.h ? 1 : 0) - (k.n ? 1 : 0);
        const strafe = (k.l ? 1 : 0) - (k.j ? 1 : 0);
        const vertical = (k.k ? 1 : 0) - (k.i ? 1 : 0);

        _move.current
          .addScaledVector(_fwd.current, forward * rcsSpeed)
          .addScaledVector(_right.current, strafe * rcsSpeed)
          .addScaledVector(_up.current, vertical * rcsSpeed);

        if (forward !== 0 || strafe !== 0 || vertical !== 0) {
          lastSpeed.current += Math.min(Math.max(dist * RCS_SPEED_FACTOR, 0.4), MAX_SPEED * RCS_MAX_FRACTION)
            * SPEED_MULT
            * (fineControl.current ? FINE_FACTOR : 1);
        }
      }

      if (_move.current.lengthSq() > 0) {
        _nextPos.current.copy(camera.position).add(_move.current);
        keepOutsideStars(_nextPos.current);
        camera.position.copy(_nextPos.current);
      }

      const d2 = camera.position.length();
      if (d2 < 0.5) camera.position.setLength(0.5);
      if (d2 > MAX_DIST) camera.position.setLength(MAX_DIST);
    });

    useEffect(() => {
      const canvas = gl.domElement;

      function applyRotation() {
        const q = new THREE.Quaternion();
        q.setFromEuler(new THREE.Euler(pitch.current, yaw.current, roll.current, "YXZ"));
        camera.quaternion.copy(q);
      }

      function onKeyDown(e: KeyboardEvent) {
        if (!enabledRef.current) return;
        if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
        const k = e.key.toLowerCase();
        if ("wsadeqhjnlikxr".includes(k) || k === "shift" || k === "control") {
          cancelAutoFlight();
        }
        if (e.code === "CapsLock" && !e.repeat) {
          fineControl.current = !fineControl.current;
          e.preventDefault();
          return;
        }
        if (modeRef.current === "flight" && k === "r" && !e.repeat) {
          rcsEnabled.current = !rcsEnabled.current;
          e.preventDefault();
          return;
        }
        if (k === "w") keys.current.w = true;
        if (k === "s") keys.current.s = true;
        if (k === "a") keys.current.a = true;
        if (k === "d") keys.current.d = true;
        if (k === "q") keys.current.q = true;
        if (k === "e") keys.current.e = true;
        if (k === "h") keys.current.h = true;
        if (k === "n") keys.current.n = true;
        if (k === "j") keys.current.j = true;
        if (k === "l") keys.current.l = true;
        if (k === "i") keys.current.i = true;
        if (k === "k") keys.current.k = true;
        if (k === "shift") keys.current.shift = true;
        if (k === "control") keys.current.ctrl = true;
        /* Z / X — flight: full/cut throttle; cinematic: max/reset zoom */
        if (modeRef.current === "flight" && k === "z") { throttle.current = 1; e.preventDefault(); }
        if (modeRef.current === "flight" && k === "x") { throttle.current = 0; e.preventDefault(); }
        if (modeRef.current === "cinematic" && k === "z") {
          cinematicFov.current = FOV_MIN;
          if (camera instanceof THREE.PerspectiveCamera) { camera.fov = FOV_MIN; camera.updateProjectionMatrix(); }
          onFovChangeRef.current?.(FOV_MIN);
          e.preventDefault();
        }
        if (modeRef.current === "cinematic" && k === "x") {
          cinematicFov.current = 55;
          if (camera instanceof THREE.PerspectiveCamera) { camera.fov = 55; camera.updateProjectionMatrix(); }
          onFovChangeRef.current?.(55);
          e.preventDefault();
        }
      }

      function onKeyUp(e: KeyboardEvent) {
        const k = e.key.toLowerCase();
        if (k === "w") keys.current.w = false;
        if (k === "s") keys.current.s = false;
        if (k === "a") keys.current.a = false;
        if (k === "d") keys.current.d = false;
        if (k === "q") keys.current.q = false;
        if (k === "e") keys.current.e = false;
        if (k === "h") keys.current.h = false;
        if (k === "n") keys.current.n = false;
        if (k === "j") keys.current.j = false;
        if (k === "l") keys.current.l = false;
        if (k === "i") keys.current.i = false;
        if (k === "k") keys.current.k = false;
        if (k === "shift") keys.current.shift = false;
        if (k === "control") keys.current.ctrl = false;
      }

      function onBlur() {
        keys.current = {
          w: false, s: false, a: false, d: false, q: false, e: false,
          shift: false, ctrl: false, h: false, n: false, j: false, l: false, i: false, k: false,
        };
      }

      let dragging = false;
      let lastX = 0, lastY = 0;

      function onPointerDown(e: PointerEvent) {
        if (!enabledRef.current || e.pointerType === "touch") return;
        dragging = true;
        lastX = e.clientX; lastY = e.clientY;
        canvas.setPointerCapture(e.pointerId);
      }

      function onPointerMove(e: PointerEvent) {
        if (!dragging || !enabledRef.current || e.pointerType === "touch") return;
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX; lastY = e.clientY;
        const sensitivity = SENSITIVITY * (fineControl.current ? FINE_FACTOR : 1);
        cancelAutoFlight();
        yaw.current   -= dx * sensitivity;
        pitch.current -= dy * sensitivity;
        pitch.current  = Math.max(-Math.PI * 0.48, Math.min(Math.PI * 0.48, pitch.current));
        applyRotation();
      }

      function onPointerUp(e: PointerEvent) {
        if (e.pointerType === "touch") return;
        dragging = false;
        canvas.releasePointerCapture(e.pointerId);
      }

      let touchDrag = false;
      let pinching  = false;
      let lastTX = 0, lastTY = 0;
      let lastPinch = 0;

      function onTouchStart(e: TouchEvent) {
        if (!enabledRef.current) return;
        if (e.touches.length === 1) {
          touchDrag = true; pinching = false;
          lastTX = e.touches[0].clientX; lastTY = e.touches[0].clientY;
        } else if (e.touches.length >= 2) {
          touchDrag = false; pinching = true;
          lastPinch = Math.hypot(
            e.touches[1].clientX - e.touches[0].clientX,
            e.touches[1].clientY - e.touches[0].clientY,
          );
        }
      }

      function onTouchMove(e: TouchEvent) {
        if (!enabledRef.current) return;
        e.preventDefault();
        if (pinching && e.touches.length >= 2) {
          cancelAutoFlight();
          const d = Math.hypot(
            e.touches[1].clientX - e.touches[0].clientX,
            e.touches[1].clientY - e.touches[0].clientY,
          );
          const delta = (d - lastPinch) * 0.3;
          lastPinch = d;
          const fwd = new THREE.Vector3();
          camera.getWorldDirection(fwd);
          const dist  = camera.position.length();
          const speed = Math.max(dist * 0.004, 2);
          _nextPos.current.copy(camera.position).addScaledVector(fwd, delta * speed);
          keepOutsideStars(_nextPos.current);
          camera.position.copy(_nextPos.current);
        } else if (touchDrag && e.touches.length === 1) {
          cancelAutoFlight();
          const dx = e.touches[0].clientX - lastTX;
          const dy = e.touches[0].clientY - lastTY;
          lastTX = e.touches[0].clientX; lastTY = e.touches[0].clientY;
          const sensitivity = SENSITIVITY * (fineControl.current ? FINE_FACTOR : 1);
          yaw.current   -= dx * sensitivity;
          pitch.current -= dy * sensitivity;
          pitch.current  = Math.max(-Math.PI * 0.48, Math.min(Math.PI * 0.48, pitch.current));
          applyRotation();
        }
      }

      function onTouchEnd(e: TouchEvent) {
        if (e.touches.length === 0) { touchDrag = false; pinching = false; }
        else if (e.touches.length === 1) {
          pinching = false; touchDrag = true;
          lastTX = e.touches[0].clientX; lastTY = e.touches[0].clientY;
        }
      }

      function onWheel(e: WheelEvent) {
        if (!enabledRef.current || modeRef.current !== "cinematic") return;
        e.preventDefault();

        const deltaFov = THREE.MathUtils.clamp(e.deltaY * 0.012, -2.5, 2.5);
        const nextFov = THREE.MathUtils.clamp(cinematicFov.current + deltaFov, FOV_MIN, FOV_MAX);
        if (Math.abs(nextFov - cinematicFov.current) < 0.001) return;

        cinematicFov.current = nextFov;
        onFovChangeRef.current?.(Math.round(nextFov));
      }

      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup",   onKeyUp);
      window.addEventListener("blur",    onBlur);
      canvas.addEventListener("pointerdown",   onPointerDown);
      canvas.addEventListener("pointermove",   onPointerMove);
      canvas.addEventListener("pointerup",     onPointerUp);
      canvas.addEventListener("pointercancel", onPointerUp);
      canvas.addEventListener("wheel",         onWheel, { passive: false });
      canvas.addEventListener("touchstart",    onTouchStart,  { passive: false });
      canvas.addEventListener("touchmove",     onTouchMove,   { passive: false });
      canvas.addEventListener("touchend",      onTouchEnd,    { passive: false });

      return () => {
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup",   onKeyUp);
        window.removeEventListener("blur",    onBlur);
        canvas.removeEventListener("pointerdown",   onPointerDown);
        canvas.removeEventListener("pointermove",   onPointerMove);
        canvas.removeEventListener("pointerup",     onPointerUp);
        canvas.removeEventListener("pointercancel", onPointerUp);
        canvas.removeEventListener("wheel",         onWheel);
        canvas.removeEventListener("touchstart",    onTouchStart);
        canvas.removeEventListener("touchmove",     onTouchMove);
        canvas.removeEventListener("touchend",      onTouchEnd);
      };
    }, [camera, gl]);

    return null;
  },
);

FreeLookControls.displayName = "FreeLookControls";
export default FreeLookControls;
