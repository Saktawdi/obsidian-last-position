# Cross-File Anchor Replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-run a cross-file heading or block navigation once after the configured restore delay so reading-mode rendering cannot leave the target view at the top.

**Architecture:** `AnchorSuppression` becomes a short-lived request store containing the opaque Obsidian link text and source/target paths. `PositionCoordinator` consumes that request instead of restoring history, schedules one guarded replay through the existing delay resolver, and invokes an injected Obsidian callback only while the original leaf and file remain active.

**Tech Stack:** TypeScript 4.7, Obsidian API, Node.js test runner, `tsx`, esbuild.

## Global Constraints

- Cover cross-file heading and block-reference links only.
- Keep ordinary file navigation and same-file anchor navigation unchanged.
- Use the existing smart/fixed restore delay resolver; do not add another setting or formula.
- Replay with Obsidian's public `workspace.openLinkText()` API, never DOM selectors.
- Replay at most once and never persist it as new position history.
- User scrolling, stale leaf/file state, a newer request, and disposal cancel pending replay.
- Preserve the user's existing `todo.md` edit and unrelated untracked files.

---

### Task 1: Store Complete Anchor Navigation Requests

**Files:**
- Modify: `src/position/anchorSuppression.ts`
- Modify: `tests/position/anchorSuppression.test.ts`

**Interfaces:**
- Produces: `AnchorNavigationRequest` with `linkText`, `sourcePath`, and `targetFilePath`.
- Produces: `AnchorSuppression.mark(request, now?)` and `AnchorSuppression.consume(filePath, now?)` returning the matching request or `undefined`.

- [ ] **Step 1: Replace boolean suppression tests with request tests**

Cover exact payload return, normalized target-path matching, expiration, and a newer request replacing the previous request.

```ts
const request = {
	linkText: 'Folder/Note#Section',
	sourcePath: 'Source.md',
	targetFilePath: 'Folder\\Note.md',
};
suppression.mark(request, 100);
assert.deepEqual(suppression.consume('Folder/Note.md', 200), request);
assert.equal(suppression.consume('Folder/Note.md', 201), undefined);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --import tsx --test tests/position/anchorSuppression.test.ts`

Expected: FAIL because `mark()` still accepts a path and `consume()` returns a boolean.

- [ ] **Step 3: Implement the request store**

```ts
export interface AnchorNavigationRequest {
	linkText: string;
	sourcePath: string;
	targetFilePath: string;
}

interface PendingAnchorNavigation {
	request: AnchorNavigationRequest;
	expiration: number;
}

export class AnchorSuppression {
	private readonly pending = new Map<string, PendingAnchorNavigation>();

	mark(request: AnchorNavigationRequest, now = Date.now()): void {
		this.pending.clear();
		this.pending.set(normalizePath(request.targetFilePath), {
			request: { ...request },
			expiration: now + this.ttlMs,
		});
	}

	consume(filePath: string, now = Date.now()): AnchorNavigationRequest | undefined {
		const key = normalizePath(filePath);
		const pending = this.pending.get(key);
		if (!pending) return undefined;
		this.pending.delete(key);
		return pending.expiration >= now ? { ...pending.request } : undefined;
	}
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --import tsx --test tests/position/anchorSuppression.test.ts`

Expected: all anchor request tests PASS.

### Task 2: Schedule A Guarded One-Shot Replay

**Files:**
- Modify: `src/position/positionCoordinator.ts`
- Modify: `src/position/restoreDelayResolver.ts`
- Modify: `tests/position/positionCoordinator.test.ts`
- Modify: `tests/position/restoreDelayResolver.test.ts`

**Interfaces:**
- Produces: path-only `RestoreDelayContext` with `source?: { filePath: string }` and `target: { filePath: string }`.
- Consumes: `AnchorNavigationRequest` from Task 1.
- Produces: `PositionCoordinatorOptions.replayAnchorNavigation(request)` and `markAnchorNavigation(request)`.

- [ ] **Step 1: Add failing coordinator replay tests**

Add a replay collector to `createCoordinator()` and cover delayed replay without historical `applyScroll`, unchanged store state, opaque block-reference forwarding, user-scroll cancellation, stale-file cancellation, and replacement by a newer request.

