"use client";

import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useCallback,
  type ReactNode,
} from "react";
import type { VestingWalletEntry, VestingPayload } from "@/lib/types";

/* ── State & actions ──────────────────────────────────────── */

interface VestingState {
  wallets: VestingWalletEntry[];
  currentEpoch: number;
  updatedAt: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

type Action =
  | { type: "FETCH_START" }
  | { type: "FETCH_OK"; payload: VestingPayload }
  | { type: "FETCH_ERROR"; error: string };

const initialState: VestingState = {
  wallets: [],
  currentEpoch: 0,
  updatedAt: 0,
  loading: true,
  error: null,
  refetch: () => Promise.resolve(),
};

function reducer(state: VestingState, action: Action): VestingState {
  switch (action.type) {
    case "FETCH_START":
      return { ...state, loading: true, error: null };
    case "FETCH_OK":
      return {
        ...state,
        wallets: action.payload.wallets,
        currentEpoch: action.payload.currentEpoch ?? 0,
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

const VestingContext = createContext<VestingState>(initialState);

export function useVestingWallets() {
  return useContext(VestingContext);
}

/* ── Provider ─────────────────────────────────────────────── */

/** Poll vesting less frequently than staking — claim events are rarer. */
const DEFAULT_POLL_MS = 5 * 60_000; // 5 minutes

export function VestingProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const fetchVesting = useCallback(async (isInitial: boolean) => {
    if (isInitial) dispatch({ type: "FETCH_START" });

    try {
      const res = await fetch("/api/vesting");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data: VestingPayload = await res.json();
      dispatch({ type: "FETCH_OK", payload: data });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      dispatch({ type: "FETCH_ERROR", error: msg });
    }
  }, []);

  useEffect(() => {
    fetchVesting(true);

    const pollMs =
      Number(process.env.NEXT_PUBLIC_VESTING_POLL_INTERVAL_MS) || DEFAULT_POLL_MS;

    const id = setInterval(() => fetchVesting(false), pollMs);
    return () => clearInterval(id);
  }, [fetchVesting]);

  return (
    <VestingContext.Provider value={{ ...state, refetch: () => fetchVesting(false) }}>
      {children}
    </VestingContext.Provider>
  );
}
