/**
 * scripts/scan-vesting.ts
 *
 * Scanner for the RewardDistributor (GNET Vesting) contract on Galactica mainnet.
 *
 * Discovery strategy:
 *   1. Scan Claim events from the RewardDistributor contract to find claimant addresses.
 *   2. Also pull all addresses from the existing wallets:payload (veGNET holders)
 *      since vesting participants are often veGNET stakers too.
 *   3. For each address, query the Merkle proof API — if it returns data, the
 *      address has vesting entitlement.
 *   4. For entitled addresses, query on-chain: userTotalRewardClaimed, userLastClaimedEpoch,
 *      and userUnclaimedReward (using the merkle proof).
 *   5. Write the results to Upstash Redis under vesting:payload.
 *
 * Run with:  npx tsx scripts/scan-vesting.ts
 *
 * Required env vars:
 *   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 *   RPC_URL (optional — defaults to Galactica public RPC)
 */

import { JsonRpcProvider, Contract, getAddress, isAddress } from "ethers";
import { Redis } from "@upstash/redis";
import { formatBalance } from "../lib/formatBalance";
import type {
  VestingWalletEntry,
  VestingPayload,
  WalletsPayload,
  WalletTier,
  PlanetSubtype,
} from "../lib/types";

/* ── Config ───────────────────────────────────────────────── */

const RD_ADDRESS = "0x80BCB71F63f11344F5483d108374fa394A587AbE";

const RD_ABI = [
  "function currentEpoch() view returns (uint64)",
  "function totalRewardClaimed() view returns (uint256)",
  "function userTotalRewardClaimed(address account) view returns (uint256)",
  "function userLastClaimedEpoch(address account) view returns (uint64)",
  "function userUnclaimedReward(tuple(uint256 leafIndex, address account, uint256 amount, bytes32[] merkleProof) claimInput) view returns (uint256)",
];

const CLAIM_EVENT_TOPIC =
  "0x5b0bb3a6df35133b5b42f75bf24595d8986d256a336838588137c05a2a2ca4e7";

const MERKLE_API =
  "https://admin-panel.galactica.com/api/claim/gnet/{address}?chainId=613419";

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
const rd = new Contract(RD_ADDRESS, RD_ABI, provider);

const LOG_CHUNK = 10_000;
const QUERY_CONCURRENCY = 5; // lower than veGNET scanner — we also hit the Merkle API
const API_CONCURRENCY = 5;

const KEY_VESTING_PAYLOAD = "vesting:payload";
const KEY_WALLETS_PAYLOAD = "wallets:payload";

/* ── Tier constants (match vestingLayout.ts) ──────────────── */
// Vesting system: young/undeveloped — very few large bodies,
// vast majority is protoplanetary disk material.
const PLANET_COUNT = 5;
const MOON_END_RANK = 15;
// ranks 16+ → all asteroid belt / disk material

function tierByRank(rank1: number): WalletTier {
  if (rank1 <= PLANET_COUNT) return "planet";
  if (rank1 <= MOON_END_RANK) return "moon";
  return "asteroid";
}

function planetSubtypeByRank(rank0: number): PlanetSubtype {
  if (rank0 < 2) return "gas_giant";      // #1-2 → protoplanetary
  if (rank0 < 4) return "ice_giant";      // #3-4 → lava_ocean
  return "terrestrial";                   // #5 → molten
}

/* ── Helpers ──────────────────────────────────────────────── */

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

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

interface MerkleProofResponse {
  leafIndex: number;
  account: string;
  amount: string; // cumulative total entitled in wei
  merkleProof: string[];
}

async function fetchMerkleProof(
  address: string,
): Promise<MerkleProofResponse | null> {
  const url = MERKLE_API.replace("{address}", address);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 404 || res.status === 400) return null;
      if (!res.ok) {
        if (attempt < 2) {
          await sleep(1000 * (attempt + 1));
          continue;
        }
        return null;
      }
      const data = await res.json();
      if (!data || !data.amount) return null;
      return data as MerkleProofResponse;
    } catch {
      if (attempt < 2) await sleep(1000 * (attempt + 1));
      else return null;
    }
  }
  return null;
}

