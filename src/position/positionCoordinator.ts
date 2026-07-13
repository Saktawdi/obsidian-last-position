import { LeafRegistry, RegisteredLeaf, ScrollEventDetails } from '../obsidian/leafRegistry';
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

interface ModeHandoff {
	filePath: string;
	sourceViewKey: unknown;
	height: number;
}

export class PositionCoordinator<TLeaf, TView> {
	private activeRecord?: RegisteredLeaf<TLeaf, TView>;
	private readonly pendingSaves = new Map<string, PendingSave<TLeaf, TView>>();
	private readonly restoreTimers = new Map<string, TimerHandle>();
	private readonly restorationRuns = new Map<string, number>();
	private readonly restoring = new Set<string>();
	private readonly modeHandoffs = new Map<string, ModeHandoff>();
	private persistQueue: Promise<void> = Promise.resolve();
	private disposed = false;

	constructor(private readonly options: PositionCoordinatorOptions<TLeaf, TView>) {}

	start(activeLeaf: TLeaf | null): void {
		this.reconcileLeaves();
		this.handleActiveLeafChange(activeLeaf);
	}

	reconcile(): void {
		const result = this.reconcileLeaves();
		for (const leafId of result.removedLeafIds) {
			this.cancelRestore(leafId);
			this.modeHandoffs.delete(leafId);
		}
	}

	handleActiveLeafChange(leaf: TLeaf | null): void {
		const nextRecord = this.options.registry.describe(leaf);
		if (this.documentsMatch(this.activeRecord, nextRecord)) {
			this.reconcile();
			this.activeRecord = nextRecord;
			return;
		}

		const previousRecord = this.activeRecord;
		if (previousRecord) this.flushPendingSave(previousRecord.leafId);
		this.reconcileLeaves();
		this.activeRecord = this.options.registry.describe(leaf);
		if (this.activeRecord) {
			this.scheduleRestore(this.activeRecord, true);
		}
	}

	handleFileOpen(leaf: TLeaf | null): void {
		this.reconcileLeaves();
		const record = this.options.registry.describe(leaf);
		if (!record) return;
		if (this.documentsMatch(this.activeRecord, record)) {
			this.activeRecord = record;
			return;
		}
		if (this.activeRecord) {
			this.flushPendingSave(this.activeRecord.leafId);
		}
		this.activeRecord = record;
		this.scheduleRestore(record, true);
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
		this.modeHandoffs.clear();

		for (const pending of this.pendingSaves.values()) {
			globalThis.clearTimeout(pending.timer);
			this.saveCapturedPosition(pending.record, pending.height);
		}
		this.pendingSaves.clear();

		this.options.registry.dispose();
		await this.persistQueue;
	}

