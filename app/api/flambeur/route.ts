// app/api/flambeur/route.ts
// FEATURE: Flambeur Star System

import { NextResponse } from "next/server";
import { redis, KEY_FLAMBEUR_PAYLOAD, KEY_PLANET_NAMES } from "@/lib/redis";
import type { FlambeurPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [data, names] = await Promise.all([
      redis.get<FlambeurPayload>(KEY_FLAMBEUR_PAYLOAD),
      redis.hgetall<Record<string, string>>(KEY_PLANET_NAMES),
    ]);

    if (!data) {
      return NextResponse.json(
        { updatedAt: Date.now(), wallets: [] } satisfies FlambeurPayload,
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    }

    const wallets = data.wallets.map((w) => ({
      ...w,
      customName: names?.[w.address.toLowerCase()] || w.customName,
    }));

    return NextResponse.json(
      { ...data, wallets },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to read flambeur data from storage." },
      { status: 500 },
    );
  }
}
