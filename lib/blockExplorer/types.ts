/**
 * Normalized types for the live block transaction explorer.
 * No React, no Three.js — pure data contracts shared across
 * the API route, mapping layer, and client hook.
 */

import type { SceneSystemId } from "@/lib/sceneSystems";

export type SceneAnchorSystemId = SceneSystemId | "transit-beacon";

export type BlockExplorerClassification =
  | "vescrow-lock"
  | "vescrow-unlock"
  | "vescrow-increase"
  | "vescrow-extend"
  | "faucet-claim"
  | "staking-withdraw"
  | "vesting-claim"
  | "gubi-claim"
  | "gubi-burn"
  | "wgnet-unwrap"
  | "wgnet-wrap"
  | "bridge-in"
  | "bridge-out"
  | "generic-transfer"
  | "generic-contract-call"
  | "unknown";

/** Scene visual style. "trail" = moving packets along a bezier arc. */
export type TransactionVisualVariant = "trail" | "pulse";

/** What kind of scene object anchors one end of the effect. */
export type SceneAnchorKind = "wallet" | "star" | "bridge" | "system-fallback" | "unknown";

/** One normalized transaction event returned by the API route. */
export interface BlockExplorerEvent {
  /** Stable deduplicated ID: `${txHash}:${classification}` */
  id: string;
  txHash: string;
  blockNumber: number;
  /** Unix seconds */
  timestamp: number;
  classification: BlockExplorerClassification;
  /** 0 = highest priority for scene emphasis */
  priority: number;
  fromAddress: string;
  toAddress: string | null;
  amountRaw: string | null;
  amountFormatted: string | null;
  label: string;
  isEcosystem: boolean;
  visualVariant: TransactionVisualVariant;
  sourceKind: SceneAnchorKind;
  targetKind: SceneAnchorKind;
  metadata: Record<string, unknown>;
}

/** Response shape from /api/block/txs */
export interface BlockExplorerApiResponse {
  blockNumber: number;
  blockTimestamp: number;
  events: BlockExplorerEvent[];
}

/**
 * Scene-ready effect produced by the mapping layer.
 * Consumed by TransactionFlow. Merged into sceneEffects[] in SolarSystem.
 */
export interface TransactionFlowEffect {
  /** Unique scene effect ID */
  id: string;
  kind: "transaction-flow";
  /**
   * Scene registry ID for the originating point.
   * May be a wallet address (lowercase) or a system star ID.
   * If null, fromSystemId is used as fallback.
   */
  fromId: string | null;
  /**
   * Scene registry ID for the destination point.
   * May be a wallet address, star ID, or bridge ID.
   * If null, toSystemId is used as fallback.
   */
  toId: string | null;
  /** Fallback system star used when fromId resolves to nothing */
  fromSystemId: SceneAnchorSystemId;
  /** Fallback system star used when toId resolves to nothing */
  toSystemId: SceneAnchorSystemId;
  /** Unix ms — when the effect should begin rendering */
  startedAt: number;
  /** Unix ms — when this effect expires and should stop rendering */
  expiresAt: number;
  priority: number;
  visualVariant: TransactionVisualVariant;
  classification: BlockExplorerClassification;
  /** Drives color palette: ecosystem = vivid accent, generic = dim neutral */
  paletteHint: "ecosystem" | "generic";
  txHash: string;
  label: string;
}
