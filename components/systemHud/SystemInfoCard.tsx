import React from "react";
import type { BlockInfo } from "@/hooks/useBlock";
import type { SceneSystemDefinition } from "@/lib/sceneSystems";
import type { PanelSwapState } from "@/hooks/usePanelSwap";

interface SystemInfoCardProps {
  activeMode: "overview" | "info";
  overviewPhase: "hidden" | "entering" | "visible" | "leaving";
  overviewVisible: boolean;
  overviewFadeMs: number;
  panelSwapMs: number;
  panelEase: string;
  panelAnimationState: PanelSwapState;
  system: SceneSystemDefinition | null;
  blockInfo: BlockInfo | null;
}

export default function SystemInfoCard({
  activeMode,
  overviewPhase,
  overviewVisible,
  overviewFadeMs,
  panelSwapMs,
  panelEase,
  panelAnimationState,
  system,
  blockInfo,
}: SystemInfoCardProps) {
  return (
    <div style={{
      background: "linear-gradient(180deg, rgba(3,8,16,0.96), rgba(2,6,14,0.92))",
      border: "1px solid rgba(255,255,255,0.08)",
      borderLeft: `2px solid ${system?.accent ?? "rgba(0,229,255,0.35)"}`,
      borderRadius: 8,
      padding: "12px 14px 12px",
      boxShadow: activeMode === "overview" && !overviewVisible
        ? "0 8px 18px rgba(0,0,0,0.08)"
        : "0 16px 34px rgba(0,0,0,0.26)",
      backdropFilter: "blur(12px)",
      opacity: activeMode === "overview"
        ? (overviewPhase === "entering"
            ? 0.82
            : overviewVisible
              ? 1
              : 0)
        : 1,
      transform: activeMode === "overview"
        ? (overviewPhase === "entering"
            ? "translateY(10px) scale(0.986)"
            : overviewVisible
              ? "translateY(0px) scale(1)"
              : "translateY(26px) scale(0.966)")
        : "translateY(0) scale(1)",
      filter: activeMode === "overview"
        ? (overviewPhase === "entering"
            ? "blur(5px) saturate(0.88)"
            : overviewVisible
              ? "blur(0px) saturate(1)"
              : "blur(10px) saturate(0.72)")
        : "blur(0px) saturate(1)",
      transition: `opacity ${activeMode === "overview" ? overviewFadeMs : panelSwapMs}ms ${panelEase}, transform ${activeMode === "overview" ? overviewFadeMs : panelSwapMs}ms ${panelEase}, filter ${activeMode === "overview" ? overviewFadeMs : panelSwapMs}ms ${panelEase}, box-shadow ${activeMode === "overview" ? overviewFadeMs : panelSwapMs}ms ${panelEase}, border-color ${panelSwapMs}ms ${panelEase}`,
      willChange: "opacity, transform, filter",
      pointerEvents: activeMode === "overview" && !overviewVisible ? "none" : undefined,
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
          <div style={{ color: system?.accent ?? "#7ae4f2", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 4 }}>
            galactica
          </div>
          <div style={{ color: "#e5f4ff", fontSize: 19, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>
            {system?.label ?? "System"}
          </div>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "10px 14px",
          marginBottom: 10,
        }}>
          {system?.summaryRows.map((row, index) => (
            <div key={row.label} style={{ gridColumn: index === 0 && (system.summaryRows.length % 2 === 1) ? "1 / -1" : undefined }}>
              <div style={{ color: "#5f7788", fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 3 }}>
                {row.label}
              </div>
              <div style={{ color: row.accent ?? "#d4e7f2", fontSize: index === 0 ? 18 : 13, fontWeight: index === 0 ? 700 : 600, lineHeight: 1.15 }}>
                {row.value}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: activeMode === "info" ? 10 : 0 }}>
          {blockInfo && system?.id !== "gubi-pool" && (
            <div style={contextChipStyle}>
              <span style={contextChipLabelStyle}>blk</span>
              <span style={contextChipValueStyle}>{blockInfo.blockNumber.toLocaleString()}</span>
            </div>
          )}
          {system?.updatedAt ? (
            <div style={contextChipStyle}>
              <span style={contextChipLabelStyle}>updated</span>
              <span style={contextChipValueStyle}>{new Date(system.updatedAt).toLocaleTimeString()}</span>
            </div>
          ) : null}
        </div>

        {activeMode === "info" && (
          <>
            <div style={{ height: 1, background: "rgba(255,255,255,0.06)", marginBottom: 10 }} />
            <div style={{ color: "#6d8798", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
              context
            </div>
            <div style={{ fontSize: 11, color: "#89a1b4", lineHeight: 1.55, marginBottom: 8 }}>
              {system?.descriptionLines.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
          </>
        )}
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
