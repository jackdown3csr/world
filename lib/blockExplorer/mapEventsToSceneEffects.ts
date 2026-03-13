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
  GUBI_POOL_VAULT,
  HYPERLANE_MAILBOX,
  RD_ADDRESS,
  STAKING_PROXY,
  VE_ADDRESS,
} from "./classifyTransactions";
import type { BlockExplorerEvent, SceneAnchorSystemId, TransactionFlowEffect } from "./types";

export type AddressSystemMap = Record<string, SceneSystemId>;
export type AddressMultiSystemMap = Record<string, SceneSystemId[]>;

export const CANONICAL_BRIDGE_SCENE_ID = "__bridge_canonical__";
export const HYPERLANE_BRIDGE_SCENE_ID = "__bridge_hyperlane__";
const FAUCET_SCENE_ID = "faucet";

const CONTRACT_STAR_IDS: Record<string, string> = {
  [VE_ADDRESS]:         "__star_vescrow__",
  [RD_ADDRESS]:         "__star_vesting__",
  [STAKING_PROXY]:      "__star_staking_remnant__",
  [GUBI_POOL_VAULT]:    "__star_gubi_pool__",
  [FAUCET_CONTRACT_ADDRESS]: FAUCET_SCENE_ID,
  [ARBSYS_ADDRESS]:     CANONICAL_BRIDGE_SCENE_ID,
  [HYPERLANE_MAILBOX]:  HYPERLANE_BRIDGE_SCENE_ID,
};

