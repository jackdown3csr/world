# Architecture

**Analysis Date:** 2026-03-22

## Pattern Overview

**Overall:** Layered Client-Server with Real-Time 3D Visualization

**Key Characteristics:**
- Next.js 14 App Router serving a 3D celestial visualization built with Three.js and React Three Fiber
- Server-side data aggregation (wallets, vesting, pools, bridges) exposed via REST API routes
- Client-side React Context providers manage polling and distribute data to the 3D scene
- Layout computation layer translates wallet data into celestial body positions, orbits, and types
- Scene orchestration through modular Three.js components (planets, moons, asteroids, etc.)
- Real-time block monitoring and transaction visualization overlaid on the 3D scene

## Layers

**API Layer:**
- Purpose: Server-side data aggregation and blockchain RPC proxying
- Location: `app/api/`
- Contains: Route handlers for wallets, vesting, pools, staking, bridges, block data
- Depends on: Next.js server runtime, ethers.js for RPC calls, external data sources (blockchain, databases)
- Used by: Client-side hooks via fetch requests

**Data Access Layer:**
- Purpose: Manage polling and distribution of blockchain and contract data
- Location: `hooks/` (15 custom hooks using React Context)
- Contains: Data providers (WalletProvider, VestingProvider, PoolProvider, StakingRemnantProvider, HyperlaneBridgeProvider, CanonicalBridgeProvider)
- Depends on: API routes, React Context
- Used by: SolarSystem component and child components

**Layout & Geometry Layer:**
- Purpose: Transform wallet ranks and data into 3D coordinates, orbital mechanics, body types
- Location: `lib/layout/` (planetLayout.ts, moonLayout.ts, ringLayout.ts, asteroidLayout.ts)
- Contains: Functions that compute planet sizing, orbit radii, moon distributions, ring particles
- Depends on: Wallet data (WalletEntry), constants defining rank-to-celestial-body mappings
- Used by: SolarSystem component to build scene data

**Scene System Registry:**
- Purpose: Define and track secondary "solar systems" (Vesting, Pool, Staking) with their own layouts
- Location: `lib/sceneSystems.ts`
- Contains: Type definitions for SceneSystemDefinition, SceneSystemDecorator, SceneEffectDefinition
- Depends on: Layout types, wallet entry types, transaction flow effects
- Used by: SolarSystem orchestration, scene navigation

**3D Rendering Layer:**
- Purpose: Render celestial bodies, visual effects, camera controls
- Location: `components/`
- Contains:
  - Core: `SceneCanvas.tsx` (WebGL root), `CameraController.tsx`, `FreeLookControls.tsx`
  - Bodies: `PlanetWallet.tsx`, `MoonBody.tsx`, `AsteroidBelt.tsx`
  - Effects: `Comet.tsx`, `RoguePlanet.tsx`, `SolarWind.tsx`, `TransactionFlow.tsx`
  - Portals: `CanonicalBridgePortal.tsx`, `HyperlanePortal.tsx`
  - HUD: `SystemHud.tsx`, `FlyHud.tsx`, `HudToolbar.tsx`
- Depends on: React Three Fiber, Three.js, scene system definitions, data from hooks
- Used by: SolarSystem orchestration

**UI/UX Layer:**
- Purpose: Overlay panels, tooltips, navigation, alerts
- Location: `components/` (non-Three.js)
- Contains: `SystemHud.tsx` (large 66KB main UI), `OnboardingOverlay.tsx`, `HelpPanel.tsx`, `BugReportPanel.tsx`
- Depends on: Scene system state, wallet/vesting/pool data
- Used by: SolarSystem, displayed via imperative state management

**Orchestration Layer:**
- Purpose: Connect all layers, manage scene composition and interaction
- Location: `components/SolarSystem.tsx` (38KB main orchestrator)
- Contains: Data aggregation from hooks, scene building (planets, systems, effects), camera/UI state machine
- Depends on: All data hooks, layout builders, scene definitions, 3D components
- Used by: Page root layout

## Data Flow

**Data Load Flow:**

1. Page mounts, SolarSystem component initializes
2. Multiple data providers (Wallet, Vesting, Pool, Staking, Hyperlane, Canonical) begin polling `/api/*` routes
3. Hooks dispatch fetch actions, storing results in React Context
4. SolarSystem component reads context values with `useWallets()`, `useVestingWallets()`, etc.
5. SolarSystem passes data to layout builders: `buildSolarSystem()`, `buildVestingSystem()`, etc.
6. Layout builders return `SolarSystemData` (planets with moons, asteroids, belt bounds)
7. SceneCanvas receives system data as props and renders Three.js scene
8. SpriteLabel manager tracks wallet addresses and renders labels on top of bodies

**Real-Time Block Monitoring Flow:**

1. `useBlockTransactions()` hook polls `/api/block` and `/api/block/txs` (latest block number and transactions)
2. `mapEventsToSceneEffects()` classifies transactions by type (staking, vesting, bridge, etc.)
3. Effects emit as `SceneEffectDefinition[]` array
4. `TransactionFlow` component animates visual effects (comets, beams) in the 3D scene
5. `SystemHud` traffic panel displays labeled transaction chips

**State Management:**

- **Data state:** React Context + useReducer in each provider hook
- **UI state:** Local component state in SolarSystem (currentSystem, cameraMode, selectedWallet, etc.)
- **3D state:** Refs and imperative Three.js calls (OrbitControls, FreeLookControls)
- **Persistent:** Client-side onboarding state (localStorage), camera bookmarks

