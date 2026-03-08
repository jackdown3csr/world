"use client";

import React, { useMemo, useRef, useCallback, useState, useEffect } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { FreeLookHandle } from "./FreeLookControls";
import type { CameraMode } from "./CameraController";

import { useCanonicalBridge } from "@/hooks/useCanonicalBridge";
import { useStakingRemnant } from "@/hooks/useStakingRemnant";
import { useWallets } from "@/hooks/useWallets";
import { useVestingWallets } from "@/hooks/useVestingWallets";
import { useHyperlaneBridge } from "@/hooks/useHyperlaneBridge";
import { usePoolTokens } from "@/hooks/usePoolTokens";
import { useWalletConnection } from "@/hooks/useWalletConnection";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useBlock } from "@/hooks/useBlock";
import { useFaucet } from "@/hooks/useFaucet";
import { buildPoolSystem, buildSolarSystem, buildStakingRemnantSystem, buildVestingSystem } from "@/lib/layout";
import type { LayoutMode, VestingLayoutMode } from "@/lib/layout";
import { formatBalance } from "@/lib/formatBalance";
import { buildPhotoTargetSections, findPhotoTargetById } from "@/lib/photoTargets";
import { getNearestSystemId, type SceneSystemDefinition, type SceneSystemId } from "@/lib/sceneSystems";

