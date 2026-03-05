"use client";

import React, { useMemo, useRef, useCallback, useState, forwardRef, useImperativeHandle } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import FreeLookControls from "./FreeLookControls";
import type { FreeLookHandle } from "./FreeLookControls";
import type { CameraMode } from "./CameraController";

import { useWallets } from "@/hooks/useWallets";
import { useVestingWallets } from "@/hooks/useVestingWallets";
import { useWalletConnection } from "@/hooks/useWalletConnection";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useBlock } from "@/hooks/useBlock";
import { useFaucet } from "@/hooks/useFaucet";
import { buildSolarSystem, buildVestingSystem } from "@/lib/layout";
import type { LayoutMode } from "@/lib/layout";
import { formatBalance } from "@/lib/formatBalance";

import StarSystem from "./StarSystem";
import GalaxyBackground from "./GalaxyBackground";
import CameraController from "./CameraController";
import Comet from "./Comet";
import SplashScreen from "./SplashScreen";
import HudToolbar from "./HudToolbar";
import WalletPanel from "./WalletPanel";
import DirectoryPanel from "./DirectoryPanel";
import HelpPanel from "./HelpPanel";
import RoguePlanet, { ROGUE_HASH } from "./RoguePlanet";
import FaucetSatellite from "./FaucetSatellite";
import type { WalletEntry } from "@/lib/types";

/* ── Screenshot helper (lives inside Canvas to access gl) ── */
interface ScreenshotHandle { capture: () => void; }
const ScreenshotHelper = forwardRef<ScreenshotHandle>(function ScreenshotHelper(_, ref) {
  const { gl, scene, camera } = useThree();
  useImperativeHandle(ref, () => ({
    capture() {
      gl.render(scene, camera);
      const dataURL = gl.domElement.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = dataURL;
      a.download = `vescrow-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.png`;
      a.click();
    },
  }), [gl, scene, camera]);
  return null;
});

/**
 * Top-level 3D scene: a solar system where each wallet is a celestial body.
 * Purely a composition layer — all logic lives in hooks and child components.
 */