## Key Abstractions

**Scene System:**
- Purpose: Represent self-contained "worlds" (Vesting, Pool, Staking) alongside main solar system
- Examples: `lib/sceneSystems.ts` defines `SceneSystemDefinition` interface
- Pattern: Each system has same layout builder pattern applied (rank → celestial body), but with different data sources
- Navigation: User can "fly to" any system via spatial coordinates in 3D scene

**Celestial Body Hierarchy:**
- Purpose: Map wallet ranks to planet/moon/ring/asteroid tiers
- Wallets ranked 1–20 by votingPower → planets (with type: gas_giant, ice_giant, terrestrial, rocky)
- Wallets ranked 21–60 → moons (distributed across planet systems, max 3 per planet)
- Wallets ranked 61–190 → ring particles (orbit the highest-ranked planet, "Saturn")
- Wallets ranked 191+ → asteroids (distributed in asteroid belt)
- Examples: `lib/layout/planetLayout.ts`, `lib/layout/moonLayout.ts`

**Three.js Component Pattern:**
- Purpose: Encapsulate rendering logic for each body type
- Examples: `PlanetWallet.tsx` (shader-driven planet rendering), `Comet.tsx` (animated particle trail)
- Pattern: Each component receives data via props, renders geometries/meshes inside Canvas, optionally forwards ref handles
- Composability: Multiple bodies nest inside SceneCanvas; effects like Comet can spawn/despawn

**Transaction Effect Classification:**
- Purpose: Parse blockchain transactions and map to scene effects
- Location: `lib/blockExplorer/classifyTransactions.ts` and `mapEventsToSceneEffects.ts`
- Pattern: Classify by recipient address and method signature, emit `SceneEffectDefinition` or `TransactionFlowEffect`
- Examples: Staking detected via `STAKING_ADDRESS` → block-pulse on staking system; Hyperlane via `HYPERLANE_MAILBOX` → beam effect

**Photo Target System:**
- Purpose: Define scenic camera bookmarks throughout the 3D space
- Location: `lib/photoTargets.ts`
- Pattern: Array of named positions with camera target, buildPhotoTargetSections() compiles into UI sections
- Examples: "Sol", "Saturn Rings", "Asteroid Belt", scene-specific photo targets

## Entry Points

**Server Entry Points:**

**`app/api/wallets/route.ts`:**
- Location: `app/api/wallets/route.ts`
- Triggers: Client-side fetch() from useWallets() hook, polled every 30s
- Responsibilities: Aggregate wallet data from blockchain scanner/cache, return `WalletsPayload`

**`app/api/vesting/route.ts`:**
- Location: `app/api/vesting/route.ts`
- Triggers: Client-side fetch() from useVestingWallets() hook
- Responsibilities: Return vesting claimant data with current epoch, totalEntitled, totalClaimed

**`app/api/block/route.ts`:**
- Location: `app/api/block/route.ts`
- Triggers: Client-side fetch() from useBlock() hook
- Responsibilities: Return latest block number and timestamp via RPC

**`app/api/block/txs/route.ts`:**
- Location: `app/api/block/txs/route.ts`
- Triggers: Client-side fetch() from useBlockTransactions() hook
- Responsibilities: Return transactions in a block range, enable real-time monitoring

**Client Entry Points:**

**`app/page.tsx`:**
- Location: `app/page.tsx`
- Triggers: Browser navigates to "/" (root)
- Responsibilities: Wrap SolarSystem with data providers, mount 3D scene

**`components/SolarSystem.tsx`:**
- Location: `components/SolarSystem.tsx`
- Triggers: Page mounts SolarSystem
- Responsibilities: Orchestrate all data sources, compose scene, manage camera/UI state

**`components/SceneCanvas.tsx`:**
- Location: `components/SceneCanvas.tsx`
- Triggers: SolarSystem renders it
- Responsibilities: Set up Three.js Canvas, render all 3D bodies and effects

## Error Handling

**Strategy:** Graceful degradation with retry prompts

**Patterns:**

- **Data fetch failures:** Each provider hook catches errors, stores error message in state
- **DataErrorGate component:** In `page.tsx`, monitors all data providers for errors; if any fails, displays AppStateScreen with "try again" action
- **RPC failures:** `/api/block` and other RPC routes return 503 on RPC unavailable
- **Network timeouts:** Handled by fetch() catch in each hook; stored as error, user can refetch
- **3D rendering crashes:** Not explicitly handled; Three.js console errors logged only
- **Missing environment variables:** Scripts (scan-and-update.ts) log warnings and continue with defaults

## Cross-Cutting Concerns

**Logging:**
- Client: Browser console.log only (no external logging service)
- Server: Node.js console.log in API routes and scripts; Vercel logs captured for production

**Validation:**
- RPC responses validated with basic type checks (e.g., `json.error` check in block route)
- Wallet address validation uses simple format check (no full EIP-55)
- Transaction signature matching via substring search (method selectors)

**Authentication:**
- No authentication layer; all API routes are public
- User identity derived from wallet address input in UI (not signed)
- Nonce API (`/api/auth/nonce`) provides Siwe challenge text but not enforced

**Caching:**
- API routes set `Cache-Control: no-store` for real-time data
- Browser caches static assets (Next.js default)
- Upstash Redis used for optional backend caching (see `lib/redis.ts`)

---

*Architecture analysis: 2026-03-22*
