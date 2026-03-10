import { NextResponse } from "next/server";
import { getAddress, isAddress, verifyMessage } from "ethers";
import {
  redis,
  KEY_PLANET_NAMES,
  KEY_AUTH_NONCE_PREFIX,
} from "@/lib/redis";

function buildRenameMessage(address: string, name: string, nonce: string) {
  return [
    "Sector Galactica - Rename Planet",
    `Address: ${address}`,
    `Name: ${name}`,
    `Nonce: ${nonce}`,
  ].join("\n");
}

/**
 * PUT /api/planet-name
 * body: { address, name, signature }
 *
 * Verifies wallet signature and stores custom planet name in Redis.
 */
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const rawAddress = String(body?.address || "").trim();
    const rawName = String(body?.name || "").trim();
    const signature = String(body?.signature || "").trim();

    if (!isAddress(rawAddress)) {
      return NextResponse.json({ error: "Invalid address" }, { status: 400 });
    }
    if (!signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }

    const address = getAddress(rawAddress);
    const keyAddress = address.toLowerCase();

    if (rawName.length < 1 || rawName.length > 32) {
      return NextResponse.json(
        { error: "Name must be 1-32 characters" },
        { status: 400 },
      );
    }

    const nonceKey = `${KEY_AUTH_NONCE_PREFIX}${keyAddress}`;
    const nonce = await redis.get<string>(nonceKey);
    if (!nonce) {
      return NextResponse.json(
        { error: "Missing or expired nonce" },
        { status: 401 },
      );
    }

    const msg = buildRenameMessage(address, rawName, nonce);
    const recovered = getAddress(verifyMessage(msg, signature));

    if (recovered !== address) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    await redis.hset(KEY_PLANET_NAMES, { [keyAddress]: rawName });
    await redis.del(nonceKey);

    return NextResponse.json({ ok: true, name: rawName }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Failed to save planet name" },
      { status: 500 },
    );
  }
}
