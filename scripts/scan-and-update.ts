/**
 * scripts/scan-and-update.ts
 *
 * Local‑only scanner that reads Galactica Cassiopeia blocks,
 * discovers wallet addresses from transactions, fetches their
 * native GNET balances, and writes the results to Upstash Redis.
 *
 * Run with:  npx tsx scripts/scan-and-update.ts
 *
 * Modes:
 *   SEED=true  → one‑time full‑range scan  (START_BLOCK → END_BLOCK)
 *   default    → incremental scan forward from last processed block
 *
 * Required env vars:
 *   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 *   RPC_URL (optional – defaults to Galactica public RPC)
 *   START_BLOCK, END_BLOCK (for seed), MAX_BLOCKS_PER_RUN
 */

import { JsonRpcProvider, getAddress, formatUnits } from "ethers";
import { Redis } from "@upstash/redis";

/* ── Config ───────────────────────────────────────────────── */

const RPC_URL =
  process.env.RPC_URL ||
  "https://galactica-cassiopeia.g.alchemy.com/public";

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!UPSTASH_URL || !UPSTASH_TOKEN) {
  console.error("Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN");
  process.exit(1);
}

const redis = new Redis({ url: UPSTASH_URL, token: UPSTASH_TOKEN });
const provider = new JsonRpcProvider(RPC_URL);

const IS_SEED = process.env.SEED === "true";
const START_BLOCK = Number(process.env.START_BLOCK || "0");
const END_BLOCK = Number(process.env.END_BLOCK || "0");
const MAX_BLOCKS_PER_RUN = Number(process.env.MAX_BLOCKS_PER_RUN || "500");
const BALANCE_CONCURRENCY = 10;

const KEY_WALLETS_PAYLOAD = "wallets:payload";
const KEY_LAST_BLOCK = "scanner:lastProcessedBlock";

/* ── Types ────────────────────────────────────────────────── */

interface WalletEntry {
  address: string;
  rawBalanceWei: string;
  balanceFormatted: string;
}

interface WalletsPayload {
  updatedAt: number;
  wallets: WalletEntry[];
}

/* ── Helpers ──────────────────────────────────────────────── */

/** Format balance with thousands separators and 3‑6 decimals */
function formatBalance(wei: bigint): string {
  if (wei === 0n) return "0 GNET";

  const UNIT = 10n ** 18n;
  const whole = wei / UNIT;
  const frac = wei % UNIT;

  const fracStr = frac.toString().padStart(18, "0");
  let trimmed = fracStr.replace(/0+$/, "");
  if (trimmed.length < 3) trimmed = fracStr.slice(0, 3);
  if (trimmed.length > 6) trimmed = trimmed.slice(0, 6);

  const wholeFormatted = whole.toLocaleString("en-US");
  return `${wholeFormatted}.${trimmed} GNET`;
}

/** Simple concurrency‑limited promise pool */
async function pooledMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

/** Fetch a single block and return unique from/to addresses */
async function extractAddresses(blockNum: number): Promise<Set<string>> {
  const addrs = new Set<string>();

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const block = await provider.getBlock(blockNum, true);
      if (!block || !block.prefetchedTransactions) return addrs;

      for (const tx of block.prefetchedTransactions) {
        try {
          addrs.add(getAddress(tx.from));
        } catch { /* skip invalid */ }
        if (tx.to) {
          try {
            addrs.add(getAddress(tx.to));
          } catch { /* skip invalid */ }
        }
      }
      return addrs;
    } catch (err) {
      if (attempt === 0) {
        console.warn(`  ⚠ Block ${blockNum} fetch failed, retrying…`);
        await sleep(500);
      } else {
        console.warn(`  ✗ Block ${blockNum} skipped after 2 attempts`);
      }
    }
  }
  return addrs;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ── Main ─────────────────────────────────────────────────── */

