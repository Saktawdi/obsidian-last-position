# Architecture Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate the plugin into domain, storage, core, commands, settings, UI, and adapter boundaries while preserving all current behavior.

**Architecture:** Use compatibility façades during migration. New modules own interfaces and orchestration; existing paths re-export or delegate until all callers move. `main.ts` becomes the composition root and does not implement bookmark, persistence, or settings workflows.

**Tech Stack:** TypeScript, Obsidian API, Node test runner via `tsx`, existing build pipeline.

## Global Constraints

- No changes to restoration, bookmark, import/export, or user-facing command semantics.
- No external dependencies.
- Storage and core tests must not load Obsidian runtime.
- Existing `src/position/*`, `src/setting.ts`, and `src/component/*` entry paths remain valid until all internal imports migrate.
- Run `npm test`, `npm run build`, and `git diff --check` after each phase.

### Task 1: Establish Domain and Storage Boundaries

**Files:**
- Create: `src/domain/positionTypes.ts`
- Create: `src/storage/positionStore.ts`
- Create: `src/storage/positionDataTransfer.ts`
- Modify: `src/position/positionStore.ts` to re-export domain types and storage implementation
- Modify: `src/position/positionDataTransfer.ts` to re-export storage transfer functions
- Test: existing position store and transfer suites

**Interfaces:**
- `PositionRecord`, `LeafPositionRecord`, `PositionBookmark`, and `PositionState` live in `domain/positionTypes.ts`.
- `storage/positionStore.ts` exports `PositionStore`, `emptyPositionState`, `migratePositionState`, `clonePositionState`, and `mergePositionStates`.
- `storage/positionDataTransfer.ts` exports the existing serialize/parse/merge API.

- [ ] **Step 1:** Add domain types and make the existing position store import/re-export them without changing runtime behavior.
- [ ] **Step 2:** Move the store implementation behind `storage/positionStore.ts` and leave `position/positionStore.ts` as a compatibility re-export.
- [ ] **Step 3:** Move transfer implementation behind `storage/positionDataTransfer.ts` and leave the old path as a re-export.
- [ ] **Step 4:** Update internal imports to use `domain` and `storage` paths.
- [ ] **Step 5:** Run the store/transfer tests, full tests, build, and diff check.

### Task 2: Extract Persistence and Core Composition

**Files:**
- Create: `src/storage/positionPersistence.ts`
- Create: `src/core/positionCore.ts`
- Create: `src/core/positionCoordinator.ts` compatibility façade
- Modify: `src/main.ts` to use persistence/core services
- Modify: `src/position/positionCoordinator.ts` only if required for moved imports
- Test: new `tests/storage/positionPersistence.test.ts` and existing coordinator tests

**Interfaces:**
- `PositionPersistenceService` owns `persist`, `import`, and serialized save ordering; it accepts `saveData`, `PositionStore`, and settings state through constructor interfaces.
- `PositionCore` owns `ObsidianLeafSource`, `LeafRegistry`, `RestorationScheduler`, `AnchorSuppression`, and `PositionCoordinator` construction/disposal.

- [ ] **Step 1:** Add failing persistence tests for queued snapshots and imported state delegation.
- [ ] **Step 2:** Implement `PositionPersistenceService` without importing `LastPositionPlugin`.
- [ ] **Step 3:** Add failing core construction test using injected adapter/registry dependencies.
- [ ] **Step 4:** Implement `PositionCore` and migrate `main.ts` coordinator setup to it.
- [ ] **Step 5:** Run persistence/coordinator tests, full tests, build, and diff check.

### Task 3: Extract Generic Command Registration

**Files:**
- Create: `src/commands/commandRegistry.ts`
- Create: `src/commands/bookmarkCommands.ts`
- Create: `src/commands/commandContext.ts`
- Modify: `src/main.ts` to instantiate the command registry only
- Modify: `src/position/bookmarkCommands.ts` to re-export command model symbols
- Test: new `tests/commands/commandRegistry.test.ts` and existing bookmark command tests

**Interfaces:**
- `CommandContext` contains `app`, `store`, `getCoordinator`, `persist`, `flashStatusBar`, and `notice` callbacks.
- `registerCommands(plugin, context)` registers save/select/remove bookmark commands and leaves room for later command modules.
- Bookmark command workflows contain no direct dependency on `LastPositionPlugin`.

- [ ] **Step 1:** Add failing tests for command ID aggregation and context delegation.
- [ ] **Step 2:** Implement `commandContext` and bookmark command registration using the existing modals and confirmation flow.
- [ ] **Step 3:** Replace the command methods in `main.ts` with one registry call.
- [ ] **Step 4:** Run command tests, full tests, build, and diff check.

### Task 4: Remove Settings and UI Reverse Dependencies

**Files:**
- Create: `src/settings/settingsModel.ts`
- Create: `src/settings/settingsTab.ts`
- Create: `src/ui/statusBarController.ts`
- Create: `src/ui/dataTable.ts` compatibility façade or migrated implementation
- Modify: `src/setting.ts` to re-export settings model/tab
- Modify: `src/component/dataTable.ts` to consume a narrow context interface instead of `LastPositionPlugin`
- Modify: `src/utils/dataExportImportUtil.ts` to consume a data-transfer context instead of `LastPositionPlugin`
- Modify: `src/main.ts` to compose settings/UI controllers
- Test: settings parsing, command, and existing UI-adjacent pure tests

- [ ] **Step 1:** Extract settings types/defaults and make `setting.ts` a compatibility re-export.
- [ ] **Step 2:** Define `SettingsDataContext` and update data table/export-import utilities to use it instead of importing `main.ts`.
- [ ] **Step 3:** Extract status-bar presentation/action binding into `ui/statusBarController.ts`.
- [ ] **Step 4:** Reduce `main.ts` to lifecycle, dependency construction, and event wiring.
- [ ] **Step 5:** Run full tests, build, diff check, and manual plugin test cases.
