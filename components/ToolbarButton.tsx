"use client";

import React from "react";

import FloatingTooltip from "./FloatingTooltip";

export interface ToolbarButtonProps {
  label: string;
  icon?: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
  noTooltip?: boolean;
  accent?: string;
  variant?: "main" | "status" | "hint";
  compact?: boolean;
  mobile?: boolean;
  strip?: boolean;
  iconOnly?: boolean;
  tooltipPlacement?: "top" | "bottom";
  preset?: "hud" | "topstrip";
}

export default function ToolbarButton({
  label,
  icon,
  active = false,
  disabled = false,
  onClick,
  title,
  noTooltip = false,
  accent,
  variant = "main",
  compact = false,
  mobile = false,
  strip = false,
  iconOnly = false,
  tooltipPlacement = "bottom",
  preset = "hud",
}: ToolbarButtonProps) {
  const [hovered, setHovered] = React.useState(false);
  const anchorRef = React.useRef<HTMLButtonElement>(null);
  const isStrip = strip && compact && !mobile;
  const tooltipText = title ?? label;
  const isStatus = variant === "status";
  const isHint = variant === "hint";
  const isTopStrip = preset === "topstrip";

  const color = isTopStrip
    ? isHint
      ? "rgba(255,255,255,0.42)"
      : isStatus
        ? active
          ? "#c9fbff"
          : "rgba(255,255,255,0.58)"
        : active
          ? "#ffffff"
          : disabled
            ? "rgba(255,255,255,0.28)"
            : accent ?? "rgba(255,255,255,0.72)"
    : active
      ? (compact ? "#ffffff" : "#00e5ff")
      : disabled
        ? "#2a3a48"
        : hovered
          ? "#7eb8cc"
          : "#4a6278";

  const background = isTopStrip
    ? isHint
      ? "rgba(255,255,255,0.03)"
      : isStatus
        ? active
          ? "rgba(92,245,255,0.14)"
          : "rgba(255,255,255,0.05)"
        : active
          ? "rgba(255,255,255,0.12)"
          : disabled
            ? "rgba(255,255,255,0.025)"
            : "rgba(255,255,255,0.04)"
    : active
      ? compact
        ? "rgba(255,255,255,0.12)"
        : "rgba(0,229,255,0.10)"
      : hovered
        ? compact
          ? "rgba(255,255,255,0.07)"
          : "rgba(255,255,255,0.05)"
        : "transparent";

  const border = isTopStrip
    ? isHint
      ? "1px solid rgba(255,255,255,0.06)"
      : `1px solid ${isStatus
        ? "rgba(255,255,255,0.10)"
        : active
          ? accent ?? "rgba(255,255,255,0.16)"
          : "rgba(255,255,255,0.08)"}`
    : compact
      ? "1px solid rgba(255,255,255,0.08)"
      : "none";

  const activeDot = !isTopStrip && active;

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        aria-label={tooltipText}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: iconOnly ? 0 : mobile ? 6 : isStrip ? 4 : compact ? 3 : 4,
          padding: iconOnly
            ? (mobile ? "8px" : isStrip ? "3px 6px" : compact ? "4px" : "4px")
            : isTopStrip
              ? isHint
                ? "2px 6px"
                : "3px 8px"
              : mobile
                ? "8px 12px"
                : isStrip
                  ? "3px 8px"
                  : compact
                    ? "4px 7px"
                    : "4px 6px",
          minWidth: iconOnly ? (mobile ? 40 : isStrip ? 22 : compact ? 24 : 26) : undefined,
          minHeight: mobile ? 40 : isTopStrip ? 22 : isStrip ? 22 : compact ? 24 : 26,
          cursor: disabled ? "not-allowed" : onClick ? "pointer" : "default",
          background,
          color,
          border,
          borderBottom: compact ? undefined : activeDot ? "2px solid rgba(0,229,255,0.6)" : "2px solid transparent",
          borderLeft: compact || !iconOnly ? undefined : "1px solid rgba(0,229,255,0.10)",
          fontFamily: "'JetBrains Mono','SF Mono',monospace",
          fontWeight: 500,
          fontSize: mobile ? 11 : isTopStrip ? (isHint ? 8 : 9) : isStrip ? 9 : compact ? 8 : 9,
          letterSpacing: isTopStrip ? (isHint ? "0.12em" : "0.10em") : compact ? (isStrip ? "0.10em" : "0.08em") : "0.10em",
          textTransform: "uppercase",
          transition: "all 0.18s ease",
          opacity: disabled ? (isTopStrip ? 0.55 : 0.3) : 1,
          borderRadius: isTopStrip ? 4 : compact ? 4 : "3px 3px 0 0",
          position: "relative",
          whiteSpace: "nowrap",
          lineHeight: 1.1,
          flexShrink: 0,
        }}
      >
        {icon && <span style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>{icon}</span>}
        {!iconOnly && <span>{label}</span>}
        {activeDot && (
          <span
            style={{
              position: "absolute",
              bottom: compact ? "50%" : -1,
              left: "50%",
              transform: compact ? "translate(-50%, 50%)" : "translateX(-50%)",
              width: compact ? 2 : 3,
              height: compact ? 2 : 3,
              borderRadius: "50%",
              background: compact ? "#ffffff" : "#00e5ff",
              boxShadow: compact ? "0 0 5px 1px rgba(255,255,255,0.25)" : "0 0 6px 1px rgba(0,229,255,0.5)",
            }}
          />
        )}
      </button>

      {!mobile && hovered && !noTooltip && (
        <FloatingTooltip
          anchorRef={anchorRef}
          open={hovered}
          text={tooltipText}
          placement={tooltipPlacement}
          compact={compact}
        />
      )}
    </>
  );
}
