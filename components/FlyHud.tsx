"use client";

import { useEffect, useRef, useState, type RefObject, type CSSProperties } from "react";
import type { FreeLookHandle, FlyTelemetry } from "./FreeLookControls";

interface FlyHudProps {
  freelookRef: RefObject<FreeLookHandle | null>;
  visible: boolean;
}

const DEG = 180 / Math.PI;

function fmt(n: number, d = 1): string {
  return n.toFixed(d);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

export default function FlyHud({ freelookRef, visible }: FlyHudProps) {
  const [t, setT] = useState<FlyTelemetry | null>(null);
  const [showKeyHints, setShowKeyHints] = useState(false);
  const [entered, setEntered] = useState(false);
  const [rendered, setRendered] = useState(visible);
  const raf = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevFineRef = useRef<boolean | null>(null);
  const prevRcsRef = useRef<boolean | null>(null);
  const ctrlFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rcsFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ctrlFlash, setCtrlFlash] = useState(false);
  const [rcsFlash, setRcsFlash] = useState(false);
  const [autoFlightActive, setAutoFlightActive] = useState(false);
  const [autoFlightProgress, setAutoFlightProgress] = useState(0);

  useEffect(() => {
    if (!rendered) {
      return;
    }
    let active = true;
    function tick() {
      if (!active) return;
      const tel = freelookRef.current?.getTelemetry?.();
      if (tel) {
        setT({ ...tel });
        if (prevFineRef.current !== null && prevFineRef.current !== tel.fineControl) {
          setCtrlFlash(true);
          if (ctrlFlashTimer.current) clearTimeout(ctrlFlashTimer.current);
          ctrlFlashTimer.current = setTimeout(() => setCtrlFlash(false), 380);
        }
        if (prevRcsRef.current !== null && prevRcsRef.current !== tel.rcsEnabled) {
          setRcsFlash(true);
          if (rcsFlashTimer.current) clearTimeout(rcsFlashTimer.current);
          rcsFlashTimer.current = setTimeout(() => setRcsFlash(false), 380);
        }
        prevFineRef.current = tel.fineControl;
        prevRcsRef.current = tel.rcsEnabled;
        setAutoFlightActive(tel.autoFlightActive);
        setAutoFlightProgress(tel.autoFlightProgress);
      }
      raf.current = requestAnimationFrame(tick);
    }
    raf.current = requestAnimationFrame(tick);
    return () => {
      active = false;
      cancelAnimationFrame(raf.current);
    };
  }, [rendered, freelookRef]);

  useEffect(() => {
    if (visible) {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      setRendered(true);
      setShowKeyHints(true);
      setEntered(false);
      const id = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(id);
    }
    setEntered(false);
    hideTimer.current = setTimeout(() => {
      setRendered(false);
      setT(null);
    }, 280);
    return () => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
    };
  }, [visible]);

  if (!rendered || !t) return null;

  const displayRoll = -finite(t.roll);
  const rollDeg = displayRoll * DEG;
  const thrust = finite(t.thrust);
  const safePitch = finite(t.pitch);
  const thrustPct = clamp(thrust * 100, 0, 100);
  const thrustColor = thrust > 0.01 ? "#7bf7ff" : "#2b4a59";
  const controlTone = t.fineControl ? "#ffd36e" : "#7bf7ff";
  const rcsTone = t.rcsEnabled ? "#83b8aa" : "#46606a";
  const driftX = clamp(Math.sin(displayRoll) * 18, -18, 18);
  const driftY = clamp(-(safePitch * DEG) * 0.8, -16, 16);

  return (
    <div style={{ ...S.root, opacity: entered ? 1 : 0, transform: entered ? "none" : "translateY(8px)" }}>
      <style>{`@keyframes hudFlash { 0%,100%{opacity:1} 40%{opacity:0.35} }`}</style>
      <div style={S.scanGlow} />

      {/* Screen-center crosshair */}
      <div style={S.reticleWrap}>
        <svg width="128" height="128" viewBox="-64 -64 128 128" style={S.svg}>
          <defs>
            <radialGradient id="rg" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#7bf7ff" stopOpacity="0.10" />
              <stop offset="100%" stopColor="#39bfd7" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="0" cy="0" r="42" fill="url(#rg)" />
          <circle cx="0" cy="0" r="36" fill="none" stroke="#7bf7ff14" strokeWidth="1" />
          <circle cx="0" cy="0" r="28" fill="none" stroke="#7bf7ff0e" strokeWidth="0.7" strokeDasharray="8 12" />
          <g transform={`translate(${driftX},${driftY}) rotate(${rollDeg})`}>
            <path d="M -38 0 L -11 0 M 11 0 L 38 0" stroke="#7bf7ff" strokeWidth="1.1" strokeLinecap="round" />
            <path d="M 0 -22 L 0 -7 M 0 7 L 0 22" stroke="#7bf7ff50" strokeWidth="0.9" strokeLinecap="round" />
            <circle cx="0" cy="0" r="8" fill="none" stroke="#7bf7ff38" strokeWidth="0.8" />
            <circle cx="0" cy="0" r="2.2" fill="#b8fbff" opacity="0.88" />
          </g>
          <g opacity="0.20">
            <path d="M -50 2 L -60 0 L -50 -2" fill="none" stroke="#7bf7ff" strokeWidth="0.9" />
            <path d="M 50 2 L 60 0 L 50 -2" fill="none" stroke="#7bf7ff" strokeWidth="0.9" />
          </g>
        </svg>
      </div>

      <div style={S.bottomDock}>
        <div style={S.modeStack}>
          <StatusItem label="CTRL" value={t.fineControl ? "FINE" : "NORMAL"} tone={controlTone} flash={ctrlFlash} />
          <StatusItem label="RCS" value={t.rcsEnabled ? "ON" : "OFF"} tone={rcsTone} flash={rcsFlash} subtle />
        </div>
        <div style={S.thrustModule}>
          <div style={S.thrustHead}>
            <span style={S.thrustLbl}>THRUST</span>
            <span style={{ ...S.thrustVal, color: thrustColor }}>{fmt(thrustPct, 0)}%</span>
          </div>
          <div style={S.thrustTrack}>
            <div style={{ ...S.thrustFill, width: `${thrustPct}%`, background: thrustColor }} />
          </div>
        </div>
        {autoFlightActive ? (
          <div style={S.autoFlightChip}>
            <span style={S.autoFlightLabel}>AUTO</span>
            <div style={S.autoFlightTrack}>
              <div style={{ ...S.autoFlightFill, width: `${Math.round(autoFlightProgress * 100)}%` }} />
            </div>
            <span style={S.autoFlightValue}>{Math.round(autoFlightProgress * 100)}%</span>
          </div>
        ) : null}
      </div>

      {showKeyHints && (
        <div style={S.keyHints}>
          <div style={S.keyHintsHeader}>
            <div style={S.keyHintsTitle}>INPUT</div>
            <button type="button" onClick={() => setShowKeyHints(false)} style={S.closeButton} aria-label="Hide key hints">
              ×
            </button>
          </div>
          <KeyHint keys="W / S" action="Pitch" />
          <KeyHint keys="A / D" action="Yaw" />
          <KeyHint keys="Q / E" action="Roll left / right" />
          <KeyHint keys="CAPS" action="Fine control" />
          <KeyHint keys="R" action="Toggle RCS" />
          <div style={S.keySep} />
          <KeyHint keys="SHIFT" action="Throttle up" />
          <KeyHint keys="CTRL" action="Throttle down" />
          <KeyHint keys="Z / X" action="Full / cut" />
          <div style={S.keySep} />
          <KeyHint keys="H / N" action="RCS forward / back" />
          <KeyHint keys="J / L" action="RCS left / right" />
          <KeyHint keys="I / K" action="RCS down / up" />
          <div style={S.keySep} />
          <KeyHint keys="DRAG" action="View vector" />
        </div>
      )}
    </div>
  );
}

