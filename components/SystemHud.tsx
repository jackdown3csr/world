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
import type { BlockInfo } from "@/hooks/useBlock";
import type { SceneSystemDefinition, SceneSystemId } from "@/lib/sceneSystems";
import type { BridgeSceneObject } from "@/lib/bridges";
import { usePanelSwap } from "@/hooks/usePanelSwap";
import HudToolbar from "./HudToolbar";
import WalletPanel from "./WalletPanel";
import DirectoryPanel from "./DirectoryPanel";
import HelpPanel from "./HelpPanel";
import BridgeInfoCard from "./systemHud/BridgeInfoCard";
import SystemInfoCard from "./systemHud/SystemInfoCard";
import PhotoObjectPicker from "./systemHud/PhotoObjectPicker";
import { TopStrip, TopStripChip, TopStripDivider, TopStripGroup } from "./TopStrip";
import type { WalletConnectionState, WalletConnectionActions } from "@/hooks/useWalletConnection";
import type { PhotoTargetSection } from "@/lib/photoTargets";
import { getShortcutByKey, photoModeShortcuts, toolbarShortcuts } from "@/lib/shortcuts";

type PhotoOverlayMode = "clean" | "grid" | "scope";

const photoGuideLine: React.CSSProperties = {
  position: "absolute",
  background: "rgba(255,255,255,0.14)",
  boxShadow: "0 0 0 1px rgba(0,0,0,0.08)",
  pointerEvents: "none",
};

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
  photoHudVisible: boolean;
  photoPickerOpen: boolean;
  photoFocusMode: "focused" | "detached";
  photoTargetLabel: string | null;
  photoTargetSections: PhotoTargetSection[];
  flashCapture: boolean;
  photoSavedToast: boolean;
  simulationPaused: boolean;
  photoSimulationMode: "frozen" | "live";
  photoFov: number;
  showAllNames: boolean;
  showRenamedOnly: boolean;
  showNamesList: boolean;
  showHelp: boolean;
  showOrbits: boolean;
  flyModeEnabled: boolean;
  showFlightHud: boolean;
  sceneReady: boolean;
  layoutMode: LayoutMode;
  vestingLayoutMode: VestingLayoutMode;
  systems: SceneSystemDefinition[];
  activeSystemId: SceneSystemId;
  selectedBridge?: BridgeSceneObject | null;
  selectedAddress: string | null;
  camDebug: CamDebug | null;
  blockInfo: BlockInfo | null;
  wc: WalletConnectionState & WalletConnectionActions;
  onCapturePhoto: () => void;
  onExitPhotoMode: () => void;
  onPhotoTargetSelect: (address: string) => void;
  onPhotoDetach: () => void;
  onPhotoRefocus: () => void;
  onTogglePhotoPicker: () => void;
  onSetPhotoSimulationMode: (mode: "frozen" | "live") => void;
  onSetPhotoFov: (fov: number) => void;
  onTogglePhotoHud: () => void;
  onToggleLabels: () => void;
  onToggleRenamed: () => void;
  onToggleDirectory: () => void;
  onToggleHelp: () => void;
  onToggleOrbits: () => void;
  onToggleFlightHud: () => void;
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
  photoHudVisible,
  photoPickerOpen,
  photoFocusMode,
  photoTargetLabel,
  photoTargetSections,
  flashCapture,
  photoSavedToast,
  simulationPaused,
  photoSimulationMode,
  photoFov,
  showAllNames,
  showRenamedOnly,
  showNamesList,
  showHelp,
  showOrbits,
  flyModeEnabled,
  showFlightHud,
  sceneReady,
  layoutMode,
  vestingLayoutMode,
  systems,
  activeSystemId,
  selectedBridge,
  selectedAddress,
  camDebug,
  blockInfo,
  wc,
  onCapturePhoto,
  onExitPhotoMode,
  onPhotoTargetSelect,
  onPhotoDetach,
  onPhotoRefocus,
  onTogglePhotoPicker,
  onSetPhotoSimulationMode,
  onSetPhotoFov,
  onTogglePhotoHud,
  onToggleLabels,
  onToggleRenamed,
  onToggleDirectory,
  onToggleHelp,
  onToggleOrbits,
  onToggleFlightHud,
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
  const PANEL_SWAP_MS = 320;
  const OVERVIEW_FADE_MS = 760;
  const PANEL_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
  const attachedMenuTop = 33;
  const contextSystem = systems.find((system) => system.id === activeSystemId) ?? systems[0];
  const [photoOverlayMode, setPhotoOverlayMode] = React.useState<PhotoOverlayMode>("clean");
  const [showSceneInfo, setShowSceneInfo] = React.useState(false);
  const [overviewVisible, setOverviewVisible] = React.useState(false);
  const [overviewMounted, setOverviewMounted] = React.useState(false);
  const [overviewPhase, setOverviewPhase] = React.useState<"hidden" | "entering" | "visible" | "leaving">("hidden");
  const overviewDismissedForRef = React.useRef<string | null>(null);
  const lastOverviewTargetRef = React.useRef<string | null>(null);
  const overviewHideTimerRef = React.useRef<number | null>(null);
  const overviewUnmountTimerRef = React.useRef<number | null>(null);
  const [bridgeOverviewVisible, setBridgeOverviewVisible] = React.useState(false);
  const [bridgeOverviewMounted, setBridgeOverviewMounted] = React.useState(false);
  const [bridgeOverviewPhase, setBridgeOverviewPhase] = React.useState<"hidden" | "entering" | "visible" | "leaving">("hidden");
  const bridgeOverviewDismissedForRef = React.useRef<string | null>(null);
  const lastBridgeOverviewTargetRef = React.useRef<string | null>(null);
  const bridgeOverviewHideTimerRef = React.useRef<number | null>(null);
  const bridgeOverviewUnmountTimerRef = React.useRef<number | null>(null);
  const photoShortcutMap = React.useMemo(() => ({
    hud: getShortcutByKey(photoModeShortcuts, "H")?.keys ?? "H",
    exit: getShortcutByKey(photoModeShortcuts, "Esc")?.keys ?? "Esc",
    capture: getShortcutByKey(photoModeShortcuts, "Space")?.keys ?? "Space",
    targets: getShortcutByKey(photoModeShortcuts, "T")?.keys ?? "T",
    detach: getShortcutByKey(photoModeShortcuts, "V")?.keys ?? "V",
    refocus: getShortcutByKey(photoModeShortcuts, "F")?.keys ?? "F",
  }), []);
  const connectedLabel = wc.connectedAddress
    ? `${wc.connectedAddress.slice(0, 4)}...${wc.connectedAddress.slice(-4)}`
    : null;
  const selectedSystemStarId = selectedAddress?.startsWith("__star_") ? selectedAddress : null;
  const selectedSystem = React.useMemo(() => {
    if (!selectedAddress) return null;

    const lowered = selectedAddress.toLowerCase();
    return systems.find((system) => (
      system.starId === selectedAddress
      || system.entries.some((entry) => entry.address.toLowerCase() === lowered)
    )) ?? null;
  }, [selectedAddress, systems]);
  const hasDetachedFocus = Boolean(selectedAddress) && !selectedSystem;
  const displaySystem = hasDetachedFocus ? contextSystem : (selectedSystem ?? contextSystem);
  const activeData = displaySystem?.data ?? {
    planets: [],
    asteroids: [],
    beltInnerRadius: 0,
    beltOuterRadius: 0,
  };
  const toolbarActiveSystemId = hasDetachedFocus ? null : displaySystem?.id ?? null;
  const photoFovPresets = [35, 55, 70];
  const overviewTargetId = hasDetachedFocus ? null : (displaySystem?.id ?? activeSystemId);
  const selectedBridgeId = selectedBridge?.id ?? null;
  const bridgePanelVisible = Boolean(selectedBridge) && !isMobile;
  const activeDesktopPanel = showHelp
    ? "help"
    : showNamesList
      ? "list"
      : selectedBridge
        ? showSceneInfo
          ? "bridge-info"
          : bridgeOverviewMounted
            ? "bridge-overview"
            : null
        : showSceneInfo
          ? "info"
          : hasDetachedFocus
            ? null
            : overviewMounted
              ? "overview"
              : null;
  const infoPanelVisible = activeDesktopPanel === "overview"
    || activeDesktopPanel === "info"
    || activeDesktopPanel === "bridge-overview"
    || activeDesktopPanel === "bridge-info";
  const infoChipActive = showSceneInfo
    || (activeDesktopPanel === "overview" && overviewVisible)
    || (activeDesktopPanel === "bridge-overview" && bridgeOverviewVisible);
  const { displayItem: panelSystem, animationState: panelAnimationState } = usePanelSwap({
    item: displaySystem,
    itemKey: displaySystem.id,
    enabled: !isMobile && (activeDesktopPanel === "overview" || activeDesktopPanel === "info"),
    durationMs: PANEL_SWAP_MS,
  });
  const { displayItem: panelBridge, animationState: bridgePanelAnimationState } = usePanelSwap({
    item: selectedBridge ?? null,
    itemKey: selectedBridgeId,
    enabled: !isMobile && (activeDesktopPanel === "bridge-overview" || activeDesktopPanel === "bridge-info"),
    durationMs: PANEL_SWAP_MS,
  });

  React.useEffect(() => {
    if (!photoMode) return;

    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;

      if (e.key.toLowerCase() === "m") {
        e.preventDefault();
        onSetPhotoSimulationMode(photoSimulationMode === "live" ? "frozen" : "live");
        return;
      }

      if (e.key.toLowerCase() === "g") {
        e.preventDefault();
        setPhotoOverlayMode((mode) => mode === "clean" ? "grid" : mode === "grid" ? "scope" : "clean");
        return;
      }

      if (e.key.toLowerCase() === "h") {
        e.preventDefault();
        onTogglePhotoHud();
        return;
      }

      if (e.key.toLowerCase() === "t") {
        e.preventDefault();
        onTogglePhotoPicker();
        return;
      }

      if (e.key.toLowerCase() === "v") {
        e.preventDefault();
        onPhotoDetach();
        return;
      }

      if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        onPhotoRefocus();
        return;
      }

      if (e.key === " ") {
        e.preventDefault();
        onCapturePhoto();
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        onExitPhotoMode();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    onCapturePhoto,
    onExitPhotoMode,
    onPhotoDetach,
    onPhotoRefocus,
    onSetPhotoSimulationMode,
    onTogglePhotoHud,
    onTogglePhotoPicker,
    photoMode,
    photoSimulationMode,
  ]);

  // Reset dismissal when the watched target changes so a new selection auto-shows.
  React.useEffect(() => {
    overviewDismissedForRef.current = null;
  }, [overviewTargetId]);

  React.useEffect(() => {
    if (overviewHideTimerRef.current !== null) {
      window.clearTimeout(overviewHideTimerRef.current);
      overviewHideTimerRef.current = null;
    }
    if (overviewUnmountTimerRef.current !== null) {
      window.clearTimeout(overviewUnmountTimerRef.current);
      overviewUnmountTimerRef.current = null;
    }

    if (!sceneReady || isMobile || hasDetachedFocus || showHelp || showNamesList || showSceneInfo
        || overviewDismissedForRef.current === overviewTargetId) {
      lastOverviewTargetRef.current = overviewTargetId;
      setOverviewVisible(false);
      setOverviewMounted(false);
      setOverviewPhase("hidden");
      return;
    }

    const isRetargetingOverview = Boolean(
      overviewTargetId
      && overviewMounted
      && overviewVisible
      && lastOverviewTargetRef.current
      && lastOverviewTargetRef.current !== overviewTargetId,
    );
    lastOverviewTargetRef.current = overviewTargetId;

    setOverviewMounted(true);
    let rafId: number | null = null;
    if (isRetargetingOverview) {
      setOverviewPhase("visible");
      setOverviewVisible(true);
    } else {
      rafId = window.requestAnimationFrame(() => {
        setOverviewPhase("entering");
        setOverviewVisible(true);
      });
    }

    const settleVisibleTimer = window.setTimeout(() => {
      setOverviewPhase("visible");
    }, isRetargetingOverview ? 0 : OVERVIEW_FADE_MS);

    overviewHideTimerRef.current = window.setTimeout(() => {
      setOverviewPhase("leaving");
      setOverviewVisible(false);
      overviewHideTimerRef.current = null;
    }, 8000);

    overviewUnmountTimerRef.current = window.setTimeout(() => {
      setOverviewMounted(false);
      setOverviewPhase("hidden");
      overviewUnmountTimerRef.current = null;
    }, 8000 + OVERVIEW_FADE_MS);

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      window.clearTimeout(settleVisibleTimer);
      if (overviewHideTimerRef.current !== null) {
        window.clearTimeout(overviewHideTimerRef.current);
        overviewHideTimerRef.current = null;
      }
      if (overviewUnmountTimerRef.current !== null) {
        window.clearTimeout(overviewUnmountTimerRef.current);
        overviewUnmountTimerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSystemId, hasDetachedFocus, isMobile, sceneReady, showHelp, showNamesList, showSceneInfo]);

  React.useEffect(() => {
    bridgeOverviewDismissedForRef.current = null;
  }, [selectedBridgeId]);

  React.useEffect(() => {
    if (bridgeOverviewHideTimerRef.current !== null) {
      window.clearTimeout(bridgeOverviewHideTimerRef.current);
      bridgeOverviewHideTimerRef.current = null;
    }
    if (bridgeOverviewUnmountTimerRef.current !== null) {
      window.clearTimeout(bridgeOverviewUnmountTimerRef.current);
      bridgeOverviewUnmountTimerRef.current = null;
    }

    if (isMobile || !selectedBridge || showHelp || showNamesList || showSceneInfo
        || bridgeOverviewDismissedForRef.current === selectedBridgeId) {
      lastBridgeOverviewTargetRef.current = selectedBridgeId;
      setBridgeOverviewVisible(false);
      setBridgeOverviewMounted(false);
      setBridgeOverviewPhase("hidden");
      return;
    }

    const isRetargetingBridgeOverview = Boolean(
      selectedBridgeId
      && bridgeOverviewMounted
      && bridgeOverviewVisible
      && lastBridgeOverviewTargetRef.current
      && lastBridgeOverviewTargetRef.current !== selectedBridgeId,
    );
    lastBridgeOverviewTargetRef.current = selectedBridgeId;

    setBridgeOverviewMounted(true);
    let rafId: number | null = null;
    if (isRetargetingBridgeOverview) {
      setBridgeOverviewPhase("visible");
      setBridgeOverviewVisible(true);
    } else {
      rafId = window.requestAnimationFrame(() => {
        setBridgeOverviewPhase("entering");
        setBridgeOverviewVisible(true);
      });
    }

    const settleVisibleTimer = window.setTimeout(() => {
      setBridgeOverviewPhase("visible");
    }, isRetargetingBridgeOverview ? 0 : OVERVIEW_FADE_MS);

    bridgeOverviewHideTimerRef.current = window.setTimeout(() => {
      setBridgeOverviewPhase("leaving");
      setBridgeOverviewVisible(false);
      bridgeOverviewHideTimerRef.current = null;
    }, 8000);

    bridgeOverviewUnmountTimerRef.current = window.setTimeout(() => {
      setBridgeOverviewMounted(false);
      setBridgeOverviewPhase("hidden");
      bridgeOverviewUnmountTimerRef.current = null;
    }, 8000 + OVERVIEW_FADE_MS);

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      window.clearTimeout(settleVisibleTimer);
      if (bridgeOverviewHideTimerRef.current !== null) {
        window.clearTimeout(bridgeOverviewHideTimerRef.current);
        bridgeOverviewHideTimerRef.current = null;
      }
      if (bridgeOverviewUnmountTimerRef.current !== null) {
        window.clearTimeout(bridgeOverviewUnmountTimerRef.current);
        bridgeOverviewUnmountTimerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBridgeId, isMobile, showHelp, showNamesList, showSceneInfo]);

  const handleInfoToggle = React.useCallback(() => {
    if (infoChipActive) {
      // Mark current targets as dismissed so auto-overview won't reopen them.
      overviewDismissedForRef.current = overviewTargetId;
      bridgeOverviewDismissedForRef.current = selectedBridgeId;

      setShowSceneInfo(false);

      if (overviewHideTimerRef.current !== null) {
        window.clearTimeout(overviewHideTimerRef.current);
        overviewHideTimerRef.current = null;
      }
      if (overviewUnmountTimerRef.current !== null) {
        window.clearTimeout(overviewUnmountTimerRef.current);
        overviewUnmountTimerRef.current = null;
      }
      setOverviewVisible(false);
      setOverviewMounted(false);
      setOverviewPhase("hidden");

      if (bridgeOverviewHideTimerRef.current !== null) {
        window.clearTimeout(bridgeOverviewHideTimerRef.current);
        bridgeOverviewHideTimerRef.current = null;
      }
      if (bridgeOverviewUnmountTimerRef.current !== null) {
        window.clearTimeout(bridgeOverviewUnmountTimerRef.current);
        bridgeOverviewUnmountTimerRef.current = null;
      }
      setBridgeOverviewVisible(false);
      setBridgeOverviewMounted(false);
      setBridgeOverviewPhase("hidden");
      return;
    }

    setShowSceneInfo(true);
    if (showNamesList) onToggleDirectory();
    if (showHelp) onToggleHelp();
  }, [infoChipActive, onToggleDirectory, onToggleHelp, overviewTargetId, selectedBridgeId, showHelp, showNamesList]);

  const handleListToggle = React.useCallback(() => {
    if (!showNamesList) {
      if (showSceneInfo) setShowSceneInfo(false);
      if (showHelp) onToggleHelp();
    }
    onToggleDirectory();
  }, [onToggleDirectory, onToggleHelp, showHelp, showNamesList, showSceneInfo]);

  const handleHelpToggle = React.useCallback(() => {
    if (!showHelp) {
      if (showSceneInfo) setShowSceneInfo(false);
      if (showNamesList) onToggleDirectory();
    }
    onToggleHelp();
  }, [onToggleDirectory, onToggleHelp, showHelp, showNamesList, showSceneInfo]);

  React.useEffect(() => {
    if (photoMode) return;

    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      // In fly mode FreeLookControls owns the keyboard; suppress all toolbar shortcuts
      // to prevent conflicts (R=reset vs RCS, H=help vs RCS forward, etc.)
      if (flyModeEnabled) return;

      const key = e.key.toLowerCase();
      if (key === toolbarShortcuts.labels.toLowerCase()) {
        e.preventDefault();
        onToggleLabels();
        return;
      }
      if (key === toolbarShortcuts.named.toLowerCase()) {
        e.preventDefault();
        onToggleRenamed();
        return;
      }
      if (key === toolbarShortcuts.orbits.toLowerCase()) {
        e.preventDefault();
        onToggleOrbits();
        return;
      }
      if (key === toolbarShortcuts.ranked.toLowerCase()) {
        e.preventDefault();
        onToggleLayout();
        return;
      }
      if (key === toolbarShortcuts.gnet.toLowerCase()) {
        e.preventDefault();
        onToggleGnet();
        return;
      }
      if (key === toolbarShortcuts.claimed.toLowerCase()) {
        e.preventDefault();
        onToggleVestingClaimed();
        return;
      }
      if (key === toolbarShortcuts.fly.toLowerCase()) {
        e.preventDefault();
        onToggleFlyMode();
        return;
      }
      if (key === toolbarShortcuts.photo.toLowerCase()) {
        e.preventDefault();
        onPhotoMode();
        return;
      }
      if (key === toolbarShortcuts.reset.toLowerCase()) {
        e.preventDefault();
        onReset();
        return;
      }
      if (key === toolbarShortcuts.help.toLowerCase()) {
        e.preventDefault();
        handleHelpToggle();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    handleHelpToggle,
    onPhotoMode,
    onReset,
    onToggleFlyMode,
    onToggleGnet,
    onToggleLabels,
    onToggleLayout,
    onToggleOrbits,
    onToggleRenamed,
    onToggleVestingClaimed,
    photoMode,
  ]);

  const toolbarProps = {
    showAllNames,
    onToggleLabels,
    showRenamedOnly,
    onToggleRenamed,
    showHelp,
    onToggleHelp,
    showOrbits,
    onToggleOrbits,
    showFlightHud,
    onToggleFlightHud,
    onReset,
    flyModeEnabled,
    onToggleFlyMode,
    onPhotoMode,
    rankedLayout: layoutMode !== "solar",
    onToggleLayout,
    gnetRanked: layoutMode === "ranked-gnet",
    onToggleGnet,
    layoutVariant: displaySystem?.layoutVariant ?? "vescrow",
    vestingClaimed: vestingLayoutMode === "claimed",
    onToggleVestingClaimed,
    showHelpButton: isMobile,
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
    showConnectAction: isMobile,
    hideWhenDisconnected: !isMobile,
  };

  return (
    <>
      {/* ── Photo mode overlay ── */}
      {photoMode && (
        <>
          {flashCapture && (
            <>
              <div style={{
                position: "fixed", inset: 0, zIndex: 39,
                background: "rgba(0,0,0,0.22)",
                pointerEvents: "none",
              }} />
              <div style={{
                position: "fixed", inset: 0, zIndex: 40,
                background: "rgba(255,255,255,0.22)",
                pointerEvents: "none",
              }} />
            </>
          )}
          {photoHudVisible && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 34, pointerEvents: "none" }}>
                <div style={{
                  position: "absolute", inset: 0,
                  background: "radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 58%, rgba(0,0,0,0.16) 100%)",
                  opacity: photoOverlayMode === "clean" ? 0.38 : 0.5,
                }} />
                {photoOverlayMode === "grid" && (
                  <>
                    <div style={{ ...photoGuideLine, left: "33.333%", top: 0, bottom: 0, width: 1 }} />
                    <div style={{ ...photoGuideLine, left: "66.666%", top: 0, bottom: 0, width: 1 }} />
                    <div style={{ ...photoGuideLine, top: "33.333%", left: 0, right: 0, height: 1 }} />
                    <div style={{ ...photoGuideLine, top: "66.666%", left: 0, right: 0, height: 1 }} />
                  </>
                )}
                {photoOverlayMode === "scope" && (
                  <>
                    <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: "10%", background: "rgba(0,0,0,0.58)" }} />
                    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "10%", background: "rgba(0,0,0,0.58)" }} />
                    <div style={{ ...photoGuideLine, left: "10%", right: "10%", top: "50%", height: 1, opacity: 0.18 }} />
                  </>
                )}
              </div>
              <TopStrip left={0} right={0} top={0} zIndex={35} nowrap>
                <TopStripGroup>
                  <TopStripChip label="clean" active={photoOverlayMode === "clean"} onClick={() => setPhotoOverlayMode("clean")} />
                  <TopStripChip label="grid" active={photoOverlayMode === "grid"} onClick={() => setPhotoOverlayMode("grid")} />
                  <TopStripChip label="scope" active={photoOverlayMode === "scope"} onClick={() => setPhotoOverlayMode("scope")} />
                </TopStripGroup>
                <TopStripDivider />
                <TopStripGroup padding="0 2px">
                  {photoFovPresets.map((preset) => (
                    <TopStripChip
                      key={preset}
                      label={`${preset}fov`}
                      active={photoFov === preset}
                      onClick={() => onSetPhotoFov(preset)}
                      title={`Set photo lens to ${preset} degrees`}
                    />
                  ))}
                </TopStripGroup>
                <TopStripDivider />
                <TopStripGroup padding="0 2px">
                  <TopStripChip label={photoFocusMode === "focused" ? "focused" : "detached"} active variant="status" />
                  <TopStripChip label={photoTargetLabel ?? "no target"} active={Boolean(photoTargetLabel)} accent="#9cc9d8" title={photoTargetLabel ?? "No focused object selected"} />
                </TopStripGroup>
                <TopStripDivider />
                <TopStripGroup padding="0 2px">
                  <TopStripChip label="targets" active={photoPickerOpen} onClick={onTogglePhotoPicker} title={`Open object picker (${photoShortcutMap.targets})`} />
                  <TopStripChip label="detach" active={photoFocusMode === "detached"} onClick={onPhotoDetach} title={`Detach focus for cinematic fly (${photoShortcutMap.detach})`} />
                  <TopStripChip label="refocus" active={photoFocusMode === "focused"} onClick={onPhotoRefocus} title={`Snap back to current target (${photoShortcutMap.refocus})`} />
                </TopStripGroup>
                <TopStripDivider />
                <TopStripGroup padding="0 2px">
                  <TopStripChip label="frozen" active={photoSimulationMode === "frozen"} onClick={() => onSetPhotoSimulationMode("frozen")} title="Freeze scene simulation" />
                  <TopStripChip label="live" active={photoSimulationMode === "live"} onClick={() => onSetPhotoSimulationMode("live")} title="Live scene simulation" />
                  <TopStripChip label={simulationPaused ? "paused" : "live scene"} active={simulationPaused} variant="status" />
                </TopStripGroup>
                <TopStripDivider />
                <TopStripGroup padding="0 2px 0 2px">
                  <TopStripChip label="hud off" onClick={onTogglePhotoHud} accent="#9cc9d8" title={`Hide photo HUD (${photoShortcutMap.hud})`} />
                </TopStripGroup>
                <TopStripDivider />
                <TopStripGroup padding="0 0 0 2px">
                  <TopStripChip label="exit" onClick={onExitPhotoMode} accent="#7ae4f2" title={`Exit photo mode (${photoShortcutMap.exit})`} />
                </TopStripGroup>
              </TopStrip>
              {isMobile ? (
                <button
                  onClick={onCapturePhoto}
                  title={`Capture screenshot (${photoShortcutMap.capture})`}
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
              ) : (
                <button
                  onClick={onCapturePhoto}
                  title={`Capture screenshot (${photoShortcutMap.capture})`}
                  style={{
                    position: "fixed",
                    bottom: 26,
                    left: "50%",
                    transform: "translateX(-50%)",
                    zIndex: 35,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    minWidth: 192,
                    height: 46,
                    padding: "0 10px 0 14px",
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(4,10,18,0.78)",
                    boxShadow: "0 12px 28px rgba(0,0,0,0.26)",
                    backdropFilter: "blur(12px)",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(8,18,30,0.9)";
                    e.currentTarget.style.borderColor = "rgba(122,228,242,0.28)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(4,10,18,0.78)";
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                    <span style={{
                      color: "rgba(255,255,255,0.46)",
                      fontSize: 8,
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                    }}>
                      capture
                    </span>
                    <span style={{
                      color: "#eaf7ff",
                      fontSize: 11,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      fontWeight: 600,
                    }}>
                      save png
                    </span>
                  </div>
                  <div style={{
                    marginLeft: "auto",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 56,
                    height: 30,
                    padding: "0 10px",
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.05)",
                    color: "#c9fbff",
                    fontSize: 10,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    fontWeight: 700,
                    flexShrink: 0,
                  }}>
                    {photoShortcutMap.capture}
                  </div>
                </button>
              )}
            </>
          )}

          {photoHudVisible && photoPickerOpen && !isMobile && (
            <div style={{
              position: "fixed",
              right: 18,
              top: 42,
              width: 336,
              zIndex: 36,
              fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', Menlo, monospace",
              fontSize: 12,
              color: "#8a9bb0",
              boxShadow: "0 18px 42px rgba(0,0,0,0.28)",
            }}>
              <PhotoObjectPicker
                sections={photoTargetSections}
                selectedId={selectedAddress}
                onSelect={(item) => onPhotoTargetSelect(item.id)}
              />
            </div>
          )}

          {!photoHudVisible && (
            <div style={{ position: "fixed", top: 16, right: 18, zIndex: 35, pointerEvents: "none" }}>
              <div style={{
                padding: "4px 8px",
                borderRadius: 999,
                background: "rgba(0,0,0,0.22)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.55)",
                fontSize: 9,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}>
                {photoShortcutMap.hud} hud
              </div>
            </div>
          )}

          {photoSavedToast && (
            <div style={{
              position: "fixed",
              left: "50%",
              bottom: photoHudVisible ? 112 : 28,
              transform: "translateX(-50%)",
              zIndex: 41,
              pointerEvents: "none",
              padding: "8px 14px",
              borderRadius: 999,
              background: "rgba(5, 18, 28, 0.84)",
              border: "1px solid rgba(123,247,255,0.18)",
              color: "#c9fbff",
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              boxShadow: "0 10px 28px rgba(0,0,0,0.24)",
            }}>
              saved png
            </div>
          )}
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
                  solarData={activeData}
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
        <>
          <TopStrip left={0} right={0} top={0} zIndex={21} nowrap>
            <TopStripGroup gap={8}>
              {systems.map((system) => (
                <TopStripChip
                  key={system.id}
                  label={system.navLabel}
                  active={system.id === toolbarActiveSystemId}
                  onClick={selectedSystemStarId === system.starId || flyModeEnabled ? undefined : () => onJumpToStar(system.starId)}
                  disabled={flyModeEnabled}
                  accent={system.accent}
                  title={flyModeEnabled ? "System switching is disabled in fly mode" : undefined}
                  noTooltip
                />
              ))}
              <TopStripDivider />
              <TopStripChip label="info" active={infoChipActive} onClick={handleInfoToggle} accent="#9cc9d8" title="Open system panel" />
              <TopStripChip label="list" active={showNamesList} onClick={handleListToggle} accent="#9cc9d8" title="Open directory" />
              <TopStripChip label="help" active={showHelp} onClick={handleHelpToggle} accent="#9cc9d8" title="Open guide" />
            </TopStripGroup>

            <HudToolbar {...toolbarProps} compact embedded showHelpButton={false} />

            <TopStripDivider />

            {!wc.connectedAddress ? (
              <TopStripGroup padding="0 0 0 2px">
                <TopStripChip label="connect wallet" onClick={wc.connectWallet} accent="#00e5ff" title="Connect wallet" />
              </TopStripGroup>
            ) : (
              <TopStripGroup padding="0 0 0 2px">
                <TopStripChip label="wallet" active accent="#6ef7a7" title="Connected wallet" />
                {connectedLabel && <TopStripChip label={connectedLabel} active accent="#6ef7a7" title={wc.connectedAddress ?? undefined} />}
                {wc.canRename && (
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "0 0 0 2px",
                    flexShrink: 0,
                  }}>
                    <input
                      value={wc.nameInput}
                      onChange={(e) => wc.setNameInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !wc.isSaving && wc.nameInput.trim()) {
                          wc.savePlanetName();
                        }
                      }}
                      maxLength={32}
                      placeholder={wc.myWallet?.customName || "designation"}
                      disabled={wc.isSaving}
                      title="Rename connected wallet"
                      style={{
                        width: 140,
                        minWidth: 0,
                        height: 24,
                        border: "1px solid rgba(255,255,255,0.08)",
                        background: "rgba(255,255,255,0.04)",
                        color: "#d8ecf5",
                        borderRadius: 4,
                        padding: "0 8px",
                        fontSize: 10,
                        letterSpacing: "0.06em",
                        fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
                        outline: "none",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => wc.savePlanetName()}
                      disabled={wc.isSaving || !wc.nameInput.trim()}
                      title="Save designation"
                      style={{
                        height: 24,
                        minWidth: 24,
                        borderRadius: 4,
                        border: !wc.isSaving && wc.nameInput.trim()
                          ? "1px solid rgba(110,247,167,0.28)"
                          : "1px solid rgba(255,255,255,0.08)",
                        background: !wc.isSaving && wc.nameInput.trim()
                          ? "rgba(110,247,167,0.10)"
                          : "rgba(255,255,255,0.03)",
                        color: !wc.isSaving && wc.nameInput.trim() ? "#6ef7a7" : "rgba(255,255,255,0.34)",
                        cursor: !wc.isSaving && wc.nameInput.trim() ? "pointer" : "default",
                        fontSize: 11,
                        lineHeight: 1,
                        padding: "0 7px",
                        fontFamily: "inherit",
                        flexShrink: 0,
                      }}
                    >
                      {wc.isSaving ? "..." : "ok"}
                    </button>
                  </div>
                )}
                {wc.status && (
                  <TopStripChip
                    label={wc.status.includes("saved") ? "saved" : "wallet"}
                    active={wc.status.includes("saved")}
                    accent={wc.status.includes("saved") ? "#6ef7a7" : "#88a8b8"}
                    title={wc.status}
                  />
                )}
                <TopStripChip label="off" onClick={onDisconnect} accent="#88a8b8" title="Disconnect wallet" />
              </TopStripGroup>
            )}
          </TopStrip>

          <div style={{
            position: "fixed", right: 12, top: attachedMenuTop + 8, zIndex: 20, width: showHelp ? 500 : 392,
            fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', Menlo, monospace",
            fontSize: 12, color: "#8a9bb0",
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            {bridgePanelVisible && panelBridge && (activeDesktopPanel === "bridge-overview" || activeDesktopPanel === "bridge-info") && (
              <BridgeInfoCard
                activeMode={activeDesktopPanel}
                overviewPhase={bridgeOverviewPhase}
                overviewVisible={bridgeOverviewVisible}
                overviewFadeMs={OVERVIEW_FADE_MS}
                panelSwapMs={PANEL_SWAP_MS}
                panelEase={PANEL_EASE}
                panelAnimationState={bridgePanelAnimationState}
                bridge={panelBridge}
              />
            )}

            {(activeDesktopPanel === "overview" || activeDesktopPanel === "info") && (
              <SystemInfoCard
                activeMode={activeDesktopPanel}
                overviewPhase={overviewPhase}
                overviewVisible={overviewVisible}
                overviewFadeMs={OVERVIEW_FADE_MS}
                panelSwapMs={PANEL_SWAP_MS}
                panelEase={PANEL_EASE}
                panelAnimationState={panelAnimationState}
                system={panelSystem}
                blockInfo={blockInfo}
              />
            )}

            {showNamesList && (
              <DirectoryPanel
                solarData={activeData}
                selectedAddress={selectedAddress}
                onSelect={onDirectorySelect}
                attached
              />
            )}
            {showHelp && <HelpPanel />}
          </div>
        </>
      ))}

      {/* ── Top-left stats overlay ── */}
      {!photoMode && isMobile && !hasDetachedFocus && (
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
          <div style={{ color: displaySystem?.accent ?? "#6a9aaa", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 2 }}>
            {isMobile
              ? `${displaySystem?.navLabel ?? "system"}\u03b1`
              : displaySystem?.eyebrow}
          </div>
          {(isMobile ? displaySystem?.summaryRows.slice(0, 2) : displaySystem?.summaryRows)?.map((row) => (
            <div key={row.label}>
              <span style={{ color: "#6a8090" }}>{isMobile ? `${row.label.slice(0, 1)} ` : `${row.label.padEnd(8, " ")}`}</span>
              <span style={{ color: row.accent ?? "#8ab0c0" }}>{row.value}</span>
            </div>
          ))}
          {!isMobile && displaySystem?.updatedAt ? (
            <div style={{ marginTop: 4, fontSize: 9, color: "#5a7a8a" }}>
              updated {new Date(displaySystem.updatedAt).toLocaleTimeString()}
            </div>
          ) : null}
          {!isMobile && blockInfo && displaySystem?.id !== "gubi-pool" && (
            <div style={{ marginTop: 2, fontSize: 9, color: "#4a6e7e", letterSpacing: "0.08em" }}>
              <span style={{ color: "#3a5a6a" }}>blk </span>
              <span style={{ color: "#5a9aaa" }}>{blockInfo.blockNumber.toLocaleString()}</span>
            </div>
          )}
          {!isMobile && (
            <div style={{ marginTop: 3, fontSize: 9, color: "#4a6575", lineHeight: 1.4 }}>
              {displaySystem?.descriptionLines.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

