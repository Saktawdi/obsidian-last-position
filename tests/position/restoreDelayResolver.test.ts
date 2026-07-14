import assert from 'node:assert/strict';
import test from 'node:test';
import type { RegisteredLeaf } from '../../src/obsidian/leafRegistry';
import { createRestoreDelayResolver } from '../../src/position/restoreDelayResolver';

function record(filePath: string): RegisteredLeaf<object, object> {
	return {
		leaf: {},
		leafId: 'leaf-a',
		filePath,
		view: {},
		viewKey: 'preview',
	};
}

test('uses the fixed delay without reading files when smart delay is disabled', async () => {
	let reads = 0;
	const resolveDelay = createRestoreDelayResolver<object, object>({
		isSmartEnabled: () => false,
		fixedDelayMs: () => 450,
		readCharacterCount: async () => {
			reads++;
			return 500_000;
		},
	});

	assert.equal(await resolveDelay({ target: record('target.md') }), 450);
	assert.equal(reads, 0);
});

test('reads source and target concurrently and ignores the fixed delay in smart mode', async () => {
	const requested: string[] = [];
	const pending = new Map<string, (count: number) => void>();
	const resolveDelay = createRestoreDelayResolver<object, object>({
		isSmartEnabled: () => true,
		fixedDelayMs: () => 9999,
		readCharacterCount: filePath => new Promise(resolve => {
			requested.push(filePath);
			pending.set(filePath, resolve);
		}),
	});

	const result = resolveDelay({
		source: record('source.md'),
		target: record('target.md'),
	});
	assert.deepEqual(requested, ['source.md', 'target.md']);
	pending.get('source.md')?.(500_000);
	pending.get('target.md')?.(500_000);

	assert.equal(await result, 1700);
});

test('treats a failed character count as zero in smart mode', async () => {
	const resolveDelay = createRestoreDelayResolver<object, object>({
		isSmartEnabled: () => true,
		fixedDelayMs: () => 9999,
		readCharacterCount: async filePath => {
			if (filePath === 'source.md') throw new Error('unreadable');
			return 500_000;
		},
	});

	assert.equal(await resolveDelay({
		source: record('source.md'),
		target: record('target.md'),
	}), 1300);
});
