# Codebase Structure

**Analysis Date:** 2026-03-22

## Directory Layout

```
project-root/
├── app/                         # Next.js App Router pages and API routes
│   ├── api/                     # Server API endpoints (RPC, data aggregation)
│   │   ├── auth/nonce/          # SIWE challenge generation
│   │   ├── block/               # Block data and transaction monitoring
│   │   ├── bug-report/          # Client-side bug report submission
│   │   ├── canonical/           # Canonical bridge telemetry
│   │   ├── faucet/              # Faucet stats endpoint
│   │   ├── hyperlane/           # Hyperlane bridge telemetry
│   │   ├── planet-name/         # Custom planet name management
│   │   ├── pool/                # Pool token and redemption data
│   │   ├── staking/             # Staking telemetry
│   │   ├── vesting/             # Vesting claimant data
│   │   └── wallets/             # Wallet registry and voting power data
│   ├── layout.tsx               # Root layout (metadata, fonts, Analytics)
│   ├── page.tsx                 # Root page (data providers, SolarSystem)
│   ├── globals.css              # Root CSS
│   ├── error.tsx                # Error boundary
│   ├── loading.tsx              # Loading UI
│   └── not-found.tsx            # 404 page
├── components/                  # React UI and Three.js scene components (51 .tsx files)
│   ├── SolarSystem.tsx          # Main orchestration (38KB) — scene composition, state management
│   ├── SceneCanvas.tsx          # Three.js Canvas and scene root (22KB)
│   ├── SystemHud.tsx            # Large main UI panel (66KB) — system display, navigation
│   ├── CameraController.tsx     # Camera mode state machine (16KB)
│   ├── FreeLookControls.tsx     # Free-look camera controller (29KB)
│   ├── HudToolbar.tsx           # Top toolbar and buttons (15KB)
│   ├── FlyHud.tsx               # Flying/navigation HUD (13KB)
│   ├── HelpPanel.tsx            # Help documentation panel (17KB)
│   ├── OnboardingOverlay.tsx    # First-time user overlay (11KB)
│   ├── AppStateScreen.tsx       # Generic error/loading states (6KB)
│   ├── PlanetWallet.tsx         # Planet Three.js component (18KB)
│   ├── MoonBody.tsx             # Moon Three.js component (7KB)
│   ├── AsteroidBelt.tsx         # Asteroid belt rendering (13KB)
│   ├── Comet.tsx                # Animated comet effect (24KB)
│   ├── RoguePlanet.tsx          # Rogue planet body (6KB)
│   ├── SolarWind.tsx            # Solar wind particle effect (5KB)
│   ├── TransactionFlow.tsx      # Transaction visualization beam/flow
│   ├── CanonicalBridgePortal.tsx # Bridge portal visualization (7KB)
│   ├── HyperlanePortal.tsx      # Hyperlane portal visualization (11KB)
│   ├── TransitBeacon.tsx        # Transit beacon marker
│   ├── GalaxyBackground.tsx     # Star field background (10KB)
│   ├── SunLensFlare.tsx         # Sun lens flare effect (9KB)
│   ├── StrongSystem.tsx         # Star system core rendering (9KB)
│   ├── SputnikProbe.tsx         # Sputnik probe satellite (10KB)
│   ├── EpochSatellite.tsx       # Epoch tracker satellite (10KB)
│   ├── FaucetSatellite.tsx      # Faucet satellite (8KB)
│   ├── OrbitRing.tsx            # Orbit ring visualization (2KB)
│   ├── BridgeObject.tsx         # Bridge object rendering (3KB)
│   ├── SpriteLabel.tsx          # Text label manager for addresses (4KB)
│   ├── WalletInfoBanner.tsx     # Wallet info display
│   ├── WalletTooltip.tsx        # Hover tooltip for wallets
│   ├── TrafficPanel.tsx         # Transaction traffic display
│   ├── DirectoryPanel.tsx       # Wallet/system directory (5KB)
│   ├── BugReportPanel.tsx       # Bug report form (7KB)
│   ├── FloatingTooltip.tsx      # Generic floating tooltip (6KB)
│   ├── TopStrip.tsx             # Top status bar (5KB)
│   ├── ToolbarButton.tsx        # Reusable button component (6KB)
│   ├── SystemPopups.tsx         # Popup menus (12KB)
│   ├── SplashScreen.tsx         # Loading splash (10KB)
│   ├── ProtoplanetaryDisk.tsx   # Disk effect rendering (12KB)
│   └── [other minor components]
├── hooks/                       # React Context providers and custom hooks (15 files)
│   ├── useWallets.tsx           # Main wallet data provider
│   ├── useVestingWallets.tsx    # Vesting data provider
│   ├── usePoolTokens.tsx        # Pool token data provider
│   ├── useStakingRemnant.tsx    # Staking data provider
│   ├── useHyperlaneBridge.tsx   # Hyperlane bridge provider
│   ├── useCanonicalBridge.tsx   # Canonical bridge provider
│   ├── useBlock.ts              # Block data hook (polling)
│   ├── useBlockTransactions.ts  # Block transactions hook
│   ├── useFaucet.ts             # Faucet stats hook
│   ├── useRedeemBasket.ts       # Pool redeem basket hook
│   ├── useWalletConnection.ts   # Web3 wallet connection hook
│   ├── useIsMobile.ts           # Responsive design hook
│   ├── useOnboarding.ts         # Onboarding state hook
│   ├── useRankSnapshot.ts       # Rank snapshot tracking
│   └── usePanelSwap.ts          # UI panel swap state
├── lib/                         # Utilities, layout computation, types (14 files + 3 subdirs)
│   ├── types.ts                 # Core data types (WalletEntry, VestingWalletEntry, PoolTokenEntry, etc.)
│   ├── sceneSystems.ts          # Scene system definitions (Vesting, Pool, Staking systems)
│   ├── sceneRegistry.ts         # Body lookup by address (planets, moons, asteroids)
│   ├── photoTargets.ts          # Camera bookmarks
│   ├── bridges.ts               # Bridge configuration and scene objects
│   ├── hyperlane.ts             # Hyperlane-specific logic
│   ├── transitBeacon.ts         # Transit beacon marker logic
│   ├── shortcuts.ts             # Keyboard shortcuts
│   ├── formatBalance.ts         # Format wei to GNET
│   ├── formatUsd.ts             # Format USD values
│   ├── geometryPool.ts          # Three.js geometry reuse pool
│   ├── redis.ts                 # Redis client setup
│   ├── rankSnapshot.ts          # Rank snapshot management
│   ├── glsl.ts                  # GLSL shader utility functions
│   ├── layout/                  # Celestial body layout computation
│   │   ├── index.ts             # Main orchestrator (buildSolarSystem, buildVestingSystem, etc.)
│   │   ├── types.ts             # PlanetData, MoonData, AsteroidData, etc.
│   │   ├── constants.ts         # Rank tiers, orbit radii, speeds, etc.
│   │   ├── helpers.ts           # Math helpers (weiToFloat, frac, planetTypeByRank)
│   │   ├── planetLayout.ts      # Compute planet sizing, types, orbits
│   │   ├── moonLayout.ts        # Distribute moons across planets
│   │   ├── ringLayout.ts        # Build ring particles
│   │   ├── asteroidLayout.ts    # Generate asteroid positions
│   │   ├── poolLayout.ts        # Pool-specific layout (rank → body)
│   │   ├── vestingLayout.ts     # Vesting-specific layout (entitled → body)
│   │   └── stakingRemnantLayout.ts # Staking-specific layout
│   ├── blockExplorer/           # Transaction classification and effects
│   │   ├── classifyTransactions.ts # Map tx to type (staking, vesting, bridge)
│   │   ├── mapEventsToSceneEffects.ts # Emit scene effects for transactions
│   │   └── types.ts             # TransactionFlowEffect, etc.
│   └── shaders/                 # GLSL shader sources
│       ├── planets/             # Planet surface shaders
│       └── [other shader groups]
├── scripts/                     # Maintenance and build scripts (TypeScript + Python)
│   ├── scan-and-update.ts       # Scan blockchain for new wallets, update data
│   ├── scan-vesting.ts          # Scan vesting contract state
│   ├── add_title_overlay.py     # Add titles to rendered images
│   └── _inter_cache/            # Cached intermediate data
├── public/                      # Static assets (images, icons, etc.)
│   ├── icon.svg                 # App icon
│   ├── image.png                # OG image
│   └── [other assets]
├── .github/                     # GitHub workflows and config
│   └── workflows/               # CI/CD pipelines
├── .planning/                   # Planning and analysis documents
│   └── codebase/                # This codebase documentation
├── package.json                 # npm dependencies
├── tsconfig.json                # TypeScript configuration
├── next.config.mjs              # Next.js configuration
├── vercel.json                  # Vercel deployment config
└── [root config files]
```

