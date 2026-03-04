"use client";

import React from "react";

const s = {
  box: {
    background: "rgba(2, 6, 14, 0.92)",
    border: "1px solid rgba(0,229,255,0.12)",
    borderLeft: "2px solid rgba(0,229,255,0.25)",
    padding: "12px 14px",
    maxHeight: 480,
    overflowY: "auto" as const,
    fontSize: 10,
    lineHeight: 1.65,
    color: "#7a94aa",
    fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
  },
  title: {
    color: "#d8f6ff",
    fontSize: 11,
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    marginBottom: 8,
    fontWeight: 700,
  },
  h: {
    color: "#00e5ff",
    fontSize: 9,
    letterSpacing: "0.15em",
    textTransform: "uppercase" as const,
    margin: "12px 0 4px",
    fontWeight: 700,
  },
  block: { margin: "4px 0" },
  li: { margin: "2px 0" },
  cyan: { color: "#00e5ff" },
  dim: { color: "#4a6278" },
};

export default function HelpPanel({ mobile = false }: { mobile?: boolean }) {
  return (
    <div style={s.box}>
      <div style={s.title}>Guide</div>

      <div style={{ ...s.h, marginTop: 0 }}>Quick start</div>
      <p style={s.block}>
        Lock <span style={s.cyan}>GNET</span> in <span style={s.cyan}>veGNET</span>.
        Every locker appears as a body in the system. Higher <span style={s.cyan}>voting power</span>
        means higher rank and bigger body type.
      </p>

      <div style={s.h}>How to become a planet</div>
      <p style={s.block}>
        1. Lock <span style={s.cyan}>GNET</span> on <span style={s.cyan}>Galactica mainnet</span><br />
        2. Increase amount / lock time to grow <span style={s.cyan}>voting power</span><br />
        3. Reach <span style={s.cyan}>Top 20</span> to become a planet<br />
        4. Connect wallet here and set your custom body name
      </p>

      <div style={s.h}>Navigation</div>
      <p style={s.block}>
        {mobile ? (
          <>
            <span style={s.cyan}>One finger drag</span> — look around (fly mode)<br />
            <span style={s.cyan}>Pinch</span> — move forward / backward<br />
            <span style={s.cyan}>Tap body</span> — fly to it &amp; orbit<br />
            <span style={s.cyan}>Escape</span> — detach, return to free-fly<br />
            <span style={s.cyan}>Reset</span> — overview + free-fly
          </>
        ) : (
          <>
            <span style={s.cyan}>Drag</span> — look around (fly) / orbit body<br />
            <span style={s.cyan}>Scroll</span> — fly forward/back or zoom<br />
            <span style={s.cyan}>Click body</span> — fly to it &amp; enter orbit<br />
            <span style={s.cyan}>Escape</span> — detach, return to free-fly<br />
            <span style={s.cyan}>Shift + click</span> — inspect raw contract slot<br />
            <span style={s.cyan}>Reset</span> — overview + free-fly
          </>
        )}
      </p>

      <div style={s.h}>HUD controls</div>
      <p style={s.block}>
        <span style={s.cyan}>ORBITS</span> — toggle orbit rings<br />
        <span style={s.cyan}>TRAILS</span> — toggle orbit history trails<br />
        <span style={s.cyan}>LABELS</span> — show/hide all labels<br />
        <span style={s.cyan}>NAMED</span> — show only renamed wallets<br />
        <span style={s.cyan}>RANKED</span> — sort planets by VP rank (closest = highest)<br />
        <span style={s.cyan}>GNET</span> — when ranked, sort by locked GNET instead<br />
        <span style={s.cyan}>SEARCH</span> — open wallet directory<br />
        <span style={s.cyan}>HELP</span> — toggle this panel<br />
        <span style={s.cyan}>RESET</span> — camera overview
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

      <div style={s.h}>Visual indicators</div>
      <p style={s.block}>
        <span style={{ color: "#ff4422" }}>Red pulse</span> — lock expires in &lt;30 days<br />
        <span style={{ color: "#f08822" }}>Amber pulse</span> — lock expires in 30–90 days<br />
        <span style={s.cyan}>blk N</span> — latest block from chain (stats overlay)<br />
         <span style={s.cyan}>Sun CME ring</span> — plasma burst expands on each new block
      </p>
    </div>
  );
}
