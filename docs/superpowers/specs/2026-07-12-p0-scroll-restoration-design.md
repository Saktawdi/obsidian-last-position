# P0 Scroll Restoration Design

## Goal

Fix the P0 restoration bugs while establishing maintainable module boundaries. The plugin must persist independent positions for each Obsidian workspace leaf across restarts, fall back to a file-level position when a leaf record cannot be reused, cancel stale restoration work, and avoid overriding heading or block-link navigation.

## Scope

Included:

- Leaf-level and file-level scroll-position persistence.
- Migration from the existing `scrollHeightData` file map.
- Event-driven save and restore coordination.
- Cancellable, bounded restoration tasks.
- Protection for heading and block-link navigation.
- Regression tests for the new domain logic.

Excluded:

- Deleting records for missing files.
- Position bookmarks.
- Redesigning the settings page.
- Replacing every existing translation or fixing all repository metadata.

## Root Cause

The current implementation stores the active file, scroll position, loading flag, and opened-file list as plugin-wide mutable state. A `file-open` callback then restores through `getActiveViewOfType`, which can point at a different leaf by the time a retry runs. `fileNameList` prevents a file from being restored more than once per application session, so workspace and tab changes are ignored. The global `isLoading` flag also blocks unrelated leaves from saving.

The restoration loop applies a pixel offset every 100 ms without proving that the leaf and file still match the original request. It also cannot distinguish a plain file open from an internal heading or block navigation, so it can overwrite Obsidian's native destination.

## Architecture

The implementation will be split into focused modules. `main.ts` remains the composition root and contains plugin lifecycle wiring only.

### Domain: Position Store

