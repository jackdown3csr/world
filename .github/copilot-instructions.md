# Copilot Instructions

## Project Overview

This repository is a Next.js 14 + React 18 + TypeScript application that renders an interactive 3D Galactica scene using React Three Fiber and Three.js.

The product is not a generic dashboard. It is a scene-driven interface where on-chain entities are represented as celestial bodies, systems, bridges, and scene effects. Preserve that mental model in code and UI changes.

## Core Architecture

### High-level roles

- `components/SolarSystem.tsx` is the top-level orchestration layer.
- `components/SceneCanvas.tsx` should stay mostly declarative and render scene content from structured data.
- `components/SystemHud.tsx` owns non-canvas HUD behavior and panel coordination.
- `app/api/**` exposes server routes for chain-derived and cached data.
- `lib/layout/**` contains layout-building logic and ranking/distribution helpers.
- `lib/shaders/**` contains reusable shader building blocks and materials.

### Scene composition rules

Prefer the existing declarative scene registry model:

- `systems[]` describes star systems and their metadata.
- `decorators[]` describes per-system satellites and add-on objects.
- `globalObjects[]` describes scene-wide objects such as rogue planets, comets, and bridges.
- `sceneEffects[]` describes transient or block-driven visual effects.

When adding a new visual concept, prefer extending these registries over hardcoding one-off props through multiple component layers.

### Selection and focus

Selection is driven by stable IDs and `selectedAddress`-style focus state.

- Reuse the existing camera selection flow where possible.
- Keep focus IDs stable through `userData.walletAddress` or equivalent scene object IDs.
- New focusable scene objects should integrate with the same selection and camera path rather than inventing parallel logic.

## Data and Domain Rules

### Domain expectations

This app visualizes Galactica ecosystem data, especially:

- vEscrow wallets
- vesting wallets
- pool tokens
- Hyperlane bridge activity
- block-driven scene state

Assume the user cares about correctness of chain-derived metrics, labels, totals, and timestamps.

### Data handling

- Prefer deriving display data from hooks and `lib/**` helpers instead of embedding calculations in JSX.
- Keep formatting in dedicated helpers such as `lib/formatBalance.ts`.
- Avoid duplicating normalization logic for addresses, token values, timestamps, or ranking rules.
- If cached API data is involved, preserve the existing contract between route handlers and client hooks.

### API routes

When modifying `app/api/**`:

- Keep route handlers focused and deterministic.
- Preserve response shapes unless the change explicitly requires a contract update.
- If a response shape changes, update all affected hooks and UI consumers in the same change.
- Prefer adding fields over renaming or removing existing fields unless explicitly requested.

## UI and Interaction Principles

### General UI behavior

This project values cinematic, spatial, scene-aware behavior over generic app UI.

- Preserve intentional motion and transitions.
- Avoid replacing custom scene UI with standard dashboard patterns.
- Keep labels, cards, and HUD elements visually aligned with the sci-fi mono HUD language already in the app.

### HUD and panels

- Keep `SystemHud` behavior coordinated through explicit state transitions.
- Prefer out-in content swaps for panel retargeting instead of immediate content replacement.
- If a panel can represent multiple focus targets, preserve animation continuity when retargeting.
- Avoid introducing duplicated panel state machines for systems, bridges, or future focus types.

### Mobile and desktop

- Maintain parity of behavior across desktop and mobile where practical.
- Preserve the distinct desktop HUD column and mobile bottom-sheet interaction model.
- Do not ship desktop-only interaction changes without considering mobile impact.

## 3D Scene and Performance

### Rendering expectations

- Favor lightweight scene composition and memoized derived data.
- Avoid unnecessary re-renders in frequently updated scene components.
- Be cautious with per-frame allocations in `useFrame`, camera logic, and shader-driven components.
- Reuse vectors, refs, and memoized values where performance-sensitive code already follows that pattern.

### Camera behavior

- Respect the existing split between orbit and fly camera modes.
- Keep camera transitions readable and intentional.
- Do not introduce framing offsets or snap behaviors that fight user focus unless there is a clear UX need.
- For new focus targets, extend the current focus model instead of branching into separate camera systems.

### Shaders and visuals

- Keep shader changes localized to `lib/shaders/**` or dedicated material helpers.
- Preserve the established visual vocabulary: distinct planet classes, readable silhouettes, and scene depth over noisy effects.
- Avoid adding expensive visual effects unless they materially improve the scene.

