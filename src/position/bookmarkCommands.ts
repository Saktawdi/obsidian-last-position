import { PositionBookmark } from './positionStore';

export const BOOKMARK_COMMAND_IDS = {
	save: 'last-position-save-bookmark',
	select: 'last-position-select-bookmark',
	remove: 'last-position-remove-bookmark',
} as const;

export interface BookmarkCommandLabels {
	saveBookmarkCommand: string;
	selectBookmarkCommand: string;
	removeBookmarkCommand: string;
}

export function getBookmarkCommandNames(labels: BookmarkCommandLabels): {
	save: string;
	select: string;
	remove: string;
} {
	return {
		save: `Last Position: ${labels.saveBookmarkCommand}`,
		select: `Last Position: ${labels.selectBookmarkCommand}`,
		remove: `Last Position: ${labels.removeBookmarkCommand}`,
	};
}

export function filterBookmarkSuggestions(
	bookmarks: PositionBookmark[],
	query: string,
): PositionBookmark[] {
	const normalizedQuery = query.trim().toLocaleLowerCase();
	if (!normalizedQuery) return [...bookmarks];
	return bookmarks.filter(bookmark => bookmark.name.toLocaleLowerCase().includes(normalizedQuery));
}

export function formatBookmarkSavedNotice(
	template: string,
	bookmark: PositionBookmark,
): string {
	return template.replace('{name}', bookmark.name);
}
