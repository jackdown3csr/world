"use client";

/**
 * SystemHud — all non-Canvas UI overlays:
 * - Photo mode overlay (flash + exit + shutter buttons)
 * - Desktop right column (system indicator, toolbar, wallet panel, directory, help)
 * - Mobile bottom sheet (panels + toolbar)
 * - Top-left stats overlay
 */

import React from "react";
import type { LayoutMode } from "@/lib/layout";
import type { VestingLayoutMode } from "@/lib/layout";
import type { SolarSystemData } from "@/lib/layout/types";
import type { BlockInfo } from "@/hooks/useBlock";
import HudToolbar from "./HudToolbar";
import WalletPanel from "./WalletPanel";
import DirectoryPanel from "./DirectoryPanel";
import HelpPanel from "./HelpPanel";
import type { WalletConnectionState, WalletConnectionActions } from "@/hooks/useWalletConnection";

interface CamDebug {
  pos: [number, number, number];
  target: [number, number, number];
  distTarget: number;
  distOrigin: number;
  tracking: string | null;
}

export interface SystemHudProps {
  isMobile: boolean;
  photoMode: boolean;
  flashCapture: boolean;
  showAllNames: boolean;
  showRenamedOnly: boolean;
  showNamesList: boolean;
  showHelp: boolean;
  showOrbits: boolean;
  showTrails: boolean;
  flyModeEnabled: boolean;
  layoutMode: LayoutMode;
  vestingLayoutMode: VestingLayoutMode;
  solarData: SolarSystemData;
  vestingData: SolarSystemData;
  selectedAddress: string | null;
  camDebug: CamDebug | null;
  blockInfo: BlockInfo | null;
  walletCount: number;
  vestingWalletCount: number;
  totalVotingPower: string;
  totalLocked: string;
  vestingTotalEntitled: string;
  vestingTotalClaimed: string;
  updatedAt: number;
  wc: WalletConnectionState & WalletConnectionActions;
  onCapturePhoto: () => void;
  onExitPhotoMode: () => void;
  onToggleLabels: () => void;
  onToggleRenamed: () => void;
  onToggleDirectory: () => void;
  onToggleHelp: () => void;
  onToggleOrbits: () => void;
  onToggleTrails: () => void;
  onReset: () => void;
  onToggleFlyMode: () => void;
  onPhotoMode: () => void;
  onToggleLayout: () => void;
  onToggleGnet: () => void;
  onToggleVestingClaimed: () => void;
  onJumpToStar: (starKey: string) => void;
  onDirectorySelect: (address: string, customName?: string) => void;
  onDisconnect: () => void;
}

