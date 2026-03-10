import { NextResponse } from "next/server";
import {
  redis,
  KEY_WALLETS_PAYLOAD,
  KEY_PLANET_NAMES,
  KEY_PLANET_ORBITS,
} from "@/lib/redis";
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
    const [names, orbits] = await Promise.all([
      redis.hgetall<Record<string, string>>(KEY_PLANET_NAMES),
      redis.hgetall<Record<string, string>>(KEY_PLANET_ORBITS),
    ]);

    if (!data) {
      return NextResponse.json(
        { updatedAt: Date.now(), wallets: [] } satisfies WalletsPayload,
        {
          status: 200,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    const wallets = data.wallets.map((w) => {
      const key = w.address.toLowerCase();
      const orbitSlot = orbits?.[key] != null ? Number(orbits[key]) : undefined;
      return {
        ...w,
        customName: names?.[key] || w.customName,
        ...(orbitSlot !== undefined ? { orbitSlot } : {}),
      };
    });

    return NextResponse.json({ ...data, wallets }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to read wallet data from storage." },
      { status: 500 },
    );
  }
}
