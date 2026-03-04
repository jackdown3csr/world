/**
 * scripts/scan-and-update.ts
 *
 * Scanner that reads the veGNET VotingEscrow contract on Galactica mainnet,
 * discovers all addresses that ever interacted with it (via contract logs),
 * queries their current locked GNET + veGNET voting power, and writes
 * the results to Upstash Redis.
 *
 * The VotingEscrow contract (0xdFbE…ffe4) emits events (Deposit, Withdraw,
 * etc.) with the user address as the first indexed topic. We scan ALL logs
 * from the contract and extract unique addresses from topic[1].
 *
 * Run with:  npx tsx scripts/scan-and-update.ts
 *
 * Supports incremental mode: only scans new blocks since last run.
 * Set  SEED=true  to force a full rescan from block 0.
 *
 * Required env vars:
 *   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 *   RPC_URL (optional – defaults to Galactica public RPC)
 */

import { JsonRpcProvider, Contract, getAddress, isAddress } from "ethers";
import { Redis } from "@upstash/redis";
import { formatBalance } from "../lib/formatBalance";
import type { WalletEntry, WalletsPayload, WalletTier, PlanetSubtype } from "../lib/types";

/* ── Config ───────────────────────────────────────────────── */

const VE_ADDRESS = "0xdFbE5AC59027C6f38ac3E2eDF6292672A8eCffe4";

const VE_ABI = [
  "function locked(address) view returns (int128, uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
];

const RPC_URL =
  process.env.RPC_URL || "https://galactica-mainnet.g.alchemy.com/public";

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!UPSTASH_URL || !UPSTASH_TOKEN) {
  console.error("Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN");
  process.exit(1);
}

const redis = new Redis({ url: UPSTASH_URL, token: UPSTASH_TOKEN });
const provider = new JsonRpcProvider(RPC_URL);
const ve = new Contract(VE_ADDRESS, VE_ABI, provider);

const IS_SEED = process.env.SEED === "true";
const LOG_CHUNK = 10_000; // max blocks per getLogs call
const QUERY_CONCURRENCY = 10;

const KEY_WALLETS_PAYLOAD = "wallets:payload";
const KEY_LAST_BLOCK = "scanner:lastProcessedBlock";
const KEY_WALLET_TIERS = "wallet:tiers";
const KEY_PLANET_ORBITS = "planet:orbits";

/* ── Tier constants (must match orbitalUtils.ts) ─────────── */
const PLANET_COUNT   = 20;
const MOON_END_RANK  = 60;
const RING_END_RANK  = 190;

function tierByRank(rank1: number): WalletTier {
  if (rank1 <= PLANET_COUNT)  return "planet";
  if (rank1 <= MOON_END_RANK) return "moon";
  if (rank1 <= RING_END_RANK) return "ring";
  return "asteroid";
}

function planetSubtypeByRank(rank0: number): PlanetSubtype {
  if (rank0 < 4)  return "gas_giant";
  if (rank0 < 8)  return "ice_giant";
  if (rank0 < 14) return "terrestrial";
  return "rocky";
}

/* ── Helpers ──────────────────────────────────────────────── */

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Concurrency-limited promise pool */
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

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

/* ── Main ─────────────────────────────────────────────────── */

