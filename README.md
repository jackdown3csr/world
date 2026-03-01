# Galactica World

Visualize wallet addresses from the **Galactica Cassiopeia testnet** (chain 843843) as procedurally placed "cities" on an interactive 3D globe.

![stack](https://img.shields.io/badge/Next.js_14-black?logo=next.js) ![three](https://img.shields.io/badge/three.js-black?logo=three.js) ![upstash](https://img.shields.io/badge/Upstash_Redis-teal)

---

## Quick start

### 1. Install dependencies

```bash
npm install
```

### 2. Set up Upstash Redis

The easiest path on Vercel:

1. Open your Vercel project → **Storage** tab → **Create Database** → **Upstash Redis**.
2. Vercel automatically injects `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` into your environment.

For local development, copy the values into `.env.local`:

```bash
cp .env.example .env.local
# Edit .env.local with your Upstash credentials
```

### 3. Seed initial wallet data

Pick a block range on Galactica Cassiopeia and run the scanner in **seed mode**:

```bash
# Windows (PowerShell)
$env:SEED="true"; $env:START_BLOCK="1"; $env:END_BLOCK="5000"; npx tsx scripts/scan-and-update.ts

# macOS / Linux
SEED=true START_BLOCK=1 END_BLOCK=5000 npx tsx scripts/scan-and-update.ts

# Or use the npm script (reads env from .env.local / shell)
npm run scan:seed
```

This scans blocks, discovers addresses, fetches balances, and writes `wallets:payload` to Redis.

### 4. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you should see the dark globe with glowing city towers.

### 5. Incremental scanning

After seeding, run the scanner in **incremental mode** to pick up new blocks:

```bash
npm run scan
```

This reads `scanner:lastProcessedBlock` from Redis, scans forward up to `MAX_BLOCKS_PER_RUN` blocks, and merges any newly funded wallets into the payload. Run it on a cron (e.g. every 5 min) to keep data fresh.

---

## How polling works

- The frontend fetches `GET /api/wallets` on page load and every 30 s (configurable via `NEXT_PUBLIC_POLL_INTERVAL_MS`).
- The API response includes an `updatedAt` timestamp (unix ms).
- When `updatedAt` changes, the frontend updates its wallet state, and city sizes animate smoothly from old → new scales using per-frame lerp in the `useFrame` loop.
- Instance ordering is stable (wallets sorted by checksummed address) so indices don't shuffle between updates.

## Deploy to Vercel

1. Push to GitHub.
2. Import the repo in Vercel.
3. Add **Upstash Redis** from the Storage tab (auto-injects env vars).
4. Deploy — done.

The API route (`app/api/wallets/route.ts`) only reads Redis. It never calls the blockchain RPC, so it's fast and safe for serverless.

---

## Architecture

```
Browser                  Vercel                    Upstash Redis
  │                        │                            │
  │  GET /api/wallets      │                            │
  │───────────────────────>│  redis.get(wallets:payload) │
  │                        │───────────────────────────>│
  │  { updatedAt, wallets }│<───────────────────────────│
  │<───────────────────────│                            │
  │                        │                            │
  │  3D Globe renders      │                            │
  │  cities from wallets   │                            │

Local machine (scanner)                    Galactica RPC
  │                                             │
  │  getBlock(n, true)                          │
  │────────────────────────────────────────────>│
  │  getBalance(address)                        │
  │────────────────────────────────────────────>│
  │                                             │
  │  redis.set(wallets:payload, ...)            │
  │────────────────────────────> Upstash Redis  │
```

## Limitations

- **Local-only scanning** — the scanner runs on your machine, not on Vercel. You need to run it manually or via cron.
- **RPC rate limits** — the public Galactica RPC may throttle requests. Large seed ranges (>10 k blocks) can take a while. The scanner adds retries and concurrency limits to mitigate.
- **No balance refresh** — incremental mode only fetches balances for *newly discovered* addresses. Existing wallets keep their balance from the last scan. A full re-seed updates everyone.
- **Max 5,000 cities** — the instanced mesh caps at 5,000 for performance. If more wallets exist, only the first 5,000 (sorted by address) are shown.

## License

MIT
