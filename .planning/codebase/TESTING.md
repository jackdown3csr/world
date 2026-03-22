# Testing Patterns

**Analysis Date:** 2026-03-22

## Test Framework

**Runner:**
- Not detected in current codebase
- No Jest, Vitest, or other test runner configured
- No test configuration file (`jest.config.*`, `vitest.config.*`)

**Assertion Library:**
- Not detected
- Project currently has no automated tests

**Run Commands:**
- No test command in `package.json`
- Available commands: `dev`, `build`, `start`, `lint`, `scan`, `scan:seed`
- To add testing: would need to add test runner and assertion library to devDependencies

## Test File Organization

**Current State:**
- No test files in the project source code (`/app`, `/components`, `/hooks`, `/lib`)
- Only dependency test files exist in `node_modules` (from external packages)

**Recommended Pattern (if tests are added):**
- Co-located with source: `SpriteLabel.tsx` → `SpriteLabel.test.tsx`
- Separate directory option: `__tests__/` subdirectory per module
- Naming: `*.test.ts` or `*.test.tsx` for consistency

**Recommended Structure:**
```
components/
  FloatingTooltip.tsx
  FloatingTooltip.test.tsx
lib/
  formatBalance.ts
  formatBalance.test.ts
  blockExplorer/
    classifyTransactions.ts
    classifyTransactions.test.ts
hooks/
  useBlock.ts
  useBlock.test.ts
```

## Test Structure

**Recommended Suite Organization:**
- Use standard `describe()` blocks for grouping related tests
- Use `test()` or `it()` for individual test cases
- AAA pattern: Arrange, Act, Assert

**Expected Pattern (if implemented):**
```typescript
describe("formatBalance", () => {
  describe("valid inputs", () => {
    test("formats wei to GNET with proper decimals", () => {
      const result = formatBalance("1234567890000000000000");
      expect(result).toContain("1,234.56789 GNET");
    });

    test("respects minimum decimal places", () => {
      const result = formatBalance("1000000000000000000");
      expect(result).toMatch(/\d+\.\d{3}/); // at least 3 decimals
    });
  });

  describe("edge cases", () => {
    test("handles zero input", () => {
      expect(formatBalance("0")).toBe("0 GNET");
    });

    test("handles empty string", () => {
      expect(formatBalance("")).toBe("0 GNET");
    });
  });
});
```

## Mocking Strategy

**For Adding Tests:**

**Framework Recommendation:**
- Use `vitest` for unit tests (React/TS compatible, fast)
- Use `jest` as alternative (slower but well-established)
- Use `@testing-library/react` for component testing

**What to Mock:**

**API Calls:**
```typescript
// Mock fetch for API routes
global.fetch = jest.fn((url) => {
  if (url === "/api/block") {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ blockNumber: 123, blockTimestamp: 1234567890 })
    });
  }
  return Promise.reject(new Error("Unknown URL"));
});
```

**Ethers Provider (for wallet tests):**
```typescript
// Mock BrowserProvider for wallet connection tests
jest.mock("ethers", () => ({
  BrowserProvider: jest.fn(() => ({
    getSigner: jest.fn(() => ({
      getAddress: jest.fn(() => Promise.resolve("0x123...")),
      signMessage: jest.fn(() => Promise.resolve("0xsig..."))
    }))
  }))
}));
```

**What NOT to Mock:**
- Pure functions like `formatBalance`, `selector()` — test them directly
- Type definitions — they're compile-time only
- Utility helper functions — these are low-level and should be tested with real inputs
- Constants/addresses — no need to mock, they're stable

**Redis/Storage (for API routes):**
```typescript
// Mock redis client for API route testing
jest.mock("@/lib/redis", () => ({
  redis: {
    get: jest.fn(),
    hgetall: jest.fn(),
    set: jest.fn()
  }
}));
```

## Fixtures and Factories

**Test Data:**

**Recommended Pattern (if tests added):**
```typescript
// In `__fixtures__/walletData.ts`
export const mockWalletEntry = (overrides = {}): WalletEntry => ({
  address: "0x1234567890123456789012345678901234567890",
  customName: "Test Wallet",
  lockedGnet: "1000000000000000000", // 1 GNET in wei
  lockedFormatted: "1.000000 GNET",
  lockEnd: Math.floor(Date.now() / 1000) + 86400 * 365, // 1 year from now
  votingPower: "1000000000000000000",
  votingPowerFormatted: "1.000000 GNET",
  firstSeenBlock: 100000,
  firstSeenTimestamp: 1640000000,
  tier: "planet",
  rank: 5,
  planetSubtype: "ice_giant",
  orbitSlot: 3,
  ...overrides
});

export const mockRawTransaction = (overrides = {}) => ({
  hash: "0x1234567890abcdef",
  from: "0x1111111111111111111111111111111111111111",
  to: "0xdfbe5ac59027c6f38ac3e2edf6292672a8ecffe4", // VE_ADDRESS
  value: "0x0",
  input: "0x65fc3873...", // createLock selector
  ...overrides
});
```

