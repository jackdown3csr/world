import { Interface, keccak256 } from "ethers";
import { formatBalance } from "@/lib/formatBalance";
import type { HyperlaneTransferDirection, HyperlaneTransferEntry } from "@/lib/types";

export const HYPERLANE_MAILBOX_ADDRESS =
  "0x3a464f746D23Ab22155710f44dB16dcA53e0775E";
export const HYPERLANE_SOLANA_DOMAIN = 1399811149;
export const HYPERLANE_SOLANA_DOMAIN_HEX = "0x534f4c41";

const MAILBOX_ABI = [
  "event Dispatch(address indexed sender, uint32 indexed destination, bytes32 indexed recipient, bytes message)",
  "event DispatchId(bytes32 indexed messageId)",
  "event Process(uint32 indexed origin, bytes32 indexed sender, address indexed recipient)",
  "event ProcessId(bytes32 indexed messageId)",
  "function process(bytes metadata, bytes message)",
] as const;

export const hyperlaneMailboxInterface = new Interface(MAILBOX_ABI);
const dispatchEvent = hyperlaneMailboxInterface.getEvent("Dispatch");
const processEvent = hyperlaneMailboxInterface.getEvent("Process");
const processIdEvent = hyperlaneMailboxInterface.getEvent("ProcessId");
export const HYPERLANE_DISPATCH_TOPIC =
  dispatchEvent?.topicHash ?? "";
export const HYPERLANE_PROCESS_TOPIC =
  processEvent?.topicHash ?? "";
export const HYPERLANE_PROCESS_ID_TOPIC =
  processIdEvent?.topicHash ?? "";

export type HyperlaneDispatchEvent = {
  sender: string;
  destination: number;
  recipient: string;
  message: string;
  messageId: string;
};

export type HyperlaneProcessEvent = {
  origin: number;
  sender: string;
  recipient: string;
};

export type ParsedHyperlaneMessage = {
  version: number;
  nonce: number;
  origin: number;
  sender: string;
  destination: number;
  recipient: string;
  body: string;
  messageId: string;
};

export type ParsedWarpTransferBody = {
  recipient: string;
  amountRaw: string;
  amountFormatted: string;
  metadata: string;
};

export function parseDispatchLog(log: {
  topics: string[];
  data: string;
}): HyperlaneDispatchEvent {
  const parsed = hyperlaneMailboxInterface.parseLog({
    topics: log.topics,
    data: log.data,
  });

  if (!parsed || parsed.name !== "Dispatch") {
    throw new Error("Unexpected Hyperlane log payload");
  }

  const sender = String(parsed.args.sender);
  const destination = Number(parsed.args.destination);
  const recipient = String(parsed.args.recipient);
  const message = String(parsed.args.message);

  return {
    sender,
    destination,
    recipient,
    message,
    messageId: keccak256(message),
  };
}

export function parseProcessLog(log: {
  topics: string[];
  data: string;
}): HyperlaneProcessEvent {
  const parsed = hyperlaneMailboxInterface.parseLog({
    topics: log.topics,
    data: log.data,
  });

  if (!parsed || parsed.name !== "Process") {
    throw new Error("Unexpected Hyperlane process log payload");
  }

  return {
    origin: Number(parsed.args.origin),
    sender: String(parsed.args.sender),
    recipient: String(parsed.args.recipient),
  };
}

export function extractProcessId(topics: string[]) {
  return topics[1] ?? null;
}

export function parseHyperlaneMessage(message: string): ParsedHyperlaneMessage {
  const hex = stripHexPrefix(message);
  if (hex.length < 154) {
    throw new Error("Hyperlane message too short");
  }

  return {
    version: Number.parseInt(hex.slice(0, 2), 16),
    nonce: Number.parseInt(hex.slice(2, 10), 16),
    origin: Number.parseInt(hex.slice(10, 18), 16),
    sender: `0x${hex.slice(18, 82)}`,
    destination: Number.parseInt(hex.slice(82, 90), 16),
    recipient: `0x${hex.slice(90, 154)}`,
    body: `0x${hex.slice(154)}`,
    messageId: keccak256(withHexPrefix(hex)),
  };
}

export function parseWarpTransferBody(body: string): ParsedWarpTransferBody | null {
  const hex = stripHexPrefix(body);
  if (hex.length < 128) return null;

  const recipient = `0x${hex.slice(0, 64)}`;
  const amountHex = hex.slice(64, 128);
  const metadataHex = hex.slice(128);
  const amountRaw = BigInt(`0x${amountHex}`).toString(10);

  return {
    recipient,
    amountRaw,
    amountFormatted: formatBalance(amountRaw, "GNET"),
    metadata: withHexPrefix(metadataHex),
  };
}

export function buildTransferEntry(args: {
  direction: HyperlaneTransferDirection;
  txHash: string;
  blockNumber: number;
  timestamp: number;
  message: string;
  messageId?: string;
}): HyperlaneTransferEntry {
  const message = parseHyperlaneMessage(args.message);
  const transferBody = parseWarpTransferBody(message.body);

  return {
    messageId: args.messageId ?? message.messageId,
    txHash: args.txHash,
    blockNumber: args.blockNumber,
    timestamp: args.timestamp,
    direction: args.direction,
    originDomain: message.origin,
    destinationDomain: message.destination,
    sender: collapseAddress(message.sender),
    recipient: collapseBytes32(transferBody?.recipient ?? message.recipient),
    amountRaw: transferBody?.amountRaw ?? null,
    amountFormatted: transferBody?.amountFormatted ?? null,
  };
}

export function decodeProcessTransactionInput(input: string) {
  const decoded = hyperlaneMailboxInterface.decodeFunctionData("process", input);
  const rawMessage = String(decoded[1]);
  return {
    rawMessage,
    parsedMessage: parseHyperlaneMessage(rawMessage),
  };
}

export function collapseAddress(value: string): string {
  const normalized = stripHexPrefix(value);
  if (normalized.length === 64 && normalized.startsWith("0".repeat(24))) {
    const evm = normalized.slice(24);
    return `0x${evm.slice(0, 6)}...${evm.slice(-4)}`;
  }

  return collapseBytes32(withHexPrefix(normalized));
}

export function collapseBytes32(value: string): string {
  const normalized = stripHexPrefix(value);
  return `0x${normalized.slice(0, 8)}...${normalized.slice(-6)}`;
}

function stripHexPrefix(value: string) {
  return value.startsWith("0x") ? value.slice(2) : value;
}

function withHexPrefix(value: string) {
  return value.startsWith("0x") ? value : `0x${value}`;
}
