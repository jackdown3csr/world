import { NextRequest, NextResponse } from "next/server";
import { formatBalance } from "@/lib/formatBalance";
import type { PoolRedeemBasket } from "@/lib/types";

const RPC_URL =
  process.env.RPC_URL || "https://galactica-mainnet.g.alchemy.com/public";

const GUBI_TOKEN = "0xFEa4F549eFB1F8B2cBA8d029e6845Ee431e142AA";
const BALANCE_OF_SEL = "0x70a08231";

function isHexAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

async function erc20BalanceOf(token: string, address: string): Promise<bigint> {
  const paddedAddress = address.slice(2).toLowerCase().padStart(64, "0");
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: token, data: BALANCE_OF_SEL + paddedAddress }, "latest"],
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? "RPC error");
  return BigInt(json.result);
}

export async function GET(req: NextRequest) {
  try {
    const address = req.nextUrl.searchParams.get("address") ?? "";
    const supply = req.nextUrl.searchParams.get("supply") ?? "0";
    const wgnet = req.nextUrl.searchParams.get("wgnet") ?? "0";
    const archai = req.nextUrl.searchParams.get("archai") ?? "0";

    if (!isHexAddress(address)) {
      return NextResponse.json({ error: "Invalid address." }, { status: 400 });
    }

    const totalSupply = BigInt(supply);
    if (totalSupply === 0n) {
      return NextResponse.json(null, { status: 200 });
    }

    const userGubiBalance = await erc20BalanceOf(GUBI_TOKEN, address);
    if (userGubiBalance === 0n) {
      return NextResponse.json(null, { status: 200 });
    }

    const vaultWgnet = BigInt(wgnet);
    const vaultArchai = BigInt(archai);
    const redeemWgnet = (userGubiBalance * vaultWgnet) / totalSupply;
    const redeemArchai = (userGubiBalance * vaultArchai) / totalSupply;

    const payload: PoolRedeemBasket = {
      userGubiBalance: userGubiBalance.toString(),
      userGubiFormatted: formatBalance(userGubiBalance.toString(), "gUBI"),
      redeemWgnet: redeemWgnet.toString(),
      redeemWgnetFormatted: formatBalance(redeemWgnet.toString(), "WGNET"),
      redeemArchai: redeemArchai.toString(),
      redeemArchaiFormatted: formatBalance(redeemArchai.toString(), "Archai"),
    };

    return NextResponse.json(payload, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to load redeem basket." },
      { status: 500 },
    );
  }
}