import assert from 'node:assert/strict';
import test from 'node:test';
import {
	LeafRegistry,
	type LeafSource,
	type RegisteredLeaf,
	type ScrollEventDetails,
} from '../../src/obsidian/leafRegistry';
import {
	AnchorSuppression,
	type AnchorNavigationRequest,
} from '../../src/position/anchorSuppression';
import {
	PositionCoordinator,
	type RestoreDelayContext,
} from '../../src/position/positionCoordinator';
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
	emitAppliedScrollAsUser = false;
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
		if (this.emitAppliedScrollAsUser) this.callbacks.get(record.leafId)?.({ userInitiated: true });
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

interface CoordinatorOverrides {
	resolveRestoreDelayMs?: (
		context: RestoreDelayContext,
	) => number | Promise<number>;
	now?: () => number;
}

function createCoordinator(
	source: CoordinatorLeafSource,
	store: PositionStore,
	restoreDelayMs = 0,
	overrides: CoordinatorOverrides = {},
) {
	let persists = 0;
	const statusHeights: number[] = [];
	const anchorReplays: AnchorNavigationRequest[] = [];
	const coordinator = new PositionCoordinator({
		registry: new LeafRegistry(source),
		store,
		scheduler: new RestorationScheduler(),
		anchorSuppression: new AnchorSuppression(500),
		maxAttempts: () => 3,
		restoreIntervalMs: () => 0,
		debounceMs: () => 0,
		resolveRestoreDelayMs: overrides.resolveRestoreDelayMs ?? (() => restoreDelayMs),
		now: overrides.now,
		persist: async () => {
			persists++;
		},
		updateStatus: height => statusHeights.push(height),
		onRestoreExpired: () => {},
		replayAnchorNavigation: request => {
			anchorReplays.push({ ...request });
		},
	});
	return {
		coordinator,
		getPersists: () => persists,
		getStatusHeights: () => [...statusHeights],
		getAnchorReplays: () => [...anchorReplays],
	};
}

test('waits for a resolved restore delay before applying the saved position', async () => {
	const source = new CoordinatorLeafSource();
	const store = new PositionStore();
	store.save('leaf-a', 'a.md', 60, 1);
	let resolveDelay: (delay: number) => void = () => {};
	const delay = new Promise<number>(resolve => {
		resolveDelay = resolve;
	});
	const { coordinator } = createCoordinator(source, store, 0, {
		resolveRestoreDelayMs: () => delay,
	});

	coordinator.start(source.leaves[0].leaf);
	await nextTurn();
	assert.deepEqual(source.appliedHeights, []);

	resolveDelay(0);
	await nextTurn();
	assert.deepEqual(source.appliedHeights, [60]);
	await coordinator.dispose();
});

test('subtracts delay resolution time from the selected restore delay', async () => {
	const source = new CoordinatorLeafSource();
	const store = new PositionStore();
	store.save('leaf-a', 'a.md', 60, 1);
	const nowValues = [100, 120];
	const { coordinator } = createCoordinator(source, store, 0, {
		resolveRestoreDelayMs: async () => 30,
		now: () => nowValues.shift() ?? 120,
	});

	coordinator.start(source.leaves[0].leaf);
	await new Promise(resolve => setTimeout(resolve, 5));
	assert.deepEqual(source.appliedHeights, []);
	await new Promise(resolve => setTimeout(resolve, 15));
	assert.deepEqual(source.appliedHeights, [60]);
	await coordinator.dispose();
});

test('discards an unresolved restore delay after the same leaf opens another file', async () => {
	const source = new CoordinatorLeafSource();
	const store = new PositionStore();
	store.save('leaf-a', 'a.md', 60, 1);
	store.save('leaf-a', 'b.md', 80, 1);
	let resolveFirst: (delay: number) => void = () => {};
	let calls = 0;
	const { coordinator } = createCoordinator(source, store, 0, {
		resolveRestoreDelayMs: () => {
			calls++;
			if (calls > 1) return 0;
			return new Promise<number>(resolve => {
				resolveFirst = resolve;
			});
		},
	});

	coordinator.start(source.leaves[0].leaf);
	await nextTurn();
	source.openFile('leaf-a', 'b.md');
	coordinator.handleFileOpen(source.leaves[0].leaf);
	await nextTurn();
	resolveFirst(0);
	await nextTurn();

	assert.deepEqual(source.appliedHeights, [80]);
	await coordinator.dispose();
});

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

