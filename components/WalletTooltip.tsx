"use client";

import React from "react";

interface WalletTooltipProps {
  address: string;
  balanceFormatted: string;
}

/**
 * HTML tooltip rendered as a drei <Html> child.
 * Dark translucent card showing address + balance.
 */
export default function WalletTooltip({
  address,
  balanceFormatted,
}: WalletTooltipProps) {
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;

  return (
    <div
      style={{
        pointerEvents: "none",
        background: "rgba(10, 10, 30, 0.88)",
        border: "1px solid rgba(100, 180, 255, 0.3)",
        borderRadius: 8,
        padding: "8px 14px",
        color: "#e0e8ff",
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 13,
        lineHeight: 1.5,
        whiteSpace: "nowrap",
        backdropFilter: "blur(6px)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
      }}
    >
      <div style={{ fontWeight: 600, letterSpacing: "0.03em" }}>{short}</div>
      <div style={{ color: "#7ec8ff", marginTop: 2 }}>{balanceFormatted}</div>
    </div>
  );
}
