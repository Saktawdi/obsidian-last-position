import assert from 'node:assert/strict';
import test from 'node:test';
import { LeafRegistry, type LeafSource, type RegisteredLeaf } from '../../src/obsidian/leafRegistry';
import { AnchorSuppression } from '../../src/position/anchorSuppression';
import { PositionCoordinator } from '../../src/position/positionCoordinator';
import { PositionStore } from '../../src/position/positionStore';
import { RestorationScheduler } from '../../src/position/restorationScheduler';

interface FakeLeaf {
	id: string;
}

interface FakeView {
	scroll: number;
}

class CoordinatorLeafSource implements LeafSource<FakeLeaf, FakeView> {
	readonly leaves: RegisteredLeaf<FakeLeaf, FakeView>[] = [
		{ leaf: { id: 'leaf-a' }, leafId: 'leaf-a', filePath: 'a.md', view: { scroll: 0 } },
		{ leaf: { id: 'leaf-b' }, leafId: 'leaf-b', filePath: 'b.md', view: { scroll: 0 } },
	];
	private readonly callbacks = new Map<string, () => void>();

	describe(leaf: FakeLeaf | null): RegisteredLeaf<FakeLeaf, FakeView> | undefined {
		return this.leaves.find(record => record.leaf === leaf);
	}

	all(): RegisteredLeaf<FakeLeaf, FakeView>[] {
		return [...this.leaves];
	}

	isCurrent(record: RegisteredLeaf<FakeLeaf, FakeView>): boolean {
		return this.leaves.some(candidate =>
			candidate.leafId === record.leafId
			&& candidate.filePath === record.filePath
			&& candidate.view === record.view,
		);
	}

	readScroll(record: RegisteredLeaf<FakeLeaf, FakeView>): number {
		return record.view.scroll;
	}

	applyScroll(record: RegisteredLeaf<FakeLeaf, FakeView>, height: number): void {
		record.view.scroll = height;
	}

	bindScroll(record: RegisteredLeaf<FakeLeaf, FakeView>, callback: () => void): () => void {
		this.callbacks.set(record.leafId, callback);
		return () => this.callbacks.delete(record.leafId);
	}

	scroll(leafId: string, height: number): void {
		const record = this.leaves.find(candidate => candidate.leafId === leafId);
		if (!record) return;
		record.view.scroll = height;
		this.callbacks.get(leafId)?.();
	}
}

function nextTurn(): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, 5));
}

function createCoordinator(source: CoordinatorLeafSource, store: PositionStore) {
	let persists = 0;
	const coordinator = new PositionCoordinator({
		registry: new LeafRegistry(source),
		store,
		scheduler: new RestorationScheduler(),
		anchorSuppression: new AnchorSuppression(500),
		maxAttempts: () => 3,
		debounceMs: () => 0,
		restoreDelayMs: () => 0,
		persist: async () => {
			persists++;
		},
		updateStatus: () => {},
		onRestoreExpired: () => {},
	});
	return { coordinator, getPersists: () => persists };
}

test('saves the previous leaf and restores the newly active leaf', async () => {
	const source = new CoordinatorLeafSource();
	const store = new PositionStore();
	store.save('leaf-a', 'a.md', 10, 1);
	store.save('leaf-b', 'b.md', 20, 1);
	const { coordinator } = createCoordinator(source, store);

	coordinator.start(source.leaves[0].leaf);
	await nextTurn();
	assert.equal(source.leaves[0].view.scroll, 10);

	source.leaves[0].view.scroll = 15;
	coordinator.handleActiveLeafChange(source.leaves[1].leaf);
	await nextTurn();

	assert.equal(store.resolve('leaf-a', 'a.md')?.height, 15);
	assert.equal(source.leaves[1].view.scroll, 20);
	await coordinator.dispose();
});

test('anchor suppression skips exactly one restoration', async () => {
	const source = new CoordinatorLeafSource();
	const store = new PositionStore();
	store.save('leaf-b', 'b.md', 20, 1);
	const { coordinator } = createCoordinator(source, store);

	coordinator.markAnchorNavigation('b.md');
	coordinator.start(source.leaves[1].leaf);
	await nextTurn();
	assert.equal(source.leaves[1].view.scroll, 0);

	coordinator.handleFileOpen(source.leaves[1].leaf);
	await nextTurn();
	assert.equal(source.leaves[1].view.scroll, 20);
	await coordinator.dispose();
});

test('debounced scroll saves the exact leaf including position zero', async () => {
	const source = new CoordinatorLeafSource();
	const store = new PositionStore();
	const { coordinator, getPersists } = createCoordinator(source, store);

	coordinator.start(null);
	source.scroll('leaf-a', 0);
	await nextTurn();

	assert.equal(store.resolve('leaf-a', 'a.md')?.height, 0);
	assert.equal(store.resolve('leaf-b', 'b.md'), undefined);
	assert.equal(getPersists() > 0, true);
	await coordinator.dispose();
});

test('does not restore an unchanged leaf on repeated layout reconciliation', async () => {
	const source = new CoordinatorLeafSource();
	const store = new PositionStore();
	store.save('leaf-a', 'a.md', 10, 1);
	const { coordinator } = createCoordinator(source, store);

	coordinator.start(source.leaves[0].leaf);
	await nextTurn();
	source.leaves[0].view.scroll = 15;
	coordinator.reconcile(true);
	await nextTurn();

	assert.equal(source.leaves[0].view.scroll, 15);
	await coordinator.dispose();
});

test('background leaf cannot consume anchor suppression for the active destination leaf', async () => {
	const source = new CoordinatorLeafSource();
	source.leaves[0].filePath = 'b.md';
	const store = new PositionStore();
	store.save('leaf-a', 'b.md', 5, 1);
	store.save('leaf-b', 'b.md', 20, 1);
	const { coordinator } = createCoordinator(source, store);

	coordinator.markAnchorNavigation('b.md');
	coordinator.start(source.leaves[1].leaf);
	await nextTurn();

	assert.equal(source.leaves[0].view.scroll, 5);
	assert.equal(source.leaves[1].view.scroll, 0);
	await coordinator.dispose();
});
