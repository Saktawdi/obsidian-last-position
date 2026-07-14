# Settings Experience Refinement Design

## Goal

Make smart restoration feel faster and make the settings page easier to scan and operate, while staying small, native to Obsidian, and behaviorally conservative outside this scope.

## Smart Delay Curve

Replace the current linear formula with a 50,000-character free allowance:

```text
delayMs = clamp(
  300,
  2000,
  round(
    300
      + max(0, targetCharacters - 50000) / 1000
      + max(0, sourceCharacters - 50000) / 2500
  )
)
```

This produces 300ms for source and target documents up to 50,000 characters, about 750ms for a short-to-500,000-character transition, and about 930ms for a 500,000-to-500,000-character transition. Fixed-delay mode is unchanged.

## Settings Structure

Use native Obsidian `Setting.setHeading()` rows to create three scan-friendly groups:

1. Save and listen: auto-save interval and listen event.
2. Position restore: smart-delay toggle, conditional fixed delay, and advanced restore controls.
3. Data: page size, data management, and the existing history table.

Move retry count and restore retry interval into one native `<details>` element named `Advanced restore settings`, closed by default. Do not add a persisted open-state setting.

Keep the smart-delay toggle. The fixed-delay row exists in the DOM but is hidden while smart mode is enabled. Toggling smart mode updates that row in place after persistence; it must not rebuild the full settings page or move the user's scroll position.

Timing fields use native text components configured as numeric inputs with appropriate minimum and step attributes. Existing validation and stored values remain authoritative.

## Data Table Polish

Keep the existing `DataTable` class, sorting, paging, deletion confirmation, and data flow. Remove its inline layout styles in favor of a small set of scoped CSS classes.

Add only the following presentation improvements:

- a vertically scrollable table area with a sticky header;
- horizontal scrolling with a stable minimum table width;
- subtle row hover feedback and non-wrapping numeric/action columns;
- wrapping pagination controls on narrow settings panes;
- an Obsidian `trash-2` icon for deletion with localized title and ARIA label.

Do not add cards, custom table frameworks, animations, new dependencies, or new data settings.

## Localization And Accessibility

Add Chinese and English strings for the three section headings and advanced restore summary. Reuse the existing localized delete text for the icon tooltip and accessible label. Preserve keyboard focus and native control semantics.

## Testing And Verification

Add pure formula tests for the threshold, representative long-document transitions, rounding, and the 2,000ms cap. Add focused DOM-independent tests only where logic is extracted; do not create a browser simulation framework solely for this visual refinement.

Run the complete test suite, TypeScript build, production bundle, source scan for removed experiment logging, and `git diff --check`. Manually inspect the settings page in both smart and fixed modes at wide and narrow pane widths.
