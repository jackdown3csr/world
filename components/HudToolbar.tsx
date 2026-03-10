"use client";

import React, { useState } from "react";
import { toolbarShortcutMeta, toolbarShortcuts } from "@/lib/shortcuts";
import FloatingTooltip from "./FloatingTooltip";

/* ────────────────────────── SVG micro-icons (12×12) ────────────────── */
const I = ({ d, size = 12 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const icons = {
  orbit:  (s?: number) => <I d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 3v0M12 21v0" size={s} />,
  trail:  (s?: number) => <I d="M4 20c2-4 4-8 8-12s6-4 8-4" size={s} />,
  traffic: (s?: number) => <I d="M3 12h4l3-9 4 18 3-9h4" size={s} />,
  bug:    (s?: number) => <I d="M9 9h6M10 14h4M7 6h10l2 3v6l-3 3H8l-3-3V9l2-3M9 3v3M15 3v3M4 10H2M22 10h-2M5 16l-2 2M19 16l2 2" size={s} />,
  label:  (s?: number) => <I d="M4 7V4h16v3M9 20h6M12 4v16" size={s} />,
  named:  (s?: number) => <I d="M7 20l5-16 5 16M8 14h8" size={s} />,
  search: (s?: number) => <I d="M11 11m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0M21 21l-4.35-4.35" size={s} />,
  help:   (s?: number) => <I d="M12 12m-10 0a10 10 0 1 0 20 0a10 10 0 1 0-20 0M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" size={s} />,
  reset:  (s?: number) => <I d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5" size={s} />,
  fly:    (s?: number) => <I d="M9.5 15.5L5 20M14.5 13.5l-5 5M22 2L11 13M22 2l-7 20-4-9-9-4z" size={s} />,
  ranked: (s?: number) => <I d="M3 4h18M3 8h14M3 12h10M3 16h6" size={s} />,
  gnet:   (s?: number) => <I d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" size={s} />,
  photo:  (s?: number) => <I d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" size={s} />,
  hud:    (s?: number) => <I d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6" size={s} />,
};

/* ────────────────────────── Button component ───────────────────────── */
export function HudBtn({
  active, onClick, icon, label, shortcut, title, disabled, mobile, compact, iconOnly = false, strip = false,
}: {
  active: boolean; onClick?: () => void;
  icon?: (s?: number) => React.ReactNode; label: string;
  shortcut?: string; title?: string; disabled?: boolean; mobile?: boolean; compact?: boolean; iconOnly?: boolean; strip?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const anchorRef = React.useRef<HTMLSpanElement>(null);
  const isStrip = strip && compact && !mobile;
  const iSize = mobile ? 14 : isStrip ? 10 : compact ? 11 : 12;
  const tooltipText = title ?? (shortcut ? `${label} (${shortcut})` : label);

  return (
    <span
      ref={anchorRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        display: "inline-flex",
        flexShrink: 0,
      }}
    >
      <button
        onClick={onClick}
        disabled={disabled}
        aria-label={tooltipText}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: iconOnly ? 0 : mobile ? 6 : isStrip ? 4 : compact ? 3 : 4,
          padding: iconOnly
            ? (mobile ? "8px" : isStrip ? "3px 6px" : compact ? "4px" : "4px")
            : mobile
              ? "8px 12px"
              : isStrip
                ? "3px 8px"
                : compact
                  ? "4px 7px"
                  : "4px 6px",
          minWidth: iconOnly ? (mobile ? 40 : isStrip ? 22 : compact ? 24 : 26) : undefined,
          minHeight: mobile ? 40 : isStrip ? 22 : compact ? 24 : 26,
          cursor: disabled ? "not-allowed" : "pointer",
          background: active
            ? compact ? "rgba(255,255,255,0.12)" : "rgba(0,229,255,0.10)"
            : hovered
              ? compact ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.05)"
              : "transparent",
          color: active ? (compact ? "#ffffff" : "#00e5ff") : disabled ? "#2a3a48" : hovered ? "#7eb8cc" : "#4a6278",
          border: compact ? "1px solid rgba(255,255,255,0.08)" : "none",
          borderBottom: compact ? undefined : active ? "2px solid rgba(0,229,255,0.6)" : "2px solid transparent",
          fontFamily: "'JetBrains Mono','SF Mono',monospace",
          fontWeight: 500,
          fontSize: mobile ? 11 : isStrip ? 9 : compact ? 8 : 9,
          letterSpacing: compact ? (isStrip ? "0.10em" : "0.08em") : "0.10em",
          textTransform: "uppercase" as const,
          transition: "all 0.18s ease",
          opacity: disabled ? 0.3 : 1,
          borderRadius: compact ? 4 : "3px 3px 0 0",
          position: "relative" as const,
          whiteSpace: "nowrap" as const,
          lineHeight: 1.1,
        }}
      >
        {icon && <span style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>{icon(iSize)}</span>}
        {!iconOnly && <span>{label}</span>}

        {active && (
          <span style={{
            position: "absolute",
            bottom: compact ? "50%" : -1,
            left: "50%",
            transform: compact ? "translate(-50%, 50%)" : "translateX(-50%)",
            width: compact ? 2 : 3,
            height: compact ? 2 : 3,
            borderRadius: "50%",
            background: compact ? "#ffffff" : "#00e5ff",
            boxShadow: compact ? "0 0 5px 1px rgba(255,255,255,0.25)" : "0 0 6px 1px rgba(0,229,255,0.5)",
          }} />
        )}
      </button>

      {!mobile && hovered && (
        <FloatingTooltip
          anchorRef={anchorRef}
          open={hovered}
          text={tooltipText}
          placement={compact ? "bottom" : "top"}
          compact={compact}
        />
      )}
    </span>
  );
}