**Location:**
- `__fixtures__/` or `__test-data__/` directory per test suite
- Alternatively, inline factories at top of test file for small projects

## Coverage

**Requirements:**
- Not enforced (no coverage config in current setup)

**View Coverage (if tests added):**
```bash
# With Jest
npm test -- --coverage

# With Vitest
npm test -- --coverage

# Results in coverage/
coverage/
  index.html       # Open in browser for visual report
  coverage.txt     # Console output
```

**Recommended Targets (if implementing):**
- Utility functions (`/lib`): 80%+ coverage
- Components: 70%+ (avoid testing implementation details)
- Hooks: 75%+ (focus on state transitions)
- API routes: 85%+ (critical entry points)

## Test Types

**Unit Tests:**
- Scope: Single function or module in isolation
- Examples: `formatBalance()`, `selector()`, `classifyTransactions()`
- Approach: Direct function calls with test data, verify output
- No external dependencies (mocked)

**Expected Unit Test Example:**
```typescript
describe("classifyTransactions", () => {
  test("classifies vEscrow lock transactions correctly", () => {
    const txs = [
      mockRawTransaction({
        to: VE_ADDRESS,
        input: "0x65fc3873..." // createLock selector
      })
    ];

    const result = classifyTransactions(txs, 100000, 1640000000);
    expect(result[0].classification).toBe("vescrow-lock");
    expect(result[0].label).toBe("vEscrow lock");
  });
});
```

**Integration Tests:**
- Scope: Multiple modules working together
- Examples: Hook + API call, transaction classification + scene effects mapping
- Approach: Test flow from input to output across multiple functions
- Some external mocks needed (API, storage)

**Expected Integration Test Example:**
```typescript
describe("useBlock + block API", () => {
  test("polls block data and fires onNewBlock callback", async () => {
    const onNewBlock = jest.fn();
    const { result } = renderHook(() => useBlock(100, onNewBlock));

    await waitFor(() => expect(result.current).toBeDefined());
    await waitFor(() => expect(onNewBlock).toHaveBeenCalled());
  });
});
```

**E2E Tests:**
- Not currently used in this project
- Recommendation: Add with Playwright or Cypress if full-stack testing needed
- Would test: viewport rendering, interaction, navigation

## Common Patterns

**Async Testing:**

**Jest Pattern:**
```typescript
test("fetches wallet data asynchronously", async () => {
  const promise = new Promise((resolve) => {
    setTimeout(() => resolve({ address: "0x..." }), 10);
  });

  const data = await promise;
  expect(data.address).toBeDefined();
});

test("handles fetch errors", async () => {
  fetch.mockRejectedValueOnce(new Error("Network error"));

  await expect(someAsyncFn()).rejects.toThrow("Network error");
});
```

**React Hook Async Testing:**
```typescript
import { renderHook, waitFor } from "@testing-library/react";

test("useBlock updates state when data arrives", async () => {
  const { result } = renderHook(() => useBlock(100));

  expect(result.current).toBeNull();

  await waitFor(() => {
    expect(result.current).not.toBeNull();
    expect(result.current?.blockNumber).toBeDefined();
  });
});
```

**Error Testing:**

**For Functions:**
```typescript
test("throws when given invalid input", () => {
  expect(() => {
    parseChainId("invalid");
  }).toThrow();
});

test("returns null for empty chain ID", () => {
  expect(parseChainId("")).toBeNull();
});
```

**For Hooks:**
```typescript
test("sets error status on failed fetch", async () => {
  fetch.mockRejectedValueOnce(new Error("API down"));
  const onConnected = jest.fn();

  const { result } = renderHook(() => useWalletConnection([], jest.fn(), onConnected));

  act(() => {
    result.current.connectWallet();
  });

  await waitFor(() => {
    expect(result.current.status).toContain("Failed");
  });
});
```

## Adding Tests

**Setup Steps (recommended):**

1. Install test runner and testing library:
```bash
npm install --save-dev vitest @vitest/ui @testing-library/react @testing-library/react-hooks
```

2. Create `vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
  },
});
```

3. Add to `package.json`:
```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage"
  }
}
```

4. Create first test file (e.g., `lib/formatBalance.test.ts`)

## Current Testing Status

**Note:**
- No tests currently exist in the project
- Code is production-ready but untested
- High-priority test candidates:
  - `lib/formatBalance.ts` — pure function, easy to test
  - `lib/blockExplorer/classifyTransactions.ts` — complex business logic
  - `hooks/useWalletConnection.ts` — critical user flow
  - API routes in `app/api/` — entry points to backend

**Recommended Priority Order:**
1. Pure utilities: `formatBalance`, `classifyTransactions`
2. Custom hooks: `useBlock`, `useWalletConnection`
3. API route handlers: `GET /api/block`, `GET /api/wallets`
4. Components: Only test complex interactive components (low priority)

---

*Testing analysis: 2026-03-22*
