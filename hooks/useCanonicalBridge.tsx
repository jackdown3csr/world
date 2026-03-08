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
import type { CanonicalBridgePayload } from "@/lib/types";

interface CanonicalBridgeState {
  data: CanonicalBridgePayload | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

type Action =
  | { type: "FETCH_START" }
  | { type: "FETCH_OK"; payload: CanonicalBridgePayload }
  | { type: "FETCH_ERROR"; error: string };

const initialState: CanonicalBridgeState = {
  data: null,
  loading: true,
  error: null,
  refetch: () => Promise.resolve(),
};

function reducer(
  state: CanonicalBridgeState,
  action: Action,
): CanonicalBridgeState {
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

const CanonicalBridgeContext =
  createContext<CanonicalBridgeState>(initialState);

const DEFAULT_POLL_MS = 45_000;

export function CanonicalBridgeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const fetchBridge = useCallback(async (isInitial: boolean) => {
    if (isInitial) dispatch({ type: "FETCH_START" });

    try {
      const res = await fetch("/api/canonical");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data: CanonicalBridgePayload = await res.json();
      dispatch({ type: "FETCH_OK", payload: data });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      dispatch({ type: "FETCH_ERROR", error: msg });
    }
  }, []);

  useEffect(() => {
    fetchBridge(true);

    const pollMs =
      Number(process.env.NEXT_PUBLIC_CANONICAL_POLL_INTERVAL_MS) ||
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
    <CanonicalBridgeContext.Provider value={value}>
      {children}
    </CanonicalBridgeContext.Provider>
  );
}

export function useCanonicalBridge() {
  return useContext(CanonicalBridgeContext);
}