`src/position/positionStore.ts` owns the persisted schema and lookup rules. It does not import Obsidian.

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
```

Responsibilities:

- Validate finite, non-negative scroll heights.
- Save a leaf record and update the file fallback in one operation.
- Resolve a position by exact `leafId + filePath`, then by file path.
- Remove a leaf record when the same leaf ID now points to another file before storing the replacement.
- Migrate legacy numeric and `{ height, lastAccessed }` file records into `files`.

The existing `scrollHeightData` map remains available to the current data table and import/export UI during P0. `PositionStore` mirrors file-level updates into that map so P0 does not require an unrelated settings-page rewrite. The versioned `positionState` becomes the authoritative source for restoration.

### Domain: Restoration Scheduler

`src/position/restorationScheduler.ts` owns task identity, cancellation, retry timing, and completion. It does not import Obsidian or manipulate DOM elements.

It receives an adapter with these operations:

```ts
export interface RestorationTarget {
  isCurrent(): boolean;
  readScroll(): number | undefined;
  applyScroll(height: number): void;
}
```

Each leaf can have at most one active task. Starting another task for the leaf cancels the previous token. A task stops when:

- The target reaches the requested position within one pixel.
- The leaf or file is no longer current.
- The task is replaced or explicitly cancelled.
- The bounded restoration window expires.

Retries use the existing retry count for compatibility, but attempts are spaced at 100 ms and capped by the task token. P1 can later replace this compatibility setting with explicit timeout and interval settings without changing the coordinator.

### Obsidian Adapter: Leaf Registry

`src/obsidian/leafRegistry.ts` translates Obsidian workspace leaves and Markdown views into stable domain inputs.

Responsibilities:

- Return the leaf ID, file path, and Markdown view for a leaf.
- Read and apply scroll through `view.currentMode`.
- Enumerate existing Markdown leaves after layout restoration.
- Attach scroll listeners to the Markdown view container and detach them when the view changes or the plugin unloads.

No domain state is stored in this adapter.

### Application: Position Coordinator

`src/position/positionCoordinator.ts` coordinates the store, scheduler, and leaf registry.

Responsibilities:

- Track the previously active leaf so it can be saved before switching.
- Debounce scroll saves per leaf.
- Save leaf state on scroll, active-leaf change, layout change, and unload.
- Restore a leaf after layout readiness, file open, active-leaf change, and workspace layout changes.
- Avoid duplicate restore requests for an unchanged `leafId + filePath` pair.
- Cancel restoration before accepting user scroll input.
- Update the status bar through an injected callback instead of accessing plugin UI directly.

The coordinator is the only module that combines domain operations with Obsidian leaf events.

## Anchor Navigation Protection

Obsidian's public `file-open` event does not include the requested subpath. Protection therefore uses two signals:

1. Capture internal-link click events in the workspace before navigation. Resolve the clicked `data-href` with `metadataCache.getFirstLinkpathDest`; when it targets a heading or block in the destination file, mark the destination leaf/file as suppressed for a short bounded window.
2. Treat an immediate native scroll change after file open as user/native navigation: cancel the pending plugin restoration before it can overwrite the destination.

The click handler only observes links and never performs navigation itself. External links and plain file links are ignored. The suppression record is consumed once and expires automatically, so later ordinary opens still restore.

This covers `[[note#heading]]` and block references initiated through rendered links. Command-driven navigation that cannot expose a subpath still benefits from the native-scroll cancellation rule.

## Event Flow

### Startup

1. Load settings and migrate persisted position state.
2. Wait for `workspace.onLayoutReady`.
3. Register all existing Markdown leaves with the registry.
4. Schedule restoration for each existing leaf, using leaf data first and file fallback second.

### Leaf Change

1. Save the previously active Markdown leaf immediately.
2. Cancel stale work associated with leaves whose view/file changed.
3. Register the new leaf and schedule restoration unless suppressed.

### Scroll

1. A view-scoped scroll event identifies its exact leaf.
2. If the event is not caused by the scheduler, cancel pending restoration for that leaf.
3. Debounce the save for that leaf.
4. Persist both leaf and file fallback records and update the status bar.

### Layout Change

1. Reconcile registered leaves with current workspace leaves.
2. Save surviving leaves before rebinding changed views.
3. Restore newly created or newly bound leaf/file pairs.
4. Remove listeners for leaves that no longer exist while retaining their persisted records for workspace restoration after restart.

### Unload

1. Cancel all restoration and debounce timers.
2. Save every currently registered Markdown leaf.
3. Detach view listeners.

## Persistence and Migration

`LastPositionSettings` gains `positionState`. Loading accepts these inputs:

- Version 2 state: validate and use it.
- Existing `scrollHeightData` object containing numbers: convert each value into a file record with the current timestamp.
- Existing `scrollHeightData` object containing records: copy valid heights and timestamps into file records.

Saving writes both `positionState` and the legacy-compatible `scrollHeightData` object. No destructive migration occurs, so users can downgrade without losing the file-level positions they already had.

## Error Handling

- Missing leaf, Markdown view, or file causes the operation to stop quietly.
- Invalid persisted heights are ignored instead of applied.
- A failed restoration does not block saves in another leaf.
- Scheduler expiry logs one structured warning containing leaf ID, file path, target height, actual height, attempts, and stop reason. Existing user notices are retained only for genuine expiry, not cancellation.
- Persistence writes are serialized through one pending-save promise to avoid overlapping `saveData` calls.

## Testing

Use Node's built-in test runner with TypeScript compiled by a dedicated test tsconfig. Domain modules remain free of Obsidian imports so tests run without an Obsidian runtime.

Required tests:

- Legacy numeric and record migration.
- Exact leaf lookup and file fallback lookup.
- Saving height `0` and rejecting invalid heights.
- Replacing a leaf's file association without returning the previous file's position.
- Scheduler success, expiry, cancellation, and stale-target termination.
- New restore request cancelling the previous request for the same leaf.
- Coordinator-level decision helpers for anchor suppression consumption and expiry.
- Persistence serialization preserves both versioned and legacy-compatible data.

The production build must continue to pass `npm run build`. Tests must fail before each corresponding implementation is added and pass afterward.

## Maintainability Constraints

- `main.ts` is limited to lifecycle setup, dependency construction, settings registration, and cleanup.
- Domain modules cannot import `obsidian`.
- Obsidian-specific types and DOM access stay under `src/obsidian` or the coordinator boundary.
- Each module exposes a narrow interface and owns one responsibility.
- No new global mutable state is introduced.
- Timers and listeners must have explicit ownership and cleanup.
- P0 work must not bundle the P1/P2 feature backlog.

## Acceptance Criteria

- Two leaves showing the same file retain independent positions across switching and application restart when the same leaf IDs are restored.
- A new or unmatched leaf restores the last file-level fallback.
- Switching workspaces restores the positions of their Markdown leaves without restarting Obsidian.
- Rapid file or leaf switching cannot apply an older task to the current view.
- Renaming a heading on Android does not trigger a plugin restoration to the top.
- Opening `[[note#heading]]` or a block reference lands at the native target on the first attempt.
- Position zero is persisted correctly.
- Existing file-level user data migrates without loss.
- Automated tests and `npm run build` pass.
