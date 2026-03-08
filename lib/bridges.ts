import { formatBalance } from "./formatBalance";
import type {
  BridgeTransferEntry,
  CanonicalBridgePayload,
  HyperlaneBridgePayload,
  HyperlaneTransferEntry,
} from "./types";

export type BridgeKind = "hyperlane" | "canonical";
export type BridgeVisualKind = "hybrid" | "tech";
export type BridgeAnchor = "vescrow" | "vesting" | "interstitial";
export type BridgeStatus = "standby" | "active" | "quiet";

export interface BridgeMetric {
  label: string;
  value: string;
  accent?: string;
}

export interface BridgeContextChip {
  label: string;
  value: string;
}

export interface BridgeStats {
  recentTransfers: number;
  lastTransferAt: number | null;
  outboundRecentTransfers: number;
  inboundRecentTransfers: number;
  outboundTransferCount: number;
  inboundTransferCount: number;
  lastOutboundAt: number | null;
  lastInboundAt: number | null;
  outboundTotalAmountLabel: string;
  inboundTotalAmountLabel: string;
  statusLabel: string;
  throughputLabel: string;
  latestTransfers: BridgeTransferEntry[];
  outboundTransfers: BridgeTransferEntry[];
  inboundTransfers: BridgeTransferEntry[];
  scannedThroughBlock: number | null;
  cardMetrics: BridgeMetric[];
  labelMetrics: BridgeMetric[];
  historySummary: string;
  contextChips: BridgeContextChip[];
}

export interface BridgeSceneObject {
  id: string;
  kind: BridgeKind;
  label: string;
  subtitle: string;
  description: string;
  routeHint: string;
  position: [number, number, number];
  bodyRadius: number;
  anchor: BridgeAnchor;
  visual: BridgeVisualKind;
  active: boolean;
  status: BridgeStatus;
  stats: BridgeStats;
}

export const HYPERLANE_BRIDGE_ID = "__bridge_hyperlane__";
export const CANONICAL_BRIDGE_ID = "__bridge_canonical__";

export function isBridgeId(id: string | null | undefined): boolean {
  return !!id && id.startsWith("__bridge_");
}

