import { Redis } from "@upstash/redis";

/**
 * Singleton Upstash Redis client.
 * Reads UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN from env.
 */
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

/* ── Redis key constants ────────────────────────────────── */

/** JSON wrapper: { updatedAt, wallets[] } */
export const KEY_WALLETS_PAYLOAD = "wallets:payload";

/** Stringified block number */
export const KEY_LAST_PROCESSED_BLOCK = "scanner:lastProcessedBlock";
