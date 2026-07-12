import { MarkdownView, Notice, Plugin, TFile } from 'obsidian';
import { TRANSLATIONS, getLanguage, getTranslation } from '.language/translations';
import { LeafRegistry } from './obsidian/leafRegistry';
import { ObsidianLeafSource } from './obsidian/obsidianLeafSource';
import { AnchorSuppression } from './position/anchorSuppression';
import { PositionCoordinator } from './position/positionCoordinator';
import { PositionStore, migratePositionState } from './position/positionStore';
import { RestorationScheduler } from './position/restorationScheduler';
import { SerializedTaskQueue } from './position/serializedTaskQueue';
import { AutoSaveScrollSettingsTab, DEFAULT_SETTINGS, LastPositionSettings } from './setting';

export default class LastPositionPlugin extends Plugin {
	settings: LastPositionSettings;
	statusBarItemEl: HTMLElement;
	positionStore: PositionStore;
	private coordinator?: PositionCoordinator<unknown, unknown>;
	private readonly persistenceQueue = new SerializedTaskQueue();

	async onload(): Promise<void> {
		await this.loadSettings();

		const lang = getLanguage();
		if (!TRANSLATIONS[lang]) {
			new Notice(`[Last-Position-Plugin]: Language "${lang}" is not supported. Falling back to English.`);
		}

		this.statusBarItemEl = this.addStatusBarItem();
		this.updateStatusBar(0);
		this.addSettingTab(new AutoSaveScrollSettingsTab(this.app, this));

		if (this.settings.enableAutoCleanup) this.cleanupOldData();
		this.app.workspace.onLayoutReady(() => this.initializeCoordinator());
	}

	async onunload(): Promise<void> {
		await this.coordinator?.dispose();
		await this.persistenceQueue.flush();
	}

	async loadSettings(): Promise<void> {
		const loadedData = (await this.loadData()) || {};
		const positionState = migratePositionState(
			loadedData.positionState,
			loadedData.scrollHeightData,
		);

		this.settings = {
			...DEFAULT_SETTINGS,
			...loadedData,
			positionState,
			scrollHeightData: new Map(Object.entries(positionState.files)),
		};
		this.positionStore = new PositionStore(positionState);
	}

	async saveSettings(): Promise<void> {
		await this.enqueuePositionPersistence(false);
	}

	async saveLegacyPositionSettings(): Promise<void> {
		await this.enqueuePositionPersistence(true);
	}

	async persistPositionState(): Promise<void> {
		await this.enqueuePositionPersistence(false);
	}

	flashStatusBar(): void {
		const originalColor = this.statusBarItemEl.style.color;
		this.statusBarItemEl.style.color = 'var(--text-success, #50fa7b)';
		globalThis.setTimeout(() => {
			this.statusBarItemEl.style.color = originalColor;
		}, 500);
	}

	cleanupOldData(): void {
		if (!this.settings.enableAutoCleanup) return;

		const cutoffTime = Date.now() - (this.settings.cleanupDays * 24 * 60 * 60 * 1000);
		let cleanedCount = 0;
		for (const [path, data] of this.settings.scrollHeightData.entries()) {
			if (data.lastAccessed && data.lastAccessed < cutoffTime) {
				this.settings.scrollHeightData.delete(path);
				cleanedCount++;
			}
		}

		if (cleanedCount > 0) {
			console.log(`[Last-Position-Plugin]: Cleaned up ${cleanedCount} old entries`);
			void this.saveLegacyPositionSettings();
		}
	}

	private initializeCoordinator(): void {
		const source = new ObsidianLeafSource(this.app);
		const registry = new LeafRegistry(source);
		const scheduler = new RestorationScheduler();
		const anchorSuppression = new AnchorSuppression(
			Math.max(1500, this.settings.restoreDelayMs + 500),
		);
		const t = getTranslation();

		const coordinator = new PositionCoordinator({
			registry,
			store: this.positionStore,
			scheduler,
			anchorSuppression,
			maxAttempts: () => this.settings.myRetryCount,
			debounceMs: () => this.settings.myInterval * 1000,
			restoreDelayMs: () => this.settings.restoreDelayMs,
			persist: () => this.persistPositionState(),
			updateStatus: height => this.updateStatusBar(height),
			onRestoreExpired: details => {
				console.warn('[Last-Position-Plugin]: Restore expired', details);
				new Notice(t.retryLimit);
			},
			onPersistError: error => {
				console.error('[Last-Position-Plugin]: Failed to save scroll positions', error);
			},
		});

		this.coordinator = coordinator as PositionCoordinator<unknown, unknown>;
		coordinator.start(this.app.workspace.activeLeaf);
		this.registerEvent(this.app.workspace.on('active-leaf-change', leaf => {
			coordinator.handleActiveLeafChange(leaf);
		}));
		this.registerEvent(this.app.workspace.on('file-open', () => {
			coordinator.handleFileOpen(this.app.workspace.activeLeaf);
		}));
		this.registerEvent(this.app.workspace.on('layout-change', () => {
			coordinator.reconcile(true);
		}));
		this.registerDomEvent(document, 'click', event => this.handleInternalLinkClick(event), true);
	}

	private handleInternalLinkClick(event: MouseEvent): void {
		if (!(event.target instanceof Element)) return;
		const link = event.target.closest('a.internal-link');
		const href = link?.getAttribute('data-href');
		if (!href) return;

		const hashIndex = href.indexOf('#');
		if (hashIndex < 0 || hashIndex === href.length - 1) return;

		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		const sourcePath = activeView?.file?.path ?? '';
		const linkPath = href.slice(0, hashIndex);
		const targetFile: TFile | null = linkPath
			? this.app.metadataCache.getFirstLinkpathDest(linkPath, sourcePath)
			: activeView?.file ?? null;
		if (targetFile) this.coordinator?.markAnchorNavigation(targetFile.path);
	}

	private updateStatusBar(height: number): void {
		const t = getTranslation();
		this.statusBarItemEl.setText(`${t.currentHeight}: ${height.toFixed(0)}`);
	}

	private enqueuePositionPersistence(syncLegacyMap: boolean): Promise<void> {
		return this.persistenceQueue.enqueue(async () => {
			if (syncLegacyMap) {
				this.positionStore.replaceFileRecords(
					Object.fromEntries(this.settings.scrollHeightData),
				);
			}

			const positionState = this.positionStore.snapshot();
			this.settings.positionState = positionState;
			this.settings.scrollHeightData = new Map(Object.entries(positionState.files));
			await this.saveData({
				...this.settings,
				positionState,
				scrollHeightData: positionState.files,
			});
		});
	}
}
