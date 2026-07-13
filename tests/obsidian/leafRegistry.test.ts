import assert from 'node:assert/strict';
import test from 'node:test';
import {
	LeafRegistry,
	type LeafSource,
	type RegisteredLeaf,
	type ScrollEventDetails,
} from '../../src/obsidian/leafRegistry';

interface FakeLeaf {
	id: string;
}

interface FakeView {
	id: string;
	scroll: number;
}

type TestRecord = RegisteredLeaf<FakeLeaf, FakeView> & { viewKey: string };

class FakeLeafSource implements LeafSource<FakeLeaf, FakeView> {
	private records: TestRecord[] = [];
	readonly removed: string[] = [];

	constructor() {
		this.records = [this.createRecord('leaf-a', 'view-1')];
	}

	describe(leaf: FakeLeaf | null): RegisteredLeaf<FakeLeaf, FakeView> | undefined {
		return this.records.find(record => record.leaf === leaf);
	}

	all(): RegisteredLeaf<FakeLeaf, FakeView>[] {
		return [...this.records];
	}

	isCurrent(record: RegisteredLeaf<FakeLeaf, FakeView>): boolean {
		return this.records.some(candidate =>
			candidate.leafId === record.leafId
			&& candidate.view === record.view
			&& candidate.viewKey === record.viewKey,
		);
	}

	readScroll(record: RegisteredLeaf<FakeLeaf, FakeView>): number {
		return record.view.scroll;
	}

	applyScroll(record: RegisteredLeaf<FakeLeaf, FakeView>, height: number): void {
		record.view.scroll = height;
	}

	bindScroll(
		record: RegisteredLeaf<FakeLeaf, FakeView>,
		callback: (details: ScrollEventDetails) => void,
	): () => void {
		void callback;
		return () => this.removed.push(record.view.id);
	}

	bindViewChange(record: RegisteredLeaf<FakeLeaf, FakeView>, callback: () => void): () => void {
		void record;
		void callback;
		return () => {};
	}

	replaceView(leafId: string): void {
		this.records = this.records.map(record => record.leafId === leafId
			? this.createRecord(leafId, 'view-2')
			: record);
	}

	replaceViewKey(leafId: string): void {
		this.records = this.records.map(record => record.leafId === leafId
			? { ...record, viewKey: 'mode-2' }
			: record);
	}

	replaceFilePath(leafId: string): void {
		this.records = this.records.map(record => record.leafId === leafId
			? { ...record, filePath: 'other.md' }
			: record);
	}

	detach(leafId: string): void {
		this.records = this.records.filter(record => record.leafId !== leafId);
	}

	private createRecord(leafId: string, viewId: string): TestRecord {
		return {
			leaf: { id: leafId },
			leafId,
			filePath: 'note.md',
			view: { id: viewId, scroll: 0 },
			viewKey: 'mode-1',
		};
	}
}

test('rebinds changed views and removes listeners for detached leaves', () => {
	const source = new FakeLeafSource();
	const registry = new LeafRegistry(source);

	const initial = registry.reconcile(() => {});
	assert.deepEqual(initial.addedOrRebound.map(record => record.view.id), ['view-1']);
	source.replaceView('leaf-a');
	const rebound = registry.reconcile(() => {});
	assert.deepEqual(rebound.addedOrRebound.map(record => record.view.id), ['view-2']);
	source.detach('leaf-a');
	const detached = registry.reconcile(() => {});

	assert.deepEqual(source.removed, ['view-1', 'view-2']);
	assert.deepEqual(detached.removedLeafIds, ['leaf-a']);
});

test('delegates scroll reads, writes, and current-state checks', () => {
	const source = new FakeLeafSource();
	const registry = new LeafRegistry(source);
	const record = registry.allMarkdownLeaves()[0];

	registry.applyScroll(record, 25);
	assert.equal(registry.readScroll(record), 25);
	assert.equal(registry.isCurrent(record), true);

	source.replaceView('leaf-a');
	assert.equal(registry.isCurrent(record), false);
});

test('rebinds when the rendering mode changes without replacing the Markdown view', () => {
	const source = new FakeLeafSource();
	const registry = new LeafRegistry(source);

	registry.reconcile(() => {});
	source.replaceViewKey('leaf-a');
	const rebound = registry.reconcile(() => {});

	assert.equal(rebound.addedOrRebound.length, 1);
	assert.equal((rebound.addedOrRebound[0] as TestRecord).viewKey, 'mode-2');
});

test('rebinds when the same Markdown view opens another file', () => {
	const source = new FakeLeafSource();
	const registry = new LeafRegistry(source);

	registry.reconcile(() => {});
	source.replaceFilePath('leaf-a');
	const rebound = registry.reconcile(() => {});

	assert.equal(rebound.addedOrRebound.length, 1);
	assert.equal(rebound.addedOrRebound[0].filePath, 'other.md');
});
