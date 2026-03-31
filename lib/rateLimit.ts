/**
 * Redis-based per-IP rate limiter.
 * No React, no Three.js.
 */
import { redis } from "./redis";

export class RateLimitError extends Error {
  readonly retryAfter: number;
  constructor(retryAfter: number) {
    super("rate_limited");
    this.retryAfter = retryAfter;
  }
}

/**
 * Throws RateLimitError when the caller exceeds `max` requests in `windowSec` seconds.
 * Uses atomic INCR + conditional EXPIRE so the window resets naturally.
 */
export async function rateLimit(
  key: string,
  max: number,
  windowSec: number,
): Promise<void> {
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, windowSec);
  }
  if (count > max) {
    const ttl = await redis.ttl(key);
    throw new RateLimitError(ttl > 0 ? ttl : windowSec);
  }
}

/** Extract best-effort client IP from Next.js request headers. */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}
