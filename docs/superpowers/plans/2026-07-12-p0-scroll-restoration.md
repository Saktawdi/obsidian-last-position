# P0 Scroll Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace plugin-wide scroll state with persisted leaf-level state, file fallback state, cancellable restoration, and anchor-aware navigation protection.

**Architecture:** Pure TypeScript domain modules own persistence, task scheduling, and anchor suppression. A small Obsidian adapter exposes leaf/view operations, while a coordinator connects workspace events to the domain. `main.ts` remains the lifecycle composition root.

**Tech Stack:** TypeScript 4.7, Obsidian API, Node.js 22 built-in test runner, `tsx`, esbuild.

## Global Constraints

- `main.ts` contains lifecycle setup, dependency construction, settings registration, and cleanup only.
- Domain modules under `src/position` cannot import `obsidian`.
- Obsidian-specific types and DOM access stay under `src/obsidian` or the coordinator boundary.
- Preserve the existing `scrollHeightData` map for the current data table and import/export UI.
- Persist leaf-level records across restart and fall back to the file-level record when the leaf record cannot be reused.
- Do not implement P1/P2 backlog items.
- Every behavior change follows red-green-refactor and must keep `npm run build` passing.

---

### Task 1: Test Harness and Versioned Position Store

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Create: `tests/position/positionStore.test.ts`
- Create: `src/position/positionStore.ts`

**Interfaces:**
- Produces `PositionState`, `ScrollPositionRecord`, `LeafPositionRecord`, `PositionStore`, and `migratePositionState`.
- `PositionStore.save(leafId, filePath, height, now)` updates leaf and file fallback records.
- `PositionStore.resolve(leafId, filePath)` returns exact leaf position first, then file fallback.

- [ ] **Step 1: Add the failing position-store tests and test command**

```json
{
  "scripts": {
    "test": "node --import tsx --test tests"
  },
  "devDependencies": {
    "tsx": "^4.20.3"
  }
}
```

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { PositionStore, migratePositionState } from '../../src/position/positionStore';

test('migrates legacy numeric and record values into file fallbacks', () => {
  const state = migratePositionState(undefined, {
    'a.md': 12,
    'b.md': { height: 34, lastAccessed: 50 }
  }, 100);

  assert.deepEqual(state.files['a.md'], { height: 12, lastAccessed: 100 });
  assert.deepEqual(state.files['b.md'], { height: 34, lastAccessed: 50 });
});

test('prefers an exact leaf record and falls back to the file record', () => {
  const store = new PositionStore();
  store.save('leaf-a', 'note.md', 10, 1);
  store.save('leaf-b', 'note.md', 20, 2);

  assert.equal(store.resolve('leaf-a', 'note.md')?.height, 10);
  assert.equal(store.resolve('leaf-c', 'note.md')?.height, 20);
});

test('stores zero and rejects invalid positions', () => {
  const store = new PositionStore();
  assert.equal(store.save('leaf-a', 'note.md', 0, 1), true);
  assert.equal(store.save('leaf-a', 'note.md', Number.NaN, 2), false);
  assert.equal(store.resolve('leaf-a', 'note.md')?.height, 0);
});

test('does not return a leaf record for its previous file', () => {
  const store = new PositionStore();
  store.save('leaf-a', 'old.md', 10, 1);
  store.save('leaf-a', 'new.md', 20, 2);

  assert.equal(store.resolve('leaf-a', 'old.md')?.height, 10);
  assert.equal(store.resolve('leaf-a', 'new.md')?.height, 20);
});
```

- [ ] **Step 2: Install the test dependency and verify RED**

Run: `npm install`

Run: `npm test`

Expected: FAIL because `src/position/positionStore.ts` does not exist.

- [ ] **Step 3: Implement the minimal versioned store**

```ts
export interface ScrollPositionRecord {
  height: number;
  lastAccessed: number;
}

export interface LeafPositionRecord extends ScrollPositionRecord {
  filePath: string;
}

export interface PositionState {
  version: 2;
  files: Record<string, ScrollPositionRecord>;
  leaves: Record<string, LeafPositionRecord>;
}

export class PositionStore {
  constructor(private state: PositionState = emptyPositionState()) {}
  save(leafId: string, filePath: string, height: number, now = Date.now()): boolean;
  resolve(leafId: string, filePath: string): ScrollPositionRecord | undefined;
  snapshot(): PositionState;
}

