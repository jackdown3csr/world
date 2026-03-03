"use client";

import React from "react";

const s = {
  box: {
    background: "rgba(2, 6, 14, 0.92)",
    border: "1px solid rgba(0,229,255,0.12)",
    borderLeft: "2px solid rgba(0,229,255,0.25)",
    padding: "12px 14px",
    maxHeight: 340,
    overflowY: "auto" as const,
    fontSize: 10,
    lineHeight: 1.7,
    color: "#7a94aa",
    fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
  },
  h: {
    color: "#00e5ff",
    fontSize: 9,
    letterSpacing: "0.15em",
    textTransform: "uppercase" as const,
    margin: "10px 0 4px",
  },
  cyan: { color: "#00e5ff" },
  dim: { color: "#4a6278" },
};

export default function HelpPanel({ mobile = false }: { mobile?: boolean }) {
  return (
    <div style={s.box}>
      <div style={{ ...s.h, marginTop: 0 }}>How it works</div>
      <p style={{ margin: "4px 0" }}>
        Every wallet that locks <span style={s.cyan}>GNET</span> in the{" "}
        <span style={s.cyan}>veGNET</span> voting escrow becomes a celestial
        body. Your rank is determined by your{" "}
        <span style={s.cyan}>voting power</span> (veGNET balance).
      </p>

      <div style={s.h}>Tier system</div>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <tbody>
          {([
            ["#1 – #4", "Gas Giant", "Jupiter-like outer planets"],
            ["#5 – #8", "Ice Giant", "Neptune/Uranus-like worlds"],
            ["#9 – #14", "Terrestrial", "Earth-like with oceans & clouds"],
            ["#15 – #20", "Rocky", "Mercury/Mars-like inner planets"],
            ["#21 – #60", "Moon", "Orbit their parent planet"],
            ["#61 – #190", "Ring Particle", "Saturn's ring (rank #1 host)"],
            ["#191+", "Asteroid", "Outer asteroid belt"],
          ] as const).map(([rank, type, desc]) => (
            <tr key={rank}>
              <td style={{ color: "#00e5ff", paddingRight: 8, whiteSpace: "nowrap" }}>{rank}</td>
              <td style={{ color: "#8aafcc", paddingRight: 8, whiteSpace: "nowrap" }}>{type}</td>
              <td style={s.dim}>{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={s.h}>Become a planet</div>
      <p style={{ margin: "4px 0" }}>
        1. Lock <span style={s.cyan}>GNET</span> on{" "}
        <span style={s.cyan}>Galactica mainnet</span> via the veGNET contract<br />
        2. The more you lock & the longer the lock, the higher your voting power<br />
        3. Top 20 by voting power → you are a <span style={s.cyan}>planet</span><br />
        4. Connect your wallet here to <span style={s.cyan}>name</span> your body
      </p>

      <div style={s.h}>Controls</div>
      <p style={{ margin: "4px 0" }}>
        {mobile ? (
          <>
            <span style={s.cyan}>Pinch</span> — zoom in/out<br />
            <span style={s.cyan}>One finger</span> — rotate camera<br />
            <span style={s.cyan}>Tap</span> — select &amp; fly to body<br />
            <span style={s.cyan}>RST</span> — reset camera
          </>
        ) : (
          <>
            <span style={s.cyan}>Scroll</span> — zoom in/out<br />
            <span style={s.cyan}>Drag</span> — rotate camera<br />
            <span style={s.cyan}>Click</span> — select &amp; fly to body<br />
            <span style={s.cyan}>RST</span> — reset camera
          </>
        )}
      </p>

      <div style={s.h}>HUD buttons</div>
      <p style={{ margin: "4px 0" }}>
        <span style={s.cyan}>LABELS</span> — show all wallet labels<br />
        <span style={s.cyan}>NAMED</span> — show only renamed wallets<br />
        <span style={s.cyan}>DIR</span> — open wallet directory<br />
        <span style={s.cyan}>HELP</span> — this panel
      </p>
    </div>
  );
}
