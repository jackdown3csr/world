import { NextResponse } from "next/server";
import { formatBalance } from "@/lib/formatBalance";
import { formatPercent, formatUsd } from "@/lib/formatUsd";
import type { PoolPayload, PoolTokenEntry } from "@/lib/types";

const POOL_API_URL = "https://admin-panel.galactica.com/api/pool?chainId=613419";
const STATS_API_URL = "https://admin-panel.galactica.com/api/stats?chainId=613419";

const RPC_URL =
  process.env.RPC_URL || "https://galactica-mainnet.g.alchemy.com/public";

const POOL_VAULT = "0x50AF2AAb1455C1C06B3b8e623549dDE437F54EeF";
const WGNET_TOKEN = "0x690F1eEf8AcEaD09Ac695d9111Af081045c6d5b7";
const ARCHAI_TOKEN = "0x22b48a764d2aAAe14d751aD2B5fcdf6C0A4d95D7";

// ERC-20 balanceOf(address) selector
const BALANCE_OF_SEL = "0x70a08231";
const PADDED_VAULT = POOL_VAULT.slice(2).toLowerCase().padStart(64, "0");

async function erc20BalanceOf(token: string): Promise<bigint> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: token, data: BALANCE_OF_SEL + PADDED_VAULT }, "latest"],
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? "RPC error");
  return BigInt(json.result);
}

interface PoolApiToken {
  address: string;
  symbol: string;
  balance: string;
  priceUSD: number;
  valueUSD: number;
}

interface PoolApiResponse {
  totalWorthUSD: number;
  gubiPrice: string;
  supply: string;
  composition: PoolApiToken[];
}

interface StatsApiResponse {
  totalUsers: number;
  totalDistributed: string;
  dailyDistribution: string;
  lastUpdated: string;
  totalReputation: number;
  totalMonthlyEmission: string;
  emissionPerRepPoint: string;
}

function usdWeightToMetric(valueUSD: number): string {
  const micros = Math.round(valueUSD * 1_000_000);
  return (BigInt(micros) * 1_000_000_000_000n).toString();
}

function formatTokenSupply(raw: string): string {
  return formatBalance(raw, "gUBI");
}

function formatWholeTokenAmount(raw: string, unit: string): string {
  const value = Number(raw);
  if (!Number.isFinite(value) || value === 0) return `0 ${unit}`;
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${unit}`;
}

export async function GET() {
  try {
    const [upstream, statsUpstream, vaultResult] = await Promise.all([
      fetch(POOL_API_URL, {
        headers: { Accept: "application/json" },
        next: { revalidate: 60 },
      }),
      fetch(STATS_API_URL, {
        headers: { Accept: "application/json" },
        next: { revalidate: 60 },
      }).catch(() => null),
      Promise.all([
        erc20BalanceOf(WGNET_TOKEN),
        erc20BalanceOf(ARCHAI_TOKEN),
      ]).catch(() => null),
    ]);

    if (upstream.status === 404) {
      return NextResponse.json(
        {
          updatedAt: Date.now(),
          totalWorthUSD: 0,
          totalWorthFormatted: "$0.00",
          gubiPriceUSD: 0,
          gubiPriceFormatted: "$0.000000",
          supply: "0",
          supplyFormatted: "0 gUBI",
          tokens: [],
          stats: null,
          vault: null,
        } satisfies PoolPayload,
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (!upstream.ok) {
      throw new Error(`Pool API HTTP ${upstream.status}`);
    }

    const data = (await upstream.json()) as PoolApiResponse;
    const totalWorthUSD = Number(data.totalWorthUSD) || 0;

    let stats: PoolPayload["stats"] = null;
    if (statsUpstream?.ok) {
      try {
        const raw = (await statsUpstream.json()) as StatsApiResponse;
        stats = {
          totalUsers: raw.totalUsers ?? 0,
          dailyDistribution: formatWholeTokenAmount(raw.dailyDistribution ?? "0", "gUBI"),
          totalMonthlyEmission: formatWholeTokenAmount(raw.totalMonthlyEmission ?? "0", "gUBI"),
          emissionPerRepPoint: raw.emissionPerRepPoint ?? "0",
        };
      } catch { /* stats are optional — ignore parse failures */ }
    }

    let vault: PoolPayload["vault"] = null;
    if (vaultResult) {
      const [wgnetBal, archaiBal] = vaultResult;
      vault = {
        wgnet: wgnetBal.toString(),
        wgnetFormatted: formatBalance(wgnetBal.toString(), "WGNET"),
        archai: archaiBal.toString(),
        archaiFormatted: formatBalance(archaiBal.toString(), "Archai"),
      };
    }

    const tokens: PoolTokenEntry[] = (data.composition ?? []).map((token) => {
      const valueUSD = Number(token.valueUSD) || 0;
      const priceUSD = Number(token.priceUSD) || 0;
      const shareOfPool = totalWorthUSD > 0 ? (valueUSD / totalWorthUSD) * 100 : 0;

      return {
        address: token.address,
        customName: token.symbol,
        lockedGnet: token.balance,
        lockedFormatted: formatBalance(token.balance, token.symbol),
        lockEnd: 0,
        votingPower: usdWeightToMetric(valueUSD),
        votingPowerFormatted: formatUsd(valueUSD),
        firstSeenBlock: 0,
        firstSeenTimestamp: 0,
        symbol: token.symbol,
        balance: token.balance,
        balanceFormatted: formatBalance(token.balance, token.symbol),
        priceUSD,
        priceUSDFormatted: formatUsd(priceUSD, 6),
        valueUSD,
        valueUSDFormatted: formatUsd(valueUSD),
        shareOfPool,
        shareOfPoolFormatted: formatPercent(shareOfPool),
      };
    });

    const payload: PoolPayload = {
      updatedAt: Date.now(),
      totalWorthUSD,
      totalWorthFormatted: formatUsd(totalWorthUSD),
      gubiPriceUSD: Number(data.gubiPrice) || 0,
      gubiPriceFormatted: formatUsd(Number(data.gubiPrice) || 0, 6),
      supply: data.supply,
      supplyFormatted: formatTokenSupply(data.supply),
      tokens,
      stats,
      vault,
    };

    return NextResponse.json(payload, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to load gUBI pool data." },
      { status: 500 },
    );
  }
}
