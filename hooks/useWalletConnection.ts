"use client";

import { useState, useCallback, useEffect } from "react";
import { BrowserProvider } from "ethers";
import type { WalletEntry } from "@/lib/types";

const GALACTICA_MAINNET_CHAIN_ID = 613419;
const GALACTICA_MAINNET_CHAIN_ID_HEX = `0x${GALACTICA_MAINNET_CHAIN_ID.toString(16)}`;

interface EthereumProvider {
  isMetaMask?: boolean;
  providers?: EthereumProvider[];
  providerMap?: Map<string, unknown>;
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
}

function parseChainId(chainId: unknown): number | null {
  if (typeof chainId === "number") return chainId;
  if (typeof chainId === "string") {
    const trimmed = chainId.trim();
    if (!trimmed) return null;
    return trimmed.startsWith("0x")
      ? Number.parseInt(trimmed, 16)
      : Number.parseInt(trimmed, 10);
  }
  return null;
}

async function getCurrentChainId(provider: EthereumProvider): Promise<number | null> {
  const raw = await provider.request({ method: "eth_chainId" });
  return parseChainId(raw);
}

async function ensureGalacticaMainnet(provider: EthereumProvider): Promise<number> {
  const currentChainId = await getCurrentChainId(provider);
  if (currentChainId === GALACTICA_MAINNET_CHAIN_ID) return currentChainId;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: GALACTICA_MAINNET_CHAIN_ID_HEX }],
    });
  } catch (err) {
    const code = typeof err === "object" && err && "code" in err ? Number((err as { code?: unknown }).code) : undefined;
    if (code === 4001) {
      throw new Error("Galactica mainnet switch was rejected.");
    }
    if (code === 4902) {
      throw new Error("Galactica mainnet is not added in your wallet yet.");
    }
    throw new Error("Failed to switch wallet to Galactica mainnet.");
  }

  const switchedChainId = await getCurrentChainId(provider);
  if (switchedChainId !== GALACTICA_MAINNET_CHAIN_ID) {
    throw new Error("Wallet is not connected to Galactica mainnet.");
  }

  return switchedChainId;
}

/* ── Prefer MetaMask when several wallet extensions coexist ──── */
function getPreferredProvider(): EthereumProvider | null {
  const win = window as Window & { ethereum?: EthereumProvider };
  let eth = win.ethereum;
  if (!eth) return null;

  // EIP-5749: providers array (Coinbase + MetaMask etc.)
  const providers = eth.providers as EthereumProvider[] | undefined;
  if (Array.isArray(providers)) {
    eth = providers.find((p) => p.isMetaMask) ?? eth;
  } else if (!eth.isMetaMask && eth.providerMap) {
    const map = eth.providerMap as Map<string, unknown>;
    if (map instanceof Map) eth = (map.get("MetaMask") as EthereumProvider) ?? eth;
  }
  return eth;
}

export interface WalletConnectionState {
  connectedAddress: string | null;
  connectedChainId: number | null;
  isGalacticaMainnet: boolean;
  nameInput: string;
  isSaving: boolean;
  status: string | null;
  myWallet: WalletEntry | null;
  canRename: boolean;
  lockExpiry: string | null;
}

export interface WalletConnectionActions {
  connectWallet: () => Promise<void>;
  disconnect: () => void;
  savePlanetName: () => Promise<void>;
  setNameInput: (v: string) => void;
  setStatus: (v: string | null) => void;
}

