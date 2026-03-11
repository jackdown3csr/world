"use client";

import React from "react";
import type { SolarSystemData } from "@/lib/layout";
import SceneListPanel, { type SceneListSection } from "./systemHud/SceneListPanel";

interface DirectoryPanelProps {
  solarData: SolarSystemData;
  selectedAddress: string | null;
  onSelect: (address: string, customName?: string) => void;
  attached?: boolean;
}

function addrLabel(w: { customName?: string; address: string }) {
  return w.customName || `${w.address.slice(0, 6)}...${w.address.slice(-4)}`;
}

function vpCmp(a: { votingPower: string }, b: { votingPower: string }) {
  const av = BigInt(a.votingPower || "0");
  const bv = BigInt(b.votingPower || "0");
  return bv > av ? 1 : bv < av ? -1 : 0;
}

function buildSections(solarData: SolarSystemData): SceneListSection[] {
  const moonItems = solarData.planets
    .flatMap((planet) => planet.moons.map((moon) => moon.wallet))
    .sort(vpCmp);
  const ringItems = solarData.planets
    .flatMap((planet) => planet.ringWallets.map((ring) => ring.wallet))
    .sort(vpCmp);

  return [{
    key: "directory",
    groups: [
      {
        key: "planets",
        label: "planets",
        count: solarData.planets.length,
        items: solarData.planets.map((planet) => ({
          id: planet.wallet.address,
          label: addrLabel(planet.wallet),
          metric: planet.wallet.votingPowerFormatted,
          dotColor: `hsl(${planet.hue * 360}, 45%, 50%)`,
          detail: planet.wallet.address,
        })),
      },
      {
        key: "moons",
        label: "moons",
        count: moonItems.length,
        items: moonItems.map((moon) => ({
          id: moon.address,
          label: addrLabel(moon),
          metric: moon.votingPowerFormatted,
          dotColor: "rgba(148,190,210,0.75)",
          detail: moon.address,
        })),
      },
      ...(ringItems.length > 0 ? [{
        key: "ring",
        label: "ring",
        count: ringItems.length,
        items: ringItems.map((ring) => ({
          id: ring.address,
          label: addrLabel(ring),
          metric: ring.votingPowerFormatted,
          dotColor: "rgba(176,176,176,0.72)",
          detail: ring.address,
        })),
      }] : []),
      ...(solarData.asteroids.length > 0 ? [{
        key: "asteroids",
        label: "asteroids",
        count: solarData.asteroids.length,
        items: [...solarData.asteroids].sort((a, b) => vpCmp(a.wallet, b.wallet)).map((asteroid) => ({
          id: asteroid.wallet.address,
          label: addrLabel(asteroid.wallet),
          metric: asteroid.wallet.votingPowerFormatted,
          dotColor: "rgba(138,138,138,0.72)",
          detail: asteroid.wallet.address,
        })),
      }] : []),
    ],
  }];
}

export default function DirectoryPanel({
  solarData,
  selectedAddress,
  onSelect,
  attached = false,
}: DirectoryPanelProps) {
  const sections = React.useMemo(() => buildSections(solarData), [solarData]);

  return (
    <SceneListPanel
      sections={sections}
      selectedId={selectedAddress}
      attached={attached}
      onSelect={(item) => {
        const entry = solarData.planets.find((planet) => planet.wallet.address === item.id)?.wallet
          ?? solarData.planets.flatMap((planet) => planet.moons.map((moon) => moon.wallet)).find((wallet) => wallet.address === item.id)
          ?? solarData.planets.flatMap((planet) => planet.ringWallets.map((ring) => ring.wallet)).find((wallet) => wallet.address === item.id)
          ?? solarData.asteroids.find((asteroid) => asteroid.wallet.address === item.id)?.wallet;
        onSelect(item.id, entry?.customName);
      }}
    />
  );
}
