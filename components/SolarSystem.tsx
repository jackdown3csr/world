"use client";

import React, { useMemo, useRef, useCallback, useState, useEffect } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { FreeLookHandle } from "./FreeLookControls";
import type { CameraMode } from "./CameraController";

import { useWallets } from "@/hooks/useWallets";
import { useVestingWallets } from "@/hooks/useVestingWallets";
import { useWalletConnection } from "@/hooks/useWalletConnection";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useBlock } from "@/hooks/useBlock";
import { useFaucet } from "@/hooks/useFaucet";
import { buildSolarSystem, buildVestingSystem } from "@/lib/layout";
import type { LayoutMode, VestingLayoutMode } from "@/lib/layout";
import { formatBalance } from "@/lib/formatBalance";

import SplashScreen from "./SplashScreen";
import SceneCanvas from "./SceneCanvas";
import type { ScreenshotHandle } from "./SceneCanvas";
import SystemHud from "./SystemHud";
import { StorageSlotPopup, RoguePopup } from "./SystemPopups";
import type { WalletEntry } from "@/lib/types";

interface CamDebug {
  pos: [number, number, number];
  target: [number, number, number];
  distTarget: number;
  distOrigin: number;
  tracking: string | null;
}

/**
 * Top-level 3D scene: a solar system where each wallet is a celestial body.
 * Purely an orchestration layer — 3D content lives in SceneCanvas, UI in SystemHud.
 */
