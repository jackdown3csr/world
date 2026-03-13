/**
 * Pure transaction classifier — no React, no Three.js.
 *
 * Classifies raw block transactions into normalized BlockExplorerEvents
 * by matching known ecosystem contract addresses and function selectors.
 */

import { formatBalance } from "@/lib/formatBalance";
import type {
  BlockExplorerClassification,
  BlockExplorerEvent,
  SceneAnchorKind,
  TransactionVisualVariant,
} from "./types";

/* ── Ecosystem contract addresses (lowercase) ───────────── */
export const VE_ADDRESS     = "0xdfbe5ac59027c6f38ac3e2edf6292672a8ecffe4";
export const RD_ADDRESS     = "0x80bcb71f63f11344f5483d108374fa394a587abe";
/** gUBI RewardDistributor — claimReward() mints gUBI tokens to the caller */
export const GUBI_RD_ADDRESS = "0x07297e1aa709c85e81c1a9498080ae010be91d80";
export const STAKING_PROXY  = "0x90b07e15cfb173726de904ca548dd96f73c12428";
export const ARBSYS_ADDRESS = "0x0000000000000000000000000000000000000064";
export const HYPERLANE_MAILBOX = "0x3a464f746d23ab22155710f44db16dca53e0775e";
export const FAUCET_ADDRESS = "0x522b3595017537d29258f7f770e78aa5de1ec9cb";
export const SYSTEM_SELF_ADDRESS = "0x00000000000000000000000000000000000a4b05";
/** gUBI pool vault — users call redeem/burn here, receiving wGNET + ARCHAI */
export const GUBI_POOL_VAULT = "0x50af2aab1455c1c06b3b8e623549dde437f54eef";
/** wGNET9 token contract — WETH9-style wrap/unwrap: deposit() wraps GNET→wGNET, withdraw() unwraps wGNET→GNET */
export const WGNET9_ADDRESS  = "0x690f1eef8aceaad09ac695d9111af081045c6d5b7";

/**
 * 4-byte selectors for VotingEscrow functions (Curve-style Vyper ABI).
 * These are the first 4 bytes of keccak256 of the function signature.
 */
const VE_SELECTORS = {
  createLock:          "65fc3873", // create_lock(uint256,uint256)
  increaseAmount:      "4957677c", // increase_amount(uint256)
  increaseUnlockTime:  "ebe2b12b", // increase_unlock_time(uint256)
  depositFor:          "6a627842", // deposit_for(address)
  withdraw:            "3ccfd60b", // withdraw()
} as const;

const STAKING_SELECTORS = {
  withdraw: "2e1a7d4d", // withdraw(uint256) — standard ERC20 staking
  exit:     "e9fad8ee", // exit()
  stake:    "a694fc3a", // stake(uint256)
} as const;

/** wGNET9 (WETH9-style) selectors */
const WGNET9_SELECTORS = {
  deposit:  "d0e30db0", // deposit() — wrap GNET → wGNET
  withdraw: "2e1a7d4d", // withdraw(uint256) — unwrap wGNET → GNET
} as const;

/** Hyperlane Mailbox selectors */
const HYPERLANE_SELECTORS = {
  dispatch:             "fa31de01", // dispatch(uint32,bytes32,bytes) — send message out
  dispatchWithMetadata: "48aee8d4", // dispatch(uint32,bytes32,bytes,bytes) — send with metadata
  process:              "7c39d130", // process(bytes,bytes) — deliver incoming message
} as const;

const SYSTEM_SELECTORS = {
  startBlock: "6bf6a42d",
} as const;

/** Classification details for one transaction */
interface Classification {
  classification: BlockExplorerClassification;
  label: string;
  isEcosystem: boolean;
  priority: number;
  visualVariant: TransactionVisualVariant;
  sourceKind: SceneAnchorKind;
  targetKind: SceneAnchorKind;
}

function selector(input: string): string {
  return input.slice(2, 10).toLowerCase();
}

function isZeroHex(value: string | null | undefined): boolean {
  return !value || value === "0x" || value === "0x0" || /^0x0+$/i.test(value);
}

