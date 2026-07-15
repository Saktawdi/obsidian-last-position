import { MarkdownView, Notice, Plugin, TFile } from 'obsidian';
import { TRANSLATIONS, getLanguage, getTranslation } from '.language/translations';
import { PositionCoordinator } from './position/positionCoordinator';
import { PositionStore, migratePositionState } from './storage/positionStore';
import type { PositionState } from './domain/positionTypes';
import { PositionPersistenceService } from './storage/positionPersistence';
import {
	createObsidianPositionCore,
	ObsidianPositionCore,
} from './adapters/obsidian/positionCoreFactory';
import { BookmarkCommandController } from './commands/bookmarkCommands';
import { CommonCommandController } from './commands/commonCommands';
import { CommandRegistry } from './commands/commandRegistry';
import { StatusBarController } from './ui/statusBarController';
import { ParsedSettingsData, parseSettingsData } from './position/settingsData';
import { AutoSaveScrollSettingsTab } from './settings/settingsTab';
import { DEFAULT_SETTINGS } from './settings/settingsModel';
import type { LastPositionSettings } from './settings/settingsModel';

export default class LastPositionPlugin extends Plugin {
	settings: LastPositionSettings;
	statusBarItemEl: HTMLElement;
	positionStore: PositionStore;
	private coordinator?: PositionCoordinator<unknown, unknown>;
	private core?: ObsidianPositionCore;
	private persistence?: PositionPersistenceService;
	private commandRegistry?: CommandRegistry;
	private bookmarkCommands?: BookmarkCommandController;
	private commonCommands?: CommonCommandController;
	private statusBarController?: StatusBarController;

	async onload(): Promise<void> {
		await this.loadSettings();

		const lang = getLanguage();
		if (!TRANSLATIONS[lang]) {
			new Notice(`[Last-Position-Plugin]: Language "${lang}" is not supported. Falling back to English.`);
		}

		this.statusBarItemEl = this.addStatusBarItem();
		this.statusBarController = new StatusBarController(() => this.bookmarkCommands);
		this.statusBarController.mount(this.statusBarItemEl, (element, type, handler) => {
			if (type === 'click') this.registerDomEvent(element, 'click', handler);
			else this.registerDomEvent(element, 'contextmenu', handler);
		});
		this.updateStatusBar(0);
		this.addSettingTab(new AutoSaveScrollSettingsTab({
			app: this.app,
			plugin: this,
			settings: this.settings,
			positionStore: this.positionStore,
			saveSettings: () => this.saveSettings(),
			persistPositionState: () => this.persistPositionState(),
			importPositionState: state => this.importPositionState(state),
		}));

		if (this.settings.enableAutoCleanup) this.cleanupOldData();
		this.app.workspace.onLayoutReady(() => this.initializeCoordinator());
	}

	async onunload(): Promise<void> {
		this.statusBarController?.dispose();
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
		this.statusBarController?.flash();
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
			enableSmartRestoreDelay: () => this.settings.enableSmartRestoreDelay,
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
		const commandContext = {
			app: this.app,
			store: this.positionStore,
			getCoordinator: () => this.coordinator,
			persist: () => this.persistPositionState(),
			flashStatusBar: () => this.flashStatusBar(),
		};
		this.commonCommands = new CommonCommandController(commandContext);
		this.bookmarkCommands = new BookmarkCommandController(commandContext);
		this.commandRegistry = new CommandRegistry([
			this.commonCommands,
			this.bookmarkCommands,
		]);
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
		this.statusBarController?.setHeight(height);
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
