import { LeafRegistry, RegisteredLeaf } from '../obsidian/leafRegistry';
import { AnchorSuppression } from './anchorSuppression';
import { PositionStore } from './positionStore';
import { RestorationResult, RestorationScheduler } from './restorationScheduler';

export interface RestoreExpiryDetails {
	leafId: string;
	filePath: string;
	targetHeight: number;
	actualHeight?: number;
	attempts: number;
}

export interface PositionCoordinatorOptions<TLeaf, TView> {
	registry: LeafRegistry<TLeaf, TView>;
	store: PositionStore;
	scheduler: RestorationScheduler;
	anchorSuppression: AnchorSuppression;
	maxAttempts: () => number;
	debounceMs: () => number;
	restoreDelayMs: () => number;
	persist: () => Promise<void>;
	updateStatus: (height: number) => void;
	onRestoreExpired: (details: RestoreExpiryDetails) => void;
	onPersistError?: (error: unknown) => void;
}

type TimerHandle = ReturnType<typeof globalThis.setTimeout>;

interface PendingSave<TLeaf, TView> {
	record: RegisteredLeaf<TLeaf, TView>;
	height: number;
	timer: TimerHandle;
}

export class PositionCoordinator<TLeaf, TView> {
	private activeRecord?: RegisteredLeaf<TLeaf, TView>;
	private readonly pendingSaves = new Map<string, PendingSave<TLeaf, TView>>();
	private readonly restoreTimers = new Map<string, TimerHandle>();
	private readonly restorationRuns = new Map<string, number>();
	private readonly restoring = new Set<string>();
	private persistQueue: Promise<void> = Promise.resolve();
	private disposed = false;

	constructor(private readonly options: PositionCoordinatorOptions<TLeaf, TView>) {}

	start(activeLeaf: TLeaf | null): void {
		const active = this.options.registry.describe(activeLeaf);
		const records = this.options.registry.reconcile(record => this.handleScroll(record));
		for (const record of records) {
			if (record.leafId !== active?.leafId) this.scheduleRestore(record);
		}
		this.handleActiveLeafChange(activeLeaf);
	}

	reconcile(restoreExisting = true): void {
		const records = this.options.registry.reconcile(record => this.handleScroll(record));
		if (!restoreExisting) return;
		for (const record of records) this.scheduleRestore(record);
	}

	handleActiveLeafChange(leaf: TLeaf | null): void {
		if (this.activeRecord) this.saveRecord(this.activeRecord);
		this.options.registry.reconcile(record => this.handleScroll(record));
		this.activeRecord = this.options.registry.describe(leaf);
		if (this.activeRecord) this.scheduleRestore(this.activeRecord);
	}

	handleFileOpen(leaf: TLeaf | null): void {
		this.options.registry.reconcile(record => this.handleScroll(record));
		const record = this.options.registry.describe(leaf);
		if (!record) return;
		if (this.activeRecord
			&& (this.activeRecord.leafId !== record.leafId
				|| this.activeRecord.filePath !== record.filePath)) {
			this.saveRecord(this.activeRecord);
		}
		this.activeRecord = record;
		this.scheduleRestore(record);
	}

	markAnchorNavigation(filePath: string): void {
		this.options.anchorSuppression.mark(filePath);
	}

	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;

		for (const timer of this.restoreTimers.values()) globalThis.clearTimeout(timer);
		this.restoreTimers.clear();
		this.options.scheduler.cancelAll();

		for (const pending of this.pendingSaves.values()) {
			globalThis.clearTimeout(pending.timer);
			this.saveCapturedPosition(pending.record, pending.height);
		}
		this.pendingSaves.clear();

