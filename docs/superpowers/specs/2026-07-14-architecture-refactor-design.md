# Last Position Architecture Refactor Design

## Goal

Reduce coupling and make future features additive by turning `main.ts` into a composition root and separating domain data, storage, core restoration, commands, settings, UI, and Obsidian adapters.

## Current Problems

- `src/main.ts` owns lifecycle, migration, persistence, coordinator construction, commands, status-bar behavior, link navigation, and cleanup.
- `src/setting.ts`, `src/component/dataTable.ts`, and `src/utils/dataExportImportUtil.ts` depend on `LastPositionPlugin`, creating reverse dependencies into the composition root.
- `src/position/` mixes pure data storage, import/export, scheduling, and runtime coordination.
- Command behavior is partially extracted, but command registration and application workflows remain in `main.ts`.

## Target Boundaries

```text
main.ts                 composition root and lifecycle wiring
core/                   restoration orchestration and application use cases
domain/                 pure position/settings contracts and validation rules
storage/                state store, migration, transfer, persistence queue
commands/               command IDs, command registration, command workflows
settings/               settings model and settings tab controller
ui/                     modals, status bar, data table, notices
adapters/               Obsidian leaf and workspace integrations
```

Dependency direction is inward: `main` composes modules; `commands`, `settings`, and `ui` consume application interfaces; `core` consumes domain contracts and adapter interfaces; `storage` remains free of Obsidian UI dependencies. Compatibility re-export files remain at existing paths while imports migrate.

## Migration Strategy

1. Extract pure domain contracts and storage services without changing behavior.
2. Extract persistence and core construction from `main.ts`.
3. Move command registration and workflows to a generic `commands` module.
4. Refactor settings and data table around service interfaces instead of `LastPositionPlugin` imports.
5. Move UI and adapter modules, remove compatibility-only imports after all callers migrate.
6. Keep each phase covered by the existing unit suite and a successful production build.

## Non-Goals

- No changes to restore semantics, bookmark semantics, import formats, or user-facing command behavior.
- No new external dependencies.
- No deletion of compatibility exports until all internal imports have moved.

## Acceptance Criteria

- `main.ts` contains composition/lifecycle code only and is materially smaller.
- No `setting.ts`, `dataTable.ts`, or transfer utility imports `LastPositionPlugin` directly.
- Commands can be extended by adding a command module without editing core storage code.
- Storage and core modules remain testable without loading the Obsidian runtime.
- Existing tests and build pass after every migration phase.
