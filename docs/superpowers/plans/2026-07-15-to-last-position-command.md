# To Last Position Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register a localized `To last position` command in a separate `CommonCommandController` and reuse the existing stored-position resolution and coordinator jump implementation.

**Architecture:** A pure `position/commonCommands.ts` module owns command metadata and the result-oriented use case so behavior is testable without Obsidian. `commands/commonCommands.ts` implements `CommandModule`, maps use-case results to localized `Notice` messages, and is registered beside `BookmarkCommandController` through the existing registry.

**Tech Stack:** TypeScript 4.7, Obsidian API, Node.js test runner, `tsx`, esbuild.

## Global Constraints

- Command ID is `last-position-to-last-position`.
- Use `store.resolve(leafId, filePath)` and `coordinator.scrollActiveTo(filePath, height)`; do not add another scroll path.
- Successful execution is silent and does not persist or mutate history.
- Keep bookmark commands and status-bar behavior unchanged.
- Keep the development watcher stopped until the final production build.

---

### Task 1: Pure Common Command Use Case

**Files:**
- Create: `src/position/commonCommands.ts`
- Create: `tests/position/commonCommands.test.ts`

**Interfaces:**
- Produces: `COMMON_COMMAND_IDS.toLastPosition`.
- Produces: `getCommonCommandNames(labels)`.
- Produces: `executeToLastPosition(store, coordinator): ToLastPositionResult`.
- Result union: `'completed' | 'no-active-view' | 'no-history' | 'stale'`.

- [ ] **Step 1: Write failing metadata and behavior tests**

Cover exact ID/name, missing coordinator, missing active position, no saved history, exact leaf record precedence, file fallback, rejected stale jump, and unchanged store state after success.

```ts
assert.equal(COMMON_COMMAND_IDS.toLastPosition, 'last-position-to-last-position');
assert.equal(getCommonCommandNames({ toLastPositionCommand: 'To last position' }).toLastPosition,
  'Last Position: To last position');
```

- [ ] **Step 2: Verify RED**

Run: `node --import tsx --test tests/position/commonCommands.test.ts`

Expected: FAIL because `position/commonCommands.ts` does not exist.

- [ ] **Step 3: Implement the pure use case**

```ts
export function executeToLastPosition(
  store: PositionStore,
  coordinator: LastPositionJumpCoordinator | undefined,
): ToLastPositionResult {
  const position = coordinator?.getActivePosition();
  if (!coordinator || !position) return 'no-active-view';
  const saved = store.resolve(position.leafId, position.filePath);
  if (!saved) return 'no-history';
  return coordinator.scrollActiveTo(position.filePath, saved.height)
    ? 'completed'
    : 'stale';
}
```

- [ ] **Step 4: Verify GREEN**

Run: `node --import tsx --test tests/position/commonCommands.test.ts`

Expected: PASS.

### Task 2: Common Controller Registration And Localization

**Files:**
- Create: `src/commands/commonCommands.ts`
- Modify: `src/main.ts`
- Modify: `.language/translations.ts`

**Interfaces:**
- Produces: `CommonCommandController implements CommandModule`.
- Adds translation keys: `toLastPositionCommand`, `noLastPosition`, `lastPositionStale`.

- [ ] **Step 1: Add Chinese and English translations**

Use `跳转到上次位置`, `当前文件暂无历史位置`, and `当前文件已发生变化，未执行位置跳转`, with equivalent concise English copy.

- [ ] **Step 2: Implement the thin controller**

Register the command using `COMMON_COMMAND_IDS` and `getCommonCommandNames`. Invoke `executeToLastPosition` and show notices only for the three failure results.

- [ ] **Step 3: Register both command modules in main**

Create one shared `CommandContext` object, construct `CommonCommandController` and `BookmarkCommandController`, then pass both to `new CommandRegistry([...])`. Keep the status bar reference to the bookmark controller.

- [ ] **Step 4: Run verification**

Run: `npm test`

Expected: all tests pass.

Run: `npm run build`

Expected: TypeScript and production bundle succeed.

Run: `rg -n "last-position-to-last-position|To last position" src main.js`

Expected: command metadata appears in source and bundle.

Run: `git diff --check`

Expected: no whitespace errors.
