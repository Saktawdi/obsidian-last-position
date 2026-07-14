import {
	mergePositionStates,
} from './positionStore';
import type {
	PositionBookmark,
	PositionState,
	ScrollPositionRecord,
} from '../domain/positionTypes';

export const POSITION_EXPORT_FORMAT = 'obsidian-last-position';
export const POSITION_EXPORT_VERSION = 2;

export type PositionImportSource = 'version-2' | 'legacy-array' | 'legacy-map';

export interface PositionImportResult {
	state: PositionState;
	source: PositionImportSource;
	recordCount: number;
}

export { mergePositionStates };

class PositionImportError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PositionImportError';
	}
}

type UnknownRecord = Record<string, unknown>;

function setOwn<T>(target: Record<string, T>, key: string, value: T): void {
	Object.defineProperty(target, key, {
		configurable: true,
		enumerable: true,
		value,
		writable: true,
	});
}

function asRecord(value: unknown): UnknownRecord | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
	return value as UnknownRecord;
}

function validatePath(value: unknown, label: string): string {
	if (typeof value !== 'string' || value.trim().length === 0 || value.includes('\0')) {
		throw new PositionImportError(`Invalid ${label} path`);
	}
	return value;
}

function validateHeight(value: unknown, label: string): number {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
		throw new PositionImportError(`Invalid ${label} height`);
	}
	return value;
}

function validateTimestamp(value: unknown, fallback: number, label: string): number {
	if (value === undefined) return fallback;
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
		throw new PositionImportError(`Invalid ${label} timestamp`);
	}
	return value;
}

function validateRequiredTimestamp(value: unknown, label: string): number {
	if (value === undefined) throw new PositionImportError(`Invalid ${label} timestamp`);
	return validateTimestamp(value, 0, label);
}

function parsePositionRecord(value: unknown, now: number, label: string): ScrollPositionRecord {
	const record = asRecord(value);
	if (!record) throw new PositionImportError(`Invalid ${label} record`);

	return {
		height: validateHeight(record.height, label),
		lastAccessed: validateTimestamp(record.lastAccessed, now, label),
	};
}

function parseBookmarkRecord(value: unknown, label: string): PositionBookmark {
	const record = asRecord(value);
	if (!record) throw new PositionImportError(`Invalid ${label} record`);

	if (typeof record.name !== 'string'
		|| record.name.trim().length === 0
		|| record.name.includes('\0')) {
		throw new PositionImportError(`Invalid ${label} name`);
	}

	return {
		name: record.name.trim(),
		height: validateHeight(record.height, label),
		createdAt: validateRequiredTimestamp(record.createdAt, label),
	};
}

function parseVersionedState(value: UnknownRecord, now: number): PositionImportResult {
	if (value.version !== POSITION_EXPORT_VERSION) {
		throw new PositionImportError(`Unsupported position export version: ${String(value.version)}`);
	}
	if (value.format !== undefined && value.format !== POSITION_EXPORT_FORMAT) {
		throw new PositionImportError('Invalid position export format');
	}

	const files = asRecord(value.files);
	if (!files) throw new PositionImportError('Invalid position export files');
	const leaves = asRecord(value.leaves);
	if (!leaves) throw new PositionImportError('Invalid position export leaves');
	const bookmarksValue = value.bookmarks;
	if (bookmarksValue !== undefined && !asRecord(bookmarksValue)) {
		throw new PositionImportError('Invalid position export bookmarks');
	}
	const bookmarks = asRecord(bookmarksValue) ?? {};

	const state: PositionState = {
		version: POSITION_EXPORT_VERSION,
		files: {},
		leaves: {},
		bookmarks: {},
	};

	for (const [path, record] of Object.entries(files)) {
		const validPath = validatePath(path, 'file');
		setOwn(state.files, validPath, parsePositionRecord(record, now, `file ${validPath}`));
	}

	for (const [leafId, value] of Object.entries(leaves)) {
		const validLeafId = validatePath(leafId, 'leaf');
		const record = asRecord(value);
		if (!record) throw new PositionImportError(`Invalid leaf ${validLeafId} record`);
		setOwn(state.leaves, validLeafId, {
			...parsePositionRecord(record, now, `leaf ${validLeafId}`),
			filePath: validatePath(record.filePath, `leaf ${validLeafId} file`),
		});
	}

	for (const [path, value] of Object.entries(bookmarks)) {
		const validPath = validatePath(path, 'bookmark file');
		if (!Array.isArray(value)) {
			throw new PositionImportError(`Invalid bookmarks for ${validPath}`);
		}
		const records = value.map((bookmark, index) =>
			parseBookmarkRecord(bookmark, `bookmark ${validPath} at index ${index}`));
		setOwn(state.bookmarks, validPath, records);
	}

	return {
		state,
		source: 'version-2',
		recordCount: Object.keys(state.files).length + Object.keys(state.leaves).length,
	};
}

function parseLegacyArray(value: unknown[], now: number): PositionImportResult {
	const state: PositionState = {
		version: POSITION_EXPORT_VERSION,
		files: {},
		leaves: {},
		bookmarks: {},
	};

	for (const [index, item] of value.entries()) {
		const record = asRecord(item);
		if (!record) throw new PositionImportError(`Invalid legacy record at index ${index}`);
		const path = validatePath(record.filename, `legacy record ${index}`);
		setOwn(state.files, path, parsePositionRecord(record, now, `legacy record ${index}`));
	}

	return {
		state,
		source: 'legacy-array',
		recordCount: Object.keys(state.files).length,
	};
}

function parseLegacyMap(legacyMap: UnknownRecord, now: number): PositionImportResult {
	const state: PositionState = {
		version: POSITION_EXPORT_VERSION,
		files: {},
		leaves: {},
		bookmarks: {},
	};

	for (const [path, value] of Object.entries(legacyMap)) {
		const validPath = validatePath(path, 'legacy file');
		if (typeof value === 'number') {
			setOwn(state.files, validPath, {
				height: validateHeight(value, `legacy file ${validPath}`),
				lastAccessed: now,
			});
			continue;
		}
		setOwn(state.files, validPath, parsePositionRecord(value, now, `legacy file ${validPath}`));
	}

	return {
		state,
		source: 'legacy-map',
		recordCount: Object.keys(state.files).length,
	};
}

export function serializePositionState(state: PositionState): string {
	return JSON.stringify({
		format: POSITION_EXPORT_FORMAT,
		version: POSITION_EXPORT_VERSION,
		files: state.files,
		leaves: state.leaves,
		bookmarks: state.bookmarks ?? {},
	}, null, 2);
}

export function parsePositionExport(raw: string, now = Date.now()): PositionImportResult {
	const normalized = raw.replace(/^\uFEFF/, '').trim();
	if (!normalized) throw new PositionImportError('Invalid JSON: empty input');

	let parsed: unknown;
	try {
		parsed = JSON.parse(normalized);
	} catch {
		throw new PositionImportError('Invalid JSON');
	}

	if (Array.isArray(parsed)) return parseLegacyArray(parsed, now);

	const object = asRecord(parsed);
	if (!object) throw new PositionImportError('Invalid position export root');
	if (object.version !== undefined || object.format !== undefined) {
		return parseVersionedState(object, now);
	}

	const legacyData = object.scrollHeightData;
	if (legacyData !== undefined) {
		const legacyMap = asRecord(legacyData);
		if (!legacyMap) throw new PositionImportError('Invalid legacy scrollHeightData');
		return parseLegacyMap(legacyMap, now);
	}

	return parseLegacyMap(object, now);
}
