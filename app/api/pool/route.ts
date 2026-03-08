import { NextResponse } from "next/server";
import { formatBalance } from "@/lib/formatBalance";
import { formatPercent, formatUsd } from "@/lib/formatUsd";
import type { PoolPayload, PoolTokenEntry } from "@/lib/types";

const POOL_API_URL = "https://admin-panel.galactica.com/api/pool?chainId=613419";

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

function usdWeightToMetric(valueUSD: number): string {
  const micros = Math.round(valueUSD * 1_000_000);
  return (BigInt(micros) * 1_000_000_000_000n).toString();
}

function formatTokenSupply(raw: string): string {
  return formatBalance(raw, "gUBI");
}

export async function GET() {
  try {
    const upstream = await fetch(POOL_API_URL, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 },
    });

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
        } satisfies PoolPayload,
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (!upstream.ok) {
      throw new Error(`Pool API HTTP ${upstream.status}`);
    }

    const data = (await upstream.json()) as PoolApiResponse;
    const totalWorthUSD = Number(data.totalWorthUSD) || 0;

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
    };

    return NextResponse.json(payload, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[/api/pool] Upstream fetch failed:", err);
    return NextResponse.json(
      { error: "Failed to load gUBI pool data." },
      { status: 500 },
    );
  }
}
