"use client";

import dynamic from "next/dynamic";
import { WalletProvider, useWallets } from "@/hooks/useWallets";
import { VestingProvider } from "@/hooks/useVestingWallets";

// three.js must only run client‑side
const SolarSystem = dynamic(() => import("@/components/SolarSystem"), {
  ssr: false,
});

/* Loading screen removed — SolarSystem handles its own splash overlay */

/* ── Error fallback ───────────────────────────────────────── */

function ErrorScreen({ message }: { message: string }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#000",
        zIndex: 50,
        gap: 12,
        padding: 24,
      }}
    >
      <div
        style={{
          background: "rgba(20,10,30,0.9)",
          border: "1px solid rgba(255,80,80,0.4)",
          borderRadius: 12,
          padding: "24px 32px",
          maxWidth: 420,
          textAlign: "center",
        }}
      >
        <h2 style={{ color: "#ff6b6b", fontSize: 18, marginBottom: 8 }}>
          Failed to load data
        </h2>
        <p style={{ color: "#aaa", fontSize: 13 }}>{message}</p>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: 16,
            padding: "8px 20px",
            background: "#4488ff",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          Retry
        </button>
      </div>
    </div>
  );
}

/* ── Inner page (reads context) ───────────────────────────── */

function GlobePage() {
  const { error } = useWallets();

  if (error) return <ErrorScreen message={error} />;

  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <SolarSystem />
    </div>
  );
}

/* ── Exported page (wraps provider) ───────────────────────── */

export default function Page() {
  return (
    <WalletProvider>
      <VestingProvider>
        <GlobePage />
      </VestingProvider>
    </WalletProvider>
  );
}