const CONTRACT_FALLBACK_SYSTEM: Record<string, SceneSystemId> = {
  [VE_ADDRESS]:         "vescrow",
  [RD_ADDRESS]:         "vesting",
  [STAKING_PROXY]:      "staking-remnant",
  [GUBI_POOL_VAULT]:    "gubi-pool",
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

/**
 * Resolve a wallet address to its scoped scene ID.
 * Scene bodies are registered as `systemId:address` (e.g. `vesting:0x1234`).
 * If the wallet belongs to a known system, returns the scoped ID;
 * otherwise returns the raw lowercase address.
 */
function resolveWalletSceneId(
  address: string | null,
  addressSystemMap?: AddressSystemMap,
): string | null {
  if (!address) return null;
  const system = resolveWalletSystem(address, addressSystemMap);
  const lower = address.toLowerCase();
  return system ? `${system}:${lower}` : lower;
}

/**
 * Build a scoped scene ID forcing a specific system prefix.
 * Used for ecosystem-specific events where the system is known from the
 * contract being called, not from addressSystemMap (which uses last-write-wins
 * and may point to a different system for dual-registered wallets).
 */
function scopedWalletId(address: string | null, system: SceneSystemId): string | null {
  if (!address) return null;
  return `${system}:${address.toLowerCase()}`;
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
  addressMultiSystemMap?: AddressMultiSystemMap,
): TransactionFlowEffect[] {
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
      fromId = scopedWalletId(event.fromAddress, "vescrow");
      toId = toContractId;
      fromSystemId = "vescrow";
      toSystemId = "vescrow";
      break;

    // vEscrow star → wallet
    case "vescrow-unlock":
      fromId = toContractId; // the contract is the source of funds
      toId = scopedWalletId(event.fromAddress, "vescrow");
      fromSystemId = "vescrow";
      toSystemId = "vescrow";
      break;

    // RewardDistributor → wallet
    case "vesting-claim":
      fromId = toContractId;
      toId = scopedWalletId(event.fromAddress, "vesting");
      fromSystemId = "vesting";
      toSystemId = "vesting";
      break;

    // faucet → wallet
    case "faucet-claim":
      fromId = toContractId;
      toId = resolveWalletSceneId(event.fromAddress, addressSystemMap);
      fromSystemId = "vescrow";
      toSystemId = resolveWalletSystem(event.fromAddress, addressSystemMap) ?? "vescrow";
      break;

    // staking star → wallet (fan-out to every system the wallet appears in,
    // so the arc lands on the actual vescrow/vesting body, not a phantom staking clone)
    case "staking-withdraw": {
      const stakingStar = toContractId; // __star_staking_remnant__
      const toSystems = addressMultiSystemMap?.[event.fromAddress.toLowerCase()] ?? [];
      if (toSystems.length > 0) {
        return toSystems.map((sys) => ({
          id: `txflow:${event.id}:unstake-${sys}`,
          kind: "transaction-flow" as const,
          fromId: stakingStar,
          toId: `${sys}:${event.fromAddress.toLowerCase()}`,
          fromSystemId: "staking-remnant" as SceneAnchorSystemId,
          toSystemId: sys as SceneAnchorSystemId,
          startedAt,
          expiresAt,
          priority: event.priority,
          visualVariant: event.visualVariant,
          classification: event.classification,
          paletteHint: "ecosystem" as const,
          txHash: event.txHash,
          label: event.label,
        }));
      }
      // Wallet not known in any system — beacon fallback
      fromId = stakingStar;
      toId = TRANSIT_BEACON_ID;
      fromSystemId = "staking-remnant";
      toSystemId = UNKNOWN_TRAFFIC_SYSTEM;
      break;
    }

    // gUBI pool star → wallet (burn gUBI, receive wGNET + ARCHAI; fan-out like unstake)
    case "gubi-claim": {
      const gubiStar = toContractId; // __star_gubi_pool__
      const toSystems = addressMultiSystemMap?.[event.fromAddress.toLowerCase()] ?? [];
      if (toSystems.length > 0) {
        return toSystems.map((sys) => ({
          id: `txflow:${event.id}:gubi-${sys}`,
          kind: "transaction-flow" as const,
          fromId: gubiStar,
          toId: `${sys}:${event.fromAddress.toLowerCase()}`,
          fromSystemId: "gubi-pool" as SceneAnchorSystemId,
          toSystemId: sys as SceneAnchorSystemId,
          startedAt,
          expiresAt,
          priority: event.priority,
          visualVariant: event.visualVariant,
          classification: event.classification,
          paletteHint: "ecosystem" as const,
          txHash: event.txHash,
          label: event.label,
        }));
      }
      // Wallet not in any known system — beacon fallback
      fromId = gubiStar;
      toId = TRANSIT_BEACON_ID;
      fromSystemId = "gubi-pool";
      toSystemId = UNKNOWN_TRAFFIC_SYSTEM;
      break;
    }

    // wallet → wGNET9 → wallet (self: wrap GNET→wGNET or unwrap wGNET→GNET)
    case "wgnet-unwrap":
    case "wgnet-wrap":
      fromId = resolveWalletSceneId(event.fromAddress, addressSystemMap);
      toId = resolveWalletSceneId(event.fromAddress, addressSystemMap); // same wallet
      fromSystemId = resolveWalletSystem(event.fromAddress, addressSystemMap) ?? "gubi-pool";
      toSystemId = resolveWalletSystem(event.fromAddress, addressSystemMap) ?? "gubi-pool";
      break;

    // wallet → bridge
    case "bridge-out":
      fromId = resolveWalletSceneId(event.fromAddress, addressSystemMap);
      toId = toContractId;
      fromSystemId = resolveWalletSystem(event.fromAddress, addressSystemMap) ?? "vescrow";
      toSystemId = resolveContractSystem(event.toAddress);
      break;

    // bridge → wallet (inbound — process() call; actual recipient unknown from tx data,
    // so the arc goes bridge object → transit beacon to indicate incoming traffic)
    case "bridge-in":
      fromId = toContractId; // event.toAddress = HYPERLANE_MAILBOX → __bridge_hyperlane__
      toId = TRANSIT_BEACON_ID;
      fromSystemId = resolveContractSystem(event.toAddress);
      toSystemId = UNKNOWN_TRAFFIC_SYSTEM;
      break;

    // generic transfer / contract call: fan out one effect per system the wallet belongs to
    case "generic-transfer":
    case "generic-contract-call":
    default:
      {
      // Bridge sub-cases stay single-effect
      if (toContractId === CANONICAL_BRIDGE_SCENE_ID || toContractId === HYPERLANE_BRIDGE_SCENE_ID) {
        fromId = resolveWalletSceneId(event.fromAddress, addressSystemMap);
        toId = toContractId;
        fromSystemId = resolveWalletSystem(event.fromAddress, addressSystemMap) ?? UNKNOWN_TRAFFIC_SYSTEM;
        toSystemId = UNKNOWN_TRAFFIC_SYSTEM;
        break;
      }
      if (fromContractId === CANONICAL_BRIDGE_SCENE_ID || fromContractId === HYPERLANE_BRIDGE_SCENE_ID) {
        fromId = fromContractId;
        toId = resolveWalletSceneId(event.toAddress, addressSystemMap);
        fromSystemId = UNKNOWN_TRAFFIC_SYSTEM;
        toSystemId = resolveWalletSystem(event.toAddress, addressSystemMap) ?? UNKNOWN_TRAFFIC_SYSTEM;
        break;
      }

      // Fan-out: emit one effect per system the sender wallet belongs to
      const fromSystems = addressMultiSystemMap?.[event.fromAddress.toLowerCase()] ?? [];
      const toSystems = addressMultiSystemMap?.[event.toAddress?.toLowerCase() ?? ""] ?? [];

      if (fromSystems.length > 0 || toSystems.length > 0) {
        const fanOutEffects: TransactionFlowEffect[] = [];
        const sourceSystems = fromSystems.length > 0 ? fromSystems : [null];
        const targetSystems = toSystems.length > 0 ? toSystems : [null];

        for (const srcSys of sourceSystems) {
          for (const tgtSys of targetSystems) {
            const lower = event.fromAddress.toLowerCase();
            const fId = srcSys ? `${srcSys}:${lower}` : TRANSIT_BEACON_ID;
            const tLower = event.toAddress?.toLowerCase() ?? null;
            const tId = tgtSys && tLower ? `${tgtSys}:${tLower}` : TRANSIT_BEACON_ID;
            const suffix = `${srcSys ?? "x"}-${tgtSys ?? "x"}`;
            fanOutEffects.push({
              id: `txflow:${event.id}:${suffix}`,
              kind: "transaction-flow",
              fromId: fId,
              toId: tId,
              fromSystemId: srcSys ?? UNKNOWN_TRAFFIC_SYSTEM,
              toSystemId: tgtSys ?? UNKNOWN_TRAFFIC_SYSTEM,
              startedAt,
              expiresAt,
              priority: event.priority,
              visualVariant: event.visualVariant,
              classification: event.classification,
              paletteHint: "generic",
              txHash: event.txHash,
              label: event.label,
            });
          }
        }
        return fanOutEffects;
      }

      // Fallback: unknown wallet → transit beacon.
      // fromId uses the raw address so pickRandomBeltBody in TransactionFlow
      // can seed a deterministic pick from the vescrow asteroid belt.
      // fromSystemId = "vescrow" so the belt lookup finds real bodies instead
      // of resolving to beacon (same position as toId → zero distance → hidden).
      fromId = event.fromAddress.toLowerCase();
      toId = TRANSIT_BEACON_ID;
      fromSystemId = "vescrow";
      toSystemId = UNKNOWN_TRAFFIC_SYSTEM;
      break;
      }
  }

  return [{
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
  }];
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
  addressMultiSystemMap?: AddressMultiSystemMap,
): TransactionFlowEffect[] {
  const nowMs = Date.now();
  return events.flatMap((event) => mapEvent(event, durationMs, nowMs, addressSystemMap, addressMultiSystemMap));
}
