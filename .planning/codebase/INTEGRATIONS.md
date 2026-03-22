# External Integrations

**Analysis Date:** 2026-03-22

## APIs & External Services

**Blockchain RPC:**
- Galactica Mainnet RPC - Queries blockchain state and transaction logs
  - SDK/Client: `ethers` (JsonRpcProvider)
  - Default: `https://galactica-mainnet.g.alchemy.com/public` (Alchemy public RPC)
  - Configurable: `RPC_URL` environment variable
  - Used by: `app/api/block/route.ts`, `app/api/block/txs/route.ts`, `app/api/canonical/route.ts`, `app/api/faucet/route.ts`, `app/api/hyperlane/route.ts`, `app/api/pool/route.ts`, `app/api/pool/redeem/route.ts`, `app/api/staking/route.ts`, `app/api/vesting/route.ts`, `scripts/scan-and-update.ts`

**Admin Panel Pool API:**
- Galactica Admin Panel API - Fetch pool composition, token pricing, stats
  - Endpoint: `https://admin-panel.galactica.com/api/pool?chainId=613419`
  - Endpoint: `https://admin-panel.galactica.com/api/stats?chainId=613419`
  - Used by: `app/api/pool/route.ts`
  - Response includes: Total value, token composition, prices, distribution stats

**Bug Reporting:**
- Discord Webhook - Receives user bug reports with context
  - SDK/Client: Fetch API (POST)
  - Auth: Webhook URL in environment
  - Env var: `DISCORD_WEBHOOK_URL`
  - Endpoint: `app/api/bug-report/route.ts`
  - Payload: Reporter name, wallet address, context label, user agent, message

## Data Storage

**Primary Database:**
- Upstash Redis - Serverless Redis for data persistence
  - Connection method: REST API
  - Client: `@upstash/redis`
  - Environment vars: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
  - Fallback (Vercel KV): `KV_REST_API_URL`, `KV_REST_API_TOKEN` (alternate env vars for Vercel KV integration)
  - Client initialization: `lib/redis.ts`

**Redis Key Structure:**
- `wallets:payload` - WalletsPayload (wallet data, ranks, voting power)
- `wallet:tiers` - Hash map of address → tier/rank info
- `planet:names` - Hash map of address → custom planet names
- `planet:orbits` - Hash map of address → orbit slot index (0-19)
- `vesting:payload` - VestingPayload (vesting claimant data)
- `bridge:hyperlane:payload` - HyperlaneBridgePayload (transfer history)
- `bridge:hyperlane:lastProcessedBlock` - Last block scanned for Hyperlane
- `bridge:canonical:payload` - CanonicalBridgePayload (withdrawal history)
- `bridge:canonical:lastProcessedBlock` - Last block scanned for Canonical bridge
- `auth:nonce:<address>` - Short-lived signature nonces (10-min TTL)

**File Storage:**
- Not applicable - No persistent file storage; uses Redis

**Caching:**
- Next.js built-in caching - Revalidation-based caching for RPC calls
- Redis acts as distributed cache layer across deployments

## Authentication & Identity

**Auth Provider:**
- Custom wallet-based authentication (SIWE-style)
  - Implementation: Signature-based nonce verification
  - Endpoint: `app/api/auth/nonce/route.ts` (issues nonce)
  - Nonce generation: 16 random bytes (via ethers.randomBytes)
  - Nonce storage: Redis with 600-second TTL
  - No traditional session/JWT found in this codebase; frontend likely handles signature verification

## Monitoring & Observability

**Error Tracking:**
- Not detected in core application

**Logs:**
- Console logging (standard Node.js/Next.js approach)
- Vercel provides request/runtime logs via deployment platform

**Analytics:**
- Vercel Analytics - Frontend performance and user analytics
  - Package: `@vercel/analytics/next`
  - Integrated in: `app/layout.tsx`
  - Tracks: Page views, Web Vitals, user interactions

## CI/CD & Deployment

**Hosting:**
- Vercel - Next.js optimized deployment platform
  - Config: `vercel.json` (declares framework as "nextjs")

**CI Pipeline:**
- Not detected - Likely managed by Vercel (Git push → auto-deploy)

**Build Output:**
- `.next/` - Built application (gitignored in typical Next.js projects)
- `tsconfig.tsbuildinfo` - TypeScript incremental build info

## Environment Configuration