import SplashScreen from "./SplashScreen";
import SceneCanvas from "./SceneCanvas";
import type { ScreenshotHandle } from "./SceneCanvas";
import SystemHud from "./SystemHud";
import FlyHud from "./FlyHud";
import { StorageSlotPopup, RoguePopup } from "./SystemPopups";
import type { PoolTokenEntry, WalletEntry, VestingWalletEntry } from "@/lib/types";
import { buildBridgeObjects, getBridgeById, isBridgeId } from "@/lib/bridges";
import { COMET_ADDRESS } from "./Comet";
import { FAUCET_ADDRESS, FAUCET_DEFAULT_ORBIT_RADIUS } from "./FaucetSatellite";
import { ROGUE_ADDRESS } from "./RoguePlanet";
import type { SceneEffectDefinition, SceneGlobalObject } from "@/lib/sceneSystems";

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
  const {
    wallets: vestingWallets,
    loading: vestingLoading,
    updatedAt: vestingUpdatedAt,
  } = useVestingWallets();
  const {
    tokens: poolTokens,
    loading: poolLoading,
    updatedAt: poolUpdatedAt,
    totalWorthFormatted,
    gubiPriceFormatted,
    supplyFormatted,
  } = usePoolTokens();
  const hyperlaneBridge = useHyperlaneBridge();
  const canonicalBridge = useCanonicalBridge();
  const stakingRemnant = useStakingRemnant();
  const faucetStats = useFaucet();
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("solar");
  const [vestingLayoutMode, setVestingLayoutMode] = useState<VestingLayoutMode>("entitled");
  const solarData = useMemo(() => buildSolarSystem(wallets, layoutMode), [wallets, layoutMode]);
  const vestingData = useMemo(() => buildVestingSystem(vestingWallets, vestingLayoutMode), [vestingWallets, vestingLayoutMode]);
  const poolData = useMemo(() => buildPoolSystem(poolTokens), [poolTokens]);
  const stakingData = useMemo(() => buildStakingRemnantSystem(stakingRemnant.data), [stakingRemnant.data]);

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

  const bridges = useMemo(
    () => buildBridgeObjects(hyperlaneBridge.data, canonicalBridge.data),
    [canonicalBridge.data, hyperlaneBridge.data],
  );
  const selectedBridge = useMemo(
    () => getBridgeById(bridges, selectedAddress),
    [bridges, selectedAddress],
  );

  const focusSceneTarget = useCallback((addr: string, openPanel: boolean) => {
    setSelectedAddress(addr);
    setSelectionVersion((v) => v + 1);
    setPanelOpen(openPanel);
  }, []);

  const selectWalletBody = useCallback((addr: string) => {
    focusSceneTarget(addr, true);
  }, [focusSceneTarget]);

  /* ── Wallet connection ── */
  const wc = useWalletConnection(wallets, refetch, selectWalletBody);

  /* ── UI toggles ── */
  const [showAllNames, setShowAllNames] = useState(true);
  const [showRenamedOnly, setShowRenamedOnly] = useState(true);
  const [showNamesList, setShowNamesList] = useState(false);
  const sceneLoading = loading || vestingLoading || poolLoading || stakingRemnant.loading;
  const sceneReady = !sceneLoading;

  const [showHelp, setShowHelp] = useState(false);
  const [showOrbits, setShowOrbits] = useState(true);
  const [photoMode, setPhotoMode] = useState(false);
  const [photoHudVisible, setPhotoHudVisible] = useState(true);
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);
  const [photoFocusMode, setPhotoFocusMode] = useState<"focused" | "detached">("focused");
  const [photoSimulationMode, setPhotoSimulationMode] = useState<"frozen" | "live">("live");
  const [photoFov, setPhotoFov] = useState(55);
  const [resetRequested, setResetRequested] = useState(false);
  const desktopPanelInsetRight = isMobile ? 0 : (showHelp ? 520 : 424);

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
  const [showFlightHud, setShowFlightHud] = useState(true);
  const [flashCapture, setFlashCapture] = useState(false);
  const [photoSavedToast, setPhotoSavedToast] = useState(false);
  const [camDebug, setCamDebug] = useState<CamDebug | null>(null);
  const simulationPaused = photoMode && photoSimulationMode === "frozen";

  const systems = useMemo<SceneSystemDefinition[]>(() => {
    return [
      {
        id: "vescrow",
        starId: "__star_vescrow__",
        label: "VESCROW",
        navLabel: "vescrow",
        eyebrow: "vEscrow · galactica",
        accent: "#ffc860",
        palette: "warm",
        position: [0, 0, 0],
        detailVariant: "wallet",
        layoutVariant: "vescrow",
        directoryMetricLabel: "power",
        starPrimaryMetric: totalVotingPower,
        starSecondaryMetric: totalLocked,
        data: solarData,
        entries: wallets,
        summaryRows: [
          { label: "wallets", value: wallets.length.toLocaleString() },
          { label: "power", value: totalVotingPower, accent: "#00e5ff" },
          { label: "locked", value: totalLocked, accent: "#8ab0c0" },
        ],
        descriptionLines: [
          "data read from vEscrow contract",
          "ranked by veGNET voting power",
          "locked GNET alone does not decide rank",
        ],
        decorators: [
          {
            id: FAUCET_ADDRESS,
            kind: "faucet-satellite",
            orbitRadius: FAUCET_DEFAULT_ORBIT_RADIUS,
            stats: faucetStats,
          },
        ],
        updatedAt,
      },
      {
        id: "vesting",
        starId: "__star_vesting__",
        label: "VESTING",
        navLabel: "vesting",
        eyebrow: "vesting · galactica",
        accent: "#00ffee",
        palette: "cool",
        position: [16000, 3000, 0],
        detailVariant: "vesting",
        layoutVariant: "vesting",
        directoryMetricLabel: "entitled",
        starPrimaryMetric: vestingTotalEntitled,
        starSecondaryMetric: vestingTotalClaimed,
        data: vestingData,
        entries: vestingWallets,
        summaryRows: [
          { label: "wallets", value: vestingWallets.length.toLocaleString() },
          { label: "entitled", value: vestingTotalEntitled, accent: "#00ffee" },
          { label: "claimed", value: vestingTotalClaimed, accent: "#8ab0c0" },
        ],
        descriptionLines: [
          "data read from RewardDistributor",
          "ranked by total entitled GNET",
          "claimed mode emphasizes realized allocation",
        ],
        decorators: [
          {
            id: "vesting-epoch",
            kind: "epoch-satellite",
            orbitRadius: vestingData.beltOuterRadius + 30,
            epoch: currentEpoch,
          },
        ],
        updatedAt: vestingUpdatedAt,
      },
      {
        id: "gubi-pool",
        starId: "__star_gubi_pool__",
        label: "gUBI POOL",
        navLabel: "gubi pool",
        eyebrow: "gUBI pool · galactica",
        accent: "#ffe08a",
        palette: "dwarf",
        position: [-11200, 1800, 4200],
        starScale: 0.42,
        detailVariant: "pool",
        layoutVariant: "none",
        directoryMetricLabel: "value",
        starPrimaryMetric: totalWorthFormatted,
        starSecondaryMetric: gubiPriceFormatted,
        data: poolData,
        entries: poolTokens,
        summaryRows: [
          { label: "tokens", value: poolTokens.length.toLocaleString() },
          { label: "worth", value: totalWorthFormatted, accent: "#ffe08a" },
          { label: "1 gUBI", value: gubiPriceFormatted, accent: "#ffd27a" },
          { label: "supply", value: supplyFormatted, accent: "#8ab0c0" },
        ],
        descriptionLines: [
          "data read from gUBI pool API",
          "token balances sourced from the pool vault",
          "planet size and orbit order follow USD weight",
        ],
        updatedAt: poolUpdatedAt,
      },
      {
        id: "staking-remnant",
        starId: "__star_staking_remnant__",
        label: "STAKING",
        navLabel: "staking",
        eyebrow: "staking shell · galactica",
        accent: "#ff9664",
        palette: "dying",
        position: [10200, -2600, 9800],
        starScale: 1.6,
        detailVariant: "wallet",
        layoutVariant: "none",
        directoryMetricLabel: "staked",
        starPrimaryMetric: stakingRemnant.data?.totalStakedFormatted ?? "",
        starSecondaryMetric: stakingRemnant.data?.frozenLabel ?? "",
        data: stakingData,
        entries: [],
        summaryRows: [
          { label: "staked", value: stakingRemnant.data?.totalStakedFormatted ?? "0 GNET", accent: "#ff9664" },
          { label: "frozen", value: stakingRemnant.data?.frozenLabel ?? "--", accent: "#8f6f69" },
          { label: "state", value: stakingRemnant.data?.statusLabel ?? "scanner link pending", accent: "#d39b86" },
        ],
        descriptionLines: [
          "data read from the legacy staking shell",
          "shows remaining staked GNET and the freeze window",
          "state indicates whether exits are still draining the shell",
        ],
        updatedAt: stakingRemnant.data?.updatedAt,
      },
    ];
  }, [
    stakingData,
    stakingRemnant.data,
    gubiPriceFormatted,
    poolData,
    poolTokens,
    poolUpdatedAt,
    solarData,
    supplyFormatted,
    totalLocked,
    totalVotingPower,
    totalWorthFormatted,
    updatedAt,
    faucetStats,
    vestingData,
    vestingTotalClaimed,
    vestingTotalEntitled,
    vestingUpdatedAt,
    vestingWallets,
    wallets,
  ]);

  const globalObjects = useMemo<SceneGlobalObject[]>(() => (
    [
      { id: COMET_ADDRESS, kind: "comet" },
      { id: ROGUE_ADDRESS, kind: "rogue-planet" },
      ...bridges.map((bridge) => ({
        id: bridge.id,
        kind: "bridge" as const,
        bridge,
      })),
    ]
  ), [bridges]);

  const sceneEffects = useMemo<SceneEffectDefinition[]>(() => (
    [
      {
        id: "vescrow-block-pulse",
        kind: "block-pulse",
        systemId: "vescrow",
        tick: blockFlash,
      },
    ]
  ), [blockFlash]);

  const activeSystemId = useMemo(
    () => getNearestSystemId(camDebug?.pos ?? null, systems),
    [camDebug, systems],
  );

  const photoTargetSections = useMemo(
    () => buildPhotoTargetSections(systems, globalObjects),
    [globalObjects, systems],
  );
  const photoTarget = useMemo(
    () => findPhotoTargetById(photoTargetSections, selectedAddress),
    [photoTargetSections, selectedAddress],
  );
  const cameraFocusAddress = photoMode && photoFocusMode === "detached" ? null : selectedAddress;
  const sceneCameraMode: CameraMode = photoMode
    ? (photoFocusMode === "detached" ? "fly" : "orbit")
    : cameraMode;
  const sceneFlyModeEnabled = !photoMode && flyModeEnabled;
  const sceneCinematicFlyEnabled = photoMode && photoFocusMode === "detached";

  const allEntries = useMemo(
    () => systems.flatMap((system) => system.entries),
    [systems],
  );

  const doCapture = useCallback(() => {
    screenshotRef.current?.capture();
    setFlashCapture(true);
    setPhotoSavedToast(true);
    setTimeout(() => setFlashCapture(false), 350);
    setTimeout(() => setPhotoSavedToast(false), 1400);
  }, []);

  /* ── Handlers ── */
  const handleSceneSelect = useCallback((address: string) => {
    if (photoMode) {
      setPhotoFocusMode("focused");
      setPhotoPickerOpen(false);
    }
    if (address === ROGUE_ADDRESS) {
      focusSceneTarget(address, false);
      setRogueClicked(true);
      return;
    }
    if (isBridgeId(address)) {
      if (!getBridgeById(bridges, address)) return;
      focusSceneTarget(address, false);
      return;
    }
    const entry = allEntries.find((item) => item.address.toLowerCase() === address.toLowerCase());
    focusSceneTarget(address, Boolean(entry));
    wc.setNameInput(entry?.customName || "");
  }, [allEntries, bridges, focusSceneTarget, photoMode, wc]);

  const handleDirectorySelect = useCallback((address: string, customName?: string) => {
    focusSceneTarget(address, true);
    wc.setNameInput(customName || "");
  }, [focusSceneTarget, wc]);

  const handleBridgeSelect = useCallback((bridgeId: string) => {
    if (!getBridgeById(bridges, bridgeId)) return;
    focusSceneTarget(bridgeId, false);
  }, [bridges, focusSceneTarget]);

  const handleClearSelection = useCallback(() => {
    setPanelOpen(false);
    setSelectedAddress(null);
    if (photoMode) {
      setPhotoFocusMode("detached");
    }
    setSelectionVersion((v) => v + 1);
  }, [photoMode]);

  const handleToggleFlyMode = useCallback(() => {
    const next = !flyModeEnabled;
    setFlyModeEnabled(next);
    setCameraMode(next ? "fly" : "orbit");
  }, [flyModeEnabled]);

  const handleEnterPhotoMode = useCallback(() => {
    // Freeze the current ship-camera view in place for photo mode.
    if (flyModeEnabled || cameraMode === "fly") {
      setFlyModeEnabled(false);
      setCameraMode("orbit");
    }
    setPhotoHudVisible(true);
    setPhotoFocusMode(selectedAddress ? "focused" : "detached");
    setPhotoPickerOpen(false);
    setPhotoMode(true);
  }, [cameraMode, flyModeEnabled, selectedAddress]);

  const handleExitPhotoMode = useCallback(() => {
    setPhotoMode(false);
    setPhotoHudVisible(true);
    setPhotoPickerOpen(false);
    setPhotoFocusMode("focused");
    setPhotoSavedToast(false);
  }, []);

  const handlePhotoTargetSelect = useCallback((address: string) => {
    const entry = allEntries.find((item) => item.address.toLowerCase() === address.toLowerCase());
    setPhotoFocusMode("focused");
    setPhotoPickerOpen(false);
    focusSceneTarget(address, false);
    wc.setNameInput(entry?.customName || "");
  }, [allEntries, focusSceneTarget, wc]);

  const handlePhotoDetach = useCallback(() => {
    setPhotoFocusMode("detached");
  }, []);

  const handlePhotoRefocus = useCallback(() => {
    if (!selectedAddress) return;
    setPhotoFocusMode("focused");
    setSelectionVersion((value) => value + 1);
  }, [selectedAddress]);

  const handleDisconnect = useCallback(() => {
    wc.disconnect();
    handleClearSelection();
  }, [handleClearSelection, wc]);

  const handleShiftSelectEntry = useCallback((systemId: SceneSystemId, addr: string) => {
    if (systemId === "gubi-pool") return;

    const system = systems.find((item) => item.id === systemId);
    const entry = system?.entries.find((item) => item.address.toLowerCase() === addr.toLowerCase());
    setStorageWallet((entry as WalletEntry | VestingWalletEntry | undefined) ?? null);
  }, [systems]);

  const handleReset = useCallback(() => {
    setResetRequested(true);
    handleClearSelection();
  }, [handleClearSelection]);

  useEffect(() => {
    if (selectedAddress !== ROGUE_ADDRESS && rogueClicked) {
      setRogueClicked(false);
    }
  }, [rogueClicked, selectedAddress]);

  return (
    <>
      <SplashScreen loading={sceneLoading} />

      <SceneCanvas
        isMobile={isMobile}
        frameInsetRight={desktopPanelInsetRight}
        systems={systems}
        globalObjects={globalObjects}
        effects={sceneEffects}
        showOrbits={showOrbits}
        showAllNames={showAllNames}
        showRenamedOnly={showRenamedOnly}
        photoMode={photoMode}
        photoFov={photoMode ? photoFov : 55}
        simulationPaused={simulationPaused}
        selectedAddress={selectedAddress}
        cameraFocusAddress={cameraFocusAddress}
        panelOpen={panelOpen}
        cameraMode={sceneCameraMode}
        flyModeEnabled={sceneFlyModeEnabled}
        cinematicFlyEnabled={sceneCinematicFlyEnabled}
        resetRequested={resetRequested}
        controlsRef={controlsRef}
        freelookRef={freelookRef}
        screenshotRef={screenshotRef}
        selectionVersion={selectionVersion}
        onSelect={handleSceneSelect}
        onDeselect={handleClearSelection}
        onShiftSelectEntry={handleShiftSelectEntry}
        onModeChange={setCameraMode}
        onZoomChange={() => {}}
        onCameraDebug={setCamDebug}
        onResetDone={() => setResetRequested(false)}
      />

      <SystemHud
        isMobile={isMobile}
        photoMode={photoMode}
        photoHudVisible={photoHudVisible}
        photoPickerOpen={photoPickerOpen}
        photoFocusMode={photoFocusMode}
        photoTargetLabel={photoTarget?.label ?? null}
        photoTargetSections={photoTargetSections}
        flashCapture={flashCapture}
        photoSavedToast={photoSavedToast}
        simulationPaused={simulationPaused}
        photoSimulationMode={photoSimulationMode}
        photoFov={photoFov}
        showAllNames={showAllNames}
        showRenamedOnly={showRenamedOnly}
        showNamesList={showNamesList}
        showHelp={showHelp}
        showOrbits={showOrbits}
        flyModeEnabled={flyModeEnabled}
        showFlightHud={showFlightHud}
        sceneReady={sceneReady}
        layoutMode={layoutMode}
        vestingLayoutMode={vestingLayoutMode}
        systems={systems}
        activeSystemId={activeSystemId}
        selectedBridge={selectedBridge}
        selectedAddress={selectedAddress}
        camDebug={camDebug}
        blockInfo={blockInfo}
        wc={wc}
        onCapturePhoto={doCapture}
        onExitPhotoMode={handleExitPhotoMode}
        onPhotoTargetSelect={handlePhotoTargetSelect}
        onPhotoDetach={handlePhotoDetach}
        onPhotoRefocus={handlePhotoRefocus}
        onTogglePhotoPicker={() => setPhotoPickerOpen((value) => !value)}
        onSetPhotoSimulationMode={setPhotoSimulationMode}
        onSetPhotoFov={setPhotoFov}
        onTogglePhotoHud={() => setPhotoHudVisible((v) => !v)}
        onToggleLabels={() => setShowAllNames((v) => !v)}
        onToggleRenamed={() => setShowRenamedOnly((v) => !v)}
        onToggleDirectory={() => setShowNamesList((v) => !v)}
        onToggleHelp={() => setShowHelp((v) => !v)}
        onToggleOrbits={() => setShowOrbits((v) => !v)}
        onToggleFlightHud={() => setShowFlightHud((v) => !v)}
        onReset={handleReset}
        onToggleFlyMode={handleToggleFlyMode}
        onPhotoMode={handleEnterPhotoMode}
        onToggleLayout={() => setLayoutMode((m) => m === "solar" ? "ranked" : "solar")}
        onToggleGnet={() => setLayoutMode((m) => m === "ranked-gnet" ? "ranked" : "ranked-gnet")}
        onToggleVestingClaimed={() => setVestingLayoutMode((m) => m === "entitled" ? "claimed" : "entitled")}
        onJumpToStar={handleSceneSelect}
        onDirectorySelect={handleDirectorySelect}
        onDisconnect={handleDisconnect}
      />

  <FlyHud freelookRef={freelookRef} visible={showFlightHud && flyModeEnabled && cameraMode === "fly"} />

      {storageWallet && (
        <StorageSlotPopup wallet={storageWallet} onClose={() => setStorageWallet(null)} />
      )}
      {rogueClicked && (
        <RoguePopup onClose={handleClearSelection} />
      )}
    </>
  );
}

