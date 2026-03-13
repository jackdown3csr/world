"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { useOnboarding } from "@/hooks/useOnboarding";

export interface OnboardingStep {
  title: string;
  body: string;
  /** Scene star/object ID to focus the camera on, or null for overview */
  cameraTarget: string | null;
}

interface OnboardingHighlight {
  label: string;
  left?: string;
  right?: string;
  top?: string;
  bottom?: string;
  width: string;
  height: string;
  labelPosition?: "top" | "bottom";
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    title: "Welcome to Sector Galactica",
    body: "A live 3D map of the Galactica ecosystem. Every star system represents a protocol contract. Every planet is a wallet.",
    cameraTarget: null,
  },
  {
    title: "vEscrow System",
    body: "GNET locked in vEscrow becomes voting power (VE). Each planet represents a wallet holding an active lock.",
    cameraTarget: "__star_vescrow__",
  },
  {
    title: "Vesting System",
    body: "This system tracks vesting wallets and their GNET allocations. Each planet represents a wallet with entitled and claimed rewards.",
    cameraTarget: "__star_vesting__",
  },
  {
    title: "gUBI Pool",
    body: "Burn gUBI tokens at the Index Pool to redeem the underlying assets held in the pool, including wGNET and ARCHAI.",
    cameraTarget: "__star_gubi_pool__",
  },
  {
    title: "Live Traffic",
    body: "The Traffic panel lists recent on-chain activity across the ecosystem. Click any item to replay that transaction in the scene.",
    cameraTarget: null,
  },
  {
    title: "Navigation & Modes",
    body: "Use the toolbar to move between systems, toggle labels and orbits, enter Fly mode, or capture the scene in Photo mode.",
    cameraTarget: null,
  },
  {
    title: "Connect Your Wallet",
    body: "Connect a wallet to find your address across the scene, highlight your positions in each system, and give your wallet a custom name.",
    cameraTarget: null,
  },
];

function getStepHighlight(step: number, isMobile: boolean): OnboardingHighlight | null {
  if (isMobile) {
    switch (step) {
      case 1:
      case 2:
      case 3:
        return {
          label: "system switcher",
          left: "10px",
          top: "6px",
          width: "244px",
          height: "28px",
          labelPosition: "bottom",
        };
      case 4:
        return {
          label: "traffic panel",
          left: "8px",
          top: "78px",
          width: "calc(100vw - 16px)",
          height: "240px",
          labelPosition: "bottom",
        };
      case 5:
        return {
          label: "toolbar",
          left: "8px",
          bottom: "8px",
          width: "calc(100vw - 16px)",
          height: "52px",
          labelPosition: "top",
        };
      case 6:
        return {
          label: "wallet tools",
          right: "8px",
          top: "6px",
          width: "190px",
          height: "28px",
          labelPosition: "bottom",
        };
      default:
        return null;
    }
  }

  switch (step) {
    case 1:
    case 2:
    case 3:
      return {
        label: "system switcher",
        left: "8px",
        top: "4px",
        width: "332px",
        height: "30px",
        labelPosition: "bottom",
      };
    case 4:
      return {
        label: "traffic panel",
        left: "8px",
        top: "38px",
        width: "352px",
        height: "322px",
        labelPosition: "bottom",
      };
    case 5:
      return {
        label: "toolbar",
        left: "6px",
        top: "2px",
        width: "calc(100vw - 12px)",
        height: "34px",
        labelPosition: "bottom",
      };
    case 6:
      return {
        label: "wallet tools",
        right: "8px",
        top: "4px",
        width: "430px",
        height: "30px",
        labelPosition: "bottom",
      };
    default:
      return null;
  }
}

