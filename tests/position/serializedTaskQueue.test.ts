import assert from 'node:assert/strict';
import test from 'node:test';
import { SerializedTaskQueue } from '../../src/position/serializedTaskQueue';

test('runs persistence tasks in enqueue order without overlap', async () => {
	const queue = new SerializedTaskQueue();
	const events: string[] = [];
	let releaseFirst: () => void = () => {};

	const first = queue.enqueue(async () => {
		events.push('first-start');
		await new Promise<void>(resolve => {
			releaseFirst = resolve;
		});
		events.push('first-end');
	});
	const second = queue.enqueue(async () => {
		events.push('second');
	});

	await new Promise(resolve => setTimeout(resolve, 0));
	assert.deepEqual(events, ['first-start']);
	releaseFirst();
	await Promise.all([first, second]);
	assert.deepEqual(events, ['first-start', 'first-end', 'second']);
});

test('continues processing after a rejected task', async () => {
	const queue = new SerializedTaskQueue();
	await assert.rejects(queue.enqueue(async () => {
		throw new Error('failed');
	}));

	let completed = false;
	await queue.enqueue(async () => {
		completed = true;
	});
	assert.equal(completed, true);
});
