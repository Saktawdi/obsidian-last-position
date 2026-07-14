export const STATUS_BAR_BOOKMARK_ACTIONS = {
	save: 'save-bookmark',
	openList: 'open-bookmark-list',
} as const;

export const STATUS_BAR_BOOKMARK_CLASS = 'last-position-status-bar';
export const STATUS_BAR_BOOKMARK_FLASH_CLASS = 'last-position-status-bar-flash';

export interface StatusBarBookmarkTooltipLabels {
	saveBookmark: string;
	openBookmarkList: string;
}

export type StatusBarBookmarkAction =
	typeof STATUS_BAR_BOOKMARK_ACTIONS[keyof typeof STATUS_BAR_BOOKMARK_ACTIONS];

export function getStatusBarBookmarkAction(
	event: { type: string },
): StatusBarBookmarkAction | undefined {
	if (event.type === 'click') return STATUS_BAR_BOOKMARK_ACTIONS.save;
	if (event.type === 'contextmenu') return STATUS_BAR_BOOKMARK_ACTIONS.openList;
	return undefined;
}

export function getStatusBarBookmarkTooltip(labels: StatusBarBookmarkTooltipLabels): string {
	return `${labels.saveBookmark}\n${labels.openBookmarkList}`;
}
