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

export default function FlyHud({ freelookRef, visible }: FlyHudProps) {
  const [t, setT] = useState<FlyTelemetry | null>(null);
  const [showKeyHints, setShowKeyHints] = useState(true);
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

  const displayRoll = -t.roll;
  const rollDeg = displayRoll * DEG;
  const thrustPct = clamp(t.thrust * 100, 0, 100);
  const thrustColor = t.thrust > 0.01 ? "#7bf7ff" : "#2b4a59";
  const thrustArc = `${clamp(thrustPct, 0, 100) * 1.26}, 999`;
  const controlTone = t.fineControl ? "#ffd36e" : "#7bf7ff";
  const rcsTone = t.rcsEnabled ? "#9dffbd" : "#3b5562";
  const driftX = clamp(Math.sin(displayRoll) * 20, -20, 20);
  const driftY = clamp(-(t.pitch * DEG) * 0.9, -18, 18);
  const holoPulse = 0.55 + Math.sin(performance.now() * 0.0022) * 0.12;
  const holoSweepOffset = Math.sin(performance.now() * 0.0013) * 5;
  const layerShiftX = clamp(Math.sin(displayRoll) * 6, -6, 6);
  const layerShiftY = clamp(t.pitch * 12, -5, 5);
  const layerTilt = clamp(rollDeg * 0.12, -8, 8);

  return (
    <div style={{ ...S.root, opacity: entered ? 1 : 0, transform: entered ? "translateY(0)" : "translateY(10px)" }}>
      <style>{`@keyframes hudFlash { 0% { box-shadow: 0 0 0 1px rgba(200,255,255,0.7), 0 0 12px rgba(123,247,255,0.5); } 100% { box-shadow: none; } }`}</style>
      <div style={S.scanGlow} />

      <div style={S.modeStack}>
        <ModeBadge label="CTRL" value={t.fineControl ? "FINE" : "NORMAL"} tone={controlTone} flash={ctrlFlash} />
        <ModeBadge label="RCS" value={t.rcsEnabled ? "ON" : "OFF"} tone={rcsTone} flash={rcsFlash} />
      </div>

      <div style={S.rightPanel}>
        <div style={S.thrustReadout}>{fmt(thrustPct, 0)}%</div>
        <VerticalMeter pct={thrustPct} color={thrustColor} />
      </div>

      <div style={S.centerShell}>
        <svg width="208" height="208" viewBox="-104 -104 208 208" style={S.svg}>
          <defs>
            <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#7bf7ff" stopOpacity="0.18" />
              <stop offset="55%" stopColor="#39bfd7" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#39bfd7" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="holoSweep" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#c7feff" stopOpacity="0.18" />
              <stop offset="50%" stopColor="#7bf7ff" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#7bf7ff" stopOpacity="0" />
            </linearGradient>
          </defs>

          <g transform={`translate(${layerShiftX}, ${layerShiftY}) rotate(${layerTilt})`}>
            <ellipse cx="0" cy="10" rx="74" ry="26" fill="url(#coreGlow)" opacity={holoPulse} />
            <ellipse cx="0" cy="10" rx="60" ry="18" fill="none" stroke="url(#holoSweep)" strokeWidth="1" opacity={0.55 + holoPulse * 0.2} />
            <ellipse cx={holoSweepOffset} cy="10" rx="70" ry="22" fill="none" stroke="#7bf7ff18" strokeWidth="1" />
            <ellipse cx={-holoSweepOffset * 0.7} cy="10" rx="48" ry="13" fill="none" stroke="#7bf7ff20" strokeWidth="1" strokeDasharray="5 9" />
          </g>

          <circle
            cx="0"
            cy="10"
            r="44"
            fill="none"
            stroke="#7bf7ff"
            strokeWidth="1.4"
            strokeDasharray={thrustArc}
            strokeLinecap="round"
            transform="rotate(-90)"
            opacity="0.48"
          />

          <g opacity="0.14">
            <line x1="-80" y1="10" x2="-30" y2="10" stroke="#7bf7ff" strokeWidth="1" />
            <line x1="30" y1="10" x2="80" y2="10" stroke="#7bf7ff" strokeWidth="1" />
          </g>

          <g transform={`translate(${driftX}, ${driftY + 10}) rotate(${rollDeg})`}>
            <ellipse cx="0" cy="0" rx="28" ry="10" fill="none" stroke="#aef8ff26" strokeWidth="0.8" />
            <path d="M -38 0 L -12 0 M 12 0 L 38 0" stroke="#7bf7ff" strokeWidth="1.1" strokeLinecap="round" />
            <path d="M 0 -15 L 0 -5 M 0 5 L 0 15" stroke="#7bf7ff2f" strokeWidth="0.9" strokeLinecap="round" />
            <polygon points="0,-10 8,0 0,10 -8,0" fill="none" stroke="#d4fbff" strokeWidth="1.2" />
            <circle cx="0" cy="0" r="2.5" fill="#b8fbff" opacity="0.84" />
          </g>

          <g opacity="0.28">
            <path d="M -58 4 L -72 10 L -58 16" fill="none" stroke="#7bf7ff" strokeWidth="0.9" />
            <path d="M 58 4 L 72 10 L 58 16" fill="none" stroke="#7bf7ff" strokeWidth="0.9" />
          </g>

          <text x="0" y="72" textAnchor="middle" fill="#d7fdff" fontSize="10" letterSpacing="4">{fmt(thrustPct, 0)}%</text>
        </svg>
      </div>

      {showKeyHints && (
        <div style={S.keyHints}>
          <div style={S.keyHintsHeader}>
            <div style={S.keyHintsTitle}>INPUT</div>
            <button type="button" onClick={() => setShowKeyHints(false)} style={S.closeButton} aria-label="Hide key hints">
              x
            </button>
          </div>
          <KeyHint keys="W / S" action="Pitch" />
          <KeyHint keys="A / D" action="Yaw" />
          <KeyHint keys="Q / E" action="Roll left / right" />
          <KeyHint keys="CAPS" action="Fine control" />
          <KeyHint keys="R" action="Toggle RCS" />
          <div style={S.keySeparator} />
          <KeyHint keys="SHIFT" action="Throttle up" />
          <KeyHint keys="CTRL" action="Throttle down" />
          <KeyHint keys="Z / X" action="Full / cut" />
          <div style={S.keySeparator} />
          <KeyHint keys="H / N" action="RCS forward / back" />
          <KeyHint keys="J / L" action="RCS left / right" />
          <KeyHint keys="I / K" action="RCS down / up" />
          <div style={S.keySeparator} />
          <KeyHint keys="DRAG" action="View vector" />
        </div>
      )}

    </div>
  );
}

