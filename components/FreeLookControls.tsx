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
 * Scroll         → cycle fly speed tier (3 levels)
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
}

export interface FreeLookHandle {
  syncFromCamera(): void;
  getTelemetry(): FlyTelemetry;
}

interface FreeLookControlsProps {
  enabled: boolean;
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

const FreeLookControls = forwardRef<FreeLookHandle, FreeLookControlsProps>(
  function FreeLookControlsInner({ enabled }, ref) {
    const { camera, gl, scene } = useThree();

    const enabledRef = useRef(enabled);
    enabledRef.current = enabled;

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

    const FINE_FACTOR = 0.34;
    const RCS_SPEED_FACTOR = 0.09;
    const STAR_CLEARANCE = 18;

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

    useImperativeHandle(ref, () => ({
      syncFromCamera() {
        const e = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
        yaw.current   = e.y;
        pitch.current = e.x;
        roll.current  = e.z;
      },
      getTelemetry(): FlyTelemetry {
        return {
          yaw:         yaw.current,
          pitch:       pitch.current,
          roll:        roll.current,
          speed:       lastSpeed.current,
          thrust:      throttle.current,
          fineControl: fineControl.current,
          rcsEnabled:  rcsEnabled.current,
          altitude:    camera.position.y,
          distance:    camera.position.length(),
        };
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
      const e = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
      yaw.current   = e.y;
      pitch.current = e.x;
      roll.current  = e.z;
    }, [camera]);

    useFrame((_state, delta) => {
      if (!enabledRef.current) return;

      const k  = keys.current;
      const av = angVel.current;
      const rotationFactor = fineControl.current ? FINE_FACTOR : 1;

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
        const rcsSpeed = Math.min(Math.max(dist * RCS_SPEED_FACTOR, 1.6), MAX_SPEED * 0.5)
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
          lastSpeed.current += Math.min(Math.max(dist * RCS_SPEED_FACTOR, 1.6), MAX_SPEED * 0.5)
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
        if (e.code === "CapsLock" && !e.repeat) {
          fineControl.current = !fineControl.current;
          e.preventDefault();
          return;
        }
        if (k === "r" && !e.repeat) {
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
        /* Z = full throttle, X = cut throttle */
        if (k === "z") { throttle.current = 1; e.preventDefault(); }
        if (k === "x") { throttle.current = 0; e.preventDefault(); }
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

      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup",   onKeyUp);
      window.addEventListener("blur",    onBlur);
      canvas.addEventListener("pointerdown",   onPointerDown);
      canvas.addEventListener("pointermove",   onPointerMove);
      canvas.addEventListener("pointerup",     onPointerUp);
      canvas.addEventListener("pointercancel", onPointerUp);
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