export default function SystemHud({
  isMobile,
  photoMode,
  flashCapture,
  showAllNames,
  showRenamedOnly,
  showNamesList,
  showHelp,
  showOrbits,
  showTrails,
  flyModeEnabled,
  layoutMode,
  vestingLayoutMode,
  solarData,
  vestingData,
  selectedAddress,
  camDebug,
  blockInfo,
  walletCount,
  vestingWalletCount,
  totalVotingPower,
  totalLocked,
  vestingTotalEntitled,
  vestingTotalClaimed,
  updatedAt,
  wc,
  onCapturePhoto,
  onExitPhotoMode,
  onToggleLabels,
  onToggleRenamed,
  onToggleDirectory,
  onToggleHelp,
  onToggleOrbits,
  onToggleTrails,
  onReset,
  onToggleFlyMode,
  onPhotoMode,
  onToggleLayout,
  onToggleGnet,
  onToggleVestingClaimed,
  onJumpToStar,
  onDirectorySelect,
  onDisconnect,
}: SystemHudProps) {
  const nearVesting = camDebug ? camDebug.pos[0] > 8000 : false;

  const toolbarProps = {
    showAllNames,
    onToggleLabels,
    showRenamedOnly,
    onToggleRenamed,
    showDirectory: showNamesList,
    onToggleDirectory,
    showHelp,
    onToggleHelp,
    showOrbits,
    onToggleOrbits,
    showTrails,
    onToggleTrails,
    onReset,
    flyModeEnabled,
    onToggleFlyMode,
    onPhotoMode,
    rankedLayout: layoutMode !== "solar",
    onToggleLayout,
    gnetRanked: layoutMode === "ranked-gnet",
    onToggleGnet,
    nearVesting,
    vestingClaimed: vestingLayoutMode === "claimed",
    onToggleVestingClaimed,
  };

  const walletPanelProps = {
    connectedAddress: wc.connectedAddress,
    myWallet: wc.myWallet,
    nameInput: wc.nameInput,
    isSaving: wc.isSaving,
    status: wc.status,
    lockExpiry: wc.lockExpiry,
    onConnect: wc.connectWallet,
    onDisconnect,
    onSaveName: wc.savePlanetName,
    onNameChange: wc.setNameInput,
  };

  return (
    <>
      {/* ── Photo mode overlay ── */}
      {photoMode && (
        <>
          {flashCapture && (
            <div style={{
              position: "fixed", inset: 0, zIndex: 40,
              background: "rgba(255,255,255,0.35)",
              pointerEvents: "none",
            }} />
          )}
          <button
            onClick={onExitPhotoMode}
            title="Exit photo mode"
            style={{
              position: "fixed", top: 12, right: 12, zIndex: 35,
              width: 28, height: 28, borderRadius: "50%",
              border: "1px solid rgba(0,229,255,0.2)",
              background: "rgba(2,6,14,0.5)", color: "rgba(0,229,255,0.4)",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              padding: 0, transition: "all 0.2s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,229,255,0.12)"; e.currentTarget.style.color = "#00e5ff"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(2,6,14,0.5)"; e.currentTarget.style.color = "rgba(0,229,255,0.4)"; }}
          >
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
          <button
            onClick={onCapturePhoto}
            title="Capture screenshot"
            style={{
              position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)",
              zIndex: 35, width: 64, height: 64, borderRadius: "50%",
              border: "3px solid rgba(255,255,255,0.25)",
              background: "rgba(255,255,255,0.10)",
              backdropFilter: "blur(6px)",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              padding: 0, transition: "all 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.22)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.6)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.10)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)"; }}
          >
            <div style={{
              width: 38, height: 38, borderRadius: "50%",
              border: "2px solid rgba(255,255,255,0.5)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(255,255,255,0.75)" }} />
            </div>
          </button>
        </>
      )}

      {/* ── HUD overlay (hidden in photo mode) ── */}
      {!photoMode && (isMobile ? (
        /* ════ MOBILE: bottom sheet ════ */
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 20,
          fontFamily: "'JetBrains Mono','SF Mono','Fira Code',Menlo,monospace",
          fontSize: 12, color: "#8a9bb0",
          display: "flex", flexDirection: "column",
        }}>
          {(showNamesList || showHelp) && (
            <div style={{
              maxHeight: "55vh", overflowY: "auto",
              background: "rgba(2,6,14,0.96)",
              borderTop: "1px solid rgba(0,229,255,0.15)",
            }}>
              {showHelp      && <HelpPanel mobile />}
              {showNamesList && (
                <DirectoryPanel
                  solarData={nearVesting ? vestingData : solarData}
                  selectedAddress={selectedAddress}
                  onSelect={onDirectorySelect}
                />
              )}
            </div>
          )}
          <div style={{ borderTop: "1px solid rgba(0,229,255,0.08)" }}>
            <WalletPanel {...walletPanelProps} />
          </div>
          <HudToolbar mobile {...toolbarProps} />
        </div>
      ) : (
        /* ════ DESKTOP: right-side column ════ */
        <div style={{
          position: "fixed", right: 16, top: 16, zIndex: 20, width: 360,
          fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', Menlo, monospace",
          fontSize: 12, color: "#8a9bb0",
          display: "flex", flexDirection: "column", gap: 6,
        }}>
          {/* System indicator + jump button */}
          {(() => {
            const thisSystem  = nearVesting ? "VESTING" : "VESCROW";
            const otherKey    = nearVesting ? "__star_warm__" : "__star_cool__";
            const thisColor   = nearVesting ? "#00ffee" : "#ffc860";
            const otherColor  = nearVesting ? "#ffc860" : "#00ffee";
            return (
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "4px 8px",
                background: "rgba(2,6,14,0.6)", borderRadius: 4,
                border: `1px solid ${thisColor}28`,
                fontSize: 11, fontFamily: "inherit",
              }}>
                <span style={{ color: thisColor, fontWeight: 700, letterSpacing: "0.15em" }}>
                  ◉ {thisSystem}
                </span>
                <button
                  onClick={() => onJumpToStar(otherKey)}
                  title="Jump to other star system"
                  style={{
                    marginLeft: "auto", padding: "2px 8px",
                    background: "transparent", border: `1px solid ${otherColor}44`,
                    borderRadius: 3, color: otherColor, cursor: "pointer",
                    fontSize: 10, letterSpacing: "0.10em", fontFamily: "inherit",
                  }}
                >
                  → {nearVesting ? "VESCROW" : "VESTING"}
                </button>
              </div>
            );
          })()}

          <HudToolbar {...toolbarProps} />
          <WalletPanel {...walletPanelProps} />

          {showNamesList && (
            <DirectoryPanel
              solarData={nearVesting ? vestingData : solarData}
              selectedAddress={selectedAddress}
              onSelect={onDirectorySelect}
            />
          )}
          {showHelp && <HelpPanel />}
        </div>
      ))}

      {/* ── Top-left stats overlay ── */}
      {!photoMode && (
        <div style={{
          position: "fixed",
          left: isMobile ? 8 : 16,
          top: isMobile ? 8 : 16,
          zIndex: 20,
          fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
          fontSize: isMobile ? 10 : 11,
          color: "#8a9bb0",
          display: "flex",
          flexDirection: "column",
          gap: 3,
          letterSpacing: "0.06em",
          pointerEvents: "none",
          background: "rgba(2, 6, 14, 0.88)",
          border: "1px solid rgba(0,229,255,0.12)",
          borderLeft: "2px solid rgba(0,229,255,0.4)",
          borderRadius: 4,
          padding: isMobile ? "5px 8px" : "8px 12px",
        }}>
          <div style={{ color: nearVesting ? "#5a9aaa" : "#6a9aaa", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 2 }}>
            {isMobile
              ? (nearVesting ? "vestingα" : "vescrowα")
              : (nearVesting ? "vesting · galactica" : "vEscrow · galactica")}
          </div>
          {nearVesting ? (
            <>
              {vestingWalletCount > 0 && (
                <div>
                  <span style={{ color: "#6a8090" }}>{isMobile ? "w " : "wallets  "}</span>
                  <span style={{ color: "#8ab0c0" }}>{vestingWalletCount.toLocaleString()}</span>
                </div>
              )}
              {!isMobile && vestingWalletCount > 0 && (
                <>
                  <div>
                    <span style={{ color: "#6a8090" }}>entitled </span>
                    <span style={{ color: "#00ffee" }}>{vestingTotalEntitled}</span>
                  </div>
                  <div>
                    <span style={{ color: "#6a8090" }}>claimed  </span>
                    <span style={{ color: "#8ab0c0" }}>{vestingTotalClaimed}</span>
                  </div>
                  {blockInfo && (
                    <div style={{ marginTop: 2, fontSize: 9, color: "#4a6e7e", letterSpacing: "0.08em" }}>
                      <span style={{ color: "#3a5a6a" }}>blk </span>
                      <span style={{ color: "#5a9aaa" }}>{blockInfo.blockNumber.toLocaleString()}</span>
                    </div>
                  )}
                  <div style={{ marginTop: 3, fontSize: 9, color: "#4a6575", lineHeight: 1.4 }}>
                    data read from RewardDistributor<br/>
                    ranked by total entitled GNET
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              {walletCount > 0 && (
                <div>
                  <span style={{ color: "#6a8090" }}>{isMobile ? "w " : "wallets  "}</span>
                  <span style={{ color: "#8ab0c0" }}>{walletCount.toLocaleString()}</span>
                </div>
              )}
              {!isMobile && walletCount > 0 && (
                <>
                  <div>
                    <span style={{ color: "#6a8090" }}>power   </span>
                    <span style={{ color: "#00e5ff" }}>{totalVotingPower}</span>
                  </div>
                  <div>
                    <span style={{ color: "#6a8090" }}>locked  </span>
                    <span style={{ color: "#8ab0c0" }}>{totalLocked}</span>
                  </div>
                  {updatedAt > 0 && (
                    <div style={{ marginTop: 4, fontSize: 9, color: "#5a7a8a" }}>
                      updated {new Date(updatedAt).toLocaleTimeString()}
                    </div>
                  )}
                  {blockInfo && (
                    <div style={{ marginTop: 2, fontSize: 9, color: "#4a6e7e", letterSpacing: "0.08em" }}>
                      <span style={{ color: "#3a5a6a" }}>blk </span>
                      <span style={{ color: "#5a9aaa" }}>{blockInfo.blockNumber.toLocaleString()}</span>
                    </div>
                  )}
                  <div style={{ marginTop: 3, fontSize: 9, color: "#4a6575", lineHeight: 1.4 }}>
                    data read from vEscrow contract<br/>
                    ranked by veGNET voting power<br/>
                    locked GNET alone does not decide rank —<br/>
                    longer lock = higher power
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
