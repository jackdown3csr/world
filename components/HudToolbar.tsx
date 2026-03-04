"use client";

import React, { useState } from "react";

/* ────────────────────────── SVG micro-icons (12×12) ────────────────── */
const I = ({ d, size = 12 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const icons = {
  orbit:  (s?: number) => <I d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 3v0M12 21v0" size={s} />,
  trail:  (s?: number) => <I d="M4 20c2-4 4-8 8-12s6-4 8-4" size={s} />,
  label:  (s?: number) => <I d="M4 7V4h16v3M9 20h6M12 4v16" size={s} />,
  named:  (s?: number) => <I d="M7 20l5-16 5 16M8 14h8" size={s} />,
  search: (s?: number) => <I d="M11 11m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0M21 21l-4.35-4.35" size={s} />,
  help:   (s?: number) => <I d="M12 12m-10 0a10 10 0 1 0 20 0a10 10 0 1 0-20 0M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" size={s} />,
  reset:  (s?: number) => <I d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5" size={s} />,
};

/* ────────────────────────── Button component ───────────────────────── */
function HudBtn({
  active, onClick, icon, label, shortcut, disabled, mobile,
}: {
  active: boolean; onClick: () => void;
  icon: (s?: number) => React.ReactNode; label: string;
  shortcut?: string; disabled?: boolean; mobile?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const iSize = mobile ? 14 : 12;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={shortcut ? `${label} (${shortcut})` : label}
      style={{
        display: "flex",
        alignItems: "center",
        gap: mobile ? 6 : 4,
        padding: mobile ? "8px 12px" : "4px 6px",
        minHeight: mobile ? 40 : 26,
        cursor: disabled ? "not-allowed" : "pointer",
        background: active
          ? "rgba(0,229,255,0.10)"
          : hovered
            ? "rgba(255,255,255,0.05)"
            : "transparent",
        color: active ? "#00e5ff" : disabled ? "#2a3a48" : hovered ? "#7eb8cc" : "#4a6278",
        border: "none",
        borderBottom: active ? "2px solid rgba(0,229,255,0.6)" : "2px solid transparent",
        fontFamily: "'JetBrains Mono','SF Mono',monospace",
        fontWeight: 500,
        fontSize: mobile ? 11 : 9,
        letterSpacing: "0.10em",
        textTransform: "uppercase" as const,
        transition: "all 0.18s ease",
        opacity: disabled ? 0.3 : 1,
        borderRadius: "3px 3px 0 0",
        position: "relative" as const,
        whiteSpace: "nowrap" as const,
      }}
    >
      <span style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
        {icon(iSize)}
      </span>
      <span>{label}</span>

      {/* Active glow dot */}
      {active && (
        <span style={{
          position: "absolute",
          bottom: -1,
          left: "50%",
          transform: "translateX(-50%)",
          width: 3,
          height: 3,
          borderRadius: "50%",
          background: "#00e5ff",
          boxShadow: "0 0 6px 1px rgba(0,229,255,0.5)",
        }} />
      )}
    </button>
  );
}

/* ────────────────────────── Group panel ─────────────────────────────── */
function Group({ label, children, mobile }: { label: string; children: React.ReactNode; mobile?: boolean }) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: 0,
    }}>
      {!mobile && (
        <span style={{
          fontSize: 7,
          fontWeight: 600,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "rgba(0,229,255,0.25)",
          fontFamily: "'JetBrains Mono','SF Mono',monospace",
          paddingLeft: 6,
          marginBottom: 2,
          userSelect: "none",
        }}>
          {label}
        </span>
      )}
      <div style={{
        display: "flex",
        alignItems: "stretch",
        gap: 1,
        background: "rgba(255,255,255,0.02)",
        borderRadius: 4,
        padding: "1px 2px",
      }}>
        {children}
      </div>
    </div>
  );
}

/* ────────────────────────── Main toolbar ────────────────────────────── */
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
  showTrails: boolean;
  onToggleTrails: () => void;
  onReset: () => void;
  mobile?: boolean;
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
  showTrails,
  onToggleTrails,
  onReset,
  mobile = false,
}: HudToolbarProps) {
  return (
    <div
      style={{
        background: "rgba(2, 6, 14, 0.92)",
        border: "1px solid rgba(0,229,255,0.08)",
        borderLeft: mobile ? "none" : undefined,
        borderTop: mobile ? "1px solid rgba(0,229,255,0.15)" : undefined,
        padding: mobile ? "6px 8px" : "6px 10px 4px",
        display: "flex",
        alignItems: "flex-end",
        flexWrap: "wrap",
        gap: mobile ? 6 : 10,
        justifyContent: mobile ? "space-evenly" : undefined,
        borderRadius: mobile ? 0 : 4,
        boxShadow: "0 2px 16px rgba(0,0,0,0.4)",
        backdropFilter: "blur(8px)",
      }}
    >
      <Group label="display" mobile={mobile}>
        <HudBtn active={showOrbits} onClick={onToggleOrbits} icon={icons.orbit} label="orbits" shortcut="O" mobile={mobile} />
        <HudBtn active={showTrails} onClick={onToggleTrails} icon={icons.trail} label="trails" shortcut="T" mobile={mobile} />
        <HudBtn active={showAllNames} onClick={onToggleLabels} icon={icons.label} label="labels" shortcut="L" mobile={mobile} />
        <HudBtn active={showRenamedOnly && showAllNames} onClick={onToggleRenamed} icon={icons.named} label="named" shortcut="N" disabled={!showAllNames} mobile={mobile} />
      </Group>

      <Group label="tools" mobile={mobile}>
        <HudBtn active={showDirectory} onClick={onToggleDirectory} icon={icons.search} label="search" shortcut="F" mobile={mobile} />
        <HudBtn active={showHelp} onClick={onToggleHelp} icon={icons.help} label="help" shortcut="H" mobile={mobile} />
        <HudBtn active={false} onClick={onReset} icon={icons.reset} label="reset" shortcut="R" mobile={mobile} />
      </Group>
    </div>
  );
}