test('cross-file anchor navigation replays once after the restore delay without applying history', async () => {
	const source = new CoordinatorLeafSource();
	const store = new PositionStore();
	store.save('leaf-a', 'b.md', 20, 1);
	const before = store.snapshot();
	const delayContexts: Array<[string | undefined, string]> = [];
	const { coordinator, getAnchorReplays, getPersists } = createCoordinator(source, store, 20, {
		resolveRestoreDelayMs: context => {
			delayContexts.push([context.source?.filePath, context.target.filePath]);
			return 20;
		},
	});
	const request = {
		linkText: 'b#^block-id',
		sourcePath: 'a.md',
		targetFilePath: 'b.md',
	};

	coordinator.start(source.leaves[0].leaf);
	coordinator.markAnchorNavigation(request);
	source.openFile('leaf-a', 'b.md');
	coordinator.handleFileOpen(source.leaves[0].leaf);
	await nextTurn();
	assert.deepEqual(getAnchorReplays(), []);
	assert.deepEqual(source.appliedHeights, []);

	await new Promise(resolve => setTimeout(resolve, 25));
	assert.deepEqual(getAnchorReplays(), [request]);
	assert.deepEqual(delayContexts, [['a.md', 'b.md']]);
	assert.deepEqual(source.appliedHeights, []);
	assert.deepEqual(store.snapshot(), before);
	assert.equal(getPersists(), 0);

	source.openFile('leaf-a', 'a.md');
	coordinator.handleFileOpen(source.leaves[0].leaf);
	source.openFile('leaf-a', 'b.md');
	coordinator.handleFileOpen(source.leaves[0].leaf);
	await new Promise(resolve => setTimeout(resolve, 25));
	assert.deepEqual(source.appliedHeights, [20]);
	await coordinator.dispose();
});

test('user scrolling cancels a pending cross-file anchor replay', async () => {
	const source = new CoordinatorLeafSource();
	const store = new PositionStore();
	const { coordinator, getAnchorReplays } = createCoordinator(source, store, 20);

	coordinator.start(source.leaves[0].leaf);
	coordinator.markAnchorNavigation({
		linkText: 'b#Section',
		sourcePath: 'a.md',
		targetFilePath: 'b.md',
	});
	source.openFile('leaf-a', 'b.md');
	coordinator.handleFileOpen(source.leaves[0].leaf);
	source.scroll('leaf-a', 5, true);
	await new Promise(resolve => setTimeout(resolve, 30));

	assert.deepEqual(getAnchorReplays(), []);
	await coordinator.dispose();
});

test('opening another file cancels a stale cross-file anchor replay', async () => {
	const source = new CoordinatorLeafSource();
	const store = new PositionStore();
	const { coordinator, getAnchorReplays } = createCoordinator(source, store, 20);

	coordinator.start(source.leaves[0].leaf);
	coordinator.markAnchorNavigation({
		linkText: 'b#Section',
		sourcePath: 'a.md',
		targetFilePath: 'b.md',
	});
	source.openFile('leaf-a', 'b.md');
	coordinator.handleFileOpen(source.leaves[0].leaf);
	source.openFile('leaf-a', 'c.md');
	coordinator.handleFileOpen(source.leaves[0].leaf);
	await new Promise(resolve => setTimeout(resolve, 30));

	assert.deepEqual(getAnchorReplays(), []);
	await coordinator.dispose();
});

test('switching the active leaf cancels a pending cross-file anchor replay', async () => {
	const source = new CoordinatorLeafSource();
	const store = new PositionStore();
	const { coordinator, getAnchorReplays } = createCoordinator(source, store, 20);

	coordinator.start(source.leaves[0].leaf);
	coordinator.markAnchorNavigation({
		linkText: 'b#Section',
		sourcePath: 'a.md',
		targetFilePath: 'b.md',
	});
	source.openFile('leaf-a', 'b.md');
	coordinator.handleFileOpen(source.leaves[0].leaf);
	coordinator.handleActiveLeafChange(source.leaves[1].leaf);
	await new Promise(resolve => setTimeout(resolve, 30));

	assert.deepEqual(getAnchorReplays(), []);
	await coordinator.dispose();
});

