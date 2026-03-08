import React from "react";
import type { BridgeSceneObject } from "@/lib/bridges";
import type { PanelSwapState } from "@/hooks/usePanelSwap";

interface BridgeInfoCardProps {
  activeMode: "bridge-overview" | "bridge-info";
  overviewPhase: "hidden" | "entering" | "visible" | "leaving";
  overviewVisible: boolean;
  overviewFadeMs: number;
  panelSwapMs: number;
  panelEase: string;
  panelAnimationState: PanelSwapState;
  bridge: BridgeSceneObject;
}

export default function BridgeInfoCard({
  activeMode,
  overviewPhase,
  overviewVisible,
  overviewFadeMs,
  panelSwapMs,
  panelEase,
  panelAnimationState,
  bridge,
}: BridgeInfoCardProps) {
  return (
    <div style={{
      background: "linear-gradient(180deg, rgba(3,8,16,0.96), rgba(2,6,14,0.92))",
      border: "1px solid rgba(255,255,255,0.08)",
      borderLeft: "2px solid rgba(126, 241, 255, 0.68)",
      borderRadius: 8,
      padding: "12px 14px 12px",
      boxShadow: activeMode === "bridge-overview" && !overviewVisible
        ? "0 8px 18px rgba(0,0,0,0.08)"
        : "0 16px 34px rgba(0,0,0,0.26)",
      backdropFilter: "blur(12px)",
      opacity: activeMode === "bridge-overview"
        ? (overviewPhase === "entering"
            ? 0.82
            : overviewVisible
              ? 1
              : 0)
        : 1,
      transform: activeMode === "bridge-overview"
        ? (overviewPhase === "entering"
            ? "translateY(10px) scale(0.986)"
            : overviewVisible
              ? "translateY(0px) scale(1)"
              : "translateY(26px) scale(0.966)")
        : "translateY(0) scale(1)",
      filter: activeMode === "bridge-overview"
        ? (overviewPhase === "entering"
            ? "blur(5px) saturate(0.88)"
            : overviewVisible
              ? "blur(0px) saturate(1)"
              : "blur(10px) saturate(0.72)")
        : "blur(0px) saturate(1)",
      transition: `opacity ${activeMode === "bridge-overview" ? overviewFadeMs : panelSwapMs}ms ${panelEase}, transform ${activeMode === "bridge-overview" ? overviewFadeMs : panelSwapMs}ms ${panelEase}, filter ${activeMode === "bridge-overview" ? overviewFadeMs : panelSwapMs}ms ${panelEase}, box-shadow ${activeMode === "bridge-overview" ? overviewFadeMs : panelSwapMs}ms ${panelEase}`,
      willChange: "opacity, transform, filter",
      pointerEvents: activeMode === "bridge-overview" && !overviewVisible ? "none" : undefined,
    }}>
      <div style={{
        opacity: panelAnimationState === "fading-out" ? 0 : 1,
        transform: panelAnimationState === "fading-out"
          ? "translateY(12px) scale(0.978)"
          : panelAnimationState === "fading-in"
            ? "translateY(-4px) scale(1.012)"
            : "translateY(0) scale(1)",
        filter: panelAnimationState === "fading-out"
          ? "blur(5px) saturate(0.88)"
          : "blur(0px) saturate(1)",
        transition: `opacity ${panelSwapMs}ms ${panelEase}, transform ${panelSwapMs}ms ${panelEase}, filter ${panelSwapMs}ms ${panelEase}`,
        willChange: "opacity, transform, filter",
      }}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ color: "#7ef1ff", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 4 }}>
            galactica
          </div>
          <div style={{ color: "#e5f4ff", fontSize: 19, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>
            {bridge.label}
          </div>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "10px 14px",
          marginBottom: 10,
        }}>
          {bridge.stats.cardMetrics.map((row, index) => (
            <div key={row.label}>
              <div style={{ color: "#5f7788", fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 3 }}>
                {row.label}
              </div>
              <div style={{ color: row.accent ?? "#d4e7f2", fontSize: index < 2 ? 18 : 13, fontWeight: index < 2 ? 700 : 600, lineHeight: 1.15 }}>
                {row.value}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {bridge.stats.contextChips.map((chip) => (
            <div key={`${chip.label}-${chip.value}`} style={contextChipStyle}>
              <span style={contextChipLabelStyle}>{chip.label}</span>
              <span style={contextChipValueStyle}>{chip.value}</span>
            </div>
          ))}
        </div>

        <div style={{ height: 1, background: "rgba(255,255,255,0.06)", marginBottom: 10 }} />
        <div style={{ color: "#6d8798", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
          context
        </div>
        <div style={{ fontSize: 11, color: "#89a1b4", lineHeight: 1.55, marginBottom: 8 }}>
          <div>{bridge.description}</div>
          <div>{bridge.stats.historySummary}</div>
        </div>
      </div>
    </div>
  );
}

const contextChipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 8px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 999,
};

const contextChipLabelStyle: React.CSSProperties = {
  color: "#5d7788",
  fontSize: 8,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
};

const contextChipValueStyle: React.CSSProperties = {
  color: "#d9ecf6",
  fontSize: 10,
};
