# Sector Galactica — CLAUDE.md

## What this project is

A 3D interactive visualization of the **Galactica blockchain** (chain ID 613419) rendered as a solar system. Wallet addresses become celestial bodies — planets, moons, rings, or asteroids — based on their token holdings and tier. Live blockchain data is fetched via API routes, cached in Upstash Redis, and visualized using React Three Fiber.

## Tech stack

- **Next.js 14** (App Router, `app/` directory)
- **React 18** — all scene components are `"use client"`
- **Three.js 0.170 + React Three Fiber + Drei** — all 3D rendering
- **TypeScript 5.7** — strict, no `any` shortcuts
- **ethers v6** — wallet connection and RPC contract calls
- **Upstash Redis** (`lib/redis.ts`) — caching blockchain scan results
- **Vercel Analytics** — passive, no configuration needed
- Custom **GLSL shaders** as inline TypeScript string templates

## Directory structure

```
app/
  api/           — Next.js API routes (one folder per feature)
  page.tsx       — Entry point, mounts <SolarSystem>
components/      — React + R3F components (all "use client")
  systemHud/     — HUD overlay sub-components
  sun/           — Star visual sub-components
  transitBeacon/ — Transit beacon visuals
hooks/           — Data fetching via React Context + useReducer
lib/
  layout/        — Pure solar-system layout engine (no React/Three)
  shaders/       — GLSL as TS string constants
  blockExplorer/ — Pure blockchain event classifier + type contracts
  *.ts           — Shared utilities, types, formatters
scripts/         — Blockchain scan scripts (run with tsx)
```

## Key architectural patterns

### State management
All data hooks follow the same pattern: `React.createContext` + `useReducer` with a typed `Action` union and an `initialState`. Examples: `useWallets`, `useVestingWallets`, `usePoolTokens`, `useCanonicalBridge`, `useHyperlaneBridge`, `useFlambeurWallets`, `useStakingRemnant`.

### Pure lib layer
Files under `lib/` are intentionally free of React and Three.js. File headers explicitly note "no React, no Three.js" where that matters. Keep it that way — don't import React or Three into `lib/`.

### API routes
All live-data routes export `export const dynamic = "force-dynamic"` to prevent caching. Redis-backed routes fetch via Upstash and return pre-computed payloads.

### GLSL shaders
Shaders live in `lib/shaders/` as TypeScript string constants named `VERT`, `FRAG`, `HEIGHT_FN`. Planet variants are in `lib/shaders/planets/`. Don't move them inline into components.

## Scene systems

| System ID | Description |
|---|---|
| `vescrow` | Main wallet star system |
| `vesting` | RewardDistributor vesting system |
| `gubi-pool` | gUBI liquidity pool |
| `staking-remnant` | Staking — rendered as a lone dying star |
| `flambeur` | Flambeur star system |

## Wallet tiers

`planet` > `moon` > `ring` > `asteroid`

Tier assignment drives planet type (gas giant, terrestrial, rocky, etc.) and orbit position via `lib/layout/`.

## Blockchain constants

- **Chain ID**: 613419 (Galactica Mainnet)
- **RPC**: `https://galactica-mainnet.g.alchemy.com/public` (also in `process.env.RPC_URL`)
- **Redis**: `process.env.UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`

## Scripts

```bash
npm run scan          # scan-and-update.ts — main blockchain scan → Redis
npm run scan:seed     # same with SEED=true (full rescan from genesis)
tsx scripts/scan-flambeur.ts
tsx scripts/scan-vesting.ts
```

## Working style

### Planning
- Enter plan mode for any non-trivial task (3+ steps or architectural decisions)
- If something goes wrong, stop and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### Subagents
- Use subagents frequently to keep the main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute via subagents
- One task per subagent for focused execution

### Self-improvement
- After any correction, update `tasks/lessons.md` with the pattern
- Write rules to prevent repeating the same mistake
- Review lessons at the start of each session

### Verification
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Run tests, check logs, and demonstrate correctness

### Elegance (balanced)
- For non-trivial changes, ask: "Is there a more elegant solution?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution."
- Skip for simple fixes — don't over-engineer

### Bug fixing
- When given a bug report: just fix it
- Use logs, errors, and failing tests to diagnose
- Fix failing CI tests automatically

### Task management
1. **Plan first** — write the plan in `tasks/todo.md` with checkable items
2. **Verify plan** — confirm the plan before implementation
3. **Track progress** — mark items complete as you go
4. **Explain changes** — provide a high-level summary at each step
5. **Capture lessons** — update `tasks/lessons.md` after corrections

### Core principles
- **Simplicity first** — make every change as simple as possible, minimize code impact
- **No laziness** — find root causes, avoid temporary fixes, maintain senior-level standards

## What to avoid

- Don't import React or Three.js into `lib/` files
- Don't inline GLSL into component files — put it in `lib/shaders/`
- Don't add ISR revalidation to routes that need live data (`force-dynamic` is intentional)
- Don't use `any` — type everything, including ethers contract call results
- Don't put layout math in components — it belongs in `lib/layout/`
