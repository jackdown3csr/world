# Coding Conventions

**Analysis Date:** 2026-03-22

## Naming Patterns

**Files:**
- React components: PascalCase (`FloatingTooltip.tsx`, `BridgeObject.tsx`, `AsteroidBelt.tsx`)
- Utility/library files: camelCase (`formatBalance.ts`, `geometryPool.ts`, `hyperlane.ts`)
- API routes: kebab-case in path, `route.ts` filename (`/api/block/route.ts`, `/api/planet-name/route.ts`)
- Hooks: `use` prefix in camelCase (`useBlock.ts`, `useWalletConnection.ts`, `useBlockTransactions.ts`)
- Test files: `.test.ts` or `.spec.ts` suffix (though minimal tests exist currently)

**Functions:**
- Exported functions: camelCase (`formatBalance`, `classifyTransactions`, `useBlock`)
- Handler functions: `handle{Name}` pattern (`handleChainChanged`, `handleAccountsChanged`)
- Async functions: Standard camelCase, no special prefix (`ethCall`, `getCurrentChainId`)
- Helper/internal functions: camelCase, no leading underscore (e.g., `selector()`, `isZeroHex()`)
- React component functions: `export default function ComponentName()`

**Variables:**
- Local state: camelCase (`connectedAddress`, `isSaving`, `nameInput`)
- Constants: UPPER_SNAKE_CASE (`GALACTICA_MAINNET_CHAIN_ID`, `VE_ADDRESS`)
- React refs: camelCase with `Ref` suffix (`tooltipRef`, `lastBlock`, `cbRef`)
- Style objects: Short variable names (`s.box`, `s.item`, `s.key`)
- Booleans: `is{Name}` or `can{Name}` pattern (`isEcosystem`, `canRename`, `isSaving`)
- Configuration: UPPER_SNAKE_CASE with descriptive prefix (`RPC_URL`, `KEY_WALLETS_PAYLOAD`)

**Types:**
- Interfaces: PascalCase, descriptive suffix (`FloatingTooltipProps`, `WalletEntry`, `BlockInfo`)
- Union types: PascalCase (`Placement`, `SectionId`, `WalletTier`)
- Type aliases for strings: PascalCase (`BridgeKind`, `SceneSystemId`)
- Internal interfaces: Same convention, no leading `I` prefix

## Code Style

**Formatting:**
- 2-space indentation (TypeScript/JavaScript standard)
- No explicit formatter configured (Next.js lint handles basic formatting)
- Semicolons: Optional (not enforced by visible config)
- Trailing commas: Used in multi-line arrays/objects

**Linting:**
- Next.js built-in ESLint configured via `"lint": "next lint"`
- Run via `npm run lint`
- No separate `.eslintrc` file in repo root (uses Next.js defaults)
- No Prettier configuration file (default formatting)

**Line Length:**
- No visible hard limit, but generally keep under 100 characters for readability
- Long strings broken across lines when appropriate

## Import Organization

**Order:**
1. Standard library imports (`import type { ... } from "next"`)
2. Third-party packages (`import React from "react"`, `import { BrowserProvider } from "ethers"`)
3. Local relative imports (`import { formatBalance } from "@/lib/formatBalance"`)
4. Side-effect imports are rare; avoid when possible

**Path Aliases:**
- `@/*` mapped to project root (configured in `tsconfig.json`)
- Use `@/lib/...` for utility/library files
- Use `@/components/...` for React components
- Use `@/hooks/...` for custom hooks
- Avoid relative paths (`../../`), always use `@/`

**Import Grouping:**
```typescript
// 1. React & framework imports
import React from "react";
import { useState, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { NextResponse } from "next/server";

// 2. Third-party libraries
import * as THREE from "three";
import { BrowserProvider } from "ethers";

// 3. Local lib imports (utilities, types, constants)
import { formatBalance } from "@/lib/formatBalance";
import type { WalletEntry } from "@/lib/types";
import { redis, KEY_WALLETS_PAYLOAD } from "@/lib/redis";

// 4. Local component imports
import SpriteLabel from "./SpriteLabel";
import type { BridgeSceneObject } from "@/lib/bridges";
```

## Error Handling

**Patterns:**
- API routes: wrap in `try/catch`, return `NextResponse.json({ error: "..." }, { status: 500 })`
- Hooks: catch errors silently with comment `// silent — network blip`
- Promise chains: Use `.catch()` or `try/catch` with conditional state updates
- Error messages: User-facing messages stored in state (`status` state variable)
- Type guards: Check `instanceof Error`, use type assertions cautiously (`(err as { code?: unknown }).code`)

**Example (API route):**
```typescript
export async function GET() {
  try {
    const data = await fetch(...);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to..." }, { status: 500 });
  }
}
```

