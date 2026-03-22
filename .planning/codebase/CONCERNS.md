# Codebase Concerns

**Analysis Date:** 2026-03-22

## Tech Debt

**Large Monolithic Components:**
- Issue: `components/SystemHud.tsx` (1674 lines) has 40+ callback handlers and manages complex nested UI state (photo mode, panels, fly picker, traffic). Managing multiple overlay states (overview, bridge overview, transit beacon overview) with separate ref patterns increases cognitive load and mutation risk.
- Files: `components/SystemHud.tsx`, `components/SolarSystem.tsx` (990 lines)
- Impact: Changes to UI state coordination become fragile; refactoring requires touching many interdependent handlers. New features compound state complexity.
- Fix approach: Extract nested overlay logic into separate composable components; consider state machine pattern for mode transitions (photo → fly → orbit); decompose panel swap logic into custom hooks.


**Untyped Webhook Response Parsing:**
- Issue: API routes (`app/api/hyperlane/route.ts`, `app/api/block/txs/route.ts`, etc.) parse RPC responses with loose typing. Type casts like `as RpcLog[]` are unvalidated; malformed upstream data could corrupt state.
- Files: `app/api/hyperlane/route.ts` (lines 99-122), `app/api/block/txs/route.ts` (lines 21-23), `app/api/pool/route.ts` (lines 32-34)
- Impact: Silent data corruption if RPC returns unexpected structure; no runtime validation of critical fields (logIndex, topics, blockNumber).
- Fix approach: Add Zod or similar schema validation on RPC response before casting; log validation failures; fallback gracefully on malformed data.

## Known Bugs

**Event Listener Cleanup in FreeLookControls:**
- Symptoms: While cleanup is present (lines 690-701), the `window.blur` listener and canvas pointer capture may not release properly if component unmounts during active drag or touch gesture.
- Files: `components/FreeLookControls.tsx` (lines 678-701)
- Trigger: Rapid enable/disable of controls; navigation away during touch interaction
- Workaround: Current implementation has cleanup but should verify `canvas.releasePointerCapture()` is called on all paths (currently missing on unmount if dragging state is true).

## Security Considerations

**Environment Variable Exposure in Static Build:**
- Risk: API keys and RPC URLs hardcoded or inferred from `.env.local` during build. Frontend code at `app/api/hyperlane/route.ts` line 24 uses `process.env.RPC_URL || "https://galactica-mainnet.g.alchemy.com/public"` with fallback to public node, but token exposure possible if private RPC URL is included.
- Files: `app/api/hyperlane/route.ts`, other API routes (`app/api/block/route.ts`, `app/api/vesting/route.ts`)
- Current mitigation: Fallback to public RPC; environment variable names suggest private URLs are externalized (UPSTASH_REDIS_REST_URL pattern).
- Recommendations:
  - Never commit `.env.local` (verified in .gitignore)
  - Rotate RPC endpoint credentials regularly
  - Consider rate limiting on public API routes
  - Use secure backend-only endpoints for authenticated operations

**Wallet Provider Assumption:**
- Risk: `hooks/useWalletConnection.ts` uses `BrowserProvider(eth as never)` without explicit provider origin validation. Malicious browser extensions could impersonate the wallet provider.
- Files: `hooks/useWalletConnection.ts` (lines 172, 223)
- Current mitigation: Chain ID validation prevents unauthorized network switching
- Recommendations:
  - Validate provider origin via content-security-policy headers
  - Warn user when signing sensitive transactions
  - Consider using WalletConnect or similar standardized protocol

**Missing Input Validation on Transaction Data:**
- Risk: `lib/blockExplorer/classifyTransactions.ts` extracts and processes transaction selectors without bounds checking. Selector extraction at line 78 (`input.slice(2, 10)`) assumes minimum input length but doesn't validate.
- Files: `lib/blockExplorer/classifyTransactions.ts` (line 77-79)
- Current mitigation: Selector comparison is case-insensitive and safe; fallback to unclassified transaction type
- Recommendations:
  - Add explicit length validation: `if (input.length < 10) return "unknown"`
  - Add unit tests for malformed transaction inputs

## Performance Bottlenecks

**Large 3D Scene Re-renders on Data Fetch:**
- Problem: `SolarSystem.tsx` uses multiple independent `useMemo` hooks to build scene data (lines 100-103). When any wallet data changes, all derived scene data (solarData, vestingData, poolData, stakingData) rebuilds. Three.js scene traversal in `FreeLookControls.tsx` line 244 walks entire scene graph each render.
- Files: `components/SolarSystem.tsx` (lines 100-103, 106-118), `components/FreeLookControls.tsx` (lines 243-250)
- Cause: No granular dependency tracking; scene graph is not indexed by body type.
- Improvement path:
  - Cache scene graph lookup structure (Map<bodyType, Object3D[]>) instead of full traversal
  - Split wallet state into separate contexts (planets, moons, asteroids) with independent memos
  - Lazy-evaluate scene system decorators only when visible

