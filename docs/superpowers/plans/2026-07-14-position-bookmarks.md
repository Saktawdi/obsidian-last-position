# Position Bookmarks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add bilingual Ctrl+P commands for saving and selecting named, file-scoped scroll bookmarks.

**Architecture:** Extend the existing version-2 position store with a normalized file-to-bookmarks map. Keep modal UI responsible for name input and searchable selection, while `PositionCoordinator` owns active-leaf validation and programmatic scrolling so bookmark jumps cannot target a stale file or overwrite ordinary last-position history.

**Tech Stack:** TypeScript, Obsidian `Modal`/`SuggestModal`/`Plugin.addCommand`, Node test runner via `tsx`.

## Global Constraints

- Bookmarks are shared by file path across all leaves showing that file.
- Existing per-leaf history behavior is unchanged.
- Commands use the `Last Position` prefix and are available in Chinese and English.
- Duplicate names are preserved by allocating `name (1)`, `name (2)`, etc.; no overwrite.
- Missing bookmarks in old v2 settings normalize to an empty map.
- Legacy export formats import without creating bookmarks and without deleting existing bookmarks.
- Invalid names, heights, paths, and stale-file selections do not mutate bookmark state.

### Task 1: Extend Position Store and State Migration

**Files:**
- Modify: `src/position/positionStore.ts`
- Modify: `tests/position/positionStore.test.ts`

**Interfaces:**
- Add `PositionBookmark { name: string; height: number; createdAt: number }`.
- Add `bookmarks: Record<string, PositionBookmark[]>` to normalized `PositionState`.
- Add `saveBookmark(filePath, requestedName, height, now): PositionBookmark | undefined`.
- Add `listBookmarks(filePath): PositionBookmark[]`.
- Add bookmark-aware `deleteFile()` and merge behavior.

- [ ] **Step 1: Write failing tests** for empty-state normalization, valid zero-height saves, trimmed names, duplicate suffixes, deterministic listing, invalid input, merge preservation, and delete cleanup.
- [ ] **Step 2: Run `npm test` and confirm failures are limited to missing bookmark state/methods.
- [ ] **Step 3: Implement bookmark validation, suffix allocation, cloning, migration defaults, merge, and deletion in `PositionStore`.
- [ ] **Step 4: Run the focused store tests and confirm they pass.

### Task 2: Add Versioned Export/Import Bookmark Compatibility

**Files:**
- Modify: `src/position/positionDataTransfer.ts`
- Modify: `tests/position/positionDataTransfer.test.ts`

**Interfaces:**
- Versioned export includes `bookmarks`.
- Parser accepts v2 data with missing bookmarks and normalizes it to `{}`.
- Legacy array/map parser returns no imported bookmarks.

- [ ] **Step 1: Add failing tests** for v2 bookmark round-trip, missing-bookmark v2 input, invalid bookmark records, and preserving existing bookmarks when legacy data is imported.
- [ ] **Step 2: Run transfer tests and confirm the new cases fail.
- [ ] **Step 3: Implement strict bookmark parsing/serialization and bookmark-aware state merging.
- [ ] **Step 4: Run transfer tests and confirm all pass.

### Task 3: Add Coordinator Bookmark Context and Jump

**Files:**
- Modify: `src/position/positionCoordinator.ts`
- Modify: `tests/position/positionCoordinator.test.ts`

**Interfaces:**
- `getActivePosition(): { leafId: string; filePath: string; height: number } | undefined`.
- `scrollActiveTo(filePath: string, height: number): boolean`.

- [ ] **Step 1: Add failing tests** for reading the active position, applying a bookmark to the matching leaf, cancelling a pending restore, updating status, not persisting the programmatic jump, and rejecting a changed file.
- [ ] **Step 2: Run coordinator tests and confirm failures.
- [ ] **Step 3: Implement guarded active-position lookup and programmatic scroll through the registry.
- [ ] **Step 4: Run coordinator tests and confirm all pass.

### Task 4: Implement Bilingual Modals and Commands

**Files:**
- Create: `src/component/bookmarkModals.ts`
- Modify: `src/main.ts`
- Modify: `.language/translations.ts`
- Modify: `tests/position/positionBookmarkCommands.test.ts` (pure command helper coverage if UI runtime is unavailable)

**Interfaces:**
- `BookmarkNameModal` accepts a submit callback and returns the entered name.
- `BookmarkSuggestModal` accepts file-scoped bookmarks and invokes a selection callback.
- Commands use ids `last-position-save-bookmark` and `last-position-select-bookmark`.

- [ ] **Step 1: Add failing pure tests** for command ids, file-scoped bookmark selection, and generated duplicate names being reported to the user.
- [ ] **Step 2: Add Chinese/English command labels, modal labels, empty-list notice, and stale-selection notice.
- [ ] **Step 3: Implement the name modal and searchable suggestion modal without persistence logic.
- [ ] **Step 4: Register commands after coordinator initialization; save the captured active file/height, persist, and select through the coordinator guard.
- [ ] **Step 5: Run focused tests and build.

### Task 5: Full Verification and Manual Test Handoff

**Files:**
- Modify: `todo.md`

- [ ] **Step 1: Run `npm test`, `npm run build`, and `git diff --check`.
- [ ] **Step 2: Review export/import and delete paths for bookmark preservation/cleanup.
- [ ] **Step 3: Update `todo.md` and provide Obsidian manual cases for save, duplicate names, current-file filtering, cross-tab sharing, stale selection, and scroll execution.
