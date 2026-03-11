"use client";

import React from "react";
import type { PoolTokenEntry, WalletEntry, VestingWalletEntry } from "@/lib/types";

export type WalletTooltipVariant = "wallet" | "vesting" | "pool";

export type HoveredWalletInfo = {
  wallet: WalletEntry;
  variant?: WalletTooltipVariant;
  vesting?: boolean;
};

interface WalletTooltipProps {
  wallet: WalletEntry;
  onClose?: () => void;
  variant?: WalletTooltipVariant;
  vesting?: boolean;
}

/**
 * HUD-style tooltip rendered as a drei <Html> child.
 * Shows system-specific fields based on the tooltip variant.
 */
export default function WalletTooltip({ wallet, onClose, variant = "wallet", vesting = false }: WalletTooltipProps) {
  const short = `${wallet.address.slice(0, 6)}\u2026${wallet.address.slice(-4)}`;
  const resolvedVariant: WalletTooltipVariant = vesting ? "vesting" : variant;
  const isVesting = resolvedVariant === "vesting";
  const pool = resolvedVariant === "pool";

  const lockEndStr =
    !vesting && wallet.lockEnd > 0
      ? new Date(wallet.lockEnd * 1000).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : "unlocked";

  return (
    <div
      style={{
        pointerEvents: onClose ? "auto" : "none",
        background: "rgba(2, 6, 14, 0.92)",
        border: "1px solid rgba(0, 229, 255, 0.18)",
        borderLeft: "2px solid rgba(0, 229, 255, 0.5)",
        padding: "8px 12px",
        color: "#8a9bb0",
        fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', Menlo, monospace",
        fontSize: 11,
        lineHeight: 1.7,
        whiteSpace: "nowrap",
        boxShadow: "0 2px 20px rgba(0,0,0,0.6), inset 0 0 30px rgba(0,229,255,0.02)",
      }}
    >
      {/* Name / address */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}>
        <div style={{
          fontWeight: 600,
          color: "#c0d0e0",
          fontSize: 12,
          letterSpacing: "0.03em",
          flex: 1,
        }}>
          {wallet.customName || short}
        </div>
        {onClose && (
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            style={{
              background: "none",
              border: "none",
              color: "#3a5068",
              cursor: "pointer",
              fontSize: 14,
              lineHeight: 1,
              padding: 0,
              fontFamily: "inherit",
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#00e5ff")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#3a5068")}
          >
            {"\u00d7"}
          </button>
        )}
      </div>
      {wallet.customName && (
        <div style={{ color: "#5a7a90", marginTop: 1, fontSize: 10 }}>{short}</div>
      )}

      {/* Thin separator */}
      <div style={{
        height: 1,
        background: "rgba(0,229,255,0.08)",
        margin: "5px 0",
      }} />

      {/* Data rows */}
      {pool ? (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
            <span style={{ color: "#5a7a90", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>balance</span>
            <span style={{ color: "#00e5ff", fontVariantNumeric: "tabular-nums" }}>{(wallet as PoolTokenEntry).balanceFormatted}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
            <span style={{ color: "#5a7a90", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>price</span>
            <span style={{ color: "#8ab0c0", fontVariantNumeric: "tabular-nums" }}>{(wallet as PoolTokenEntry).priceUSDFormatted}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
            <span style={{ color: "#5a7a90", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>value</span>
            <span style={{ color: "#c0a050", fontVariantNumeric: "tabular-nums" }}>{(wallet as PoolTokenEntry).valueUSDFormatted}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
            <span style={{ color: "#5a7a90", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>share</span>
            <span style={{ color: "#7a9ab0", fontVariantNumeric: "tabular-nums" }}>{(wallet as PoolTokenEntry).shareOfPoolFormatted}</span>
          </div>
        </>
      ) : isVesting ? (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
            <span style={{ color: "#5a7a90", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>allocated</span>
            <span style={{ color: "#00e5ff", fontVariantNumeric: "tabular-nums" }}>{(wallet as VestingWalletEntry).totalEntitledFormatted}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
            <span style={{ color: "#5a7a90", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>claimed</span>
            <span style={{ color: "#4caf50", fontVariantNumeric: "tabular-nums" }}>{(wallet as VestingWalletEntry).totalClaimedFormatted}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
            <span style={{ color: "#5a7a90", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>unclaimed</span>
            <span style={{ color: "#c0a050", fontVariantNumeric: "tabular-nums" }}>{(wallet as VestingWalletEntry).unclaimedRewardFormatted}</span>
          </div>
        </>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
            <span style={{ color: "#5a7a90", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>power</span>
            <span style={{ color: "#00e5ff", fontVariantNumeric: "tabular-nums" }}>{wallet.votingPowerFormatted}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
            <span style={{ color: "#5a7a90", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>locked</span>
            <span style={{ color: "#c0a050", fontVariantNumeric: "tabular-nums" }}>{wallet.lockedFormatted}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
            <span style={{ color: "#5a7a90", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>unlock</span>
            <span style={{ color: "#7a9ab0" }}>{lockEndStr}</span>
          </div>
        </>
      )}
    </div>
  );
}