function shouldIgnoreTransaction(tx: RawTransaction): boolean {
  const from = tx.from.toLowerCase();
  const to = tx.to?.toLowerCase() ?? null;
  const input = tx.input ?? "0x";
  const sel = selector(input);

  // System maintenance self-call seen at block boundaries.
  if (from === SYSTEM_SELF_ADDRESS && to === SYSTEM_SELF_ADDRESS && sel === SYSTEM_SELECTORS.startBlock) {
    return true;
  }

  // Repeating self-noop heartbeat: self-send, zero value, no calldata.
  if (to && from === to && input === "0x" && isZeroHex(tx.value)) {
    return true;
  }

  return false;
}

function classify(to: string | null, input: string, value: string): Classification {
  const toLower = to?.toLowerCase() ?? null;
  const sel = selector(input);

  // ── vEscrow interactions ────────────────────────────────
  if (toLower === VE_ADDRESS) {
    if (sel === VE_SELECTORS.withdraw) {
      return {
        classification: "vescrow-unlock",
        label: "vEscrow unlock",
        isEcosystem: true,
        priority: 1,
        visualVariant: "trail",
        sourceKind: "wallet",
        targetKind: "star",
      };
    }
    // createLock, increaseAmount, increaseUnlockTime, depositFor → all lock variants
    return {
      classification: "vescrow-lock",
      label: "vEscrow lock",
      isEcosystem: true,
      priority: 0,
      visualVariant: "trail",
      sourceKind: "wallet",
      targetKind: "star",
    };
  }

  // ── Vesting / RewardDistributor ────────────────────────
  if (toLower === RD_ADDRESS) {
    return {
      classification: "vesting-claim",
      label: "vesting claim",
      isEcosystem: true,
      priority: 2,
      visualVariant: "trail",
      sourceKind: "star",
      targetKind: "wallet",
    };
  }

  // ── gUBI RewardDistributor (claimReward → receive gUBI tokens) ────
  if (toLower === GUBI_RD_ADDRESS) {
    return {
      classification: "gubi-claim",
      label: "gUBI claim",
      isEcosystem: true,
      priority: 2,
      visualVariant: "trail",
      sourceKind: "star",
      targetKind: "wallet",
    };
  }

  // ── gUBI pool vault (burnIndexToken: wallet burns gUBI → receives wGNET+ARCHAI) ─
  if (toLower === GUBI_POOL_VAULT) {
    return {
      classification: "gubi-burn",
      label: "gUBI burn",
      isEcosystem: true,
      priority: 2,
      visualVariant: "trail",
      sourceKind: "wallet",
      targetKind: "star",
    };
  }

  // ── wGNET9 wrap / unwrap ───────────────────────────────
  if (toLower === WGNET9_ADDRESS) {
    if (sel === WGNET9_SELECTORS.deposit) {
      return {
        classification: "wgnet-wrap",
        label: "wGNET wrap",
        isEcosystem: true,
        priority: 3,
        visualVariant: "trail",
        sourceKind: "wallet",
        targetKind: "wallet",
      };
    }
    if (sel === WGNET9_SELECTORS.withdraw) {
      return {
        classification: "wgnet-unwrap",
        label: "wGNET unwrap",
        isEcosystem: true,
        priority: 3,
        visualVariant: "trail",
        sourceKind: "wallet",
        targetKind: "wallet",
      };
    }
    // Other calls to wGNET9 (transfer, approve, etc.) fall through to generic
  }

  // ── Faucet claim flow ──────────────────────────────────
  if (toLower === FAUCET_ADDRESS) {
    return {
      classification: "faucet-claim",
      label: "faucet claim",
      isEcosystem: true,
      priority: 2,
      visualVariant: "trail",
      sourceKind: "star",
      targetKind: "wallet",
    };
  }

  // ── Staking remnant ────────────────────────────────────
  if (toLower === STAKING_PROXY) {
    const isExit =
      sel === STAKING_SELECTORS.withdraw || sel === STAKING_SELECTORS.exit;
    return {
      classification: "staking-withdraw",
      label: isExit ? "staking exit" : "staking tx",
      isEcosystem: true,
      priority: 3,
      visualVariant: "trail",
      sourceKind: "star",
      targetKind: "wallet",
    };
  }

  // ── Canonical bridge (Arbitrum-style withdraw to ArbSys) ─
  if (toLower === ARBSYS_ADDRESS) {
    return {
      classification: "bridge-out",
      label: "canonical bridge",
      isEcosystem: true,
      priority: 4,
      visualVariant: "trail",
      sourceKind: "wallet",
      targetKind: "bridge",
    };
  }

  // ── Hyperlane mailbox: dispatch = outbound, process = inbound ─────────
  if (toLower === HYPERLANE_MAILBOX) {
    if (sel === HYPERLANE_SELECTORS.process) {
      return {
        classification: "bridge-in",
        label: "hyperlane bridge",
        isEcosystem: true,
        priority: 4,
        visualVariant: "trail",
        sourceKind: "bridge",
        targetKind: "wallet",
      };
    }
    // dispatch() or dispatch()+metadata → outbound
    return {
      classification: "bridge-out",
      label: "hyperlane bridge",
      isEcosystem: true,
      priority: 4,
      visualVariant: "trail",
      sourceKind: "wallet",
      targetKind: "bridge",
    };
  }

  // ── Generic transfer (non-zero value, no contract) ────
  if (value !== "0x0" && value !== "0x" && input === "0x") {
    return {
      classification: "generic-transfer",
      label: "transfer",
      isEcosystem: false,
      priority: 8,
      visualVariant: "trail",
      sourceKind: "wallet",
      targetKind: "wallet",
    };
  }

  // ── Generic contract call ─────────────────────────────
  if (toLower && input.length > 2) {
    return {
      classification: "generic-contract-call",
      label: "beacon tx",
      isEcosystem: false,
      priority: 9,
      visualVariant: "trail",
      sourceKind: "wallet",
      targetKind: "unknown",
    };
  }

  return {
    classification: "unknown",
    label: "beacon tx",
    isEcosystem: false,
    priority: 9,
    visualVariant: "trail",
    sourceKind: "wallet",
    targetKind: "unknown",
  };
}

