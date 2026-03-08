import { Redis } from "@upstash/redis";

/**
 * Singleton Upstash Redis client.
 * Supports both direct env (UPSTASH_REDIS_REST_*) and
 * Vercel KV integration env (KV_REST_API_*).
 */
export const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL   || "",
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "",
});

/* ── Redis key constants ────────────────────────────────── */

/** JSON wrapper: { updatedAt, wallets[] } */
export const KEY_WALLETS_PAYLOAD = "wallets:payload";

/** Stringified block number */
export const KEY_LAST_PROCESSED_BLOCK = "scanner:lastProcessedBlock";

/** Hash map: address(lowercase) -> custom planet name */
export const KEY_PLANET_NAMES = "planet:names";

/** Hash map: address(lowercase) -> JSON { tier, rank, planetSubtype? } */
export const KEY_WALLET_TIERS = "wallet:tiers";

/** Hash map: address(lowercase) -> orbit slot index (0-19). Persistent across refreshes. */
export const KEY_PLANET_ORBITS = "planet:orbits";

/** JSON wrapper: { updatedAt, wallets[] } for the vesting / RewardDistributor system */
export const KEY_VESTING_PAYLOAD = "vesting:payload";

/** JSON wrapper: Hyperlane bridge snapshot payload */
export const KEY_HYPERLANE_BRIDGE_PAYLOAD = "bridge:hyperlane:payload";

/** Stringified block number for incremental Hyperlane mailbox scans */
export const KEY_HYPERLANE_LAST_PROCESSED_BLOCK =
  "bridge:hyperlane:lastProcessedBlock";

/** JSON wrapper: Canonical bridge snapshot payload */
export const KEY_CANONICAL_BRIDGE_PAYLOAD = "bridge:canonical:payload";

/** Stringified block number for incremental Canonical bridge scans */
export const KEY_CANONICAL_LAST_PROCESSED_BLOCK =
  "bridge:canonical:lastProcessedBlock";

/** Prefix for temporary SIWE-like nonces: auth:nonce:<address> */
export const KEY_AUTH_NONCE_PREFIX = "auth:nonce:";
