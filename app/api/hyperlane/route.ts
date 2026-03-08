import { NextResponse } from "next/server";
import {
  redis,
  KEY_HYPERLANE_BRIDGE_PAYLOAD,
  KEY_HYPERLANE_LAST_PROCESSED_BLOCK,
} from "@/lib/redis";
import {
  decodeProcessTransactionInput,
  buildTransferEntry,
  HYPERLANE_DISPATCH_TOPIC,
  HYPERLANE_MAILBOX_ADDRESS,
  HYPERLANE_PROCESS_TOPIC,
  HYPERLANE_SOLANA_DOMAIN,
  parseHyperlaneMessage,
  parseProcessLog,
  parseDispatchLog,
  parseWarpTransferBody,
} from "@/lib/hyperlane";
import type { HyperlaneBridgePayload, HyperlaneTransferEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

const RPC_URL =
  process.env.RPC_URL || "https://galactica-mainnet.g.alchemy.com/public";
const INITIAL_LOOKBACK_BLOCKS = 120_000;
const MAX_LOG_BLOCK_SPAN = 10_000;
const MAX_TRANSFERS = 24;
const BOOTSTRAP_TRANSFER_TARGET = MAX_TRANSFERS * 2;
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
  logIndex?: string;
  data: string;
  topics: string[];
};

type RpcTransaction = {
  hash: string;
  input: string;
};

let volatilePayload: HyperlaneBridgePayload | null = null;
let volatileCursor: string | null = null;

type HistoricalTotals = {
  historicalOutboundTransfers: number;
  historicalInboundTransfers: number;
  historicalOutboundAmountRaw: string;
  historicalInboundAmountRaw: string;
};

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

async function getDispatchLogs(fromBlock: number, toBlock: number) {
  const result = (await rpc("eth_getLogs", [
    {
      address: HYPERLANE_MAILBOX_ADDRESS,
      fromBlock: toHex(fromBlock),
      toBlock: toHex(toBlock),
      topics: [HYPERLANE_DISPATCH_TOPIC, null, toTopicUint32(HYPERLANE_SOLANA_DOMAIN)],
    },
  ])) as RpcLog[];

  return result;
}

