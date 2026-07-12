import assert from 'node:assert/strict';
import test from 'node:test';
import { PositionStore } from '../../src/position/positionStore';
import { SerializedTaskQueue } from '../../src/position/serializedTaskQueue';
import { snapshotLegacyPositionData } from '../../src/position/legacyPositionSnapshot';

test('keeps the legacy state captured before a queued persistence task runs', async () => {
	const queue = new SerializedTaskQueue();
	const legacy = new Map([['note.md', { height: 10, lastAccessed: 1 }]]);
	const snapshot = snapshotLegacyPositionData(legacy);
	const store = new PositionStore();
	let releaseFirst: () => void = () => {};

	const first = queue.enqueue(async () => {
		await new Promise<void>(resolve => {
			releaseFirst = resolve;
		});
	});
	await new Promise(resolve => setTimeout(resolve, 0));

	const second = queue.enqueue(async () => {
		store.replaceFileRecords(snapshot);
	});
	legacy.clear();
	releaseFirst();

	await Promise.all([first, second]);
	assert.equal(store.resolve('leaf-a', 'note.md')?.height, 10);
});
