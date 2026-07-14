# Smart Restore Delay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the temporary restore experiment logs and add an opt-in Beta setting that calculates the complete restore delay from source and target Markdown character counts.

**Architecture:** A pure delay module owns the formula. `PositionCoordinator` accepts an asynchronous delay resolver and subtracts resolver time from the selected delay while preserving leaf-generation cancellation. The Obsidian adapter reads source and target files concurrently with `vault.cachedRead`; fixed mode bypasses all content reads.

**Tech Stack:** TypeScript 4.7, Obsidian API, Node.js test runner, `tsx`, esbuild.

## Global Constraints

- `enableSmartRestoreDelay` defaults to `false`.
- Fixed mode uses `max(0, restoreDelayMs)` and does not read document content.
- Smart mode ignores `restoreDelayMs` and uses `clamp(300, 4000, round(300 + targetChars / 500 + sourceChars / 1250))`.
- Character measurement time is part of the calculated delay, not extra time.
- Remove every `[Last-Position-Experiment]` output and all experiment-only state.
- Do not change restoration retries, saving, anchor navigation, bookmarks, or mode handoff behavior.

---

### Task 1: Smart Delay Formula And Setting Default

**Files:**
- Create: `src/position/smartRestoreDelay.ts`
- Create: `tests/position/smartRestoreDelay.test.ts`
- Modify: `src/settings/settingsModel.ts`

**Interfaces:**
- Produces: `calculateSmartRestoreDelay(targetCharacterCount: number, sourceCharacterCount?: number): number`.
- Produces: `LastPositionSettings.enableSmartRestoreDelay: boolean` with default `false`.

- [ ] **Step 1: Write failing formula and default tests**

```ts
assert.equal(calculateSmartRestoreDelay(0, 0), 300);
assert.equal(calculateSmartRestoreDelay(10_000, 10_000), 328);
assert.equal(calculateSmartRestoreDelay(500_000, 0), 1300);
assert.equal(calculateSmartRestoreDelay(500_000, 500_000), 1700);
assert.equal(calculateSmartRestoreDelay(5_000_000, 5_000_000), 4000);
assert.equal(DEFAULT_SETTINGS.enableSmartRestoreDelay, false);
```

- [ ] **Step 2: Verify RED**

Run: `node --import tsx --test tests/position/smartRestoreDelay.test.ts`

Expected: FAIL because `smartRestoreDelay.ts` and the setting do not exist.

- [ ] **Step 3: Implement the pure formula and setting**

```ts
const MIN_SMART_RESTORE_DELAY_MS = 300;
const MAX_SMART_RESTORE_DELAY_MS = 4000;

export function calculateSmartRestoreDelay(
  targetCharacterCount: number,
  sourceCharacterCount = 0,
): number {
  const target = Number.isFinite(targetCharacterCount) ? Math.max(0, targetCharacterCount) : 0;
  const source = Number.isFinite(sourceCharacterCount) ? Math.max(0, sourceCharacterCount) : 0;
  const calculated = Math.round(300 + target / 500 + source / 1250);
  return Math.min(MAX_SMART_RESTORE_DELAY_MS, Math.max(MIN_SMART_RESTORE_DELAY_MS, calculated));
}
```

Add `enableSmartRestoreDelay: false` beside `restoreDelayMs` in the settings model.

- [ ] **Step 4: Verify GREEN**

Run: `node --import tsx --test tests/position/smartRestoreDelay.test.ts`

Expected: PASS.

### Task 2: Asynchronous Delay Resolution

**Files:**
- Modify: `src/position/positionCoordinator.ts`
- Modify: `tests/position/positionCoordinator.test.ts`

**Interfaces:**
- Add `RestoreDelayContext<TLeaf, TView> { source?: RegisteredLeaf<TLeaf, TView>; target: RegisteredLeaf<TLeaf, TView> }`.
- Replace `restoreDelayMs: () => number` with `resolveRestoreDelayMs(context): number | Promise<number>`.

- [ ] **Step 1: Write a failing fixed-delay test**

Configure `resolveRestoreDelayMs` to return `30`, start restoration, assert no height is applied before 30ms, then assert restoration completes. This preserves existing fixed behavior through the new interface.

- [ ] **Step 2: Write a failing async timing test**

Use a deferred resolver and a fake clock callback. Advance elapsed time by 20ms before resolving a calculated delay of 50ms. Assert restoration waits only the remaining 30ms.

