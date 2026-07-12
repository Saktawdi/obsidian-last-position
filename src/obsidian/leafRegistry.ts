export interface RegisteredLeaf<TLeaf = unknown, TView = unknown> {
	leaf: TLeaf;
	leafId: string;
	filePath: string;
	view: TView;
}

export interface LeafSource<TLeaf = unknown, TView = unknown> {
	describe(leaf: TLeaf | null): RegisteredLeaf<TLeaf, TView> | undefined;
	all(): RegisteredLeaf<TLeaf, TView>[];
	isCurrent(record: RegisteredLeaf<TLeaf, TView>): boolean;
	readScroll(record: RegisteredLeaf<TLeaf, TView>): number | undefined;
	applyScroll(record: RegisteredLeaf<TLeaf, TView>, height: number): void;
	bindScroll(record: RegisteredLeaf<TLeaf, TView>, callback: () => void): () => void;
}

interface LeafBinding<TLeaf, TView> {
	record: RegisteredLeaf<TLeaf, TView>;
	view: TView;
	unbind: () => void;
}

export interface ReconcileResult<TLeaf, TView> {
	records: RegisteredLeaf<TLeaf, TView>[];
	addedOrRebound: RegisteredLeaf<TLeaf, TView>[];
	removedLeafIds: string[];
}

export class LeafRegistry<TLeaf = unknown, TView = unknown> {
	private readonly bindings = new Map<string, LeafBinding<TLeaf, TView>>();

	constructor(private readonly source: LeafSource<TLeaf, TView>) {}

	describe(leaf: TLeaf | null): RegisteredLeaf<TLeaf, TView> | undefined {
		return this.source.describe(leaf);
	}

	allMarkdownLeaves(): RegisteredLeaf<TLeaf, TView>[] {
		return this.source.all();
	}

	isCurrent(record: RegisteredLeaf<TLeaf, TView>): boolean {
		return this.source.isCurrent(record);
	}

	readScroll(record: RegisteredLeaf<TLeaf, TView>): number | undefined {
		return this.source.readScroll(record);
	}

	applyScroll(record: RegisteredLeaf<TLeaf, TView>, height: number): void {
		this.source.applyScroll(record, height);
	}

	reconcile(onScroll: (record: RegisteredLeaf<TLeaf, TView>) => void): ReconcileResult<TLeaf, TView> {
		const records = this.source.all();
		const activeLeafIds = new Set(records.map(record => record.leafId));
		const addedOrRebound: RegisteredLeaf<TLeaf, TView>[] = [];
		const removedLeafIds: string[] = [];

		for (const record of records) {
			const existing = this.bindings.get(record.leafId);
			if (existing?.view === record.view) {
				existing.record = record;
				continue;
			}

			existing?.unbind();
			const binding: LeafBinding<TLeaf, TView> = {
				record,
				view: record.view,
				unbind: () => {},
			};
			binding.unbind = this.source.bindScroll(record, () => onScroll(binding.record));
			this.bindings.set(record.leafId, binding);
			addedOrRebound.push(record);
		}

		for (const [leafId, binding] of this.bindings) {
			if (activeLeafIds.has(leafId)) continue;
			binding.unbind();
			this.bindings.delete(leafId);
			removedLeafIds.push(leafId);
		}

		return { records, addedOrRebound, removedLeafIds };
	}

	dispose(): void {
		for (const binding of this.bindings.values()) binding.unbind();
		this.bindings.clear();
	}
}
