import assert from 'node:assert/strict';
import test from 'node:test';
import { RestorationScheduler } from '../../src/position/restorationScheduler';

test('applies until the target reaches the requested position', async () => {
	let scroll = 0;
	const scheduler = new RestorationScheduler();
	const result = await scheduler.start('leaf-a', 20, {
		isCurrent: () => true,
		readScroll: () => scroll,
		applyScroll: value => {
			scroll = value;
		},
	}, { maxAttempts: 3, intervalMs: 0 });

	assert.equal(result.reason, 'completed');
	assert.equal(scroll, 20);
});

test('a new task cancels the previous task for the same leaf', async () => {
	const scheduler = new RestorationScheduler();
	const target = {
		isCurrent: () => true,
		readScroll: () => 0,
		applyScroll: () => {},
	};
	const first = scheduler.start('leaf-a', 10, target, { maxAttempts: 5, intervalMs: 5 });
	const second = scheduler.start('leaf-a', 20, target, { maxAttempts: 1, intervalMs: 0 });

	assert.equal((await first).reason, 'cancelled');
	assert.equal((await second).reason, 'expired');
});

test('stops without applying when the leaf or file is stale', async () => {
	let applies = 0;
	const scheduler = new RestorationScheduler();
	const result = await scheduler.start('leaf-a', 20, {
		isCurrent: () => false,
		readScroll: () => 0,
		applyScroll: () => {
			applies++;
		},
	}, { maxAttempts: 3, intervalMs: 0 });

	assert.equal(result.reason, 'stale');
	assert.equal(applies, 0);
});

test('explicit cancellation stops an active task', async () => {
	const scheduler = new RestorationScheduler();
	const running = scheduler.start('leaf-a', 20, {
		isCurrent: () => true,
		readScroll: () => 0,
		applyScroll: () => {},
	}, { maxAttempts: 5, intervalMs: 5 });

	scheduler.cancel('leaf-a');
	assert.equal((await running).reason, 'cancelled');
});

test('stops retrying when another scroll changes the position between attempts', async () => {
	let scroll = 0;
	let applies = 0;
	const scheduler = new RestorationScheduler();
	const running = scheduler.start('leaf-a', 20, {
		isCurrent: () => true,
		readScroll: () => scroll,
		applyScroll: () => {
			applies++;
		},
	}, { maxAttempts: 3, intervalMs: 10 });

	setTimeout(() => {
		scroll = 7;
	}, 2);

	assert.equal((await running).reason, 'interrupted');
	assert.equal(applies, 1);
});

test('reapplies after a late renderer reset before completing', async () => {
	let scroll = 0;
	let applies = 0;
	const scheduler = new RestorationScheduler();
	const result = await scheduler.start('leaf-a', 20, {
		isCurrent: () => true,
		readScroll: () => scroll,
		applyScroll: value => {
			applies++;
			scroll = value;
			if (applies === 1) {
				setTimeout(() => {
					scroll = Number.NaN;
				}, 2);
			}
		},
	}, { maxAttempts: 3, intervalMs: 5 });

	assert.equal(result.reason, 'completed');
	assert.equal(applies, 2);
	assert.equal(scroll, 20);
});
