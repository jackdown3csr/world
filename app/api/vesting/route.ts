import { NextResponse } from "next/server";
import { Interface } from "ethers";
import { redis, KEY_VESTING_PAYLOAD, KEY_PLANET_NAMES } from "@/lib/redis";
import type { VestingPayload } from "@/lib/types";

const RPC_URL =
  process.env.RPC_URL || "https://galactica-mainnet.g.alchemy.com/public";

const REWARD_DISTRIBUTOR = "0x80BCB71F63f11344F5483d108374fa394A587AbE";
const rdInterface = new Interface([
  "function currentEpoch() view returns (uint64)",
]);

async function fetchCurrentEpoch(): Promise<number> {
  const data = rdInterface.encodeFunctionData("currentEpoch");
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: REWARD_DISTRIBUTOR, data }, "latest"],
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? "RPC error");
  return Number(BigInt(json.result));
}

/**
 * GET /api/vesting
 *
 * Reads the vesting:payload key from Upstash Redis and returns it.
 * Also refreshes currentEpoch directly from RewardDistributor so the epoch
 * satellite stays current even when claimant payloads lag behind.
 *
 * Planet names are merged in from the shared KEY_PLANET_NAMES hash so that
 * addresses appearing in both staking and vesting share the same custom name.
 */
export async function GET() {
  try {
    const [data, names, liveCurrentEpoch] = await Promise.all([
      redis.get<VestingPayload>(KEY_VESTING_PAYLOAD),
      redis.hgetall<Record<string, string>>(KEY_PLANET_NAMES),
      fetchCurrentEpoch().catch(() => 0),
    ]);

    if (!data) {
      return NextResponse.json(
        { updatedAt: Date.now(), currentEpoch: liveCurrentEpoch, wallets: [] } satisfies VestingPayload,
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    }

    const wallets = data.wallets.map((w) => ({
      ...w,
      customName: names?.[w.address.toLowerCase()] || w.customName,
    }));

    return NextResponse.json({
      ...data,
      currentEpoch: liveCurrentEpoch || data.currentEpoch || 0,
      wallets,
    }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to read vesting data from storage." },
      { status: 500 },
    );
  }
}
