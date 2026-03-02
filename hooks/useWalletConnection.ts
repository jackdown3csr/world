"use client";

import { useState, useCallback } from "react";
import { BrowserProvider } from "ethers";
import type { WalletEntry } from "@/lib/types";

export interface WalletConnectionState {
  connectedAddress: string | null;
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

  const lockExpiry = myWallet?.lockEnd
    ? new Date(myWallet.lockEnd * 1000).toLocaleDateString("cs-CZ", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : null;

  const connectWallet = useCallback(async () => {
    try {
      const eth = (window as Window & { ethereum?: unknown }).ethereum;
      if (!eth) {
        setStatus("No wallet found (install MetaMask or Rabby).");
        return;
      }
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

      const eth = (window as Window & { ethereum?: unknown }).ethereum;
      if (!eth) throw new Error("Wallet provider missing");
      const provider = new BrowserProvider(eth as never);
      const signer = await provider.getSigner();

      const message = [
        "Vescrow System Alpha - Rename Planet",
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