function VerticalMeter({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={S.meterWrap}>
      <div style={S.meterTrack}>
        <div style={{ ...S.meterFill, height: `${Math.min(Math.max(pct, 0), 100)}%`, background: color }} />
      </div>
      <div style={S.meterTicks}>
        <span style={S.tickLabel}>100</span>
        <span style={S.tickLabel}>050</span>
        <span style={S.tickLabel}>000</span>
      </div>
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

function ModeBadge({ label, value, tone, flash }: { label: string; value: string; tone: string; flash?: boolean }) {
  return (
    <div style={{ ...S.modeBadgeWrap, animation: flash ? "hudFlash 380ms ease-out forwards" : undefined }}>
      <span style={S.modeBadgeLabel}>{label}</span>
      <span style={{ ...S.modeBadgeValue, color: tone, borderColor: `${tone}33`, background: `${tone}14` }}>{value}</span>
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
    background: "radial-gradient(circle at 50% 72%, rgba(90, 220, 255, 0.05), rgba(4, 12, 20, 0) 34%), linear-gradient(180deg, rgba(70, 220, 255, 0.015), rgba(0, 0, 0, 0) 24%, rgba(0, 0, 0, 0) 82%, rgba(70, 220, 255, 0.025))",
  },

  modeStack: {
    position: "absolute",
    left: 24,
    top: 18,
    display: "flex",
    gap: 8,
    alignItems: "center",
  },
  modeBadgeWrap: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 8px",
    background: "linear-gradient(180deg, rgba(5, 17, 24, 0.42), rgba(4, 12, 18, 0.18))",
    border: "1px solid rgba(123, 247, 255, 0.10)",
    borderRadius: 999,
  },
  modeBadgeLabel: {
    fontSize: 8,
    fontWeight: 700,
    color: "#8ebfcb",
    letterSpacing: "0.12em",
  },
  modeBadgeValue: {
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: "0.12em",
    padding: "3px 6px",
    border: "1px solid transparent",
    borderRadius: 999,
  },

  rightPanel: {
    position: "absolute",
    left: "calc(50% + 78px)",
    top: "86.5%",
    transform: "translateY(-50%)",
    width: 68,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    alignItems: "center",
    padding: "2px 0",
  },

  thrustReadout: {
    fontSize: 10,
    fontWeight: 700,
    color: "#d9fbff",
    textShadow: "0 0 6px #7bf7ff12",
  },

  meterWrap: {
    display: "flex",
    alignItems: "stretch",
    gap: 6,
    marginTop: 2,
  },
  meterTrack: {
    position: "relative",
    width: 8,
    height: 64,
    border: "none",
    background: "linear-gradient(180deg, rgba(123, 247, 255, 0.08), rgba(123, 247, 255, 0.01))",
    overflow: "hidden",
    borderRadius: 999,
  },
  meterFill: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    boxShadow: "0 0 14px currentColor",
    transition: "height 80ms linear, background 80ms linear",
  },
  meterTicks: {
    height: 64,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    padding: "1px 0",
  },
  tickLabel: {
    fontSize: 7,
    color: "#7bf7ff4a",
  },

  centerShell: {
    position: "absolute",
    left: "50%",
    top: "87%",
    transform: "translate(-50%, -50%)",
    opacity: 0.62,
  },
  svg: {
    overflow: "visible",
    filter: "drop-shadow(0 0 6px rgba(80, 220, 245, 0.06))",
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
    background: "linear-gradient(180deg, rgba(5, 17, 24, 0.38), rgba(4, 12, 18, 0.16))",
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
    fontSize: 10,
    lineHeight: 1,
    cursor: "pointer",
    padding: "2px 0 0",
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
    textAlign: "right",
    letterSpacing: "0.04em",
  },
  keyAction: {
    fontSize: 8,
    color: "#7bf7ff66",
    fontWeight: 500,
  },
  keySeparator: {
    height: 1,
    background: "#7bf7ff12",
    margin: "3px 0",
  },
};
