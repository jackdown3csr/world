"use client";

import React from "react";
import { navigationShortcuts, photoModeShortcuts, toolbarActionShortcuts } from "@/lib/shortcuts";

type SectionId =
  | "shortcuts"
  | "scene"
  | "systems"
  | "navigation"
  | "toolbar"
  | "vescrow"
  | "vesting"
  | "pool"
  | "network"
  | "wallet";

interface HelpSectionDef {
  id: SectionId;
  title: string;
  hint: string;
  summary: string;
  render: (mobile: boolean) => React.ReactNode;
}

const s = {
  box: {
    background: "linear-gradient(180deg, rgba(4,10,18,0.96), rgba(2,6,14,0.92))",
    border: "1px solid rgba(0,229,255,0.10)",
    borderTop: "none",
    borderLeft: "2px solid rgba(0,229,255,0.24)",
    borderRadius: "0 0 0 8px",
    padding: "10px 14px 10px",
    maxHeight: 460,
    overflowY: "auto" as const,
    fontSize: 10,
    lineHeight: 1.6,
    color: "#7a94aa",
    fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
  },
  accordion: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  },
  section: {
    border: "1px solid rgba(255,255,255,0.06)",
    background: "rgba(255,255,255,0.02)",
    overflow: "hidden",
  },
  sectionHeader: {
    width: "100%",
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 10,
    alignItems: "center",
    background: "rgba(255,255,255,0.015)",
    border: "none",
    color: "inherit",
    padding: "9px 10px",
    cursor: "pointer",
    textAlign: "left" as const,
    fontFamily: "inherit",
  },
  sectionHeaderMain: {
    minWidth: 0,
  },
  sectionTitle: {
    color: "#cfe9f3",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.10em",
    textTransform: "uppercase" as const,
    marginBottom: 2,
  },
  sectionSummary: {
    color: "#6f879a",
    fontSize: 9,
    lineHeight: 1.45,
  },
  sectionHint: {
    color: "#4d6879",
    fontSize: 8,
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    whiteSpace: "nowrap" as const,
  },
  sectionBody: {
    padding: "0 10px 10px",
    borderTop: "1px solid rgba(255,255,255,0.05)",
    background: "rgba(0,0,0,0.08)",
  },
  h: {
    color: "#00e5ff",
    fontSize: 9,
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
    margin: "10px 0 4px",
    fontWeight: 700,
  },
  block: {
    margin: "6px 0",
  },
  cyan: { color: "#00e5ff" },
  dim: { color: "#4a6278" },
  list: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 4,
    margin: "6px 0",
  },
  item: {
    display: "grid",
    gridTemplateColumns: "112px 1fr",
    gap: 8,
    alignItems: "start",
  },
  key: {
    color: "#00e5ff",
    whiteSpace: "nowrap" as const,
  },
  table: {
    borderCollapse: "collapse" as const,
    width: "100%",
    marginTop: 6,
  },
};

