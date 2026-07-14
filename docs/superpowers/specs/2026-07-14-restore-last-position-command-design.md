# Restore Last Position Command Design

**Date:** 2026-07-14

**Goal:** Add a command-palette command named `Last Position: To Last Position` that restores the historical scroll height for the active Markdown leaf.

## Scope

The command applies only to the currently active Markdown leaf. It uses the same lookup and retry behavior as automatic restoration:

1. Prefer the exact leaf record.
2. Fall back to the file-level record.
3. Do nothing when no active Markdown position or historical record exists.

The command does not change persisted data formats, settings, automatic file-open restoration, bookmark behavior, or mode-change handling.

## Architecture

`PositionCoordinator` remains the owner of active-leaf state, position lookup, restore scheduling, and scroll lifecycle rules. It will expose `restoreActivePosition(): boolean` as a small public operation for command consumers.

The new `RestorePositionCommandController` will implement `CommandModule`. It will register the stable command id `last-position-to-last-position`, call the coordinator operation, and show localized notices for missing active views or missing historical positions. It will not access `PositionStore` directly or call Obsidian scroll APIs.

`main.ts` will compose the new command module with the existing bookmark command module through `CommandRegistry`.

## Restore Flow

When `restoreActivePosition()` is called:

1. Resolve the current active record and its stored position.
2. Return `false` if the active record or stored position is unavailable.
3. Cancel a pending debounced save for the active leaf without persisting that transient value. This prevents a pre-command user scroll from overwriting the historical target after the command starts.
4. Schedule the historical target through the existing restore scheduler and retry settings.
5. Let existing restoration result handling update the status bar and mode handoff state.

The operation must not synthesize `file-open` or `active-leaf-change` events, and it must not persist a restored height as a new user position.

## Localization and Naming

Add translation entries for:

- Command label: `To Last Position` / `滚动到历史位置`
- Missing historical position notice: `No historical position for the current file` / `当前文件没有历史位置`

The visible command name is composed with the existing `Last Position:` prefix. The command id remains lowercase, stable, and plugin-specific: `last-position-to-last-position`.

## Testing

Add tests for:

- Manual restore using an exact leaf record.
- Manual restore falling back to the file record.
- Manual restore returning failure without a stored position.
- Pending debounced user saves being cancelled so they cannot overwrite the restore target.
- Command registration using the stable id and localized name.

Run the full test suite, production build, and `git diff --check` after implementation.

## Non-Goals

- No new command arguments or bookmark selection UI.
- No changes to settings schema or migration logic.
- No periodic or background restoration.
- No changes to existing bookmark commands.
