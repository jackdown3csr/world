/**
 * Pure mapping layer — no React, no Three.js.
 *
 * Converts normalized BlockExplorerEvents into TransactionFlowEffects
 * that the scene can render. Decides scene IDs, fallback system anchors,
 * and timing windows.
 */

import type { SceneSystemId } from "@/lib/sceneSystems";
import { TRANSIT_BEACON_ID } from "@/lib/transitBeacon";
import {
  ARBSYS_ADDRESS,
  FAUCET_ADDRESS as FAUCET_CONTRACT_ADDRESS,
  HYPERLANE_MAILBOX,
  RD_ADDRESS,
  STAKING_PROXY,
  VE_ADDRESS,
} from "./classifyTransactions";
import type { BlockExplorerEvent, SceneAnchorSystemId, TransactionFlowEffect } from "./types";

export type AddressSystemMap = Record<string, SceneSystemId>;

export const CANONICAL_BRIDGE_SCENE_ID = "__bridge_canonical__";
export const HYPERLANE_BRIDGE_SCENE_ID = "__bridge_hyperlane__";
const FAUCET_SCENE_ID = "faucet";

const CONTRACT_STAR_IDS: Record<string, string> = {
  [VE_ADDRESS]:         "__star_vescrow__",
  [RD_ADDRESS]:         "__star_vesting__",
  [STAKING_PROXY]:      "__star_staking_remnant__",
  [FAUCET_CONTRACT_ADDRESS]: FAUCET_SCENE_ID,
  [ARBSYS_ADDRESS]:     CANONICAL_BRIDGE_SCENE_ID,
  [HYPERLANE_MAILBOX]:  HYPERLANE_BRIDGE_SCENE_ID,
};

const CONTRACT_FALLBACK_SYSTEM: Record<string, SceneSystemId> = {
  [VE_ADDRESS]:         "vescrow",
  [RD_ADDRESS]:         "vesting",
  [STAKING_PROXY]:      "staking-remnant",
  [FAUCET_CONTRACT_ADDRESS]: "vescrow",
  [ARBSYS_ADDRESS]:     "vescrow",
  [HYPERLANE_MAILBOX]:  "vescrow",
};

/** Resolve a contract address to a known scene star/bridge ID. */
function resolveContractId(address: string | null): string | null {
  if (!address) return null;
  return CONTRACT_STAR_IDS[address.toLowerCase()] ?? null;
}

/** Resolve a contract to its system-level fallback (for sceneEffects). */
function resolveContractSystem(address: string | null): SceneSystemId {
  if (!address) return "vescrow";
  return CONTRACT_FALLBACK_SYSTEM[address.toLowerCase()] ?? "vescrow";
}

function resolveWalletSystem(
  address: string | null,
  addressSystemMap?: AddressSystemMap,
): SceneSystemId | null {
  if (!address || !addressSystemMap) return null;
  return addressSystemMap[address.toLowerCase()] ?? null;
}

const UNKNOWN_TRAFFIC_SYSTEM: SceneAnchorSystemId = "transit-beacon";

/**
 * Map one normalized explorer event to a scene-ready TransactionFlowEffect.
 *
 * - For ecosystem events (from wallet → known contract): fromId = wallet address,
 *   toId = contract's scene star ID.
 * - For reverse flows (contract → wallet): fromId = star ID, toId = wallet address.
 * - Bridge events anchor one end to the bridge scene object.
 * - Generic events: both ends use the wallet or system fallback.
 */