async function main() {
  const t0 = Date.now();
  console.log(`Mode: ${IS_SEED ? "SEED" : "INCREMENTAL"}`);
  console.log(`RPC:  ${RPC_URL}\n`);

  /* ─ Determine block range ─────────────────────────────── */
  let fromBlock: number;
  let toBlock: number;

  if (IS_SEED) {
    if (!START_BLOCK || !END_BLOCK) {
      console.error("SEED mode requires START_BLOCK and END_BLOCK");
      process.exit(1);
    }
    fromBlock = START_BLOCK;
    toBlock = END_BLOCK;
  } else {
    // Incremental
    const stored = await redis.get<string>(KEY_LAST_BLOCK);
    fromBlock = stored ? Number(stored) + 1 : START_BLOCK;

    const latest = await provider.getBlockNumber();
    toBlock = Math.min(fromBlock + MAX_BLOCKS_PER_RUN - 1, latest);

    if (fromBlock > toBlock) {
      console.log("Already up‑to‑date. Nothing to scan.");
      return;
    }
  }

  const totalBlocks = toBlock - fromBlock + 1;
  console.log(`Scanning blocks ${fromBlock} → ${toBlock} (${totalBlocks} blocks)\n`);

  /* ─ Scan blocks for addresses ─────────────────────────── */
  const allAddresses = new Set<string>();
  const BATCH = 5;

  for (let b = fromBlock; b <= toBlock; b += BATCH) {
    const end = Math.min(b + BATCH - 1, toBlock);
    const promises: Promise<Set<string>>[] = [];
    for (let n = b; n <= end; n++) {
      promises.push(extractAddresses(n));
    }
    const results = await Promise.all(promises);
    for (const set of results) {
      for (const a of set) allAddresses.add(a);
    }

    const done = end - fromBlock + 1;
    if (done % 50 === 0 || end === toBlock) {
      console.log(
        `  Blocks: ${done}/${totalBlocks}  |  Addresses: ${allAddresses.size}`,
      );
    }
  }

  console.log(`\nDiscovered ${allAddresses.size} unique addresses`);

  /* ─ Determine which addresses need balance lookup ──────── */
  let existingMap = new Map<string, WalletEntry>();

  if (!IS_SEED) {
    // In incremental mode, load existing payload and skip known addresses
    const existing = await redis.get<WalletsPayload>(KEY_WALLETS_PAYLOAD);
    if (existing?.wallets) {
      for (const w of existing.wallets) {
        existingMap.set(w.address, w);
      }
    }
  }

  // Only fetch balances for NEW addresses
  const newAddresses = [...allAddresses].filter((a) => !existingMap.has(a));
  console.log(`New addresses to check: ${newAddresses.length}`);

  /* ─ Fetch balances ────────────────────────────────────── */
  const funded: WalletEntry[] = [];
  let checked = 0;

  await pooledMap(
    newAddresses,
    async (addr) => {
      try {
        const bal = await provider.getBalance(addr);
        if (bal > 0n) {
          funded.push({
            address: addr,
            rawBalanceWei: bal.toString(),
            balanceFormatted: formatBalance(bal),
          });
        }
      } catch (err) {
        console.warn(`  ⚠ getBalance(${addr}) failed, skipping`);
      }
      checked++;
      if (checked % 100 === 0 || checked === newAddresses.length) {
        console.log(
          `  Balances: ${checked}/${newAddresses.length}  |  Funded: ${funded.length}`,
        );
      }
    },
    BALANCE_CONCURRENCY,
  );

  console.log(`\nNewly funded wallets: ${funded.length}`);

  /* ─ Merge & write ─────────────────────────────────────── */
  // Merge new funded into existing
  for (const w of funded) {
    existingMap.set(w.address, w);
  }

  // Sort by address for stable ordering
  const wallets = [...existingMap.values()].sort((a, b) =>
    a.address.localeCompare(b.address),
  );

  const payload: WalletsPayload = {
    updatedAt: Date.now(),
    wallets,
  };

  await redis.set(KEY_WALLETS_PAYLOAD, JSON.stringify(payload));
  await redis.set(KEY_LAST_BLOCK, String(toBlock));

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n✓ Done in ${elapsed}s`);
  console.log(`  Blocks scanned: ${totalBlocks}`);
  console.log(`  Total wallets in payload: ${wallets.length}`);
  console.log(`  scanner:lastProcessedBlock = ${toBlock}`);
}

main().catch((err) => {
  console.error("Scanner failed:", err);
  process.exit(1);
});
