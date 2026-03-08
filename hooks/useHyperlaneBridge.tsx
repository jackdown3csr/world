"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type { HyperlaneBridgePayload } from "@/lib/types";

interface HyperlaneBridgeState {
  data: HyperlaneBridgePayload | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

type Action =
  | { type: "FETCH_START" }
  | { type: "FETCH_OK"; payload: HyperlaneBridgePayload }
  | { type: "FETCH_ERROR"; error: string };

const initialState: HyperlaneBridgeState = {
  data: null,
  loading: true,
  error: null,
  refetch: () => Promise.resolve(),
};

function reducer(
  state: HyperlaneBridgeState,
  action: Action,
): HyperlaneBridgeState {
  switch (action.type) {
    case "FETCH_START":
      return { ...state, loading: true, error: null };
    case "FETCH_OK":
      return {
        ...state,
        data: action.payload,
        loading: false,
        error: null,
      };
    case "FETCH_ERROR":
      return { ...state, loading: false, error: action.error };
    default:
      return state;
  }
}

const HyperlaneBridgeContext =
  createContext<HyperlaneBridgeState>(initialState);

const DEFAULT_POLL_MS = 30_000;

export function HyperlaneBridgeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const fetchBridge = useCallback(async (isInitial: boolean) => {
    if (isInitial) dispatch({ type: "FETCH_START" });

    try {
      const res = await fetch("/api/hyperlane");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data: HyperlaneBridgePayload = await res.json();
      dispatch({ type: "FETCH_OK", payload: data });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      dispatch({ type: "FETCH_ERROR", error: msg });
    }
  }, []);

  useEffect(() => {
    fetchBridge(true);

    const pollMs =
      Number(process.env.NEXT_PUBLIC_HYPERLANE_POLL_INTERVAL_MS) ||
      DEFAULT_POLL_MS;

    const id = window.setInterval(() => {
      fetchBridge(false);
    }, pollMs);

    return () => window.clearInterval(id);
  }, [fetchBridge]);

  const value = useMemo(
    () => ({ ...state, refetch: () => fetchBridge(false) }),
    [fetchBridge, state],
  );

  return (
    <HyperlaneBridgeContext.Provider value={value}>
      {children}
    </HyperlaneBridgeContext.Provider>
  );
}

export function useHyperlaneBridge() {
  return useContext(HyperlaneBridgeContext);
}
