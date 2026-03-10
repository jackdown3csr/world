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

/* ── Vesting system types ────────────────────────────────── */

/**
 * One claimant in the vesting / RewardDistributor system.
 * Extends WalletEntry so it can be passed to the shared layout builder.
 * The `votingPower` field is repurposed to hold `totalEntitled` for
 * rank ordering (the layout builder sorts by this value).
 */
export interface VestingWalletEntry extends WalletEntry {
  /** Raw wei string of total vesting reward the address is entitled to */
  totalEntitled: string;
  totalEntitledFormatted: string;
  /** Raw wei string of total reward already claimed */
  totalClaimed: string;
  totalClaimedFormatted: string;
  /** Last epoch in which this address claimed */
  lastClaimedEpoch: number;
  /** Raw wei string of unclaimed (claimable right now) reward */
  unclaimedReward: string;
  unclaimedRewardFormatted: string;
}

export interface VestingPayload {
  updatedAt: number; // unix ms
  currentEpoch?: number;
  wallets: VestingWalletEntry[];
}

/* ── gUBI pool types ─────────────────────────────────────── */

export interface PoolTokenEntry extends WalletEntry {
  symbol: string;
  balance: string;
  balanceFormatted: string;
  priceUSD: number;
  priceUSDFormatted: string;
  valueUSD: number;
  valueUSDFormatted: string;
  shareOfPool: number;
  shareOfPoolFormatted: string;
}

export interface PoolPayload {
  updatedAt: number;
  totalWorthUSD: number;
  totalWorthFormatted: string;
  gubiPriceUSD: number;
  gubiPriceFormatted: string;
  supply: string;
  supplyFormatted: string;
  tokens: PoolTokenEntry[];
}

/* ── Bridge telemetry types ─────────────────────────────── */

export type BridgeTransferDirection = "outbound" | "inbound";

export interface BridgeTransferEntry {
  txHash: string;
  blockNumber: number;
  timestamp: number;
  direction: BridgeTransferDirection;
  sender: string;
  recipient: string;
  amountRaw: string | null;
  amountFormatted: string | null;
}

/* ── Hyperlane bridge types ─────────────────────────────── */

export type HyperlaneTransferDirection = BridgeTransferDirection;

export interface HyperlaneTransferEntry extends BridgeTransferEntry {
  messageId: string;
  originDomain: number;
  destinationDomain: number;
}

export interface CanonicalBridgeTransferEntry extends BridgeTransferEntry {
  settlementLayer: "ethereum";
  relayLayer: "arbitrum-one";
  mechanism: "withdrawEth";
}

export interface HyperlaneBridgePayload {
  updatedAt: number;
  scannedThroughBlock: number;
  routeLabel: string;
  recentTransfers: number;
  lastTransferAt: number | null;
  outboundRecentTransfers: number;
  inboundRecentTransfers: number;
  historicalOutboundTransfers: number;
  historicalInboundTransfers: number;
  historicalOutboundAmountRaw: string;
  historicalInboundAmountRaw: string;
  lastOutboundAt: number | null;
  lastInboundAt: number | null;
  status: "standby" | "active" | "quiet";
  statusLabel: string;
  throughputLabel: string;
  transfers: HyperlaneTransferEntry[];
  outboundTransfers: HyperlaneTransferEntry[];
  inboundTransfers: HyperlaneTransferEntry[];
}

export interface CanonicalBridgePayload {
  updatedAt: number;
  scannedThroughBlock: number;
  routeLabel: string;
  recentTransfers: number;
  lastTransferAt: number | null;
  outboundRecentTransfers: number;
  inboundRecentTransfers: number;
  historicalOutboundTransfers: number;
  historicalInboundTransfers: number;
  historicalOutboundAmountRaw: string;
  historicalInboundAmountRaw: string;
  lastOutboundAt: number | null;
  lastInboundAt: number | null;
  status: "standby" | "active" | "quiet";
  statusLabel: string;
  throughputLabel: string;
  transfers: CanonicalBridgeTransferEntry[];
  outboundTransfers: CanonicalBridgeTransferEntry[];
  inboundTransfers: CanonicalBridgeTransferEntry[];
}

/* ── Staking remnant types ─────────────────────────────── */

export interface StakingRemnantPayload {
  updatedAt: number;
  proxyAddress: string;
  implementationAddress: string;
  ownerAddress: string;
  stakingTokenAddress: string;
  nativeBalanceRaw: string;
  nativeBalanceFormatted: string;
  totalStakedRaw: string;
  totalStakedFormatted: string;
  rewardPerTokenStoredRaw: string;
  lastUpdateTime: number;
  lastUpdateLabel: string;
  frozenSeconds: number;
  frozenLabel: string;
  status: "active" | "inactive" | "draining";
  statusLabel: string;
  rewardStateLabel: string;
}
