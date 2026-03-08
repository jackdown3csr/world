import type { SolarSystemData } from "./layout";
import type { WalletEntry, VestingWalletEntry, PoolTokenEntry } from "./types";
import type { FaucetStats } from "@/hooks/useFaucet";
import type { BridgeSceneObject } from "./bridges";

export type SceneSystemId = "vescrow" | "vesting" | "gubi-pool" | "staking-remnant";
export type SceneSystemDetailVariant = "wallet" | "vesting" | "pool";
export type SceneSystemLayoutVariant = "vescrow" | "vesting" | "none";
export type SceneSystemPalette = "warm" | "cool" | "dwarf" | "dying";

export type SceneSystemDecorator =
  | {
      id: string;
      kind: "epoch-satellite";
      orbitRadius: number;
      epoch: number;
    }
  | {
      id: string;
      kind: "faucet-satellite";
      orbitRadius: number;
      stats: FaucetStats | null;
    };

export type SceneGlobalObject =
  | {
      id: string;
      kind: "comet";
    }
  | {
      id: string;
      kind: "rogue-planet";
    }
  | {
      id: string;
      kind: "bridge";
      bridge: BridgeSceneObject;
    };

export type SceneEffectDefinition = {
  id: string;
  kind: "block-pulse";
  systemId: SceneSystemId;
  tick: number;
};

export interface SceneSystemSummaryRow {
  label: string;
  value: string;
  accent?: string;
}

export interface SceneSystemDefinition {
  id: SceneSystemId;
  starId: string;
  label: string;
  navLabel: string;
  eyebrow: string;
  accent: string;
  palette: SceneSystemPalette;
  position: [number, number, number];
  starScale?: number;
  detailVariant: SceneSystemDetailVariant;
  layoutVariant: SceneSystemLayoutVariant;
  directoryMetricLabel: string;
  starPrimaryMetric?: string;
  starSecondaryMetric?: string;
  data: SolarSystemData;
  entries: Array<WalletEntry | VestingWalletEntry | PoolTokenEntry>;
  summaryRows: SceneSystemSummaryRow[];
  descriptionLines: string[];
  decorators?: SceneSystemDecorator[];
  updatedAt?: number;
}

export function getNearestSystemId(
  pos: [number, number, number] | null | undefined,
  systems: SceneSystemDefinition[],
): SceneSystemId {
  if (!systems.length) return "vescrow";
  if (!pos) return systems[0].id;

  let best = systems[0];
  let bestDist = distanceSquared(pos, best.position);

  for (let index = 1; index < systems.length; index += 1) {
    const system = systems[index];
    const dist = distanceSquared(pos, system.position);
    if (dist < bestDist) {
      best = system;
      bestDist = dist;
    }
  }

  return best.id;
}

function distanceSquared(a: [number, number, number], b: [number, number, number]) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}
