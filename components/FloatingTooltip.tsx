"use client";

import React from "react";
import { createPortal } from "react-dom";

type Placement = "top" | "bottom";

interface FloatingTooltipProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  text: string;
  placement?: Placement;
  compact?: boolean;
  delayMs?: number;
}

export default function FloatingTooltip({
  anchorRef,
  open,
  text,
  placement = "top",
  compact = false,
  delayMs = 140,
}: FloatingTooltipProps) {
  const [mounted, setMounted] = React.useState(false);
  const [visible, setVisible] = React.useState(false);
  // Resolved position stored as plain values so we can re-use them in the arrow correction pass.
  const [pos, setPos] = React.useState<{
    left: number;
    top?: number;
    bottom?: number;
    placement: Placement;
  } | null>(null);
  const [arrowLeft, setArrowLeft] = React.useState(0);

  // Ref to the rendered tooltip box so we can read its actual width.
  const tooltipRef = React.useRef<HTMLDivElement>(null);

  const maxWidth = compact ? 180 : 220;
  const gap = 10;
  const margin = 12;

  React.useEffect(() => { setMounted(true); }, []);

  React.useEffect(() => {
    if (!open) { setVisible(false); return; }
    const id = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(id);
  }, [delayMs, open]);

  // Helper: (re)compute position and arrow using the current anchor rect and actual tooltip width.
  const compute = React.useCallback(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;

    const preferredCenter = rect.left + rect.width / 2;
    // Use actual rendered width when available, fall back to maxWidth on first pass.
    const actualWidth = tooltipRef.current?.offsetWidth ?? maxWidth;
    const halfWidth = actualWidth / 2;

    const left = Math.min(
      window.innerWidth - halfWidth - margin,
      Math.max(halfWidth + margin, preferredCenter),
    );

    const fitsTop = rect.top >= 54;
    const fitsBottom = window.innerHeight - rect.bottom >= 54;
    const finalPlacement = placement === "top"
      ? (fitsTop || !fitsBottom ? "top" : "bottom")
      : (fitsBottom || !fitsTop ? "bottom" : "top");

    // Arrow offset from the tooltip's left edge so it points at the anchor centre.
    const arrowPos = Math.min(actualWidth - 10, Math.max(10, preferredCenter - (left - halfWidth)));

    setArrowLeft(arrowPos);
    setPos({
      left,
      top: finalPlacement === "bottom" ? rect.bottom + gap : undefined,
      bottom: finalPlacement === "top" ? window.innerHeight - rect.top + gap : undefined,
      placement: finalPlacement,
    });
  }, [anchorRef, gap, margin, maxWidth, placement]);

  // First layout pass: compute position (tooltip not yet in DOM, so actual width = maxWidth fallback).
  React.useLayoutEffect(() => {
    if (!visible) { setPos(null); return; }
    compute();
    window.addEventListener("scroll", compute, true);
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute, true);
      window.removeEventListener("resize", compute);
    };
  }, [visible, compute]);

  // Second layout pass: after the tooltip renders we know the real offsetWidth, so re-run arrow calc.
  React.useLayoutEffect(() => {
    if (!pos || !tooltipRef.current || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const preferredCenter = rect.left + rect.width / 2;
    const actualWidth = tooltipRef.current.offsetWidth;
    const arrowPos = Math.min(
      actualWidth - 10,
      Math.max(10, preferredCenter - (pos.left - actualWidth / 2)),
    );
    setArrowLeft(arrowPos);
  }, [pos, anchorRef]);

  if (!mounted || !visible || !pos) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        left: pos.left,
        top: pos.top,
        bottom: pos.bottom,
        transform: "translateX(-50%)",
        // Size to content; maxWidth caps long labels.
        width: "max-content",
        maxWidth,
        zIndex: 2000,
      }}
    >
      <div
        ref={tooltipRef}
        style={{
          position: "relative",
          padding: compact ? "6px 8px" : "7px 10px",
          borderRadius: 8,
          border: "1px solid rgba(122,228,242,0.18)",
          background: "linear-gradient(180deg, rgba(6,14,24,0.98), rgba(3,9,18,0.98))",
          boxShadow: "0 12px 28px rgba(0,0,0,0.32)",
          color: "#d9f4ff",
          fontFamily: "'JetBrains Mono','SF Mono',monospace",
          fontSize: compact ? 8 : 9,
          fontWeight: 500,
          letterSpacing: "0.04em",
          lineHeight: 1.35,
          textTransform: "none",
          // Nowrap keeps labels on one line so the box is exactly text-wide.
          whiteSpace: "nowrap",
          textAlign: "left",
          pointerEvents: "none",
        }}
      >
        {text}
        <span
          style={{
            position: "absolute",
            left: arrowLeft,
            top: pos.placement === "bottom" ? 0 : "100%",
            width: 10,
            height: 10,
            background: "rgba(3,9,18,0.98)",
            borderRight: "1px solid rgba(122,228,242,0.18)",
            borderBottom: "1px solid rgba(122,228,242,0.18)",
            transform: pos.placement === "bottom"
              ? "translate(-50%, -50%) rotate(225deg)"
              : "translate(-50%, -50%) rotate(45deg)",
          }}
        />
      </div>
    </div>,
    document.body,
  );
}