/* ── Main ─────────────────────────────────────────────────── */

async function main() {
  const t0 = Date.now();
  console.log("RewardDistributor (GNET Vesting) scanner");
  console.log(`Contract: ${RD_ADDRESS}`);
  console.log(`RPC:      ${RPC_URL}\n`);

  /* ─ 1. Get current epoch ──────────────────────────────── */
  const currentEpoch = await rd.currentEpoch();
  console.log(`Current epoch: ${currentEpoch}\n`);

  /* ─ 2. Discover addresses from Claim events ───────────── */
  const latest = await provider.getBlockNumber();
  const claimAddresses = new Set<string>();

  console.log(`Scanning Claim events from block 0 → ${latest}`);

  for (let start = 0; start <= latest; start += LOG_CHUNK) {
    const end = Math.min(start + LOG_CHUNK - 1, latest);
    let logs: Awaited<ReturnType<typeof provider.getLogs>> = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        logs = await provider.getLogs({
          address: RD_ADDRESS,
          topics: [CLAIM_EVENT_TOPIC],
          fromBlock: start,
          toBlock: end,
        });
        break;
      } catch {
        if (attempt < 2) {
          console.warn(`  ⚠ getLogs ${start}-${end} failed, retrying…`);
          await sleep(1000);
        } else {
          console.error(
            `  ✗ getLogs ${start}-${end} failed after 3 attempts, skipping`,
          );
          logs = [];
        }
      }
    }

    for (const log of logs) {
      // Claim events have the claimer address as topic[1]
      if (log.topics.length > 1) {
        const raw = "0x" + log.topics[1].slice(26);
        if (isAddress(raw)) {
          claimAddresses.add(getAddress(raw));
        }
      }
    }

    if ((start / LOG_CHUNK) % 10 === 0 || end >= latest) {
      console.log(
        `  blocks ${start.toLocaleString()}-${end.toLocaleString()}: ${claimAddresses.size} claimants so far`,
      );
    }
  }

  console.log(`\nFound ${claimAddresses.size} addresses from Claim events`);

  /* ─ 3. Also add all veGNET stakers as candidates ──────── */
  const existingVeGNET: WalletsPayload | null =
    await redis.get(KEY_WALLETS_PAYLOAD);
  const veGNETAddresses = new Set<string>();
  if (existingVeGNET?.wallets) {
    for (const w of existingVeGNET.wallets) {
      veGNETAddresses.add(w.address);
    }
  }

  const allCandidates = new Set([...claimAddresses, ...veGNETAddresses]);
  console.log(
    `Total candidate addresses: ${allCandidates.size} (${claimAddresses.size} claimants + ${veGNETAddresses.size} veGNET holders)\n`,
  );

  /* ─ 4. Fetch merkle proofs for all candidates ─────────── */
  console.log("Fetching merkle proofs from API…");

  const candidateArray = [...allCandidates];
  const proofMap = new Map<string, MerkleProofResponse>();
  let proofChecked = 0;

  await pooledMap(
    candidateArray,
    async (addr) => {
      const proof = await fetchMerkleProof(addr);
      if (proof) {
        proofMap.set(addr, proof);
      }
      proofChecked++;
      if (proofChecked % 50 === 0 || proofChecked === candidateArray.length) {
        console.log(
          `  Checked ${proofChecked}/${candidateArray.length} — ${proofMap.size} entitled`,
        );
      }
    },
    API_CONCURRENCY,
  );

  console.log(`\n${proofMap.size} addresses have vesting entitlements\n`);

  if (proofMap.size === 0) {
    console.log("No vesting wallets found. Writing empty payload.");
    const emptyPayload: VestingPayload = {
      updatedAt: Date.now(),
      wallets: [],
    };
    await redis.set(KEY_VESTING_PAYLOAD, JSON.stringify(emptyPayload));
    return;
  }

  /* ─ 5. Query on-chain data for each entitled address ──── */
  console.log("Querying on-chain vesting data…");

  const wallets: VestingWalletEntry[] = [];
  let queried = 0;

  const entitledAddresses = [...proofMap.keys()];

  await pooledMap(
    entitledAddresses,
    async (addr) => {
      const proof = proofMap.get(addr)!;

      try {
        // Parallel on-chain queries
        const [totalClaimed, lastClaimedEpoch, unclaimedReward] =
          await Promise.all([
            rd.userTotalRewardClaimed(addr) as Promise<bigint>,
            rd.userLastClaimedEpoch(addr) as Promise<bigint>,
            rd
              .userUnclaimedReward({
                leafIndex: BigInt(proof.leafIndex),
                account: addr,
                amount: BigInt(proof.amount),
                merkleProof: proof.merkleProof,
              })
              .catch(() => 0n) as Promise<bigint>,
          ]);

        const totalEntitled = proof.amount; // cumulative wei from API

        wallets.push({
          address: addr,
          // WalletEntry base fields — repurpose votingPower for ranking
          lockedGnet: "0",
          lockedFormatted: "0 GNET",
          lockEnd: 0,
          votingPower: totalEntitled, // used by layout for rank ordering
          votingPowerFormatted: formatBalance(totalEntitled, "GNET"),
          firstSeenBlock: 0,
          firstSeenTimestamp: 0,
          // VestingWalletEntry-specific fields
          totalEntitled,
          totalEntitledFormatted: formatBalance(totalEntitled, "GNET"),
          totalClaimed: totalClaimed.toString(),
          totalClaimedFormatted: formatBalance(totalClaimed.toString(), "GNET"),
          lastClaimedEpoch: Number(lastClaimedEpoch),
          unclaimedReward: unclaimedReward.toString(),
          unclaimedRewardFormatted: formatBalance(
            unclaimedReward.toString(),
            "GNET",
          ),
        });
      } catch (err) {
        console.warn(`  ⚠ Failed querying ${addr}: ${err}`);
      }

      queried++;
      if (queried % 20 === 0 || queried === entitledAddresses.length) {
        console.log(
          `  Queried ${queried}/${entitledAddresses.length} | Active: ${wallets.length}`,
        );
      }
    },
    QUERY_CONCURRENCY,
  );

  /* ─ 6. Sort by total entitled descending ──────────────── */
  wallets.sort((a, b) => {
    const diff = BigInt(b.totalEntitled) - BigInt(a.totalEntitled);
    return diff > 0n ? 1 : diff < 0n ? -1 : 0;
  });

  /* ─ 7. Assign tiers ──────────────────────────────────── */
  wallets.forEach((w, i) => {
    const rank1 = i + 1;
    w.rank = rank1;
    w.tier = tierByRank(rank1);
    if (w.tier === "planet") {
      w.planetSubtype = planetSubtypeByRank(i);
      w.orbitSlot = i;
    }
  });

  /* ─ 8. Save to Redis ─────────────────────────────────── */
  const payload: VestingPayload = {
    updatedAt: Date.now(),
    wallets,
  };

  await redis.set(KEY_VESTING_PAYLOAD, JSON.stringify(payload));

  /* ─ 9. Summary ───────────────────────────────────────── */
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n✓ Done in ${elapsed}s`);
  console.log(`  Entitled wallets: ${wallets.length}`);
  console.log(
    `  Planets: ${wallets.filter((w) => w.tier === "planet").length}`,
  );
  console.log(`  Moons: ${wallets.filter((w) => w.tier === "moon").length}`);
  console.log(`  Rings: ${wallets.filter((w) => w.tier === "ring").length}`);
  console.log(
    `  Asteroids: ${wallets.filter((w) => w.tier === "asteroid").length}`,
  );

  // Show top 5
  if (wallets.length > 0) {
    console.log(`\n  Top entitled:`);
    for (const w of wallets.slice(0, 5)) {
      const short = `${w.address.slice(0, 6)}…${w.address.slice(-4)}`;
      console.log(
        `    ${short}  entitled=${w.totalEntitledFormatted}  claimed=${w.totalClaimedFormatted}`,
      );
    }
  }
}

main().catch((err) => {
  console.error("Vesting scanner failed:", err);
  process.exit(1);
});
