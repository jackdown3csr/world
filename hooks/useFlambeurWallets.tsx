// hooks/useFlambeurWallets.tsx
// FEATURE: Flambeur Star System

"use client";

import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useCallback,
  type ReactNode,
} from "react";
import type { FlambeurEntry, FlambeurPayload } from "@/lib/types";

/* ── State & actions ──────────────────────────────────────── */

interface FlambeurState {
  wallets:              FlambeurEntry[];
  updatedAt:            number;
  wgnetReserveFormatted: string;
  loading:              boolean;
  error:                string | null;
  refetch:              () => Promise<void>;
}

type Action =
  | { type: "FETCH_START" }
  | { type: "FETCH_OK";    payload: FlambeurPayload }
  | { type: "FETCH_ERROR"; error: string };

const initialState: FlambeurState = {
  wallets:               [],
  updatedAt:             0,
  wgnetReserveFormatted: "",
  loading:               true,
  error:                 null,
  refetch:               () => Promise.resolve(),
};

function reducer(state: FlambeurState, action: Action): FlambeurState {
  switch (action.type) {
    case "FETCH_START":
      return { ...state, loading: true, error: null };
    case "FETCH_OK":
      return {
        ...state,
        wallets:               action.payload.wallets,
        updatedAt:             action.payload.updatedAt,
        wgnetReserveFormatted: action.payload.wgnetReserveFormatted ?? "",
        loading:               false,
        error:                 null,
      };
    case "FETCH_ERROR":
      return { ...state, loading: false, error: action.error };
    default:
      return state;
  }
}

/* ── Context ──────────────────────────────────────────────── */

const FlambeurContext = createContext<FlambeurState>(initialState);

export function useFlambeurWallets() {
  return useContext(FlambeurContext);
}

/* ── Provider ─────────────────────────────────────────────── */

const DEFAULT_POLL_MS = 5 * 60_000;

export function FlambeurProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const fetchFlambeur = useCallback(async (isInitial: boolean) => {
    if (isInitial) dispatch({ type: "FETCH_START" });
    try {
      const res = await fetch("/api/flambeur");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: FlambeurPayload = await res.json();
      dispatch({ type: "FETCH_OK", payload: data });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      dispatch({ type: "FETCH_ERROR", error: msg });
    }
  }, []);

  useEffect(() => {
    fetchFlambeur(true);
    const pollMs =
      Number(process.env.NEXT_PUBLIC_FLAMBEUR_POLL_INTERVAL_MS) || DEFAULT_POLL_MS;
    const id = setInterval(() => fetchFlambeur(false), pollMs);
    return () => clearInterval(id);
  }, [fetchFlambeur]);

  return (
    <FlambeurContext.Provider value={{ ...state, refetch: () => fetchFlambeur(false) }}>
      {children}
    </FlambeurContext.Provider>
  );
}