## Directory Purposes

**`app/`:**
- Purpose: Next.js App Router structure (pages, layouts, API routes)
- Contains: Page components, route handlers, root layout, error boundaries
- Key files: `page.tsx` (entry point), `layout.tsx` (metadata), `api/` routes

**`components/`:**
- Purpose: All React UI and Three.js scene components
- Contains: 51 .tsx files ranging from 2KB to 66KB
- Key files: `SolarSystem.tsx` (orchestrator), `SceneCanvas.tsx` (3D root), `SystemHud.tsx` (main UI)

**`hooks/`:**
- Purpose: React Context providers and custom hooks for data management
- Contains: 15 files implementing fetch/polling and state distribution
- Key files: `useWallets.tsx`, `useVestingWallets.tsx`, `usePoolTokens.tsx` (data providers)

**`lib/`:**
- Purpose: Utilities, type definitions, and business logic
- Contains: Types, layout builders, shader definitions, formatters
- Key files: `types.ts` (core types), `layout/` (position computation), `blockExplorer/` (tx classification)

**`scripts/`:**
- Purpose: Backend maintenance scripts for blockchain scanning and data updates
- Contains: TypeScript and Python utilities
- Key files: `scan-and-update.ts` (wallet scanner), `scan-vesting.ts` (vesting scanner)

