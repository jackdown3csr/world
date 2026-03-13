"use client";

import React from "react";
import { buildSceneListPanelStyle } from "./systemHud/SceneListPanel";

export interface TrafficPanelItem {
  id: string;
  txHash: string;
  label: string;
  systemChip?: string | null;
  fromLabel: string;
  toLabel: string;
  amount?: string | null;
  blockNumber: number;
  ecosystem: boolean;
  selectableAddress?: string | null;
}

const VISIBLE_DEFAULT = 5;

interface TrafficPanelProps {
  items: TrafficPanelItem[];
  attached?: boolean;
  collapsed?: boolean;
  rxLed?: boolean;
  ecoLed?: boolean;
  onReplay?: (eventId: string) => void;
  onToggleCollapsed?: () => void;
}

function rowStyle(clickable: boolean): React.CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: 4,
    width: "100%",
    padding: "8px 10px",
    border: "none",
    borderBottom: "1px solid rgba(255,255,255,0.03)",
    background: "transparent",
    textAlign: "left",
    fontFamily: "inherit",
    cursor: clickable ? "pointer" : "default",
  };
}

function chipStyle(label: string): React.CSSProperties {
  const upper = label.toUpperCase();
  let border = "rgba(114,160,184,0.32)";
  let background = "rgba(114,160,184,0.08)";
  let color = "#8eb5c8";

  if (upper.includes("BRIDGE")) {
    border = "rgba(120, 238, 255, 0.34)";
    background = "rgba(64, 238, 255, 0.12)";
    color = "#87f4ff";
  } else if (upper === "BURN") {
    border = "rgba(255, 100, 80, 0.4)";
    background = "rgba(255, 80, 60, 0.14)";
    color = "#ff7a6a";
  } else if (upper.includes("BEACON")) {
    border = "rgba(255, 210, 120, 0.3)";
    background = "rgba(255, 210, 120, 0.1)";
    color = "#ffd68f";
  } else if (upper === "FAUCET") {
    border = "rgba(255, 200, 96, 0.3)";
    background = "rgba(255, 200, 96, 0.1)";
    color = "#ffd98f";
  } else if (upper.includes("GUBI")) {
    border = "rgba(120, 255, 190, 0.34)";
    background = "rgba(120, 255, 190, 0.12)";
    color = "#7fffc0";
  } else if (upper.includes("WGNET")) {
    border = "rgba(255, 200, 96, 0.34)";
    background = "rgba(255, 200, 96, 0.12)";
    color = "#ffd980";
  } else if (upper.includes("VEST")) {
    border = "rgba(255, 164, 120, 0.3)";
    background = "rgba(255, 164, 120, 0.1)";
    color = "#ffc39d";
  } else if (upper.includes("UNSTAKE")) {
    border = "rgba(255, 140, 80, 0.3)";
    background = "rgba(255, 140, 80, 0.1)";
    color = "#ffb06a";
  } else if (upper.includes("VE")) {
    border = "rgba(255, 200, 96, 0.3)";
    background = "rgba(255, 200, 96, 0.1)";
    color = "#ffd98f";
  }

  return {
    display: "inline-flex",
    alignItems: "center",
    height: 16,
    padding: "0 6px",
    borderRadius: 999,
    border: `1px solid ${border}`,
    background,
    color,
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    flexShrink: 0,
  };
}

function ledStyle(active: boolean, color: string, glow: string): React.CSSProperties {
  return {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: active ? color : "rgba(100, 129, 145, 0.4)",
    boxShadow: active ? `0 0 8px ${glow}` : "0 0 4px rgba(88, 112, 126, 0.2)",
    transition: "all 0.18s ease",
  };
}

function headerButtonStyle(): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 18,
    height: 18,
    padding: "0 4px",
    borderRadius: 4,
    border: "1px solid rgba(0,229,255,0.12)",
    background: "rgba(255,255,255,0.03)",
    color: "#88b2c6",
    fontSize: 10,
    lineHeight: 1,
    cursor: "pointer",
    fontFamily: "inherit",
  };
}

