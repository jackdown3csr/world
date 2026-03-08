import { NextResponse } from "next/server";
import {
  redis,
  KEY_CANONICAL_BRIDGE_PAYLOAD,
  KEY_CANONICAL_LAST_PROCESSED_BLOCK,
} from "@/lib/redis";
import { formatBalance } from "@/lib/formatBalance";
import type {
  CanonicalBridgePayload,
  CanonicalBridgeTransferEntry,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const RPC_URL =
  process.env.RPC_URL || "https://galactica-mainnet.g.alchemy.com/public";
const ARBSYS_ADDRESS = "0x0000000000000000000000000000000000000064";
const WITHDRAW_SELECTOR = "25e16063";
const INITIAL_LOOKBACK_BLOCKS = 240_000;
const MAX_LOG_BLOCK_SPAN = 12_000;
const MAX_CATCHUP_BLOCKS = 84_000;
const MAX_TRANSFERS = 24;
const ACTIVE_WINDOW_MS = 15 * 60 * 1000;
const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

const hasRedisStorage = Boolean(
  process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN,
);

type RpcLog = {
  address: string;
  blockNumber: string;
  transactionHash: string;
};

type RpcTransaction = {
  hash: string;
  from: string;
  input: string;
  value: string;
};

let volatilePayload: CanonicalBridgePayload | null = null;
let volatileCursor: string | null = null;

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

async function getLatestBlockNumber() {
  const hexBlock: string = await rpc("eth_blockNumber");
  return Number.parseInt(hexBlock, 16);
}

async function getBlockTimestamp(
  blockNumber: number,
  cache: Map<number, number>,
): Promise<number> {
  const cached = cache.get(blockNumber);
  if (cached != null) return cached;

  const block = await rpc("eth_getBlockByNumber", [toHex(blockNumber), false]);
  const timestamp = block?.timestamp
    ? Number.parseInt(block.timestamp, 16) * 1000
    : Date.now();

  cache.set(blockNumber, timestamp);
  return timestamp;
}

async function getLogs(fromBlock: number, toBlock: number) {
  return (await rpc("eth_getLogs", [{
    address: ARBSYS_ADDRESS,
    fromBlock: toHex(fromBlock),
    toBlock: toHex(toBlock),
  }])) as RpcLog[];
}

async function getTransactionByHash(
  txHash: string,
  cache: Map<string, RpcTransaction | null>,
) {
  if (cache.has(txHash)) return cache.get(txHash) ?? null;
  const tx = (await rpc("eth_getTransactionByHash", [txHash])) as RpcTransaction | null;
  cache.set(txHash, tx);
  return tx;
}

function toHex(value: number) {
  return `0x${value.toString(16)}`;
}

function parseWithdrawDestination(input: string) {
  const normalized = input.toLowerCase().replace(/^0x/, "");
  if (!normalized.startsWith(WITHDRAW_SELECTOR) || normalized.length < 8 + 64) {
    return null;
  }

  return `0x${normalized.slice(8 + 24, 8 + 64)}`;
}

function isWithdrawEth(input: string) {
  return input.toLowerCase().replace(/^0x/, "").startsWith(WITHDRAW_SELECTOR);
}

function formatAmount(rawAmount: string) {
  return formatBalance(BigInt(rawAmount).toString(), "GNET");
}

function buildTransferEntry(args: {
  tx: RpcTransaction;
  blockNumber: number;
  timestamp: number;
}): CanonicalBridgeTransferEntry | null {
  if (!isWithdrawEth(args.tx.input)) return null;
  const recipient = parseWithdrawDestination(args.tx.input);
  if (!recipient) return null;

  const rawAmount = args.tx.value ? BigInt(args.tx.value).toString() : "0";

  return {
    txHash: args.tx.hash,
    blockNumber: args.blockNumber,
    timestamp: args.timestamp,
    direction: "outbound",
    sender: args.tx.from,
    recipient,
    amountRaw: rawAmount,
    amountFormatted: formatAmount(rawAmount),
    settlementLayer: "ethereum",
    relayLayer: "arbitrum-one",
    mechanism: "withdrawEth",
  };
}

function mergeTransfers(
  current: CanonicalBridgeTransferEntry[],
  next: CanonicalBridgeTransferEntry[],
) {
  const byHash = new Map<string, CanonicalBridgeTransferEntry>();
  for (const transfer of [...current, ...next]) {
    byHash.set(transfer.txHash, transfer);
  }

  return [...byHash.values()]
    .sort((a, b) => b.timestamp - a.timestamp || b.blockNumber - a.blockNumber)
    .slice(0, MAX_TRANSFERS);
}

function addRawAmount(current: string, next: string | null) {
  if (!next || next === "0") return current;
  return (BigInt(current) + BigInt(next)).toString();
}

function summarizeTransfers(transfers: CanonicalBridgeTransferEntry[]) {
  return transfers.reduce((summary, transfer) => ({
    count: summary.count + 1,
    amountRaw: addRawAmount(summary.amountRaw, transfer.amountRaw),
  }), {
    count: 0,
    amountRaw: "0",
  });
}

function buildPayload(args: {
  transfers: CanonicalBridgeTransferEntry[];
  scannedThroughBlock: number;
  historicalOutboundTransfers: number;
  historicalOutboundAmountRaw: string;
}): CanonicalBridgePayload {
  const now = Date.now();
  const recentTransfers = args.transfers.filter(
    (transfer) => now - transfer.timestamp <= RECENT_WINDOW_MS,
  );
  const lastTransferAt = args.transfers[0]?.timestamp ?? null;
  const lastOutboundAt = lastTransferAt;
  const isActive = Boolean(lastOutboundAt && now - lastOutboundAt <= ACTIVE_WINDOW_MS);

  return {
    updatedAt: now,
    scannedThroughBlock: args.scannedThroughBlock,
    routeLabel: "Galactica <-> Arbitrum One <-> Ethereum",
    recentTransfers: recentTransfers.length,
    lastTransferAt,
    outboundRecentTransfers: recentTransfers.length,
    inboundRecentTransfers: 0,
    historicalOutboundTransfers: args.historicalOutboundTransfers,
    historicalInboundTransfers: 0,
    historicalOutboundAmountRaw: args.historicalOutboundAmountRaw,
    historicalInboundAmountRaw: "0",
    lastOutboundAt,
    lastInboundAt: null,
    status: isActive
      ? "active"
      : args.historicalOutboundTransfers > 0
        ? "quiet"
        : "standby",
    statusLabel: isActive
      ? "withdrawal lane active"
      : args.historicalOutboundTransfers > 0
        ? "withdrawal lane idle"
        : "scanner link pending",
    throughputLabel: `${recentTransfers.length} withdrawals / 24h`,
    transfers: args.transfers,
    outboundTransfers: args.transfers,
    inboundTransfers: [],
  };
}

async function readStoredState() {
  if (hasRedisStorage) {
    const [storedPayload, storedCursor] = await Promise.all([
      redis.get<CanonicalBridgePayload>(KEY_CANONICAL_BRIDGE_PAYLOAD),
      redis.get<string>(KEY_CANONICAL_LAST_PROCESSED_BLOCK),
    ]);
    return { storedPayload, storedCursor };
  }

  return {
    storedPayload: volatilePayload,
    storedCursor: volatileCursor,
  };
}

async function writeStoredState(payload: CanonicalBridgePayload, scannedThroughBlock: number) {
  if (hasRedisStorage) {
    await Promise.all([
      redis.set(KEY_CANONICAL_BRIDGE_PAYLOAD, payload),
      redis.set(KEY_CANONICAL_LAST_PROCESSED_BLOCK, String(scannedThroughBlock)),
    ]);
    return;
  }

  volatilePayload = payload;
  volatileCursor = String(scannedThroughBlock);
}

function buildForwardRanges(fromBlock: number, toBlock: number) {
  const ranges: Array<{ start: number; end: number }> = [];

  for (let start = fromBlock; start <= toBlock; start += MAX_LOG_BLOCK_SPAN + 1) {
    ranges.push({
      start,
      end: Math.min(start + MAX_LOG_BLOCK_SPAN, toBlock),
    });
  }

  return ranges;
}

export async function GET() {
  try {
    const latestBlock = await getLatestBlockNumber();
    const { storedPayload, storedCursor } = await readStoredState();
    const timestampCache = new Map<number, number>();
    const txCache = new Map<string, RpcTransaction | null>();

    const safeStartBlock = Math.max(latestBlock - INITIAL_LOOKBACK_BLOCKS + 1, 0);
    const fromBlock = storedCursor
      ? Math.max(Number.parseInt(storedCursor, 10) + 1, safeStartBlock)
      : safeStartBlock;
    const scanEndBlock = Math.min(fromBlock + MAX_CATCHUP_BLOCKS - 1, latestBlock);

    let latestTransfers = storedPayload?.transfers ?? [];
    let historicalOutboundTransfers = storedPayload?.historicalOutboundTransfers ?? 0;
    let historicalOutboundAmountRaw = storedPayload?.historicalOutboundAmountRaw ?? "0";
    let processedThroughBlock = storedPayload?.scannedThroughBlock ?? Math.max(fromBlock - 1, 0);

    if (fromBlock <= latestBlock) {
      const txHashes = new Set<string>();
      for (const { start, end } of buildForwardRanges(fromBlock, scanEndBlock)) {
        const logs = await getLogs(start, end);
        for (const log of logs) txHashes.add(log.transactionHash);
      }

      const freshTransfers: CanonicalBridgeTransferEntry[] = [];
      for (const txHash of txHashes) {
        const tx = await getTransactionByHash(txHash, txCache);
        if (!tx?.input || !isWithdrawEth(tx.input)) continue;

        const receiptBlockHex = (await rpc("eth_getTransactionReceipt", [txHash]))?.blockNumber;
        if (!receiptBlockHex) continue;
        const blockNumber = Number.parseInt(receiptBlockHex, 16);
        const timestamp = await getBlockTimestamp(blockNumber, timestampCache);
        const entry = buildTransferEntry({ tx, blockNumber, timestamp });
        if (!entry) continue;
        freshTransfers.push(entry);
      }

      freshTransfers.sort((a, b) => b.timestamp - a.timestamp || b.blockNumber - a.blockNumber);
      latestTransfers = mergeTransfers(latestTransfers, freshTransfers);
      const summary = summarizeTransfers(freshTransfers);
      historicalOutboundTransfers += summary.count;
      historicalOutboundAmountRaw = addRawAmount(historicalOutboundAmountRaw, summary.amountRaw);
      processedThroughBlock = scanEndBlock;
    }

    const payload = buildPayload({
      transfers: latestTransfers,
      scannedThroughBlock: processedThroughBlock,
      historicalOutboundTransfers,
      historicalOutboundAmountRaw,
    });

    await writeStoredState(payload, processedThroughBlock);

    return NextResponse.json(payload, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[/api/canonical]", err);
    return NextResponse.json(
      { error: "Canonical bridge scanner unavailable" },
      { status: 503 },
    );
  }
}
