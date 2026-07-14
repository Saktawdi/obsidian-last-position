export interface ScrollPositionRecord {
	height: number;
	lastAccessed: number;
}

export interface LeafPositionRecord extends ScrollPositionRecord {
	filePath: string;
}

export interface PositionBookmark {
	name: string;
	height: number;
	createdAt: number;
}

export interface PositionState {
	version: 2;
	files: Record<string, ScrollPositionRecord>;
	leaves: Record<string, LeafPositionRecord>;
	bookmarks: Record<string, PositionBookmark[]>;
}

export type LegacyPositionData = Record<string, number | Partial<ScrollPositionRecord>>;