function StatusItem({ label, value, tone, flash, subtle = false }: { label: string; value: string; tone: string; flash?: boolean; subtle?: boolean }) {
  return (
    <div style={{ ...S.statusItem, ...(subtle ? S.statusItemSubtle : {}), animation: flash ? "hudFlash 380ms ease-out forwards" : undefined }}>
      <span style={S.statusLbl}>{label}</span>
      <span style={{ ...S.statusVal, color: tone }}>{value}</span>
    </div>
  );
}

function KeyHint({ keys, action }: { keys: string; action: string }) {
  return (
    <div style={S.keyRow}>
      <span style={S.keyBadge}>{keys}</span>
      <span style={S.keyAction}>{action}</span>
    </div>
  );
}

const FONT = "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace";

const S: Record<string, CSSProperties> = {
  root: {
    position: "fixed",
    inset: 0,
    pointerEvents: "none",
    zIndex: 60,
    fontFamily: FONT,
    color: "#7bf7ff",
    letterSpacing: "0.08em",
    overflow: "hidden",
    transition: "opacity 240ms ease-out, transform 280ms ease-out",
  },

  scanGlow: {
    position: "absolute",
    inset: 0,
    background: "radial-gradient(circle at 50% 50%, rgba(90,220,255,0.04), rgba(4,12,20,0) 38%), linear-gradient(180deg, rgba(70,220,255,0.01), rgba(0,0,0,0) 20%, rgba(0,0,0,0) 80%, rgba(70,220,255,0.02))",
  },

  reticleWrap: {
    position: "absolute",
    bottom: 62,
    left: "50%",
    transform: "translateX(-50%)",
    opacity: 0.56,
    pointerEvents: "none",
  },

  svg: {
    overflow: "visible",
    filter: "drop-shadow(0 0 5px rgba(80,220,245,0.07))",
  },

  bottomDock: {
    position: "absolute",
    bottom: 14,
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    alignItems: "flex-end",
    gap: 8,
    padding: "0 10px",
  },

  modeStack: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },

  statusItem: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    minWidth: 84,
    justifyContent: "space-between",
    padding: "4px 7px 5px",
    background: "rgba(4,13,20,0.56)",
    border: "1px solid rgba(123,247,255,0.10)",
  },

  statusItemSubtle: {
    background: "rgba(4,13,20,0.42)",
    border: "1px solid rgba(123,247,255,0.06)",
  },

  statusLbl: {
    fontSize: 7,
    fontWeight: 700,
    color: "#6a9faf",
    letterSpacing: "0.12em",
  },

  statusVal: {
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: "0.12em",
  },

  thrustModule: {
    display: "flex",
    flexDirection: "column",
    gap: 5,
    minWidth: 88,
    padding: "4px 7px 5px",
    background: "rgba(4,13,20,0.56)",
    border: "1px solid rgba(123,247,255,0.10)",
  },

  thrustLbl: {
    fontSize: 7,
    fontWeight: 700,
    color: "#6a9faf",
    letterSpacing: "0.12em",
  },

  thrustHead: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
  },

  thrustVal: {
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: "0.10em",
    textAlign: "right" as const,
  },

  thrustTrack: {
    width: 74,
    height: 4,
    background: "rgba(123,247,255,0.07)",
    border: "1px solid rgba(123,247,255,0.10)",
    overflow: "hidden",
    flexShrink: 0,
  },

  thrustFill: {
    height: "100%",
    transition: "width 80ms linear, background 80ms linear",
    boxShadow: "0 0 6px currentColor",
  },

  autoFlightChip: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    minWidth: 108,
    padding: "4px 7px 5px",
    background: "rgba(8,22,28,0.42)",
    border: "1px solid rgba(123,247,255,0.08)",
  },

  autoFlightLabel: {
    fontSize: 7,
    fontWeight: 700,
    color: "rgba(214,249,255,0.68)",
    letterSpacing: "0.16em",
  },

  autoFlightTrack: {
    width: 46,
    height: 3,
    background: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    flexShrink: 0,
  },

  autoFlightFill: {
    height: "100%",
    background: "rgba(123,247,255,0.58)",
    transition: "width 180ms ease-out",
    boxShadow: "0 0 5px rgba(123,247,255,0.2)",
  },

  autoFlightValue: {
    width: 30,
    fontSize: 8,
    color: "rgba(214,249,255,0.6)",
    textAlign: "right" as const,
  },

  keyHints: {
    position: "absolute",
    left: 24,
    bottom: 14,
    display: "flex",
    flexDirection: "column",
    gap: 3,
    padding: "9px 11px",
    width: 176,
    background: "linear-gradient(180deg, rgba(5,17,24,0.38), rgba(4,12,18,0.16))",
    border: "1px solid #7bf7ff14",
    clipPath: "polygon(0 0, 100% 0, calc(100% - 12px) 100%, 0 100%)",
    pointerEvents: "auto",
  },
  keyHintsTitle: {
    fontSize: 8,
    fontWeight: 700,
    color: "#d9fbffb8",
    letterSpacing: "0.08em",
  },
  keyHintsHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  closeButton: {
    pointerEvents: "auto",
    border: "none",
    background: "transparent",
    color: "#7bf7ff77",
    fontFamily: FONT,
    fontSize: 11,
    lineHeight: 1,
    cursor: "pointer",
    padding: "1px 0 0",
  },
  keyRow: {
    display: "flex",
    alignItems: "center",
    gap: 7,
  },
  keyBadge: {
    fontSize: 8,
    fontWeight: 700,
    color: "#d9fbff",
    minWidth: 54,
    textAlign: "right" as const,
    letterSpacing: "0.04em",
  },
  keyAction: {
    fontSize: 8,
    color: "#7bf7ff66",
    fontWeight: 500,
  },
  keySep: {
    height: 1,
    background: "#7bf7ff12",
    margin: "3px 0",
  },
};
