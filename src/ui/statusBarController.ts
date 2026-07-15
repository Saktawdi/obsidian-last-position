import { setTooltip } from 'obsidian';
import { getTranslation } from '.language/translations';
import type { BookmarkCommandController } from '../commands/bookmarkCommandController';
import {
	getStatusBarBookmarkAction,
	getStatusBarBookmarkTooltip,
	STATUS_BAR_BOOKMARK_ACTIONS,
	STATUS_BAR_BOOKMARK_CLASS,
	STATUS_BAR_BOOKMARK_FLASH_CLASS,
} from './statusBarBookmarkActions';

export type StatusBarEventRegistrar = (
	element: HTMLElement,
	type: 'click' | 'contextmenu',
	handler: (event: MouseEvent) => void,
) => void;

export class StatusBarController {
	private element?: HTMLElement;
	private flashTimer?: ReturnType<typeof globalThis.setTimeout>;

	constructor(private readonly getCommands: () => BookmarkCommandController | undefined) {}

	mount(element: HTMLElement, registerEvent: StatusBarEventRegistrar): void {
		this.element = element;
		const t = getTranslation();
		element.addClass(STATUS_BAR_BOOKMARK_CLASS);
		setTooltip(element, getStatusBarBookmarkTooltip({
			saveBookmark: t.statusBarSaveBookmarkHint,
			openBookmarkList: t.statusBarOpenBookmarkListHint,
		}), { placement: 'top', delay: 300 });

		registerEvent(element, 'click', () => {
			if (getStatusBarBookmarkAction({ type: 'click' }) === STATUS_BAR_BOOKMARK_ACTIONS.save) {
				this.getCommands()?.saveBookmark();
			}
		});
		registerEvent(element, 'contextmenu', event => {
			event.preventDefault();
			if (getStatusBarBookmarkAction({ type: 'contextmenu' })
				=== STATUS_BAR_BOOKMARK_ACTIONS.openList) {
				this.getCommands()?.openBookmarkMenu(event);
			}
		});
	}

	setHeight(height: number): void {
		this.element?.setText(`${getTranslation().currentHeight}: ${height.toFixed(0)}`);
	}

	flash(): void {
		if (!this.element) return;
		this.element.addClass(STATUS_BAR_BOOKMARK_FLASH_CLASS);
		if (this.flashTimer !== undefined) globalThis.clearTimeout(this.flashTimer);
		this.flashTimer = globalThis.setTimeout(() => {
			this.element?.removeClass(STATUS_BAR_BOOKMARK_FLASH_CLASS);
			this.flashTimer = undefined;
		}, 900);
	}

	dispose(): void {
		if (this.flashTimer !== undefined) globalThis.clearTimeout(this.flashTimer);
		this.element?.removeClass(STATUS_BAR_BOOKMARK_FLASH_CLASS);
		this.flashTimer = undefined;
		this.element = undefined;
	}
}
