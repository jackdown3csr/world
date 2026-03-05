import { NextResponse } from "next/server";
import { redis, KEY_VESTING_PAYLOAD, KEY_PLANET_NAMES } from "@/lib/redis";
import type { VestingPayload } from "@/lib/types";

/**
 * GET /api/vesting
 *
 * Reads the vesting:payload key from Upstash Redis and returns it.
 * Never calls the blockchain RPC — purely a Redis read.
 *
 * Planet names are merged in from the shared KEY_PLANET_NAMES hash so that
 * addresses appearing in both staking and vesting share the same custom name.
 */
export async function GET() {
  try {
    const [data, names] = await Promise.all([
      redis.get<VestingPayload>(KEY_VESTING_PAYLOAD),
      redis.hgetall<Record<string, string>>(KEY_PLANET_NAMES),
    ]);

    if (!data) {
      return NextResponse.json(
        { updatedAt: Date.now(), wallets: [] } satisfies VestingPayload,
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    }

    const wallets = data.wallets.map((w) => ({
      ...w,
      customName: names?.[w.address.toLowerCase()] || w.customName,
    }));

    return NextResponse.json({ ...data, wallets }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[/api/vesting] Redis read failed:", err);
    return NextResponse.json(
      { error: "Failed to read vesting data from storage." },
      { status: 500 },
    );
  }
}
