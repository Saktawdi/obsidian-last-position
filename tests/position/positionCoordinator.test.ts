import assert from 'node:assert/strict';
import test from 'node:test';
import {
	LeafRegistry,
	type LeafSource,
	type RegisteredLeaf,
	type ScrollEventDetails,
} from '../../src/obsidian/leafRegistry';
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

type CoordinatorRecord = RegisteredLeaf<FakeLeaf, FakeView> & { viewKey: string };

class CoordinatorLeafSource implements LeafSource<FakeLeaf, FakeView> {
	readonly leaves: CoordinatorRecord[] = [
		{ leaf: { id: 'leaf-a' }, leafId: 'leaf-a', filePath: 'a.md', view: { scroll: 0 }, viewKey: 'mode-1' },
		{ leaf: { id: 'leaf-b' }, leafId: 'leaf-b', filePath: 'b.md', view: { scroll: 0 }, viewKey: 'mode-1' },
	];
	private readonly callbacks = new Map<string, (details: ScrollEventDetails) => void>();
	private readonly viewChangeCallbacks = new Map<string, () => void>();
	readonly appliedHeights: number[] = [];
	ignoreAppliedScroll = false;
	onIsCurrent?: () => void;

	describe(leaf: FakeLeaf | null): RegisteredLeaf<FakeLeaf, FakeView> | undefined {
		return this.leaves.find(record => record.leaf === leaf);
	}

	all(): RegisteredLeaf<FakeLeaf, FakeView>[] {
		return [...this.leaves];
	}

	isCurrent(record: RegisteredLeaf<FakeLeaf, FakeView>): boolean {
		this.onIsCurrent?.();
		return this.leaves.some(candidate =>
			candidate.leafId === record.leafId
			&& candidate.filePath === record.filePath
			&& candidate.view === record.view
			&& candidate.viewKey === record.viewKey,
		);
	}

	readScroll(record: RegisteredLeaf<FakeLeaf, FakeView>): number | undefined {
		if (!this.isCurrent(record)) return undefined;
		return record.view.scroll;
	}

	applyScroll(record: RegisteredLeaf<FakeLeaf, FakeView>, height: number): void {
		if (!this.isCurrent(record)) return;
		this.appliedHeights.push(height);
		if (this.ignoreAppliedScroll) return;
		record.view.scroll = height;
	}

	bindScroll(
		record: RegisteredLeaf<FakeLeaf, FakeView>,
		callback: (details: ScrollEventDetails) => void,
	): () => void {
		this.callbacks.set(record.leafId, callback);
		return () => this.callbacks.delete(record.leafId);
	}

	bindViewChange(record: RegisteredLeaf<FakeLeaf, FakeView>, callback: () => void): () => void {
		this.viewChangeCallbacks.set(record.leafId, callback);
		return () => this.viewChangeCallbacks.delete(record.leafId);
	}

	scroll(leafId: string, height: number, userInitiated = true): void {
		const record = this.leaves.find(candidate => candidate.leafId === leafId);
		if (!record) return;
		record.view.scroll = height;
		this.callbacks.get(leafId)?.({ userInitiated });
	}

	switchRenderingMode(leafId: string): void {
		const index = this.leaves.findIndex(candidate => candidate.leafId === leafId);
		if (index < 0) return;
		this.leaves[index] = {
			...this.leaves[index],
			viewKey: this.leaves[index].viewKey === 'mode-1' ? 'mode-2' : 'mode-1',
		};
	}

	openFile(leafId: string, filePath: string): void {
		const index = this.leaves.findIndex(candidate => candidate.leafId === leafId);
		if (index < 0) return;
		this.leaves[index] = { ...this.leaves[index], filePath };
	}

	notifyViewChange(leafId: string): void {
		this.viewChangeCallbacks.get(leafId)?.();
	}
}

function nextTurn(): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, 5));
}

function createCoordinator(source: CoordinatorLeafSource, store: PositionStore, restoreDelayMs = 0) {
	let persists = 0;
	const statusHeights: number[] = [];
	const coordinator = new PositionCoordinator({
		registry: new LeafRegistry(source),
		store,
		scheduler: new RestorationScheduler(),
		anchorSuppression: new AnchorSuppression(500),
		maxAttempts: () => 3,
		debounceMs: () => 0,
		restoreDelayMs: () => restoreDelayMs,
		persist: async () => {
			persists++;
		},
		updateStatus: height => statusHeights.push(height),
		onRestoreExpired: () => {},
	});
	return {
		coordinator,
		getPersists: () => persists,
		getStatusHeights: () => [...statusHeights],
	};
}