**Asset Loading Blocking Render:**
- Problem: Shader compilation and geometry generation happen synchronously on component mount. `SceneCanvas.tsx` line 288 calls `gl.compile(scene, camera)` in `ShaderWarmup` effect, which stalls GPU during initial load.
- Files: `components/SceneCanvas.tsx` (lines 281-291)
- Cause: No progress indicator; large shader programs block main thread
- Improvement path:
  - Show loading bar during `gl.compile()`; use `requestIdleCallback` for non-critical shaders
  - Pre-compile shaders in worker thread or stream compilation results
  - Add timeout to abandon stalled compilation

**Polling Without Backoff:**
- Problem: Multiple data sources poll independently: wallets (30s), vesting (30s), pool tokens, hyperlane bridge, block transactions. No exponential backoff on failure; if RPC endpoint fails, all hooks retry simultaneously every 30s.
- Files: `hooks/useWallets.tsx` (line 91), `hooks/useVestingWallets.tsx` (similar pattern), `hooks/useBlockTransactions.ts`, `app/api/hyperlane/route.ts`
- Cause: Each hook implements independent polling without coordination
- Improvement path:
  - Implement shared error state and backoff circuit-breaker
  - Jitter poll intervals (add ±5s random offset) to prevent thundering herd
  - Use Redis pub/sub or WebSocket for real-time updates instead of polling

## Fragile Areas

**Photo Mode State Management:**
- Files: `components/SystemHud.tsx` (lines 136-312 with overlapping state refs), `app/page.tsx` (state coordination)
- Why fragile: Multiple overlapping display modes (photoMode, photoHudVisible, photoPickerOpen, flyPickerOpen, photoFocusMode) managed by separate useState calls and refs. `overviewDismissedForRef`, `lastOverviewTargetRef`, `overviewHideTimerRef`, `overviewUnmountTimerRef` are mutated directly; easy to create stale state.
- Safe modification:
  - Extract photo mode logic into dedicated component or custom hook
  - Use single reducer for all photo-related state transitions
  - Add invariant checks: `if (photoMode && !photoHudVisible) console.warn()`
- Test coverage: Limited; integration tests needed for mode transitions

**Transaction Classification Pipeline:**
- Files: `lib/blockExplorer/classifyTransactions.ts` (365 lines), `lib/blockExplorer/mapEventsToSceneEffects.ts` (361 lines)
- Why fragile: Complex classification logic with hardcoded addresses and selectors. Adding new contract types requires editing both files and careful index synchronization. `classifyTransactions.ts` uses string matching on unvalidated RPC data.
- Safe modification:
  - Extract contract registry into data structure (Map<address, {selectors, handlers}>)
  - Add configuration validation test that ensures registered contracts match selector definitions
  - Test each transaction variant with malformed/edge-case inputs (truncated data, wrong selector, etc.)
- Test coverage: No visible test files for classification logic

**FreeLookControls Camera Constraint Logic:**
- Files: `components/FreeLookControls.tsx` (lines 160-175, 412-415, 492-494)
- Why fragile: `keepOutsideStars()` manually bounds camera position at hardcoded distances (0.5 to 20000 world-units). Star collision detection uses simple distance check; if new star system added, clearance constant may be insufficient. Multiple constraints applied after movement (lines 412-415, 492-494, 344-346) could conflict.
- Safe modification:
  - Centralize bounds check into single function with clear precedence (collision > max distance > min distance)
  - Make STAR_CLEARANCE configurable per star system or data-driven from scene metadata
  - Add unit test for constraint ordering: verify camera never enters star or exceeds world bounds even with edge inputs
- Test coverage: No visible unit tests for camera constraints

## Scaling Limits

**localStorage Quota:**
- Current capacity: Browser localStorage typically 5-10MB. Each system snapshot stored separately with full wallet dictionary.
- Limit: With 100+ wallets × 5+ systems × 5 snapshots = ~2.5MB worst case (current); manageable but approaching limits. Adding more systems or increasing snapshot history will overflow quota.
- Scaling path:
  - Implement quota management: delete oldest snapshots when limit approached
  - Compress snapshot JSON before storage
  - Consider IndexedDB for higher quota and structured queries

**Redis Connection Pool (Hyperlane Route):**
- Current capacity: Single Upstash Redis connection for hyperlane payload caching. No connection pooling or circuit breaker.
- Limit: If Redis unavailable, route returns cached `volatilePayload` from memory (line 53), which is lost on server restart. Concurrent requests may spike Redis usage.
- Scaling path:
  - Add Upstash connection pooling configuration
  - Implement multi-tier cache (Redis → in-memory TTL cache → fallback endpoint)
  - Add rate limiting per IP to prevent cache thrashing

**Scene Graph Size:**
- Current capacity: Up to ~8 solar systems with ~100+ bodies each = 800+ Three.js objects in scene graph
- Limit: Scene traversal in `FreeLookControls` (line 244) walks every object each render to build star collision cache. Traversal time scales O(n) with objects.
- Scaling path:
  - Index scene by body type at load time; cache in `useRef` to avoid traversal each frame
  - Use spatial partitioning (octree) for collision detection instead of exhaustive distance checks
  - Lazy-load distant star systems; unload when camera far away

