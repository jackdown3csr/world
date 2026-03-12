"use client";

import React, { useRef } from "react";
import type { PoolTokenEntry, VestingWalletEntry } from "@/lib/types";
import type { HoveredWalletInfo } from "./WalletTooltip";

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      style={{
        padding: "6px 11px",
        borderRight: "1px solid rgba(0,229,255,0.06)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 2,
      }}
    >
      <div
        style={{
          color: "#3d5a6e",
          fontSize: 8,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          lineHeight: 1,
        }}
      >
        {label}
      </div>
      <div
        style={{
          color,
          fontVariantNumeric: "tabular-nums",
          fontSize: 10,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * Fixed bottom-left HUD banner shown while hovering a wallet body.
 * Fades in/out smoothly. Always mounted; opacity driven by 'info' presence.
 */
export default function WalletInfoBanner({ info, pinned, onClose }: { info: HoveredWalletInfo | null; pinned?: boolean; onClose?: () => void }) {
  // Keep the last known info so content stays visible during fade-out
  const lastInfo = useRef<HoveredWalletInfo | null>(null);
  if (info) lastInfo.current = info;
  const display = info ?? lastInfo.current;
  if (!display) return null;
  const { wallet, variant = "wallet", vesting = false } = display;
  const resolvedVariant = vesting ? "vesting" : variant;
  const isVesting = resolvedVariant === "vesting";
  const isPool = resolvedVariant === "pool";
  const short = `${wallet.address.slice(0, 6)}\u2026${wallet.address.slice(-4)}`;

  const lockEndStr =
    !isVesting && !isPool && wallet.lockEnd > 0
      ? new Date(wallet.lockEnd * 1000).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : "unlocked";

  return (
    <div
      style={{
        position: "fixed",
        left: 16,
        bottom: 16,
        zIndex: 2000,
        pointerEvents: onClose ? "auto" : "none",
        display: "flex",
        alignItems: "stretch",
        background: "rgba(2, 6, 14, 0.78)",
        border: pinned ? "1px solid rgba(0, 229, 255, 0.22)" : "1px solid rgba(0, 229, 255, 0.10)",
        borderLeft: pinned ? "2px solid rgba(0, 229, 255, 0.65)" : "2px solid rgba(0, 229, 255, 0.32)",
        boxShadow: "0 2px 16px rgba(0,0,0,0.40)",
        fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', Menlo, monospace",
        userSelect: "none",
        opacity: info ? 1 : 0,
        transform: info ? "translateY(0)" : "translateY(5px)",
        transition: "opacity 0.18s ease, transform 0.18s ease, border-color 0.18s ease",
      }}
    >
      {/* Name / address block */}
      <div
        style={{
          padding: "6px 13px",
          borderRight: "1px solid rgba(0,229,255,0.06)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 2,
        }}
      >
        <div style={{ color: "#aabccc", fontWeight: 600, fontSize: 11, letterSpacing: "0.03em", lineHeight: 1 }}>
          {wallet.customName || short}
        </div>
        {wallet.customName && (
          <div style={{ color: "#2e4a5c", fontSize: 8, lineHeight: 1 }}>{short}</div>
        )}
      </div>

      {/* Metric columns — vary by system variant */}
      {isPool ? (
        <>
          <Metric label="balance" value={(wallet as PoolTokenEntry).balanceFormatted} color="#00e5ff" />
          <Metric label="price"   value={(wallet as PoolTokenEntry).priceUSDFormatted} color="#8ab0c0" />
          <Metric label="value"   value={(wallet as PoolTokenEntry).valueUSDFormatted} color="#c0a050" />
        </>
      ) : isVesting ? (
        <>
          <Metric label="allocated" value={(wallet as VestingWalletEntry).totalEntitledFormatted} color="#00e5ff" />
          <Metric label="claimed"   value={(wallet as VestingWalletEntry).totalClaimedFormatted}   color="#4caf50" />
          <Metric label="unclaimed" value={(wallet as VestingWalletEntry).unclaimedRewardFormatted} color="#c0a050" />
        </>
      ) : (
        <>
          <Metric label="power"  value={wallet.votingPowerFormatted} color="#00e5ff" />
          <Metric label="locked" value={wallet.lockedFormatted}       color="#c0a050" />
          <Metric label="unlock" value={lockEndStr}                   color="#7a9ab0" />
        </>
      )}

      {/* Close button — only when pinned */}
      {onClose && (
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            borderLeft: "1px solid rgba(0,229,255,0.06)",
            color: "#2e4a5c",
            cursor: "pointer",
            fontSize: 14,
            padding: "0 10px",
            fontFamily: "inherit",
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#00e5ff")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#2e4a5c")}
        >
          ×
        </button>
      )}
    </div>
  );
}