test('updates the displayed height after a successful restoration', async () => {
	const source = new CoordinatorLeafSource();
	const store = new PositionStore();
	store.save('leaf-a', 'a.md', 60, 1);
	const { coordinator, getStatusHeights } = createCoordinator(source, store);

	coordinator.start(source.leaves[0].leaf);
	await nextTurn();

	assert.equal(getStatusHeights().at(-1), 60);
	await coordinator.dispose();
});

test('saves the previous leaf and restores the newly active leaf', async () => {
	const source = new CoordinatorLeafSource();
	const store = new PositionStore();
	store.save('leaf-a', 'a.md', 10, 1);
	store.save('leaf-b', 'b.md', 20, 1);
	const { coordinator } = createCoordinator(source, store);

	coordinator.start(source.leaves[0].leaf);
	await nextTurn();
	assert.equal(source.leaves[0].view.scroll, 10);

	source.scroll('leaf-a', 15, true);
	coordinator.handleActiveLeafChange(source.leaves[1].leaf);
	await nextTurn();

	assert.equal(store.resolve('leaf-a', 'a.md')?.height, 15);
	assert.equal(source.leaves[1].view.scroll, 20);
	await coordinator.dispose();
});

test('anchor suppression skips the current navigation but restores on a later reopening', async () => {
	const source = new CoordinatorLeafSource();
	const store = new PositionStore();
	store.save('leaf-b', 'b.md', 20, 1);
	const { coordinator } = createCoordinator(source, store);

	coordinator.markAnchorNavigation('b.md');
	coordinator.start(source.leaves[1].leaf);
	await nextTurn();
	assert.equal(source.leaves[1].view.scroll, 0);

	source.scroll('leaf-b', 25, true);
	coordinator.handleActiveLeafChange(source.leaves[0].leaf);
	await nextTurn();
	coordinator.handleActiveLeafChange(source.leaves[1].leaf);
	await nextTurn();
	assert.equal(source.leaves[1].view.scroll, 25);
	await coordinator.dispose();
});

test('debounced scroll saves the exact leaf including position zero', async () => {
	const source = new CoordinatorLeafSource();
	const store = new PositionStore();
	const { coordinator, getPersists } = createCoordinator(source, store);

	coordinator.start(null);
	source.scroll('leaf-a', 0, true);
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
	coordinator.reconcile();
	await nextTurn();

	assert.equal(source.leaves[0].view.scroll, 15);
	await coordinator.dispose();
});

test('generic reconciliation rebinds a changed file without restoring it', async () => {
	const source = new CoordinatorLeafSource();
	const store = new PositionStore();
	store.save('leaf-a', 'a.md', 10, 1);
	store.save('leaf-b', 'b.md', 80, 1);
	const { coordinator } = createCoordinator(source, store, 20);

	coordinator.start(source.leaves[0].leaf);
	await new Promise(resolve => setTimeout(resolve, 30));
	source.openFile('leaf-a', 'b.md');
	source.leaves[0].view.scroll = 0;
	coordinator.reconcile();
	await new Promise(resolve => setTimeout(resolve, 30));

	assert.deepEqual(source.appliedHeights, [10]);
	assert.equal(source.leaves[0].view.scroll, 0);

	coordinator.handleFileOpen(source.leaves[0].leaf);
	await new Promise(resolve => setTimeout(resolve, 30));
	assert.equal(source.leaves[0].view.scroll, 80);
	await coordinator.dispose();
});

test('startup does not restore background leaves or override active anchor navigation', async () => {
	const source = new CoordinatorLeafSource();
	source.leaves[0].filePath = 'b.md';
	const store = new PositionStore();
	store.save('leaf-a', 'b.md', 5, 1);
	store.save('leaf-b', 'b.md', 20, 1);
	const { coordinator } = createCoordinator(source, store);

	coordinator.markAnchorNavigation('b.md');
	coordinator.start(source.leaves[1].leaf);
	await nextTurn();

	assert.equal(source.leaves[0].view.scroll, 0);
	assert.equal(source.leaves[1].view.scroll, 0);
	await coordinator.dispose();
});

