"use client";

import dynamic from "next/dynamic";
import React, { useState } from "react";
import AppStateScreen from "@/components/AppStateScreen";
import SplashScreen from "@/components/SplashScreen";
import { CanonicalBridgeProvider, useCanonicalBridge } from "@/hooks/useCanonicalBridge";
import { HyperlaneBridgeProvider, useHyperlaneBridge } from "@/hooks/useHyperlaneBridge";
import { StakingRemnantProvider, useStakingRemnant } from "@/hooks/useStakingRemnant";
import { WalletProvider, useWallets } from "@/hooks/useWallets";
import { VestingProvider, useVestingWallets } from "@/hooks/useVestingWallets";
import { PoolProvider, usePoolTokens } from "@/hooks/usePoolTokens";
import { FlambeurProvider, useFlambeurWallets } from "@/hooks/useFlambeurWallets";

const SolarSystem = dynamic(() => import("@/components/SolarSystem"), {
  ssr: false,
});

function DataErrorGate() {
  const wallets   = useWallets();
  const vesting   = useVestingWallets();
  const pool      = usePoolTokens();
  const hyperlane = useHyperlaneBridge();
  const canonical = useCanonicalBridge();
  const staking   = useStakingRemnant();
  const flambeur  = useFlambeurWallets();

  const dataError = [
    { label: "wallet registry",            message: wallets.error,   retry: wallets.refetch   },
    { label: "vesting registry",           message: vesting.error,   retry: vesting.refetch   },
    { label: "pool registry",              message: pool.error,      retry: pool.refetch      },
    { label: "staking telemetry",          message: staking.error,   retry: staking.refetch   },
    { label: "hyperlane nexus telemetry",  message: hyperlane.error, retry: hyperlane.refetch },
    { label: "canonical bridge telemetry", message: canonical.error, retry: canonical.refetch },
    { label: "flambeur registry",          message: flambeur.error,  retry: flambeur.refetch  },
  ].find((entry) => entry.message);

  if (!dataError) return null;

  const isHtmlResponse = dataError.message?.includes("Unexpected token '<'") ?? false;

  return (
    <AppStateScreen
      eyebrow="loading problem"
      title="Could Not Load Scene Data"
      description={isHtmlResponse
        ? "The local server answered before one of the data routes was ready. Press try again once the app has fully started."
        : "The app could not load one of the required data feeds. Press try again."}
      detail={`Problem loading ${dataError.label}.`}
      tone="error"
      primaryAction={{
        label: "try again",
        onClick: () => { void dataError.retry(); },
      }}
    />
  );
}

/* ── Inner content — inside providers so DataErrorGate can read hooks ── */

function PageContent() {
  const [sceneReady, setSceneReady] = useState(false);
  return (
    <>
      <SplashScreen loading={!sceneReady} />
      <div style={{ width: "100vw", height: "100vh" }}>
        <SolarSystem onReady={() => setSceneReady(true)} />
      </div>
      <DataErrorGate />
    </>
  );
}

/* ── Exported page (wraps providers) ──────────────────────── */

export default function Page() {
  return (
    <FlambeurProvider>
      <WalletProvider>
        <VestingProvider>
          <PoolProvider>
            <StakingRemnantProvider>
              <HyperlaneBridgeProvider>
                <CanonicalBridgeProvider>
                  <PageContent />
                </CanonicalBridgeProvider>
              </HyperlaneBridgeProvider>
            </StakingRemnantProvider>
          </PoolProvider>
        </VestingProvider>
      </WalletProvider>
    </FlambeurProvider>
  );
}
