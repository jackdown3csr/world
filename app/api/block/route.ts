import { NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // never cache this route

const RPC_URL =
  process.env.RPC_URL || "https://galactica-mainnet.g.alchemy.com/public";

async function rpc(method: string, params: unknown[] = []) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? "RPC error");
  return json.result;
}

/**
 * GET /api/block
 * Returns the latest block number and its Unix timestamp.
 * Lightweight — two cheap RPC calls, no Redis.
 */
export async function GET() {
  try {
    const hexBlock: string = await rpc("eth_blockNumber");
    const blockNumber = parseInt(hexBlock, 16);

    const block = await rpc("eth_getBlockByNumber", [hexBlock, false]);
    const blockTimestamp: number = block?.timestamp
      ? parseInt(block.timestamp, 16)
      : Math.floor(Date.now() / 1000);

    return NextResponse.json(
      { blockNumber, blockTimestamp },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[/api/block]", err);
    return NextResponse.json({ error: "RPC unavailable" }, { status: 503 });
  }
}
