import assert from 'node:assert/strict';
import test from 'node:test';
import { PositionStore, migratePositionState } from '../../src/position/positionStore';

test('migrates legacy numeric and record values into file fallbacks', () => {
	const state = migratePositionState(undefined, {
		'a.md': 12,
		'b.md': { height: 34, lastAccessed: 50 },
	}, 100);

	assert.deepEqual(state.files['a.md'], { height: 12, lastAccessed: 100 });
	assert.deepEqual(state.files['b.md'], { height: 34, lastAccessed: 50 });
});

test('prefers an exact leaf record and falls back to the file record', () => {
	const store = new PositionStore();
	store.save('leaf-a', 'note.md', 10, 1);
	store.save('leaf-b', 'note.md', 20, 2);

	assert.equal(store.resolve('leaf-a', 'note.md')?.height, 10);
	assert.equal(store.resolve('leaf-c', 'note.md')?.height, 20);
});

test('stores zero and rejects invalid positions', () => {
	const store = new PositionStore();
	assert.equal(store.save('leaf-a', 'note.md', 0, 1), true);
	assert.equal(store.save('leaf-a', 'note.md', Number.NaN, 2), false);
	assert.equal(store.resolve('leaf-a', 'note.md')?.height, 0);
});

test('does not return a leaf record for its previous file', () => {
	const store = new PositionStore();
	store.save('leaf-a', 'old.md', 10, 1);
	store.save('leaf-a', 'new.md', 20, 2);

	assert.equal(store.resolve('leaf-a', 'old.md')?.height, 10);
	assert.equal(store.resolve('leaf-a', 'new.md')?.height, 20);
});
