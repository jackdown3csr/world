"use client";

import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useCallback,
  type ReactNode,
} from "react";
import type { WalletEntry, WalletsPayload } from "@/lib/types";

/* ── State & actions ──────────────────────────────────────── */

interface WalletState {
  wallets: WalletEntry[];
  updatedAt: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

type Action =
  | { type: "FETCH_START" }
  | { type: "FETCH_OK"; payload: WalletsPayload }
  | { type: "FETCH_ERROR"; error: string };

const initialState: WalletState = {
  wallets: [],
  updatedAt: 0,
  loading: true,
  error: null,
  refetch: () => Promise.resolve(),
};

function reducer(state: WalletState, action: Action): WalletState {
  switch (action.type) {
    case "FETCH_START":
      return { ...state, loading: true, error: null };
    case "FETCH_OK":
      return {
        ...state,
        wallets: action.payload.wallets,
        updatedAt: action.payload.updatedAt,
        loading: false,
        error: null,
      };
    case "FETCH_ERROR":
      return { ...state, loading: false, error: action.error };
    default:
      return state;
  }
}

/* ── Context ──────────────────────────────────────────────── */

const WalletContext = createContext<WalletState>(initialState);

export function useWallets() {
  return useContext(WalletContext);
}

/* ── Provider ─────────────────────────────────────────────── */

const DEFAULT_POLL_MS = 30_000;

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const fetchWallets = useCallback(async (isInitial: boolean) => {
    if (isInitial) dispatch({ type: "FETCH_START" });

    try {
      const res = await fetch("/api/wallets");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data: WalletsPayload = await res.json();
      dispatch({ type: "FETCH_OK", payload: data });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      dispatch({ type: "FETCH_ERROR", error: msg });
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    fetchWallets(true);

    // Polling
    const pollMs =
      Number(process.env.NEXT_PUBLIC_POLL_INTERVAL_MS) || DEFAULT_POLL_MS;

    const id = setInterval(() => fetchWallets(false), pollMs);
    return () => clearInterval(id);
  }, [fetchWallets]);

  return (
    <WalletContext.Provider value={{ ...state, refetch: () => fetchWallets(false) }}>
      {children}
    </WalletContext.Provider>
  );
}
