import { LeafRegistry, RegisteredLeaf, ScrollEventDetails } from './leafRegistry';
import {
	AnchorSuppression,
	type AnchorNavigationRequest,
} from './anchorSuppression';
import { PositionStore } from '../storage/positionStore';
import { RestorationResult, RestorationScheduler } from './restorationScheduler';

export interface RestoreExpiryDetails {
	leafId: string;
	filePath: string;
	targetHeight: number;
	actualHeight?: number;
	attempts: number;
}

export interface ActivePosition {
	leafId: string;
	filePath: string;
	height: number;
}

export interface RestoreDelayDocument {
	filePath: string;
}

export interface RestoreDelayContext {
	source?: RestoreDelayDocument;
	target: RestoreDelayDocument;
}

export interface PositionCoordinatorOptions<TLeaf, TView> {
	registry: LeafRegistry<TLeaf, TView>;
	store: PositionStore;
	scheduler: RestorationScheduler;
	anchorSuppression: AnchorSuppression;
	maxAttempts: () => number;
	restoreIntervalMs?: () => number;
	debounceMs: () => number;
	resolveRestoreDelayMs: (
		context: RestoreDelayContext,
	) => number | Promise<number>;
	replayAnchorNavigation: (
		request: AnchorNavigationRequest,
	) => void | Promise<void>;
	now?: () => number;
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

interface ProgrammaticJump<TLeaf, TView> {
	record: RegisteredLeaf<TLeaf, TView>;
	targetHeight: number;
	timer: TimerHandle;
}

interface PendingAnchorReplay<TLeaf, TView> {
	record: RegisteredLeaf<TLeaf, TView>;
	request: AnchorNavigationRequest;
	timer?: TimerHandle;
}

export class PositionCoordinator<TLeaf, TView> {
	private activeRecord?: RegisteredLeaf<TLeaf, TView>;
	private readonly pendingSaves = new Map<string, PendingSave<TLeaf, TView>>();
	private readonly restoreTimers = new Map<string, TimerHandle>();
	private readonly restorationRuns = new Map<string, number>();
	private readonly restoring = new Set<string>();
	private readonly modeHandoffs = new Map<string, ModeHandoff>();
	private readonly programmaticJumps = new Map<string, ProgrammaticJump<TLeaf, TView>>();
	private readonly pendingAnchorReplays = new Map<string, PendingAnchorReplay<TLeaf, TView>>();
	private persistQueue: Promise<void> = Promise.resolve();
	private disposed = false;

	constructor(private readonly options: PositionCoordinatorOptions<TLeaf, TView>) {}

	start(activeLeaf: TLeaf | null): void {
		this.reconcileLeaves();
		this.handleActiveLeafChange(activeLeaf);
	}

	getActivePosition(): ActivePosition | undefined {
		const record = this.getCurrentActiveRecord();
		if (!record) return undefined;

		const height = this.options.registry.readScroll(record);
		if (height === undefined || !Number.isFinite(height) || height < 0) return undefined;
		return {
			leafId: record.leafId,
			filePath: record.filePath,
			height,
		};
	}