export default function SolarSystem() {
  const isMobile = useIsMobile();

  /* ── Data ── */
  const { wallets, loading, refetch, updatedAt } = useWallets();
  const { wallets: vestingWallets } = useVestingWallets();
  const faucetStats = useFaucet();
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("solar");
  const [vestingLayoutMode, setVestingLayoutMode] = useState<VestingLayoutMode>("entitled");
  const solarData = useMemo(() => buildSolarSystem(wallets, layoutMode), [wallets, layoutMode]);
  const vestingData = useMemo(() => buildVestingSystem(vestingWallets, vestingLayoutMode), [vestingWallets, vestingLayoutMode]);

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

  /* ── Aggregate stats for Vesting star label ── */
  const { vestingTotalEntitled, vestingTotalClaimed, currentEpoch } = useMemo(() => {
    if (vestingWallets.length === 0) return { vestingTotalEntitled: "", vestingTotalClaimed: "", currentEpoch: 0 };
    let ent = 0n;
    let clm = 0n;
    let maxEpoch = 0;
    for (const w of vestingWallets) {
      if (w.totalEntitled && w.totalEntitled !== "0") ent += BigInt(w.totalEntitled);
      if (w.totalClaimed && w.totalClaimed !== "0") clm += BigInt(w.totalClaimed);
      if (w.lastClaimedEpoch > maxEpoch) maxEpoch = w.lastClaimedEpoch;
    }
    return {
      vestingTotalEntitled: formatBalance(ent.toString(), "GNET"),
      vestingTotalClaimed: formatBalance(clm.toString(), "GNET"),
      currentEpoch: maxEpoch,
    };
  }, [vestingWallets]);

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
  const [showRenamedOnly, setShowRenamedOnly] = useState(true);
  const [showNamesList, setShowNamesList] = useState(false);
  /* ── Scene-ready gate: wait for progressive mount + shader compile ── */
  const [sceneReady, setSceneReady] = useState(false);
  useEffect(() => {
    if (loading || sceneReady) return;
    const timer = setTimeout(() => setSceneReady(true), 500);
    return () => clearTimeout(timer);
  }, [loading, sceneReady]);

  const [showHelp, setShowHelp] = useState(false);
  const [showOrbits, setShowOrbits] = useState(true);
  const [showTrails, setShowTrails] = useState(false);
  const [photoMode, setPhotoMode] = useState(false);
  const [resetRequested, setResetRequested] = useState(false);

  /* ── Popups ── */
  const [storageWallet, setStorageWallet] = useState<WalletEntry | null>(null);
  const [rogueClicked, setRogueClicked] = useState(false);

  /* ── Block clock ── */
  const [blockFlash, setBlockFlash] = useState(0);
  const blockInfo = useBlock(30_000, () => setBlockFlash((n) => n + 1));

  /* ── Camera ── */
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const freelookRef = useRef<FreeLookHandle>(null);
  const screenshotRef = useRef<ScreenshotHandle>(null);
  const [cameraMode, setCameraMode] = useState<CameraMode>("orbit");
  const [flyModeEnabled, setFlyModeEnabled] = useState(false);
  const [flashCapture, setFlashCapture] = useState(false);
  const [camDebug, setCamDebug] = useState<CamDebug | null>(null);

  const doCapture = useCallback(() => {
    screenshotRef.current?.capture();
    setFlashCapture(true);
    setTimeout(() => setFlashCapture(false), 350);
  }, []);

  /* ── Handlers ── */
  const handleSceneSelect = useCallback((address: string) => {
    selectBody(address);
    const wallet = wallets.find((w) => w.address.toLowerCase() === address.toLowerCase())
      ?? vestingWallets.find((w) => w.address.toLowerCase() === address.toLowerCase());
    wc.setNameInput(wallet?.customName || "");
  }, [selectBody, wallets, vestingWallets, wc]);

  const handleDirectorySelect = useCallback((address: string, customName?: string) => {
    selectBody(address);
    wc.setNameInput(customName || "");
  }, [selectBody, wc]);

  const handleToggleFlyMode = useCallback(() => {
    const next = !flyModeEnabled;
    setFlyModeEnabled(next);
    setCameraMode(next ? "fly" : "orbit");
  }, [flyModeEnabled]);

  const handleDisconnect = useCallback(() => {
    wc.disconnect();
    setSelectedAddress(null);
    setPanelOpen(false);
  }, [wc]);

  const handleReset = useCallback(() => {
    setResetRequested(true);
    setSelectedAddress(null);
    setPanelOpen(false);
  }, []);

  return (
    <>
      <SplashScreen loading={loading || !sceneReady} />

      <SceneCanvas
        isMobile={isMobile}
        solarData={solarData}
        vestingData={vestingData}
        totalVotingPower={totalVotingPower}
        totalLocked={totalLocked}
        vestingTotalEntitled={vestingTotalEntitled}
        vestingTotalClaimed={vestingTotalClaimed}
        blockFlash={blockFlash}
        showOrbits={showOrbits}
        showAllNames={showAllNames}
        showRenamedOnly={showRenamedOnly}
        showTrails={showTrails}
        photoMode={photoMode}
        selectedAddress={selectedAddress}
        panelOpen={panelOpen}
        cameraMode={cameraMode}
        flyModeEnabled={flyModeEnabled}
        resetRequested={resetRequested}
        controlsRef={controlsRef}
        freelookRef={freelookRef}
        screenshotRef={screenshotRef}
        wallets={wallets}
        vestingWallets={vestingWallets}
        faucetStats={faucetStats}
        currentEpoch={currentEpoch}
        vestingBeltOuterRadius={vestingData.beltOuterRadius}
        selectionVersion={selectionVersion}
        onSelect={handleSceneSelect}
        onDeselect={() => setPanelOpen(false)}
        onShiftSelectVescrow={(addr) => {
          const w = wallets.find((x) => x.address.toLowerCase() === addr.toLowerCase());
          setStorageWallet(w ?? null);
        }}
        onShiftSelectVesting={(addr) => {
          const w = vestingWallets.find((x) => x.address.toLowerCase() === addr.toLowerCase());
          setStorageWallet(w ?? null);
        }}
        onRogueClick={() => setRogueClicked(true)}
        onModeChange={setCameraMode}
        onZoomChange={() => {}}
        onCameraDebug={setCamDebug}
        onResetDone={() => setResetRequested(false)}
      />

      <SystemHud
        isMobile={isMobile}
        photoMode={photoMode}
        flashCapture={flashCapture}
        showAllNames={showAllNames}
        showRenamedOnly={showRenamedOnly}
        showNamesList={showNamesList}
        showHelp={showHelp}
        showOrbits={showOrbits}
        showTrails={showTrails}
        flyModeEnabled={flyModeEnabled}
        layoutMode={layoutMode}
        vestingLayoutMode={vestingLayoutMode}
        solarData={solarData}
        vestingData={vestingData}
        selectedAddress={selectedAddress}
        camDebug={camDebug}
        blockInfo={blockInfo}
        walletCount={wallets.length}
        vestingWalletCount={vestingWallets.length}
        totalVotingPower={totalVotingPower}
        totalLocked={totalLocked}
        vestingTotalEntitled={vestingTotalEntitled}
        vestingTotalClaimed={vestingTotalClaimed}
        updatedAt={updatedAt}
        wc={wc}
        onCapturePhoto={doCapture}
        onExitPhotoMode={() => setPhotoMode(false)}
        onToggleLabels={() => setShowAllNames((v) => !v)}
        onToggleRenamed={() => setShowRenamedOnly((v) => !v)}
        onToggleDirectory={() => setShowNamesList((v) => !v)}
        onToggleHelp={() => setShowHelp((v) => !v)}
        onToggleOrbits={() => setShowOrbits((v) => !v)}
        onToggleTrails={() => setShowTrails((v) => !v)}
        onReset={handleReset}
        onToggleFlyMode={handleToggleFlyMode}
        onPhotoMode={() => setPhotoMode(true)}
        onToggleLayout={() => setLayoutMode((m) => m === "solar" ? "ranked" : "solar")}
        onToggleGnet={() => setLayoutMode((m) => m === "ranked-gnet" ? "ranked" : "ranked-gnet")}
        onToggleVestingClaimed={() => setVestingLayoutMode((m) => m === "entitled" ? "claimed" : "entitled")}
        onJumpToStar={handleSceneSelect}
        onDirectorySelect={handleDirectorySelect}
        onDisconnect={handleDisconnect}
      />

      {storageWallet && (
        <StorageSlotPopup wallet={storageWallet} onClose={() => setStorageWallet(null)} />
      )}
      {rogueClicked && (
        <RoguePopup onClose={() => setRogueClicked(false)} />
      )}
    </>
  );
}

