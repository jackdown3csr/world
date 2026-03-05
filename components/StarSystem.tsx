"use client";

/**
 * StarSystem — a self-contained star + planets + belt group.
 *
 * Wraps the celestial bodies in a <group position={position}> so the entire
 * system can be placed anywhere in the scene. SunLensFlare and SolarWind are
 * rendered as siblings (outside the group) because they use world-space
 * position.copy() internally and must live at the scene root level.
 */

import React from "react";

import Sun from "./Sun";
import SunLensFlare from "./SunLensFlare";
import SolarWind from "./SolarWind";
import PlanetWallet from "./PlanetWallet";
import OrbitRing from "./OrbitRing";
import AsteroidBelt from "./AsteroidBelt";

import type { SolarSystemData } from "@/lib/layout/types";
import type { StarPalette } from "./Sun";

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
  showRenamedOnly?: boolean;
  showTrails?: boolean;
  photoMode?: boolean;
  /** Show SolarWind particle system around this star */
  showSolarWind?: boolean;
  /** Currently selected wallet address */
  selectedAddress?: string | null;
  panelOpen?: boolean;
  onSelect?: (address: string) => void;
  onDeselect?: () => void;
  onShiftSelect?: (address: string) => void;
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
  showRenamedOnly = false,
  showTrails = false,
  photoMode = false,
  showSolarWind = true,
  selectedAddress = null,
  panelOpen = false,
  onSelect,
  onDeselect,
  onShiftSelect,
}: StarSystemProps) {
  return (
    <>
      {/* Screen-space effects — must be at scene root (not inside the offset group) */}
      <SunLensFlare starPosition={position} />
      {showSolarWind && (
        <SolarWind origin={position} color={palette === "cool" ? "cool" : "warm"} />
      )}

      {/* All 3D bodies in world-space offset group */}
      <group position={position}>
        <Sun
          totalVotingPower={showAllNames && !photoMode ? totalVotingPower : undefined}
          totalLocked={showAllNames && !photoMode ? totalLocked : undefined}
          blockNumber={blockNumber}
          palette={palette}
          label={starLabel}
        />

        {solarData.planets.map((p) => (
          <React.Fragment key={p.wallet.address}>
            {showOrbits && !photoMode && p.ringWallets.length === 0 && (
              <OrbitRing radius={p.orbitRadius} tilt={p.tilt} />
            )}
            <PlanetWallet
              data={p}
              selected={
                selectedAddress?.toLowerCase() === p.wallet.address.toLowerCase()
              }
              onSelect={() => onSelect?.(p.wallet.address)}
              onDeselect={() => onDeselect?.()}
              panelOpen={panelOpen}
              selectedAddress={selectedAddress}
              onSelectAddress={(addr) => onSelect?.(addr)}
              showLabel={showAllNames && !photoMode}
              showMoonLabels={showAllNames && !photoMode}
              showRingLabels={showAllNames && !photoMode}
              showRenamedOnly={showRenamedOnly}
              showTrails={showTrails && !photoMode}
              onShiftSelect={(addr) => onShiftSelect?.(addr)}
            />
          </React.Fragment>
        ))}

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
        />
      </group>
    </>
  );
}