function mapEvent(
  event: BlockExplorerEvent,
  durationMs: number,
  nowMs: number,
  addressSystemMap?: AddressSystemMap,
): TransactionFlowEffect {
  const staggerMs = event.priority * 400; // slightly stagger by priority tier
  const startedAt = nowMs + staggerMs;
  const expiresAt = startedAt + durationMs;

  const toContractId = resolveContractId(event.toAddress);
  const fromContractId = resolveContractId(event.fromAddress);

  let fromId: string | null;
  let toId: string | null;
  let fromSystemId: SceneAnchorSystemId;
  let toSystemId: SceneAnchorSystemId;

  switch (event.classification) {
    // wallet → vEscrow star
    case "vescrow-lock":
      fromId = event.fromAddress;
      toId = toContractId;
      fromSystemId = "vescrow";
      toSystemId = "vescrow";
      break;

    // vEscrow star → wallet
    case "vescrow-unlock":
      fromId = toContractId; // the contract is the source of funds
      toId = event.fromAddress;
      fromSystemId = "vescrow";
      toSystemId = "vescrow";
      break;

    // RewardDistributor → wallet
    case "vesting-claim":
      fromId = toContractId;
      toId = event.fromAddress;
      fromSystemId = "vesting";
      toSystemId = "vesting";
      break;

    // faucet → wallet
    case "faucet-claim":
      fromId = toContractId;
      toId = event.fromAddress;
      fromSystemId = "vescrow";
      toSystemId = resolveWalletSystem(event.fromAddress, addressSystemMap) ?? "vescrow";
      break;

    // staking → wallet
    case "staking-withdraw":
      fromId = toContractId;
      toId = event.fromAddress;
      fromSystemId = "staking-remnant";
      toSystemId = "staking-remnant";
      break;

    // wallet → bridge
    case "bridge-out":
      fromId = event.fromAddress;
      toId = toContractId;
      fromSystemId = resolveWalletSystem(event.fromAddress, addressSystemMap) ?? "vescrow";
      toSystemId = resolveContractSystem(event.toAddress);
      break;

    // bridge → wallet (inbound — less common to see in raw block)
    case "bridge-in":
      fromId = fromContractId;
      toId = event.toAddress;
      fromSystemId = resolveContractSystem(event.fromAddress);
      toSystemId = resolveWalletSystem(event.toAddress, addressSystemMap) ?? "vescrow";
      break;

    // generic transfer: wallet → wallet
    case "generic-transfer":
      {
      const fromKnownSystem = resolveWalletSystem(event.fromAddress, addressSystemMap);
      const toKnownSystem = resolveWalletSystem(event.toAddress, addressSystemMap);
      if (toContractId === CANONICAL_BRIDGE_SCENE_ID || toContractId === HYPERLANE_BRIDGE_SCENE_ID) {
        fromId = event.fromAddress;
        toId = toContractId;
        fromSystemId = fromKnownSystem ?? UNKNOWN_TRAFFIC_SYSTEM;
        toSystemId = UNKNOWN_TRAFFIC_SYSTEM;
      } else if (fromContractId === CANONICAL_BRIDGE_SCENE_ID || fromContractId === HYPERLANE_BRIDGE_SCENE_ID) {
        fromId = fromContractId;
        toId = event.toAddress;
        fromSystemId = UNKNOWN_TRAFFIC_SYSTEM;
        toSystemId = toKnownSystem ?? UNKNOWN_TRAFFIC_SYSTEM;
      } else if (fromKnownSystem && toKnownSystem) {
        fromId = event.fromAddress;
        toId = event.toAddress;
        fromSystemId = fromKnownSystem;
        toSystemId = toKnownSystem;
      } else if (fromKnownSystem) {
        fromId = event.fromAddress;
        toId = TRANSIT_BEACON_ID;
        fromSystemId = fromKnownSystem;
        toSystemId = UNKNOWN_TRAFFIC_SYSTEM;
      } else if (toKnownSystem) {
        fromId = TRANSIT_BEACON_ID;
        toId = event.toAddress;
        fromSystemId = UNKNOWN_TRAFFIC_SYSTEM;
        toSystemId = toKnownSystem;
      } else {
        fromId = event.fromAddress;
        toId = TRANSIT_BEACON_ID;
        fromSystemId = UNKNOWN_TRAFFIC_SYSTEM;
        toSystemId = UNKNOWN_TRAFFIC_SYSTEM;
      }
      break;
      }

    // generic contract call: wallet → unknown contract star (use star of nearest system)
    case "generic-contract-call":
    default:
      {
      const fromKnownSystem = resolveWalletSystem(event.fromAddress, addressSystemMap);
      const toKnownSystem = resolveWalletSystem(event.toAddress, addressSystemMap);
      if (toContractId === CANONICAL_BRIDGE_SCENE_ID || toContractId === HYPERLANE_BRIDGE_SCENE_ID) {
        fromId = event.fromAddress;
        toId = toContractId;
        fromSystemId = fromKnownSystem ?? UNKNOWN_TRAFFIC_SYSTEM;
        toSystemId = UNKNOWN_TRAFFIC_SYSTEM;
      } else if (fromContractId === CANONICAL_BRIDGE_SCENE_ID || fromContractId === HYPERLANE_BRIDGE_SCENE_ID) {
        fromId = fromContractId;
        toId = event.toAddress;
        fromSystemId = UNKNOWN_TRAFFIC_SYSTEM;
        toSystemId = toKnownSystem ?? UNKNOWN_TRAFFIC_SYSTEM;
      } else if (fromKnownSystem) {
        fromId = event.fromAddress;
        toId = TRANSIT_BEACON_ID;
        fromSystemId = fromKnownSystem;
        toSystemId = UNKNOWN_TRAFFIC_SYSTEM;
      } else if (toKnownSystem) {
        fromId = TRANSIT_BEACON_ID;
        toId = event.toAddress;
        fromSystemId = UNKNOWN_TRAFFIC_SYSTEM;
        toSystemId = toKnownSystem;
      } else {
        fromId = event.fromAddress;
        toId = TRANSIT_BEACON_ID;
        fromSystemId = UNKNOWN_TRAFFIC_SYSTEM;
        toSystemId = UNKNOWN_TRAFFIC_SYSTEM;
      }
      break;
      }
  }

  return {
    id: `txflow:${event.id}`,
    kind: "transaction-flow",
    fromId,
    toId,
    fromSystemId,
    toSystemId,
    startedAt,
    expiresAt,
    priority: event.priority,
    visualVariant: event.visualVariant,
    classification: event.classification,
    paletteHint: event.isEcosystem ? "ecosystem" : "generic",
    txHash: event.txHash,
    label: event.label,
  };
}

/**
 * Map an array of explorer events into scene effects.
 * @param events   Normalized events from classifyTransactions
 * @param durationMs  How long each effect lives (default 45 seconds)
 */
export function mapEventsToSceneEffects(
  events: BlockExplorerEvent[],
  durationMs = 45_000,
  addressSystemMap?: AddressSystemMap,
): TransactionFlowEffect[] {
  const nowMs = Date.now();
  return events.map((event) => mapEvent(event, durationMs, nowMs, addressSystemMap));
}
