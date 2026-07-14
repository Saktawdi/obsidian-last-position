# Reading Mode Stable Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent an Obsidian reading-mode renderer rebuild from resetting a just-restored document to the top.

**Architecture:** Keep restoration timing and completion ownership in `RestorationScheduler`. Require one delayed confirmation read before returning `completed`, while preserving cancellation, stale-target detection, finite external-change interruption, and the configured maximum number of apply attempts.

**Tech Stack:** TypeScript 4.7, Node.js test runner, `tsx`, Obsidian API, esbuild.

## Global Constraints

- Do not change persisted data or settings.
- Do not use Obsidian private renderer or DOM APIs.
- Keep user scroll and anchor-navigation protection intact.
- Follow red-green-refactor and run the full test and build verification.

---

### Task 1: Confirm Restored Height Is Stable

**Files:**
- Modify: `tests/position/restorationScheduler.test.ts`
- Modify: `src/position/restorationScheduler.ts`

**Interfaces:**
- Consumes: `RestorationOptions.intervalMs`, `RestorationTarget.isCurrent()`, `readScroll()`, and `applyScroll()`.
- Produces: unchanged `RestorationScheduler.start()` and `RestorationResult` interfaces with stricter `completed` semantics.

- [ ] **Step 1: Write the failing regression test**

```ts
test('waits for a stable target when a late renderer reset invalidates the first apply', async () => {
	let scroll = 0;
	let applies = 0;
	const scheduler = new RestorationScheduler();
	const result = await scheduler.start('leaf-a', 20, {
		isCurrent: () => true,
		readScroll: () => scroll,
		applyScroll: value => {
			scroll = value;
			applies++;
			if (applies === 1) setTimeout(() => { scroll = Number.NaN; }, 2);
		},
	}, { maxAttempts: 3, intervalMs: 5 });

	assert.equal(result.reason, 'completed');
	assert.equal(applies, 2);
	assert.equal(scroll, 20);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --test-name-pattern "late renderer reset"`

Expected: FAIL because the current scheduler returns `completed` after the first immediate match, so `applies` is `1`.

- [ ] **Step 3: Implement delayed completion confirmation**

Refactor the scheduler loop so an in-tolerance read waits one `intervalMs`, rechecks generation and target currency, and confirms the height before returning `completed`. Continue to another apply when the confirmation is invalid; retain `interrupted` for a finite external change.

- [ ] **Step 4: Verify GREEN and regressions**

Run: `npm test -- --test-name-pattern "late renderer reset"`

Expected: PASS with two applies.

Run: `npm test`

Expected: all tests pass.

Run: `npm run build`

Expected: TypeScript checking and the production esbuild complete successfully.

Run: `git diff --check`

Expected: no whitespace errors.
