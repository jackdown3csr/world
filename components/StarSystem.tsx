"use client";

/**
 * StarSystem — a self-contained star + planets + belt group.
 *
 * Wraps the celestial bodies in a <group position={position}> so the entire
 * system can be placed anywhere in the scene. SunLensFlare and SolarWind are
 * rendered as siblings (outside the group) because they use world-space
 * position.copy() internally and must live at the scene root level.
 */

import React, { useState, useEffect } from "react";

import Sun from "./Sun";
import SolarWind from "./SolarWind";
import PlanetWallet from "./PlanetWallet";
import OrbitRing from "./OrbitRing";
import AsteroidBelt from "./AsteroidBelt";
import ProtoplanetaryDisk from "./ProtoplanetaryDisk";

/** Mount items in batches of `batchSize` per animation frame to avoid a first-frame stall. */
function useProgressiveMount(total: number, batchSize = 20): number {
  const [count, setCount] = useState(batchSize);
  useEffect(() => {
    if (count >= total) return;
    const id = requestAnimationFrame(() =>
      setCount((c) => Math.min(c + batchSize, total)),
    );
    return () => cancelAnimationFrame(id);
  }, [count, total, batchSize]);
  return Math.min(count, total);
}

import type { SolarSystemData } from "@/lib/layout/types";
import type { StarPalette } from "./Sun";
import type { WalletTooltipVariant } from "./WalletTooltip";

export interface StarSystemProps {
  /** Built layout data (from buildSolarSystem / buildVestingSystem) */
  solarData: SolarSystemData;
  /** World-space position of the star. Default [0,0,0]. */
  position?: [number, number, number];
  /** Colour palette: "warm" = orange/gold veGNET, "cool" = blue/cyan vesting */
  palette?: StarPalette;
  /** Star label text (e.g. "VESCROW" or "VESTING") */
  starLabel?: string;
  /** Aggregate stats to show under the star label */
  totalVotingPower?: string;
  totalLocked?: string;
  /** Increments each new block → triggers CME pulse */
  blockNumber?: number;
  /** Show orbit rings */
  showOrbits?: boolean;
  /** Show body name labels */
  showAllNames?: boolean;
  showSystemLabel?: boolean;
  showRenamedOnly?: boolean;
  photoMode?: boolean;
  paused?: boolean;
  /** Show SolarWind particle system around this star */
  showSolarWind?: boolean;
  /** Currently selected wallet address */
  selectedAddress?: string | null;
  panelOpen?: boolean;
  onSelect?: (address: string) => void;
  onDeselect?: () => void;
  onShiftSelect?: (address: string) => void;
  /** Called when user clicks the star itself */
  onStarSelect?: () => void;
  /** Replace the flat asteroid belt with the protoplanetary disk (vesting system) */
  diskMode?: boolean;
  starId?: string;
  starScale?: number;
  detailVariant?: WalletTooltipVariant;
  interactionEnabled?: boolean;
  interactiveBelt?: boolean;
  showBeltLabels?: boolean;
  beltTone?: "default" | "ash";
  /** System ID used to scope scene registry keys, e.g. "vescrow". */
  systemId?: string;
}