**`public/`:**
- Purpose: Static assets served via CDN
- Contains: Icons, images, fonts (fonts served via Google Fonts in layout.tsx)

## Key File Locations

**Entry Points:**

- `app/page.tsx`: React root, mounts data providers and SolarSystem
- `app/layout.tsx`: Next.js metadata, global fonts, Analytics
- `components/SolarSystem.tsx`: Scene orchestration and data coordination

**Configuration:**

- `package.json`: npm dependencies (Next.js, React, Three.js, ethers)
- `tsconfig.json`: TypeScript config with path alias `@/*` → root
- `next.config.mjs`: Next.js build config
- `vercel.json`: Vercel deployment hints

**Core Logic:**

- `lib/types.ts`: All data type definitions (WalletEntry, VestingWalletEntry, PoolTokenEntry, etc.)
- `lib/sceneSystems.ts`: Scene system definitions (Vesting, Pool, Staking)
- `lib/layout/index.ts`: Layout orchestrator (buildSolarSystem, buildVestingSystem, etc.)
- `lib/blockExplorer/classifyTransactions.ts`: Transaction-to-effect mapping
- `lib/bridges.ts`: Bridge configuration and scene object definitions

**Testing:**

- No dedicated test files found; testing configuration not present
- Bug reporting via `components/BugReportPanel.tsx` and `/api/bug-report` endpoint

**API Routes:**

