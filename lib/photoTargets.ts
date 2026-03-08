import type { PoolTokenEntry, VestingWalletEntry, WalletEntry } from "@/lib/types";
import type { SceneGlobalObject, SceneSystemDefinition } from "@/lib/sceneSystems";
import type { SceneListGroup, SceneListItem, SceneListSection } from "@/components/systemHud/SceneListPanel";

type WalletLike = WalletEntry | VestingWalletEntry | PoolTokenEntry;

export interface PhotoTargetItem extends SceneListItem {
  kind: "star" | "wallet" | "satellite" | "bridge" | "comet";
  systemId?: string;
}

export interface PhotoTargetSection extends Omit<SceneListSection, "groups"> {
  groups: Array<Omit<SceneListGroup, "items"> & { items: PhotoTargetItem[] }>;
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function walletLabel(entry: WalletLike) {
  if ("symbol" in entry && entry.symbol) return entry.symbol;
  return entry.customName || shortAddress(entry.address);
}

function walletMetric(system: SceneSystemDefinition, entry: WalletLike) {
  if (system.id === "vesting" && "totalEntitledFormatted" in entry) return entry.totalEntitledFormatted;
  if (system.id === "gubi-pool" && "valueUSDFormatted" in entry) return entry.valueUSDFormatted;
  return entry.votingPowerFormatted;
}

function walletDot(entry: WalletLike) {
  if ("symbol" in entry) return "rgba(255,224,138,0.8)";
  if (entry.tier === "moon") return "rgba(148,190,210,0.75)";
  if (entry.tier === "ring") return "rgba(176,176,176,0.72)";
  if (entry.tier === "asteroid") return "rgba(138,138,138,0.72)";
  return "rgba(0,229,255,0.7)";
}

function mapWalletItems(system: SceneSystemDefinition, entries: WalletLike[]): PhotoTargetItem[] {
  return entries.map((entry) => ({
    id: entry.address,
    label: walletLabel(entry),
    metric: walletMetric(system, entry),
    accent: system.accent,
    dotColor: walletDot(entry),
    detail: entry.customName ? `${entry.customName} (${entry.address})` : entry.address,
    kind: "wallet",
    systemId: system.id,
  }));
}

function createWalletGroups(system: SceneSystemDefinition): PhotoTargetSection["groups"] {
  const groups: PhotoTargetSection["groups"] = [];
  const { data } = system;

  if (data.planets.length > 0) {
    groups.push({
      key: `${system.id}-planets`,
      label: "planets",
      count: data.planets.length,
      items: mapWalletItems(system, data.planets.map((planet) => planet.wallet)),
    });
  }

  const moonItems = data.planets.flatMap((planet) => planet.moons.map((moon) => moon.wallet));
  if (moonItems.length > 0) {
    groups.push({
      key: `${system.id}-moons`,
      label: "moons",
      count: moonItems.length,
      items: mapWalletItems(system, moonItems),
    });
  }

  const ringItems = data.planets.flatMap((planet) => planet.ringWallets.map((ring) => ring.wallet));
  if (ringItems.length > 0) {
    groups.push({
      key: `${system.id}-ring`,
      label: "ring",
      count: ringItems.length,
      items: mapWalletItems(system, ringItems),
    });
  }

  if (data.asteroids.length > 0) {
    groups.push({
      key: `${system.id}-asteroids`,
      label: "asteroids",
      count: data.asteroids.length,
      items: mapWalletItems(system, data.asteroids.map((asteroid) => asteroid.wallet)),
    });
  }

  return groups;
}

function createDecoratorGroup(system: SceneSystemDefinition): PhotoTargetSection["groups"][number] | null {
  if (!system.decorators?.length) return null;

  const items: PhotoTargetItem[] = system.decorators.map((decorator) => {
    if (decorator.kind === "faucet-satellite") {
      return {
        id: decorator.id,
        label: "faucet",
        metric: decorator.stats ? `${decorator.stats.totalClaims} claims` : "satellite",
        accent: "#7bf7ff",
        dotColor: "rgba(123,247,255,0.85)",
        detail: "galactica faucet satellite",
        kind: "satellite",
        systemId: system.id,
      };
    }

    return {
      id: decorator.id,
      label: "epoch probe",
      metric: `epoch ${decorator.epoch}`,
      accent: "#d2f7ff",
      dotColor: "rgba(210,247,255,0.85)",
      detail: "vesting epoch satellite",
      kind: "satellite",
      systemId: system.id,
    };
  });

  return {
    key: `${system.id}-satellites`,
    label: "satellites",
    count: items.length,
    items,
  };
}

export function buildPhotoTargetSections(
  systems: SceneSystemDefinition[],
  globalObjects: SceneGlobalObject[],
): PhotoTargetSection[] {
  const systemSections = systems.map<PhotoTargetSection>((system) => {
    const groups: PhotoTargetSection["groups"] = [
      {
        key: `${system.id}-core`,
        label: "core",
        count: 1,
        items: [
          {
            id: system.starId,
            label: system.label,
            metric: system.starPrimaryMetric,
            accent: system.accent,
            dotColor: system.accent,
            detail: `${system.label} star`,
            kind: "star",
            systemId: system.id,
          },
        ],
      },
    ];

    const decoratorGroup = createDecoratorGroup(system);
    if (decoratorGroup) groups.push(decoratorGroup);
    groups.push(...createWalletGroups(system));

    return {
      key: system.id,
      label: system.navLabel,
      accent: system.accent,
      groups,
    };
  });

  const sceneItems: PhotoTargetItem[] = globalObjects.flatMap<PhotoTargetItem>((sceneObject) => {
    if (sceneObject.kind === "rogue-planet") return [];
    if (sceneObject.kind === "comet") {
      return [{
        id: sceneObject.id,
        label: "cascopea",
        metric: "visitor",
        accent: "#c8f6ff",
        dotColor: "rgba(200,246,255,0.9)",
        detail: "interstellar comet",
        kind: "comet",
      }];
    }

    return [{
      id: sceneObject.id,
      label: sceneObject.bridge.label,
      metric: sceneObject.bridge.stats.throughputLabel,
      accent: "#7bf7ff",
      dotColor: "rgba(123,247,255,0.9)",
      detail: sceneObject.bridge.routeHint,
      kind: "bridge",
    }];
  });

  if (sceneItems.length > 0) {
    systemSections.push({
      key: "scene-objects",
      label: "interstitial",
      accent: "#7aa6bb",
      groups: [{
        key: "scene-objects-items",
        label: "objects",
        count: sceneItems.length,
        items: sceneItems,
      }],
    });
  }

  return systemSections;
}

export function findPhotoTargetById(
  sections: PhotoTargetSection[],
  id: string | null | undefined,
): PhotoTargetItem | null {
  if (!id) return null;

  for (const section of sections) {
    for (const group of section.groups) {
      const item = group.items.find((candidate) => candidate.id === id);
      if (item) return item;
    }
  }

  return null;
}