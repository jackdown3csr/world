# Technology Stack

**Analysis Date:** 2026-03-22

## Languages

**Primary:**
- TypeScript 5.7.2 - Application and API code
- JavaScript - Configuration files (Next.js config, eslint, etc.)

**Secondary:**
- Python 3.x - Utility scripts (e.g., `scripts/add_title_overlay.py`)

## Runtime

**Environment:**
- Node.js (version managed via .nvmrc or inferred from Next.js 14.2)

**Package Manager:**
- npm - Version 10+ (based on package-lock.json)
- Lockfile: `package-lock.json` (present)

## Frameworks

**Core:**
- Next.js 14.2.21 - Full-stack React framework with App Router
- React 18.3.1 - UI library
- React DOM 18.3.1 - React rendering

**3D Graphics:**
- Three.js 0.170.0 - 3D scene library
- @react-three/fiber 8.17.10 - React bindings for Three.js
- @react-three/drei 9.114.3 - Utility components and helpers for Three.js

**Testing:**
- Not detected (no test framework in dependencies)

**Build/Dev:**
- TypeScript 5.7.2 - Type checking and compilation
- tsx 4.19.2 - TypeScript Node.js executor for scripts
- cross-env 7.0.3 - Cross-platform environment variable management

## Key Dependencies

**Critical:**
- ethers 6.13.4 - Ethereum library for contract interaction, RPC calls, and wallet utilities (address validation, random bytes generation)
- @upstash/redis 1.34.3 - Redis client for Upstash KV store (wallet data, scanning state, planet names, auth nonces)

**Infrastructure:**
- @vercel/analytics 1.6.1 - Vercel analytics integration for frontend telemetry
- @types/node 22.10.2 - Node.js type definitions
- @types/react 18.3.18 - React type definitions
- @types/react-dom 18.3.5 - React DOM type definitions
- @types/three 0.170.0 - Three.js type definitions

## Configuration

**Environment:**
- TypeScript compiler: `tsconfig.json` (ES2020 target, strict mode enabled)
- Next.js config: `next.config.mjs` (transpiles Three.js as ESM)
- Path aliases: `@/*` resolves to project root (e.g., `@/lib/redis` → `lib/redis.ts`)

**Build:**
- Next.js App Router (located in `app/`)
- API routes (located in `app/api/`)
- Static assets in `public/`
- Global styles in `app/globals.css`

## Platform Requirements

**Development:**
- Node.js runtime
- Git (for version control)
- npm (package manager)
- Editor with TypeScript support

**Production:**
- Deployment target: Vercel (indicated by `vercel.json` with `"framework": "nextjs"`)
- Requires: Upstash Redis for data storage
- Requires: Galactica mainnet RPC endpoint (Alchemy or custom)
- Optional: Discord webhook for bug reporting
- Optional: Admin panel API for pool data (`admin-panel.galactica.com`)

## npm Scripts

```
dev              # Start Next.js dev server
build            # Build Next.js project
start            # Start Next.js production server
lint             # Run Next.js linter (eslint)
scan             # Run wallet scanner (incremental mode)
scan:seed        # Force full rescan from block 0
```

---

*Stack analysis: 2026-03-22*