- `app/api/wallets/`: Main wallet registry endpoint
- `app/api/vesting/`: Vesting system data
- `app/api/pool/`: Pool tokens and redemption
- `app/api/block/`: Latest block and transactions
- `app/api/staking/`, `app/api/hyperlane/`, `app/api/canonical/`: Bridge/staking data

## Naming Conventions

**Files:**

- **Components:** PascalCase, one component per file (e.g., `PlanetWallet.tsx`, `SolarSystem.tsx`)
- **Hooks:** camelCase with `use` prefix (e.g., `useWallets.tsx`, `useBlock.ts`)
- **Utilities:** camelCase (e.g., `formatBalance.ts`, `bridges.ts`)
- **API routes:** `route.ts` in directory structure (e.g., `app/api/wallets/route.ts`)
- **Types:** `types.ts` as module (e.g., `lib/types.ts`, `lib/layout/types.ts`)

**Directories:**

- **Features:** camelCase or kebab-case (e.g., `blockExplorer/`, `planetLayout/`)
- **API paths:** kebab-case (e.g., `/api/block-txs/route.ts`, `/api/bug-report/route.ts`)
- **Nested routes:** Reflect URL structure (e.g., `app/api/pool/redeem/route.ts` → POST `/api/pool/redeem`)

**Code Symbols:**

- **Types/Interfaces:** PascalCase (e.g., `WalletEntry`, `SceneSystemDefinition`)
- **Functions:** camelCase (e.g., `buildSolarSystem()`, `formatBalance()`)
- **Constants:** UPPER_SNAKE_CASE (e.g., `PLANET_COUNT`, `MOON_END_RANK`)
- **React Hooks/Providers:** camelCase with `use` prefix (e.g., `useWallets()`, `WalletProvider`)

## Where to Add New Code

**New Feature (e.g., new data endpoint):**
- API route: `app/api/[feature]/route.ts`
- Hook/Provider: `hooks/use[Feature].tsx`
- Types: Add to `lib/types.ts` or `lib/[feature]/types.ts`
- Integration point: Import hook in `components/SolarSystem.tsx`, add to page.tsx provider chain

**New Three.js Component (e.g., new celestial body):**
- Component: `components/[BodyName].tsx`
- If part of planet system, import in `components/SolarSystem.tsx` or `components/SceneCanvas.tsx`
- Add type definition to `lib/sceneSystems.ts` (SceneGlobalObject or SceneSystemDecorator)
- Coordinate data: Build in layout builder or pass from SolarSystem props

**New Layout Variation (e.g., new ranking system):**
- Layout builder: `lib/layout/[systemName]Layout.ts`
- Types: Add to `lib/layout/types.ts`
- Export from: `lib/layout/index.ts`
- Integration: Call builder in `components/SolarSystem.tsx`, import scene definition

**New UI Panel:**
- Component: `components/[PanelName].tsx`
- State management: Add state to `components/SolarSystem.tsx` or custom hook if complex
- Display: Render in `components/SystemHud.tsx` or conditionally in SolarSystem based on state

**Utilities/Helpers:**
- Shared logic: `lib/[domain].ts`
- Layout math: `lib/layout/helpers.ts`
- Three.js helpers: `lib/geometryPool.ts` or new `lib/[feature].ts`

## Special Directories

**`.next/`:**
- Purpose: Next.js build output
- Generated: Yes (by `npm run build`)
- Committed: No (in .gitignore)

**`node_modules/`:**
- Purpose: npm dependencies
- Generated: Yes (by `npm install`)
- Committed: No (in .gitignore)

**`scripts/_inter_cache/`:**
- Purpose: Cache for intermediate data during blockchain scanning
- Generated: Yes (by `npm run scan`)
- Committed: No (in .gitignore)

**`.planning/codebase/`:**
- Purpose: Generated codebase documentation
- Generated: Yes (by GSD analysis)
- Committed: Yes (for version control and team reference)

---

*Structure analysis: 2026-03-22*
