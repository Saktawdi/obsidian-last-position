import { App, MarkdownView, WorkspaceLeaf } from 'obsidian';
import { LeafSource, RegisteredLeaf } from './leafRegistry';

type RuntimeLeaf = WorkspaceLeaf & { id?: string };

export class ObsidianLeafSource implements LeafSource<WorkspaceLeaf, MarkdownView> {
	private readonly fallbackIds = new WeakMap<WorkspaceLeaf, string>();
	private fallbackCounter = 0;

	constructor(private readonly app: App) {}

	describe(leaf: WorkspaceLeaf | null): RegisteredLeaf<WorkspaceLeaf, MarkdownView> | undefined {
		if (!leaf || !(leaf.view instanceof MarkdownView) || !leaf.view.file) return undefined;

		return {
			leaf,
			leafId: this.getLeafId(leaf),
			filePath: leaf.view.file.path,
			view: leaf.view,
		};
	}

	all(): RegisteredLeaf<WorkspaceLeaf, MarkdownView>[] {
		const records: RegisteredLeaf<WorkspaceLeaf, MarkdownView>[] = [];
		this.app.workspace.iterateAllLeaves(leaf => {
			const record = this.describe(leaf);
			if (record) records.push(record);
		});
		return records;
	}

	isCurrent(record: RegisteredLeaf<WorkspaceLeaf, MarkdownView>): boolean {
		const current = this.describe(record.leaf);
		return current?.leafId === record.leafId
			&& current.filePath === record.filePath
			&& current.view === record.view;
	}

	readScroll(record: RegisteredLeaf<WorkspaceLeaf, MarkdownView>): number | undefined {
		if (!this.isCurrent(record)) return undefined;
		return record.view.currentMode.getScroll();
	}

	applyScroll(record: RegisteredLeaf<WorkspaceLeaf, MarkdownView>, height: number): void {
		if (!this.isCurrent(record)) return;
		record.view.currentMode.applyScroll(height);
	}

	bindScroll(
		record: RegisteredLeaf<WorkspaceLeaf, MarkdownView>,
		callback: () => void,
	): () => void {
		const options: AddEventListenerOptions = { capture: true, passive: true };
		record.view.containerEl.addEventListener('scroll', callback, options);
		return () => record.view.containerEl.removeEventListener('scroll', callback, true);
	}

	private getLeafId(leaf: WorkspaceLeaf): string {
		const runtimeId = (leaf as RuntimeLeaf).id;
		if (runtimeId) return runtimeId;

		const existing = this.fallbackIds.get(leaf);
		if (existing) return existing;

		const fallback = `session-leaf-${++this.fallbackCounter}`;
		this.fallbackIds.set(leaf, fallback);
		return fallback;
	}
}
