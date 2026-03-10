import { NextResponse } from "next/server";
import { classifyTransactions } from "@/lib/blockExplorer/classifyTransactions";
import type { BlockExplorerApiResponse } from "@/lib/blockExplorer/types";

export const dynamic = "force-dynamic";

const RPC_URL =
  process.env.RPC_URL || "https://galactica-mainnet.g.alchemy.com/public";

/** Max transactions to return in the response (ecosystem first, generic fill). */
const MAX_ECOSYSTEM = 50;
const MAX_GENERIC   = 25;

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
 * GET /api/block/txs?block=<number|latest>
 *
 * Fetches the full transaction list for a block, classifies them into
 * normalized explorer events (ecosystem-first, generic fill), and returns
 * the result.
 *
 * Only reads from the chain — no Redis, no side effects.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const blockParam = searchParams.get("block") ?? "latest";

    const hexBlock: string =
      blockParam === "latest"
        ? await rpc("eth_blockNumber")
        : "0x" + Number(blockParam).toString(16);

    const blockNumber = parseInt(hexBlock, 16);

    // Fetch full block with transactions (second param = true)
    const block = await rpc("eth_getBlockByNumber", [hexBlock, true]);

    if (!block) {
      return NextResponse.json(
        { error: "Block not found" },
        { status: 404 },
      );
    }

    const blockTimestamp: number = block.timestamp
      ? parseInt(block.timestamp, 16)
      : Math.floor(Date.now() / 1000);

    const rawTxs: Array<{
      hash: string;
      from: string;
      to: string | null;
      value: string;
      input: string;
    }> = Array.isArray(block.transactions) ? block.transactions : [];

    const events = classifyTransactions(
      rawTxs,
      blockNumber,
      blockTimestamp,
      MAX_ECOSYSTEM,
      MAX_GENERIC,
    );

    const response: BlockExplorerApiResponse = {
      blockNumber,
      blockTimestamp,
      events,
    };

    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "RPC unavailable" }, { status: 503 });
  }
}