	scrollActiveTo(filePath: string, height: number): boolean {
		if (typeof filePath !== 'string'
			|| filePath.trim().length === 0
			|| filePath.includes('\0')
			|| !Number.isFinite(height)
			|| height < 0) return false;

		const record = this.getCurrentActiveRecord();
		if (!record || record.filePath !== filePath) return false;

		this.cancelRestore(record.leafId);
		this.modeHandoffs.delete(record.leafId);
		this.armProgrammaticJump(record, height);
		this.options.registry.applyScroll(record, height);
		const appliedHeight = this.options.registry.readScroll(record);
		this.options.updateStatus(appliedHeight ?? height);
		return true;
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
		if (previousRecord) this.cancelAnchorReplay(previousRecord.leafId);
		if (previousRecord) this.flushPendingSave(previousRecord.leafId);
		this.reconcileLeaves();
		this.activeRecord = this.options.registry.describe(leaf);
		if (this.activeRecord) {
			const source = previousRecord?.leafId === this.activeRecord.leafId
				? previousRecord
				: undefined;
			this.scheduleRestore(this.activeRecord, true, source);
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
		const previousRecord = this.activeRecord;
		if (previousRecord) this.cancelAnchorReplay(previousRecord.leafId);
		if (previousRecord) {
			this.flushPendingSave(previousRecord.leafId);
		}
		this.activeRecord = record;
		const source = previousRecord?.leafId === record.leafId
			? previousRecord
			: undefined;
		this.scheduleRestore(record, true, source);
	}

	markAnchorNavigation(request: AnchorNavigationRequest): void {
		this.cancelAllAnchorReplays();
		this.options.anchorSuppression.mark(request);
	}

	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;

		for (const timer of this.restoreTimers.values()) globalThis.clearTimeout(timer);
		this.restoreTimers.clear();
		this.options.scheduler.cancelAll();
		this.modeHandoffs.clear();
		for (const jump of this.programmaticJumps.values()) globalThis.clearTimeout(jump.timer);
		this.programmaticJumps.clear();
		this.cancelAllAnchorReplays();

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
		if (this.consumeProgrammaticJump(record, details)) return;
		if (details.userInitiated) {
			this.modeHandoffs.delete(record.leafId);
			this.cancelAnchorReplay(record.leafId);
		}
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

	private getCurrentActiveRecord(): RegisteredLeaf<TLeaf, TView> | undefined {
		const active = this.activeRecord;
		if (!active) return undefined;

		const current = this.options.registry.describe(active.leaf);
		if (!current || current.leafId !== active.leafId || !this.options.registry.isCurrent(current)) {
			return undefined;
		}
		this.activeRecord = current;
		return current;
	}

	private armProgrammaticJump(record: RegisteredLeaf<TLeaf, TView>, targetHeight: number): void {
		this.clearProgrammaticJump(record.leafId);
		const timer = globalThis.setTimeout(() => {
			this.programmaticJumps.delete(record.leafId);
		}, 500);
		this.programmaticJumps.set(record.leafId, { record, targetHeight, timer });
	}

	private consumeProgrammaticJump(
		record: RegisteredLeaf<TLeaf, TView>,
		details: ScrollEventDetails,
	): boolean {
		const jump = this.programmaticJumps.get(record.leafId);
		if (!jump) return false;
		if (jump.record.filePath !== record.filePath) {
			this.clearProgrammaticJump(record.leafId);
			return false;
		}

		const currentHeight = this.options.registry.readScroll(record);
		if (currentHeight !== undefined
			&& Number.isFinite(currentHeight)
			&& Math.abs(currentHeight - jump.targetHeight) <= 1) {
			return true;
		}
		if (details.userInitiated) this.clearProgrammaticJump(record.leafId);
		return false;
	}

	private clearProgrammaticJump(leafId: string): void {
		const jump = this.programmaticJumps.get(leafId);
		if (!jump) return;
		globalThis.clearTimeout(jump.timer);
		this.programmaticJumps.delete(leafId);
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
		source?: RegisteredLeaf<TLeaf, TView>,
	): void {
		this.cancelRestore(record.leafId);
		this.modeHandoffs.delete(record.leafId);
		const anchorRequest = consumeSuppression
			? this.options.anchorSuppression.consume(record.filePath)
			: undefined;
		if (anchorRequest) {
			this.scheduleAnchorReplay(record, anchorRequest);
			return;
		}

		const saved = this.options.store.resolve(record.leafId, record.filePath);
		if (!saved) return;

		const run = (this.restorationRuns.get(record.leafId) ?? 0) + 1;
		this.restorationRuns.set(record.leafId, run);
		const requestedAt = this.options.now?.() ?? Date.now();
		void Promise.resolve()
			.then(() => this.options.resolveRestoreDelayMs({ source, target: record }))
			.catch(() => 0)
			.then(delayMs => {
				if (this.disposed
					|| this.restorationRuns.get(record.leafId) !== run
					|| !this.options.registry.isCurrent(record)) return;

				const selectedDelayMs = Number.isFinite(delayMs) ? Math.max(0, delayMs) : 0;
				const elapsedMs = (this.options.now?.() ?? Date.now()) - requestedAt;
				const remainingDelayMs = Math.max(0, selectedDelayMs - elapsedMs);
				const startRestore = () => this.startRestore(record, saved.height, run);
				if (remainingDelayMs <= 0) {
					startRestore();
					return;
				}

				const timer = globalThis.setTimeout(startRestore, remainingDelayMs);
				this.restoreTimers.set(record.leafId, timer);
			});
	}

	private scheduleAnchorReplay(
		record: RegisteredLeaf<TLeaf, TView>,
		request: AnchorNavigationRequest,
	): void {
		const pending: PendingAnchorReplay<TLeaf, TView> = { record, request };
		this.pendingAnchorReplays.set(record.leafId, pending);
		const requestedAt = this.options.now?.() ?? Date.now();

		void Promise.resolve()
			.then(() => this.options.resolveRestoreDelayMs({
				source: { filePath: request.sourcePath },
				target: record,
			}))
			.catch(() => 0)
			.then(delayMs => {
				if (!this.isAnchorReplayCurrent(pending)) return;

				const selectedDelayMs = Number.isFinite(delayMs) ? Math.max(0, delayMs) : 0;
				const elapsedMs = (this.options.now?.() ?? Date.now()) - requestedAt;
				const remainingDelayMs = Math.max(0, selectedDelayMs - elapsedMs);
				if (remainingDelayMs <= 0) {
					this.dispatchAnchorReplay(pending);
					return;
				}

				pending.timer = globalThis.setTimeout(() => {
					this.dispatchAnchorReplay(pending);
				}, remainingDelayMs);
			});
	}

	private dispatchAnchorReplay(pending: PendingAnchorReplay<TLeaf, TView>): void {
		if (!this.isAnchorReplayCurrent(pending)) return;
		this.pendingAnchorReplays.delete(pending.record.leafId);
		void Promise.resolve()
			.then(() => this.options.replayAnchorNavigation(pending.request))
			.catch(() => undefined);
	}

	private isAnchorReplayCurrent(pending: PendingAnchorReplay<TLeaf, TView>): boolean {
		return this.pendingAnchorReplays.get(pending.record.leafId) === pending
			&& this.options.registry.isCurrent(pending.record)
			&& this.documentsMatch(this.activeRecord, pending.record);
	}

	private cancelAnchorReplay(leafId: string): void {
		const pending = this.pendingAnchorReplays.get(leafId);
		if (!pending) return;
		if (pending.timer !== undefined) globalThis.clearTimeout(pending.timer);
		this.pendingAnchorReplays.delete(leafId);
	}

	private cancelAllAnchorReplays(): void {
		for (const leafId of this.pendingAnchorReplays.keys()) {
			this.cancelAnchorReplay(leafId);
		}
	}

	private startRestore(
		record: RegisteredLeaf<TLeaf, TView>,
		targetHeight: number,
		run: number,
	): void {
		if (this.disposed || this.restorationRuns.get(record.leafId) !== run) return;
		this.restoreTimers.delete(record.leafId);
		if (!this.options.registry.isCurrent(record)) return;
		if (this.disposed || this.restorationRuns.get(record.leafId) !== run) return;

		this.restoring.add(record.leafId);
		void this.options.scheduler.start(record.leafId, targetHeight, {
			isCurrent: () => this.options.registry.isCurrent(record),
			readScroll: () => this.options.registry.readScroll(record),
			applyScroll: height => this.options.registry.applyScroll(record, height),
		}, {
			maxAttempts: this.options.maxAttempts(),
			intervalMs: this.options.restoreIntervalMs?.() ?? 100,
		}).then(result => this.handleRestoreResult(record, targetHeight, result, run))
			.finally(() => {
				if (this.restorationRuns.get(record.leafId) === run) {
					this.restoring.delete(record.leafId);
				}
			});
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
		this.clearProgrammaticJump(leafId);
		this.cancelAnchorReplay(leafId);
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