**Example (Hook):**
```typescript
useEffect(() => {
  async function poll() {
    try {
      const res = await fetch("/api/block");
      if (!res.ok) return;
      const data = await res.json();
      setInfo(data);
    } catch {
      // silent — network blip
    }
  }
  // ...
}, []);
```

**Validation:**
- Explicit null checks: `if (!value)`, `if (value == null)`
- String validation: `if (!trimmed)`, `.trim()` before use
- Array checks: `Array.isArray()` for type guards
- Number parsing: Explicit radix in `parseInt(value, 16)` or `parseInt(value, 10)`

## Logging

**Framework:** `console` (no logging library)

**Patterns:**
- Minimal console usage in production code
- Debug logging in comments when needed
- Error logging: capture and return via API response rather than console
- No `console.log` left in production components

**Example:**
```typescript
// Silent error handling with explanation in comment
catch {
  // silent — network blip; user sees stale data
}

// Explicit user-facing error message via state
setStatus(err instanceof Error ? err.message : "Operation failed.");
```

## Comments

**When to Comment:**
- Complex algorithms or domain-specific logic (e.g., contract addresses, function selectors)
- Non-obvious intent (e.g., "never cache this route")
- Visual/coordinate explanations in 3D geometry code
- Transaction classification rules and ecosystem-specific behavior

**JSDoc/TSDoc:**
- Used for exported functions and main module exports
- Single-line format for simple exports: `/** Brief description */`
- Multi-line for complex functions:
  ```typescript
  /**
   * Classifies raw block transactions into normalized events.
   * Matches known ecosystem contract addresses and function selectors.
   */
  export function classifyTransactions(...) { ... }
  ```
- Parameter descriptions: Not included (types are self-documenting via TS)
- Return type: Documented when non-obvious

**Example (from codebase):**
```typescript
/**
 * Format a raw wei string (18 decimals) into human-readable GNET balance.
 * e.g. "1234567890000000000000" → "1,234.56789 GNET"
 *
 * Shows up to 6 significant decimals, minimum 3.
 */
export function formatBalance(rawWei: string, unit = "GNET"): string { ... }
```

**Inline Comments:**
- Short, explaining "why" not "what"
- Use `//` single-line comment for clarity
- Placed above the code they explain

## Function Design

**Size:**
- Prefer small, focused functions under 50 lines
- Large functions (100+ lines) are acceptable for complex logic (e.g., `classifyTransactions`, `useWalletConnection`)
- Extract helpers for reusable sub-logic

**Parameters:**
- Simple types preferred over many parameters
- Use destructuring for object parameters: `{ address, name, signature }`
- Default parameters for optional behavior
- Avoid `boolean` trap — use descriptive names (`hasError` not `error`)

**Return Values:**
- Explicit return types in TypeScript
- Nullable returns: `ReturnType | null` pattern
- Union types for multiple return shapes: `"success" | "error"`
- Avoid void functions when possible; prefer returning status

## Module Design

**Exports:**
- Named exports preferred for functions and types
- `export default` for React components only
- Export types alongside implementations: `export type X; export interface Y; export function z() { ... }`

**Barrel Files:**
- Used in `/lib/layout/index.ts` for layout utilities
- Not used in `/components` — import directly from files
- Pattern: `export { funcA } from "./a"; export { funcB } from "./b";`

**Organization:**
- Pure functions in separate files from React hooks
- Business logic (classifyTransactions) in `/lib` not `/components`
- Scene/3D logic (geometry) in components, not shared libs
- API route handlers self-contained in `route.ts` files

## Strict Mode

**TypeScript Settings:**
- `strict: true` in tsconfig.json
- `skipLibCheck: true` (ignore node_modules types)
- `noEmit: true` (compile checking only)
- No `any` type usage in codebase (avoided via proper typing)

**Type Safety Practices:**
- Always type function parameters and returns
- Use `type` for unions, `interface` for object shapes
- Use `as const` for literal type narrowing: `as const` on selector maps
- Avoid type assertions except where necessary (e.g., React ref casting)

## Specific Patterns

**React Client Components:**
- Always include `"use client"` at top of files using hooks or browser APIs
- Use `React.` namespace for React functions even when importing as `import React`
- Refs initialized with `useRef<HTMLElement | null>(null)`
- State naming: `[value, setValue]` pattern (standard React convention)

**API Routes:**
- Always set `export const dynamic = "force-dynamic"` for non-cached routes
- Use `NextResponse.json()` for responses
- Include `headers: { "Cache-Control": "no-store" }` when needed
- Error responses use `{ status: 500 }` (explicit HTTP status)

**Constants & Addresses:**
- Ethereum addresses in lowercase: `"0xdfbe5ac59027c6f38ac3e2edf6292672a8ecffe4"`
- Function selectors as hex strings: `"65fc3873"`
- Chain IDs as numbers: `613419` for Galactica mainnet
- Environment variables: uppercase with `RPC_URL` pattern

---

*Convention analysis: 2026-03-22*
