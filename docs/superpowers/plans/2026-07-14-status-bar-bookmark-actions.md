# Status Bar Bookmark Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add left-click save and right-click bookmark-menu actions to the existing status-bar height indicator.

**Architecture:** Keep bookmark persistence and guarded scrolling in the existing `PositionStore` and `PositionCoordinator`. Add a small pure status-bar action model for testable event decisions, then wire the status-bar DOM element in `main.ts`; the right-click menu will use Obsidian's native `Menu` and only display bookmarks for the captured active file.

**Tech Stack:** TypeScript, Obsidian `Menu`, existing bookmark modals/coordinator, Node test runner via `tsx`.

## Global Constraints

- Left click saves a bookmark using the current active file and height.
- Right click opens a native menu containing only bookmarks for the current file.
- Selecting a menu item calls the existing guarded `scrollActiveTo` method.
- The browser context menu must be suppressed only for the plugin status-bar element.
- Empty active views and empty bookmark lists use existing localized notices.
- Existing Ctrl+P commands remain available and unchanged.

### Task 1: Add Testable Status-Bar Action Model

**Files:**
- Create: `src/position/statusBarBookmarkActions.ts`
- Create: `tests/position/statusBarBookmarkActions.test.ts`

**Interfaces:**
- `STATUS_BAR_BOOKMARK_ACTIONS = { save: 'save-bookmark', openList: 'open-bookmark-list' } as const`.
- `getStatusBarBookmarkAction(event: { type: 'click' | 'contextmenu' }): 'save-bookmark' | 'open-bookmark-list' | undefined`.

- [ ] **Step 1: Write failing tests** for left-click save, right-click list, and unrelated event types returning `undefined`.
- [ ] **Step 2: Run `node --import tsx --test tests/position/statusBarBookmarkActions.test.ts` and confirm the module is missing.
- [ ] **Step 3: Implement the two action constants and pure event mapping.
- [ ] **Step 4: Re-run the focused test and confirm all cases pass.

### Task 2: Wire Status-Bar Save and Native Bookmark Menu

**Files:**
- Modify: `src/main.ts`
- Modify: `.language/translations.ts`

**Interfaces:**
- Add `registerStatusBarBookmarkActions(coordinator)` to bind only `this.statusBarItemEl`.
- Left-click opens `BookmarkNameModal` with the active position captured from `coordinator.getActivePosition()`.
- Context-menu captures the active position, calls `positionStore.listBookmarks(filePath)`, and builds `new Menu()` items whose callbacks call `coordinator.scrollActiveTo(filePath, bookmark.height)`.

- [ ] **Step 1: Add localized menu labels for no active view, no bookmarks, and bookmark height display if needed.
- [ ] **Step 2: Register the status-bar click and contextmenu handlers immediately after the element is created.
- [ ] **Step 3: Reuse existing save persistence and stale-file Notice behavior; do not duplicate store or coordinator logic.
- [ ] **Step 4: Run `npm run build` and fix TypeScript/API errors.

### Task 3: Verification and User Test Handoff

**Files:**
- Modify: `todo.md` only if the status-bar interaction needs tracking.

- [ ] **Step 1: Run `npm test` and confirm all tests pass.
- [ ] **Step 2: Run `npm run build` and `git diff --check`.
- [ ] **Step 3: Provide manual Obsidian cases for left-click save, right-click current-file filtering, menu navigation after file changes, and no-default-context-menu behavior.