- [ ] **Step 3: Write a failing stale-calculation test**

Start an unresolved restore for `a.md`, open `b.md` in the same leaf, then resolve the old request. Assert the old target height is never applied.

- [ ] **Step 4: Verify RED**

Run: `node --import tsx --test --test-name-pattern "resolved restore delay|unresolved restore delay" tests/position/positionCoordinator.test.ts`

Expected: FAIL because the asynchronous resolver interface is absent.

- [ ] **Step 5: Implement generation-safe delay resolution**

Capture `source` before replacing `activeRecord`. Increment the leaf run before calling the resolver, record `startedAt`, and after resolution calculate:

```ts
const selectedDelayMs = Number.isFinite(delayMs) ? Math.max(0, delayMs) : 0;
const remainingDelayMs = Math.max(0, selectedDelayMs - (now() - startedAt));
```

Before creating the timer and again when it fires, verify the coordinator is not disposed, the run is current, and `registry.isCurrent(record)` is true. Rejections fall back to a zero delay so restoration remains functional.

- [ ] **Step 6: Verify GREEN**

Run: `node --import tsx --test tests/position/positionCoordinator.test.ts`

Expected: PASS.

### Task 3: Obsidian Resolver, Settings UI, And Experiment Cleanup

**Files:**
- Modify: `src/adapters/obsidian/positionCoreFactory.ts`
- Modify: `src/main.ts`
- Modify: `src/settings/settingsTab.ts`
- Modify: `.language/translations.ts`
- Modify: `src/obsidian/leafRegistry.ts`
- Modify: `src/obsidian/obsidianLeafSource.ts`
- Modify: `src/position/positionCoordinator.ts`
- Delete: `src/restoreExperiment.ts`
- Create: `src/position/restoreDelayResolver.ts`
- Create: `tests/position/restoreDelayResolver.test.ts`

**Interfaces:**
- Produce `createRestoreDelayResolver(isEnabled, fixedDelayMs, readCharacterCount)` returning the coordinator resolver.
- Add Chinese and English names/descriptions for `smartRestoreDelay` and `smartRestoreDelayDesc`.

- [ ] **Step 1: Write failing adapter tests**

Assert disabled mode returns the fixed delay without calling `readCharacterCount`. Assert enabled mode reads source and target concurrently, passes their counts to the formula, and treats a rejected read as zero characters.

- [ ] **Step 2: Verify RED**

Run: `node --import tsx --test tests/position/restoreDelayResolver.test.ts`

Expected: FAIL because the resolver does not exist.

- [ ] **Step 3: Implement the Obsidian resolver**

Implement the pure resolver with `Promise.all` and per-file error fallback:

```ts
const [sourceChars, targetChars] = await Promise.all([
  readCount(context.source?.filePath),
  readCount(context.target.filePath),
]);
return calculateSmartRestoreDelay(targetChars, sourceChars);
```

When disabled, return `Math.max(0, fixedDelayMs())` before invoking the reader. In the Obsidian factory, inject a reader that resolves paths with `vault.getAbstractFileByPath`, accepts only `TFile`, calls `vault.cachedRead`, and returns `content.length`.

- [ ] **Step 4: Add the settings toggle and translations**

Place the toggle before fixed restore delay. Persist changes immediately and call `display()` so the fixed delay text component is disabled while smart mode is enabled. Keep its stored numeric value unchanged.

- [ ] **Step 5: Wire the resolver and remove experiment code**

Pass settings callbacks through `main.ts` and `createObsidianPositionCore`. Delete experiment imports, trace fields, trace events, document metric reads, `byteSize`, and `src/restoreExperiment.ts`. Restore `file-open` to call only `coordinator.handleFileOpen(...)`.

- [ ] **Step 6: Verify GREEN**

Run: `node --import tsx --test tests/position/restoreDelayResolver.test.ts`

Expected: PASS.

Run: `rg -n "Last-Position-Experiment|restoreExperiment|byteSize" src`

Expected: no output.

### Task 4: Full Verification

**Files:**
- Modify only files required to correct verification failures introduced by Tasks 1-3.

- [ ] **Step 1: Run all tests**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: TypeScript checking and esbuild production bundle succeed.

- [ ] **Step 3: Check the diff**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `git status --short`

Expected: only this feature's files plus pre-existing unrelated user files are changed.