export default function StarSystem({
  solarData,
  position = [0, 0, 0],
  palette = "warm",
  starLabel,
  totalVotingPower,
  totalLocked,
  blockNumber,
  showOrbits = true,
  showAllNames = true,
  showSystemLabel = true,
  showRenamedOnly = false,
  photoMode = false,
  paused = false,
  showSolarWind = true,
  selectedAddress = null,
  panelOpen = false,
  onSelect,
  onDeselect,
  onShiftSelect,
  onStarSelect,
  diskMode = false,
  starId,
  starScale = 1,
  detailVariant = diskMode ? "vesting" : "wallet",
  interactionEnabled = true,
  interactiveBelt = true,
  showBeltLabels = true,
  beltTone = "default",
  systemId,
}: StarSystemProps) {
  const visibleCount = useProgressiveMount(solarData.planets.length);
  const overviewRadius = React.useMemo(() => {
    const farPlanetOrbit = solarData.planets.reduce(
      (maxOrbit, planet) => Math.max(maxOrbit, planet.orbitRadius + planet.radius * 3.2),
      0,
    );

    return Math.max(solarData.beltOuterRadius + 120, farPlanetOrbit + 140, 520);
  }, [solarData]);

  // Scope a wallet address into "systemId:0xaddr" format when systemId is set.
  const scopeAddr = React.useCallback(
    (addr: string) => systemId ? `${systemId}:${addr.toLowerCase()}` : addr,
    [systemId],
  );

  return (
    <>
      {/* SolarWind at scene root (not inside the offset group) */}
      {showSolarWind && (
        <SolarWind origin={position} color={palette === "cool" ? "cool" : "warm"} paused={paused} />
      )}

      {/* All 3D bodies in world-space offset group */}
      <group position={position}>
        <Sun
          showSystemLabel={showSystemLabel && !photoMode}
          totalVotingPower={showAllNames && !photoMode ? totalVotingPower : undefined}
          totalLocked={showAllNames && !photoMode ? totalLocked : undefined}
          blockNumber={blockNumber}
          palette={palette}
          label={starLabel}
          starId={starId ?? `__star_${palette}__`}
          scale={starScale}
          overviewRadius={overviewRadius}
          onSelect={interactionEnabled ? onStarSelect : undefined}
          paused={paused}
        />

        {solarData.planets.slice(0, visibleCount).map((p) => (
          <React.Fragment key={p.wallet.address}>
            {showOrbits && !photoMode && p.ringWallets.length === 0 && (
              <OrbitRing radius={p.orbitRadius} tilt={p.tilt} />
            )}
            <PlanetWallet
              data={p}
              starWorldPosition={position}
              selected={
                selectedAddress?.toLowerCase() === p.wallet.address.toLowerCase()
              }
              onSelect={() => onSelect?.(scopeAddr(p.wallet.address))}
              onDeselect={() => onDeselect?.()}
              panelOpen={panelOpen}
              selectedAddress={selectedAddress}
              onSelectAddress={(addr) => onSelect?.(scopeAddr(addr))}
              showLabel={showAllNames && !photoMode}
              showMoonLabels={showAllNames && !photoMode}
              showRingLabels={showAllNames && !photoMode}
              showRenamedOnly={showRenamedOnly}
              onShiftSelect={(addr) => onShiftSelect?.(addr)}
              detailVariant={detailVariant}
              interactionEnabled={interactionEnabled}
              paused={paused}
              sceneIdPrefix={systemId}
            />
          </React.Fragment>
        ))}

        {diskMode ? (
          <ProtoplanetaryDisk
            asteroids={solarData.asteroids}
            beltInnerRadius={solarData.beltInnerRadius}
            beltOuterRadius={solarData.beltOuterRadius}
            selectedAddress={selectedAddress}
            onSelectAddress={(addr) => onSelect?.(scopeAddr(addr))}
            onDeselect={() => onDeselect?.()}
            panelOpen={panelOpen}
            showAllNames={showAllNames && !photoMode}
            showRenamedOnly={showRenamedOnly}
            vesting
            interactive={interactionEnabled}
            paused={paused}
            sceneIdPrefix={systemId}
          />
        ) : (
          <AsteroidBelt
            asteroids={solarData.asteroids}
            beltInnerRadius={solarData.beltInnerRadius}
            beltOuterRadius={solarData.beltOuterRadius}
            selectedAddress={selectedAddress}
            onSelectAddress={(addr) => onSelect?.(addr)}
            onDeselect={() => onDeselect?.()}
            panelOpen={panelOpen}
            showAllNames={showAllNames && !photoMode}
            showRenamedOnly={showRenamedOnly}
            showOrbits={showOrbits && !photoMode}
            paused={paused}
            interactive={interactiveBelt && interactionEnabled}
            showLabels={showBeltLabels}
            beltTone={beltTone}
            sceneIdPrefix={systemId}
          />
        )}
      </group>
    </>
  );
}
