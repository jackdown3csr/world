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
import { lookupSceneBody } from "@/lib/sceneRegistry";

import SplashScreen from "./SplashScreen";
import SceneCanvas from "./SceneCanvas";
import type { ScreenshotHandle } from "./SceneCanvas";
import SystemHud from "./SystemHud";
import FlyHud from "./FlyHud";
import type { TrafficPanelItem } from "./TrafficPanel";
import { StorageSlotPopup, RoguePopup } from "./SystemPopups";
import type { PoolTokenEntry, WalletEntry, VestingWalletEntry } from "@/lib/types";
import { buildBridgeObjects, getBridgeById, isBridgeId } from "@/lib/bridges";
import { COMET_ADDRESS } from "./Comet";
import { FAUCET_ADDRESS, FAUCET_DEFAULT_ORBIT_RADIUS } from "./FaucetSatellite";
import { EPOCH_ADDRESS } from "./EpochSatellite";
import { ROGUE_ADDRESS } from "./RoguePlanet";
import type { SceneEffectDefinition, SceneGlobalObject } from "@/lib/sceneSystems";
import { useBlockTransactions } from "@/hooks/useBlockTransactions";
import {
  ARBSYS_ADDRESS,
  HYPERLANE_MAILBOX,
} from "@/lib/blockExplorer/classifyTransactions";
import {
  TRANSIT_BEACON_HINT,
  TRANSIT_BEACON_ID,
  TRANSIT_BEACON_LABEL,
  TRANSIT_BEACON_OBJECT,
  TRANSIT_BEACON_POSITION,
  TRANSIT_BEACON_RADIUS,
} from "@/lib/transitBeacon";

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
    currentEpoch,
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
  const { vestingTotalEntitled, vestingTotalClaimed } = useMemo(() => {
    if (vestingWallets.length === 0) return { vestingTotalEntitled: "", vestingTotalClaimed: "" };
    let ent = 0n;
    let clm = 0n;
    for (const w of vestingWallets) {
      if (w.totalEntitled && w.totalEntitled !== "0") ent += BigInt(w.totalEntitled);
      if (w.totalClaimed && w.totalClaimed !== "0") clm += BigInt(w.totalClaimed);
    }
    return {
      vestingTotalEntitled: formatBalance(ent.toString(), "GNET"),
      vestingTotalClaimed: formatBalance(clm.toString(), "GNET"),
    };
  }, [vestingWallets]);

  /* ── Selection state ── */
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [cameraTargetId, setCameraTargetId] = useState<string | null>(null);
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
  const selectedTransitBeacon = useMemo(
    () => (selectedAddress === TRANSIT_BEACON_ID ? TRANSIT_BEACON_OBJECT : null),
    [selectedAddress],
  );

  // Derive selected system ID from the scoped camera target ID.
  const selectedSystemId = useMemo<SceneSystemId | null>(() => {
    if (!cameraTargetId) return null;
    const idx = cameraTargetId.indexOf(":");
    if (idx < 0) return null;
    return cameraTargetId.slice(0, idx) as SceneSystemId;
  }, [cameraTargetId]);

  const focusSceneTarget = useCallback((rawAddr: string, openPanel: boolean, scopedId?: string) => {
    setSelectedAddress(rawAddr);
    setCameraTargetId(scopedId ?? rawAddr);
    setSelectionVersion((v) => v + 1);
    setPanelOpen(openPanel);
  }, []);

  const selectWalletBody = useCallback((addr: string) => {
    focusSceneTarget(addr, true, `vescrow:${addr.toLowerCase()}`);
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
  const [flyPickerOpen, setFlyPickerOpen] = useState(false);
  const [flyAutopilotActive, setFlyAutopilotActive] = useState(false);
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

  const walletSystemMap = useMemo<Record<string, SceneSystemId>>(() => {
    const entries: Record<string, SceneSystemId> = {};
    for (const wallet of wallets) entries[wallet.address.toLowerCase()] = "vescrow";
    for (const wallet of vestingWallets) entries[wallet.address.toLowerCase()] = "vesting";
    for (const token of poolTokens) entries[token.address.toLowerCase()] = "gubi-pool";
    return entries;
  }, [poolTokens, vestingWallets, wallets]);

  /* ── Transaction trails ── */
  const [showTraffic, setShowTraffic] = useState(false);
  const [trafficPanelOpen, setTrafficPanelOpen] = useState(true);
  const { effects: transactionEffects, recentEvents, rxLed, ecoLed } = useBlockTransactions(blockInfo?.blockNumber, showTraffic, walletSystemMap);

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
          "read directly from the vEscrow contract",
          "veGNET decays as locks approach expiry",
          "lock amount and lock extension are tracked separately",
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
          "read directly from RewardDistributor",
          "ranked by total entitled GNET",
          "claimed mode highlights realized allocation",
        ],
        decorators: [
          {
            id: EPOCH_ADDRESS,
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
          "read from the gUBI pool API",
          "token balances come from the pool vault",
          "planet size and orbit order follow USD weight",
        ],
        decorators: [
          {
            id: "__sputnik__",
            kind: "sputnik-probe",
            orbitRadius: poolData.planets.length > 0
              ? poolData.planets[poolData.planets.length - 1].orbitRadius + 320
              : 600,
          },
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
          { label: "state", value: stakingRemnant.data?.statusLabel ?? "sync pending", accent: "#d39b86" },
        ],
        descriptionLines: [
          "read from the legacy staking shell",
          "shows remaining staked GNET and the freeze window",
          "state shows whether exits are still draining the shell",
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
      {
        ...TRANSIT_BEACON_OBJECT,
        kind: "transit-beacon",
      },
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
      ...transactionEffects,
    ]
  ), [blockFlash, transactionEffects]);

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

  const resolveTargetScope = useCallback((id: string) => {
    const target = findPhotoTargetById(photoTargetSections, id);
    if (!target) return { rawId: id, scopedId: id };
    if (target.kind === "wallet" && target.systemId) {
      return {
        rawId: id,
        scopedId: `${target.systemId}:${id.toLowerCase()}`,
      };
    }
    return { rawId: id, scopedId: target.id };
  }, [photoTargetSections]);

  const cameraFocusAddress = (photoMode && photoFocusMode === "detached") || (!photoMode && flyModeEnabled)
    ? null
    : (cameraTargetId ?? selectedAddress);
  const sceneCameraMode: CameraMode = photoMode
    ? (photoFocusMode === "detached" ? "fly" : "orbit")
    : cameraMode;
  const sceneFlyModeEnabled = !photoMode && flyModeEnabled;
  const sceneCinematicFlyEnabled = photoMode && photoFocusMode === "detached";

  const allEntries = useMemo(
    () => systems.flatMap((system) => system.entries),
    [systems],
  );

  const trafficItems = useMemo<TrafficPanelItem[]>(() => {
    const nameMap = new Map<string, string>();
    for (const entry of allEntries) {
      if (entry.customName) nameMap.set(entry.address.toLowerCase(), entry.customName);
    }

    const chipForSystem = (systemId: SceneSystemId | null | undefined) => {
      if (systemId === "vescrow") return "VE";
      if (systemId === "vesting") return "VEST";
      if (systemId === "gubi-pool") return "POOL";
      if (systemId === "staking-remnant") return "STAKE";
      return null;
    };

    const chipForAddress = (address: string | null) => {
      if (!address) return null;
      return chipForSystem(walletSystemMap[address.toLowerCase()] ?? null);
    };

    const chipForEvent = (event: (typeof recentEvents)[number]) => {
      const fromLower = event.fromAddress.toLowerCase();
      const toLower = event.toAddress?.toLowerCase() ?? null;
      const touchesBridge =
        event.classification === "bridge-in"
        || event.classification === "bridge-out"
        || fromLower === ARBSYS_ADDRESS
        || fromLower === HYPERLANE_MAILBOX
        || toLower === ARBSYS_ADDRESS
        || toLower === HYPERLANE_MAILBOX;

      if (touchesBridge) return "BRIDGE";
      if (event.classification === "vescrow-lock" || event.classification === "vescrow-unlock") return "VE";
      if (event.classification === "faucet-claim") return "VE";
      if (event.classification === "vesting-claim") return "VEST";
      if (event.classification === "staking-withdraw") return "STAKE";

      const fromChip = chipForAddress(event.fromAddress);
      const toChip = chipForAddress(event.toAddress);

      if (!fromChip && !toChip) return "BEACON";
      if (fromChip && toChip && fromChip !== toChip) return `${fromChip}>${toChip}`;
      return fromChip ?? toChip ?? "BEACON";
    };

    const formatAddr = (address: string | null) => {
      if (!address) return "system";
      return nameMap.get(address.toLowerCase()) ?? `${address.slice(0, 6)}...${address.slice(-4)}`;
    };

    const hasKnown = (address: string | null) => Boolean(address && allEntries.some((entry) => entry.address.toLowerCase() === address.toLowerCase()));

    return recentEvents.map((event) => ({
      id: event.id,
      txHash: event.txHash,
      label: event.label,
      systemChip: chipForEvent(event),
      fromLabel: formatAddr(event.fromAddress),
      toLabel: formatAddr(event.toAddress),
      amount: event.amountFormatted,
      blockNumber: event.blockNumber,
      ecosystem: event.isEcosystem,
      selectableAddress: hasKnown(event.fromAddress)
        ? event.fromAddress
        : hasKnown(event.toAddress)
          ? event.toAddress
          : null,
    }));
  }, [allEntries, recentEvents, walletSystemMap]);

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
    // Parse "systemId:0xaddr" scoped IDs emitted by StarSystem
    const colonIdx = address.indexOf(":");
    const isScoped = colonIdx > 0 && !address.startsWith("__");
    const rawAddr = isScoped ? address.slice(colonIdx + 1) : address;
    const scopedId = isScoped ? address : (walletSystemMap[address.toLowerCase()] ? `${walletSystemMap[address.toLowerCase()]}:${address.toLowerCase()}` : undefined);
    const entry = allEntries.find((item) => item.address.toLowerCase() === rawAddr.toLowerCase());
    focusSceneTarget(rawAddr, Boolean(entry), scopedId);
    wc.setNameInput(entry?.customName || "");
  }, [allEntries, bridges, focusSceneTarget, photoMode, walletSystemMap, wc]);

  const handleDirectorySelect = useCallback((address: string, customName?: string) => {
    const systemId = walletSystemMap[address.toLowerCase()];
    const scopedId = systemId ? `${systemId}:${address.toLowerCase()}` : undefined;
    focusSceneTarget(address, true, scopedId);
    wc.setNameInput(customName || "");
  }, [focusSceneTarget, walletSystemMap, wc]);

  const handleBridgeSelect = useCallback((bridgeId: string) => {
    if (!getBridgeById(bridges, bridgeId)) return;
    focusSceneTarget(bridgeId, false);
  }, [bridges, focusSceneTarget]);

  const handleClearSelection = useCallback(() => {
    setPanelOpen(false);
    setSelectedAddress(null);
    setCameraTargetId(null);
    if (photoMode) {
      setPhotoFocusMode("detached");
    }
    setSelectionVersion((v) => v + 1);
  }, [photoMode]);

  const handleToggleFlyMode = useCallback(() => {
    const next = !flyModeEnabled;
    if (next) {
      setShowTraffic(false);
      setShowNamesList(false);
      setShowHelp(false);
      setPanelOpen(false);
      setFlyPickerOpen(false);
      setFlyAutopilotActive(false);
      setSelectedAddress(null);
      setCameraTargetId(null);
      setSelectionVersion((v) => v + 1);
    } else {
      freelookRef.current?.cancelFlyTo();
      setFlyPickerOpen(false);
      setFlyAutopilotActive(false);
    }
    setFlyModeEnabled(next);
    setCameraMode(next ? "fly" : "orbit");
  }, [flyModeEnabled]);

  const handleEnterPhotoMode = useCallback(() => {
    // Freeze the current ship-camera view in place for photo mode.
    if (flyModeEnabled || cameraMode === "fly") {
      freelookRef.current?.cancelFlyTo();
      setFlyModeEnabled(false);
      setCameraMode("orbit");
    }
    setShowTraffic(false);
    setPhotoHudVisible(true);
    setPhotoFocusMode(selectedAddress ? "focused" : "detached");
      setPhotoSimulationMode("frozen");
    setPhotoPickerOpen(false);
    setFlyPickerOpen(false);
    setFlyAutopilotActive(false);
    setPhotoMode(true);
  }, [cameraMode, flyModeEnabled, selectedAddress]);

  const handleToggleTraffic = useCallback(() => {
    setShowTraffic((current) => {
      const next = !current;
      if (next) setTrafficPanelOpen(true);
      return next;
    });
  }, []);

  const handleExitPhotoMode = useCallback(() => {
    freelookRef.current?.cancelFlyTo();
    setCameraMode("orbit");
    setPhotoMode(false);
    setPhotoHudVisible(true);
    setPhotoPickerOpen(false);
    setPhotoFocusMode("focused");
      setPhotoSimulationMode("frozen");
    setPhotoSavedToast(false);
  }, []);

  const handlePhotoTargetSelect = useCallback((address: string) => {
    const { rawId, scopedId } = resolveTargetScope(address);
    const entry = allEntries.find((item) => item.address.toLowerCase() === rawId.toLowerCase());
    setPhotoFocusMode("focused");
    setPhotoPickerOpen(false);
    focusSceneTarget(rawId, false, scopedId);
    wc.setNameInput(entry?.customName || "");
  }, [allEntries, focusSceneTarget, resolveTargetScope, wc]);

  const handleFlyTargetSelect = useCallback((address: string) => {
    const { rawId, scopedId } = resolveTargetScope(address);
    const entry = allEntries.find((item) => item.address.toLowerCase() === rawId.toLowerCase());
    const body = lookupSceneBody(scopedId.toLowerCase());

    freelookRef.current?.cancelFlyTo();
    setFlyPickerOpen(false);
    setPanelOpen(false);
    setSelectedAddress(rawId);
    setCameraTargetId(scopedId);
    setSelectionVersion((value) => value + 1);
    wc.setNameInput(entry?.customName || "");

    if (body) {
      freelookRef.current?.lookAt(body.position, 760);
    }
  }, [allEntries, resolveTargetScope, wc]);

  const handleFlyToTarget = useCallback(() => {
    if (flyAutopilotActive) {
      freelookRef.current?.cancelFlyTo();
      return;
    }

    const targetId = cameraTargetId ?? selectedAddress;
    if (!targetId) return;

    const body = lookupSceneBody(targetId.toLowerCase());
    if (!body) return;

    const stopDistance = (() => {
      switch (body.bodyType) {
        case "star":
          return Math.max(body.bodyRadius + 30, (body.focusRadius ?? body.bodyRadius * 3.1) * 0.3);
        case "bridge":
          return Math.max(body.bodyRadius * 1.8, 28);
        case "planet":
          return Math.max(body.bodyRadius * 1.75, 14);
        case "moon":
        case "satellite":
          return Math.max(body.bodyRadius * 1.45, 9);
        case "comet":
        case "rogue":
          return Math.max(body.bodyRadius * 1.55, 12);
        default:
          return Math.max(body.bodyRadius * 1.6, 10);
      }
    })();

    setFlyPickerOpen(false);
    setPanelOpen(false);
    setSelectionVersion((value) => value + 1);
    freelookRef.current?.flyTo(body.position, stopDistance);
  }, [cameraTargetId, flyAutopilotActive, selectedAddress]);

  const handlePhotoDetach = useCallback(() => {
    setPhotoFocusMode("detached");
  }, []);

  const handlePhotoRefocus = useCallback(() => {
    setPhotoFocusMode("focused");
    if (selectedAddress) {
      setSelectionVersion((value) => value + 1);
    }
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
        flyAutopilotActive={flyAutopilotActive}
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
        onAutoFlightChange={setFlyAutopilotActive}
        onFovChange={setPhotoFov}
        getFlyTarget={React.useCallback(() => {
          const id = cameraTargetId ?? selectedAddress;
          if (!id) return null;
          return lookupSceneBody(id.toLowerCase())?.position ?? null;
        }, [cameraTargetId, selectedAddress])}
        onResetDone={() => setResetRequested(false)}
      />

      <SystemHud
        isMobile={isMobile}
        photoMode={photoMode}
        photoHudVisible={photoHudVisible}
        photoPickerOpen={photoPickerOpen}
        flyPickerOpen={flyPickerOpen}
        photoFocusMode={photoFocusMode}
        photoTargetLabel={photoTarget?.label ?? null}
        flyTargetLabel={photoTarget?.label ?? null}
        flyAutopilotActive={flyAutopilotActive}
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
        showTraffic={showTraffic}
        trafficPanelOpen={trafficPanelOpen}
        rxLed={rxLed}
        ecoLed={ecoLed}
        trafficItems={trafficItems}
        flyModeEnabled={flyModeEnabled}
        showFlightHud={showFlightHud}
        sceneReady={sceneReady}
        layoutMode={layoutMode}
        vestingLayoutMode={vestingLayoutMode}
        systems={systems}
        activeSystemId={activeSystemId}
        selectedBridge={selectedBridge}
        selectedTransitBeacon={selectedTransitBeacon}
        selectedAddress={selectedAddress}
        selectedSystemId={selectedSystemId}
        camDebug={camDebug}
        blockInfo={blockInfo}
        wc={wc}
        onCapturePhoto={doCapture}
        onExitPhotoMode={handleExitPhotoMode}
        onPhotoTargetSelect={handlePhotoTargetSelect}
        onPhotoDetach={handlePhotoDetach}
        onPhotoRefocus={handlePhotoRefocus}
        onTogglePhotoPicker={() => setPhotoPickerOpen((value) => !value)}
        onToggleFlyPicker={() => setFlyPickerOpen((value) => !value)}
        onSetPhotoSimulationMode={setPhotoSimulationMode}
        onSetPhotoFov={setPhotoFov}
        onTogglePhotoHud={() => setPhotoHudVisible((v) => !v)}
        onToggleLabels={() => setShowAllNames((v) => !v)}
        onToggleRenamed={() => setShowRenamedOnly((v) => !v)}
        onToggleDirectory={() => setShowNamesList((v) => !v)}
        onToggleHelp={() => setShowHelp((v) => !v)}
        onToggleOrbits={() => setShowOrbits((v) => !v)}
        onToggleTraffic={handleToggleTraffic}
        onToggleTrafficPanel={() => setTrafficPanelOpen((value) => !value)}
        onTrafficSelect={handleSceneSelect}
        onToggleFlightHud={() => setShowFlightHud((v) => !v)}
        onReset={handleReset}
        onToggleFlyMode={handleToggleFlyMode}
        onPhotoMode={handleEnterPhotoMode}
        onFlyTargetSelect={handleFlyTargetSelect}
        onFlyToTarget={handleFlyToTarget}
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

