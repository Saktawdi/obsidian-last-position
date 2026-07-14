import assert from 'node:assert/strict';
import test from 'node:test';
import { PositionStore, emptyPositionState } from '../../src/storage/positionStore';
import {
	parsePositionExport,
	serializePositionState,
} from '../../src/storage/positionDataTransfer';

test('exposes the position store through the storage boundary', () => {
	const store = new PositionStore();
	assert.equal(store.save('leaf-a', 'note.md', 12, 1), true);
	assert.equal(store.resolve('leaf-a', 'note.md')?.height, 12);
	assert.deepEqual(store.snapshot().bookmarks, {});
});

test('exposes transfer through the storage boundary', () => {
	const state = emptyPositionState();
	const parsed = parsePositionExport(serializePositionState(state));
	assert.deepEqual(parsed.state, state);
});