export interface RawTransaction {
  hash: string;
  from: string;
  to: string | null;
  value: string;
  input: string;
}

/** Classify a list of raw block transactions into normalized explorer events. */
export function classifyTransactions(
  txs: RawTransaction[],
  blockNumber: number,
  blockTimestamp: number,
  maxEcosystem = 50,
  maxGeneric = 25,
): BlockExplorerEvent[] {
  const ecosystem: BlockExplorerEvent[] = [];
  const generic: BlockExplorerEvent[] = [];

  for (const tx of txs) {
    if (shouldIgnoreTransaction(tx)) continue;

    const c = classify(tx.to, tx.input ?? "0x", tx.value ?? "0x0");

    // Format GNET value if present
    const valueBigInt = BigInt(tx.value || "0");
    const amountRaw = valueBigInt > 0n ? tx.value : null;
    const amountFormatted = valueBigInt > 0n
      ? formatBalance(valueBigInt.toString(), "GNET")
      : null;

    const event: BlockExplorerEvent = {
      id: `${tx.hash}:${c.classification}`,
      txHash: tx.hash,
      blockNumber,
      timestamp: blockTimestamp,
      classification: c.classification,
      priority: c.priority,
      fromAddress: tx.from.toLowerCase(),
      toAddress: tx.to?.toLowerCase() ?? null,
      amountRaw,
      amountFormatted,
      label: c.label,
      isEcosystem: c.isEcosystem,
      visualVariant: c.visualVariant,
      sourceKind: c.sourceKind,
      targetKind: c.targetKind,
      metadata: {},
    };

    if (c.isEcosystem) {
      ecosystem.push(event);
    } else {
      generic.push(event);
    }
  }

  // Sort by priority within each tier
  ecosystem.sort((a, b) => a.priority - b.priority);
  generic.sort((a, b) => a.priority - b.priority);

  return [
    ...ecosystem.slice(0, maxEcosystem),
    ...generic.slice(0, maxGeneric),
  ];
}
