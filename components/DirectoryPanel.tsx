"use client";

import React from "react";
import type { SolarSystemData } from "@/lib/layout";

interface DirectoryPanelProps {
  solarData: SolarSystemData;
  selectedAddress: string | null;
  onSelect: (address: string, customName?: string) => void;
}

/* ── Shared styles ── */

const sectionHeader: React.CSSProperties = {
  padding: "8px 10px 4px",
  color: "#5a7a90",
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: "0.15em",
  textTransform: "uppercase",
  borderBottom: "1px solid rgba(0,229,255,0.04)",
};

function rowStyle(isSelected: boolean, indent = false): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: indent ? "2px 10px 2px 18px" : "4px 10px",
    border: "none",
    fontFamily: "inherit",
    background: isSelected ? "rgba(0,229,255,0.06)" : "transparent",
    cursor: "pointer",
    textAlign: "left",
    borderBottom: "1px solid rgba(255,255,255,0.02)",
    transition: "background 0.1s",
  };
}

function addrLabel(w: { customName?: string; address: string }) {
  return w.customName || `${w.address.slice(0, 6)}\u2026${w.address.slice(-4)}`;
}

export default function DirectoryPanel({
  solarData,
  selectedAddress,
  onSelect,
}: DirectoryPanelProps) {
  const sel = selectedAddress?.toLowerCase() ?? "";

  return (
    <div
      style={{
        background: "rgba(2, 6, 14, 0.92)",
        border: "1px solid rgba(0,229,255,0.12)",
        borderLeft: "2px solid rgba(0,229,255,0.25)",
        maxHeight: "60vh",
        overflowY: "auto",
        padding: 0,
      }}
    >
      {/* ── Planets ── */}
      <div style={sectionHeader}>planets // {solarData.planets.length}</div>
      {solarData.planets.map((p) => (
        <button
          key={p.wallet.address}
          onClick={() => onSelect(p.wallet.address, p.wallet.customName)}
          style={rowStyle(sel === p.wallet.address.toLowerCase())}
        >
          <span style={{ width: 6, height: 6, flexShrink: 0, background: `hsl(${p.hue * 360}, 45%, 50%)`, boxShadow: `0 0 4px hsla(${p.hue * 360}, 50%, 50%, 0.4)` }} />
          <span style={{ color: "#8a9bb0", fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {addrLabel(p.wallet)}
          </span>
          <span style={{ color: "#00e5ff", fontSize: 9, flexShrink: 0, fontVariantNumeric: "tabular-nums", opacity: 0.7 }}>
            {p.wallet.votingPowerFormatted}
          </span>
        </button>
      ))}

      {/* ── Moons ── */}
      <div style={sectionHeader}>
        moons // {solarData.planets.reduce((n, p) => n + p.moons.length, 0)}
      </div>
      {solarData.planets.flatMap((p) =>
        p.moons.map((m) => (
          <button
            key={m.wallet.address}
            onClick={() => onSelect(m.wallet.address, m.wallet.customName)}
            style={rowStyle(sel === m.wallet.address.toLowerCase(), true)}
          >
            <span style={{ width: 4, height: 4, flexShrink: 0, background: `hsl(${m.hue * 360}, 30%, 42%)` }} />
            <span style={{ color: "#8a9bb0", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {addrLabel(m.wallet)}
            </span>
            <span style={{ color: "#00e5ff", fontSize: 9, flexShrink: 0, fontVariantNumeric: "tabular-nums", opacity: 0.6 }}>
              {m.wallet.votingPowerFormatted}
            </span>
          </button>
        )),
      )}

      {/* ── Ring ── */}
      {solarData.planets.some((p) => p.ringWallets.length > 0) && (
        <>
          <div style={sectionHeader}>
            ring //{" "}
            {solarData.planets.reduce((n, p) => n + p.ringWallets.length, 0)}
          </div>
          {solarData.planets.flatMap((p) =>
            p.ringWallets.map((r) => (
              <button
                key={r.wallet.address}
                onClick={() => onSelect(r.wallet.address, r.wallet.customName)}
                style={rowStyle(sel === r.wallet.address.toLowerCase(), true)}
              >
                <span style={{ color: "#7a8e9e", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {addrLabel(r.wallet)}
                </span>
                <span style={{ color: "#00e5ff", fontSize: 9, flexShrink: 0, fontVariantNumeric: "tabular-nums", opacity: 0.6 }}>
                  {r.wallet.votingPowerFormatted}
                </span>
              </button>
            )),
          )}
        </>
      )}

      {/* ── Asteroids ── */}
      {solarData.asteroids.length > 0 && (
        <>
          <div style={sectionHeader}>
            asteroids // {solarData.asteroids.length}
          </div>
          {solarData.asteroids.map((a) => (
            <button
              key={a.wallet.address}
              onClick={() => onSelect(a.wallet.address, a.wallet.customName)}
              style={rowStyle(sel === a.wallet.address.toLowerCase(), true)}
            >
              <span style={{ color: "#7a8e9e", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {addrLabel(a.wallet)}
              </span>
              <span style={{ color: "#00e5ff", fontSize: 9, flexShrink: 0, fontVariantNumeric: "tabular-nums", opacity: 0.6 }}>
                {a.wallet.votingPowerFormatted}
              </span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}
