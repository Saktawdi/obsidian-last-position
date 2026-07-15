import assert from 'node:assert/strict';
import test from 'node:test';
import { AnchorSuppression } from '../../src/position/anchorSuppression';

test('consumes a matching anchor request once', () => {
	const suppression = new AnchorSuppression(500);
	const request = {
		linkText: 'Folder/Note#Section',
		sourcePath: 'Source.md',
		targetFilePath: 'Folder/Note.md',
	};
	suppression.mark(request, 100);

	assert.deepEqual(suppression.consume('Folder/Note.md', 200), request);
	assert.equal(suppression.consume('Folder/Note.md', 201), undefined);
});

test('does not consume an expired suppression', () => {
	const suppression = new AnchorSuppression(500);
	suppression.mark({
		linkText: 'note#Section',
		sourcePath: 'source.md',
		targetFilePath: 'note.md',
	}, 100);

	assert.equal(suppression.consume('note.md', 601), undefined);
});

test('normalizes path separators before matching', () => {
	const suppression = new AnchorSuppression(500);
	const request = {
		linkText: 'Folder/Note#Section',
		sourcePath: 'source.md',
		targetFilePath: 'Folder\\Note.md',
	};
	suppression.mark(request, 100);

	assert.deepEqual(suppression.consume('Folder/Note.md', 200), request);
});

test('a newer request replaces the previous request', () => {
	const suppression = new AnchorSuppression(500);
	suppression.mark({
		linkText: 'first#Section',
		sourcePath: 'source.md',
		targetFilePath: 'first.md',
	}, 100);
	const latest = {
		linkText: 'second#^block-id',
		sourcePath: 'source.md',
		targetFilePath: 'second.md',
	};
	suppression.mark(latest, 150);

	assert.equal(suppression.consume('first.md', 200), undefined);
	assert.deepEqual(suppression.consume('second.md', 200), latest);
});