const sections: HelpSectionDef[] = [
  {
    id: "scene",
    title: "Scene Model",
    hint: "what you see",
    summary: "What the main layers represent.",
    render: () => (
      <>
        <p style={s.block}>
          The scene is a visual map of app data. Objects stand for wallets, vesting entries,
          or protocol route markers.
        </p>
      </>
    ),
  },
  {
    id: "systems",
    title: "Systems",
    hint: "zones",
    summary: "What belongs to vEscrow, vesting, and route markers.",
    render: () => (
      <>
        <div style={{ ...s.h, marginTop: 8 }}>vEscrow</div>
        <p style={s.block}>
          The main system represents wallets locking <span style={s.cyan}>GNET</span> on
          <span style={s.cyan}> Galactica mainnet</span>. Rank, scale, and body type are driven by
          <span style={s.cyan}> veGNET voting power</span>, not by locked GNET alone.
        </p>
        <p style={s.block}>
          veGNET decays linearly toward expiry, the max lock is <span style={s.cyan}>730 days</span>,
          and <span style={s.cyan}>adding tokens does not extend</span> the unlock date unless the user
          explicitly relocks or extends.
        </p>
        <div style={s.h}>Vesting</div>
        <p style={s.block}>
          The vesting system is a separate layer focused on <span style={s.cyan}>entitled</span>,
          <span style={s.cyan}> claimed</span>, and claim progress. It is not just another version
          of the vEscrow rank ladder.
        </p>
        <div style={s.h}>gUBI Pool</div>
        <p style={s.block}>
          The pool system is a smaller asset map. Its star represents the <span style={s.cyan}>gUBI</span>
          pool, while orbiting planets represent composition tokens ordered by current USD weight.
        </p>
        <div style={s.h}>Bridge layer</div>
        <p style={s.block}>
          Bridge markers such as <span style={s.cyan}>Hyperlane Nexus</span> act as scene-level portals
          and navigation points layered on top of the Galactica-centered view.
        </p>
        <div style={s.h}>Staking Remnant</div>
        <p style={s.block}>
          A compact remnant system showing the deprecated staking contract. Its asteroid belt
          visualises remaining staked wallets as an inert debris field.
        </p>
      </>
    ),
  },
  {
    id: "navigation",
    title: "Navigation",
    hint: "movement",
    summary: "Flight, orbit focus, and direct interaction rules.",
    render: (mobile) => (
      <div style={s.list}>
        {mobile ? (
          <>
            <div style={s.item}><span style={s.key}>one finger drag</span><span>Look around in fly mode.</span></div>
            <div style={s.item}><span style={s.key}>pinch</span><span>Move forward or backward.</span></div>
            <div style={s.item}><span style={s.key}>tap body</span><span>Focus an object and enter orbit.</span></div>
            <div style={s.item}><span style={s.key}>reset</span><span>Return to the overview camera.</span></div>
          </>
        ) : (
          <>
            <div style={s.item}><span style={s.key}>drag</span><span>Look around or orbit the focused target.</span></div>
            <div style={s.item}><span style={s.key}>click body</span><span>Focus the selected object.</span></div>
            <div style={s.item}><span style={s.key}>Shift + click</span><span>Inspect a raw contract storage view.</span></div>
          </>
        )}
      </div>
    ),
  },
  {
    id: "toolbar",
    title: "Toolbar",
    hint: "controls",
    summary: "Top-bar controls in the same order as the header.",
    render: () => (
      <>
        <div style={s.h}>Navigation</div>
        <div style={s.list}>
          <div style={s.item}><span style={s.key}>info</span><span>Open system stats and context.</span></div>
          <div style={s.item}><span style={s.key}>list</span><span>Open the directory for the active system.</span></div>
        </div>
        <div style={s.h}>Browse</div>
        <div style={s.list}>
          <div style={s.item}><span style={s.key}>labels</span><span>Show or hide all labels.</span></div>
          <div style={s.item}><span style={s.key}>named</span><span>Keep only custom-named labels visible.</span></div>
        </div>
        <div style={s.h}>Scene</div>
        <div style={s.list}>
          <div style={s.item}><span style={s.key}>orbits</span><span>Toggle orbit rings.</span></div>
          <div style={s.item}><span style={s.key}>traffic</span><span>Toggle transaction trail visualisation.</span></div>
        </div>
        <div style={s.h}>Layout</div>
        <div style={s.list}>
          <div style={s.item}><span style={s.key}>ranked</span><span>Reorder the active system by rank.</span></div>
          <div style={s.item}><span style={s.key}>gnet</span><span>When ranked, sort by locked GNET instead of voting power.</span></div>
          <div style={s.item}><span style={s.key}>claimed</span><span>In vesting, switch to claimed-state emphasis.</span></div>
        </div>
        <div style={s.h}>Modes</div>
        <div style={s.list}>
          <div style={s.item}><span style={s.key}>fly</span><span>Toggle ship-style movement mode.</span></div>
          <div style={s.item}><span style={s.key}>photo</span><span>Open screenshot mode.</span></div>
        </div>
        <div style={s.h}>Utility</div>
        <div style={s.list}>
          <div style={s.item}><span style={s.key}>reset</span><span>Return to overview.</span></div>
          <div style={s.item}><span style={s.key}>help</span><span>Open or close this guide.</span></div>
          <div style={s.item}><span style={s.key}>bug</span><span>Open or close bug report.</span></div>
        </div>
      </>
    ),
  },
  {
    id: "vescrow",
    title: "vEscrow Ranks",
    hint: "rank map",
    summary: "How rank maps to body classes in the vEscrow system.",
    render: () => (
      <>
        <p style={s.block}>
          Higher veGNET voting power moves wallets upward through the vEscrow body ladder.
        </p>
        <p style={s.block}>
          veGNET reaches full weight at <span style={s.cyan}>730 days</span>, decays linearly to zero,
          and relocking before expiry avoids a zero-power gap. Adding more GNET and extending the lock
          are separate actions.
        </p>
        <table style={s.table}>
          <tbody>
            {([
              ["#1 - #4", "Gas Giant", "Top voting-power wallets"],
              ["#5 - #8", "Ice Giant", "Next high-rank wallets"],
              ["#9 - #14", "Terrestrial", "Mid-upper voting-power tier"],
              ["#15 - #20", "Rocky", "Remaining planetary top 20"],
              ["#21 - #60", "Moon", "Secondary orbiting wallets"],
              ["#61 - #190", "Ring Particle", "Dense ring layer around the top host"],
              ["#191+", "Asteroid", "Long-tail outer belt wallets"],
            ] as const).map(([rank, type, desc]) => (
              <tr key={rank}>
                <td style={{ color: "#00e5ff", padding: "0 8px 6px 0", whiteSpace: "nowrap", verticalAlign: "top" }}>{rank}</td>
                <td style={{ color: "#8aafcc", padding: "0 8px 6px 0", whiteSpace: "nowrap", verticalAlign: "top" }}>{type}</td>
                <td style={{ ...s.dim, paddingBottom: 6 }}>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    ),
  },
  {
    id: "vesting",
    title: "Vesting Layer",
    hint: "distribution view",
    summary: "What the vesting view focuses on.",
    render: () => (
      <>
        <p style={s.block}>
          Vesting uses its own category ladder driven by entitled or claimed allocation state.
        </p>
        <table style={s.table}>
          <tbody>
            {([
              ["#1 - #2", "Protoplanetary", "Largest forming worlds in the vesting system"],
              ["#3 - #4", "Lava Ocean", "Hot mid-tier worlds"],
              ["#5", "Molten", "Final top-5 planetary body"],
              ["#6 - #15", "Moons", "Secondary bodies distributed around the top 5"],
              ["#16+", "Disk Material", "Dense protoplanetary disk rendered as debris"],
              ["epoch", "Epoch Satellite", "Dedicated timing probe outside the main disk"],
            ] as const).map(([rank, type, desc]) => (
              <tr key={rank}>
                <td style={{ color: "#00e5ff", padding: "0 8px 6px 0", whiteSpace: "nowrap", verticalAlign: "top" }}>{rank}</td>
                <td style={{ color: "#8aafcc", padding: "0 8px 6px 0", whiteSpace: "nowrap", verticalAlign: "top" }}>{type}</td>
                <td style={{ ...s.dim, paddingBottom: 6 }}>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    ),
  },
  {
    id: "pool",
    title: "gUBI Pool",
    hint: "asset mix",
    summary: "How the pool star maps composition tokens into planets.",
    render: () => (
      <>
        <p style={s.block}>
          The gUBI pool is rendered as a compact dwarf-star system. Each planet is one pool token,
          and ordering follows current <span style={s.cyan}>USD value share</span> from the pool API.
        </p>
        <table style={s.table}>
          <tbody>
            {([
              ["star", "gUBI Pool", "Pool-level worth, price, and supply context"],
              ["planet", "Composition Token", "One orbiting token such as WGNET or archai"],
              ["order", "USD Weight", "Higher pool value moves a token inward and enlarges it"],
              ["tooltip", "Balance + USD", "Shows token balance, USD price, value, and share"],
            ] as const).map(([rank, type, desc]) => (
              <tr key={rank}>
                <td style={{ color: "#00e5ff", padding: "0 8px 6px 0", whiteSpace: "nowrap", verticalAlign: "top" }}>{rank}</td>
                <td style={{ color: "#8aafcc", padding: "0 8px 6px 0", whiteSpace: "nowrap", verticalAlign: "top" }}>{type}</td>
                <td style={{ ...s.dim, paddingBottom: 6 }}>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    ),
  },
  {
    id: "network",
    title: "Routes",
    hint: "bridge markers",
    summary: "What route objects like Hyperlane Nexus or Canonical Bridge mean in the scene.",
    render: () => (
      <>
        <p style={s.block}>
          Route objects are not regular wallet bodies. They mark protocol connections and give
          you fixed navigation targets inside the scene.
        </p>
        <div style={s.list}>
          <div style={s.item}><span style={s.key}>hyperlane nexus</span><span>Bridge route currently represented as its own scene object layer.</span></div>
          <div style={s.item}><span style={s.key}>canonical bridge</span><span>Native Arbitrum Orbit withdrawal route when that marker is added.</span></div>
        </div>
      </>
    ),
  },
  {
    id: "wallet",
    title: "Connected Wallet",
    hint: "identity",
    summary: "How wallet connection and custom naming affect the scene.",
    render: () => (
      <>
        <p style={s.block}>
          Connect the wallet you want to identify in the scene. When that address exists in
          the loaded dataset, the app can focus its object and attach a custom designation to it.
        </p>
        <div style={s.list}>
          <div style={s.item}><span style={s.key}>wallet</span><span>Connect or disconnect the active address.</span></div>
          <div style={s.item}><span style={s.key}>designation</span><span>Custom label signed by the connected wallet.</span></div>
          <div style={s.item}><span style={s.key}>focus panel</span><span>Primary place for detailed wallet-specific context after selection.</span></div>
        </div>
      </>
    ),
  },
  {
    id: "shortcuts",
    title: "Shortcuts",
    hint: "hotkeys",
    summary: "All keyboard shortcuts in one place, grouped by context.",
    render: () => (
      <>
        <div style={s.h}>Toolbar</div>
        <div style={s.list}>
          {toolbarActionShortcuts.map((item) => (
            <div key={`${item.context}-${item.keys}`} style={s.item}>
              <span style={s.key}>{item.keys}</span>
              <span>{item.description}</span>
            </div>
          ))}
        </div>
        <div style={s.h}>Navigation</div>
        <div style={s.list}>
          {navigationShortcuts.map((item) => (
            <div key={`${item.context}-${item.keys}`} style={s.item}>
              <span style={s.key}>{item.keys}</span>
              <span>{item.description}</span>
            </div>
          ))}
        </div>
        <div style={s.h}>Photo Mode</div>
        <div style={s.list}>
          {photoModeShortcuts.map((item) => (
            <div key={`${item.context}-${item.keys}`} style={s.item}>
              <span style={s.key}>{item.keys}</span>
              <span>{item.description}</span>
            </div>
          ))}
        </div>
      </>
    ),
  },
];

export default function HelpPanel({ mobile = false }: { mobile?: boolean }) {
  const [openSection, setOpenSection] = React.useState<SectionId>("scene");

  return (
    <div style={{
      ...s.box,
      ...(mobile ? { maxHeight: "none", borderRadius: 0, borderLeft: "none" } : {}),
    }}>
      <div style={s.accordion}>
        {sections.map((section) => {
          const open = openSection === section.id;
          return (
            <div key={section.id} style={s.section}>
              <button
                type="button"
                onClick={() => setOpenSection(open ? "scene" : section.id)}
                style={s.sectionHeader}
                aria-expanded={open}
              >
                <div style={s.sectionHeaderMain}>
                  <div style={s.sectionTitle}>{section.title}</div>
                  <div style={s.sectionSummary}>{section.summary}</div>
                </div>
                <div style={s.sectionHint}>{open ? "open" : section.hint}</div>
              </button>

              {open && <div style={s.sectionBody}>{section.render(mobile)}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
