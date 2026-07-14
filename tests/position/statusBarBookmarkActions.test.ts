import assert from 'node:assert/strict';
import test from 'node:test';
import {
	STATUS_BAR_BOOKMARK_ACTIONS,
	STATUS_BAR_BOOKMARK_CLASS,
	STATUS_BAR_BOOKMARK_FLASH_CLASS,
	getStatusBarBookmarkTooltip,
	getStatusBarBookmarkAction,
} from '../../src/position/statusBarBookmarkActions';

test('maps a left click to saving a bookmark', () => {
	assert.equal(getStatusBarBookmarkAction({ type: 'click' }), STATUS_BAR_BOOKMARK_ACTIONS.save);
});

test('maps a context menu event to opening the bookmark list', () => {
	assert.equal(
		getStatusBarBookmarkAction({ type: 'contextmenu' }),
		STATUS_BAR_BOOKMARK_ACTIONS.openList,
	);
});

test('ignores unrelated status-bar events', () => {
	assert.equal(getStatusBarBookmarkAction({ type: 'mouseenter' }), undefined);
});

test('provides a stable focus class and two-line bookmark tooltip', () => {
	assert.equal(STATUS_BAR_BOOKMARK_CLASS, 'last-position-status-bar');
	assert.equal(STATUS_BAR_BOOKMARK_FLASH_CLASS, 'last-position-status-bar-flash');
	assert.equal(
		getStatusBarBookmarkTooltip({
			saveBookmark: '左键：保存书签',
			openBookmarkList: '右键：打开书签列表',
		}),
		'左键：保存书签\n右键：打开书签列表',
	);
});
