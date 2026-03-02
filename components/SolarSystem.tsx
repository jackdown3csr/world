"use client";

import React, { useMemo, useRef, useCallback, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

import { useWallets } from "@/hooks/useWallets";
import { useWalletConnection } from "@/hooks/useWalletConnection";
import { buildSolarSystem } from "@/lib/layout";
import { formatBalance } from "@/lib/formatBalance";

import Sun from "./Sun";
import PlanetWallet from "./PlanetWallet";
import OrbitRing from "./OrbitRing";
import AsteroidBelt from "./AsteroidBelt";
import GalaxyBackground from "./GalaxyBackground";
import CameraController from "./CameraController";
import SplashScreen from "./SplashScreen";
import HudToolbar from "./HudToolbar";
import WalletPanel from "./WalletPanel";
import DirectoryPanel from "./DirectoryPanel";
import HelpPanel from "./HelpPanel";

/**
 * Top-level 3D scene: a solar system where each wallet is a celestial body.
 * Purely a composition layer — all logic lives in hooks and child components.
 */
export default function SolarSystem() {
  /* ── Data ── */
  const { wallets, loading, refetch } = useWallets();
  const solarData = useMemo(() => buildSolarSystem(wallets), [wallets]);

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
      totalLocked: formatBalance(lk.toString(), "GNET locked"),
    };
  }, [wallets]);

  /* ── Selection state ── */
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [selectionVersion, setSelectionVersion] = useState(0);

  const selectBody = useCallback((addr: string) => {
    setSelectedAddress(addr);
    setSelectionVersion((v) => v + 1);
  }, []);

  /* ── Wallet connection ── */
  const wc = useWalletConnection(wallets, refetch, selectBody);

  /* ── UI toggles ── */
  const [showAllNames, setShowAllNames] = useState(false);
  const [showRenamedOnly, setShowRenamedOnly] = useState(false);
  const [showNamesList, setShowNamesList] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showOrbits, setShowOrbits] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1700);
  const [resetRequested, setResetRequested] = useState(false);

  /* ── Camera ── */
  const controlsRef = useRef<OrbitControlsImpl>(null);

  /* ── Directory item handler ── */
  const handleDirectorySelect = useCallback(
    (address: string, customName?: string) => {
      selectBody(address);
      wc.setNameInput(customName || "");
      setShowNamesList(false);
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
        gl={{ antialias: true, alpha: false }}
      >
        <ambientLight intensity={0.06} />
        <GalaxyBackground />
        <Sun totalVotingPower={showAllNames ? totalVotingPower : undefined} totalLocked={showAllNames ? totalLocked : undefined} />

        {solarData.planets.map((p) => (
          <React.Fragment key={p.wallet.address}>
            {/* Skip orbit ring for Saturn — wallet ring is its visual identity */}
            {showOrbits && p.ringWallets.length === 0 && (
              <OrbitRing radius={p.orbitRadius} tilt={p.tilt} />
            )}
            <PlanetWallet
              data={p}
              selected={
                selectedAddress?.toLowerCase() ===
                p.wallet.address.toLowerCase()
              }
              onSelect={() => handleSceneSelect(p.wallet.address)}
              onDeselect={() => setSelectedAddress(null)}
              selectedAddress={selectedAddress}
              onSelectAddress={handleSceneSelect}
              showLabel={showAllNames}
              showMoonLabels={showAllNames}
              showRingLabels={showAllNames}
              showRenamedOnly={showRenamedOnly}
            />
          </React.Fragment>
        ))}

        <AsteroidBelt
          asteroids={solarData.asteroids}
          beltInnerRadius={solarData.beltInnerRadius}
          beltOuterRadius={solarData.beltOuterRadius}
          selectedAddress={selectedAddress}
          onSelectAddress={handleSceneSelect}
          onDeselect={() => setSelectedAddress(null)}
          showAllNames={showAllNames}
          showRenamedOnly={showRenamedOnly}
          showOrbits={showOrbits}
        />

        <OrbitControls
          ref={controlsRef}
          enablePan={false}
          minDistance={8}
          maxDistance={1805}
          enableDamping
          dampingFactor={0.05}
        />

        <CameraController
          selectedAddress={selectedAddress}
          selectionVersion={selectionVersion}
          controlsRef={controlsRef}
          onZoomChange={setZoomLevel}
          resetRequested={resetRequested}
          onResetDone={() => setResetRequested(false)}
        />
      </Canvas>

      {/* ── HUD overlay ── */}
      <div
        style={{
          position: "fixed",
          right: 16,
          top: 16,
          zIndex: 20,
          width: 280,
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
          onReset={() => {
            setResetRequested(true);
            setSelectedAddress(null);
          }}
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

      {/* Branding + debug */}
      <div
        style={{
          position: "fixed",
          left: 16,
          bottom: 16,
          zIndex: 20,
          fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
        }}
      >
        <div
          style={{
            color: "#1a2a38",
            fontSize: 10,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
          }}
        >
          vescrow system alpha
        </div>
      </div>
    </>
  );
}
