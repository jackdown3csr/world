"use client";

import React from "react";

/* ── Shared HUD button style helper ── */
function hudBtn(active: boolean): React.CSSProperties {
  return {
    background: active ? "rgba(0,229,255,0.12)" : "rgba(255,255,255,0.03)",
    color: active ? "#00e5ff" : "#4a6278",
    border: active
      ? "1px solid rgba(0,229,255,0.35)"
      : "1px solid rgba(255,255,255,0.06)",
    padding: "3px 6px",
    cursor: "pointer",
    fontFamily: "inherit",
    fontWeight: 500,
    fontSize: 10,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    transition: "all 0.15s",
  };
}

interface HudToolbarProps {
  showAllNames: boolean;
  onToggleLabels: () => void;
  showRenamedOnly: boolean;
  onToggleRenamed: () => void;
  showDirectory: boolean;
  onToggleDirectory: () => void;
  showHelp: boolean;
  onToggleHelp: () => void;
  showOrbits: boolean;
  onToggleOrbits: () => void;
  onReset: () => void;
}

export default function HudToolbar({
  showAllNames,
  onToggleLabels,
  showRenamedOnly,
  onToggleRenamed,
  showDirectory,
  onToggleDirectory,
  showHelp,
  onToggleHelp,
  showOrbits,
  onToggleOrbits,
  onReset,
}: HudToolbarProps) {
  return (
    <div
      style={{
        background: "rgba(2, 6, 14, 0.88)",
        border: "1px solid rgba(0,229,255,0.12)",
        borderLeft: "2px solid rgba(0,229,255,0.4)",
        padding: "7px 10px",
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 5,
      }}
    >
      <button onClick={onToggleLabels} style={hudBtn(showAllNames)}>
        labels
      </button>
      <button
        onClick={onToggleRenamed}
        disabled={!showAllNames}
        style={{
          ...hudBtn(showRenamedOnly && showAllNames),
          ...(showAllNames ? {} : { opacity: 0.3, cursor: "not-allowed" }),
        }}
      >
        named
      </button>
      <button onClick={onToggleDirectory} style={hudBtn(showDirectory)}>
        dir
      </button>
      <button onClick={onToggleOrbits} style={hudBtn(showOrbits)}>
        orbit
      </button>
      <button onClick={onToggleHelp} style={hudBtn(showHelp)}>
        help
      </button>
      <button onClick={onReset} title="Reset view" style={hudBtn(false)}>
        rst
      </button>
    </div>
  );
}
