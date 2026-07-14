import { MarkdownView, Menu, Notice, Plugin, TFile, setTooltip } from 'obsidian';
import { TRANSLATIONS, getLanguage, getTranslation } from '.language/translations';
import { BookmarkNameModal, BookmarkSuggestModal } from './component/bookmarkModals';
import { ConfirmModal } from './component/confirmedModal';
import { LeafRegistry } from './obsidian/leafRegistry';
import { ObsidianLeafSource } from './obsidian/obsidianLeafSource';
import { AnchorSuppression } from './position/anchorSuppression';
import { PositionCoordinator } from './position/positionCoordinator';
import {
	BOOKMARK_COMMAND_IDS,
	formatBookmarkSavedNotice,
	getBookmarkCommandNames,
} from './position/bookmarkCommands';
import {
	getStatusBarBookmarkAction,
	getStatusBarBookmarkTooltip,
	STATUS_BAR_BOOKMARK_ACTIONS,
	STATUS_BAR_BOOKMARK_CLASS,
	STATUS_BAR_BOOKMARK_FLASH_CLASS,
} from './position/statusBarBookmarkActions';
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
		this.registerBookmarkCommands(coordinator);
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

	private registerBookmarkCommands(coordinator: PositionCoordinator<unknown, unknown>): void {
		const t = getTranslation();
		const names = getBookmarkCommandNames(t);

		this.addCommand({
			id: BOOKMARK_COMMAND_IDS.save,
			name: names.save,
			callback: () => this.openBookmarkSaveModal(coordinator),
		});

		this.addCommand({
			id: BOOKMARK_COMMAND_IDS.select,
			name: names.select,
			callback: () => {
				const position = coordinator.getActivePosition();
				if (!position) {
					new Notice(t.noActiveView);
					return;
				}

				const bookmarks = this.positionStore.listBookmarks(position.filePath);
				if (bookmarks.length === 0) {
					new Notice(t.noBookmarks);
					return;
				}

				new BookmarkSuggestModal(this.app, bookmarks, bookmark => {
					if (!coordinator.scrollActiveTo(position.filePath, bookmark.height)) {
						new Notice(t.bookmarkStale);
					}
				}).open();
			},
		});

		this.addCommand({
			id: BOOKMARK_COMMAND_IDS.remove,
			name: names.remove,
			callback: () => this.openBookmarkDeleteModal(coordinator),
		});
	}

	private registerStatusBarBookmarkActions(): void {
		this.registerDomEvent(this.statusBarItemEl, 'click', () => {
			if (!this.coordinator) return;
			if (getStatusBarBookmarkAction({ type: 'click' }) !== STATUS_BAR_BOOKMARK_ACTIONS.save) return;
			this.openBookmarkSaveModal(this.coordinator);
		});
		this.registerDomEvent(this.statusBarItemEl, 'contextmenu', event => {
			event.preventDefault();
			if (!this.coordinator) return;
			if (getStatusBarBookmarkAction({ type: 'contextmenu' })
				!== STATUS_BAR_BOOKMARK_ACTIONS.openList) return;
			this.openBookmarkMenu(this.coordinator, event);
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

	private openBookmarkSaveModal(coordinator: PositionCoordinator<unknown, unknown>): void {
		const t = getTranslation();
		const position = coordinator.getActivePosition();
		if (!position) {
			new Notice(t.noActiveView);
			return;
		}

		new BookmarkNameModal(this.app, name => {
			const bookmark = this.positionStore.saveBookmark(
				position.filePath,
				name,
				position.height,
			);
			if (!bookmark) return;

			void this.persistPositionState()
				.then(() => {
					new Notice(formatBookmarkSavedNotice(t.bookmarkSaved, bookmark));
					this.flashStatusBar();
				})
				.catch(error => {
					console.error('[Last-Position-Plugin]: Failed to save bookmark', error);
					new Notice(t.bookmarkSaveFailed);
				});
		}).open();
	}

	private openBookmarkMenu(
		coordinator: PositionCoordinator<unknown, unknown>,
		event: MouseEvent,
	): void {
		const t = getTranslation();
		const position = coordinator.getActivePosition();
		if (!position) {
			new Notice(t.noActiveView);
			return;
		}

		const bookmarks = this.positionStore.listBookmarks(position.filePath);
		if (bookmarks.length === 0) {
			new Notice(t.noBookmarks);
			return;
		}

		const menu = new Menu();
		for (const bookmark of bookmarks) {
			menu.addItem(item => item
				.setTitle(`${bookmark.name} (${Math.round(bookmark.height)})`)
				.onClick(() => {
					if (!coordinator.scrollActiveTo(position.filePath, bookmark.height)) {
						new Notice(t.bookmarkStale);
					}
				}));
		}
		menu.showAtMouseEvent(event);
	}

	private openBookmarkDeleteModal(coordinator: PositionCoordinator<unknown, unknown>): void {
		const t = getTranslation();
		const position = coordinator.getActivePosition();
		if (!position) {
			new Notice(t.noActiveView);
			return;
		}

		const bookmarks = this.positionStore.listBookmarks(position.filePath);
		if (bookmarks.length === 0) {
			new Notice(t.noBookmarks);
			return;
		}

		new BookmarkSuggestModal(this.app, bookmarks, bookmark => {
			const message = t.bookmarkDeleteConfirmMessage
				.replace('{name}', bookmark.name)
				.replace('{height}', Math.round(bookmark.height).toString());
			const confirmModal = new ConfirmModal(this.app, {
				title: t.bookmarkDeleteConfirmTitle,
				message,
			});

			void confirmModal.openAndAwait().then(async confirmed => {
				if (!confirmed) return;
				const current = coordinator.getActivePosition();
				if (!current || current.filePath !== position.filePath) {
					new Notice(t.bookmarkStale);
					return;
				}

				if (!this.positionStore.deleteBookmark(position.filePath, bookmark)) {
					new Notice(t.bookmarkStale);
					return;
				}

				try {
					await this.persistPositionState();
					new Notice(t.bookmarkDeleted.replace('{name}', bookmark.name));
					this.flashStatusBar();
				} catch (error) {
					console.error('[Last-Position-Plugin]: Failed to delete bookmark', error);
					new Notice(t.bookmarkDeleteFailed);
				}
			});
		}).open();
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