		for (const record of this.options.registry.allMarkdownLeaves()) this.saveRecord(record);
		this.options.registry.dispose();
		await this.persistQueue;
	}

	private handleScroll(record: RegisteredLeaf<TLeaf, TView>): void {
		if (this.disposed || this.restoring.has(record.leafId)) return;

		const height = this.options.registry.readScroll(record);
		if (height === undefined || !Number.isFinite(height) || height < 0) return;

		this.options.updateStatus(height);
		if (height > 0) this.cancelRestore(record.leafId);
		this.scheduleSave(record, height);
	}

	private scheduleSave(record: RegisteredLeaf<TLeaf, TView>, height: number): void {
		const existing = this.pendingSaves.get(record.leafId);
		if (existing) globalThis.clearTimeout(existing.timer);

		const timer = globalThis.setTimeout(() => {
			this.pendingSaves.delete(record.leafId);
			this.saveCapturedPosition(record, height);
		}, Math.max(0, this.options.debounceMs()));
		this.pendingSaves.set(record.leafId, { record, height, timer });
	}

	private saveRecord(record: RegisteredLeaf<TLeaf, TView>): void {
		const pending = this.pendingSaves.get(record.leafId);
		if (pending) {
			globalThis.clearTimeout(pending.timer);
			this.pendingSaves.delete(record.leafId);
			this.saveCapturedPosition(pending.record, pending.height);
			return;
		}

		const height = this.options.registry.readScroll(record);
		if (height === undefined) return;
		this.saveCapturedPosition(record, height);
	}

	private saveCapturedPosition(record: RegisteredLeaf<TLeaf, TView>, height: number): void {
		if (!this.options.store.save(record.leafId, record.filePath, height)) return;
		this.options.updateStatus(height);
		this.queuePersist();
	}

	private scheduleRestore(record: RegisteredLeaf<TLeaf, TView>): void {
		this.cancelRestore(record.leafId);
		if (this.options.anchorSuppression.consume(record.filePath)) return;

		const saved = this.options.store.resolve(record.leafId, record.filePath);
		if (!saved) return;

		const run = (this.restorationRuns.get(record.leafId) ?? 0) + 1;
		this.restorationRuns.set(record.leafId, run);
		const timer = globalThis.setTimeout(() => {
			this.restoreTimers.delete(record.leafId);
			if (!this.options.registry.isCurrent(record)) return;
			this.restoring.add(record.leafId);
			void this.options.scheduler.start(record.leafId, saved.height, {
				isCurrent: () => this.options.registry.isCurrent(record),
				readScroll: () => this.options.registry.readScroll(record),
				applyScroll: height => this.options.registry.applyScroll(record, height),
			}, {
				maxAttempts: this.options.maxAttempts(),
				intervalMs: 100,
			}).then(result => this.handleRestoreResult(record, saved.height, result))
				.finally(() => {
					if (this.restorationRuns.get(record.leafId) === run) {
						this.restoring.delete(record.leafId);
					}
				});
		}, Math.max(0, this.options.restoreDelayMs()));
		this.restoreTimers.set(record.leafId, timer);
	}

	private handleRestoreResult(
		record: RegisteredLeaf<TLeaf, TView>,
		targetHeight: number,
		result: RestorationResult,
	): void {
		if (result.reason !== 'expired') return;
		this.options.onRestoreExpired({
			leafId: record.leafId,
			filePath: record.filePath,
			targetHeight,
			actualHeight: result.actualHeight,
			attempts: result.attempts,
		});
	}

	private cancelRestore(leafId: string): void {
		const timer = this.restoreTimers.get(leafId);
		if (timer !== undefined) globalThis.clearTimeout(timer);
		this.restoreTimers.delete(leafId);
		this.options.scheduler.cancel(leafId);
		this.restorationRuns.set(leafId, (this.restorationRuns.get(leafId) ?? 0) + 1);
		this.restoring.delete(leafId);
	}

	private queuePersist(): void {
		this.persistQueue = this.persistQueue
			.catch(() => undefined)
			.then(() => this.options.persist())
			.catch(error => {
				this.options.onPersistError?.(error);
			});
	}
}
