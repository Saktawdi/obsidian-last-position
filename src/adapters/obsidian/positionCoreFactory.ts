import { App, MarkdownView, TFile, WorkspaceLeaf } from 'obsidian';
import { AnchorSuppression } from '../../position/anchorSuppression';
import { LeafRegistry } from '../../obsidian/leafRegistry';
import { ObsidianLeafSource } from '../../obsidian/obsidianLeafSource';
import { PositionCoordinator, RestoreExpiryDetails } from '../../position/positionCoordinator';
import { RestorationScheduler } from '../../position/restorationScheduler';
import { PositionStore } from '../../storage/positionStore';
import { PositionCore } from '../../core/positionCore';
import { createRestoreDelayResolver } from '../../position/restoreDelayResolver';

export interface ObsidianPositionCoreOptions {
	app: App;
	store: PositionStore;
	maxAttempts: () => number;
	restoreIntervalMs: () => number;
	debounceMs: () => number;
	restoreDelayMs: () => number;
	enableSmartRestoreDelay: () => boolean;
	persist: () => Promise<void>;
	updateStatus: (height: number) => void;
	onRestoreExpired: (details: RestoreExpiryDetails) => void;
	onPersistError: (error: unknown) => void;
}

export type ObsidianPositionCore = PositionCore<
	WorkspaceLeaf,
	PositionCoordinator<WorkspaceLeaf, MarkdownView>
>;

export function createObsidianPositionCore(
	options: ObsidianPositionCoreOptions,
): ObsidianPositionCore {
	const source = new ObsidianLeafSource(options.app);
	const registry = new LeafRegistry(source);
	const scheduler = new RestorationScheduler();
	const anchorSuppression = new AnchorSuppression(
		Math.max(1500, options.restoreDelayMs() + 500),
	);
	const resolveRestoreDelayMs = createRestoreDelayResolver<WorkspaceLeaf, MarkdownView>({
		isSmartEnabled: options.enableSmartRestoreDelay,
		fixedDelayMs: options.restoreDelayMs,
		readCharacterCount: async filePath => {
			const file = options.app.vault.getAbstractFileByPath(filePath);
			if (!(file instanceof TFile)) return 0;
			return (await options.app.vault.cachedRead(file)).length;
		},
	});
	const coordinator = new PositionCoordinator({
		registry,
		store: options.store,
		scheduler,
		anchorSuppression,
		maxAttempts: options.maxAttempts,
		restoreIntervalMs: options.restoreIntervalMs,
		debounceMs: options.debounceMs,
		resolveRestoreDelayMs,
		persist: options.persist,
		updateStatus: options.updateStatus,
		onRestoreExpired: options.onRestoreExpired,
		onPersistError: options.onPersistError,
	});

	return new PositionCore(coordinator);
}