test('scrolling to zero during the restore delay cancels the pending restore', async () => {
	const source = new CoordinatorLeafSource();
	const store = new PositionStore();
	store.save('leaf-a', 'a.md', 10, 1);
	const { coordinator } = createCoordinator(source, store, 20);

	coordinator.start(source.leaves[0].leaf);
	source.scroll('leaf-a', 0);
	await new Promise(resolve => setTimeout(resolve, 30));

	assert.equal(source.leaves[0].view.scroll, 0);
	await coordinator.dispose();
});

test('does not start a cancelled restore after its timer callback begins', async () => {
	const source = new CoordinatorLeafSource();
	const store = new PositionStore();
	store.save('leaf-a', 'a.md', 10, 1);
	const { coordinator } = createCoordinator(source, store);
	let triggered = false;
	source.onIsCurrent = () => {
		if (triggered) return;
		triggered = true;
		source.scroll('leaf-a', 0);
	};

	coordinator.start(source.leaves[0].leaf);
	await new Promise(resolve => setTimeout(resolve, 30));

	assert.equal(source.leaves[0].view.scroll, 0);
	await coordinator.dispose();
});

test('keeps a file-open restore pending through the native zero scroll reset', async () => {
	const source = new CoordinatorLeafSource();
	const store = new PositionStore();
	store.save('leaf-a', 'a.md', 10, 1);
	store.save('leaf-b', 'b.md', 80, 1);
	const { coordinator } = createCoordinator(source, store, 20);

	coordinator.start(source.leaves[0].leaf);
	await new Promise(resolve => setTimeout(resolve, 30));
	source.openFile('leaf-a', 'b.md');
	source.leaves[0].view.scroll = 0;
	coordinator.handleFileOpen(source.leaves[0].leaf);
	source.scroll('leaf-a', 0, false);
	await new Promise(resolve => setTimeout(resolve, 30));

	assert.equal(source.leaves[0].view.scroll, 80);
	assert.equal(store.resolve('other-leaf', 'a.md')?.height, 10);
	assert.equal(store.resolve('other-leaf', 'b.md')?.height, 80);
	await coordinator.dispose();
});

test('keeps a file-open restore pending through multiple native scroll resets', async () => {
	const source = new CoordinatorLeafSource();
	const store = new PositionStore();
	store.save('leaf-a', 'a.md', 10, 1);
	store.save('leaf-b', 'b.md', 80, 1);
	const { coordinator } = createCoordinator(source, store, 20);

	coordinator.start(source.leaves[0].leaf);
	await new Promise(resolve => setTimeout(resolve, 30));
	source.openFile('leaf-a', 'b.md');
	source.leaves[0].view.scroll = 0;
	coordinator.handleFileOpen(source.leaves[0].leaf);
	source.scroll('leaf-a', 0, false);
	source.scroll('leaf-a', 0, false);
	await new Promise(resolve => setTimeout(resolve, 30));

	assert.equal(source.leaves[0].view.scroll, 80);
	assert.equal(store.resolve('leaf-a', 'b.md')?.height, 80);
	await coordinator.dispose();
});

test('does not persist a native scroll reset outside a restore window', async () => {
	const source = new CoordinatorLeafSource();
	const store = new PositionStore();
	store.save('leaf-a', 'a.md', 50, 1);
	const { coordinator } = createCoordinator(source, store);

	coordinator.start(source.leaves[0].leaf);
	await nextTurn();
	source.scroll('leaf-a', 0, false);
	await nextTurn();

	assert.equal(store.resolve('leaf-a', 'a.md')?.height, 50);
	await coordinator.dispose();
});

test('does not persist a transient DOM reset when the active leaf clears during navigation', async () => {
	const source = new CoordinatorLeafSource();
	const store = new PositionStore();
	store.save('leaf-a', 'a.md', 50, 1);
	const { coordinator } = createCoordinator(source, store);

	coordinator.start(source.leaves[0].leaf);
	await nextTurn();
	source.leaves[0].view.scroll = 0;
	coordinator.handleActiveLeafChange(null);

	assert.equal(store.resolve('leaf-a', 'a.md')?.height, 50);
	await coordinator.dispose();
});

