import { MarkdownView, Notice, Plugin, TFile } from 'obsidian';
import { TRANSLATIONS, getLanguage, getTranslation } from '.language/translations';
import { LeafRegistry } from './obsidian/leafRegistry';
import { ObsidianLeafSource } from './obsidian/obsidianLeafSource';
import { AnchorSuppression } from './position/anchorSuppression';
import { PositionCoordinator } from './position/positionCoordinator';
import { PositionStore, migratePositionState } from './position/positionStore';
import type { PositionState } from './position/positionStore';
import { RestorationScheduler } from './position/restorationScheduler';
import { SerializedTaskQueue } from './position/serializedTaskQueue';
import { ParsedSettingsData, parseSettingsData } from './position/settingsData';
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
		const { data: loadedData, shouldRepair } = await this.readSettingsData();
		const sanitizedLoadedData = { ...loadedData };
		const hadRemovedRestoreSettings = Object.prototype.hasOwnProperty.call(sanitizedLoadedData, 'restoreTimeoutMs')
			|| Object.prototype.hasOwnProperty.call(sanitizedLoadedData, 'enableDebugLogging');
		delete sanitizedLoadedData.restoreTimeoutMs;
		delete sanitizedLoadedData.enableDebugLogging;
		const positionState = migratePositionState(
			sanitizedLoadedData.positionState,
			sanitizedLoadedData.scrollHeightData,
		);

		this.settings = {
			...DEFAULT_SETTINGS,
			...sanitizedLoadedData,
			positionState,
			scrollHeightData: new Map(Object.entries(positionState.files)),
		};
		this.positionStore = new PositionStore(positionState);

		if (shouldRepair || hadRemovedRestoreSettings) {
			try {
				await this.persistPositionState();
			} catch (error) {
				console.error('[Last-Position-Plugin]: Failed to repair settings data', error);
			}
		}
	}

	async saveSettings(): Promise<void> {
		await this.enqueuePositionPersistence();
	}

	async importPositionState(imported: PositionState): Promise<void> {
		this.positionStore.merge(imported);
		await this.persistPositionState();
	}

	async persistPositionState(): Promise<void> {
		await this.enqueuePositionPersistence();
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
		for (const [path, data] of Object.entries(this.positionStore.snapshot().files)) {
			if (data.lastAccessed && data.lastAccessed < cutoffTime) {
				this.positionStore.deleteFile(path);
				cleanedCount++;
			}
		}

		if (cleanedCount > 0) {
			console.log(`[Last-Position-Plugin]: Cleaned up ${cleanedCount} old entries`);
			void this.persistPositionState();
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
			restoreIntervalMs: () => this.settings.restoreIntervalMs,
			debounceMs: () => this.settings.myInterval * 1000,
			restoreDelayMs: () => this.settings.restoreDelayMs,
			persist: () => this.persistPositionState(),
			updateStatus: height => this.updateStatusBar(height),
			onRestoreExpired: details => {
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
			coordinator.reconcile();
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

	private async readSettingsData(): Promise<ParsedSettingsData> {
		const pluginDirectory = this.manifest.dir
			?? `${this.app.vault.configDir}/plugins/${this.manifest.id}`;
		const dataPath = `${pluginDirectory}/data.json`;

		try {
			const parsed = parseSettingsData(await this.app.vault.adapter.read(dataPath));
			if (parsed.shouldRepair) {
				console.warn(`[Last-Position-Plugin]: Invalid settings JSON at ${dataPath}; resetting it.`);
			}
			return parsed;
		} catch {
			return { data: {}, shouldRepair: false };
		}
	}

	private enqueuePositionPersistence(): Promise<void> {
		return this.persistenceQueue.enqueue(async () => {
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
