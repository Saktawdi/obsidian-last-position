# Cross-File Anchor Replay Design

**Date:** 2026-07-15

## Problem

The plugin suppresses saved-position restoration when a rendered internal link targets a heading or block in another file. In reading mode, Obsidian can attempt the native anchor scroll before a long target note finishes rendering and later leave the visible document at the top. The suppression succeeds, so neither the fixed restore delay nor the smart restore delay runs, and the plugin never gives the native anchor navigation a second chance.

## Scope

- Cover cross-file heading and block-reference links captured from rendered internal-link clicks.
- Keep ordinary file navigation and same-file anchor navigation unchanged.
- Never replace an anchor request with the file's saved historical height.
- Do not persist a replayed anchor position as new history.
- Cancel pending work when the user scrolls, the active leaf changes, or the target file becomes stale.

## Design

Capture the complete link text, source path, and resolved target file before Obsidian handles the click. Store the request as a short-lived pending anchor navigation instead of storing only a target-path suppression flag.

When the coordinator opens the matching target file, it consumes the pending request, cancels ordinary restoration for that leaf, and resolves the same restore delay used by normal file restoration. Smart mode therefore uses source and target character counts, while fixed mode uses the configured delay.

After the delay, the coordinator verifies that the same leaf still displays the target file and that the request has not been cancelled. It then invokes an injected Obsidian adapter once. The adapter calls `workspace.openLinkText(linkText, sourcePath, false)` so Obsidian performs its native heading or block navigation against the now-rendered target view.

The replay is one-shot. Programmatic events caused by it must not schedule historical restoration, and no retry loop or DOM selector is introduced. If the initial native navigation already succeeded, replaying the same anchor keeps the view at the same destination.

## State And Cancellation

Pending anchor requests are generation-scoped so a newer cross-file navigation supersedes an older request. A request expires using the existing bounded anchor-navigation lifetime.

The coordinator clears a pending replay when:

- the user initiates a scroll before replay;
- the active leaf or file no longer matches;
- a newer anchor request replaces it;
- the coordinator is disposed; or
- the single replay has been dispatched.

Native scroll events remain non-persistent. Successful replay is silent.

## Testing

Add coordinator-level tests proving that:

- a cross-file heading request skips historical restoration and replays once after the resolved delay;
- the smart/fixed delay resolver receives the original source and target records;
- block-reference link text is forwarded unchanged;
- a user scroll, stale file, or newer request cancels the old replay;
- replay does not mutate stored history or enqueue persistence; and
- ordinary navigation and later reopening still restore saved positions.

Production verification requires the full test suite, TypeScript build, production bundle, and `git diff --check` to pass.