test('does not overwrite or restart a restore for a repeated active-leaf event', async () => {
	const source = new CoordinatorLeafSource();
	const store = new PositionStore();
	store.save('leaf-a', 'a.md', 10, 1);
	store.save('leaf-b', 'b.md', 80, 1);
	const { coordinator } = createCoordinator(source, store, 20);

	coordinator.start(source.leaves[0].leaf);
	await new Promise(resolve => setTimeout(resolve, 30));
	source.openFile('leaf-a', 'b.md');
	source.leaves[0].view.scroll = 0;
	coordinator.handleActiveLeafChange(source.leaves[0].leaf);
	coordinator.handleFileOpen(source.leaves[0].leaf);
	source.scroll('leaf-a', 0, false);
	coordinator.handleActiveLeafChange(source.leaves[0].leaf);
	await new Promise(resolve => setTimeout(resolve, 30));

	assert.equal(source.leaves[0].view.scroll, 80);
	assert.equal(store.resolve('leaf-a', 'b.md')?.height, 80);
	await coordinator.dispose();
});

test('user scrolling during restoration cancels it and persists the new position', async () => {
	const source = new CoordinatorLeafSource();
	source.ignoreAppliedScroll = true;
	const store = new PositionStore();
	store.save('leaf-a', 'a.md', 80, 1);
	const { coordinator } = createCoordinator(source, store);

	coordinator.start(source.leaves[0].leaf);
	await nextTurn();
	source.scroll('leaf-a', 25, true);
	await nextTurn();

	assert.equal(store.resolve('leaf-a', 'a.md')?.height, 25);
	await coordinator.dispose();
});

test('transfers a restored height once when first entering the other rendering mode', async () => {
	const source = new CoordinatorLeafSource();
	const store = new PositionStore();
	store.save('leaf-a', 'a.md', 60, 1);
	const { coordinator } = createCoordinator(source, store, 20);

	coordinator.start(source.leaves[0].leaf);
	await new Promise(resolve => setTimeout(resolve, 30));
	source.switchRenderingMode('leaf-a');
	source.leaves[0].view.scroll = 0;
	source.notifyViewChange('leaf-a');
	source.scroll('leaf-a', 60, false);
	await new Promise(resolve => setTimeout(resolve, 30));

	assert.deepEqual(source.appliedHeights, [60, 60]);
	assert.equal(source.leaves[0].view.scroll, 60);

	source.switchRenderingMode('leaf-a');
	source.leaves[0].view.scroll = 0;
	source.notifyViewChange('leaf-a');
	assert.deepEqual(source.appliedHeights, [60, 60]);
	assert.equal(source.leaves[0].view.scroll, 0);
	await coordinator.dispose();
});

test('does not transfer the restored height after the user scrolls', async () => {
	const source = new CoordinatorLeafSource();
	const store = new PositionStore();
	store.save('leaf-a', 'a.md', 60, 1);
	const { coordinator } = createCoordinator(source, store, 20);

	coordinator.start(source.leaves[0].leaf);
	await new Promise(resolve => setTimeout(resolve, 30));
	source.scroll('leaf-a', 65, true);
	await nextTurn();
	source.switchRenderingMode('leaf-a');
	source.leaves[0].view.scroll = 0;
	source.notifyViewChange('leaf-a');

	assert.deepEqual(source.appliedHeights, [60]);
	assert.equal(source.leaves[0].view.scroll, 0);
	await coordinator.dispose();
});

test('respects a user scroll to zero after a mode-change rebind', async () => {
	const source = new CoordinatorLeafSource();
	const store = new PositionStore();
	store.save('leaf-a', 'a.md', 60, 1);
	const { coordinator } = createCoordinator(source, store, 20);

	coordinator.start(source.leaves[0].leaf);
	await new Promise(resolve => setTimeout(resolve, 30));
	source.switchRenderingMode('leaf-a');
	source.leaves[0].view.scroll = 0;
	source.notifyViewChange('leaf-a');
	source.scroll('leaf-a', 0, true);
	await new Promise(resolve => setTimeout(resolve, 30));

	assert.equal(source.leaves[0].view.scroll, 0);
	await coordinator.dispose();
});
