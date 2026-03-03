# vescrow · world

An interactive 3D solar system that visualises all wallets locked in the **Galactica veGNET VotingEscrow** contract. Every locker becomes a celestial body — rank and type determined purely by on-chain voting power.

![Next.js](https://img.shields.io/badge/Next.js_14-black?logo=next.js) ![Three.js](https://img.shields.io/badge/Three.js-black?logo=three.js) ![R3F](https://img.shields.io/badge/React_Three_Fiber-black) ![Upstash](https://img.shields.io/badge/Upstash_Redis-teal)

---

## What you see

| Body | Who |
|---|---|
| **Gas Giant** | Rank 1–4 by veGNET |
| **Ice Giant** | Rank 5–8 |
| **Terrestrial** | Rank 9–14 |
| **Rocky / Mars** | Rank 15–20 |
| **Moon** | Rank 21–60, orbit their host planet |
| **Ring particle** | Rank 61–190, form Saturn's rings around rank #1 |
| **Asteroid** | Rank 191+, outer belt |

Voting power = `locked GNET × remaining lock time` — longer lock → higher rank, not just more tokens.

---

## Features

- Procedural GLSL shaders per planet type (gas giant, ice giant, terrestrial, rocky, Mars)
- Saturn ring system with moon transits casting real shadow on planet surface
- Orbit rings, toggleable **orbit trails** showing recent path history
- **Lock expiry warning** — planets with locks expiring soon pulse red/amber
- **Comet CASCOPEA** — a 67P-shaped bilobed nucleus drifting through the system
- **Solar wind** particle stream from the sun
- **Live block clock** — block number from chain appears in stats overlay; Sun flashes each new block
- **Shift+click** any planet to inspect raw vEscrow contract storage slot data
- **Wallet connection** via MetaMask — name your own planet, see your position
- **Directory panel** — searchable list of all named wallets
- Mobile-responsive layout