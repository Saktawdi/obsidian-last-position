import { App, Modal, Setting, SuggestModal } from 'obsidian';
import { getTranslation } from '.language/translations';
import { filterBookmarkSuggestions } from '../commands/bookmarkCommandRules';
import type { PositionBookmark } from '../domain/positionTypes';

export class BookmarkNameModal extends Modal {
	private submitted = false;
	private inputEl?: HTMLInputElement;

	constructor(
		app: App,
		private readonly onSubmit: (name: string) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const t = getTranslation();
		this.setTitle(t.bookmarkNameTitle);
		this.contentEl.empty();

		this.inputEl = this.contentEl.createEl('input', {
			type: 'text',
			placeholder: t.bookmarkNamePlaceholder,
		});
		this.inputEl.addEventListener('keydown', event => {
			if (event.key !== 'Enter') return;
			event.preventDefault();
			this.submit();
		});

		new Setting(this.contentEl)
			.addButton(button => button
				.setButtonText(t.cancel)
				.onClick(() => this.close()))
			.addButton(button => button
				.setButtonText(t.confirmed)
				.setCta()
				.onClick(() => this.submit()));

		this.inputEl.focus();
	}

	onClose(): void {
		this.contentEl.empty();
		this.inputEl = undefined;
	}

	private submit(): void {
		if (this.submitted) return;
		const name = this.inputEl?.value.trim() ?? '';
		if (!name) return;
		this.submitted = true;
		this.onSubmit(name);
		this.close();
	}
}

export class BookmarkSuggestModal extends SuggestModal<PositionBookmark> {
	constructor(
		app: App,
		private readonly bookmarks: PositionBookmark[],
		private readonly onChoose: (bookmark: PositionBookmark) => void,
	) {
		super(app);
		this.limit = 100;
	}

	onOpen(): void {
		const t = getTranslation();
		this.setTitle(t.bookmarkListTitle);
		this.emptyStateText = t.noBookmarks;
		super.onOpen();
		this.setPlaceholder(t.bookmarkListPlaceholder);
	}

	getSuggestions(query: string): PositionBookmark[] {
		return filterBookmarkSuggestions(this.bookmarks, query);
	}

	renderSuggestion(bookmark: PositionBookmark, el: HTMLElement): void {
		el.createEl('div', { text: bookmark.name });
		el.createEl('small', { text: ` ${Math.round(bookmark.height)}` });
	}

	onChooseSuggestion(bookmark: PositionBookmark): void {
		this.onChoose(bookmark);
		this.close();
	}
}
