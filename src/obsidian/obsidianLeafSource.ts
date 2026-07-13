import { App, MarkdownView, WorkspaceLeaf } from 'obsidian';
import { LeafSource, RegisteredLeaf, ScrollEventDetails } from './leafRegistry';

type RuntimeLeaf = WorkspaceLeaf & { id?: string };

const USER_SCROLL_INTENT_TTL_MS = 500;
const SCROLL_KEYS = new Set([
	'ArrowDown',
	'ArrowLeft',
	'ArrowRight',
	'ArrowUp',
	'End',
	'Home',
	'PageDown',
	'PageUp',
	' ',
]);

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
			viewKey: leaf.view.getMode(),
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
			&& current.view === record.view
			&& current.viewKey === record.viewKey;
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
		callback: (details: ScrollEventDetails) => void,
	): () => void {
		const options: AddEventListenerOptions = { capture: true, passive: true };
		let userIntentExpiresAt = 0;
		const markUserIntent = () => {
			userIntentExpiresAt = Date.now() + USER_SCROLL_INTENT_TTL_MS;
		};
		const handleKeydown = (event: KeyboardEvent) => {
			if (SCROLL_KEYS.has(event.key)) markUserIntent();
		};
		const handleScroll = () => {
			const userInitiated = Date.now() <= userIntentExpiresAt;
			callback({ userInitiated });
		};
		const container = record.view.containerEl;

		container.addEventListener('scroll', handleScroll, options);
		container.addEventListener('wheel', markUserIntent, options);
		container.addEventListener('touchstart', markUserIntent, options);
		container.addEventListener('pointerdown', markUserIntent, options);
		container.addEventListener('keydown', handleKeydown, true);

		return () => {
			container.removeEventListener('scroll', handleScroll, true);
			container.removeEventListener('wheel', markUserIntent, true);
			container.removeEventListener('touchstart', markUserIntent, true);
			container.removeEventListener('pointerdown', markUserIntent, true);
			container.removeEventListener('keydown', handleKeydown, true);
		};
	}

	bindViewChange(
		record: RegisteredLeaf<WorkspaceLeaf, MarkdownView>,
		callback: () => void,
	): () => void {
		// Obsidian exposes no public Markdown mode-change event.
		const observer = new MutationObserver(() => {
			if (!this.isCurrent(record)) callback();
		});
		observer.observe(record.view.containerEl, {
			attributes: true,
			attributeFilter: ['class'],
			childList: true,
			subtree: true,
		});

		return () => observer.disconnect();
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
