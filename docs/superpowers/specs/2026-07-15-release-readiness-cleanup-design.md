# 1.0.0 Release Readiness Cleanup Design

## Goal

Prepare the existing 1.0.0 codebase for its GitHub release through targeted lint cleanup, accurate user documentation, and consistent version metadata without broad refactoring.

## Scope

### Source cleanup

- Remove the 13 currently reported ESLint errors only.
- Remove unused imports and trivially inferred type annotations.
- Replace the single eligible `let` declaration with `const` without changing setting order or behavior.
- Add block scopes around `switch` cases that declare lexical variables.
- Preserve runtime behavior and public interfaces.

### README documentation

- Update both `README.md` and `README_en.md` so they describe the same implemented feature set.
- Cover automatic per-view position saving and restoration, anchor-aware navigation, position bookmarks, the "to last position" command, status-bar actions, smart and fixed restore delays, retry settings, data import/export, automatic cleanup, localization, and desktop/mobile availability.
- Document Community Plugins installation and manual installation from a GitHub Release using `main.js`, `manifest.json`, and `styles.css`.
- Keep installation, usage, configuration, notes, and license sections concise and user-facing.
- Do not add a changelog or 1.0.0 release notes to either README.

### Version metadata

- Keep `package.json` and `manifest.json` at version `1.0.0`.
- Keep `manifest.json` minimum Obsidian version at `1.8.0`.
- Change the `versions.json` entry for `1.0.0` from `0.15.0` to `1.8.0`.
- Do not change package naming, dependencies, author metadata, or unrelated release configuration.

### Release notes

- Provide separate Chinese and English 1.0.0 release notes for the GitHub Release page.
- Do not save the release notes into the repository unless requested later.

## Files

- Modify `src/component/confirmedModal.ts`.
- Modify `src/component/dataTable.ts`.
- Modify `src/settings/settingsTab.ts`.
- Modify `src/storage/positionStore.ts`.
- Modify `README.md` and `README_en.md`.
- Modify `versions.json`.
- Leave `todo.md`, existing untracked planning files, archived files, `package.json`, and `manifest.json` unchanged.

## Verification

- Run `npx --no-install eslint "src/**/*.ts"` and require zero errors.
- Run `npm test` and require all tests to pass.
- Run `npm run build` and require a successful production bundle.
- Verify that `package.json`, `manifest.json`, and `versions.json` all describe release `1.0.0`, with minimum Obsidian version `1.8.0` where applicable.
- Inspect the final Git diff to confirm that no pre-existing user changes or untracked files were included.
