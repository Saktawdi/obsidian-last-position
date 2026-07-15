# To Last Position Command Design

## Goal

Register a `To last position` command that jumps the active Markdown file to its saved historical height by reusing the existing position store and coordinator jump path.

## Command Ownership

Create `CommonCommandController` in `src/commands/commonCommands.ts`. It implements the existing `CommandModule` interface and shares the existing `CommandContext` used by `BookmarkCommandController`.

`main.ts` constructs both controllers and passes them to `CommandRegistry`. The status bar continues to depend only on `BookmarkCommandController`; no bookmark behavior moves into the common controller.

## Command Contract

- ID: `last-position-to-last-position`
- English name: `Last Position: To last position`
- Chinese name: `Last Position: 跳转到上次位置`

The callback:

1. Gets the coordinator and current active position.
2. Shows the existing no-active-view notice when either is unavailable.
3. Resolves history with `store.resolve(position.leafId, position.filePath)`, preserving the existing leaf-specific then file-fallback precedence.
4. Shows `当前文件暂无历史位置` / `No saved position for the current file` when no record exists.
5. Calls `coordinator.scrollActiveTo(position.filePath, saved.height)`.
6. Shows a localized stale-file notice if the jump is rejected because the active file changed.

A successful jump is silent and does not persist or mutate stored history. `scrollActiveTo` remains responsible for cancelling an automatic restore and suppressing the programmatic scroll event.

## Localization

Add three Chinese and English translation keys: command name, no-history notice, and stale-file notice. Keep the command name under the existing `Last Position:` naming convention.

## Testing

Add focused tests for command registration, leaf-specific history precedence, file fallback, no-active-view handling, no-history handling, stale rejection, and successful reuse of `scrollActiveTo`. Run the complete suite and production build. Keep the development watcher stopped until the stable bundle is complete.
