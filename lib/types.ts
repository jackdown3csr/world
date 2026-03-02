/**
 * Shared TypeScript types for the wallet data payload.
 */

export type WalletTier = "planet" | "moon" | "ring" | "asteroid";
export type PlanetSubtype = "gas_giant" | "ice_giant" | "terrestrial" | "rocky";

export interface WalletEntry {
  address: string;
  /** Optional user-defined planet name for this wallet */
  customName?: string;
  /** Raw wei string of GNET locked in VotingEscrow */
  lockedGnet: string;
  lockedFormatted: string;
  /** Unix timestamp when the lock expires (0 = expired / none) */
  lockEnd: number;
  /** Raw wei string of current veGNET voting power */
  votingPower: string;
  votingPowerFormatted: string;
  /** Block number where this address first appeared */
  firstSeenBlock: number;
  /** Unix timestamp (seconds) of that block */
  firstSeenTimestamp: number;

  /* ── Tier tracking (set by scanner) ───────────────────── */
  /** Current tier based on votingPower rank */
  tier?: WalletTier;
  /** 1-based rank within the full sorted list */
  rank?: number;
  /** Subtype for planets only (rank 1-20) */
  planetSubtype?: PlanetSubtype;
  /** Persistent orbit slot for planets (0-19), stable across refreshes */
  orbitSlot?: number;
}

export interface WalletsPayload {
  updatedAt: number; // unix ms
  wallets: WalletEntry[];
}
