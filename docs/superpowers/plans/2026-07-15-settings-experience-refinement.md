# Settings Experience Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make smart delay faster for normal and long notes, and refine the existing Obsidian settings page with small native interaction and table improvements.

**Architecture:** Keep the existing pure delay function, settings model, and `DataTable`. Change the formula under tests, reorganize the settings page with native headings/details and in-place conditional visibility, then replace inline table layout styles with scoped CSS and an accessible Obsidian icon.

**Tech Stack:** TypeScript 4.7, Obsidian API, CSS, Node.js test runner, `tsx`, esbuild.

## Global Constraints

- Preserve fixed-delay mode and all persisted data formats.
- Do not add settings fields, dependencies, cards, custom component frameworks, or animations.
- Keep existing sorting, paging, deletion confirmation, import/export, and cleanup behavior.
- Smart mode uses a 300ms floor, 50,000-character allowance per source and target, and 2,000ms cap.
- Produce only one stable production bundle after source edits are complete.

---

### Task 1: Faster Smart Delay Curve

**Files:**
- Modify: `tests/position/smartRestoreDelay.test.ts`
- Modify: `src/position/smartRestoreDelay.ts`

**Interfaces:**
- Preserves: `calculateSmartRestoreDelay(targetCharacterCount, sourceCharacterCount?): number`.

- [ ] **Step 1: Replace formula expectations with the approved curve**

```ts
assert.equal(calculateSmartRestoreDelay(0, 0), 300);
assert.equal(calculateSmartRestoreDelay(50_000, 50_000), 300);
assert.equal(calculateSmartRestoreDelay(500_000, 0), 750);
assert.equal(calculateSmartRestoreDelay(500_000, 500_000), 930);
assert.equal(calculateSmartRestoreDelay(5_000_000, 5_000_000), 2000);
```

- [ ] **Step 2: Verify RED**

Run: `node --import tsx --test tests/position/smartRestoreDelay.test.ts`

Expected: FAIL because the current curve returns 500ms or more above the allowance and caps at 4,000ms.

- [ ] **Step 3: Implement the threshold formula**

```ts
const INCLUDED_CHARACTER_COUNT = 50_000;
const targetExtra = Math.max(0, target - INCLUDED_CHARACTER_COUNT) / 1000;
const sourceExtra = Math.max(0, source - INCLUDED_CHARACTER_COUNT) / 2500;
const calculated = Math.round(300 + targetExtra + sourceExtra);
```

Set the maximum constant to `2000`.

- [ ] **Step 4: Verify GREEN**

Run: `node --import tsx --test tests/position/smartRestoreDelay.test.ts`

Expected: PASS.

### Task 2: Native Settings Structure And Interaction

**Files:**
- Modify: `src/settings/settingsTab.ts`
- Modify: `.language/translations.ts`
- Modify: `styles.css`

**Interfaces:**
- Add translation keys: `saveAndListenSettings`, `positionRestoreSettings`, `dataSettings`, `advancedRestoreSettings`.
- Add scoped root class: `last-position-settings`.

- [ ] **Step 1: Add localized headings and advanced-summary copy**

Add concise Chinese and English labels for the four new keys. Do not add explanatory paragraphs.

- [ ] **Step 2: Reorder existing settings into three native heading groups**

Use `new Setting(containerEl).setName(...).setHeading()`. Place auto-save and listen event first; smart/fixed delay second; page size and data controls last.

- [ ] **Step 3: Add a non-persisted advanced restore details group**

Create one closed `<details class="last-position-advanced-settings">` containing retry count and retry interval. Reuse their existing controls, validation, persistence, and notices.

- [ ] **Step 4: Update smart/fixed interaction in place**

Keep the fixed-delay `Setting` instance and input component. Toggle an `is-hidden` class on its `settingEl` and call `setDisabled(value)` after saving the smart toggle. Do not call `display()` from this toggle handler.

- [ ] **Step 5: Configure timing inputs as numeric controls**

Set `inputEl.type = 'number'`, `min`, and `step` on auto-save, retry count, retry interval, and fixed delay without changing their existing validation rules.

- [ ] **Step 6: Add minimal scoped settings CSS**

Use `.last-position-settings` to constrain numeric input width, hide conditional rows, and give the advanced details summary native spacing. Avoid backgrounds, borders, cards, and transitions.

- [ ] **Step 7: Verify type safety**

Run: `npx tsc -noEmit -skipLibCheck`

Expected: PASS.

### Task 3: Existing Table Polish And Full Verification

**Files:**
- Modify: `src/component/dataTable.ts`
- Modify: `styles.css`

**Interfaces:**
- Reuses existing `DataTable` API and localized `delete` string.
- Adds CSS classes only; no data or paging contract changes.

- [ ] **Step 1: Replace inline table and pagination layout styles with classes**

Keep `data-table-section`, `table-container`, `pagination-container`, `item-count`, and `pagination-controls`. Remove corresponding `style.*` assignments and let `styles.css` own max height, overflow, sizing, spacing, and wrapping.

- [ ] **Step 2: Make deletion an accessible icon command**

Import `setIcon` from `obsidian`, set `trash-2` on the existing button, and apply `title` plus `aria-label` using `t.delete`. Preserve the current click handler and confirmation.

- [ ] **Step 3: Add compact responsive table CSS**

Add a sticky header, stable minimum table width, subtle row hover, non-wrapping columns 2-4, compact icon button dimensions, and wrapping pagination. Scope everything below `.last-position-settings`.

- [ ] **Step 4: Run all verification**

Run: `npm test`

Expected: all tests pass.

Run: `npm run build`

Expected: TypeScript checking and the production bundle succeed.

Run: `rg -n "Last-Position-Experiment|restoreExperiment" src main.js`

Expected: no output.

Run: `git diff --check`

Expected: no whitespace errors.
