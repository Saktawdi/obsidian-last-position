import assert from 'node:assert/strict';
import test from 'node:test';
import { PositionPersistenceService } from '../../src/storage/positionPersistence';
import { PositionStore } from '../../src/storage/positionStore';
import type { PositionState } from '../../src/domain/positionTypes';

class FakePersistenceHost {
	settings = { listenEvent: 'scroll' };
	saved: Record<string, unknown>[] = [];
	positionState?: PositionState;

	getSettingsSnapshot(): Record<string, unknown> {
		return { ...this.settings };
	}

	setPositionState(state: PositionState): void {
		this.positionState = state;
	}

	async saveData(data: Record<string, unknown>): Promise<void> {
		this.saved.push(data);
	}
}

test('persists a captured position state through the host boundary', async () => {
	const store = new PositionStore();
	store.save('leaf-a', 'note.md', 20, 10);
	const host = new FakePersistenceHost();
	const persistence = new PositionPersistenceService(store, host);

	await persistence.persist();

	assert.equal(host.saved.length, 1);
	assert.equal((host.saved[0].positionState as PositionState).files['note.md'].height, 20);
	assert.equal(host.positionState?.leaves['leaf-a'].filePath, 'note.md');
	await persistence.flush();
});

test('merges imported state before persisting it', async () => {
	const store = new PositionStore();
	store.save('leaf-current', 'current.md', 5, 1);
	const host = new FakePersistenceHost();
	const persistence = new PositionPersistenceService(store, host);
	const imported: PositionState = {
		version: 2,
		files: { 'imported.md': { height: 30, lastAccessed: 2 } },
		leaves: {},
		bookmarks: {},
	};

	await persistence.importState(imported);

	assert.equal(store.resolve('leaf-current', 'current.md')?.height, 5);
	assert.equal(store.resolve('other-leaf', 'imported.md')?.height, 30);
	assert.equal((host.saved[0].positionState as PositionState).files['imported.md'].height, 30);
});