export default function SolarSystem() {
  /* ── Mobile detection ── */
  const isMobile = useIsMobile();

  /* ── Data ── */
  const { wallets, loading, refetch, updatedAt } = useWallets();
  const { wallets: vestingWallets } = useVestingWallets();
  const faucetStats = useFaucet();
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("solar");
  const solarData = useMemo(() => buildSolarSystem(wallets, layoutMode), [wallets, layoutMode]);
  const vestingData = useMemo(() => buildVestingSystem(vestingWallets), [vestingWallets]);

  /* ── Aggregate stats for Sun label ── */
  const { totalVotingPower, totalLocked } = useMemo(() => {
    if (wallets.length === 0) return { totalVotingPower: "", totalLocked: "" };
    let vp = 0n;
    let lk = 0n;
    for (const w of wallets) {
      if (w.votingPower && w.votingPower !== "0") vp += BigInt(w.votingPower);
      if (w.lockedGnet && w.lockedGnet !== "0") lk += BigInt(w.lockedGnet);
    }
    return {
      totalVotingPower: formatBalance(vp.toString(), "veGNET"),
      totalLocked: formatBalance(lk.toString(), "GNET"),
    };
  }, [wallets]);

  /* ── Selection state ── */
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [selectionVersion, setSelectionVersion] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);

  const selectBody = useCallback((addr: string) => {
    setSelectedAddress(addr);
    setSelectionVersion((v) => v + 1);
    setPanelOpen(true);
  }, []);

  /* ── Wallet connection ── */
  const wc = useWalletConnection(wallets, refetch, selectBody);

  /* ── UI toggles ── */
  const [showAllNames, setShowAllNames] = useState(true);
  const [showRenamedOnly, setShowRenamedOnly] = useState(false);
  const [showNamesList, setShowNamesList] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showOrbits, setShowOrbits] = useState(true);
  const [showTrails, setShowTrails] = useState(false);
  const [photoMode, setPhotoMode] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1700);
  const [resetRequested, setResetRequested] = useState(false);

  /* ── Shift+click → storage slot popup ── */
  const [storageWallet, setStorageWallet] = useState<WalletEntry | null>(null);

  /* ── Rogue planet click popup ── */
  const [rogueClicked, setRogueClicked] = useState(false);

  /* ── Block clock ── */
  const [blockFlash, setBlockFlash] = useState(0); // increments each block
  const blockInfo = useBlock(30_000, () => setBlockFlash((n) => n + 1));

  /* ── Camera debug ── */
  interface CamDebug { pos: [number,number,number]; target: [number,number,number]; distTarget: number; distOrigin: number; tracking: string | null; }
  const [camDebug, setCamDebug] = useState<CamDebug | null>(null);

  /* ── Camera ── */
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const freelookRef = useRef<FreeLookHandle>(null);
  const [cameraMode, setCameraMode] = useState<CameraMode>("orbit");
  const [flyModeEnabled, setFlyModeEnabled] = useState(false);
  const screenshotRef = useRef<ScreenshotHandle>(null);
  const [flashCapture, setFlashCapture] = useState(false);

  const doCapture = useCallback(() => {
    screenshotRef.current?.capture();
    setFlashCapture(true);
    setTimeout(() => setFlashCapture(false), 350);
  }, []);

  /* ── Directory item handler ── */
  const handleDirectorySelect = useCallback(
    (address: string, customName?: string) => {
      selectBody(address);
      wc.setNameInput(customName || "");
      // Directory stays open until user explicitly closes it
    },
    [selectBody, wc],
  );

  /* ── Scene item handler ── */
  const handleSceneSelect = useCallback(
    (address: string) => {
      selectBody(address);
      const wallet = wallets.find(
        (w) => w.address.toLowerCase() === address.toLowerCase(),
      );
      wc.setNameInput(wallet?.customName || "");
    },
    [selectBody, wallets, wc],
  );

  return (
    <>
      <SplashScreen loading={loading} />

      <Canvas
        camera={{ position: [0, 500, 1600], fov: 55, near: 0.1, far: 16000 }}
        style={{ width: "100%", height: "100%" }}
        gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
        dpr={[1, isMobile ? 1.5 : 2]}
      >
        <ambientLight intensity={0.025} />
        <GalaxyBackground />
        <Comet onSelect={handleSceneSelect} showLabel={showAllNames && !photoMode} />
        <RoguePlanet onRogueClick={() => setRogueClicked(true)} />
        <FaucetSatellite stats={faucetStats} showLabel={showAllNames && !photoMode} onSelect={handleSceneSelect} />

        <StarSystem
          solarData={solarData}
          palette="warm"
          starLabel="VESCROW"
          totalVotingPower={totalVotingPower}
          totalLocked={totalLocked}
          blockNumber={blockFlash}
          showOrbits={showOrbits}
          showAllNames={showAllNames}
          showRenamedOnly={showRenamedOnly}
          showTrails={showTrails}
          photoMode={photoMode}
          showSolarWind
          selectedAddress={selectedAddress}
          panelOpen={panelOpen}
          onSelect={handleSceneSelect}
          onDeselect={() => setPanelOpen(false)}
          onShiftSelect={(addr) => {
            const w = wallets.find(
              (x) => x.address.toLowerCase() === addr.toLowerCase(),
            );
            setStorageWallet(w ?? null);
          }}
        />

        {/* ── Vesting system — blue O-type star at [4000, 200, 0] ── */}
        <StarSystem
          solarData={vestingData}
          position={[4000, 200, 0]}
          palette="cool"
          starLabel="VESTING"
          showOrbits={showOrbits}
          showAllNames={showAllNames}
          showRenamedOnly={showRenamedOnly}
          showTrails={showTrails}
          photoMode={photoMode}
          showSolarWind
          diskMode
          selectedAddress={selectedAddress}
          panelOpen={panelOpen}
          onSelect={handleSceneSelect}
          onDeselect={() => setPanelOpen(false)}
          onShiftSelect={(addr) => {
            const w = vestingWallets.find(
              (x) => x.address.toLowerCase() === addr.toLowerCase(),
            );
            setStorageWallet(w ?? null);
          }}
        />

        <OrbitControls
          ref={controlsRef}
          enablePan={false}
          minDistance={0.3}
          maxDistance={6000}
          enableDamping
          dampingFactor={0.05}
          enabled={cameraMode === "orbit"}
        />

        {flyModeEnabled && (
          <FreeLookControls ref={freelookRef} enabled={cameraMode === "fly"} />
        )}

        <CameraController
          selectedAddress={selectedAddress}
          selectionVersion={selectionVersion}
          cameraMode={cameraMode}
          controlsRef={controlsRef}
          freelookRef={freelookRef}
          onModeChange={setCameraMode}
          onZoomChange={setZoomLevel}
          onCameraDebug={setCamDebug}
          resetRequested={resetRequested}
          onResetDone={() => setResetRequested(false)}
        />
        <ScreenshotHelper ref={screenshotRef} />
      </Canvas>

      {/* ── Photo mode overlay ── */}
      {photoMode && (
        <>
          {/* White flash on capture */}
          {flashCapture && (
            <div style={{
              position: "fixed", inset: 0, zIndex: 40,
              background: "rgba(255,255,255,0.35)",
              pointerEvents: "none",
              animation: "none",
            }} />
          )}

          {/* Exit button — top right */}
          <button
            onClick={() => setPhotoMode(false)}
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

          {/* Shutter button — bottom centre */}
          <button
            onClick={doCapture}
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
            {/* Outer ring + inner circle = camera shutter look */}
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

      {/* ── HUD overlay ── */}
      {!photoMode && (isMobile ? (
        /* ════ MOBILE: bottom sheet ════ */
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 20,
          fontFamily: "'JetBrains Mono','SF Mono','Fira Code',Menlo,monospace",
          fontSize: 12, color: "#8a9bb0",
          display: "flex", flexDirection: "column",
        }}>
          {/* Expandable panels — slide up above toolbar */}
          {(showNamesList || showHelp) && (
            <div style={{
              maxHeight: "55vh", overflowY: "auto",
              background: "rgba(2,6,14,0.96)",
              borderTop: "1px solid rgba(0,229,255,0.15)",
            }}>
              {showHelp    && <HelpPanel mobile />}
              {showNamesList && <DirectoryPanel solarData={solarData} selectedAddress={selectedAddress} onSelect={handleDirectorySelect} />}
            </div>
          )}
          {/* Wallet panel — always visible strip */}
          <div style={{ borderTop: "1px solid rgba(0,229,255,0.08)" }}>
            <WalletPanel
              connectedAddress={wc.connectedAddress}
              myWallet={wc.myWallet}
              nameInput={wc.nameInput}
              isSaving={wc.isSaving}
              status={wc.status}
              lockExpiry={wc.lockExpiry}
              onConnect={wc.connectWallet}
              onDisconnect={() => { wc.disconnect(); setSelectedAddress(null); setPanelOpen(false); }}
              onSaveName={wc.savePlanetName}
              onNameChange={wc.setNameInput}
            />
          </div>
          {/* Toolbar always at very bottom */}
          <HudToolbar
            mobile
            showAllNames={showAllNames}
            onToggleLabels={() => setShowAllNames((v) => !v)}
            showRenamedOnly={showRenamedOnly}
            onToggleRenamed={() => setShowRenamedOnly((v) => !v)}
            showDirectory={showNamesList}
            onToggleDirectory={() => setShowNamesList((v) => !v)}
            showHelp={showHelp}
            onToggleHelp={() => setShowHelp((v) => !v)}
            showOrbits={showOrbits}
            onToggleOrbits={() => setShowOrbits((v) => !v)}
            showTrails={showTrails}
            onToggleTrails={() => setShowTrails((v) => !v)}
            onReset={() => { setResetRequested(true); setSelectedAddress(null); setPanelOpen(false); }}
            flyModeEnabled={flyModeEnabled}
            onToggleFlyMode={() => {
              const next = !flyModeEnabled;
              setFlyModeEnabled(next);
              if (next) {
                setCameraMode("fly");
              } else {
                setCameraMode("orbit");
              }
            }}
            onPhotoMode={() => setPhotoMode(true)}
            rankedLayout={layoutMode !== "solar"}
            onToggleLayout={() => setLayoutMode(m => m === "solar" ? "ranked" : "solar")}
            gnetRanked={layoutMode === "ranked-gnet"}
            onToggleGnet={() => setLayoutMode(m => m === "ranked-gnet" ? "ranked" : "ranked-gnet")}
          />
        </div>
      ) : (
        /* ════ DESKTOP: right-side column ════ */
        <div
          style={{
            position: "fixed",
            right: 16,
            top: 16,
            zIndex: 20,
            width: 360,
            fontFamily:
              "'JetBrains Mono', 'SF Mono', 'Fira Code', Menlo, monospace",
            fontSize: 12,
            color: "#8a9bb0",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <HudToolbar
            showAllNames={showAllNames}
            onToggleLabels={() => setShowAllNames((v) => !v)}
            showRenamedOnly={showRenamedOnly}
            onToggleRenamed={() => setShowRenamedOnly((v) => !v)}
            showDirectory={showNamesList}
            onToggleDirectory={() => setShowNamesList((v) => !v)}
            showHelp={showHelp}
            onToggleHelp={() => setShowHelp((v) => !v)}
            showOrbits={showOrbits}
            onToggleOrbits={() => setShowOrbits((v) => !v)}
            showTrails={showTrails}
            onToggleTrails={() => setShowTrails((v) => !v)}
            onReset={() => {
              setResetRequested(true);
              setSelectedAddress(null);
              setPanelOpen(false);
            }}
            flyModeEnabled={flyModeEnabled}
            onToggleFlyMode={() => {
              const next = !flyModeEnabled;
              setFlyModeEnabled(next);
              if (next) {
                setCameraMode("fly");
              } else {
                setCameraMode("orbit");
              }
            }}
            onPhotoMode={() => setPhotoMode(true)}
            rankedLayout={layoutMode !== "solar"}
            onToggleLayout={() => setLayoutMode(m => m === "solar" ? "ranked" : "solar")}
            gnetRanked={layoutMode === "ranked-gnet"}
            onToggleGnet={() => setLayoutMode(m => m === "ranked-gnet" ? "ranked" : "ranked-gnet")}
          />

          <WalletPanel
            connectedAddress={wc.connectedAddress}
            myWallet={wc.myWallet}
            nameInput={wc.nameInput}
            isSaving={wc.isSaving}
            status={wc.status}
            lockExpiry={wc.lockExpiry}
            onConnect={wc.connectWallet}
            onDisconnect={() => {
              wc.disconnect();
              setSelectedAddress(null);
              setPanelOpen(false);
            }}
            onSaveName={wc.savePlanetName}
            onNameChange={wc.setNameInput}
          />

          {showNamesList && (
            <DirectoryPanel
              solarData={solarData}
              selectedAddress={selectedAddress}
              onSelect={handleDirectorySelect}
            />
          )}

          {showHelp && <HelpPanel />}
        </div>
      ))}

      {/* Camera debug overlay hidden */}

      {/* ── Shift+click: storage slot terminal popup ── */}
      {storageWallet && (() => {
        const addr  = storageWallet.address;
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
            onClick={() => setStorageWallet(null)}
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
                storage / eth_call ve.locked(addr)
              </div>
              <div style={{ color: "#4a6278", marginBottom: 8 }}>
                contract  <span style={{ color: "#6a8890" }}>0x9B3eFf...vEscrow</span><br />
                address   <span style={{ color: "#7a9aaa" }}>{addr}</span>
              </div>
              <div style={{ borderTop: "1px solid rgba(0,229,255,0.08)", paddingTop: 8, marginBottom: 8 }}>
                <span style={{ color: "#4a6278" }}>slot_key   keccak256(addr || 0x05):</span><br />
                <span style={{ color: "#5a7a8a" }}>{slotKey}</span>
              </div>
              <div style={{ marginBottom: 4 }}>
                <span style={{ color: "#4a6278" }}>locked.amount [int128] :</span><br />
                <span style={{ color: "#00e5ff" }}>{toH64(storageWallet.lockedGnet)}</span>
              </div>
              <div style={{ marginBottom: 4 }}>
                <span style={{ color: "#4a6278" }}>locked.end   [uint256]:</span><br />
                <span style={{ color: "#7ab0c0" }}>{toH64(storageWallet.lockEnd)}</span>
              </div>
              <div style={{ marginBottom: 12 }}>
                <span style={{ color: "#4a6278" }}>ve.balanceOf [veGNET] :</span><br />
                <span style={{ color: "#5a8890" }}>{toH64(storageWallet.votingPower)}</span>
              </div>
              <div style={{ textAlign: "right", color: "#3a5264", fontSize: 10 }}>
                [click anywhere to dismiss]
              </div>
            </div>
          </div>
        );
      })()}

      {/*  Rogue planet click popup  */}
      {rogueClicked && (() => {
        return (
          <div
            style={{
              position: "fixed", inset: 0, zIndex: 20000,
              display: "flex", alignItems: "center", justifyContent: "center",
              pointerEvents: "auto",
            }}
            onClick={() => setRogueClicked(false)}
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
                  onClick={() => setRogueClicked(false)}
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
      })()}

      {/* ── Top-left stats overlay ── */}
      {!photoMode && (
      <div
        style={{
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
        }}
      >
        <div style={{ color: "#6a9aaa", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 2 }}>
          {isMobile ? "vescrowα" : "vEscrow · galactica"}
        </div>
        {wallets.length > 0 && (
          <div>
            <span style={{ color: "#6a8090" }}>{isMobile ? "w " : "wallets  "}</span>
            <span style={{ color: "#8ab0c0" }}>{wallets.length.toLocaleString()}</span>
          </div>
        )}
        {!isMobile && wallets.length > 0 && (
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
      </div>
      )}
    </>
  );
}
