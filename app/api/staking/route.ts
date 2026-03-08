import { NextResponse } from "next/server";
import { formatBalance } from "@/lib/formatBalance";
import type { StakingRemnantPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

const RPC_URL =
  process.env.RPC_URL || "https://galactica-mainnet.g.alchemy.com/public";

const STAKING_PROXY = "0x90b07e15cfb173726de904ca548dd96f73c12428";
const STAKING_IMPLEMENTATION = "0xcca0ef64cc1f2b4c44333b92e6f1336be0002293";
const STAKING_TOKEN = "0x690F1eEf8AcEaD09Ac695d9111Af081045c6d5b7";

const SELECTOR_TOTAL_STAKED = "0x8b0e9f3f";
const SELECTOR_REWARD_PER_TOKEN_STORED = "0xdf136d65";
const SELECTOR_LAST_UPDATE_TIME = "0xc8f33c91";
const SELECTOR_LAST_TIME_REWARD_APPLICABLE = "0x80faa57d";
const SELECTOR_OWNER = "0x8da5cb5b";

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

async function ethCall(data: string) {
  return (await rpc("eth_call", [{ to: STAKING_PROXY, data }, "latest"])) as string;
}

function parseUint(hex: string) {
  return BigInt(hex || "0x0");
}

function parseAddress(hex: string) {
  const stripped = (hex || "0x").replace(/^0x/, "").padStart(64, "0");
  return `0x${stripped.slice(-40)}`;
}

function formatFrozenLabel(frozenSeconds: number) {
  const days = frozenSeconds / 86400;
  if (days >= 10) return `${days.toFixed(0)}d frozen`;
  if (days >= 1) return `${days.toFixed(1)}d frozen`;
  const hours = frozenSeconds / 3600;
  return `${hours.toFixed(1)}h frozen`;
}

export async function GET() {
  try {
    const nowSec = Math.floor(Date.now() / 1000);

    const [nativeBalanceHex, totalStakedHex, rewardPerTokenStoredHex, lastUpdateTimeHex, lastApplicableHex, ownerHex] = await Promise.all([
      rpc("eth_getBalance", [STAKING_PROXY, "latest"]),
      ethCall(SELECTOR_TOTAL_STAKED),
      ethCall(SELECTOR_REWARD_PER_TOKEN_STORED),
      ethCall(SELECTOR_LAST_UPDATE_TIME),
      ethCall(SELECTOR_LAST_TIME_REWARD_APPLICABLE),
      ethCall(SELECTOR_OWNER),
    ]);

    const nativeBalanceRaw = parseUint(nativeBalanceHex as string).toString();
    const totalStakedRaw = parseUint(totalStakedHex).toString();
    const rewardPerTokenStoredRaw = parseUint(rewardPerTokenStoredHex).toString();
    const lastUpdateTime = Number(parseUint(lastUpdateTimeHex));
    const lastApplicableTime = Number(parseUint(lastApplicableHex));
    const frozenSeconds = Math.max(0, nowSec - Math.max(lastUpdateTime, lastApplicableTime));
    const ownerAddress = parseAddress(ownerHex);

    const status: StakingRemnantPayload["status"] = frozenSeconds > 3600
      ? (BigInt(nativeBalanceRaw) > 0n ? "draining" : "inactive")
      : "active";

    const payload: StakingRemnantPayload = {
      updatedAt: Date.now(),
      proxyAddress: STAKING_PROXY,
      implementationAddress: STAKING_IMPLEMENTATION,
      ownerAddress,
      stakingTokenAddress: STAKING_TOKEN,
      nativeBalanceRaw,
      nativeBalanceFormatted: formatBalance(nativeBalanceRaw, "GNET"),
      totalStakedRaw,
      totalStakedFormatted: formatBalance(totalStakedRaw, "GNET"),
      rewardPerTokenStoredRaw,
      lastUpdateTime,
      lastUpdateLabel: new Date(lastUpdateTime * 1000).toLocaleString(),
      frozenSeconds,
      frozenLabel: formatFrozenLabel(frozenSeconds),
      status,
      statusLabel: status === "draining"
        ? "frozen shell draining"
        : status === "inactive"
          ? "staking exhausted"
          : "staking active",
      rewardStateLabel: status === "active"
        ? "new rewards still accrue"
        : "no new rewards; only exits remain",
    };

    return NextResponse.json(payload, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[/api/staking]", err);
    return NextResponse.json(
      { error: "Staking telemetry unavailable" },
      { status: 503 },
    );
  }
}
