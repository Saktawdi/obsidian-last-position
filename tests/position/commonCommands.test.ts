import assert from 'node:assert/strict';
import test from 'node:test';
import type { ActivePosition } from '../../src/position/positionCoordinator';
import {
	COMMON_COMMAND_IDS,
	executeToLastPosition,
	getCommonCommandNames,
	type LastPositionJumpCoordinator,
} from '../../src/position/commonCommands';
import { PositionStore } from '../../src/storage/positionStore';

class FakeCoordinator implements LastPositionJumpCoordinator {
	activePosition?: ActivePosition;
	acceptJump = true;
	jump?: { filePath: string; height: number };

	getActivePosition(): ActivePosition | undefined {
		return this.activePosition;
	}

	scrollActiveTo(filePath: string, height: number): boolean {
		this.jump = { filePath, height };
		return this.acceptJump;
	}
}

test('exposes a stable localized to-last-position command', () => {
	assert.equal(COMMON_COMMAND_IDS.toLastPosition, 'last-position-to-last-position');
	assert.deepEqual(getCommonCommandNames({
		toLastPositionCommand: 'To last position',
	}), {
		toLastPosition: 'Last Position: To last position',
	});
});

test('reports no active view when the coordinator or active position is unavailable', () => {
	const store = new PositionStore();
	assert.equal(executeToLastPosition(store, undefined), 'no-active-view');
	assert.equal(executeToLastPosition(store, new FakeCoordinator()), 'no-active-view');
});

test('reports no history for an active file without a saved position', () => {
	const coordinator = new FakeCoordinator();
	coordinator.activePosition = { leafId: 'leaf-a', filePath: 'note.md', height: 20 };

	assert.equal(executeToLastPosition(new PositionStore(), coordinator), 'no-history');
	assert.equal(coordinator.jump, undefined);
});

test('prefers leaf history and does not mutate stored positions after jumping', () => {
	const store = new PositionStore();
	store.save('leaf-a', 'note.md', 40, 1);
	store.save('leaf-b', 'note.md', 80, 2);
	const before = store.snapshot();
	const coordinator = new FakeCoordinator();
	coordinator.activePosition = { leafId: 'leaf-a', filePath: 'note.md', height: 5 };

	assert.equal(executeToLastPosition(store, coordinator), 'completed');
	assert.deepEqual(coordinator.jump, { filePath: 'note.md', height: 40 });
	assert.deepEqual(store.snapshot(), before);
});

test('uses file history when the active leaf has no matching record', () => {
	const store = new PositionStore();
	store.save('leaf-a', 'note.md', 80, 1);
	const coordinator = new FakeCoordinator();
	coordinator.activePosition = { leafId: 'leaf-c', filePath: 'note.md', height: 5 };

	assert.equal(executeToLastPosition(store, coordinator), 'completed');
	assert.deepEqual(coordinator.jump, { filePath: 'note.md', height: 80 });
});

test('reports stale when the coordinator rejects the historical jump', () => {
	const store = new PositionStore();
	store.save('leaf-a', 'note.md', 80, 1);
	const coordinator = new FakeCoordinator();
	coordinator.activePosition = { leafId: 'leaf-a', filePath: 'note.md', height: 5 };
	coordinator.acceptJump = false;

	assert.equal(executeToLastPosition(store, coordinator), 'stale');
});
