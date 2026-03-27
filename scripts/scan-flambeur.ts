// scripts/scan-flambeur.ts
// FEATURE: Flambeur Star System

import { config } from "dotenv";
config({ path: ".env.local" });

import { id as keccak256Id } from "ethers";
import { Redis } from "@upstash/redis";
import { formatBalance } from "../lib/formatBalance";
import type { FlambeurEntry, FlambeurPayload, WalletTier } from "../lib/types";

const GUBINATOR     = "0x5b8b96F1828B27165705be802BDCfC79FB8E2ceA";
const SWAPPED_TOPIC = keccak256Id("Swapped(address,uint256,uint256,bytes32)");
const RPC_URL       = process.env.RPC_URL || "https://galactica-mainnet.g.alchemy.com/public";
const UPSTASH_URL   = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!UPSTASH_URL || !UPSTASH_TOKEN) {
  console.error("Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN");
  process.exit(1);
}

const redis     = new Redis({ url: UPSTASH_URL, token: UPSTASH_TOKEN });
const IS_SEED   = process.env.SEED === "true";
const LOG_CHUNK = 10_000;

const KEY_PAYLOAD    = "flambeur:payload";
const KEY_LAST_BLOCK = "flambeur:lastProcessedBlock";
const PLANET_COUNT   = 9;

function tierByRank(rank1: number): WalletTier {
  return rank1 <= PLANET_COUNT ? "planet" : "moon";
}

async function rpc(method: string, params: unknown[] = []): Promise<unknown> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json() as { result: unknown; error?: { message: string } };
  if (json.error) throw new Error(json.error.message ?? "RPC error");
  return json.result;
}

interface RawLog {
  blockNumber: string;
  topics:      string[];
  data:        string;
}

async function getLatestBlock(): Promise<number> {
  return Number(BigInt(await rpc("eth_blockNumber") as string));
}

async function fetchLogs(from: number, to: number): Promise<RawLog[]> {
  return await rpc("eth_getLogs", [{
    address:   GUBINATOR,
    topics:    [SWAPPED_TOPIC],
    fromBlock: `0x${from.toString(16)}`,
    toBlock:   `0x${to.toString(16)}`,
  }]) as RawLog[];
}

interface SwapAgg {
  gubiTotal:  bigint;
  wgnetTotal: bigint;
  count:      number;
  biggest:    bigint;
  firstBlock: number;
}

/* ABI-encode wgnetReserve() call: keccak256("wgnetReserve()")[0..4] = 0x0c3588b4 */
async function fetchWgnetReserve(): Promise<bigint> {
  const result = await rpc("eth_call", [{ to: GUBINATOR, data: "0x0c3588b4" }, "latest"]) as string;
  return BigInt(result);
}

async function main() {
  const latestBlock = await getLatestBlock();

  let fromBlock = 0;
  if (!IS_SEED) {
    const saved = await redis.get<string>(KEY_LAST_BLOCK);
    if (saved) fromBlock = Number(saved) + 1;
  }

  const aggMap = new Map<string, SwapAgg>();

  if (!IS_SEED) {
    const existing = await redis.get<FlambeurPayload>(KEY_PAYLOAD);
    if (existing) {
      for (const w of existing.wallets) {
        aggMap.set(w.address.toLowerCase(), {
          gubiTotal:  BigInt(w.totalGubiSwapped),
          wgnetTotal: BigInt(w.totalWgnetReceived),
          count:      w.swapCount,
          biggest:    BigInt(w.biggestSwapGubi),
          firstBlock: w.firstSeenBlock,
        });
      }
    }
  }

  console.log(`Scanning blocks ${fromBlock}–${latestBlock}...`);
  let scanned = 0;

  for (let start = fromBlock; start <= latestBlock; start += LOG_CHUNK) {
    const end  = Math.min(start + LOG_CHUNK - 1, latestBlock);
    const logs = await fetchLogs(start, end);
    scanned   += logs.length;

    for (const log of logs) {
      const userAddr = ("0x" + log.topics[1].slice(26)).toLowerCase();
      const gubiIn   = BigInt("0x" + log.data.slice(2, 66));
      const wgnetOut = BigInt("0x" + log.data.slice(66, 130));
      const blockNum = Number(BigInt(log.blockNumber));

      const agg = aggMap.get(userAddr);
      if (agg) {
        agg.gubiTotal  += gubiIn;
        agg.wgnetTotal += wgnetOut;
        agg.count      += 1;
        if (gubiIn > agg.biggest) agg.biggest = gubiIn;
      } else {
        aggMap.set(userAddr, {
          gubiTotal:  gubiIn,
          wgnetTotal: wgnetOut,
          count:      1,
          biggest:    gubiIn,
          firstBlock: blockNum,
        });
      }
    }

    console.log(`  ${start}–${end}: ${logs.length} events`);
  }

  console.log(`Total: ${scanned} swaps, ${aggMap.size} unique addresses.`);

  const sorted = [...aggMap.entries()].sort(
    ([, a], [, b]) => (b.gubiTotal > a.gubiTotal ? 1 : b.gubiTotal < a.gubiTotal ? -1 : 0),
  );

  const wallets: FlambeurEntry[] = sorted.map(([address, agg], idx) => {
    const rank1 = idx + 1;
    const tier: WalletTier = tierByRank(rank1);
    return {
      address,
      lockedGnet:                  agg.gubiTotal.toString(),
      lockedFormatted:             formatBalance(agg.gubiTotal.toString(), "gUBI"),
      votingPower:                 agg.gubiTotal.toString(),
      votingPowerFormatted:        formatBalance(agg.gubiTotal.toString(), "gUBI"),
      lockEnd:                     0,
      firstSeenBlock:              agg.firstBlock,
      firstSeenTimestamp:          0,
      tier,
      rank:                        rank1,
      totalGubiSwapped:            agg.gubiTotal.toString(),
      totalGubiSwappedFormatted:   formatBalance(agg.gubiTotal.toString(), "gUBI"),
      totalWgnetReceived:          agg.wgnetTotal.toString(),
      totalWgnetReceivedFormatted: formatBalance(agg.wgnetTotal.toString(), "WGNET"),
      swapCount:                   agg.count,
      biggestSwapGubi:             agg.biggest.toString(),
      biggestSwapGubiFormatted:    formatBalance(agg.biggest.toString(), "gUBI"),
    };
  });

  const wgnetReserve = await fetchWgnetReserve();
  const payload: FlambeurPayload = {
    updatedAt: Date.now(),
    wallets,
    wgnetReserveRaw:       wgnetReserve.toString(),
    wgnetReserveFormatted: formatBalance(wgnetReserve.toString(), "WGNET"),
  };
  await redis.set(KEY_PAYLOAD, payload);
  await redis.set(KEY_LAST_BLOCK, latestBlock.toString());

  console.log(`Written ${wallets.length} wallets. Latest block: ${latestBlock}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