async function getProcessLogs(fromBlock: number, toBlock: number) {
  const result = (await rpc("eth_getLogs", [
    {
      address: HYPERLANE_MAILBOX_ADDRESS,
      fromBlock: toHex(fromBlock),
      toBlock: toHex(toBlock),
      topics: [HYPERLANE_PROCESS_TOPIC, toTopicUint32(HYPERLANE_SOLANA_DOMAIN)],
    },
  ])) as RpcLog[];

  return result;
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

function toTopicUint32(value: number) {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function mergeTransfers(
  current: HyperlaneTransferEntry[],
  next: HyperlaneTransferEntry[],
) {
  const byId = new Map<string, HyperlaneTransferEntry>();
  for (const transfer of [...current, ...next]) {
    byId.set(transfer.messageId, transfer);
  }

  return [...byId.values()]
    .sort((a, b) => b.timestamp - a.timestamp || b.blockNumber - a.blockNumber)
    .slice(0, MAX_TRANSFERS);
}

function splitTransfers(transfers: HyperlaneTransferEntry[]) {
  const outboundTransfers = transfers.filter(
    (transfer) => transfer.direction === "outbound",
  );
  const inboundTransfers = transfers.filter(
    (transfer) => transfer.direction === "inbound",
  );

  return { outboundTransfers, inboundTransfers };
}

function buildPayload(args: {
  transfers: HyperlaneTransferEntry[];
  scannedThroughBlock: number;
  historicalTotals: HistoricalTotals;
}): HyperlaneBridgePayload {
  const now = Date.now();
  const recentTransfers = args.transfers.filter(
    (transfer) => now - transfer.timestamp <= RECENT_WINDOW_MS,
  );
  const { outboundTransfers, inboundTransfers } = splitTransfers(args.transfers);
  const recentOutboundTransfers = outboundTransfers.filter(
    (transfer) => now - transfer.timestamp <= RECENT_WINDOW_MS,
  );
  const recentInboundTransfers = inboundTransfers.filter(
    (transfer) => now - transfer.timestamp <= RECENT_WINDOW_MS,
  );
  const lastTransferAt = args.transfers[0]?.timestamp ?? null;
  const lastOutboundAt = outboundTransfers[0]?.timestamp ?? null;
  const lastInboundAt = inboundTransfers[0]?.timestamp ?? null;

  let status: HyperlaneBridgePayload["status"] = "quiet";
  let statusLabel = "no recent bridge pulses";

  const outboundActive = Boolean(
    lastOutboundAt && now - lastOutboundAt <= ACTIVE_WINDOW_MS,
  );
  const inboundActive = Boolean(
    lastInboundAt && now - lastInboundAt <= ACTIVE_WINDOW_MS,
  );

  if (outboundActive || inboundActive) {
    status = "active";
    statusLabel = outboundActive && inboundActive
      ? "two-way bridge traffic active"
      : outboundActive
        ? "galactica -> solana active"
        : "solana -> galactica active";
  }

  return {
    updatedAt: now,
    scannedThroughBlock: args.scannedThroughBlock,
    routeLabel: "Galactica <-> Solana",
    recentTransfers: recentTransfers.length,
    lastTransferAt,
    outboundRecentTransfers: recentOutboundTransfers.length,
    inboundRecentTransfers: recentInboundTransfers.length,
    historicalOutboundTransfers: args.historicalTotals.historicalOutboundTransfers,
    historicalInboundTransfers: args.historicalTotals.historicalInboundTransfers,
    historicalOutboundAmountRaw: args.historicalTotals.historicalOutboundAmountRaw,
    historicalInboundAmountRaw: args.historicalTotals.historicalInboundAmountRaw,
    lastOutboundAt,
    lastInboundAt,
    status,
    statusLabel,
    throughputLabel: `${recentOutboundTransfers.length} out / ${recentInboundTransfers.length} in / 24h`,
    transfers: args.transfers,
    outboundTransfers,
    inboundTransfers,
  };
}

function createEmptyHistoricalTotals(): HistoricalTotals {
  return {
    historicalOutboundTransfers: 0,
    historicalInboundTransfers: 0,
    historicalOutboundAmountRaw: "0",
    historicalInboundAmountRaw: "0",
  };
}

function addRawAmount(current: string, next: string | null) {
  if (!next || next === "0") return current;
  return (BigInt(current) + BigInt(next)).toString();
}

function getHistoricalTotalsFromPayload(
  payload: HyperlaneBridgePayload | null | undefined,
): HistoricalTotals {
  return {
    historicalOutboundTransfers: payload?.historicalOutboundTransfers ?? 0,
    historicalInboundTransfers: payload?.historicalInboundTransfers ?? 0,
    historicalOutboundAmountRaw: payload?.historicalOutboundAmountRaw ?? "0",
    historicalInboundAmountRaw: payload?.historicalInboundAmountRaw ?? "0",
  };
}

function mergeHistoricalTotals(
  current: HistoricalTotals,
  next: HistoricalTotals,
): HistoricalTotals {
  return {
    historicalOutboundTransfers:
      current.historicalOutboundTransfers + next.historicalOutboundTransfers,
    historicalInboundTransfers:
      current.historicalInboundTransfers + next.historicalInboundTransfers,
    historicalOutboundAmountRaw: addRawAmount(
      current.historicalOutboundAmountRaw,
      next.historicalOutboundAmountRaw,
    ),
    historicalInboundAmountRaw: addRawAmount(
      current.historicalInboundAmountRaw,
      next.historicalInboundAmountRaw,
    ),
  };
}

function summarizeTransfers(transfers: HyperlaneTransferEntry[]): HistoricalTotals {
  const totals = createEmptyHistoricalTotals();

  for (const transfer of transfers) {
    if (transfer.direction === "outbound") {
      totals.historicalOutboundTransfers += 1;
      totals.historicalOutboundAmountRaw = addRawAmount(
        totals.historicalOutboundAmountRaw,
        transfer.amountRaw,
      );
    } else {
      totals.historicalInboundTransfers += 1;
      totals.historicalInboundAmountRaw = addRawAmount(
        totals.historicalInboundAmountRaw,
        transfer.amountRaw,
      );
    }
  }

  return totals;
}

function extractAmountRawFromMessage(message: string) {
  const parsed = parseHyperlaneMessage(message);
  return parseWarpTransferBody(parsed.body)?.amountRaw ?? null;
}

async function scanHistoricalTotals(
  fromBlock: number,
  latestBlock: number,
  txCache: Map<string, RpcTransaction | null>,
) {
  const totals = createEmptyHistoricalTotals();

  for (const { start, end } of buildForwardRanges(fromBlock, latestBlock)) {
    const [dispatchLogs, processLogs] = await Promise.all([
      getDispatchLogs(start, end),
      getProcessLogs(start, end),
    ]);

    for (const log of dispatchLogs) {
      const dispatch = parseDispatchLog({ topics: log.topics, data: log.data });
      totals.historicalOutboundTransfers += 1;
      totals.historicalOutboundAmountRaw = addRawAmount(
        totals.historicalOutboundAmountRaw,
        extractAmountRawFromMessage(dispatch.message),
      );
    }

    for (const log of processLogs) {
      const process = parseProcessLog({ topics: log.topics, data: log.data });
      if (process.origin !== HYPERLANE_SOLANA_DOMAIN) continue;

      const tx = await getTransactionByHash(log.transactionHash, txCache);
      if (!tx?.input) continue;

      const { rawMessage, parsedMessage } = decodeProcessTransactionInput(tx.input);
      if (parsedMessage.origin !== HYPERLANE_SOLANA_DOMAIN) continue;

      totals.historicalInboundTransfers += 1;
      totals.historicalInboundAmountRaw = addRawAmount(
        totals.historicalInboundAmountRaw,
        extractAmountRawFromMessage(rawMessage),
      );
    }
  }

  return totals;
}

async function readStoredState() {
  if (hasRedisStorage) {
    const [storedPayload, storedCursor] = await Promise.all([
      redis.get<HyperlaneBridgePayload>(KEY_HYPERLANE_BRIDGE_PAYLOAD),
      redis.get<string>(KEY_HYPERLANE_LAST_PROCESSED_BLOCK),
    ]);
    return { storedPayload, storedCursor };
  }

  return {
    storedPayload: volatilePayload,
    storedCursor: volatileCursor,
  };
}

async function writeStoredState(payload: HyperlaneBridgePayload, latestBlock: number) {
  if (hasRedisStorage) {
    await Promise.all([
      redis.set(KEY_HYPERLANE_BRIDGE_PAYLOAD, payload),
      redis.set(KEY_HYPERLANE_LAST_PROCESSED_BLOCK, String(latestBlock)),
    ]);
    return;
  }

  volatilePayload = payload;
  volatileCursor = String(latestBlock);
}

export async function GET() {
  try {
    const latestBlock = await getLatestBlockNumber();
    const timestampCache = new Map<number, number>();
    const txCache = new Map<string, RpcTransaction | null>();
    const { storedPayload, storedCursor } = await readStoredState();

    const safeStartBlock = Math.max(latestBlock - INITIAL_LOOKBACK_BLOCKS + 1, 0);
    const shouldBootstrap = !storedPayload || storedPayload.transfers.length === 0;
    const needsHistoricalBootstrap = !storedPayload
      || storedPayload.historicalOutboundTransfers == null
      || storedPayload.historicalInboundTransfers == null
      || storedPayload.historicalOutboundAmountRaw == null
      || storedPayload.historicalInboundAmountRaw == null;
    const fromBlock = storedCursor && !shouldBootstrap
      ? Math.max(Number.parseInt(storedCursor, 10) + 1, safeStartBlock)
      : safeStartBlock;

    let transfers = storedPayload?.transfers ?? [];
    let historicalTotals = needsHistoricalBootstrap
      ? await scanHistoricalTotals(safeStartBlock, latestBlock, txCache)
      : getHistoricalTotalsFromPayload(storedPayload);

    if (fromBlock <= latestBlock) {
      const freshTransfers: HyperlaneTransferEntry[] = [];

      const ranges = shouldBootstrap
        ? buildBackwardRanges(fromBlock, latestBlock)
        : buildForwardRanges(fromBlock, latestBlock);

      for (const { start, end } of ranges) {
        const [dispatchLogs, processLogs] = await Promise.all([
          getDispatchLogs(start, end),
          getProcessLogs(start, end),
        ]);

        if (shouldBootstrap) {
          const recentEvents = [
            ...dispatchLogs.map((log) => ({ kind: "dispatch" as const, log })),
            ...processLogs.map((log) => ({ kind: "process" as const, log })),
          ].sort((a, b) => {
            const blockDelta =
              Number.parseInt(b.log.blockNumber, 16) -
              Number.parseInt(a.log.blockNumber, 16);

            if (blockDelta !== 0) return blockDelta;

            return (
              Number.parseInt(b.log.logIndex ?? "0x0", 16) -
              Number.parseInt(a.log.logIndex ?? "0x0", 16)
            );
          });

          for (const event of recentEvents) {
            if (event.kind === "dispatch") {
              const dispatch = parseDispatchLog({
                topics: event.log.topics,
                data: event.log.data,
              });
              const blockNumber = Number.parseInt(event.log.blockNumber, 16);
              const timestamp = await getBlockTimestamp(blockNumber, timestampCache);

              freshTransfers.push(
                buildTransferEntry({
                  direction: "outbound",
                  txHash: event.log.transactionHash,
                  blockNumber,
                  timestamp,
                  message: dispatch.message,
                  messageId: dispatch.messageId,
                }),
              );
            } else {
              const process = parseProcessLog({
                topics: event.log.topics,
                data: event.log.data,
              });
              if (process.origin !== HYPERLANE_SOLANA_DOMAIN) continue;

              const tx = await getTransactionByHash(event.log.transactionHash, txCache);
              if (!tx?.input) continue;

              const { rawMessage, parsedMessage } = decodeProcessTransactionInput(tx.input);
              if (parsedMessage.origin !== HYPERLANE_SOLANA_DOMAIN) continue;

              const blockNumber = Number.parseInt(event.log.blockNumber, 16);
              const timestamp = await getBlockTimestamp(blockNumber, timestampCache);

              freshTransfers.push(
                buildTransferEntry({
                  direction: "inbound",
                  txHash: event.log.transactionHash,
                  blockNumber,
                  timestamp,
                  message: rawMessage,
                  messageId: parsedMessage.messageId,
                }),
              );
            }

            if (freshTransfers.length >= BOOTSTRAP_TRANSFER_TARGET) {
              break;
            }
          }

          if (freshTransfers.length >= BOOTSTRAP_TRANSFER_TARGET) {
            break;
          }

          continue;
        }

        for (const log of dispatchLogs) {
          const dispatch = parseDispatchLog({ topics: log.topics, data: log.data });
          const blockNumber = Number.parseInt(log.blockNumber, 16);
          const timestamp = await getBlockTimestamp(blockNumber, timestampCache);
          freshTransfers.push(
            buildTransferEntry({
              direction: "outbound",
              txHash: log.transactionHash,
              blockNumber,
              timestamp,
              message: dispatch.message,
              messageId: dispatch.messageId,
            }),
          );

        }

        for (const log of processLogs) {
          const process = parseProcessLog({ topics: log.topics, data: log.data });
          if (process.origin !== HYPERLANE_SOLANA_DOMAIN) continue;

          const tx = await getTransactionByHash(log.transactionHash, txCache);
          if (!tx?.input) continue;

          const { rawMessage, parsedMessage } = decodeProcessTransactionInput(tx.input);
          if (parsedMessage.origin !== HYPERLANE_SOLANA_DOMAIN) continue;

          const blockNumber = Number.parseInt(log.blockNumber, 16);
          const timestamp = await getBlockTimestamp(blockNumber, timestampCache);

          freshTransfers.push(
            buildTransferEntry({
              direction: "inbound",
              txHash: log.transactionHash,
              blockNumber,
              timestamp,
              message: rawMessage,
              messageId: parsedMessage.messageId,
            }),
          );

        }
      }

      transfers = mergeTransfers(transfers, freshTransfers);
      if (!needsHistoricalBootstrap) {
        historicalTotals = mergeHistoricalTotals(
          historicalTotals,
          summarizeTransfers(freshTransfers),
        );
      }
    }

    const payload = buildPayload({
      transfers,
      scannedThroughBlock: latestBlock,
      historicalTotals,
    });

    await writeStoredState(payload, latestBlock);

    return NextResponse.json(payload, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[/api/hyperlane]", err);
    return NextResponse.json(
      { error: "Hyperlane scanner unavailable" },
      { status: 503 },
    );
  }
}

function buildForwardRanges(fromBlock: number, latestBlock: number) {
  const ranges: Array<{ start: number; end: number }> = [];

  for (
    let start = fromBlock;
    start <= latestBlock;
    start += MAX_LOG_BLOCK_SPAN + 1
  ) {
    ranges.push({
      start,
      end: Math.min(start + MAX_LOG_BLOCK_SPAN, latestBlock),
    });
  }

  return ranges;
}

function buildBackwardRanges(fromBlock: number, latestBlock: number) {
  const ranges: Array<{ start: number; end: number }> = [];

  for (
    let end = latestBlock;
    end >= fromBlock;
    end -= MAX_LOG_BLOCK_SPAN + 1
  ) {
    ranges.push({
      start: Math.max(end - MAX_LOG_BLOCK_SPAN, fromBlock),
      end,
    });
  }

  return ranges;
}
