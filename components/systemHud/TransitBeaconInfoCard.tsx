import React from "react";
import type { PanelSwapState } from "@/hooks/usePanelSwap";
import type { TrafficPanelItem } from "@/components/TrafficPanel";
import type { TransitBeaconSceneObject } from "@/lib/transitBeacon";

interface TransitBeaconInfoCardProps {
  activeMode: "transit-beacon-overview" | "transit-beacon-info";
  overviewPhase: "hidden" | "entering" | "visible" | "leaving";
  overviewVisible: boolean;
  overviewFadeMs: number;
  panelSwapMs: number;
  panelEase: string;
  panelAnimationState: PanelSwapState;
  beacon: TransitBeaconSceneObject;
  trafficItems: TrafficPanelItem[];
  rxLed: boolean;
  ecoLed: boolean;
}

export default function TransitBeaconInfoCard({
  activeMode,
  overviewPhase,
  overviewVisible,
  overviewFadeMs,
  panelSwapMs,
  panelEase,
  panelAnimationState,
  beacon,
  trafficItems,
  rxLed,
  ecoLed,
}: TransitBeaconInfoCardProps) {
  const relayState = rxLed ? "active" : ecoLed ? "routing" : "standby";
  const relayColor = rxLed ? "#7ef1ff" : ecoLed ? "#ffc978" : "#9aaec1";
  const trafficCount = trafficItems.length;
  const coords = beacon.position.map((value) => Math.round(value)).join(" / ");

  return (
    <div style={cardStyle(activeMode, overviewPhase, overviewVisible, overviewFadeMs, panelSwapMs, panelEase)}>
      <div style={contentStyle(panelAnimationState, panelSwapMs, panelEase)}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ color: "#7ef1ff", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 4 }}>
            galactica
          </div>
          <div style={{ color: "#e5f4ff", fontSize: 19, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>
            {beacon.label}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 14px", marginBottom: 10 }}>
          <Metric label="state" value={relayState} accent={relayColor} large />
          <Metric label="traffic" value={String(trafficCount)} large />
          <Metric label="relay" value={beacon.hint ?? "edge relay"} />
          <Metric label="radius" value={`${Math.round(beacon.bodyRadius)} wu`} />
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: activeMode === "transit-beacon-info" ? 10 : 0 }}>
          <Chip label="coords" value={coords} />
          <Chip label="rx" value={rxLed ? "live" : "idle"} />
          <Chip label="eco" value={ecoLed ? "live" : "quiet"} />
          <Chip label="role" value="relay" />
        </div>

        {activeMode === "transit-beacon-info" && (
          <>
            <div style={{ height: 1, background: "rgba(255,255,255,0.06)", marginBottom: 10 }} />
            <div style={{ color: "#6d8798", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
              context
            </div>
            <div style={{ fontSize: 11, color: "#89a1b4", lineHeight: 1.55 }}>
              <div>Relay node for traffic whose counterparty is not mapped anywhere in this sector.</div>
              <div>Cross-chain and off-map routes stage here before resolving to a wallet, bridge, or system.</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, accent, large = false }: { label: string; value: string; accent?: string; large?: boolean }) {
  return (
    <div>
      <div style={{ color: "#5f7788", fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ color: accent ?? "#d4e7f2", fontSize: large ? 18 : 13, fontWeight: large ? 700 : 600, lineHeight: 1.15, textTransform: large ? "uppercase" : undefined }}>
        {value}
      </div>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div style={chipStyle}>
      <span style={chipLabelStyle}>{label}</span>
      <span style={chipValueStyle}>{value}</span>
    </div>
  );
}

function cardStyle(
  activeMode: "transit-beacon-overview" | "transit-beacon-info",
  overviewPhase: "hidden" | "entering" | "visible" | "leaving",
  overviewVisible: boolean,
  overviewFadeMs: number,
  panelSwapMs: number,
  panelEase: string,
): React.CSSProperties {
  return {
    background: "linear-gradient(180deg, rgba(3,8,16,0.96), rgba(2,6,14,0.92))",
    border: "1px solid rgba(255,255,255,0.08)",
    borderLeft: "2px solid rgba(126, 241, 255, 0.68)",
    borderRadius: 8,
    padding: "12px 14px 12px",
    boxShadow: activeMode === "transit-beacon-overview" && !overviewVisible
      ? "0 8px 18px rgba(0,0,0,0.08)"
      : "0 16px 34px rgba(0,0,0,0.26)",
    backdropFilter: "blur(12px)",
    opacity: activeMode === "transit-beacon-overview"
      ? (overviewPhase === "entering" ? 0.82 : overviewVisible ? 1 : 0)
      : 1,
    transform: activeMode === "transit-beacon-overview"
      ? (overviewPhase === "entering"
          ? "translateY(10px) scale(0.986)"
          : overviewVisible
            ? "translateY(0px) scale(1)"
            : "translateY(26px) scale(0.966)")
      : "translateY(0) scale(1)",
    filter: activeMode === "transit-beacon-overview"
      ? (overviewPhase === "entering"
          ? "blur(5px) saturate(0.88)"
          : overviewVisible
            ? "blur(0px) saturate(1)"
            : "blur(10px) saturate(0.72)")
      : "blur(0px) saturate(1)",
    transition: `opacity ${activeMode === "transit-beacon-overview" ? overviewFadeMs : panelSwapMs}ms ${panelEase}, transform ${activeMode === "transit-beacon-overview" ? overviewFadeMs : panelSwapMs}ms ${panelEase}, filter ${activeMode === "transit-beacon-overview" ? overviewFadeMs : panelSwapMs}ms ${panelEase}, box-shadow ${activeMode === "transit-beacon-overview" ? overviewFadeMs : panelSwapMs}ms ${panelEase}, border-color ${panelSwapMs}ms ${panelEase}`,
    willChange: "opacity, transform, filter",
    pointerEvents: activeMode === "transit-beacon-overview" && !overviewVisible ? "none" : undefined,
  };
}

function contentStyle(panelAnimationState: PanelSwapState, panelSwapMs: number, panelEase: string): React.CSSProperties {
  return {
    opacity: panelAnimationState === "fading-out" ? 0 : 1,
    transform: panelAnimationState === "fading-out"
      ? "translateY(12px) scale(0.978)"
      : panelAnimationState === "fading-in"
        ? "translateY(-4px) scale(1.012)"
        : "translateY(0) scale(1)",
    filter: panelAnimationState === "fading-out" ? "blur(5px) saturate(0.88)" : "blur(0px) saturate(1)",
    transition: `opacity ${panelSwapMs}ms ${panelEase}, transform ${panelSwapMs}ms ${panelEase}, filter ${panelSwapMs}ms ${panelEase}`,
    willChange: "opacity, transform, filter",
  };
}

const chipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 8px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 999,
};

const chipLabelStyle: React.CSSProperties = {
  color: "#5d7788",
  fontSize: 8,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
};

const chipValueStyle: React.CSSProperties = {
  color: "#d9ecf6",
  fontSize: 10,
};