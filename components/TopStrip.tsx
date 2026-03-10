"use client";

import React from "react";
import FloatingTooltip from "./FloatingTooltip";

interface TopStripProps {
  children: React.ReactNode;
  anchor?: "left" | "center";
  top?: number;
  left?: number;
  right?: number;
  zIndex?: number;
  width?: string;
  maxWidth?: string;
  nowrap?: boolean;
}

export function TopStrip({
  children,
  anchor = "left",
  top = 0,
  left,
  right,
  zIndex = 20,
  width,
  maxWidth,
  nowrap = false,
}: TopStripProps) {
  return (
    <div
      style={{
        position: "fixed",
        top,
        left: left ?? 0,
        right,
        zIndex,
        minWidth: 0,
        pointerEvents: "auto",
        background: "rgba(2,6,14,0.58)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 6px 18px rgba(0,0,0,0.16)",
        backdropFilter: "blur(10px)",
        padding: "3px 0",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: anchor === "center" ? "center" : "flex-start",
          gap: 6,
          width: width ?? "100%",
          maxWidth,
          minWidth: 0,
          margin: anchor === "center" ? "0 auto" : undefined,
          padding: "0 10px",
          flexWrap: nowrap ? "nowrap" : "wrap",
          overflowX: nowrap ? "auto" : "visible",
          overflowY: "visible",
          scrollbarWidth: "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}

interface TopStripGroupProps {
  children: React.ReactNode;
  gap?: number;
  padding?: string;
}

export function TopStripGroup({
  children,
  gap = 6,
  padding = "0 2px 0 0",
}: TopStripGroupProps) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap,
      padding,
      fontSize: 10,
      fontFamily: "inherit",
      flexShrink: 0,
    }}>
      {children}
    </div>
  );
}

interface TopStripChipProps {
  label: string;
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  accent?: string;
  title?: string;
  noTooltip?: boolean;
  variant?: "default" | "status" | "hint";
}

export function TopStripChip({
  label,
  active = false,
  onClick,
  disabled = false,
  accent,
  title,
  noTooltip = false,
  variant = "default",
}: TopStripChipProps) {
  const [hovered, setHovered] = React.useState(false);
  const anchorRef = React.useRef<HTMLButtonElement>(null);
  const isStatus = variant === "status";
  const isHint = variant === "hint";
  const tooltipText = title ?? label;

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
          border: isHint
            ? "1px solid rgba(255,255,255,0.06)"
            : `1px solid ${isStatus
              ? "rgba(255,255,255,0.10)"
              : active
                ? accent ?? "rgba(255,255,255,0.16)"
                : "rgba(255,255,255,0.08)"}`,
          background: isHint
            ? "rgba(255,255,255,0.03)"
            : isStatus
              ? active
                ? "rgba(92,245,255,0.14)"
                : "rgba(255,255,255,0.05)"
              : active
                ? "rgba(255,255,255,0.12)"
                : disabled
                  ? "rgba(255,255,255,0.025)"
                  : "rgba(255,255,255,0.04)",
          color: isHint
            ? "rgba(255,255,255,0.42)"
            : isStatus
              ? active
                ? "#c9fbff"
                : "rgba(255,255,255,0.58)"
              : active
                ? "#ffffff"
                : disabled
                  ? "rgba(255,255,255,0.28)"
                  : accent ?? "rgba(255,255,255,0.72)",
          borderRadius: 4,
          padding: variant === "hint" ? "2px 6px" : "3px 8px",
          minHeight: 22,
          fontSize: variant === "hint" ? 8 : 9,
          letterSpacing: variant === "hint" ? "0.12em" : "0.10em",
          textTransform: "uppercase",
          fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
          cursor: disabled ? "not-allowed" : onClick ? "pointer" : "default",
          lineHeight: 1.1,
          transition: "all 0.18s ease",
          flexShrink: 0,
          position: "relative",
          opacity: disabled ? 0.55 : 1,
          outline: "none",
        }}
      >
        {label}
      </button>

      {hovered && !noTooltip && (
        <FloatingTooltip
          anchorRef={anchorRef}
          open={hovered}
          text={tooltipText}
          placement="bottom"
        />
      )}
    </>
  );
}

export function TopStripDivider() {
  return <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.08)", flexShrink: 0 }} />;
}