## Dependencies at Risk

**ethers v6 (Major Version):**
- Risk: `ethers@^6.13.4` is actively maintained but v7 is in development. No compatibility shim strategy if v7 breaks provider interface.
- Impact: `hooks/useWalletConnection.ts` (lines 4, 220) uses `BrowserProvider` which is ethers v6-specific API; migrating to v7 requires rewriting wallet connection logic.
- Migration plan:
  - Monitor ethers v7 release; use conditional imports for provider detection
  - Upgrade to v7 in feature branch with wallet connection rewrite
  - Add provider compatibility tests

**@react-three/fiber ^8.17.10 (Minor Lock):**
- Risk: Three.js ecosystem is fast-moving. `@react-three/fiber@8.x` may miss new Three.js features; upgrading to v9 could introduce breaking changes in hooks API.
- Impact: Custom `useFrame` hooks and `useThree` throughout codebase tightly coupled to r3f API version.
- Migration plan:
  - Keep dependency locked to tested version; upgrade only with full regression test pass
  - Separate Three.js version from r3f version for flexibility

## Missing Critical Features

**No Logout/Disconnect UX Confirmation:**
- Problem: `hooks/useWalletConnection.ts` line 116 calls `onDisconnect()` but no confirmation dialog. User could accidentally disconnect wallet mid-transaction.
- Blocks: Graceful wallet state cleanup; transaction-in-flight detection
- Recommendation: Add confirmation modal; check if transaction is pending before allowing disconnect

**No Retry UI for Failed Data Loads:**
- Problem: When wallet data fetch fails (useWallets, useVestingWallets, etc.), error state is shown but no explicit "retry" button. User must wait for next auto-poll (30s) or reload page.
- Blocks: User experience during network issues; slow feedback loop for debugging
- Recommendation: Add manual retry button in error state; show countdown to next auto-retry

**No Rate-Limit Handling on API Routes:**
- Problem: API routes (`app/api/wallets`, `app/api/hyperlane`, etc.) do not check for rate-limit headers or implement request throttling. If RPC endpoint rate-limits, requests fail silently.
- Blocks: Graceful degradation during high load; user feedback on throttling
- Recommendation: Parse `Retry-After` headers; implement exponential backoff in hooks; show loading state with ETA

## Test Coverage Gaps

**Transaction Classification Logic Untested:**
- What's not tested: Classification of all transaction types (VE lock, staking, Hyperlane dispatch/process, WGNET wrap/unwrap, pool redeem, faucet mint) with edge cases (truncated calldata, unknown selectors, malformed logs).
- Files: `lib/blockExplorer/classifyTransactions.ts` (365 lines), `lib/blockExplorer/mapEventsToSceneEffects.ts` (361 lines)
- Risk: New transaction types added without test; edge cases in selector matching could cause silent misclassifications, rendering incorrect scene effects.
- Priority: **High** — transaction classification drives visual feedback; bugs cause user confusion

**Photo Mode State Transitions Untested:**
- What's not tested: Mode switches (orbit → photo → fly → orbit) with overlapping timer state (overviewHideTimerRef, overviewUnmountTimerRef). Rapid toggles could cause timers to fire in wrong order or memory leaks if not cleaned up.
- Files: `components/SystemHud.tsx` (photo mode handlers lines 195-282)
- Risk: Visual glitches, memory leaks on mode transitions, stale overlays remaining visible
- Priority: **Medium** — affects visual polish; not data-critical

**Camera Constraint Logic Untested:**
- What's not tested: Edge cases in `FreeLookControls` camera bounds: camera at 0,0,0 (line 168), camera already > MAX_DIST before applying constraint, rapid min/max distance changes
- Files: `components/FreeLookControls.tsx` (lines 160-175, 412-415, 492-494)
- Risk: Camera can enter star or exceed world bounds; breaks immersion; may cause rendering artifacts
- Priority: **High** — affects core 3D experience

**Wallet Connection Error Scenarios Untested:**
- What's not tested: User rejects chain switch, user rejects wallet connection, RPC returns invalid chain ID, wallet extension crashes mid-request
- Files: `hooks/useWalletConnection.ts` (275 lines total)
- Risk: UI enters inconsistent state; user sees stale "connected" status while disconnected; signing requests sent to unverified wallet
- Priority: **High** — security-relevant

**Hyperlane Log Parsing Untested:**
- What's not tested: Malformed dispatch/process logs; missing fields; edge cases in message decoding (`lib/hyperlane.ts` lines 65-115)
- Files: `lib/hyperlane.ts` (203 lines), `app/api/hyperlane/route.ts` (589 lines)
- Risk: Silent data corruption in bridge transfers; incorrect balances displayed; visual artifacts from malformed scene effects
- Priority: **High** — affects user's bridge experience

---

*Concerns audit: 2026-03-22*
