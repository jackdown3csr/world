import type { SolarSystemData } from "./layout";
import type { WalletEntry, VestingWalletEntry, PoolTokenEntry, FlambeurEntry } from "./types";
import type { FaucetStats } from "@/hooks/useFaucet";
import type { BridgeSceneObject } from "./bridges";
import type { TransactionFlowEffect } from "./blockExplorer/types";
export type { TransactionFlowEffect } from "./blockExplorer/types";

export type SceneSystemId = "vescrow" | "vesting" | "gubi-pool" | "staking-remnant" | "flambeur";
export type SceneSystemDetailVariant = "wallet" | "vesting" | "pool" | "flambeur";
export type SceneSystemLayoutVariant = "vescrow" | "vesting" | "none" | "flambeur";
export type SceneSystemPalette = "warm" | "cool" | "dwarf" | "dying" | "flambeur";

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
    }
  | {
      id: string;
      kind: "sputnik-probe";
      orbitRadius: number;
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
    }
  | {
      id: string;
      kind: "transit-beacon";
      label: string;
      hint?: string;
      position: [number, number, number];
      bodyRadius: number;
    };

export type SceneEffectDefinition =
  | {
      id: string;
      kind: "block-pulse";
      systemId: SceneSystemId;
      tick: number;
    }
  | TransactionFlowEffect;

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
  entries: Array<WalletEntry | VestingWalletEntry | PoolTokenEntry | FlambeurEntry>;
  summaryRows: SceneSystemSummaryRow[];
  descriptionLines: string[];
  /** Optional CTA link rendered below descriptionLines in the info panel */
  promoUrl?: string;
  promoLabel?: string;
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
