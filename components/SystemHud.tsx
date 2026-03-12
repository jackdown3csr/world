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
import type { SystemMovementSummary } from "@/lib/rankSnapshot";
import type { BridgeSceneObject } from "@/lib/bridges";
import type { TransitBeaconSceneObject } from "@/lib/transitBeacon";
import { usePanelSwap } from "@/hooks/usePanelSwap";
import HudToolbar, { HudBtn } from "./HudToolbar";
import WalletPanel from "./WalletPanel";
import BugReportPanel from "./BugReportPanel";
import DirectoryPanel from "./DirectoryPanel";
import HelpPanel from "./HelpPanel";
import TrafficPanel, { type TrafficPanelItem } from "./TrafficPanel";
import BridgeInfoCard from "./systemHud/BridgeInfoCard";
import TransitBeaconInfoCard from "./systemHud/TransitBeaconInfoCard";
import SystemInfoCard from "./systemHud/SystemInfoCard";
import PhotoObjectPicker from "./systemHud/PhotoObjectPicker";
import { TopStrip, TopStripChip, TopStripDivider, TopStripGroup } from "./TopStrip";
import FloatingTooltip from "./FloatingTooltip";
import type { WalletConnectionState, WalletConnectionActions } from "@/hooks/useWalletConnection";
import type { PhotoTargetSection } from "@/lib/photoTargets";
import { getShortcutByKey, photoModeShortcuts, toolbarShortcuts } from "@/lib/shortcuts";

type PhotoOverlayMode = "clean" | "grid";

function ShutterButton({ onClick, shortcut, saved, mobile }: {
  onClick: () => void; shortcut: string; saved: boolean; mobile?: boolean;
}) {
  const [hovered, setHovered] = React.useState(false);
  const ref = React.useRef<HTMLButtonElement>(null);
  if (mobile) {
    return (
      <button
        ref={ref}
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)",
          zIndex: 35, width: 64, height: 64, borderRadius: "50%",
          border: saved ? "3px solid rgba(123,247,255,0.7)" : "3px solid rgba(255,255,255,0.25)",
          background: saved ? "rgba(4,28,36,0.9)" : "rgba(255,255,255,0.10)",
          backdropFilter: "blur(6px)",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          padding: 0, transition: "all 0.18s",
        }}
      >
        <div style={{
          width: 38, height: 38, borderRadius: "50%",
          border: "2px solid rgba(255,255,255,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{ width: 22, height: 22, borderRadius: "50%", background: saved ? "rgba(123,247,255,0.9)" : "rgba(255,255,255,0.75)" }} />
        </div>
      </button>
    );
  }
  return (
    <>
      <button
        ref={ref}
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: "fixed",
          bottom: 22,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 35,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 12px",
          borderRadius: 4,
          border: saved ? "1px solid rgba(123,247,255,0.45)" : hovered ? "1px solid rgba(122,228,242,0.3)" : "1px solid rgba(255,255,255,0.12)",
          background: saved ? "rgba(4,22,30,0.92)" : hovered ? "rgba(8,20,32,0.92)" : "rgba(4,10,18,0.82)",
          boxShadow: saved ? "0 0 12px rgba(123,247,255,0.12)" : "0 8px 24px rgba(0,0,0,0.32)",
          backdropFilter: "blur(10px)",
          cursor: "pointer",
          fontFamily: "'JetBrains Mono','SF Mono',monospace",
          transition: "all 0.18s ease",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: saved ? "#7bf7ff" : "rgba(255,255,255,0.5)" }}>
          {saved ? "saved" : "capture"}
        </span>
        {!saved && (
          <span style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            padding: "2px 7px", borderRadius: 3,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.04)",
            color: "#c9fbff", fontSize: 9, letterSpacing: "0.12em",
            textTransform: "uppercase", fontWeight: 700,
          }}>
            {shortcut}
          </span>
        )}
      </button>
      {hovered && !saved && (
        <FloatingTooltip anchorRef={ref} open={hovered} text={`Capture screenshot`} placement="top" />
      )}
    </>
  );
}

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
  flyPickerOpen: boolean;
  photoFocusMode: "focused" | "detached";
  photoTargetLabel: string | null;
  flyTargetLabel: string | null;
  flyAutopilotActive: boolean;
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
  showTraffic: boolean;
  trafficPanelOpen: boolean;
  rxLed: boolean;
  ecoLed: boolean;
  trafficItems: TrafficPanelItem[];
  flyModeEnabled: boolean;
  showFlightHud: boolean;
  sceneReady: boolean;
  layoutMode: LayoutMode;
  vestingLayoutMode: VestingLayoutMode;
  systems: SceneSystemDefinition[];
  activeSystemId: SceneSystemId;
  selectedBridge?: BridgeSceneObject | null;
  selectedTransitBeacon?: TransitBeaconSceneObject | null;
  selectedAddress: string | null;
  selectedSystemId?: SceneSystemId | null;
  camDebug: CamDebug | null;
  blockInfo: BlockInfo | null;
  wc: WalletConnectionState & WalletConnectionActions;
  onCapturePhoto: () => void;
  onExitPhotoMode: () => void;
  onPhotoTargetSelect: (address: string) => void;
  onPhotoDetach: () => void;
  onPhotoRefocus: () => void;
  onTogglePhotoPicker: () => void;
  onToggleFlyPicker: () => void;
  onSetPhotoSimulationMode: (mode: "frozen" | "live") => void;
  onSetPhotoFov: (fov: number) => void;
  onTogglePhotoHud: () => void;
  onToggleLabels: () => void;
  onToggleRenamed: () => void;
  onToggleDirectory: () => void;
  onToggleHelp: () => void;
  onToggleOrbits: () => void;
  onToggleTraffic: () => void;
  onToggleTrafficPanel: () => void;
  onTrafficReplay: (eventId: string) => void;
  onToggleFlightHud: () => void;
  onReset: () => void;
  onToggleFlyMode: () => void;
  onPhotoMode: () => void;
  onFlyTargetSelect: (address: string) => void;
  onFlyToTarget: () => void;
  onToggleLayout: () => void;
  onToggleGnet: () => void;
  onToggleVestingClaimed: () => void;
  onJumpToStar: (starKey: string) => void;
  onDirectorySelect: (address: string, customName?: string, systemId?: SceneSystemId) => void;
  onDisconnect: () => void;
  onFocusMyInstance?: (systemId: SceneSystemId) => void;
  rankMovement?: Map<SceneSystemId, SystemMovementSummary>;
}

