import assert from 'node:assert/strict';
import test from 'node:test';
import {
	BOOKMARK_COMMAND_IDS,
	filterBookmarkSuggestions,
	formatBookmarkSavedNotice,
	getBookmarkCommandNames,
} from '../../src/position/bookmarkCommands';
import { PositionBookmark } from '../../src/position/positionStore';

const bookmarks: PositionBookmark[] = [
	{ name: 'Reading', height: 10, createdAt: 1 },
	{ name: 'Research', height: 20, createdAt: 2 },
];

test('exposes stable and distinctive bookmark command ids', () => {
	assert.deepEqual(BOOKMARK_COMMAND_IDS, {
		save: 'last-position-save-bookmark',
		select: 'last-position-select-bookmark',
		remove: 'last-position-remove-bookmark',
	});
});

test('builds localized command names with the Last Position prefix', () => {
	assert.deepEqual(getBookmarkCommandNames({
		saveBookmarkCommand: '保存书签',
		selectBookmarkCommand: '选择书签',
		removeBookmarkCommand: '删除书签',
	}), {
		save: 'Last Position: 保存书签',
		select: 'Last Position: 选择书签',
		remove: 'Last Position: 删除书签',
	});
});

test('filters only the current file bookmark list for selection', () => {
	assert.deepEqual(filterBookmarkSuggestions(bookmarks, 'read'), [bookmarks[0]]);
	assert.deepEqual(filterBookmarkSuggestions(bookmarks, ''), bookmarks);
});

test('reports the allocated duplicate name instead of the requested name', () => {
	assert.equal(
		formatBookmarkSavedNotice('书签已保存：{name}', { name: 'Reading (1)', height: 30, createdAt: 3 }),
		'书签已保存：Reading (1)',
	);
});
