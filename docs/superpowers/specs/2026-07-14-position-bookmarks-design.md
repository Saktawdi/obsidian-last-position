# Position Bookmarks Design

**Goal:** Add two bilingual Ctrl+P commands that save the current document height as a named bookmark and select a bookmark from the current file to scroll to it.

## Scope

- Bookmarks are scoped to the current file and shared by all leaves/tabs showing that file.
- Normal last-position records remain per-leaf with file fallback; bookmarks do not replace or overwrite those records.
- The command palette exposes exactly two commands:
  - Chinese: `Last Position：保存书签`, `Last Position：选择书签`
  - English: `Last Position: Save Bookmark`, `Last Position: Select Bookmark`
- Command ids are `last-position-save-bookmark` and `last-position-select-bookmark`.
- No bookmark deletion or editing command is added in this iteration.

## Data Model

Extend the existing additive v2 `PositionState` with an optional-compatible `bookmarks` map. Missing `bookmarks` from older data is normalized to `{}`.

```ts
export interface PositionBookmark {
  name: string;
  height: number;
  createdAt: number;
}

interface PositionState {
  version: 2;
  files: Record<string, ScrollPositionRecord>;
  leaves: Record<string, LeafPositionRecord>;
  bookmarks: Record<string, PositionBookmark[]>;
}
```

The store owns validation and name allocation:

- `saveBookmark(filePath, requestedName, height, now)` trims and validates the name and non-negative finite height.
- A blank name is rejected at the modal boundary and at the store boundary.
- If the requested name already exists for the file, allocate `name (1)`, then `name (2)`, and so on until unique. Existing bookmarks are never overwritten.
- `listBookmarks(filePath)` returns a copy sorted by creation time ascending, so the list is deterministic.
- `deleteFile(filePath)` removes the file's fallback, leaf records, and bookmarks.

The versioned exporter includes bookmarks. Legacy array/map imports contain no bookmarks and therefore leave existing bookmarks unchanged during merge.

## Command Flow

### Save Bookmark

1. Resolve the active Markdown record through `PositionCoordinator`.
2. If no active Markdown file or no finite scroll height exists, show the existing no-active-view notice.
3. Open a small `Modal` with a text input and submit/cancel actions.
4. On submit, call `PositionStore.saveBookmark` with the captured file path and height, persist through the plugin persistence queue, then show the generated final name. This captures the original file/height before the modal opens.

### Select Bookmark

1. Resolve the active Markdown record and list bookmarks for its file path.
2. If none exist, show a dedicated no-bookmarks notice.
3. Open an Obsidian `SuggestModal<PositionBookmark>` showing `name` and rounded height, with built-in keyboard filtering.
4. On selection, ask `PositionCoordinator` to scroll the active leaf only when it still shows the captured file path. The coordinator cancels any pending restore, applies the height, updates the status bar, and does not save this programmatic jump as a new last position.
5. If the user changed files while the picker was open, reject the stale selection and show a navigation notice rather than scrolling the wrong document.

## Module Boundaries

- `src/position/positionStore.ts`: bookmark schema, validation, suffix allocation, listing, deletion, and state merge.
- `src/position/positionCoordinator.ts`: active-position lookup and guarded programmatic scroll for bookmark selection.
- `src/component/bookmarkModals.ts`: name input modal and bookmark suggestion modal; no persistence logic.
- `src/main.ts`: bilingual command registration, notices, and persistence orchestration.
- `.language/translations.ts`: command labels, modal labels, and notices in Chinese and English.
- `src/position/positionDataTransfer.ts`: v2 bookmark serialization/validation and legacy import compatibility.

## Error Handling

- Invalid names/heights never mutate state.
- Persistence failures use the existing persistence error path; the in-memory bookmark is not silently reported as durable.
- Selecting a bookmark after a file change is rejected by file-path check.
- Empty bookmark lists and missing active Markdown views use localized notices.

## Testing

- Store tests cover save, zero height, duplicate suffixes, deterministic listing, invalid input, merge, and delete cleanup.
- Migration/transfer tests cover v2 bookmark round-trip, v2 data without bookmarks, legacy imports, and preservation of existing bookmarks.
- Coordinator tests cover guarded bookmark scrolling, cancellation of pending restoration, status update, and stale-file rejection.
- Build and full test suite must pass before manual Obsidian testing.

