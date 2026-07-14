import { MarkdownView, Notice, Plugin, TFile, setTooltip } from 'obsidian';
import { TRANSLATIONS, getLanguage, getTranslation } from '.language/translations';
import { PositionCoordinator } from './position/positionCoordinator';
import {
	getStatusBarBookmarkAction,
	getStatusBarBookmarkTooltip,
	STATUS_BAR_BOOKMARK_ACTIONS,
	STATUS_BAR_BOOKMARK_CLASS,
	STATUS_BAR_BOOKMARK_FLASH_CLASS,
} from './position/statusBarBookmarkActions';
import { PositionStore, migratePositionState } from './storage/positionStore';
import type { PositionState } from './domain/positionTypes';
import { PositionPersistenceService } from './storage/positionPersistence';
import {
	createObsidianPositionCore,
	ObsidianPositionCore,
} from './adapters/obsidian/positionCoreFactory';
import { BookmarkCommandController } from './commands/bookmarkCommands';
import { CommandRegistry } from './commands/commandRegistry';
import { ParsedSettingsData, parseSettingsData } from './position/settingsData';
import { AutoSaveScrollSettingsTab, DEFAULT_SETTINGS, LastPositionSettings } from './setting';

export default class LastPositionPlugin extends Plugin {
	settings: LastPositionSettings;
	statusBarItemEl: HTMLElement;
	positionStore: PositionStore;
	private coordinator?: PositionCoordinator<unknown, unknown>;
	private core?: ObsidianPositionCore;
	private persistence?: PositionPersistenceService;
	private commandRegistry?: CommandRegistry;
	private bookmarkCommands?: BookmarkCommandController;
	private flashStatusTimer?: ReturnType<typeof globalThis.setTimeout>;

	async onload(): Promise<void> {
		await this.loadSettings();

		const lang = getLanguage();
		if (!TRANSLATIONS[lang]) {
			new Notice(`[Last-Position-Plugin]: Language "${lang}" is not supported. Falling back to English.`);
		}

		this.statusBarItemEl = this.addStatusBarItem();
		this.setupStatusBarBookmarkPresentation();
		this.updateStatusBar(0);
		this.registerStatusBarBookmarkActions();
		this.addSettingTab(new AutoSaveScrollSettingsTab(this.app, this));

		if (this.settings.enableAutoCleanup) this.cleanupOldData();
		this.app.workspace.onLayoutReady(() => this.initializeCoordinator());
	}

	async onunload(): Promise<void> {
		if (this.flashStatusTimer !== undefined) globalThis.clearTimeout(this.flashStatusTimer);
		await this.core?.dispose();
		await this.persistence?.flush();
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
		this.persistence = new PositionPersistenceService(this.positionStore, {
			getSettingsSnapshot: () => ({ ...this.settings }),
			setPositionState: nextState => {
				this.settings.positionState = nextState;
				this.settings.scrollHeightData = new Map(Object.entries(nextState.files));
			},
			saveData: data => this.saveData(data),
		});

		if (shouldRepair || hadRemovedRestoreSettings) {
			try {
				await this.persistPositionState();
			} catch (error) {
				console.error('[Last-Position-Plugin]: Failed to repair settings data', error);
			}
		}
	}

	async saveSettings(): Promise<void> {
		await this.persistPositionState();
	}

	async importPositionState(imported: PositionState): Promise<void> {
		await this.getPersistence().importState(imported);
	}

	async persistPositionState(): Promise<void> {
		await this.getPersistence().persist();
	}

	flashStatusBar(): void {
		this.statusBarItemEl.addClass(STATUS_BAR_BOOKMARK_FLASH_CLASS);
		if (this.flashStatusTimer !== undefined) globalThis.clearTimeout(this.flashStatusTimer);
		this.flashStatusTimer = globalThis.setTimeout(() => {
			this.statusBarItemEl.removeClass(STATUS_BAR_BOOKMARK_FLASH_CLASS);
			this.flashStatusTimer = undefined;
		}, 900);
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
		const t = getTranslation();
		const core = createObsidianPositionCore({
			app: this.app,
			store: this.positionStore,
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
		this.core = core;
		const coordinator = core.getCoordinator();
		this.coordinator = coordinator as PositionCoordinator<unknown, unknown>;
		this.bookmarkCommands = new BookmarkCommandController({
			app: this.app,
			store: this.positionStore,
			getCoordinator: () => this.coordinator,
			persist: () => this.persistPositionState(),
			flashStatusBar: () => this.flashStatusBar(),
		});
		this.commandRegistry = new CommandRegistry([this.bookmarkCommands]);
		this.commandRegistry.register(this);
		core.start(this.app.workspace.activeLeaf);
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

	private registerStatusBarBookmarkActions(): void {
		this.registerDomEvent(this.statusBarItemEl, 'click', () => {
			if (getStatusBarBookmarkAction({ type: 'click' }) !== STATUS_BAR_BOOKMARK_ACTIONS.save) return;
			this.bookmarkCommands?.saveBookmark();
		});
		this.registerDomEvent(this.statusBarItemEl, 'contextmenu', event => {
			event.preventDefault();
			if (getStatusBarBookmarkAction({ type: 'contextmenu' })
				!== STATUS_BAR_BOOKMARK_ACTIONS.openList) return;
			this.bookmarkCommands?.openBookmarkMenu(event);
		});
	}

	private setupStatusBarBookmarkPresentation(): void {
		const t = getTranslation();
		this.statusBarItemEl.addClass(STATUS_BAR_BOOKMARK_CLASS);
		setTooltip(this.statusBarItemEl, getStatusBarBookmarkTooltip({
			saveBookmark: t.statusBarSaveBookmarkHint,
			openBookmarkList: t.statusBarOpenBookmarkListHint,
		}), {
			placement: 'top',
			delay: 300,
		});
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

	private getPersistence(): PositionPersistenceService {
		if (!this.persistence) throw new Error('Position persistence is not initialized');
		return this.persistence;
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

}