/* ────────────────────────── Group panel ─────────────────────────────── */
function Group({ label, children, mobile, compact }: { label: string; children: React.ReactNode; mobile?: boolean; compact?: boolean }) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: compact ? 1 : 0,
      flexShrink: 0,
    }}>
      {!mobile && !compact && (
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
        gap: compact ? 4 : 1,
        background: compact ? "transparent" : "rgba(255,255,255,0.02)",
        borderRadius: compact ? 4 : 4,
        padding: compact ? 0 : "1px 2px",
        flexWrap: "nowrap",
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
  showBugReport?: boolean;
  onToggleBugReport?: () => void;
  showHelp: boolean;
  onToggleHelp: () => void;
  showOrbits: boolean;
  onToggleOrbits: () => void;
  showTraffic?: boolean;
  onToggleTraffic?: () => void;
  rxLed?: boolean;
  ecoLed?: boolean;
  showFlightHud?: boolean;
  onToggleFlightHud?: () => void;
  onReset: () => void;
  flyModeEnabled?: boolean;
  onToggleFlyMode?: () => void;
  onPhotoMode?: () => void;
  rankedLayout?: boolean;
  onToggleLayout?: () => void;
  gnetRanked?: boolean;
  onToggleGnet?: () => void;
  layoutVariant?: "vescrow" | "vesting" | "none";
  vestingClaimed?: boolean;
  onToggleVestingClaimed?: () => void;
  mobile?: boolean;
  compact?: boolean;
  embedded?: boolean;
  showHelpButton?: boolean;
  showReset?: boolean;
}

export default function HudToolbar({
  showAllNames,
  onToggleLabels,
  showRenamedOnly,
  onToggleRenamed,
  showBugReport = false,
  onToggleBugReport,
  showHelp,
  onToggleHelp,
  showOrbits,
  onToggleOrbits,
  showTraffic = false,
  onToggleTraffic,
  rxLed = false,
  ecoLed = false,
  showFlightHud = true,
  onToggleFlightHud,
  onReset,
  flyModeEnabled = false,
  onToggleFlyMode,
  onPhotoMode,
  rankedLayout = false,
  onToggleLayout,
  gnetRanked = false,
  onToggleGnet,
  layoutVariant = "vescrow",
  vestingClaimed = false,
  onToggleVestingClaimed,
  mobile = false,
  compact = false,
  embedded = false,
  showHelpButton = true,
  showReset = true,
}: HudToolbarProps) {
  const showLayoutGroup =
    (layoutVariant === "vescrow" && (Boolean(onToggleLayout) || Boolean(onToggleGnet))) ||
    (layoutVariant === "vesting" && Boolean(onToggleVestingClaimed));
  const strip = embedded && compact && !mobile;

  return (
    <div
      style={{
        background: embedded ? "transparent" : compact ? "rgba(2, 6, 14, 0.24)" : "rgba(2, 6, 14, 0.92)",
        border: embedded ? "none" : compact ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,229,255,0.08)",
        borderLeft: mobile ? "none" : undefined,
        borderTop: mobile ? "1px solid rgba(0,229,255,0.15)" : undefined,
        padding: mobile ? "6px 8px" : strip ? 0 : compact ? "5px 7px" : "6px 10px 4px",
        display: "flex",
        alignItems: compact ? "center" : "flex-end",
        flexWrap: embedded ? "nowrap" : "wrap",
        gap: mobile ? 6 : strip ? 6 : compact ? 8 : 10,
        justifyContent: mobile ? "space-evenly" : undefined,
        borderRadius: mobile ? 0 : strip ? 0 : compact ? 8 : 4,
        boxShadow: embedded ? "none" : compact ? "0 6px 18px rgba(0,0,0,0.18)" : "0 2px 16px rgba(0,0,0,0.4)",
        backdropFilter: embedded ? undefined : "blur(8px)",
        maxWidth: compact ? "min(calc(100vw - 360px), 860px)" : undefined,
        overflowX: embedded ? "visible" : undefined,
      }}
    >
      <Group label="browse" mobile={mobile} compact={compact}>
        <HudBtn active={showAllNames} onClick={onToggleLabels} icon={icons.label} label="labels" shortcut={toolbarShortcuts.labels} title={`${toolbarShortcutMeta.labels.description} (${toolbarShortcutMeta.labels.keys})`} mobile={mobile} compact={compact} strip={strip} />
        <HudBtn active={showRenamedOnly && showAllNames} onClick={onToggleRenamed} icon={icons.named} label="named" shortcut={toolbarShortcuts.named} title={`${toolbarShortcutMeta.named.description} (${toolbarShortcutMeta.named.keys})`} disabled={!showAllNames} mobile={mobile} compact={compact} strip={strip} />
      </Group>

      <Group label="scene" mobile={mobile} compact={compact}>
        <HudBtn active={showOrbits} onClick={onToggleOrbits} icon={icons.orbit} label="orbits" shortcut={toolbarShortcuts.orbits} title={`${toolbarShortcutMeta.orbits.description} (${toolbarShortcutMeta.orbits.keys})`} mobile={mobile} compact={compact} strip={strip} />
        {onToggleTraffic && (
          <HudBtn active={showTraffic} onClick={onToggleTraffic} icon={icons.traffic} label="traffic" shortcut={toolbarShortcuts.traffic} title={`${toolbarShortcutMeta.traffic.description} (${toolbarShortcutMeta.traffic.keys})`} mobile={mobile} compact={compact} strip={strip} />
        )}
      </Group>

      {showLayoutGroup && (
        <Group label="layout" mobile={mobile} compact={compact}>
          {layoutVariant === "vescrow" && onToggleLayout && (
            <HudBtn active={rankedLayout} onClick={onToggleLayout} icon={icons.ranked} label="ranked" shortcut={toolbarShortcuts.ranked} title={`${toolbarShortcutMeta.ranked.description} (${toolbarShortcutMeta.ranked.keys})`} mobile={mobile} compact={compact} strip={strip} />
          )}
          {layoutVariant === "vescrow" && onToggleGnet && (
            <HudBtn active={gnetRanked} onClick={onToggleGnet} icon={icons.gnet} label="gnet" shortcut={toolbarShortcuts.gnet} title={`${toolbarShortcutMeta.gnet.description} (${toolbarShortcutMeta.gnet.keys})`} disabled={!rankedLayout} mobile={mobile} compact={compact} strip={strip} />
          )}
          {layoutVariant === "vesting" && onToggleVestingClaimed && (
            <HudBtn active={vestingClaimed} onClick={onToggleVestingClaimed} icon={icons.gnet} label="claimed" shortcut={toolbarShortcuts.claimed} title={`${toolbarShortcutMeta.claimed.description} (${toolbarShortcutMeta.claimed.keys})`} mobile={mobile} compact={compact} strip={strip} />
          )}
        </Group>
      )}

      <Group label="modes" mobile={mobile} compact={compact}>
        {onToggleFlyMode && !mobile && (
          <div style={{ display: "flex", alignItems: "stretch", background: compact ? "transparent" : "rgba(255,255,255,0.02)", borderRadius: compact ? 4 : 999, overflow: "hidden", gap: compact ? 4 : 0 }}>
            <HudBtn active={flyModeEnabled} onClick={onToggleFlyMode} icon={icons.fly} label="fly" shortcut={toolbarShortcuts.fly} title={`${toolbarShortcutMeta.fly.description} (${toolbarShortcutMeta.fly.keys})`} mobile={mobile} compact={compact} strip={strip} />
          </div>
        )}
        {onPhotoMode && (
          <HudBtn active={false} onClick={onPhotoMode} icon={icons.photo} label="photo" shortcut={toolbarShortcuts.photo} title={`${toolbarShortcutMeta.photo.description} (${toolbarShortcutMeta.photo.keys})`} mobile={mobile} compact={compact} strip={strip} />
        )}
      </Group>

      <Group label="utility" mobile={mobile} compact={compact}>
        {showReset && (
          <HudBtn active={false} onClick={onReset} icon={icons.reset} label="reset" shortcut={toolbarShortcuts.reset} title={`${toolbarShortcutMeta.reset.description} (${toolbarShortcutMeta.reset.keys})`} mobile={mobile} compact={compact} strip={strip} />
        )}
        {showHelpButton && (
          <HudBtn active={showHelp} onClick={onToggleHelp} icon={icons.help} label="help" shortcut={toolbarShortcuts.help} title={`${toolbarShortcutMeta.help.description} (${toolbarShortcutMeta.help.keys})`} mobile={mobile} compact={compact} iconOnly={compact} strip={strip} />
        )}
        {onToggleBugReport && (
          <HudBtn active={showBugReport} onClick={onToggleBugReport} icon={icons.bug} label="bug" title="Open or close bug report" mobile={mobile} compact={compact} strip={strip} />
        )}
      </Group>

      {/* Modem-style TX/RX LEDs — only show when traffic is enabled and not mobile */}
      {!mobile && onToggleTraffic && (
        <div style={{
          marginLeft: "auto",
          display: "flex",
          alignItems: "center",
          gap: compact ? 5 : 6,
          paddingLeft: compact ? 6 : 8,
          paddingRight: compact ? 2 : 4,
          borderLeft: "1px solid rgba(255,255,255,0.05)",
          alignSelf: "stretch",
          flexShrink: 0,
        }}>
          {([ 
            { label: "RX", on: rxLed,  onColor: "#22ff88", glow: "rgba(34,255,136,0.55)" },
            { label: "TX", on: ecoLed, onColor: "#00e5ff", glow: "rgba(0,229,255,0.50)" },
          ] as const).map(({ label, on, onColor, glow }) => (
            <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <span style={{
                display: "block",
                width: compact ? 4 : 5,
                height: compact ? 4 : 5,
                borderRadius: "50%",
                background: on ? onColor : "rgba(255,255,255,0.07)",
                boxShadow: on ? `0 0 5px 2px ${glow}` : "none",
                transition: "background 0.08s ease, box-shadow 0.08s ease",
              }} />
              <span style={{
                fontSize: compact ? 5 : 6,
                letterSpacing: "0.06em",
                color: "rgba(255,255,255,0.18)",
                fontFamily: "'JetBrains Mono','SF Mono',monospace",
                userSelect: "none",
              }}>{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