```ts
coordinator.markAnchorNavigation({
	linkText: 'b#^block-id',
	sourcePath: 'a.md',
	targetFilePath: 'b.md',
});
source.openFile('leaf-a', 'b.md');
coordinator.handleFileOpen(source.leaves[0].leaf);
await new Promise(resolve => setTimeout(resolve, 30));
assert.deepEqual(getAnchorReplays(), [{
	linkText: 'b#^block-id',
	sourcePath: 'a.md',
	targetFilePath: 'b.md',
}]);
assert.deepEqual(source.appliedHeights, []);
```

- [ ] **Step 2: Run the coordinator test and verify RED**

Run: `node --import tsx --test --test-name-pattern "anchor" tests/position/positionCoordinator.test.ts`

Expected: FAIL because the coordinator accepts only a target path and has no replay callback.

- [ ] **Step 3: Generalize the delay context to file-path documents**

```ts
export interface RestoreDelayDocument {
	filePath: string;
}

export interface RestoreDelayContext {
	source?: RestoreDelayDocument;
	target: RestoreDelayDocument;
}
```

Remove the unused generic parameters from `createRestoreDelayResolver()` and update its tests without changing fixed or smart delay behavior.

- [ ] **Step 4: Implement pending replay lifecycle**

Add a leaf-scoped `PendingAnchorReplay` map. When `scheduleRestore()` consumes an anchor request, call the existing delay resolver with `{ source: { filePath: request.sourcePath }, target: record }`, then dispatch exactly once only if the pending entry is unchanged, the record is current, and it still matches `activeRecord`.

```ts
interface PendingAnchorReplay<TLeaf, TView> {
	record: RegisteredLeaf<TLeaf, TView>;
	request: AnchorNavigationRequest;
	timer?: TimerHandle;
}

private dispatchAnchorReplay(pending: PendingAnchorReplay<TLeaf, TView>): void {
	if (!this.isAnchorReplayCurrent(pending)) return;
	this.pendingAnchorReplays.delete(pending.record.leafId);
	void Promise.resolve(this.options.replayAnchorNavigation(pending.request))
		.catch(() => undefined);
}
```

Cancel pending replay before handling a user scroll, when its active leaf/file changes, when a new request is marked, and during disposal. Do not call `saveCapturedPosition()` or `queuePersist()` from the replay path.

- [ ] **Step 5: Run focused delay and coordinator tests**

Run: `node --import tsx --test tests/position/anchorSuppression.test.ts tests/position/restoreDelayResolver.test.ts tests/position/positionCoordinator.test.ts`

Expected: all focused tests PASS.

### Task 3: Connect Rendered Links To Obsidian Replay

**Files:**
- Modify: `src/main.ts`
- Modify: `src/adapters/obsidian/positionCoreFactory.ts`

**Interfaces:**
- Consumes: `PositionCoordinator.markAnchorNavigation(request)`.
- Produces: one replay through `app.workspace.openLinkText(request.linkText, request.sourcePath, false)`.

- [ ] **Step 1: Capture only cross-file anchor requests**

Require a non-empty path before `#`, resolve it through `metadataCache.getFirstLinkpathDest()`, and ignore a resolved target equal to the source file.

```ts
const linkPath = href.slice(0, hashIndex);
if (!linkPath) return;
const targetFile = this.app.metadataCache.getFirstLinkpathDest(linkPath, sourcePath);
if (!targetFile || targetFile.path === sourcePath) return;
this.coordinator?.markAnchorNavigation({
	linkText: href,
	sourcePath,
	targetFilePath: targetFile.path,
});
```

- [ ] **Step 2: Inject the native replay adapter**

```ts
		replayAnchorNavigation: request =>
			options.app.workspace.openLinkText(request.linkText, request.sourcePath, false),
```

- [ ] **Step 3: Run complete verification**

Run: `npm test`

Expected: all tests PASS.

Run: `npm run build`

Expected: TypeScript and production bundle succeed.

Run: `rg -n "openLinkText|replayAnchorNavigation|AnchorNavigationRequest" src main.js`

Expected: request capture and replay appear in source and the production bundle.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 4: Commit only the implementation files**

```bash
git add src/position/anchorSuppression.ts tests/position/anchorSuppression.test.ts \
  src/position/positionCoordinator.ts src/position/restoreDelayResolver.ts \
  tests/position/positionCoordinator.test.ts tests/position/restoreDelayResolver.test.ts \
  src/main.ts src/adapters/obsidian/positionCoreFactory.ts
git commit -m "fix: replay cross-file anchor navigation"
```
