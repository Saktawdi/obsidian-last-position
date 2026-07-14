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

test('replaces file fallbacks without discarding persisted leaf records', () => {
	const store = new PositionStore();
	store.save('leaf-a', 'note.md', 10, 1);

	store.replaceFileRecords({ 'note.md': { height: 30, lastAccessed: 2 } }, 2);

	assert.equal(store.resolve('leaf-a', 'note.md')?.height, 10);
	assert.equal(store.resolve('leaf-b', 'note.md')?.height, 30);
});

test('deletes a file fallback and every leaf record associated with the file', () => {
	const store = new PositionStore();
	store.save('leaf-a', 'note.md', 10, 1);
	store.save('leaf-b', 'note.md', 20, 2);
	store.save('leaf-c', 'other.md', 30, 3);

	assert.equal(store.deleteFile('note.md'), true);

	const state = store.snapshot();
	assert.equal(state.files['note.md'], undefined);
	assert.equal(state.leaves['leaf-a'], undefined);
	assert.equal(state.leaves['leaf-b'], undefined);
	assert.deepEqual(state.files['other.md'], { height: 30, lastAccessed: 3 });
	assert.deepEqual(state.leaves['leaf-c'], {
		filePath: 'other.md',
		height: 30,
		lastAccessed: 3,
	});
	assert.equal(store.deleteFile('missing.md'), false);
});

test('merges validated imported state without discarding current records', () => {
	const store = new PositionStore();
	store.save('leaf-current', 'keep.md', 10, 1);

	store.merge({
		version: 2,
		files: {
			'imported.md': { height: 20, lastAccessed: 2 },
		},
		leaves: {
			'leaf-imported': { filePath: 'imported.md', height: 30, lastAccessed: 3 },
		},
	});

	assert.equal(store.resolve('leaf-current', 'keep.md')?.height, 10);
	assert.equal(store.resolve('other-leaf', 'imported.md')?.height, 20);
	assert.equal(store.resolve('leaf-imported', 'imported.md')?.height, 30);
});

test('uses the supplied migration time for invalid versioned timestamps', () => {
	const state = migratePositionState({
		version: 2,
		files: { 'note.md': { height: 10, lastAccessed: Number.NaN } },
		leaves: {},
	}, undefined, 123);

	assert.equal(state.files['note.md'].lastAccessed, 123);
});

test('falls back to legacy records when the versioned containers are malformed', () => {
	const state = migratePositionState({
		version: 2,
		files: [],
		leaves: [],
	}, {
		'note.md': 42,
	}, 123);

	assert.deepEqual(state.files['note.md'], { height: 42, lastAccessed: 123 });
});

test('normalizes missing bookmarks in an existing versioned state', () => {
	const state = migratePositionState({
		version: 2,
		files: {},
		leaves: {},
	}, undefined, 123);

	assert.deepEqual(state.bookmarks, {});
});

test('saves file-scoped bookmarks including a zero height', () => {
	const store = new PositionStore();

	assert.deepEqual(store.saveBookmark('note.md', '  Reading  ', 0, 100), {
		name: 'Reading',
		height: 0,
		createdAt: 100,
	});
	assert.deepEqual(store.listBookmarks('note.md'), [{
		name: 'Reading',
		height: 0,
		createdAt: 100,
	}]);
});

test('allocates numeric suffixes instead of overwriting duplicate bookmark names', () => {
	const store = new PositionStore();

	store.saveBookmark('note.md', 'Reading', 10, 1);
	store.saveBookmark('note.md', 'Reading', 20, 2);
	store.saveBookmark('note.md', 'Reading', 30, 3);

	assert.deepEqual(store.listBookmarks('note.md').map(bookmark => bookmark.name), [
		'Reading',
		'Reading (1)',
		'Reading (2)',
	]);
});

test('sorts bookmarks deterministically and rejects invalid bookmark input', () => {
	const store = new PositionStore();

	store.saveBookmark('note.md', 'Later', 20, 2);
	store.saveBookmark('note.md', 'Earlier', 10, 1);

	assert.deepEqual(store.listBookmarks('note.md').map(bookmark => bookmark.name), [
		'Earlier',
		'Later',
	]);
	assert.equal(store.saveBookmark('note.md', ' ', 10, 3), undefined);
	assert.equal(store.saveBookmark('note.md', 'Invalid', -1, 3), undefined);
	assert.equal(store.saveBookmark('', 'Invalid', 10, 3), undefined);
});

test('deletes bookmarks together with all records for a file', () => {
	const store = new PositionStore();
	store.saveBookmark('note.md', 'Reading', 10, 1);
	store.saveBookmark('other.md', 'Other', 20, 2);

	assert.equal(store.deleteFile('note.md'), true);
	assert.deepEqual(store.listBookmarks('note.md'), []);
	assert.deepEqual(store.listBookmarks('other.md').map(bookmark => bookmark.name), ['Other']);
});

test('deletes only the selected bookmark and preserves the other file bookmarks', () => {
	const store = new PositionStore();
	const reading = store.saveBookmark('note.md', 'Reading', 10, 1);
	store.saveBookmark('note.md', 'Later', 20, 2);
	store.saveBookmark('other.md', 'Other', 30, 3);

	assert.ok(reading);
	assert.equal(store.deleteBookmark('note.md', reading), true);
	assert.deepEqual(store.listBookmarks('note.md').map(bookmark => bookmark.name), ['Later']);
	assert.deepEqual(store.listBookmarks('other.md').map(bookmark => bookmark.name), ['Other']);
	assert.equal(store.deleteBookmark('note.md', reading), false);
});
