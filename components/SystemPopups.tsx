"use client";

/**
 * SystemPopups — overlay modals triggered by user interactions in the scene.
 * - StorageSlotPopup: shown on Shift+click of a planet (shows vEscrow storage slot info)
 * - RoguePopup: shown when the rogue planet is clicked
 */

import React from "react";
import type { WalletEntry } from "@/lib/types";
import { ROGUE_HASH } from "./RoguePlanet";

/* ── Storage Slot Popup ── */
interface StorageSlotPopupProps {
  wallet: WalletEntry;
  onClose: () => void;
}

export function StorageSlotPopup({ wallet, onClose }: StorageSlotPopupProps) {
  const addr = wallet.address;
  const toH64 = (n: string | number) => {
    try { return "0x" + BigInt(n).toString(16).padStart(64, "0"); }
    catch { return "0x" + "0".repeat(64); }
  };
  // Deterministic-looking slot key derived from address bytes (cosmetic)
  const raw = addr.slice(2).toLowerCase().padEnd(64, "0");
  const magic = "deadbeef9a4c2f1e7b8d3a6c5e0f2b4d8a1c3e5f7b9d2a4c6e8f0b2d4a6c8e0";
  let slotKey = "0x";
  for (let i = 0; i < 64; i++) {
    slotKey += ((parseInt(raw[i] ?? "0", 16) ^ parseInt(magic[i], 16)) & 0xf).toString(16);
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "rgba(0,0,0,0.70)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "rgba(2,6,14,0.97)",
          border: "1px solid rgba(0,229,255,0.25)",
          borderLeft: "2px solid rgba(0,229,255,0.6)",
          borderRadius: 4,
          padding: "18px 22px",
          fontFamily: "'JetBrains Mono','SF Mono','Fira Code',Menlo,monospace",
          fontSize: 11,
          color: "#8ab0c0",
          maxWidth: 540,
          width: "calc(100vw - 48px)",
          lineHeight: 1.6,
        }}
      >
        <div style={{ color: "#00e5ff", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 10 }}>
          storage / eth_call ve.locked(addr)
        </div>
        <div style={{ color: "#4a6278", marginBottom: 8 }}>
          contract  <span style={{ color: "#6a8890" }}>0x9B3eFf...vEscrow</span><br />
          address   <span style={{ color: "#7a9aaa" }}>{addr}</span>
        </div>
        <div style={{ borderTop: "1px solid rgba(0,229,255,0.08)", paddingTop: 8, marginBottom: 8 }}>
          <span style={{ color: "#4a6278" }}>slot_key   keccak256(addr || 0x05):</span><br />
          <span style={{ color: "#5a7a8a" }}>{slotKey}</span>
        </div>
        <div style={{ marginBottom: 4 }}>
          <span style={{ color: "#4a6278" }}>locked.amount [int128] :</span><br />
          <span style={{ color: "#00e5ff" }}>{toH64(wallet.lockedGnet)}</span>
        </div>
        <div style={{ marginBottom: 4 }}>
          <span style={{ color: "#4a6278" }}>locked.end   [uint256]:</span><br />
          <span style={{ color: "#7ab0c0" }}>{toH64(wallet.lockEnd)}</span>
        </div>
        <div style={{ marginBottom: 12 }}>
          <span style={{ color: "#4a6278" }}>ve.balanceOf [veGNET] :</span><br />
          <span style={{ color: "#5a8890" }}>{toH64(wallet.votingPower)}</span>
        </div>
        <div style={{ textAlign: "right", color: "#3a5264", fontSize: 10 }}>
          [click anywhere to dismiss]
        </div>
      </div>
    </div>
  );
}

/* ── Rogue Planet Popup ── */
interface RoguePopupProps {
  onClose: () => void;
}

export function RoguePopup({ onClose }: RoguePopupProps) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 20000,
        display: "flex", alignItems: "center", justifyContent: "center",
        pointerEvents: "auto",
      }}
      onClick={onClose}
    >
      <style>{`
        @keyframes rogue-flicker {
          0%,100%{opacity:1} 7%{opacity:0.88} 8%{opacity:1}
          55%{opacity:1} 56%{opacity:0.72} 57%{opacity:1}
        }
        @keyframes rogue-scan { 0%{top:-4%} 100%{top:106%} }
        .rogue-box { animation: rogue-flicker 5s infinite; }
        .rogue-scan { position:relative; overflow:hidden; }
        .rogue-scan::after {
          content:""; position:absolute; left:0; right:0; height:1px;
          background:rgba(180,14,14,0.12);
          animation:rogue-scan 4s linear infinite;
          pointer-events:none;
        }
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        className="rogue-box rogue-scan"
        style={{
          background: "rgba(2, 3, 5, 0.94)",
          border: "1px solid rgba(180,30,30,0.22)",
          borderLeft: "2px solid rgba(200,30,30,0.55)",
          borderRadius: 3,
          padding: "14px 18px",
          fontFamily: "JetBrains Mono,SF Mono,Fira Code,Menlo,monospace",
          fontSize: 11,
          color: "#7a5050",
          lineHeight: 1.75,
          boxShadow: "0 2px 24px rgba(0,0,0,0.7), inset 0 0 30px rgba(140,10,10,0.03)",
          maxWidth: 380,
          width: "calc(100vw - 48px)",
        }}
      >
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:10 }}>
          <span style={{ color:"#8a2020", fontSize:9, letterSpacing:"0.22em", textTransform:"uppercase" }}>UNKNOWN BODY</span>
          <button
            onClick={onClose}
            style={{ background:"none", border:"none", color:"#4a2020", cursor:"pointer", fontSize:14, padding:0, fontFamily:"inherit" }}
          >×</button>
        </div>
        <div style={{ borderTop:"1px solid rgba(160,20,20,0.15)", paddingTop:8, marginBottom:8 }}>
          {([
            ["class",       "NO MATCH"],
            ["registry",    "NOT FOUND"],
            ["incl",        "65.0°"],
            ["period",      "950 s"],
            ["first seen",  "OUTSIDE KNOWN EPOCH"],
          ] as [string,string][]).map(([k,v]) => (
            <div key={k} style={{ display:"flex", gap:12, marginBottom:2 }}>
              <span style={{ color:"#3a1818", minWidth:80, flexShrink:0 }}>{k}</span>
              <span style={{ color:"#6a3030" }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ borderTop:"1px solid rgba(160,20,20,0.10)", paddingTop:8 }}>
          <div style={{ color:"#3a1818", fontSize:9, letterSpacing:"0.12em", marginBottom:4 }}>SIGNAL</div>
          <div style={{ wordBreak:"break-all", color:"#4a2525", fontSize:10, letterSpacing:"0.04em", lineHeight:1.6 }}>
            {ROGUE_HASH}
          </div>
        </div>
        <div style={{ marginTop:10, textAlign:"right", color:"#2e1414", fontSize:9, letterSpacing:"0.10em" }}>
          click to dismiss
        </div>
      </div>
    </div>
  );
}
