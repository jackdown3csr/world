import { NextResponse } from "next/server";
import { redis, KEY_WALLETS_PAYLOAD } from "@/lib/redis";
import type { WalletsPayload } from "@/lib/types";

/**
 * GET /api/wallets
 *
 * Reads the wallets:payload key from Upstash Redis and returns it.
 * Never calls the blockchain RPC — purely a Redis read.
 */
export async function GET() {
  try {
    const data = await redis.get<WalletsPayload>(KEY_WALLETS_PAYLOAD);

    if (!data) {
      return NextResponse.json(
        { updatedAt: Date.now(), wallets: [] } satisfies WalletsPayload,
        {
          status: 200,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    return NextResponse.json(data, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[/api/wallets] Redis read failed:", err);
    return NextResponse.json(
      { error: "Failed to read wallet data from storage." },
      { status: 500 },
    );
  }
}