**Required env vars:**
- `UPSTASH_REDIS_REST_URL` - Upstash Redis URL
- `UPSTASH_REDIS_REST_TOKEN` - Upstash Redis API token
- `RPC_URL` (optional) - Custom Galactica RPC endpoint (defaults to Alchemy public)

**Optional env vars:**
- `DISCORD_WEBHOOK_URL` - Discord webhook for bug reports (feature disabled if not set)
- `KV_REST_API_URL`, `KV_REST_API_TOKEN` - Vercel KV integration (used if Upstash not configured)
- `NEXT_PUBLIC_POLL_INTERVAL_MS` - Frontend polling interval (default 30000ms)
- `START_BLOCK`, `END_BLOCK`, `MAX_BLOCKS_PER_RUN` - Scanner configuration
- `SEED` - Force full rescan (`true`/`false`)

**Secrets location:**
- `.env.local` - Local development secrets (gitignored)
- Vercel project settings - Production secrets

**Example env file:**
See `.env.example` for template structure.

## Webhooks & Callbacks

**Incoming:**
- `/api/bug-report` (POST) - Receives user bug reports; sends to Discord webhook

**Outgoing:**
- Discord Webhook - Receives bug report messages in Discord channel

## Blockchain Integration Details

**Smart Contract Interactions:**

**VotingEscrow (veGNET):**
- Address: `0xdFbE5AC59027C6f38ac3E2eDF6292672A8eCffe4`
- Used by: `scripts/scan-and-update.ts`
- Functions called:
  - `locked(address)` → returns (int128 amount, uint256 end_time)
  - `balanceOf(address)` → returns voting power
  - `totalSupply()` → returns total veGNET
- Logs scanned: Deposit, Withdraw, Lock, Unlock events
- Purpose: Fetch wallet voting power and ranking data

**Hyperlane Mailbox:**
- Address: `0x3a464f746D23Ab22155710f44dB16dcA53e0775E` (on Galactica)
- Used by: `app/api/hyperlane/route.ts`, `lib/hyperlane.ts`
- Events monitored:
  - `Dispatch` - Outbound message sent
  - `Process` - Inbound message received
  - `DispatchId` / `ProcessId` - Message tracking
- Purpose: Track cross-chain transfers via Hyperlane bridge (Galactica ↔ Solana)
- Solana domain: 1399811149 (`0x534f4c41`)

**Canonical Bridge (ArbSys):**
- Address: `0x0000000000000000000000000000000000000064` (ArbSys)
- Used by: `app/api/canonical/route.ts`
- Function monitored: `withdrawEth` (selector: `25e16063`)
- Purpose: Track Arbitrum Orbit bridge withdrawals from Galactica

**Faucet Contract:**
- Address: `0x522B3595017537D29258f7F770e78AA5DE1Ec9cB`
- Used by: `app/api/faucet/route.ts`
- Purpose: Query faucet status and available funds

**Token Contracts (for pool):**
- WGNET: `0x690F1eEf8AcEaD09Ac695d9111Af081045c6d5b7`
- Archai: `0x22b48a764d2aAAe14d751aD2B5fcdf6C0A4d95D7`
- Pool Vault: `0x50AF2AAb1455C1C06B3b8e623549dDE437F54EeF`
- Used by: `app/api/pool/route.ts`
- Function called: `balanceOf(vault)` for ERC-20 balance queries

## Data Flow Summary

1. **Scanner Process** (`scripts/scan-and-update.ts`)
   - Runs on schedule (manual trigger via `npm run scan`)
   - Queries VotingEscrow contract logs via RPC
   - Extracts wallet addresses and current balances
   - Stores results in Redis (`wallets:payload`)
   - Tracks last scanned block in Redis

2. **Frontend Polling**
   - Fetches wallet data from `/api/wallets` (reads Redis)
   - Fetches block info from `/api/block` (RPC call)
   - Fetches latest transactions from `/api/block/txs` (RPC logs)
   - Fetches bridge transfers from `/api/hyperlane`, `/api/canonical` (RPC logs + Redis)
   - Fetches pool stats from `/api/pool` (Admin Panel API + RPC)
   - Polling interval: configurable `NEXT_PUBLIC_POLL_INTERVAL_MS`

3. **Error Reporting**
   - User submits bug report via `/api/bug-report`
   - Endpoint posts to Discord webhook (if configured)

---

*Integration audit: 2026-03-22*