export function migratePositionState(
  state: unknown,
  legacy: unknown,
  now = Date.now()
): PositionState;
```

Implement validation with `Number.isFinite(height) && height >= 0`, clone snapshots, exact leaf/file matching, and legacy migration.

- [ ] **Step 4: Verify GREEN**

Run: `npm test`

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```powershell
git add package.json package-lock.json tsconfig.json tests/position/positionStore.test.ts src/position/positionStore.ts
git commit -m "feat: add versioned leaf position store"
```

### Task 2: Cancellable Restoration Scheduler

**Files:**
- Create: `tests/position/restorationScheduler.test.ts`
- Create: `src/position/restorationScheduler.ts`

**Interfaces:**
- Consumes no Obsidian APIs.
- Produces `RestorationScheduler`, `RestorationTarget`, `RestorationResult`, and `RestorationOptions`.
- `start(key, targetHeight, target, options)` cancels the previous task for the key.

- [ ] **Step 1: Write failing scheduler tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { RestorationScheduler } from '../../src/position/restorationScheduler';

test('applies until the target reaches the requested position', async () => {
  let scroll = 0;
  const scheduler = new RestorationScheduler();
  const result = await scheduler.start('leaf-a', 20, {
    isCurrent: () => true,
    readScroll: () => scroll,
    applyScroll: value => { scroll = value; }
  }, { maxAttempts: 3, intervalMs: 0 });

  assert.equal(result.reason, 'completed');
  assert.equal(scroll, 20);
});

test('a new task cancels the previous task for the same leaf', async () => {
  const scheduler = new RestorationScheduler();
  const target = { isCurrent: () => true, readScroll: () => 0, applyScroll: () => {} };
  const first = scheduler.start('leaf-a', 10, target, { maxAttempts: 5, intervalMs: 5 });
  const second = scheduler.start('leaf-a', 20, target, { maxAttempts: 1, intervalMs: 0 });

  assert.equal((await first).reason, 'cancelled');
  assert.equal((await second).reason, 'expired');
});

test('stops without applying when the leaf or file is stale', async () => {
  let applies = 0;
  const scheduler = new RestorationScheduler();
  const result = await scheduler.start('leaf-a', 20, {
    isCurrent: () => false,
    readScroll: () => 0,
    applyScroll: () => { applies++; }
  }, { maxAttempts: 3, intervalMs: 0 });

  assert.equal(result.reason, 'stale');
  assert.equal(applies, 0);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test`

Expected: FAIL because `restorationScheduler.ts` does not exist.

- [ ] **Step 3: Implement the scheduler**

```ts
export interface RestorationTarget {
  isCurrent(): boolean;
  readScroll(): number | undefined;
  applyScroll(height: number): void;
}

export type RestorationReason = 'completed' | 'cancelled' | 'stale' | 'expired';

export interface RestorationResult {
  reason: RestorationReason;
  attempts: number;
  actualHeight?: number;
}

export interface RestorationOptions {
  maxAttempts: number;
  intervalMs: number;
  tolerance?: number;
}

export class RestorationScheduler {
  start(key: string, height: number, target: RestorationTarget, options: RestorationOptions): Promise<RestorationResult>;
  cancel(key: string): void;
  cancelAll(): void;
  isApplying(key: string): boolean;
}
```

Use a monotonically increasing token per key. Check the token and `isCurrent()` before every apply and after every wait. Mark the key as applying only while calling `applyScroll`.

- [ ] **Step 4: Verify GREEN**

Run: `npm test`

Expected: all store and scheduler tests pass.

- [ ] **Step 5: Commit**

```powershell
git add tests/position/restorationScheduler.test.ts src/position/restorationScheduler.ts
git commit -m "feat: add cancellable restoration scheduler"
```

### Task 3: Anchor Suppression

**Files:**
- Create: `tests/position/anchorSuppression.test.ts`
- Create: `src/position/anchorSuppression.ts`

**Interfaces:**
- Produces `AnchorSuppression.mark(filePath, now)`, `consume(filePath, now)`, and `clearExpired(now)`.
- The coordinator consumes a matching record once before starting restoration.