export function buildBridgeObjects(
  hyperlane: HyperlaneBridgePayload | null | undefined,
  canonical: CanonicalBridgePayload | null | undefined,
): BridgeSceneObject[] {
  const hasLiveFeed = Boolean(hyperlane);
  const outboundTransfers = hyperlane?.outboundTransfers ?? [];
  const inboundTransfers = hyperlane?.inboundTransfers ?? [];
  const canonicalTransfers = canonical?.outboundTransfers ?? [];

  const hyperlaneStats: BridgeStats = {
    recentTransfers: hyperlane?.recentTransfers ?? 0,
    lastTransferAt: hyperlane?.lastTransferAt ?? null,
    outboundRecentTransfers: hyperlane?.outboundRecentTransfers ?? 0,
    inboundRecentTransfers: hyperlane?.inboundRecentTransfers ?? 0,
    outboundTransferCount: hyperlane?.historicalOutboundTransfers ?? outboundTransfers.length,
    inboundTransferCount: hyperlane?.historicalInboundTransfers ?? inboundTransfers.length,
    lastOutboundAt: hyperlane?.lastOutboundAt ?? null,
    lastInboundAt: hyperlane?.lastInboundAt ?? null,
    outboundTotalAmountLabel: formatCompactAmountRaw(
      hyperlane?.historicalOutboundAmountRaw,
      outboundTransfers,
    ),
    inboundTotalAmountLabel: formatCompactAmountRaw(
      hyperlane?.historicalInboundAmountRaw,
      inboundTransfers,
    ),
    statusLabel: hyperlane?.statusLabel ?? (hasLiveFeed ? "waiting for traffic" : "scanner link pending"),
    throughputLabel: hyperlane?.throughputLabel ?? (hasLiveFeed ? "0 dispatches / 24h" : "feed offline"),
    latestTransfers: hyperlane?.transfers ?? [],
    outboundTransfers,
    inboundTransfers,
    scannedThroughBlock: hyperlane?.scannedThroughBlock ?? null,
    cardMetrics: [
      { label: "out total", value: formatCompactAmountRaw(hyperlane?.historicalOutboundAmountRaw, outboundTransfers), accent: "#40eeff" },
      { label: "in total", value: formatCompactAmountRaw(hyperlane?.historicalInboundAmountRaw, inboundTransfers), accent: "#d8c080" },
      { label: "tracked tx", value: `${hyperlane?.historicalOutboundTransfers ?? outboundTransfers.length} / ${hyperlane?.historicalInboundTransfers ?? inboundTransfers.length}` },
      { label: "last pulse", value: formatMetricTime(hyperlane?.lastTransferAt ?? null) },
    ],
    labelMetrics: [
      { label: "out", value: formatCompactAmountRaw(hyperlane?.historicalOutboundAmountRaw, outboundTransfers), accent: "#40eeff" },
      { label: "in", value: formatCompactAmountRaw(hyperlane?.historicalInboundAmountRaw, inboundTransfers), accent: "#d8c080" },
    ],
    historySummary: `history ${hyperlane?.historicalOutboundTransfers ?? outboundTransfers.length} out / ${hyperlane?.historicalInboundTransfers ?? inboundTransfers.length} in`,
    contextChips: [
      { label: "route", value: hyperlane?.routeLabel ?? "Galactica <-> Solana" },
      { label: "status", value: hyperlane?.statusLabel ?? (hasLiveFeed ? "waiting for traffic" : "scanner link pending") },
      ...(hyperlane?.scannedThroughBlock ? [{ label: "block", value: hyperlane.scannedThroughBlock.toLocaleString() }] : []),
    ],
  };

  const canonicalOutLabel = formatCompactAmountRaw(
    canonical?.historicalOutboundAmountRaw,
    canonicalTransfers,
  );
  const canonicalStatusLabel = canonical?.statusLabel ?? "scanner link pending";
  const canonicalRouteLabel = canonical?.routeLabel ?? "Galactica <-> Arbitrum One <-> Ethereum";
  const canonicalCount = canonical?.historicalOutboundTransfers ?? canonicalTransfers.length;
  const canonicalStats: BridgeStats = {
    recentTransfers: canonical?.recentTransfers ?? 0,
    lastTransferAt: canonical?.lastTransferAt ?? null,
    outboundRecentTransfers: canonical?.outboundRecentTransfers ?? 0,
    inboundRecentTransfers: 0,
    outboundTransferCount: canonicalCount,
    inboundTransferCount: 0,
    lastOutboundAt: canonical?.lastOutboundAt ?? null,
    lastInboundAt: null,
    outboundTotalAmountLabel: canonicalOutLabel,
    inboundTotalAmountLabel: "deposits to Galactica",
    statusLabel: canonicalStatusLabel,
    throughputLabel: canonical?.throughputLabel ?? "0 withdrawals / 24h",
    latestTransfers: canonical?.transfers ?? [],
    outboundTransfers: canonicalTransfers,
    inboundTransfers: [],
    scannedThroughBlock: canonical?.scannedThroughBlock ?? null,
    cardMetrics: [
      { label: "withdrawn", value: canonicalOutLabel, accent: "#40eeff" },
      { label: "challenge", value: "~7d", accent: "#d8c080" },
      { label: "withdrawals", value: canonicalCount.toLocaleString() },
      { label: "last out", value: formatMetricTime(canonical?.lastOutboundAt ?? null) },
    ],
    labelMetrics: [
      { label: "out", value: canonicalOutLabel, accent: "#40eeff" },
      { label: "in", value: "from ETH / Arb One", accent: "#d8c080" },
    ],
    historySummary: `history ${canonicalCount} withdrawals tracked; inbound deposits usually appear on Galactica within minutes`,
    contextChips: [
      { label: "route", value: canonicalRouteLabel },
      { label: "status", value: canonicalStatusLabel },
      { label: "outbound", value: "ArbSys.withdrawEth" },
      { label: "inbound", value: "ETH / Arb One -> Galactica" },
      ...(canonical?.scannedThroughBlock ? [{ label: "block", value: canonical.scannedThroughBlock.toLocaleString() }] : []),
    ],
  };

  return [
    {
      id: HYPERLANE_BRIDGE_ID,
      kind: "hyperlane",
      label: "Hyperlane Nexus",
      subtitle: "dimensional bridge",
      description:
        hyperlane?.recentTransfers
          ? "Hybrid relay aperture suspended between the known systems. Hyperlane Nexus traffic between Galactica and Solana now registers here as live dimensional flow in both directions."
          : "Hybrid relay aperture suspended between the known systems. Scanner is watching the Galactica mailbox for Hyperlane Nexus traffic between Galactica and Solana.",
      routeHint: hyperlane?.routeLabel ?? "Galactica <-> Solana",
      position: [6900, 1650, -2600],
      bodyRadius: 34,
      anchor: "interstitial",
      visual: "hybrid",
      active: true,
      status: hyperlane?.status ?? "standby",
      stats: hyperlaneStats,
    },
    {
      id: CANONICAL_BRIDGE_ID,
      kind: "canonical",
      label: "Canonical Bridge",
      subtitle: "orbit native bridge",
      description:
        canonical?.historicalOutboundTransfers
          ? "Galactica's native Arbitrum Orbit bridge. Withdrawals leave Galactica, pass through Arbitrum One, and finalize on Ethereum after the normal challenge period. Deposits move the other way from Ethereum or Arbitrum One and usually show up on Galactica within minutes."
          : "Galactica's native Arbitrum Orbit bridge. Scanner is watching withdrawals from Galactica now; deposits from Ethereum or Arbitrum One usually show up on Galactica within minutes.",
      routeHint: canonicalRouteLabel,
      position: [10350, 2480, -6420],
      bodyRadius: 30,
      anchor: "interstitial",
      visual: "tech",
      active: true,
      status: canonical?.status ?? "standby",
      stats: canonicalStats,
    },
  ];
}

function formatMetricTime(timestamp: number | null) {
  return timestamp ? new Date(timestamp).toLocaleTimeString() : "--";
}

function formatCompactAmountRaw(
  rawAmount: string | null | undefined,
  fallbackTransfers: BridgeTransferEntry[],
) {
  const totalRaw = rawAmount != null
    ? BigInt(rawAmount)
    : fallbackTransfers.reduce((sum, transfer) => {
      if (!transfer.amountRaw) return sum;
      return sum + BigInt(transfer.amountRaw);
    }, 0n);

  if (totalRaw === 0n) return "0 GNET";

  const formatted = formatBalance(totalRaw.toString(), "GNET");
  const numeric = Number.parseFloat(formatted.replace(/\s*GNET$/, "").replace(/,/g, ""));
  if (!Number.isFinite(numeric)) return formatted;

  if (numeric >= 1_000_000) return `${trimCompact(numeric / 1_000_000)}M GNET`;
  if (numeric >= 1_000) return `${trimCompact(numeric / 1_000)}K GNET`;
  return formatted;
}

function trimCompact(value: number) {
  if (value >= 100) return value.toFixed(0);
  if (value >= 10) return value.toFixed(1).replace(/\.0$/, "");
  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function getBridgeById(
  bridges: BridgeSceneObject[],
  id: string | null | undefined,
): BridgeSceneObject | null {
  if (!id) return null;
  return bridges.find((bridge) => bridge.id === id) ?? null;
}
