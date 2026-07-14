import assert from 'node:assert/strict';
import test from 'node:test';
import { PositionCore } from '../../src/core/positionCore';

class FakeCoordinator {
	startedWith?: string | null;
	disposed = false;

	start(activeLeaf: string | null): void {
		this.startedWith = activeLeaf;
	}

	async dispose(): Promise<void> {
		this.disposed = true;
	}
}

test('owns coordinator lifecycle without depending on Obsidian', async () => {
	const coordinator = new FakeCoordinator();
	const core = new PositionCore(coordinator);

	core.start('leaf-a');
	assert.equal(coordinator.startedWith, 'leaf-a');

	await core.dispose();
	assert.equal(coordinator.disposed, true);
});
