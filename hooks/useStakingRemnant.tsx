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
import type { StakingRemnantPayload } from "@/lib/types";

interface StakingRemnantState {
  data: StakingRemnantPayload | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

type Action =
  | { type: "FETCH_START" }
  | { type: "FETCH_OK"; payload: StakingRemnantPayload }
  | { type: "FETCH_ERROR"; error: string };

const initialState: StakingRemnantState = {
  data: null,
  loading: true,
  error: null,
  refetch: () => Promise.resolve(),
};

function reducer(state: StakingRemnantState, action: Action): StakingRemnantState {
  switch (action.type) {
    case "FETCH_START":
      return { ...state, loading: true, error: null };
    case "FETCH_OK":
      return { ...state, data: action.payload, loading: false, error: null };
    case "FETCH_ERROR":
      return { ...state, loading: false, error: action.error };
    default:
      return state;
  }
}

const StakingRemnantContext = createContext<StakingRemnantState>(initialState);
const DEFAULT_POLL_MS = 60_000;

export function StakingRemnantProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const fetchRemnant = useCallback(async (isInitial: boolean) => {
    if (isInitial) dispatch({ type: "FETCH_START" });

    try {
      const res = await fetch("/api/staking");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data: StakingRemnantPayload = await res.json();
      dispatch({ type: "FETCH_OK", payload: data });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      dispatch({ type: "FETCH_ERROR", error: msg });
    }
  }, []);

  useEffect(() => {
    fetchRemnant(true);

    const pollMs =
      Number(process.env.NEXT_PUBLIC_STAKING_REMNANT_POLL_INTERVAL_MS) || DEFAULT_POLL_MS;

    const id = window.setInterval(() => {
      fetchRemnant(false);
    }, pollMs);

    return () => window.clearInterval(id);
  }, [fetchRemnant]);

  const value = useMemo(
    () => ({ ...state, refetch: () => fetchRemnant(false) }),
    [fetchRemnant, state],
  );

  return (
    <StakingRemnantContext.Provider value={value}>
      {children}
    </StakingRemnantContext.Provider>
  );
}

export function useStakingRemnant() {
  return useContext(StakingRemnantContext);
}