function OnboardingSpotlight({ highlight }: { highlight: OnboardingHighlight }) {
  const labelStyle: React.CSSProperties = {
    position: "absolute",
    left: 0,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 8px",
    borderRadius: 999,
    border: "1px solid rgba(120,220,255,0.22)",
    background: "rgba(4, 16, 26, 0.92)",
    color: "rgba(168,223,240,0.92)",
    fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
    boxShadow: "0 8px 18px rgba(0,0,0,0.28)",
  };

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 119 }}>
      <style>{`
        @keyframes sg-onboarding-spotlight-pulse {
          0%, 100% {
            box-shadow: 0 0 0 1px rgba(120,220,255,0.10), 0 0 18px rgba(0,229,255,0.12), inset 0 0 24px rgba(120,220,255,0.05);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 0 1px rgba(120,220,255,0.22), 0 0 26px rgba(0,229,255,0.22), inset 0 0 34px rgba(120,220,255,0.10);
            transform: scale(1.01);
          }
        }
        @keyframes sg-onboarding-scan {
          0% { transform: translateX(-115%); opacity: 0; }
          20% { opacity: 0.22; }
          80% { opacity: 0.22; }
          100% { transform: translateX(115%); opacity: 0; }
        }
      `}</style>
      <div
        style={{
          position: "absolute",
          left: highlight.left,
          right: highlight.right,
          top: highlight.top,
          bottom: highlight.bottom,
          width: highlight.width,
          height: highlight.height,
          borderRadius: 10,
          border: "1px solid rgba(120,220,255,0.24)",
          background: "linear-gradient(180deg, rgba(120,220,255,0.06), rgba(120,220,255,0.02))",
          animation: "sg-onboarding-spotlight-pulse 1.8s ease-in-out infinite",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 10,
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            width: 56,
            background: "linear-gradient(90deg, transparent, rgba(120,220,255,0.16), transparent)",
            animation: "sg-onboarding-scan 2.6s linear infinite",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 6,
            borderRadius: 7,
            border: "1px dashed rgba(120,220,255,0.18)",
          }}
        />
        <div
          style={{
            ...labelStyle,
            top: highlight.labelPosition === "bottom" ? `calc(100% + 8px)` : undefined,
            bottom: highlight.labelPosition === "top" ? `calc(100% + 8px)` : undefined,
          }}
        >
          {highlight.label}
        </div>
      </div>
    </div>
  );
}

interface Props {
  /** Called whenever the step changes with the desired camera target (or null for overview) */
  onCameraTarget: (id: string | null) => void;
  isMobile?: boolean;
}

export function OnboardingOverlay({ onCameraTarget, isMobile }: Props) {
  const { step, next, dismiss } = useOnboarding();
  const prevStep = useRef<number | null>(null);
  const highlight = useMemo(() => (step === null ? null : getStepHighlight(step, Boolean(isMobile))), [isMobile, step]);

  useEffect(() => {
    if (step === null || step === prevStep.current) return;
    prevStep.current = step;
    const s = ONBOARDING_STEPS[step];
    if (s) onCameraTarget(s.cameraTarget);
  }, [step, onCameraTarget]);

  if (step === null) return null;

  const current = ONBOARDING_STEPS[step];
  if (!current) return null;

  const isLast = step === ONBOARDING_STEPS.length - 1;
  const progress = step + 1;
  const total = ONBOARDING_STEPS.length;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 120,
        pointerEvents: "none",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: isMobile ? "center" : "flex-start",
      }}
    >
      {highlight ? <OnboardingSpotlight highlight={highlight} /> : null}
      <div
        style={{
          pointerEvents: "all",
          margin: isMobile ? "0 0 90px 0" : "0 0 40px 24px",
          width: isMobile ? "calc(100vw - 32px)" : 320,
          background: "rgba(4, 12, 20, 0.92)",
          border: "1px solid rgba(120, 220, 255, 0.18)",
          borderRadius: 6,
          backdropFilter: "blur(16px)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(120,220,255,0.06)",
          fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
          overflow: "hidden",
        }}
      >
        {/* Progress bar */}
        <div style={{ height: 2, background: "rgba(120,220,255,0.08)" }}>
          <div style={{
            height: "100%",
            width: `${(progress / total) * 100}%`,
            background: "rgba(120, 220, 255, 0.5)",
            transition: "width 0.35s ease",
          }} />
        </div>

        <div style={{ padding: "16px 18px 14px" }}>
          <div style={{ fontSize: 8, letterSpacing: "0.16em", color: "rgba(120,220,255,0.45)", textTransform: "uppercase", marginBottom: 8 }}>
            {progress} / {total}
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: "#d6edf7", textTransform: "uppercase", marginBottom: 8 }}>
            {current.title}
          </div>
          <div style={{ fontSize: 11, lineHeight: 1.65, color: "rgba(180,210,230,0.72)", marginBottom: 16 }}>
            {current.body}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <button
              onClick={dismiss}
              style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(120,180,200,0.4)", padding: 0 }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(120,220,255,0.7)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(120,180,200,0.4)")}
            >
              {isLast ? "Got it — don't show again" : "Skip — don't show again"}
            </button>

            {!isLast && (
              <button
                onClick={next}
                style={{ background: "rgba(120,220,255,0.1)", border: "1px solid rgba(120,220,255,0.28)", borderRadius: 4, cursor: "pointer", fontFamily: "inherit", fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#a8dff0", padding: "5px 12px" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(120,220,255,0.18)"; e.currentTarget.style.color = "#d6f4ff"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(120,220,255,0.1)"; e.currentTarget.style.color = "#a8dff0"; }}
              >
                Next →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

