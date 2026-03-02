import { NextResponse } from "next/server";
import { getAddress, isAddress, randomBytes, hexlify } from "ethers";
import { redis, KEY_AUTH_NONCE_PREFIX } from "@/lib/redis";

/**
 * POST /api/auth/nonce
 * body: { address: string }
 *
 * Issues a short-lived nonce for signature-based wallet auth.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rawAddress = String(body?.address || "").trim();

    if (!isAddress(rawAddress)) {
      return NextResponse.json({ error: "Invalid address" }, { status: 400 });
    }

    const address = getAddress(rawAddress).toLowerCase();
    const nonce = hexlify(randomBytes(16));

    await redis.set(`${KEY_AUTH_NONCE_PREFIX}${address}`, nonce, { ex: 600 });

    return NextResponse.json({ nonce }, { status: 200 });
  } catch (err) {
    console.error("[/api/auth/nonce] failed:", err);
    return NextResponse.json(
      { error: "Failed to issue nonce" },
      { status: 500 },
    );
  }
}