- [ ] **Step 1: Write failing suppression tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { AnchorSuppression } from '../../src/position/anchorSuppression';

test('consumes a matching suppression once', () => {
  const suppression = new AnchorSuppression(500);
  suppression.mark('note.md', 100);
  assert.equal(suppression.consume('note.md', 200), true);
  assert.equal(suppression.consume('note.md', 201), false);
});

test('does not consume an expired suppression', () => {
  const suppression = new AnchorSuppression(500);
  suppression.mark('note.md', 100);
  assert.equal(suppression.consume('note.md', 601), false);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test`

Expected: FAIL because `anchorSuppression.ts` does not exist.

- [ ] **Step 3: Implement the minimal suppression map**

```ts
export class AnchorSuppression {
  constructor(private readonly ttlMs: number) {}
  mark(filePath: string, now = Date.now()): void;
  consume(filePath: string, now = Date.now()): boolean;
  clearExpired(now = Date.now()): void;
}
```

Store expiry timestamps by normalized file path. `consume` deletes matching entries whether valid or expired.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm test`

Expected: all tests pass.

```powershell
git add tests/position/anchorSuppression.test.ts src/position/anchorSuppression.ts
git commit -m "feat: add anchor navigation suppression"
```

### Task 4: Obsidian Leaf Registry

**Files:**
- Create: `tests/obsidian/leafRegistry.test.ts`
- Create: `src/obsidian/leafRegistry.ts`

**Interfaces:**
- Consumes a narrow injected leaf source; production composition adapts `App`, `MarkdownView`, and `WorkspaceLeaf` to it.
- Produces `LeafRegistry`, `RegisteredLeaf`, and `LeafScrollEvent`.
- Uses the runtime leaf `id` property through one isolated compatibility cast; if absent, assigns a session-only ID through `WeakMap`.

- [ ] **Step 1: Write a failing registry lifecycle test**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { LeafRegistry } from '../../src/obsidian/leafRegistry';

test('rebinds changed views and removes listeners for detached leaves', () => {
  const removed: string[] = [];
  const source = createFakeLeafSource(removed);
  const registry = new LeafRegistry(source);

  registry.reconcile(() => {});
  source.replaceView('leaf-a');
  registry.reconcile(() => {});
  source.detach('leaf-a');
  registry.reconcile(() => {});

  assert.deepEqual(removed, ['view-1', 'view-2']);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test`

Expected: FAIL because `src/obsidian/leafRegistry.ts` does not exist.

- [ ] **Step 3: Implement the typed Obsidian boundary**

```ts
export interface RegisteredLeaf {
  leaf: WorkspaceLeaf;
  leafId: string;
  filePath: string;
  view: MarkdownView;
}

export class LeafRegistry {
  constructor(private readonly source: LeafSource) {}
  describe(leaf: WorkspaceLeaf | null): RegisteredLeaf | undefined;
  allMarkdownLeaves(): RegisteredLeaf[];
  isCurrent(leafId: string, filePath: string, view: MarkdownView): boolean;
  readScroll(record: RegisteredLeaf): number | undefined;
  applyScroll(record: RegisteredLeaf, height: number): void;
  bindScroll(record: RegisteredLeaf, callback: () => void): void;
  reconcile(callback: (record: RegisteredLeaf) => void): void;
  dispose(): void;
}
```

`LeafSource` supplies leaf IDs, file paths, scroll reads/writes, current-state checks, leaf enumeration, and listener registration. The production source binds the scroll listener to `view.containerEl` in capture mode. Rebinding the same leaf/view pair is a no-op; changed views replace the previous listener. `dispose` removes every listener.

- [ ] **Step 4: Run tests and production type check**

Run: `npm test`

Expected: registry lifecycle test passes.

Run: `npm run build`

Expected: PASS with the registry unused but fully typed.

- [ ] **Step 5: Commit**

```powershell
git add tests/obsidian/leafRegistry.test.ts src/obsidian/leafRegistry.ts
git commit -m "refactor: isolate Obsidian leaf access"
```

### Task 5: Position Coordinator and Plugin Composition

**Files:**
- Create: `src/position/positionCoordinator.ts`
- Modify: `src/main.ts`
- Modify: `src/setting.ts`
- Modify: `src/utils/dataExportImportUtil.ts`

**Interfaces:**
- Consumes `PositionStore`, `RestorationScheduler`, `AnchorSuppression`, and `LeafRegistry`.
- Produces `PositionCoordinator.start()`, `reconcile()`, `handleActiveLeafChange()`, `handleFileOpen()`, `markAnchorNavigation()`, and `dispose()`.
- `LastPositionSettings.positionState` stores the versioned snapshot.

- [ ] **Step 1: Add `positionState` to settings and persistence migration**

```ts
export interface LastPositionSettings {
  positionState: PositionState;
  // existing fields remain unchanged
}
```

In `loadSettings`, call `migratePositionState(loadedData.positionState, loadedData.scrollHeightData)`, construct `PositionStore`, and rebuild `scrollHeightData` from `positionState.files`. In `saveSettings`, persist the store snapshot and serialize its file records to the existing legacy object.

- [ ] **Step 2: Implement the coordinator**

```ts
export interface PositionCoordinatorOptions {
  registry: LeafRegistry;
  store: PositionStore;
  scheduler: RestorationScheduler;
  anchorSuppression: AnchorSuppression;
  maxAttempts: () => number;
  debounceMs: () => number;
  persist: () => Promise<void>;
  updateStatus: (height: number) => void;
  onRestoreExpired: (details: RestoreExpiryDetails) => void;
}

export class PositionCoordinator {
  start(): void;
  reconcile(): void;
  handleActiveLeafChange(leaf: WorkspaceLeaf | null): void;
  handleFileOpen(): void;
  markAnchorNavigation(filePath: string): void;
  dispose(): Promise<void>;
}
```

Save the previous active leaf synchronously before switching. Debounce saves per leaf. Ignore scroll callbacks while `scheduler.isApplying(leafId)` is true; otherwise cancel restoration and save. Restore leaf record first, then fallback, unless anchor suppression is consumed.

- [ ] **Step 3: Replace global state in `main.ts` with composition wiring**

`main.ts` must remove `scrollHeight`, `fileName`, `isLoading`, `fileNameList`, `readOpenFileInfo`, `registerOpenFileEvent`, and `previewScrollTO`.

Register:

```ts
workspace.on('active-leaf-change', leaf => coordinator.handleActiveLeafChange(leaf));
workspace.on('file-open', () => coordinator.handleFileOpen());
workspace.on('layout-change', () => coordinator.reconcile());
```

Add one capture listener for internal links. Read `data-href`, split the subpath at `#`, resolve the target file with `metadataCache.getFirstLinkpathDest`, and call `markAnchorNavigation` only when a non-empty subpath exists.

- [ ] **Step 4: Keep import/export synchronized**

After successful import, rebuild `positionState.files` through the store-compatible migration path so imported file records remain valid fallbacks. Export continues to use the legacy map.

- [ ] **Step 5: Run tests and build**

Run: `npm test`

Expected: all domain tests pass.

Run: `npm run build`

Expected: TypeScript and esbuild complete successfully.

- [ ] **Step 6: Commit**

```powershell
git add src/main.ts src/setting.ts src/utils/dataExportImportUtil.ts src/position/positionCoordinator.ts
git commit -m "fix: coordinate scroll restoration per leaf"
```

### Task 6: Regression Review and Release Readiness

**Files:**
- Modify: `todo.md`
- Review: `src/main.ts`
- Review: `src/position/*.ts`
- Review: `src/obsidian/*.ts`

**Interfaces:**
- No new public interfaces.
- Confirms P0 acceptance criteria and module boundaries.

- [ ] **Step 1: Run complete verification**

Run: `npm test`

Run: `npm run build`

Run: `git diff --check HEAD~4`

Expected: all commands pass without warnings caused by the new implementation.

- [ ] **Step 2: Review maintainability constraints**

Confirm:

- No domain file imports `obsidian`.
- `main.ts` has no retry loop, leaf map, or scroll persistence logic.
- Every timer and DOM/workspace listener is owned and cleaned up.
- File fallback and leaf records are written together.
- Position `0` is not discarded by truthiness checks.

- [ ] **Step 3: Update the P0 checklist**

Mark only the implemented P0 items complete in `todo.md`; leave P1/P2 unchanged.

- [ ] **Step 4: Commit**

```powershell
git add todo.md
git commit -m "docs: mark P0 restoration work complete"
```
