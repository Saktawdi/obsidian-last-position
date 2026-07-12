import assert from 'node:assert/strict';
import test from 'node:test';
import {
	LeafRegistry,
	type LeafSource,
	type RegisteredLeaf,
} from '../../src/obsidian/leafRegistry';

interface FakeLeaf {
	id: string;
}

interface FakeView {
	id: string;
	scroll: number;
}

class FakeLeafSource implements LeafSource<FakeLeaf, FakeView> {
	private records: RegisteredLeaf<FakeLeaf, FakeView>[] = [];
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
			candidate.leafId === record.leafId && candidate.view === record.view,
		);
	}

	readScroll(record: RegisteredLeaf<FakeLeaf, FakeView>): number {
		return record.view.scroll;
	}

	applyScroll(record: RegisteredLeaf<FakeLeaf, FakeView>, height: number): void {
		record.view.scroll = height;
	}

	bindScroll(record: RegisteredLeaf<FakeLeaf, FakeView>, callback: () => void): () => void {
		void callback;
		return () => this.removed.push(record.view.id);
	}

	replaceView(leafId: string): void {
		this.records = this.records.map(record => record.leafId === leafId
			? this.createRecord(leafId, 'view-2')
			: record);
	}

	detach(leafId: string): void {
		this.records = this.records.filter(record => record.leafId !== leafId);
	}

	private createRecord(leafId: string, viewId: string): RegisteredLeaf<FakeLeaf, FakeView> {
		return {
			leaf: { id: leafId },
			leafId,
			filePath: 'note.md',
			view: { id: viewId, scroll: 0 },
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
