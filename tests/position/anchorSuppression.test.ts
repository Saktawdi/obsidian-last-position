import assert from 'node:assert/strict';
import test from 'node:test';
import { AnchorSuppression } from '../../src/position/anchorSuppression';

test('consumes a matching suppression once', () => {
	const suppression = new AnchorSuppression(500);
	suppression.mark('Folder/Note.md', 100);

	assert.equal(suppression.consume('Folder/Note.md', 200), true);
	assert.equal(suppression.consume('Folder/Note.md', 201), false);
});

test('does not consume an expired suppression', () => {
	const suppression = new AnchorSuppression(500);
	suppression.mark('note.md', 100);

	assert.equal(suppression.consume('note.md', 601), false);
});

test('normalizes path separators before matching', () => {
	const suppression = new AnchorSuppression(500);
	suppression.mark('Folder\\Note.md', 100);

	assert.equal(suppression.consume('Folder/Note.md', 200), true);
});
