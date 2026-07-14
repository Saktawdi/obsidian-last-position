# Smart Restore Delay Design

## Goal

Add an opt-in smart restore delay that uses the source and target Markdown character counts to choose the initial reading-position restore delay. Remove all temporary restore experiment logging and its supporting fields.

## Settings

Add `enableSmartRestoreDelay: boolean` to `LastPositionSettings` with a default value of `false`.

The settings tab shows a toggle named `Smart restore delay (Beta)` immediately before the existing fixed restore-delay setting. When enabled, the fixed delay input is disabled because its value is ignored. Changing either setting takes effect immediately and is persisted through the existing settings path.

Existing installations receive `false` through `DEFAULT_SETTINGS`, preserving their current fixed-delay behavior.

## Delay Formula

Smart mode calculates the complete delay from navigation time; it does not add or otherwise consult `restoreDelayMs`:

```text
smartDelayMs = clamp(
  300,
  4000,
  round(300 + targetCharacterCount / 500 + sourceCharacterCount / 1250)
)
```

When there is no source Markdown file, `sourceCharacterCount` is zero. If either file cannot be read, its character count is zero and restoration continues rather than failing.

Fixed mode continues to use `max(0, restoreDelayMs)` without reading document content.

## Character Measurement

The Obsidian adapter resolves source and target paths to `TFile` instances and reads them through `vault.cachedRead`. Counts use JavaScript string length, matching the manual experiment data used to derive the formula.

Source and target reads run concurrently. The plugin does not add another character-count cache; `vault.cachedRead` supplies Obsidian's current cached content, and each smart restore recounts that content so edits cannot leave a stale count.

Measurement time counts toward the selected delay. The coordinator records the navigation start time, awaits the delay calculation, and schedules only the remaining duration:

```text
remainingDelayMs = max(0, calculatedDelayMs - elapsedCalculationMs)
```

This prevents content measurement from being added on top of the intended delay.

## Restore Lifecycle

The coordinator owns a generation for each leaf restore request before starting asynchronous delay resolution. A newer navigation, user cancellation, disposal, or stale record invalidates the older generation.

After delay resolution, the coordinator verifies that the request generation and leaf record are still current. Only then does it create the remaining-delay timer or start restoration immediately when no delay remains. Results from superseded calculations must not apply or restore an old file.

The restoration scheduler, retry interval, maximum attempts, anchor suppression, saving behavior, and reading/editing mode behavior otherwise remain unchanged.

## Experiment Cleanup

Remove the temporary `[Last-Position-Experiment]` console output and all code used only to produce it:

- delete `src/restoreExperiment.ts`;
- remove document-open and document-metrics logging from `main.ts`;
- remove trace state and event logging from `PositionCoordinator`;
- remove temporary `byteSize` fields from leaf records and the Obsidian leaf source.

No replacement debug logging is added.

## Testing

Tests must cover:

- formula values, rounding, minimum, and maximum bounds;
- smart mode using source and target character counts while ignoring the fixed delay;
- fixed mode retaining the configured delay without measuring files;
- measurement time reducing the remaining timer duration;
- a newer navigation invalidating an unresolved older calculation;
- read failures falling back to zero for the affected character count;
- the new setting defaulting to disabled;
- removal of experiment log references;
- the complete existing test suite and production build.
