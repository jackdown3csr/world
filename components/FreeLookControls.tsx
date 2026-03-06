"use client";

/**
 * FreeLookControls — spaceship-style fly camera.
 *
 * WASD        → fly forward / backward / strafe left / right
 * Q / E       → descend / ascend
 * Mouse drag  → look around (yaw + pitch)
 * Scroll      → cycle fly speed (3 levels)
 * Touch: 1 finger = look, 2 finger pinch = speed, 2 finger pan = strafe
 *
 * Disabled when `enabled` is false (orbit mode takes over).
 * Exposes `syncFromCamera()` so CameraController can re-sync yaw/pitch
 * after externally animating camera.quaternion.
 */

import { useEffect, useImperativeHandle, forwardRef, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";

export interface FreeLookHandle {
  /** Re-extract yaw/pitch from camera.quaternion after an external change. */
  syncFromCamera(): void;
}

interface FreeLookControlsProps {
  enabled: boolean;
}

const SENSITIVITY   = 0.002;           // rad / pixel
const MAX_DIST      = 20000;

/* Speed tiers — each tier is a multiplier of the adaptive base speed */
const SPEED_TIERS   = [0.5, 1.5, 4.0];
const SPEED_LABELS  = ["slow", "normal", "fast"];

const FreeLookControls = forwardRef<FreeLookHandle, FreeLookControlsProps>(
  function FreeLookControlsInner({ enabled }, ref) {
    const { camera, gl } = useThree();

    const yaw        = useRef(0);
    const pitch      = useRef(0);
    const enabledRef = useRef(enabled);
    enabledRef.current = enabled;

    /* Movement keys held */
    const keys = useRef({
      w: false, a: false, s: false, d: false,
      q: false, e: false, shift: false,
    });

    /* Speed tier index */
    const speedTier = useRef(1);

    /* Reusable vectors */
    const _fwd   = useRef(new THREE.Vector3());
    const _right = useRef(new THREE.Vector3());
    const _up    = useRef(new THREE.Vector3(0, 1, 0));

    /* ── Expose sync handle ── */
    useImperativeHandle(ref, () => ({
      syncFromCamera() {
        const e = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
        yaw.current   = e.y;
        pitch.current = e.x;
      },
    }), [camera]);

    /* Seed from initial camera orientation */
    useEffect(() => {
      const e = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
      yaw.current   = e.y;
      pitch.current = e.x;
    }, [camera]);

    /* ── Per-frame WASD movement ── */
    useFrame((_state, delta) => {
      if (!enabledRef.current) return;

      const k = keys.current;
      const any = k.w || k.s || k.a || k.d || k.q || k.e;
      if (!any) return;

      /* Adaptive speed: faster when far from origin */
      const dist      = camera.position.length();
      const baseSpeed = Math.max(dist * 0.35, 8);
      const speed     = baseSpeed * SPEED_TIERS[speedTier.current] * delta;
      const boost     = k.shift ? 3.0 : 1.0;

      camera.getWorldDirection(_fwd.current);
      _right.current.crossVectors(_fwd.current, _up.current).normalize();

      if (k.w) camera.position.addScaledVector(_fwd.current, speed * boost);
      if (k.s) camera.position.addScaledVector(_fwd.current, -speed * boost);
      if (k.a) camera.position.addScaledVector(_right.current, -speed * boost);
      if (k.d) camera.position.addScaledVector(_right.current, speed * boost);
      if (k.e) camera.position.y += speed * boost;
      if (k.q) camera.position.y -= speed * boost;

      /* Clamp */
      const d2 = camera.position.length();
      if (d2 < 0.5) camera.position.setLength(0.5);
      if (d2 > MAX_DIST) camera.position.setLength(MAX_DIST);
    });

    /* ── Keyboard + Pointer + Touch event binding ── */
    useEffect(() => {
      const canvas = gl.domElement;

      function applyRotation() {
        const q = new THREE.Quaternion();
        q.setFromEuler(new THREE.Euler(pitch.current, yaw.current, 0, "YXZ"));
        camera.quaternion.copy(q);
      }

      /* ── Keyboard ── */
      function onKeyDown(e: KeyboardEvent) {
        if (!enabledRef.current) return;
        /* Don't capture when typing in an input/textarea */
        if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
        const k = e.key.toLowerCase();
        if (k === "w") keys.current.w = true;
        if (k === "a") keys.current.a = true;
        if (k === "s") keys.current.s = true;
        if (k === "d") keys.current.d = true;
        if (k === "q") keys.current.q = true;
        if (k === "e") keys.current.e = true;
        if (k === "shift") keys.current.shift = true;
      }

      function onKeyUp(e: KeyboardEvent) {
        const k = e.key.toLowerCase();
        if (k === "w") keys.current.w = false;
        if (k === "a") keys.current.a = false;
        if (k === "s") keys.current.s = false;
        if (k === "d") keys.current.d = false;
        if (k === "q") keys.current.q = false;
        if (k === "e") keys.current.e = false;
        if (k === "shift") keys.current.shift = false;
      }

      /* Reset all keys when window loses focus */
      function onBlur() {
        keys.current = { w: false, a: false, s: false, d: false, q: false, e: false, shift: false };
      }

      /* ── Mouse look ── */
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
        yaw.current   -= dx * SENSITIVITY;
        pitch.current -= dy * SENSITIVITY;
        pitch.current  = Math.max(-Math.PI * 0.48, Math.min(Math.PI * 0.48, pitch.current));
        applyRotation();
      }

      function onPointerUp(e: PointerEvent) {
        if (e.pointerType === "touch") return;
        dragging = false;
        canvas.releasePointerCapture(e.pointerId);
      }

      /* ── Scroll → cycle speed tier ── */
      function onWheel(e: WheelEvent) {
        if (!enabledRef.current) return;
        e.preventDefault();
        if (e.deltaY > 0) speedTier.current = Math.min(2, speedTier.current + 1);
        else              speedTier.current = Math.max(0, speedTier.current - 1);
      }

      /* ── Touch: 1 finger = look, 2 fingers = strafe/pinch ── */
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
          /* Pinch → forward/backward */
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
          camera.position.addScaledVector(fwd, delta * speed);
        } else if (touchDrag && e.touches.length === 1) {
          const dx = e.touches[0].clientX - lastTX;
          const dy = e.touches[0].clientY - lastTY;
          lastTX = e.touches[0].clientX; lastTY = e.touches[0].clientY;
          yaw.current   -= dx * SENSITIVITY;
          pitch.current -= dy * SENSITIVITY;
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

      /* ── Register ── */
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup",   onKeyUp);
      window.addEventListener("blur",    onBlur);
      canvas.addEventListener("pointerdown",   onPointerDown);
      canvas.addEventListener("pointermove",   onPointerMove);
      canvas.addEventListener("pointerup",     onPointerUp);
      canvas.addEventListener("pointercancel", onPointerUp);
      canvas.addEventListener("wheel",         onWheel,       { passive: false });
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