test('disposing cancels a pending cross-file anchor replay', async () => {
	const source = new CoordinatorLeafSource();
	const store = new PositionStore();
	const { coordinator, getAnchorReplays } = createCoordinator(source, store, 20);

	coordinator.start(source.leaves[0].leaf);
	coordinator.markAnchorNavigation({
		linkText: 'b#Section',
		sourcePath: 'a.md',
		targetFilePath: 'b.md',
	});
	source.openFile('leaf-a', 'b.md');
	coordinator.handleFileOpen(source.leaves[0].leaf);
	await coordinator.dispose();
	await new Promise(resolve => setTimeout(resolve, 30));

	assert.deepEqual(getAnchorReplays(), []);
});

test('a newer cross-file anchor request cancels an older pending replay', async () => {
	const source = new CoordinatorLeafSource();
	const store = new PositionStore();
	const { coordinator, getAnchorReplays } = createCoordinator(source, store, 20);
	const latest = {
		linkText: 'c#Latest',
		sourcePath: 'b.md',
		targetFilePath: 'c.md',
	};

	coordinator.start(source.leaves[0].leaf);
	coordinator.markAnchorNavigation({
		linkText: 'b#Old',
		sourcePath: 'a.md',
		targetFilePath: 'b.md',
	});
	source.openFile('leaf-a', 'b.md');
	coordinator.handleFileOpen(source.leaves[0].leaf);
	coordinator.markAnchorNavigation(latest);
	source.openFile('leaf-a', 'c.md');
	coordinator.handleFileOpen(source.leaves[0].leaf);
	await new Promise(resolve => setTimeout(resolve, 30));

	assert.deepEqual(getAnchorReplays(), [latest]);
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

	coordinator.markAnchorNavigation({
		linkText: 'b#Section',
		sourcePath: 'a.md',
		targetFilePath: 'b.md',
	});
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

test('reads the active leaf position without changing stored history', async () => {
	const source = new CoordinatorLeafSource();
	const store = new PositionStore();
	const { coordinator } = createCoordinator(source, store);

	coordinator.start(source.leaves[0].leaf);
	source.scroll('leaf-a', 42, true);
	await nextTurn();

	assert.deepEqual(coordinator.getActivePosition(), {
		leafId: 'leaf-a',
		filePath: 'a.md',
		height: 42,
	});
	await coordinator.dispose();
});

test('scrolls a matching active bookmark and cancels a pending restore without persisting it', async () => {
	const source = new CoordinatorLeafSource();
	const store = new PositionStore();
	store.save('leaf-a', 'a.md', 10, 1);
	const { coordinator, getPersists } = createCoordinator(source, store, 20);

	coordinator.start(source.leaves[0].leaf);
	assert.equal(coordinator.scrollActiveTo('a.md', 75), true);
	await new Promise(resolve => setTimeout(resolve, 30));

	assert.equal(source.leaves[0].view.scroll, 75);
	assert.equal(store.resolve('leaf-a', 'a.md')?.height, 10);
	assert.equal(getPersists(), 0);
	await coordinator.dispose();
});

test('does not persist a programmatic bookmark event even when it carries user intent', async () => {
	const source = new CoordinatorLeafSource();
	source.emitAppliedScrollAsUser = true;
	const store = new PositionStore();
	store.save('leaf-a', 'a.md', 10, 1);
	const { coordinator, getPersists } = createCoordinator(source, store);

	coordinator.start(source.leaves[0].leaf);
	assert.equal(coordinator.scrollActiveTo('a.md', 75), true);
	await nextTurn();

	assert.equal(store.resolve('leaf-a', 'a.md')?.height, 10);
	assert.equal(getPersists(), 0);
	await coordinator.dispose();
});

test('rejects a bookmark jump after the active leaf changes files', async () => {
	const source = new CoordinatorLeafSource();
	const store = new PositionStore();
	const { coordinator } = createCoordinator(source, store);

	coordinator.start(source.leaves[0].leaf);
	source.openFile('leaf-a', 'b.md');
	assert.equal(coordinator.scrollActiveTo('a.md', 75), false);
	assert.equal(source.leaves[0].view.scroll, 0);
	await coordinator.dispose();
});
