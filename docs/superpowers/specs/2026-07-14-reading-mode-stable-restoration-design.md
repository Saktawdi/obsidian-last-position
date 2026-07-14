# Reading Mode Stable Restoration Design

## Problem

In reading mode, `MarkdownSubView.applyScroll()` can report the requested height before Obsidian finishes rebuilding the preview renderer. The current scheduler treats that immediate match as completion. A later renderer reset then moves the visible document to the top while the stored position and status bar remain correct.

The captured A/B/C trace demonstrates the race:

- B restores to `2445.58` with one apply and immediately reports completion.
- The next non-user scroll event reads an invalid height after the restore has ended.
- After visiting C, reopening B needs several applies, which accidentally keeps the task alive through the renderer rebuild and leaves B at the correct height.

Editing mode does not reproduce the issue because its editor scroll container remains stable across the corresponding file switch.

## Approaches

1. **Require a delayed stability confirmation in `RestorationScheduler` (selected).** A target is complete only when it is still within tolerance after one configured retry interval. An invalid confirmation read is treated as renderer instability and consumes another apply attempt. This directly fixes the premature completion without depending on Obsidian internals.
2. **Add a coordinator post-restore watchdog.** Restart restoration when a non-user reset arrives after completion. This duplicates scheduler lifecycle state and creates a second retry mechanism.
3. **Track preview renderer DOM identity.** Rebind whenever Obsidian replaces an internal reading-mode element. This is brittle because the public API exposes the mode but not a stable renderer-ready event or renderer identity contract.

## Design

`RestorationScheduler.start()` keeps the existing maximum-apply-attempt semantics. When a read is within tolerance, it waits `intervalMs`, rechecks cancellation and target identity, and reads again. Only a second matching read returns `completed`.

If the confirmation read is `undefined`, `NaN`, or otherwise non-finite, the scheduler treats the target as not ready and applies again while attempts remain. A finite change away from both the last applied height and the target retains the existing `interrupted` behavior, protecting user or native navigation. Coordinator-driven user scroll cancellation remains unchanged.

No persisted schema, settings, Obsidian adapter, or status-bar behavior changes.

## Testing

Add a scheduler regression test whose first apply reaches the target, then becomes `NaN` before the confirmation interval, and whose second apply remains stable. The test must fail against the current immediate-completion behavior by observing only one apply, then pass with two applies and a `completed` result.

Run the targeted scheduler test, the complete test suite, the production build, and `git diff --check`.
