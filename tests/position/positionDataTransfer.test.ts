import assert from 'node:assert/strict';
import test from 'node:test';
import {
	mergePositionStates,
	parsePositionExport,
	serializePositionState,
} from '../../src/position/positionDataTransfer';
import { emptyPositionState, PositionState } from '../../src/position/positionStore';

test('round-trips the versioned export with file and leaf records', () => {
	const state: PositionState = {
		version: 2,
		files: {
			'note.md': { height: 120, lastAccessed: 10 },
		},
		leaves: {
			'leaf-a': { filePath: 'note.md', height: 140, lastAccessed: 20 },
		},
		bookmarks: {
			'note.md': [{ name: 'Reading', height: 120, createdAt: 30 }],
		},
	};

	const parsed = parsePositionExport(serializePositionState(state), 100);

	assert.equal(parsed.source, 'version-2');
	assert.equal(parsed.recordCount, 2);
	assert.deepEqual(parsed.state, state);
});

test('imports the old array export format including a zero height', () => {
	const parsed = parsePositionExport(JSON.stringify([
		{ filename: 'old.md', height: 0, lastAccessed: 50 },
	]), 100);

	assert.equal(parsed.source, 'legacy-array');
	assert.equal(parsed.recordCount, 1);
	assert.deepEqual(parsed.state.files['old.md'], { height: 0, lastAccessed: 50 });
	assert.deepEqual(parsed.state.leaves, {});
});

test('imports a legacy file map for defensive compatibility', () => {
	const parsed = parsePositionExport(JSON.stringify({
		'old.md': { height: 12, lastAccessed: 50 },
		'number.md': 34,
	}), 100);

	assert.equal(parsed.source, 'legacy-map');
	assert.equal(parsed.recordCount, 2);
	assert.deepEqual(parsed.state.files, {
		'old.md': { height: 12, lastAccessed: 50 },
		'number.md': { height: 34, lastAccessed: 100 },
	});
});

test('rejects malformed versioned records before they can be imported', () => {
	assert.throws(
		() => parsePositionExport(JSON.stringify({
			format: 'obsidian-last-position',
			version: 2,
			files: [],
			leaves: {},
		})),
		/invalid.*files/i,
	);

	assert.throws(
		() => parsePositionExport(JSON.stringify([
			{ filename: 'bad.md', height: -1 },
		])),
		/invalid.*height/i,
	);
});

test('rejects invalid paths and malformed JSON', () => {
	assert.throws(
		() => parsePositionExport(JSON.stringify([
			{ filename: '', height: 1 },
		])),
		/invalid.*path/i,
	);
	assert.throws(() => parsePositionExport('{'), /invalid JSON/i);
});

test('normalizes v2 exports that predate bookmarks', () => {
	const parsed = parsePositionExport(JSON.stringify({
		format: 'obsidian-last-position',
		version: 2,
		files: {},
		leaves: {},
	}), 100);

	assert.deepEqual(parsed.state.bookmarks, {});
});

test('rejects invalid bookmark records in a versioned export', () => {
	assert.throws(
		() => parsePositionExport(JSON.stringify({
			format: 'obsidian-last-position',
			version: 2,
			files: {},
			leaves: {},
			bookmarks: {
				'note.md': [{ name: 'Bad', height: -1, createdAt: 1 }],
			},
		})),
		/invalid.*bookmark/i,
	);

	assert.throws(
		() => parsePositionExport(JSON.stringify({
			format: 'obsidian-last-position',
			version: 2,
			files: {},
			leaves: {},
			bookmarks: {
				'note.md': [{ name: 'Missing timestamp', height: 1 }],
			},
		})),
		/invalid.*bookmark/i,
	);
});

test('merges imported records without discarding unrelated current records', () => {
	const current = {
		version: 2,
		files: {
			'keep.md': { height: 10, lastAccessed: 1 },
			'overwrite.md': { height: 20, lastAccessed: 2 },
		},
		leaves: {
			'leaf-current': { filePath: 'keep.md', height: 15, lastAccessed: 3 },
		},
		bookmarks: {
			'keep.md': [{ name: 'Keep', height: 15, createdAt: 3 }],
		},
	};
	const imported = {
		version: 2,
		files: {
			'overwrite.md': { height: 80, lastAccessed: 8 },
			'imported.md': { height: 30, lastAccessed: 4 },
		},
		leaves: {
			'leaf-imported': { filePath: 'imported.md', height: 35, lastAccessed: 5 },
		},
		bookmarks: {},
	};

	assert.deepEqual(mergePositionStates(current, imported), {
		version: 2,
		files: {
			'keep.md': { height: 10, lastAccessed: 1 },
			'overwrite.md': { height: 80, lastAccessed: 8 },
			'imported.md': { height: 30, lastAccessed: 4 },
		},
		leaves: {
			'leaf-current': { filePath: 'keep.md', height: 15, lastAccessed: 3 },
			'leaf-imported': { filePath: 'imported.md', height: 35, lastAccessed: 5 },
		},
		bookmarks: {
			'keep.md': [{ name: 'Keep', height: 15, createdAt: 3 }],
		},
	});
});

test('accepts a UTF-8 BOM in an old export', () => {
	const parsed = parsePositionExport('\uFEFF' + JSON.stringify([
		{ filename: 'bom.md', height: 3 },
	]), 100);

	assert.deepEqual(parsed.state.files['bom.md'], { height: 3, lastAccessed: 100 });
});

test('keeps special legacy keys as data without changing the state prototype', () => {
	const parsed = parsePositionExport('{"__proto__":{"height":1}}', 100);

	assert.deepEqual(parsed.state.files['__proto__'], { height: 1, lastAccessed: 100 });
	assert.equal(Object.getPrototypeOf(parsed.state.files), Object.prototype);
});

test('empty versioned state is a valid import with no records', () => {
	const parsed = parsePositionExport(serializePositionState(emptyPositionState()));

	assert.equal(parsed.recordCount, 0);
	assert.deepEqual(parsed.state, emptyPositionState());
});