	private handleScroll(
		record: RegisteredLeaf<TLeaf, TView>,
		details: ScrollEventDetails,
	): void {
		if (this.disposed) return;
		if (details.userInitiated) this.modeHandoffs.delete(record.leafId);
		if (this.restoring.has(record.leafId)) {
			if (!details.userInitiated) return;
			this.cancelRestore(record.leafId);
		}

		const height = this.options.registry.readScroll(record);
		if (height === undefined) {
			this.reconcile();
			if (details.userInitiated) {
				const current = this.options.registry.describe(record.leaf);
				if (current) this.handleScroll(current, details);
			}
			return;
		}
		if (!Number.isFinite(height) || height < 0) return;
		if (!details.userInitiated) return;

		this.options.updateStatus(height);
		this.cancelRestore(record.leafId);
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

	private flushPendingSave(leafId: string): void {
		const pending = this.pendingSaves.get(leafId);
		if (!pending) return;
		globalThis.clearTimeout(pending.timer);
		this.pendingSaves.delete(leafId);
		this.saveCapturedPosition(pending.record, pending.height);
	}

	private saveCapturedPosition(record: RegisteredLeaf<TLeaf, TView>, height: number): void {
		if (!this.options.store.save(record.leafId, record.filePath, height)) return;
		this.options.updateStatus(height);
		this.queuePersist();
	}

	private scheduleRestore(
		record: RegisteredLeaf<TLeaf, TView>,
		consumeSuppression: boolean,
	): void {
		this.cancelRestore(record.leafId);
		this.modeHandoffs.delete(record.leafId);
		if (consumeSuppression && this.options.anchorSuppression.consume(record.filePath)) return;

		const saved = this.options.store.resolve(record.leafId, record.filePath);
		if (!saved) return;

		const run = (this.restorationRuns.get(record.leafId) ?? 0) + 1;
		this.restorationRuns.set(record.leafId, run);
		const timer = globalThis.setTimeout(() => {
			if (this.disposed || this.restorationRuns.get(record.leafId) !== run) return;
			this.restoreTimers.delete(record.leafId);
			if (!this.options.registry.isCurrent(record)) return;
			if (this.disposed || this.restorationRuns.get(record.leafId) !== run) return;
			this.restoring.add(record.leafId);
			void this.options.scheduler.start(record.leafId, saved.height, {
				isCurrent: () => this.options.registry.isCurrent(record),
				readScroll: () => this.options.registry.readScroll(record),
				applyScroll: height => this.options.registry.applyScroll(record, height),
			}, {
				maxAttempts: this.options.maxAttempts(),
				intervalMs: 100,
			}).then(result => this.handleRestoreResult(record, saved.height, result, run))
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
		run: number,
	): void {
		if (this.disposed || this.restorationRuns.get(record.leafId) !== run) return;
		if (result.reason === 'completed') {
			const restoredHeight = result.actualHeight !== undefined
				&& Number.isFinite(result.actualHeight)
				? result.actualHeight
				: targetHeight;
			this.options.updateStatus(restoredHeight);
			this.modeHandoffs.set(record.leafId, {
				filePath: record.filePath,
				sourceViewKey: record.viewKey,
				height: restoredHeight,
			});
			return;
		}
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

	private reconcileLeaves() {
		return this.options.registry.reconcile(
			(record, details) => this.handleScroll(record, details),
			record => this.handleViewChange(record),
		);
	}

	private handleViewChange(record: RegisteredLeaf<TLeaf, TView>): void {
		this.cancelRestore(record.leafId);
		this.reconcile();
		const current = this.options.registry.describe(record.leaf);
		this.applyModeHandoff(record, current);
		if (this.documentsMatch(this.activeRecord, current)) {
			this.activeRecord = current;
		}
	}

	private applyModeHandoff(
		previous: RegisteredLeaf<TLeaf, TView>,
		current: RegisteredLeaf<TLeaf, TView> | undefined,
	): void {
		if (!current
			|| previous.filePath !== current.filePath
			|| previous.viewKey === current.viewKey) return;

		const handoff = this.modeHandoffs.get(current.leafId);
		if (!handoff
			|| handoff.filePath !== current.filePath
			|| handoff.sourceViewKey !== previous.viewKey) return;

		const currentHeight = this.options.registry.readScroll(current);
		if (currentHeight === undefined || !Number.isFinite(currentHeight)) return;
		this.modeHandoffs.delete(current.leafId);
		if (Math.abs(currentHeight) <= 1) {
			this.options.registry.applyScroll(current, handoff.height);
			const appliedHeight = this.options.registry.readScroll(current);
			this.options.updateStatus(appliedHeight ?? handoff.height);
			return;
		}

		this.options.updateStatus(currentHeight);
	}

	private documentsMatch(
		left: RegisteredLeaf<TLeaf, TView> | undefined,
		right: RegisteredLeaf<TLeaf, TView> | undefined,
	): boolean {
		if (!left || !right) return left === right;
		return left.leafId === right.leafId
			&& left.filePath === right.filePath;
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
