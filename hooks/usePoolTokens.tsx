"use client";

import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useCallback,
  type ReactNode,
} from "react";
import type { PoolPayload, PoolTokenEntry, PoolStats, VaultBalances } from "@/lib/types";

interface PoolState {
  tokens: PoolTokenEntry[];
  updatedAt: number;
  totalWorthUSD: number;
  totalWorthFormatted: string;
  gubiPriceUSD: number;
  gubiPriceFormatted: string;
  supply: string;
  supplyFormatted: string;
  stats: PoolStats | null;
  vault: VaultBalances | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

type Action =
  | { type: "FETCH_START" }
  | { type: "FETCH_OK"; payload: PoolPayload }
  | { type: "FETCH_ERROR"; error: string };

const initialState: PoolState = {
  tokens: [],
  updatedAt: 0,
  totalWorthUSD: 0,
  totalWorthFormatted: "$0.00",
  gubiPriceUSD: 0,
  gubiPriceFormatted: "$0.00",
  supply: "0",
  supplyFormatted: "0 gUBI",
  stats: null,
  vault: null,
  loading: true,
  error: null,
  refetch: () => Promise.resolve(),
};

function reducer(state: PoolState, action: Action): PoolState {
  switch (action.type) {
    case "FETCH_START":
      return { ...state, loading: true, error: null };
    case "FETCH_OK":
      return {
        ...state,
        tokens: action.payload.tokens,
        updatedAt: action.payload.updatedAt,
        totalWorthUSD: action.payload.totalWorthUSD,
        totalWorthFormatted: action.payload.totalWorthFormatted,
        gubiPriceUSD: action.payload.gubiPriceUSD,
        gubiPriceFormatted: action.payload.gubiPriceFormatted,
        supply: action.payload.supply,
        supplyFormatted: action.payload.supplyFormatted,
        stats: action.payload.stats ?? null,
        vault: action.payload.vault ?? null,
        loading: false,
        error: null,
      };
    case "FETCH_ERROR":
      return { ...state, loading: false, error: action.error };
    default:
      return state;
  }
}

const PoolContext = createContext<PoolState>(initialState);

export function usePoolTokens() {
  return useContext(PoolContext);
}

const DEFAULT_POLL_MS = 60_000;

export function PoolProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const fetchPool = useCallback(async (isInitial: boolean) => {
    if (isInitial) dispatch({ type: "FETCH_START" });

    try {
      const res = await fetch("/api/pool");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data: PoolPayload = await res.json();
      dispatch({ type: "FETCH_OK", payload: data });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      dispatch({ type: "FETCH_ERROR", error: msg });
    }
  }, []);

  useEffect(() => {
    fetchPool(true);

    const pollMs =
      Number(process.env.NEXT_PUBLIC_POOL_POLL_INTERVAL_MS) || DEFAULT_POLL_MS;

    const id = setInterval(() => fetchPool(false), pollMs);
    return () => clearInterval(id);
  }, [fetchPool]);

  return (
    <PoolContext.Provider value={{ ...state, refetch: () => fetchPool(false) }}>
      {children}
    </PoolContext.Provider>
  );
}
