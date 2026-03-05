import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 60; // allow ISR cache up to 60s

const RPC_URL =
  process.env.RPC_URL || "https://galactica-mainnet.g.alchemy.com/public";

const CONTRACT = "0x522B3595017537D29258f7F770e78AA5DE1Ec9cB";
const SEL_CLAIMS      = "0x41c61383"; // totalClaims()
const SEL_DISTRIBUTED = "0xd8f163ab"; // totalTokensDistributed()

async function ethCall(data: string): Promise<bigint> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: CONTRACT, data }, "latest"],
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? "RPC error");
  return BigInt(json.result);
}

async function getBalance(): Promise<bigint> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getBalance",
      params: [CONTRACT, "latest"],
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? "RPC error");
  return BigInt(json.result);
}

/**
 * GET /api/faucet
 * Returns total claims count and total GNET distributed from the faucet contract.
 */
export async function GET() {
  try {
    const [claimsRaw, distributedRaw, balanceRaw] = await Promise.all([
      ethCall(SEL_CLAIMS),
      ethCall(SEL_DISTRIBUTED),
      getBalance(),
    ]);

    return NextResponse.json({
      totalClaims: Number(claimsRaw),
      totalDistributed: (Number(distributedRaw) / 1e18).toFixed(2),
      balance: (Number(balanceRaw) / 1e18).toFixed(4),
    });
  } catch (err) {
    console.error("[/api/faucet]", err);
    return NextResponse.json({ error: "Failed to fetch faucet stats" }, { status: 500 });
  }
}
