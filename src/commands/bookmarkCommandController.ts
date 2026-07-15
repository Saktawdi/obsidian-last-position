import { Menu, Notice } from 'obsidian';
import { BookmarkNameModal, BookmarkSuggestModal } from '../ui/bookmarkModals';
import { ConfirmModal } from '../ui/confirmModal';
import {
	BOOKMARK_COMMAND_IDS,
	formatBookmarkSavedNotice,
	getBookmarkCommandNames,
} from './bookmarkCommandRules';
import type { CommandContext } from './commandContext';
import type { CommandModule, CommandRegistrar } from './commandRegistry';
import { getTranslation } from '.language/translations';

export class BookmarkCommandController implements CommandModule {
	constructor(private readonly context: CommandContext) {}

	register(registrar: CommandRegistrar): void {
		const names = getBookmarkCommandNames(getTranslation());
		registrar.addCommand({
			id: BOOKMARK_COMMAND_IDS.save,
			name: names.save,
			callback: () => this.saveBookmark(),
		});
		registrar.addCommand({
			id: BOOKMARK_COMMAND_IDS.select,
			name: names.select,
			callback: () => this.selectBookmark(),
		});
		registrar.addCommand({
			id: BOOKMARK_COMMAND_IDS.remove,
			name: names.remove,
			callback: () => this.removeBookmark(),
		});
	}

	saveBookmark(): void {
		const t = getTranslation();
		const position = this.context.getCoordinator()?.getActivePosition();
		if (!position) {
			new Notice(t.noActiveView);
			return;
		}

		new BookmarkNameModal(this.context.app, name => {
			const bookmark = this.context.store.saveBookmark(position.filePath, name, position.height);
			if (!bookmark) return;
			void this.context.persist()
				.then(() => {
					new Notice(formatBookmarkSavedNotice(t.bookmarkSaved, bookmark));
					this.context.flashStatusBar();
				})
				.catch(error => {
					console.error('[Last-Position-Plugin]: Failed to save bookmark', error);
					new Notice(t.bookmarkSaveFailed);
				});
		}).open();
	}

	selectBookmark(): void {
		const t = getTranslation();
		const coordinator = this.context.getCoordinator();
		const position = coordinator?.getActivePosition();
		if (!coordinator || !position) {
			new Notice(t.noActiveView);
			return;
		}

		const bookmarks = this.context.store.listBookmarks(position.filePath);
		if (bookmarks.length === 0) {
			new Notice(t.noBookmarks);
			return;
		}

		new BookmarkSuggestModal(this.context.app, bookmarks, bookmark => {
			if (!coordinator.scrollActiveTo(position.filePath, bookmark.height)) {
				new Notice(t.bookmarkStale);
			}
		}).open();
	}

	removeBookmark(): void {
		const t = getTranslation();
		const coordinator = this.context.getCoordinator();
		const position = coordinator?.getActivePosition();
		if (!coordinator || !position) {
			new Notice(t.noActiveView);
			return;
		}

		const bookmarks = this.context.store.listBookmarks(position.filePath);
		if (bookmarks.length === 0) {
			new Notice(t.noBookmarks);
			return;
		}

		new BookmarkSuggestModal(this.context.app, bookmarks, bookmark => {
			const message = t.bookmarkDeleteConfirmMessage
				.replace('{name}', bookmark.name)
				.replace('{height}', Math.round(bookmark.height).toString());
			const confirmModal = new ConfirmModal(this.context.app, {
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
				if (!this.context.store.deleteBookmark(position.filePath, bookmark)) {
					new Notice(t.bookmarkStale);
					return;
				}
				try {
					await this.context.persist();
					new Notice(t.bookmarkDeleted.replace('{name}', bookmark.name));
					this.context.flashStatusBar();
				} catch (error) {
					console.error('[Last-Position-Plugin]: Failed to delete bookmark', error);
					new Notice(t.bookmarkDeleteFailed);
				}
			});
		}).open();
	}

	openBookmarkMenu(event: MouseEvent): void {
		const t = getTranslation();
		const coordinator = this.context.getCoordinator();
		const position = coordinator?.getActivePosition();
		if (!coordinator || !position) {
			new Notice(t.noActiveView);
			return;
		}

		const bookmarks = this.context.store.listBookmarks(position.filePath);
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
}