export default function SystemHud({
  isMobile,
  photoMode,
  photoHudVisible,
  photoPickerOpen,
  flyPickerOpen,
  photoFocusMode,
  photoTargetLabel,
  flyTargetLabel,
  flyAutopilotActive,
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
  showTraffic,
  trafficPanelOpen,
  rxLed,
  ecoLed,
  trafficItems,
  flyModeEnabled,
  showFlightHud,
  sceneReady,
  layoutMode,
  vestingLayoutMode,
  systems,
  activeSystemId,
  selectedBridge,
  selectedTransitBeacon,
  selectedAddress,
  selectedSystemId,
  camDebug,
  blockInfo,
  wc,
  onCapturePhoto,
  onExitPhotoMode,
  onPhotoTargetSelect,
  onPhotoDetach,
  onPhotoRefocus,
  onTogglePhotoPicker,
  onToggleFlyPicker,
  onSetPhotoSimulationMode,
  onSetPhotoFov,
  onTogglePhotoHud,
  onToggleLabels,
  onToggleRenamed,
  onToggleDirectory,
  onToggleHelp,
  onToggleOrbits,
  onToggleTraffic,
  onToggleTrafficPanel,
  onTrafficReplay,
  onToggleFlightHud,
  onReset,
  onToggleFlyMode,
  onPhotoMode,
  onFlyTargetSelect,
  onFlyToTarget,
  onToggleLayout,
  onToggleGnet,
  onToggleVestingClaimed,
  onJumpToStar,
  onDirectorySelect,
  onDisconnect,
  onFocusMyInstance,
  rankMovement,
}: SystemHudProps) {
  const PANEL_SWAP_MS = 320;
  const OVERVIEW_FADE_MS = 760;
  const PANEL_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
  const attachedMenuTop = 33;
  const contextSystem = systems.find((system) => system.id === activeSystemId) ?? systems[0];
  const [photoOverlayMode, setPhotoOverlayMode] = React.useState<PhotoOverlayMode>("clean");
  const [photoKeyHints, setPhotoKeyHints] = React.useState(false);
  const [showSceneInfo, setShowSceneInfo] = React.useState(false);
  const [showBugReport, setShowBugReport] = React.useState(false);
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
  const [transitBeaconOverviewVisible, setTransitBeaconOverviewVisible] = React.useState(false);
  const [transitBeaconOverviewMounted, setTransitBeaconOverviewMounted] = React.useState(false);
  const [transitBeaconOverviewPhase, setTransitBeaconOverviewPhase] = React.useState<"hidden" | "entering" | "visible" | "leaving">("hidden");
  const transitBeaconOverviewDismissedForRef = React.useRef<string | null>(null);
  const lastTransitBeaconOverviewTargetRef = React.useRef<string | null>(null);
  const transitBeaconOverviewHideTimerRef = React.useRef<number | null>(null);
  const transitBeaconOverviewUnmountTimerRef = React.useRef<number | null>(null);
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
  const myInstances = React.useMemo(() => {
    if (!wc.connectedAddress) return [];
    const addr = wc.connectedAddress.toLowerCase();
    return systems.filter((system) =>
      system.entries.some((entry) => entry.address.toLowerCase() === addr)
    );
  }, [wc.connectedAddress, systems]);
  const selectedSystemStarId = selectedAddress?.startsWith("__star_") ? selectedAddress : null;
  const selectedSystem = React.useMemo(() => {
    if (!selectedAddress) return null;

    // When the system origin is known, prefer it to avoid cross-system collisions.
    if (selectedSystemId) {
      return systems.find((s) => s.id === selectedSystemId) ?? null;
    }

    const lowered = selectedAddress.toLowerCase();
    return systems.find((system) => (
      system.starId === selectedAddress
      || system.entries.some((entry) => entry.address.toLowerCase() === lowered)
    )) ?? null;
  }, [selectedAddress, selectedSystemId, systems]);
  const hasDetachedFocus = Boolean(selectedAddress) && !selectedSystem;
  const displaySystem = hasDetachedFocus ? contextSystem : (selectedSystem ?? contextSystem);
  const activeData = displaySystem?.data ?? {
    planets: [],
    asteroids: [],
    beltInnerRadius: 0,
    beltOuterRadius: 0,
  };
  const toolbarActiveSystemId = hasDetachedFocus ? null : displaySystem?.id ?? null;
  const handleDirectoryItemSelect = React.useCallback(
    (address: string, customName?: string) => onDirectorySelect(address, customName, displaySystem?.id),
    [displaySystem?.id, onDirectorySelect],
  );
  const isDirectoryDisabled = (toolbarActiveSystemId ?? activeSystemId) === "staking-remnant";
  const photoFovPresets = [35, 55, 70];
  const overviewTargetId = hasDetachedFocus ? null : (displaySystem?.id ?? activeSystemId);
  const selectedBridgeId = selectedBridge?.id ?? null;
  const selectedTransitBeaconId = selectedTransitBeacon?.id ?? null;
  const bridgePanelVisible = Boolean(selectedBridge) && !isMobile;
  const transitBeaconPanelVisible = Boolean(selectedTransitBeacon) && !isMobile;
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
        : selectedTransitBeacon
          ? showSceneInfo
            ? "transit-beacon-info"
            : transitBeaconOverviewMounted
              ? "transit-beacon-overview"
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
    || activeDesktopPanel === "bridge-info"
    || activeDesktopPanel === "transit-beacon-overview"
    || activeDesktopPanel === "transit-beacon-info";
  const infoChipActive = showSceneInfo
    || (activeDesktopPanel === "overview" && overviewVisible)
    || (activeDesktopPanel === "bridge-overview" && bridgeOverviewVisible)
    || (activeDesktopPanel === "transit-beacon-overview" && transitBeaconOverviewVisible);
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
  const { displayItem: panelTransitBeacon, animationState: transitBeaconPanelAnimationState } = usePanelSwap({
    item: selectedTransitBeacon ?? null,
    itemKey: selectedTransitBeaconId,
    enabled: !isMobile && (activeDesktopPanel === "transit-beacon-overview" || activeDesktopPanel === "transit-beacon-info"),
    durationMs: PANEL_SWAP_MS,
  });

  const handlePhotoPickerToggle = React.useCallback(() => {
    if (showBugReport) setShowBugReport(false);
    onTogglePhotoPicker();
  }, [onTogglePhotoPicker, showBugReport]);

  const handleFlyPickerToggle = React.useCallback(() => {
    if (showBugReport) setShowBugReport(false);
    onToggleFlyPicker();
  }, [onToggleFlyPicker, showBugReport]);

  const handleBugToggle = React.useCallback(() => {
    if (!showBugReport) {
      if (showSceneInfo) setShowSceneInfo(false);
      if (showNamesList) onToggleDirectory();
      if (showHelp) onToggleHelp();
      if (photoMode && photoPickerOpen) onTogglePhotoPicker();
      if (flyModeEnabled && flyPickerOpen) onToggleFlyPicker();
    }
    setShowBugReport((value) => !value);
  }, [flyModeEnabled, flyPickerOpen, onToggleDirectory, onToggleFlyPicker, onToggleHelp, onTogglePhotoPicker, photoMode, photoPickerOpen, showBugReport, showHelp, showNamesList, showSceneInfo]);

  React.useEffect(() => {
    if (photoMode) setPhotoKeyHints(true);
  }, [photoMode]);

  React.useEffect(() => {
    if (!photoMode) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.repeat) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;

      if (e.key === "?") {
        e.preventDefault();
        setPhotoKeyHints((v) => !v);
        return;
      }

      if (e.key.toLowerCase() === "h") {
        e.preventDefault();
        onTogglePhotoHud();
        return;
      }

      if (e.key.toLowerCase() === "p") {
        e.preventDefault();
        onExitPhotoMode();
        return;
      }

      if (e.key.toLowerCase() === "m") {
        e.preventDefault();
        onSetPhotoSimulationMode(photoSimulationMode === "live" ? "frozen" : "live");
        return;
      }

      if (e.key.toLowerCase() === "g") {
        e.preventDefault();
        setPhotoOverlayMode((mode) => mode === "clean" ? "grid" : "clean");
        return;
      }

      if (e.key.toLowerCase() === "t") {
        e.preventDefault();
        handlePhotoPickerToggle();
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

      // + / = → zoom in (lower FOV), - → zoom out (higher FOV)
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        onSetPhotoFov(Math.max(10, photoFov - 2));
        return;
      }
      if (e.key === "-") {
        e.preventDefault();
        onSetPhotoFov(Math.min(90, photoFov + 2));
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    onCapturePhoto,
    handlePhotoPickerToggle,
    onExitPhotoMode,
    onPhotoDetach,
    onPhotoRefocus,
    onSetPhotoFov,
    onSetPhotoSimulationMode,
    onTogglePhotoHud,
    photoFov,
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
    transitBeaconOverviewDismissedForRef.current = null;
  }, [selectedTransitBeaconId]);

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

  React.useEffect(() => {
    if (transitBeaconOverviewHideTimerRef.current !== null) {
      window.clearTimeout(transitBeaconOverviewHideTimerRef.current);
      transitBeaconOverviewHideTimerRef.current = null;
    }
    if (transitBeaconOverviewUnmountTimerRef.current !== null) {
      window.clearTimeout(transitBeaconOverviewUnmountTimerRef.current);
      transitBeaconOverviewUnmountTimerRef.current = null;
    }

    if (isMobile || !selectedTransitBeacon || showHelp || showNamesList || showSceneInfo
        || transitBeaconOverviewDismissedForRef.current === selectedTransitBeaconId) {
      lastTransitBeaconOverviewTargetRef.current = selectedTransitBeaconId;
      setTransitBeaconOverviewVisible(false);
      setTransitBeaconOverviewMounted(false);
      setTransitBeaconOverviewPhase("hidden");
      return;
    }

    const isRetargetingTransitBeaconOverview = Boolean(
      selectedTransitBeaconId
      && transitBeaconOverviewMounted
      && transitBeaconOverviewVisible
      && lastTransitBeaconOverviewTargetRef.current
      && lastTransitBeaconOverviewTargetRef.current !== selectedTransitBeaconId,
    );
    lastTransitBeaconOverviewTargetRef.current = selectedTransitBeaconId;

    setTransitBeaconOverviewMounted(true);
    let rafId: number | null = null;
    if (isRetargetingTransitBeaconOverview) {
      setTransitBeaconOverviewPhase("visible");
      setTransitBeaconOverviewVisible(true);
    } else {
      rafId = window.requestAnimationFrame(() => {
        setTransitBeaconOverviewPhase("entering");
        setTransitBeaconOverviewVisible(true);
      });
    }

    const settleVisibleTimer = window.setTimeout(() => {
      setTransitBeaconOverviewPhase("visible");
    }, isRetargetingTransitBeaconOverview ? 0 : OVERVIEW_FADE_MS);

    transitBeaconOverviewHideTimerRef.current = window.setTimeout(() => {
      setTransitBeaconOverviewPhase("leaving");
      setTransitBeaconOverviewVisible(false);
      transitBeaconOverviewHideTimerRef.current = null;
    }, 8000);

    transitBeaconOverviewUnmountTimerRef.current = window.setTimeout(() => {
      setTransitBeaconOverviewMounted(false);
      setTransitBeaconOverviewPhase("hidden");
      transitBeaconOverviewUnmountTimerRef.current = null;
    }, 8000 + OVERVIEW_FADE_MS);

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      window.clearTimeout(settleVisibleTimer);
      if (transitBeaconOverviewHideTimerRef.current !== null) {
        window.clearTimeout(transitBeaconOverviewHideTimerRef.current);
        transitBeaconOverviewHideTimerRef.current = null;
      }
      if (transitBeaconOverviewUnmountTimerRef.current !== null) {
        window.clearTimeout(transitBeaconOverviewUnmountTimerRef.current);
        transitBeaconOverviewUnmountTimerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTransitBeaconId, isMobile, showHelp, showNamesList, showSceneInfo]);

  const handleInfoToggle = React.useCallback(() => {
    if (infoChipActive) {
      // Mark current targets as dismissed so auto-overview won't reopen them.
      overviewDismissedForRef.current = overviewTargetId;
      bridgeOverviewDismissedForRef.current = selectedBridgeId;
      transitBeaconOverviewDismissedForRef.current = selectedTransitBeaconId;

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

      if (transitBeaconOverviewHideTimerRef.current !== null) {
        window.clearTimeout(transitBeaconOverviewHideTimerRef.current);
        transitBeaconOverviewHideTimerRef.current = null;
      }
      if (transitBeaconOverviewUnmountTimerRef.current !== null) {
        window.clearTimeout(transitBeaconOverviewUnmountTimerRef.current);
        transitBeaconOverviewUnmountTimerRef.current = null;
      }
      setTransitBeaconOverviewVisible(false);
      setTransitBeaconOverviewMounted(false);
      setTransitBeaconOverviewPhase("hidden");
      return;
    }

    setShowSceneInfo(true);
    if (showNamesList) onToggleDirectory();
    if (showHelp) onToggleHelp();
    if (showBugReport) setShowBugReport(false);
  }, [infoChipActive, onToggleDirectory, onToggleHelp, overviewTargetId, selectedBridgeId, selectedTransitBeaconId, showBugReport, showHelp, showNamesList]);

  const handleListToggle = React.useCallback(() => {
    if (isDirectoryDisabled) return;
    if (!showNamesList) {
      if (showSceneInfo) setShowSceneInfo(false);
      if (showHelp) onToggleHelp();
      if (showBugReport) setShowBugReport(false);
    }
    onToggleDirectory();
  }, [isDirectoryDisabled, onToggleDirectory, onToggleHelp, showBugReport, showHelp, showNamesList, showSceneInfo]);

  React.useEffect(() => {
    if (isDirectoryDisabled && showNamesList) onToggleDirectory();
  }, [isDirectoryDisabled, onToggleDirectory, showNamesList]);

  const handleHelpToggle = React.useCallback(() => {
    if (!showHelp) {
      if (showSceneInfo) setShowSceneInfo(false);
      if (showNamesList) onToggleDirectory();
      if (showBugReport) setShowBugReport(false);
    }
    onToggleHelp();
  }, [onToggleDirectory, onToggleHelp, showBugReport, showHelp, showNamesList, showSceneInfo]);

  React.useEffect(() => {
    if (!flyModeEnabled) return;

    if (showSceneInfo) setShowSceneInfo(false);
    if (showNamesList) onToggleDirectory();
    if (showHelp) onToggleHelp();
    if (showBugReport) setShowBugReport(false);
  }, [flyModeEnabled, onToggleDirectory, onToggleHelp, showBugReport, showHelp, showNamesList, showSceneInfo]);

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
      if (key === toolbarShortcuts.traffic.toLowerCase()) {
        e.preventDefault();
        onToggleTraffic();
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
    onToggleTraffic,
    onToggleRenamed,
    onToggleVestingClaimed,
    photoMode,
  ]);

  const toolbarProps = {
    showAllNames,
    onToggleLabels,
    showRenamedOnly,
    onToggleRenamed,
    showBugReport,
    onToggleBugReport: handleBugToggle,
    showHelp,
    onToggleHelp: handleHelpToggle,
    showOrbits,
    onToggleOrbits,
    showTraffic,
    onToggleTraffic,
    rxLed,
    ecoLed,
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
    showHelpButton: true,
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

              </div>
              <TopStrip left={0} right={0} top={0} zIndex={35} nowrap>
                <TopStripGroup padding="0 2px 0 0">
                  <TopStripChip label={photoTargetLabel ?? "no target"} active={Boolean(photoTargetLabel)} accent="#9cc9d8" />
                  <TopStripChip label="targets" active={photoPickerOpen} onClick={handlePhotoPickerToggle} />
                  <TopStripChip
                    label={photoFocusMode === "detached" ? "free cam" : "locked"}
                    active={photoFocusMode === "detached"}
                    onClick={photoFocusMode === "detached" ? onPhotoRefocus : onPhotoDetach}
                  />
                </TopStripGroup>
                <TopStripDivider />
                <TopStripGroup>
                  <TopStripChip label="clean" active={photoOverlayMode === "clean"} onClick={() => setPhotoOverlayMode("clean")} />
                  <TopStripChip label="grid" active={photoOverlayMode === "grid"} onClick={() => setPhotoOverlayMode("grid")} />
                </TopStripGroup>
                <TopStripDivider />
                <TopStripGroup padding="0 2px">
                  {photoFovPresets.map((preset) => (
                    <TopStripChip
                      key={preset}
                      label={`${preset}°`}
                      active={photoFov === preset}
                      onClick={() => onSetPhotoFov(preset)}
                    />
                  ))}
                </TopStripGroup>
                <TopStripDivider />
                <TopStripGroup padding="0 2px">
                  <TopStripChip
                    label={photoSimulationMode === "frozen" ? "frozen" : "freeze"}
                    active={photoSimulationMode === "frozen"}
                    onClick={() => onSetPhotoSimulationMode(photoSimulationMode === "live" ? "frozen" : "live")}
                  />
                </TopStripGroup>
                <TopStripDivider />
                <TopStripGroup>
                  <TopStripChip label="labels" active={showAllNames} onClick={onToggleLabels} />
                  <TopStripChip label="named" active={showRenamedOnly} onClick={onToggleRenamed} />
                </TopStripGroup>
                <TopStripDivider />
                <TopStripGroup padding="0 0 0 2px">
                  <TopStripChip label="bug" active={showBugReport} onClick={handleBugToggle} accent="#ffbf8f" />
                </TopStripGroup>
                <TopStripDivider />
                <TopStripGroup padding="0 0 0 2px">
                  <TopStripChip label="exit" onClick={onExitPhotoMode} accent="#7ae4f2" />
                </TopStripGroup>
              </TopStrip>
              {isMobile ? (
                <ShutterButton onClick={onCapturePhoto} shortcut={photoShortcutMap.capture} saved={photoSavedToast} mobile />
              ) : (
                <ShutterButton onClick={onCapturePhoto} shortcut={photoShortcutMap.capture} saved={photoSavedToast} />
              )}

              {/* Photo key hints (same pattern as FlyHud key hints) */}
              {photoKeyHints && !isMobile && (
                <div style={{
                  position: "fixed",
                  left: 24,
                  bottom: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                  padding: "9px 11px",
                  width: 182,
                  background: "linear-gradient(180deg, rgba(5,17,24,0.38), rgba(4,12,18,0.16))",
                  border: "1px solid rgba(123,247,255,0.08)",
                  clipPath: "polygon(0 0, 100% 0, calc(100% - 12px) 100%, 0 100%)",
                  zIndex: 35,
                  fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
                  letterSpacing: "0.08em",
                  pointerEvents: "auto",
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ fontSize: 8, fontWeight: 700, color: "rgba(217,251,255,0.72)", letterSpacing: "0.08em" }}>PHOTO</div>
                    <button type="button" onClick={() => setPhotoKeyHints(false)} style={{ border: "none", background: "transparent", color: "rgba(123,247,255,0.47)", fontFamily: "inherit", fontSize: 11, lineHeight: 1, cursor: "pointer", padding: "1px 0 0" }} aria-label="Hide key hints">
                      {"\u00d7"}
                    </button>
                  </div>
                  {([
                    ["SPACE", "Capture"],
                    ["T", "Targets picker"],
                    ["V", "Free cam"],
                    ["F", "Refocus"],
                    ["G", "Clean / grid"],
                    ["H", "Hide HUD"],
                    ["M", "Freeze"],
                    ["ESC", "Exit"],
                  ] as const).map(([key, action]) => (
                    <div key={key} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ fontSize: 8, fontWeight: 700, color: "#d9fbff", minWidth: 48, textAlign: "right", letterSpacing: "0.04em" }}>{key}</span>
                      <span style={{ fontSize: 8, color: "rgba(123,247,255,0.4)", fontWeight: 500 }}>{action}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {!photoHudVisible && (
            <button
              onClick={onTogglePhotoHud}
              style={{
                position: "fixed",
                top: 8,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 35,
                background: "rgba(20,28,36,0.55)",
                border: "1px solid rgba(120,160,190,0.25)",
                borderRadius: 4,
                color: "rgba(140,170,200,0.6)",
                fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', Menlo, monospace",
                fontSize: 10,
                padding: "3px 10px",
                cursor: "pointer",
                letterSpacing: "0.04em",
              }}
            >
              show HUD ({photoShortcutMap.hud})
            </button>
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

          {showBugReport && (
            <div style={{
              position: "fixed",
              left: isMobile ? 0 : undefined,
              right: isMobile ? 0 : 18,
              top: isMobile ? 34 : 42,
              bottom: isMobile ? 110 : undefined,
              width: isMobile ? undefined : 360,
              maxHeight: isMobile ? "calc(100vh - 144px)" : undefined,
              overflowY: isMobile ? "auto" : undefined,
              zIndex: 36,
              fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', Menlo, monospace",
              fontSize: 12,
              color: "#8a9bb0",
              boxShadow: isMobile ? undefined : "0 18px 42px rgba(0,0,0,0.28)",
            }}>
              <BugReportPanel
                mobile={isMobile}
                connectedAddress={wc.connectedAddress}
                reporterDefault={wc.myWallet?.customName ?? (wc.connectedAddress ? `${wc.connectedAddress.slice(0, 6)}...${wc.connectedAddress.slice(-4)}` : "")}
                selectedLabel={photoTargetLabel ?? selectedBridge?.label ?? selectedTransitBeacon?.label ?? displaySystem?.navLabel ?? null}
                onSubmitted={() => setShowBugReport(false)}
              />
            </div>
          )}



          {photoSavedToast && (
            <div style={{ display: "none" }} />
          )}
        </>
      )}

      {/* ── HUD overlay (hidden in photo mode) ── */}
      {!photoMode && (isMobile ? (
        /* ════ MOBILE ════ */
        <>
          {/* ── Top navigation bar (system chips) ── */}
          <div style={{
            position: "fixed", top: 0, left: 0, right: 0, zIndex: 21,
            background: "rgba(2,6,14,0.58)",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(10px)",
            padding: "3px 0",
            WebkitOverflowScrolling: "touch",
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "0 8px",
              overflowX: "auto",
              scrollbarWidth: "none",
              WebkitOverflowScrolling: "touch",
            }}>
              {systems.map((system) => (
                <TopStripChip
                  key={system.id}
                  label={system.navLabel}
                  active={system.id === toolbarActiveSystemId}
                  onClick={selectedSystemStarId === system.starId ? undefined : () => onJumpToStar(system.starId)}
                  accent={system.accent}
                  noTooltip
                />
              ))}
              <TopStripDivider />
              <TopStripChip label="info" active={showSceneInfo} onClick={handleInfoToggle} accent="#9cc9d8" noTooltip />
              <TopStripChip
                label="list"
                active={showNamesList}
                onClick={handleListToggle}
                disabled={isDirectoryDisabled}
                accent="#9cc9d8"
                noTooltip
              />
            </div>
          </div>

          {/* ── Bottom sheet ── */}
          <div style={{
            position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 20,
            fontFamily: "'JetBrains Mono','SF Mono','Fira Code',Menlo,monospace",
            fontSize: 12, color: "#8a9bb0",
            display: "flex", flexDirection: "column",
            maxHeight: "70vh",
          }}>
            {/* Expandable panels: traffic, help, directory */}
            {(showTraffic || showNamesList || showHelp || showSceneInfo || showBugReport) && (
              <div style={{
                maxHeight: "40vh", overflowY: "auto",
                background: "rgba(2,6,14,0.96)",
                borderTop: "1px solid rgba(0,229,255,0.15)",
              }}>
                {showBugReport && (
                  <BugReportPanel
                    mobile
                    connectedAddress={wc.connectedAddress}
                    reporterDefault={wc.myWallet?.customName ?? (wc.connectedAddress ? `${wc.connectedAddress.slice(0, 6)}...${wc.connectedAddress.slice(-4)}` : "")}
                    selectedLabel={selectedBridge?.label ?? selectedTransitBeacon?.label ?? displaySystem?.navLabel ?? null}
                    onSubmitted={() => setShowBugReport(false)}
                  />
                )}
                {showSceneInfo && selectedBridge && (
                  <div style={{
                    padding: "8px 10px",
                    borderBottom: "1px solid rgba(0,229,255,0.06)",
                  }}>
                    <div style={{ fontSize: 8, letterSpacing: "0.16em", textTransform: "uppercase", color: "#5a7a8a", marginBottom: 4 }}>galactica</div>
                    <div style={{ fontSize: 11, color: "#d0e8f2", fontWeight: 700, marginBottom: 6 }}>{selectedBridge.label}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", fontSize: 9 }}>
                      <div><span style={{ color: "#5a7a8a" }}>status </span><span style={{ color: selectedBridge.status === "active" ? "#00e5ff" : "#8a9bb0" }}>{selectedBridge.status}</span></div>
                      <div><span style={{ color: "#5a7a8a" }}>type </span><span style={{ color: "#8eb0c4" }}>{selectedBridge.kind}</span></div>
                    </div>
                  </div>
                )}
                {showSceneInfo && selectedTransitBeacon && !selectedBridge && (
                  <div style={{
                    padding: "8px 10px",
                    borderBottom: "1px solid rgba(0,229,255,0.06)",
                  }}>
                    <div style={{ fontSize: 8, letterSpacing: "0.16em", textTransform: "uppercase", color: "#5a7a8a", marginBottom: 4 }}>galactica</div>
                    <div style={{ fontSize: 11, color: "#d0e8f2", fontWeight: 700, marginBottom: 6 }}>{selectedTransitBeacon.label}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", fontSize: 9 }}>
                      <div><span style={{ color: "#5a7a8a" }}>state </span><span style={{ color: "#00e5ff" }}>active</span></div>
                      <div><span style={{ color: "#5a7a8a" }}>traffic </span><span style={{ color: "#8eb0c4" }}>{trafficItems.length}</span></div>
                    </div>
                  </div>
                )}
                {showSceneInfo && !selectedBridge && !selectedTransitBeacon && displaySystem && (
                  <div style={{
                    padding: "8px 10px",
                    borderBottom: "1px solid rgba(0,229,255,0.06)",
                  }}>
                    <div style={{ fontSize: 8, letterSpacing: "0.16em", textTransform: "uppercase", color: "#5a7a8a", marginBottom: 4 }}>galactica</div>
                    <div style={{ fontSize: 11, color: "#d0e8f2", fontWeight: 700, marginBottom: 6 }}>{displaySystem.navLabel}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 9 }}>
                      {displaySystem.summaryRows.map((row) => (
                        <div key={row.label}>
                          <span style={{ color: "#5a7a8a" }}>{row.label} </span>
                          <span style={{ color: row.accent ?? "#8ab0c0" }}>{row.value}</span>
                        </div>
                      ))}
                    </div>
                    {displaySystem.descriptionLines.length > 0 && (
                      <div style={{ marginTop: 6, fontSize: 9, color: "#4a6575", lineHeight: 1.4 }}>
                        {displaySystem.descriptionLines.map((line) => (
                          <div key={line}>{line}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {showTraffic && (
                  <TrafficPanel
                    items={trafficItems}
                    collapsed={!trafficPanelOpen}
                    rxLed={rxLed}
                    ecoLed={ecoLed}
                    onReplay={onTrafficReplay}
                    onToggleCollapsed={onToggleTrafficPanel}
                  />
                )}
                {showHelp      && <HelpPanel mobile />}
                {showNamesList && (
                  <DirectoryPanel
                    solarData={activeData}
                    selectedAddress={selectedAddress}
                    onSelect={handleDirectoryItemSelect}
                    movement={displaySystem ? rankMovement?.get(displaySystem.id) ?? null : null}
                  />
                )}
              </div>
            )}
            <div style={{ borderTop: "1px solid rgba(0,229,255,0.08)" }}>
              <WalletPanel {...walletPanelProps} />
            </div>
            <HudToolbar mobile {...toolbarProps} />
          </div>
        </>
      ) : (
        /* ════ DESKTOP: right-side column ════ */
        <>
          {flyModeEnabled ? (
            <TopStrip left={0} right={0} top={0} zIndex={21} nowrap>
              <TopStripGroup gap={4}>
                <HudBtn compact strip active={flyPickerOpen} onClick={handleFlyPickerToggle} label="list" />
              </TopStripGroup>

              <TopStripDivider />

              <TopStripGroup gap={4} padding="0 2px">
                <HudBtn compact strip active={Boolean(flyTargetLabel)} disabled={!flyTargetLabel} label={flyTargetLabel ?? "no target"} />
                <HudBtn compact strip active={Boolean(flyTargetLabel) || flyAutopilotActive} onClick={onFlyToTarget} disabled={!flyTargetLabel && !flyAutopilotActive} label={flyAutopilotActive ? "cancel" : "fly to"} />
                <HudBtn compact strip active={showFlightHud} onClick={onToggleFlightHud} label={showFlightHud ? "hide hud" : "show hud"} />
              </TopStripGroup>

              <TopStripDivider />

              <HudToolbar
                {...toolbarProps}
                compact
                embedded
                showReset={false}
                onReset={() => {}}
                onPhotoMode={undefined}
                onToggleFlyMode={undefined}
                onToggleLayout={undefined}
                onToggleGnet={undefined}
                onToggleVestingClaimed={undefined}
              />

              <TopStripDivider />

              <TopStripGroup padding="0 0 0 2px">
                <HudBtn compact strip active={false} onClick={onToggleFlyMode} label="exit flight" />
              </TopStripGroup>
            </TopStrip>
          ) : (
            <TopStrip left={0} right={0} top={0} zIndex={21} nowrap>
              <TopStripGroup gap={8}>
                {systems.map((system) => (
                  <TopStripChip
                    key={system.id}
                    label={system.navLabel}
                    active={system.id === toolbarActiveSystemId}
                    onClick={selectedSystemStarId === system.starId ? undefined : () => onJumpToStar(system.starId)}
                    accent={system.accent}
                    noTooltip
                  />
                ))}
                <TopStripDivider />
                <TopStripChip label="info" active={infoChipActive} onClick={handleInfoToggle} accent="#9cc9d8" />
                <TopStripChip
                  label="list"
                  active={showNamesList}
                  onClick={handleListToggle}
                  disabled={isDirectoryDisabled}
                  accent="#9cc9d8"
                />
              </TopStripGroup>

              <HudToolbar {...toolbarProps} compact embedded />

              <TopStripDivider />

              {!wc.connectedAddress ? (
                <TopStripGroup padding="0 0 0 2px">
                  <TopStripChip label="connect wallet" onClick={wc.connectWallet} accent="#00e5ff" />
                </TopStripGroup>
              ) : (
                <TopStripGroup padding="0 0 0 2px">
                  <TopStripChip label="wallet" active accent="#6ef7a7" />
                  {connectedLabel && <TopStripChip label={connectedLabel} active accent="#6ef7a7" />}
                  {myInstances.map((system) => (
                    <TopStripChip
                      key={system.id}
                      label={system.navLabel}
                      active={system.id === toolbarActiveSystemId}
                      onClick={() => onFocusMyInstance?.(system.id)}
                      accent={system.accent}
                    />
                  ))}
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
                  />
                )}
                <TopStripChip label="off" onClick={onDisconnect} accent="#88a8b8" />
              </TopStripGroup>
            )}
          </TopStrip>
          )}

          {flyModeEnabled && flyPickerOpen && !isMobile && (
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
                onSelect={(item) => onFlyTargetSelect(item.id)}
              />
            </div>
          )}

          {showTraffic && (
            <div style={{
              position: "fixed", left: 12, top: attachedMenuTop + 8, zIndex: 20, width: trafficPanelOpen ? 344 : 64,
              fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', Menlo, monospace",
              fontSize: 12, color: "#8a9bb0",
              transition: "width 0.2s ease",
            }}>
              <TrafficPanel
                items={trafficItems}
                attached
                collapsed={!trafficPanelOpen}
                rxLed={rxLed}
                ecoLed={ecoLed}
                onReplay={onTrafficReplay}
                onToggleCollapsed={onToggleTrafficPanel}
              />
            </div>
          )}

          <div style={{
            position: "fixed", right: 12, top: attachedMenuTop + 8, zIndex: 20, width: showHelp ? 500 : showBugReport ? 420 : 392,
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

            {transitBeaconPanelVisible && panelTransitBeacon && (activeDesktopPanel === "transit-beacon-overview" || activeDesktopPanel === "transit-beacon-info") && (
              <TransitBeaconInfoCard
                activeMode={activeDesktopPanel}
                overviewPhase={transitBeaconOverviewPhase}
                overviewVisible={transitBeaconOverviewVisible}
                overviewFadeMs={OVERVIEW_FADE_MS}
                panelSwapMs={PANEL_SWAP_MS}
                panelEase={PANEL_EASE}
                panelAnimationState={transitBeaconPanelAnimationState}
                beacon={panelTransitBeacon}
                trafficItems={trafficItems}
                rxLed={rxLed}
                ecoLed={ecoLed}
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
                movement={panelSystem ? rankMovement?.get(panelSystem.id) ?? null : null}
              />
            )}

            {showNamesList && (
              <DirectoryPanel
                solarData={activeData}
                selectedAddress={selectedAddress}
                onSelect={handleDirectoryItemSelect}
                attached
                movement={displaySystem ? rankMovement?.get(displaySystem.id) ?? null : null}
              />
            )}
            {showBugReport && (
              <BugReportPanel
                connectedAddress={wc.connectedAddress}
                reporterDefault={wc.myWallet?.customName ?? (wc.connectedAddress ? `${wc.connectedAddress.slice(0, 6)}...${wc.connectedAddress.slice(-4)}` : "")}
                selectedLabel={selectedBridge?.label ?? selectedTransitBeacon?.label ?? displaySystem?.navLabel ?? null}
                onSubmitted={() => setShowBugReport(false)}
              />
            )}
            {showHelp && <HelpPanel />}
          </div>
        </>
      ))}

      {/* ── Top-left stats overlay ── */}
      {!photoMode && isMobile && (
        <div style={{
          position: "fixed",
          left: 8,
          top: 34,
          zIndex: 20,
          fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
          fontSize: 10,
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
          padding: "5px 8px",
        }}>
          {selectedBridge ? (
            <>
              <div style={{ color: "#78eeff", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 2 }}>
                {selectedBridge.label}
              </div>
              <div>
                <span style={{ color: "#6a8090" }}>s </span>
                <span style={{ color: selectedBridge.status === "active" ? "#00e5ff" : "#8a9bb0" }}>{selectedBridge.status}</span>
              </div>
            </>
          ) : selectedTransitBeacon ? (
            <>
              <div style={{ color: "#ffd68f", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 2 }}>
                {selectedTransitBeacon.label}
              </div>
              <div>
                <span style={{ color: "#6a8090" }}>t </span>
                <span style={{ color: "#8ab0c0" }}>{trafficItems.length}</span>
              </div>
            </>
          ) : !hasDetachedFocus ? (
            <>
              <div style={{ color: displaySystem?.accent ?? "#6a9aaa", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 2 }}>
                {`${displaySystem?.navLabel ?? "system"}\u03b1`}
              </div>
              {displaySystem?.summaryRows.slice(0, 2).map((row) => (
                <div key={row.label}>
                  <span style={{ color: "#6a8090" }}>{`${row.label.slice(0, 1)} `}</span>
                  <span style={{ color: row.accent ?? "#8ab0c0" }}>{row.value}</span>
                </div>
              ))}
            </>
          ) : null}
        </div>
      )}
    </>
  );
}