async function main() {
  const t0 = Date.now();
  console.log(`veGNET VotingEscrow scanner`);
  console.log(`Contract: ${VE_ADDRESS}`);
  console.log(`RPC:      ${RPC_URL}`);
  console.log(`Mode:     ${IS_SEED ? "SEED (full rescan)" : "INCREMENTAL"}\n`);

  /* ─ Determine block range ─────────────────────────────── */
  const latest = await provider.getBlockNumber();
  let fromBlock: number;

  if (IS_SEED) {
    fromBlock = 0;
  } else {
    const stored = await redis.get<string>(KEY_LAST_BLOCK);
    fromBlock = stored ? Number(stored) + 1 : 0;
  }

  if (fromBlock > latest) {
    console.log("Already up-to-date. Nothing to scan.");
    return;
  }

  console.log(`Scanning blocks ${fromBlock} → ${latest}\n`);

  /* ─ Scan contract logs for unique addresses ───────────── */
  // Every event from VotingEscrow has the user address as topic[1].
  // We scan ALL events (no topic filter) for maximum robustness.
  const addressBlocks = new Map<string, number>(); // address → earliest block

  for (let start = fromBlock; start <= latest; start += LOG_CHUNK) {
    const end = Math.min(start + LOG_CHUNK - 1, latest);
    let logs: Awaited<ReturnType<typeof provider.getLogs>> = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        logs = await provider.getLogs({
          address: VE_ADDRESS,
          fromBlock: start,
          toBlock: end,
        });
        break;
      } catch (err) {
        if (attempt < 2) {
          console.warn(`  ⚠ getLogs ${start}-${end} failed, retrying…`);
          await sleep(1000);
        } else {
          console.error(`  ✗ getLogs ${start}-${end} failed after 3 attempts, skipping`);
          logs = [];
        }
      }
    }

    for (const log of logs) {
      if (log.topics.length > 1) {
        // Extract address from 32-byte indexed topic
        const raw = "0x" + log.topics[1].slice(26);
        if (isAddress(raw)) {
          const addr = getAddress(raw);
          if (!addressBlocks.has(addr) || log.blockNumber < addressBlocks.get(addr)!) {
            addressBlocks.set(addr, log.blockNumber);
          }
        }
      }
    }

    console.log(
      `  blocks ${start.toLocaleString()}-${end.toLocaleString()}: ` +
        `${addressBlocks.size} unique addresses`,
    );
  }

  console.log(`\nFound ${addressBlocks.size} unique addresses from contract events`);

  /* ─ Merge with existing data (incremental mode) ────────── */
  const existing: WalletsPayload | null = await redis.get(KEY_WALLETS_PAYLOAD);
  const existingMap = new Map<string, WalletEntry>();
  if (existing?.wallets) {
    for (const w of existing.wallets) {
      existingMap.set(w.address, w);
      // Keep existing addresses even if we didn't see new events
      if (!addressBlocks.has(w.address)) {
        addressBlocks.set(w.address, w.firstSeenBlock);
      }
    }
  }

  const allAddresses = [...addressBlocks.keys()];
  console.log(`Total unique addresses (incl. existing): ${allAddresses.length}`);

  /* ─ Query locked() + balanceOf() for each address ──────── */
  const wallets: WalletEntry[] = [];
  let checked = 0;

  await pooledMap(
    allAddresses,
    async (addr) => {
      try {
        const [lockedResult, votingPower] = await Promise.all([
          ve.locked(addr),
          ve.balanceOf(addr),
        ]);

        const lockedAmount: bigint = lockedResult[0]; // int128 → BigInt
        const lockEnd: bigint = lockedResult[1];       // uint256 → BigInt
        const vp: bigint = votingPower as bigint;

        // Skip addresses with zero voting power
        if (vp <= 0n) {
          checked++;
          return;
        }

        // Get firstSeen timestamp (reuse from existing if available)
        const block = addressBlocks.get(addr)!;
        let timestamp = existingMap.get(addr)?.firstSeenTimestamp || 0;
        if (!timestamp && block > 0) {
          try {
            const blockData = await provider.getBlock(block);
            timestamp = blockData?.timestamp || 0;
          } catch {
            // Non-critical, leave as 0
          }
        }

        wallets.push({
          address: addr,
          lockedGnet: lockedAmount.toString(),
          lockedFormatted: formatBalance(lockedAmount.toString()),
          lockEnd: Number(lockEnd),
          votingPower: vp.toString(),
          votingPowerFormatted: formatBalance(vp.toString(), "veGNET"),
          firstSeenBlock: block,
          firstSeenTimestamp: timestamp,
        });
      } catch (err) {
        // On RPC failure: preserve existing data rather than dropping the wallet
        const existing = existingMap.get(addr);
        if (existing) {
          console.warn(`  ⚠ Query failed for ${addr}, keeping existing data`);
          wallets.push(existing);
        } else {
          console.warn(`  ⚠ Query failed for ${addr}, no existing data – skipping`);
        }
      }

      checked++;
      if (checked % 20 === 0 || checked === allAddresses.length) {
        console.log(
          `  Queried ${checked}/${allAddresses.length} | Active locks: ${wallets.length}`,
        );
      }
    },
    QUERY_CONCURRENCY,
  );

  /* ─ Sort by voting power descending ───────────────────── */
  wallets.sort((a, b) => {
    const diff = BigInt(b.votingPower) - BigInt(a.votingPower);
    return diff > 0n ? 1 : diff < 0n ? -1 : 0;
  });

  /* ─ Assign tiers + persistent orbit slots ─────────────── */

  // Read existing orbit assignments from Redis
  const existingOrbits = await redis.hgetall<Record<string, string>>(KEY_PLANET_ORBITS) || {};

  // Current top-20 planet addresses
  const newPlanetAddrs = new Set(
    wallets.slice(0, Math.min(PLANET_COUNT, wallets.length)).map(w => w.address.toLowerCase())
  );

  // Find which existing orbit assignments are still planets
  const usedSlots = new Set<number>();
  const orbitMap = new Map<string, number>(); // address → slot

  for (const [addr, slotStr] of Object.entries(existingOrbits)) {
    const slot = Number(slotStr);
    if (newPlanetAddrs.has(addr)) {
      // Still a planet — keep its orbit slot
      orbitMap.set(addr, slot);
      usedSlots.add(slot);
    }
    // else: demoted — slot is freed
  }

  // Find free slots for newly promoted planets
  const freeSlots: number[] = [];
  for (let i = 0; i < PLANET_COUNT; i++) {
    if (!usedSlots.has(i)) freeSlots.push(i);
  }

  let freeIdx = 0;
  for (const addr of newPlanetAddrs) {
    if (!orbitMap.has(addr)) {
      // New planet — assign a free slot
      orbitMap.set(addr, freeSlots[freeIdx++]);
    }
  }

  // Assign tier/rank/planetSubtype/orbitSlot to each wallet
  const tierHash: Record<string, string> = {};
  const orbitHash: Record<string, string> = {};

  wallets.forEach((w, i) => {
    const rank1 = i + 1;
    w.rank = rank1;
    w.tier = tierByRank(rank1);

    if (w.tier === "planet") {
      w.planetSubtype = planetSubtypeByRank(i);
      w.orbitSlot = orbitMap.get(w.address.toLowerCase());
      orbitHash[w.address.toLowerCase()] = String(w.orbitSlot);
    }

    tierHash[w.address.toLowerCase()] = JSON.stringify({
      tier: w.tier,
      rank: rank1,
      ...(w.planetSubtype ? { planetSubtype: w.planetSubtype } : {}),
    });
  });

  /* ─ Save to Redis ─────────────────────────────────────── */
  const payload: WalletsPayload = {
    updatedAt: Date.now(),
    wallets,
  };

  // Atomic-ish writes: payload, tiers hash, orbits hash, last block
  await Promise.all([
    redis.set(KEY_WALLETS_PAYLOAD, JSON.stringify(payload)),
    redis.set(KEY_LAST_BLOCK, String(latest)),
    // Overwrite the tiers hash completely
    redis.del(KEY_WALLET_TIERS).then(async () => {
      if (Object.keys(tierHash).length > 0)
        await redis.hset(KEY_WALLET_TIERS, tierHash);
    }),
    // Overwrite the orbits hash completely
    redis.del(KEY_PLANET_ORBITS).then(async () => {
      if (Object.keys(orbitHash).length > 0)
        await redis.hset(KEY_PLANET_ORBITS, orbitHash);
    }),
  ]);

  /* ─ Summary ───────────────────────────────────────────── */
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n✓ Done in ${elapsed}s`);
  console.log(`  Wallets with active locks: ${wallets.length}`);
  console.log(`  scanner:lastProcessedBlock = ${latest}`);

  // Print total supply for reference
  try {
    const totalSupply: bigint = await ve.totalSupply() as bigint;
    console.log(`  Total veGNET supply: ${formatBalance(totalSupply.toString(), "veGNET")}`);
  } catch {
    // Non-critical
  }

  // Show top 5 wallets
  if (wallets.length > 0) {
    console.log(`\n  Top lockers:`);
    for (const w of wallets.slice(0, 5)) {
      const short = `${w.address.slice(0, 6)}…${w.address.slice(-4)}`;
      console.log(`    ${short}  ${w.lockedFormatted}  (${w.votingPowerFormatted})`);
    }
  }
}

main().catch((err) => {
  console.error("Scanner failed:", err);
  process.exit(1);
});