## Code Style Expectations

### General style

- Use TypeScript precisely; prefer explicit types for public props, route responses, and shared structures.
- Keep components focused: orchestration components coordinate, leaf components render.
- Extract repeated transition logic or repeated data-shaping logic into hooks or helpers.
- Prefer extending existing domain types rather than using ad-hoc object literals in multiple places.

### React patterns

- Use `useMemo`, `useCallback`, and refs where they reduce real churn, especially in scene orchestration and HUD logic.
- Do not add memoization mechanically. Use it when identity stability or expensive derivation actually matters.
- Avoid large inline calculations inside JSX blocks.
- Prefer derived booleans and named state transitions over nested conditional expressions when behavior gets subtle.

### File organization

- Place reusable hooks in `hooks/**`.
- Place reusable scene/domain helpers in `lib/**`.
- Place extracted HUD render pieces under `components/systemHud/**` when they are specific to the HUD domain.
- Keep orchestration components from turning into monoliths; extract rendering subcomponents before extracting deeply shared abstractions that make behavior harder to follow.

## Editing Guidance For Copilot

### When making changes

- Prefer minimal, surgical edits that match existing architecture.
- If the requested change touches both data flow and UI behavior, update both in one pass.
- Preserve existing naming patterns such as `selectedBridge`, `activeSystemId`, `showSceneInfo`, `sceneEffects`, and `layoutVariant` unless a rename clearly improves consistency.
- Do not replace project-specific logic with generic boilerplate.

### When refactoring

Refactor only when it creates a real maintenance win.

Good refactors in this repo:

- extracting repeated panel transition logic into a hook
- moving large HUD render blocks into focused HUD-only components
- consolidating scene object registration into declarative registries
- moving duplicated formatting or ranking logic into `lib/**`

Weak refactors in this repo:

- splitting files only to reduce line count without reducing complexity
- introducing new abstraction layers that hide scene behavior
- separating tightly coupled camera or HUD state in ways that increase prop drilling

## Validation

Before finishing significant changes:

- run `npx tsc --noEmit` when TypeScript files changed
- check for regressions in panel transitions, selection, and camera focus when relevant
- verify both mobile and desktop implications for HUD changes
- verify API consumer compatibility when response contracts change

## Agent Working Methodology

### Plan before acting

For any non-trivial task (3+ steps, architectural decisions, or changes touching multiple files):

- Write out the plan before touching code. Use the todo list tool to make it visible and trackable.
- Confirm the plan is coherent before starting implementation.
- If something goes wrong mid-task, **stop and re-plan** — do not keep pushing through a broken approach.

### Use subagents for research and exploration

- Offload file exploration, pattern searches, and parallel analysis to subagents to keep the main context clean.
- For complex investigations, use search subagents rather than chaining many sequential reads manually.
- One focused task per subagent invocation — avoid open-ended prompts.

### Self-improvement after corrections

- When the user corrects a mistake, identify the root cause and internalize the lesson.
- Update repo memory (`/memories/repo/`) with patterns or rules that prevent the same mistake in the future.
- Check repo and session memory at the start of complex tasks for relevant prior lessons.

### Verification before done

- Never consider a task complete without proving it works: run `npx tsc --noEmit`, check relevant behavior, and confirm no regressions.
- Diff behavior between before and after for non-trivial changes.
- Ask: "Would a senior engineer approve this?" If not, iterate.

### Demand elegance — proportionally

- For non-trivial changes, ask: "Is there a more elegant solution?"
- If a fix feels hacky, pause and implement the clean version instead.
- Skip this for simple, isolated fixes — do not over-engineer.

### Bug fixing

- When given a bug report: diagnose from logs, errors, and failing behavior, then fix it — zero context switching for the user.
- Find the root cause. Avoid temporary patches. Hold to senior-level engineering standards.
- Simplicity first: make every change as small and targeted as possible while fully fixing the problem.

## Preferred Outcomes

Successful changes in this repository usually have these qualities:

- scene behavior remains smooth and intentional
- chain-derived data stays correct and consistently formatted
- new features fit the existing solar-system mental model
- HUD logic becomes clearer, not more fragmented
- performance-sensitive code remains careful and explicit
