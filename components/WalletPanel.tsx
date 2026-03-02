"use client";

import React from "react";
import type { WalletEntry } from "@/lib/types";

interface WalletPanelProps {
  connectedAddress: string | null;
  myWallet: WalletEntry | null;
  nameInput: string;
  isSaving: boolean;
  status: string | null;
  lockExpiry: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onSaveName: () => void;
  onNameChange: (v: string) => void;
}

export default function WalletPanel({
  connectedAddress,
  myWallet,
  nameInput,
  isSaving,
  status,
  lockExpiry,
  onConnect,
  onDisconnect,
  onSaveName,
  onNameChange,
}: WalletPanelProps) {
  const canSave = !isSaving && !!nameInput.trim();

  /* ── Not connected ── */
  if (!connectedAddress) {
    return (
      <>
        <div
          style={{
            background: "rgba(2, 6, 14, 0.88)",
            border: "1px solid rgba(0,229,255,0.12)",
            borderLeft: "2px solid rgba(0,229,255,0.25)",
            padding: "10px 12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              color: "#4a6278",
              fontSize: 9,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
            }}
          >
            offline
          </span>
          <button
            onClick={onConnect}
            style={{
              background: "rgba(0,229,255,0.08)",
              color: "#00e5ff",
              border: "1px solid rgba(0,229,255,0.3)",
              padding: "5px 12px",
              cursor: "pointer",
              fontFamily: "inherit",
              fontWeight: 600,
              fontSize: 10,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              transition: "all 0.15s",
            }}
          >
            connect
          </button>
        </div>
        {status && (
          <div
            style={{
              background: "rgba(2,6,14,0.88)",
              border: "1px solid rgba(220,80,80,0.2)",
              borderLeft: "2px solid rgba(220,80,80,0.4)",
              padding: "6px 12px",
              color: "#8b5a5a",
              fontSize: 11,
            }}
          >
            {status}
          </div>
        )}
      </>
    );
  }

  /* ── Connected ── */
  return (
    <div
      style={{
        background: "rgba(2, 6, 14, 0.90)",
        border: "1px solid rgba(0,229,255,0.12)",
        borderLeft: "2px solid rgba(34,197,94,0.5)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderBottom: "1px solid rgba(0,229,255,0.06)",
        }}
      >
        <div
          style={{
            width: 5,
            height: 5,
            background: "#22c55e",
            boxShadow: "0 0 8px rgba(34,197,94,0.6)",
            flexShrink: 0,
          }}
        />
        <span
          style={{
            color: "#5a7a90",
            fontSize: 11,
            flex: 1,
            fontFamily: "inherit",
            letterSpacing: "0.02em",
          }}
        >
          {connectedAddress.slice(0, 8)}{"\u2026"}{connectedAddress.slice(-6)}
        </span>
        <button
          onClick={onDisconnect}
          title="Disconnect"
          style={{
            background: "none",
            border: "none",
            color: "#3a4a5a",
            cursor: "pointer",
            fontSize: 14,
            lineHeight: 1,
            padding: 0,
            fontFamily: "inherit",
            transition: "color 0.15s",
          }}
        >
          {"\u00d7"}
        </button>
      </div>

      {/* No veGNET */}
      {!myWallet && (
        <div
          style={{
            padding: "10px 12px",
            color: "#8b5a5a",
            fontSize: 11,
            borderLeft: "2px solid rgba(220,80,80,0.3)",
            margin: 0,
          }}
        >
          no veGNET lock detected
        </div>
      )}

      {/* Wallet stats + rename */}
      {myWallet && (
        <div
          style={{
            padding: "10px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {/* Stats grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px" }}>
            <div>
              <div style={labelStyle}>locked gnet</div>
              <div style={valueStyle}>{myWallet.lockedFormatted}</div>
            </div>
            <div>
              <div style={labelStyle}>vegnet power</div>
              <div style={{ ...valueStyle, color: "#00e5ff" }}>
                {myWallet.votingPowerFormatted}
              </div>
            </div>
            {lockExpiry && (
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={labelStyle}>lock expires</div>
                <div style={{ color: "#5a7a90", fontSize: 12 }}>{lockExpiry}</div>
              </div>
            )}
          </div>

          <div style={{ height: 1, background: "rgba(0,229,255,0.06)" }} />

          {/* Rename */}
          <div>
            <div style={{ ...labelStyle, marginBottom: 6 }}>designate</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                value={nameInput}
                onChange={(e) => onNameChange(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && canSave && onSaveName()
                }
                maxLength={32}
                placeholder={myWallet.customName || "enter designation\u2026"}
                disabled={isSaving}
                style={{
                  flex: 1,
                  border: "1px solid rgba(0,229,255,0.15)",
                  background: "rgba(0,229,255,0.03)",
                  color: "#c0d0e0",
                  padding: "6px 8px",
                  fontSize: 12,
                  fontFamily: "inherit",
                  outline: "none",
                  minWidth: 0,
                  letterSpacing: "0.02em",
                  transition: "border-color 0.15s",
                }}
              />
              <button
                onClick={onSaveName}
                disabled={!canSave}
                title="Confirm"
                style={{
                  flexShrink: 0,
                  border: canSave
                    ? "1px solid rgba(34,197,94,0.4)"
                    : "1px solid rgba(255,255,255,0.06)",
                  background: canSave
                    ? "rgba(34,197,94,0.1)"
                    : "rgba(255,255,255,0.02)",
                  color: canSave ? "#22c55e" : "#3a4a5a",
                  padding: "6px 10px",
                  cursor: canSave ? "pointer" : "not-allowed",
                  fontSize: 12,
                  fontFamily: "inherit",
                  fontWeight: 600,
                  transition: "all 0.15s",
                }}
              >
                {isSaving ? "\u00b7\u00b7\u00b7" : "\u2713"}
              </button>
            </div>
            {status && (
              <div
                style={{
                  marginTop: 6,
                  fontSize: 11,
                  color: status.includes("\u2713") ? "#22c55e" : "#5a8ab0",
                  letterSpacing: "0.02em",
                }}
              >
                {status}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Shared micro-styles ── */

const labelStyle: React.CSSProperties = {
  color: "#3a5068",
  fontSize: 9,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  marginBottom: 3,
};

const valueStyle: React.CSSProperties = {
  fontWeight: 600,
  color: "#c0d0e0",
  fontSize: 13,
  fontVariantNumeric: "tabular-nums",
};
