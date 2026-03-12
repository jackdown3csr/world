/**
 * Rank snapshot — localStorage-based rank tracking.
 *
 * Saves a per-system snapshot of wallet ranks on each visit.
 * Computes diffs against the previous snapshot for display.
 */

import { PLANET_COUNT, MOON_END_RANK, RING_END_RANK } from "./layout/constants";
import type { SolarSystemData } from "./layout/types";
import type { SceneSystemId } from "./sceneSystems";

/* ── Types ─────────────────────────────────────────────────── */

export type WalletTier = "planet" | "moon" | "ring" | "asteroid";

export interface RankSnapshotEntry {
  rank: number;
  tier: WalletTier;
}

export interface SystemSnapshot {
  systemId: SceneSystemId;
  wallets: Record<string, RankSnapshotEntry>;
  timestamp: number;
}

export interface WalletDelta {
  address: string;
  rankDelta: number;      // positive = moved up
  oldRank: number | null;
  newRank: number;
  oldTier: WalletTier | null;
  newTier: WalletTier;
  isNew: boolean;
  tierChange: "promoted" | "demoted" | null;
}

export interface SystemMovementSummary {
  movedUp: number;
  movedDown: number;
  newWallets: number;
  removed: number;
  tierPromotions: number;
  tierDemotions: number;
  snapshotAge: number;    // ms since previous snapshot
  hasSnapshot: boolean;
  deltas: Map<string, WalletDelta>;
}

/* ── Tier from rank ────────────────────────────────────────── */

export function tierFromRank(rank: number): WalletTier {
  if (rank <= PLANET_COUNT) return "planet";
  if (rank <= MOON_END_RANK) return "moon";
  if (rank <= RING_END_RANK) return "ring";
  return "asteroid";
}

const TIER_ORDER: Record<WalletTier, number> = {
  planet: 0,
  moon: 1,
  ring: 2,
  asteroid: 3,
};

/* ── Build current snapshot from layout data ───────────────── */

export function buildSnapshot(
  systemId: SceneSystemId,
  data: SolarSystemData,
): SystemSnapshot {
  const wallets: Record<string, RankSnapshotEntry> = {};
  let rank = 1;

  // Planets — ranked by vpRank order (already rank-sorted in layout)
  const sorted = [...data.planets].sort((a, b) => a.vpRank - b.vpRank);
  for (const planet of sorted) {
    wallets[planet.wallet.address.toLowerCase()] = { rank, tier: tierFromRank(rank) };

    // Moons are ranked after all planets, but track planet-moon association
    rank++;
  }

  // Moons — sorted by parent vpRank then within-planet order
  const allMoons = sorted.flatMap((planet) => planet.moons);
  for (const moon of allMoons) {
    wallets[moon.wallet.address.toLowerCase()] = { rank, tier: tierFromRank(rank) };
    rank++;
  }

  // Ring particles — sorted by parent vpRank then within-planet order
  const allRings = sorted.flatMap((planet) => planet.ringWallets);
  for (const ring of allRings) {
    wallets[ring.wallet.address.toLowerCase()] = { rank, tier: tierFromRank(rank) };
    rank++;
  }

  // Asteroids — layout already sorted by VP
  for (const asteroid of data.asteroids) {
    wallets[asteroid.wallet.address.toLowerCase()] = { rank, tier: tierFromRank(rank) };
    rank++;
  }

  return { systemId, wallets, timestamp: Date.now() };
}

/* ── localStorage I/O ──────────────────────────────────────── */

const KEY_PREFIX = "galactica:rank:";
const MIN_SAVE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

function storageKey(systemId: SceneSystemId): string {
  return `${KEY_PREFIX}${systemId}`;
}

export function loadSnapshot(systemId: SceneSystemId): SystemSnapshot | null {
  try {
    const raw = localStorage.getItem(storageKey(systemId));
    if (!raw) return null;
    return JSON.parse(raw) as SystemSnapshot;
  } catch {
    return null;
  }
}

export function saveSnapshot(snapshot: SystemSnapshot): void {
  try {
    localStorage.setItem(storageKey(snapshot.systemId), JSON.stringify(snapshot));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

/**
 * Save snapshot only if enough time elapsed since the last one.
 * Returns true if saved, false if skipped.
 */
export function saveIfStale(snapshot: SystemSnapshot): boolean {
  const existing = loadSnapshot(snapshot.systemId);
  if (existing && (snapshot.timestamp - existing.timestamp) < MIN_SAVE_INTERVAL_MS) {
    return false;
  }
  saveSnapshot(snapshot);
  return true;
}

/* ── Diff computation ──────────────────────────────────────── */

export function computeMovement(
  current: SystemSnapshot,
  previous: SystemSnapshot | null,
): SystemMovementSummary {
  if (!previous) {
    return {
      movedUp: 0,
      movedDown: 0,
      newWallets: 0,
      removed: 0,
      tierPromotions: 0,
      tierDemotions: 0,
      snapshotAge: 0,
      hasSnapshot: false,
      deltas: new Map(),
    };
  }

  const deltas = new Map<string, WalletDelta>();
  let movedUp = 0;
  let movedDown = 0;
  let newWallets = 0;
  let tierPromotions = 0;
  let tierDemotions = 0;

  for (const [address, cur] of Object.entries(current.wallets)) {
    const prev = previous.wallets[address];
    const isNew = !prev;
    const oldRank = prev?.rank ?? null;
    const rankDelta = oldRank !== null ? oldRank - cur.rank : 0; // positive = moved up
    const oldTier = prev?.tier ?? null;

    let tierChange: WalletDelta["tierChange"] = null;
    if (oldTier && oldTier !== cur.tier) {
      tierChange = TIER_ORDER[cur.tier] < TIER_ORDER[oldTier] ? "promoted" : "demoted";
    }

    if (isNew) newWallets++;
    else if (rankDelta > 0) movedUp++;
    else if (rankDelta < 0) movedDown++;

    if (tierChange === "promoted") tierPromotions++;
    if (tierChange === "demoted") tierDemotions++;

    deltas.set(address, {
      address,
      rankDelta,
      oldRank,
      newRank: cur.rank,
      oldTier,
      newTier: cur.tier,
      isNew,
      tierChange,
    });
  }

  // Count removed wallets
  const removed = Object.keys(previous.wallets).filter(
    (addr) => !(addr in current.wallets),
  ).length;

  return {
    movedUp,
    movedDown,
    newWallets,
    removed,
    tierPromotions,
    tierDemotions,
    snapshotAge: current.timestamp - previous.timestamp,
    hasSnapshot: true,
    deltas,
  };
}

/* ── Format helpers ────────────────────────────────────────── */

export function formatSnapshotAge(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