export default function TrafficPanel({
  items,
  attached = false,
  collapsed = false,
  rxLed = false,
  ecoLed = false,
  onReplay,
  onToggleCollapsed,
}: TrafficPanelProps) {
  const [showAll, setShowAll] = React.useState(false);
  const visibleItems = showAll ? items : items.slice(0, VISIBLE_DEFAULT);
  const hiddenCount = items.length - VISIBLE_DEFAULT;
  const containerStyle = buildSceneListPanelStyle(attached);

  return (
    <div style={{
      ...containerStyle,
      overflowY: collapsed ? "hidden" : containerStyle.overflowY,
      width: collapsed ? 64 : undefined,
      transition: "width 0.2s ease, box-shadow 0.2s ease",
    }}>
      <div style={{
        padding: collapsed ? "8px 6px 6px" : "8px 10px 4px",
        color: "#5a7a90",
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: "0.15em",
        textTransform: "uppercase",
        borderBottom: "1px solid rgba(0,229,255,0.04)",
        display: "flex",
        flexDirection: collapsed ? "column" : "row",
        alignItems: collapsed ? "center" : "center",
        justifyContent: "space-between",
        gap: collapsed ? 6 : 8,
      }}>
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: collapsed ? 5 : 2,
          minWidth: 0,
          alignItems: collapsed ? "center" : "flex-start",
        }}>
          {collapsed ? (
            <>
              <span style={{ color: "#7aa6bb", fontSize: 8, letterSpacing: "0.18em" }}>TRF</span>
              <span style={{
                color: "#d7eef7",
                fontSize: 16,
                lineHeight: 1,
                fontWeight: 700,
                letterSpacing: "0.04em",
                fontVariantNumeric: "tabular-nums",
              }}>
                {items.length}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={ledStyle(rxLed, "#9dd8ff", "rgba(120, 214, 255, 0.55)")} />
                <span style={ledStyle(ecoLed, "#00e5ff", "rgba(0,229,255,0.6)")} />
              </div>
            </>
          ) : (
            <>
              <span>traffic // {items.length}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#7aa6bb", fontSize: 8 }}>
                <span style={ledStyle(rxLed, "#9dd8ff", "rgba(120, 214, 255, 0.55)")} />
                <span style={ledStyle(ecoLed, "#00e5ff", "rgba(0,229,255,0.6)")} />
                <span style={{ letterSpacing: "0.12em", opacity: 0.8 }}>rx / eco</span>
              </div>
            </>
          )}
        </div>
        {onToggleCollapsed ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            style={headerButtonStyle()}
          >
            {collapsed ? ">" : "-"}
          </button>
        ) : null}
      </div>

      {!collapsed && items.length === 0 ? (
        <div style={{
          padding: "10px",
          color: "#628295",
          fontSize: 10,
          lineHeight: 1.5,
        }}>
          listening for new block transactions...
        </div>
      ) : !collapsed ? visibleItems.map((item) => {
        const clickable = Boolean(onReplay);
        return (
          <button
            key={item.id}
            type="button"
            onClick={clickable ? () => onReplay?.(item.id) : undefined}
            style={rowStyle(clickable)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span style={{
                width: 6,
                height: 6,
                flexShrink: 0,
                borderRadius: "50%",
                background: item.ecosystem ? "#00e5ff" : "rgba(114,160,184,0.72)",
                boxShadow: item.ecosystem ? "0 0 5px rgba(0,229,255,0.48)" : "0 0 4px rgba(114,160,184,0.28)",
              }} />
              <span style={{
                ...( item.systemChip && item.systemChip !== "BEACON"
                  ? { color: chipStyle(item.systemChip).color as string }
                  : { color: "#c7dbe6" }
                ),
                fontSize: 10,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}>
                {item.systemChip && item.systemChip !== "BEACON" ? item.systemChip : item.label}
              </span>
              {/* systemChip pill hidden — kept for future use */}
              <span style={{
                color: item.ecosystem ? "#7deeff" : "#6b879a",
                fontSize: 9,
                marginLeft: "auto",
                flexShrink: 0,
                opacity: 0.78,
              }}>
                blk {item.blockNumber}
              </span>
            </div>

            <div style={{
              color: "#8a9bb0",
              fontSize: 11,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {item.fromLabel}{" -> "}{item.toLabel}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span style={{
                color: "#5d7a8c",
                fontSize: 9,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
              }}>
                {item.txHash.slice(0, 10)}...{item.txHash.slice(-6)}
              </span>
              {item.amount ? (
                <span style={{
                  color: item.ecosystem ? "#00e5ff" : "#7f9fb0",
                  fontSize: 9,
                  flexShrink: 0,
                  opacity: 0.8,
                }}>
                  {item.amount}
                </span>
              ) : null}
            </div>
          </button>
        );
      }) : null}

      {!collapsed && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          style={{
            display: "block",
            width: "100%",
            padding: "6px 10px",
            border: "none",
            borderTop: "1px solid rgba(0,229,255,0.06)",
            background: "transparent",
            color: "#5a8296",
            fontSize: 9,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            cursor: "pointer",
            textAlign: "center",
            fontFamily: "inherit",
          }}
        >
          {showAll ? "show less" : `+${hiddenCount} more`}
        </button>
      )}
    </div>
  );
}