export function useWalletConnection(
  wallets: WalletEntry[],
  refetch: () => Promise<void>,
  onConnected?: (addr: string) => void,
): WalletConnectionState & WalletConnectionActions {
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const [connectedChainId, setConnectedChainId] = useState<number | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const myWallet =
    connectedAddress
      ? wallets.find(
          (w) => w.address.toLowerCase() === connectedAddress.toLowerCase(),
        ) ?? null
      : null;

  const canRename = !!connectedAddress && !!myWallet;
  const isGalacticaMainnet = connectedChainId === GALACTICA_MAINNET_CHAIN_ID;

  const lockExpiry = myWallet?.lockEnd
    ? new Date(myWallet.lockEnd * 1000).toLocaleDateString("cs-CZ", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : null;

  useEffect(() => {
    const eth = getPreferredProvider();
    if (!eth?.on) return;

    const handleChainChanged = (chainId: unknown) => {
      const nextChainId = parseChainId(chainId);
      setConnectedChainId(nextChainId);
      if (nextChainId !== GALACTICA_MAINNET_CHAIN_ID) {
        setConnectedAddress(null);
        setStatus("Switch wallet to Galactica mainnet.");
      }
    };

    const handleAccountsChanged = (accounts: unknown) => {
      const next = Array.isArray(accounts) ? accounts[0] : null;
      if (typeof next === "string" && next) {
        setConnectedAddress(next);
      } else {
        setConnectedAddress(null);
        setStatus(null);
      }
    };

    eth.on("chainChanged", handleChainChanged);
    eth.on("accountsChanged", handleAccountsChanged);

    return () => {
      eth.removeListener?.("chainChanged", handleChainChanged);
      eth.removeListener?.("accountsChanged", handleAccountsChanged);
    };
  }, []);

  const connectWallet = useCallback(async () => {
    try {
      const eth = getPreferredProvider();
      if (!eth) {
        setStatus("No wallet found — install MetaMask.");
        return;
      }
      const chainId = await ensureGalacticaMainnet(eth);
      setConnectedChainId(chainId);

      const provider = new BrowserProvider(eth as never);
      const signer = await provider.getSigner();
      const addr = await signer.getAddress();
      setConnectedAddress(addr);
      const own = wallets.find(
        (w) => w.address.toLowerCase() === addr.toLowerCase(),
      );
      setNameInput(own?.customName || "");
      setStatus(null);
      onConnected?.(addr);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Wallet connect failed.");
    }
  }, [wallets, onConnected]);

  const disconnect = useCallback(() => {
    setConnectedAddress(null);
    setConnectedChainId(null);
    setStatus(null);
  }, []);

  const savePlanetName = useCallback(async () => {
    if (!connectedAddress || !myWallet || !canRename) return;
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setStatus("Name cannot be empty.");
      return;
    }
    if (trimmed.length > 32) {
      setStatus("Name max length is 32 characters.");
      return;
    }

    try {
      setIsSaving(true);
      setStatus(null);

      const nonceRes = await fetch("/api/auth/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: connectedAddress }),
      });
      const nonceData = await nonceRes.json();
      if (!nonceRes.ok || !nonceData?.nonce) {
        throw new Error(nonceData?.error || "Failed to fetch nonce");
      }

      const eth = getPreferredProvider();
      if (!eth) throw new Error("Wallet provider missing");
      const chainId = await ensureGalacticaMainnet(eth);
      setConnectedChainId(chainId);
      const provider = new BrowserProvider(eth as never);
      const signer = await provider.getSigner();

      const message = [
        "Sector Galactica - Rename Planet",
        `Address: ${connectedAddress}`,
        `Name: ${trimmed}`,
        `Nonce: ${nonceData.nonce}`,
      ].join("\n");

      const signature = await signer.signMessage(message);

      const saveRes = await fetch("/api/planet-name", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: connectedAddress,
          name: trimmed,
          signature,
        }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) {
        throw new Error(saveData?.error || "Failed to save name");
      }

      setStatus("Planet name saved! \u2713");
      await refetch();
      setNameInput("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Rename failed.");
    } finally {
      setIsSaving(false);
    }
  }, [canRename, connectedAddress, nameInput, myWallet, refetch]);

  return {
    connectedAddress,
    connectedChainId,
    isGalacticaMainnet,
    nameInput,
    isSaving,
    status,
    myWallet,
    canRename,
    lockExpiry,
    connectWallet,
    disconnect,
    savePlanetName,
    setNameInput,
    setStatus,
  };
}
