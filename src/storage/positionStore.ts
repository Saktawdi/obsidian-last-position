import type {
	LegacyPositionData,
	PositionBookmark,
	PositionState,
	ScrollPositionRecord,
} from '../domain/positionTypes';

export type {
	LeafPositionRecord,
	LegacyPositionData,
	PositionBookmark,
	PositionState,
	ScrollPositionRecord,
} from '../domain/positionTypes';

export function emptyPositionState(): PositionState {
	return {
		version: 2,
		files: {},
		leaves: {},
		bookmarks: {},
	};
}

function isValidHeight(height: unknown): height is number {
	return typeof height === 'number' && Number.isFinite(height) && height >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isValidPath(path: string): boolean {
	return path.trim().length > 0 && !path.includes('\0');
}

function setOwn<T>(target: Record<string, T>, key: string, value: T): void {
	Object.defineProperty(target, key, {
		configurable: true,
		enumerable: true,
		value,
		writable: true,
	});
}

function normalizeTimestamp(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0
		? value
		: fallback;
}

export function clonePositionState(state: PositionState): PositionState {
	return {
		version: 2,
		files: Object.fromEntries(
			Object.entries(state.files).map(([path, record]) => [path, { ...record }]),
		),
		leaves: Object.fromEntries(
			Object.entries(state.leaves).map(([leafId, record]) => [leafId, { ...record }]),
		),
		bookmarks: Object.fromEntries(
			Object.entries(state.bookmarks ?? {}).map(([path, bookmarks]) => [
				path,
				bookmarks.map(bookmark => ({ ...bookmark })),
			]),
		),
	};
}

function allocateBookmarkName(existing: Set<string>, requestedName: string): string {
	let name = requestedName;
	let suffix = 1;
	while (existing.has(name)) {
		name = `${requestedName} (${suffix++})`;
	}
	return name;
}

function mergeBookmarkRecords(
	current: Record<string, PositionBookmark[]>,
	incoming: Record<string, PositionBookmark[]>,
): Record<string, PositionBookmark[]> {
	const merged = Object.fromEntries(
		Object.entries(current).map(([path, bookmarks]) => [
			path,
			bookmarks.map(bookmark => ({ ...bookmark })),
		]),
	) as Record<string, PositionBookmark[]>;

	for (const [path, bookmarks] of Object.entries(incoming)) {
		const existing = merged[path] ?? [];
		const names = new Set(existing.map(bookmark => bookmark.name));
		for (const bookmark of bookmarks) {
			const name = allocateBookmarkName(names, bookmark.name);
			names.add(name);
			existing.push({ ...bookmark, name });
		}
		merged[path] = existing;
	}

	return merged;
}

export function mergePositionStates(current: PositionState, incoming: PositionState): PositionState {
	return {
		version: 2,
		files: {
			...current.files,
			...incoming.files,
		},
		leaves: {
			...current.leaves,
			...incoming.leaves,
		},
		bookmarks: mergeBookmarkRecords(current.bookmarks ?? {}, incoming.bookmarks ?? {}),
	};
}

function readVersionedState(value: unknown, now: number): PositionState | undefined {
	if (!value || typeof value !== 'object') return undefined;

	const candidate = value as Partial<PositionState>;
	if (candidate.version !== 2 || !isRecord(candidate.files) || !isRecord(candidate.leaves)) {
		return undefined;
	}

	const state = emptyPositionState();
	for (const [path, record] of Object.entries(candidate.files)) {
		if (!isValidPath(path) || !isRecord(record) || !isValidHeight(record.height)) continue;
		setOwn(state.files, path, {
			height: record.height,
			lastAccessed: normalizeTimestamp(record.lastAccessed, now),
		});
	}

	for (const [leafId, record] of Object.entries(candidate.leaves)) {
		if (!isValidPath(leafId)
			|| !isRecord(record)
			|| typeof record.filePath !== 'string'
			|| !isValidPath(record.filePath)
			|| !isValidHeight(record.height)) continue;
		setOwn(state.leaves, leafId, {
			filePath: record.filePath,
			height: record.height,
			lastAccessed: normalizeTimestamp(record.lastAccessed, now),
		});
	}

	if (isRecord(candidate.bookmarks)) {
		for (const [path, records] of Object.entries(candidate.bookmarks)) {
			if (!isValidPath(path) || !Array.isArray(records)) continue;
			const bookmarks: PositionBookmark[] = [];
			for (const value of records) {
				if (!isRecord(value)
					|| typeof value.name !== 'string'
					|| value.name.trim().length === 0
					|| !isValidHeight(value.height)
					|| typeof value.createdAt !== 'number'
					|| !Number.isFinite(value.createdAt)
					|| value.createdAt < 0) continue;
				const name = value.name.trim();
				if (bookmarks.some(bookmark => bookmark.name === name)) continue;
				bookmarks.push({ name, height: value.height, createdAt: value.createdAt });
			}
			if (bookmarks.length > 0) setOwn(state.bookmarks, path, bookmarks);
		}
	}

	return state;
}

export function migratePositionState(
	state: unknown,
	legacy: unknown,
	now = Date.now(),
): PositionState {
	const versioned = readVersionedState(state, now);
	if (versioned) return versioned;

	const migrated = emptyPositionState();
	if (!legacy || typeof legacy !== 'object') return migrated;

	for (const [path, value] of Object.entries(legacy as LegacyPositionData)) {
		if (!isValidPath(path)) continue;
		if (isValidHeight(value)) {
			setOwn(migrated.files, path, { height: value, lastAccessed: now });
			continue;
		}

		if (!isRecord(value) || !isValidHeight(value.height)) continue;
		setOwn(migrated.files, path, {
			height: value.height,
			lastAccessed: normalizeTimestamp(value.lastAccessed, now),
		});
	}

	return migrated;
}

export class PositionStore {
	private state: PositionState;

	constructor(state: PositionState = emptyPositionState()) {
		this.state = clonePositionState(state);
	}

	save(leafId: string, filePath: string, height: number, now = Date.now()): boolean {
		if (!leafId || !filePath || !isValidHeight(height)) return false;

		const record = { height, lastAccessed: now };
		this.state.leaves[leafId] = { ...record, filePath };
		this.state.files[filePath] = record;
		return true;
	}

	resolve(leafId: string, filePath: string): ScrollPositionRecord | undefined {
		const leafRecord = this.state.leaves[leafId];
		if (leafRecord?.filePath === filePath) return { ...leafRecord };

		const fileRecord = this.state.files[filePath];
		return fileRecord ? { ...fileRecord } : undefined;
	}

	saveBookmark(
		filePath: string,
		requestedName: string,
		height: number,
		now = Date.now(),
	): PositionBookmark | undefined {
		const name = requestedName.trim();
		if (!isValidPath(filePath)
			|| name.length === 0
			|| name.includes('\0')
			|| !isValidHeight(height)
			|| !Number.isFinite(now)
			|| now < 0) return undefined;

		const bookmarks = this.state.bookmarks[filePath] ?? [];
		const allocatedName = allocateBookmarkName(
			new Set(bookmarks.map(bookmark => bookmark.name)),
			name,
		);
		const bookmark = { name: allocatedName, height, createdAt: now };
		setOwn(this.state.bookmarks, filePath, [...bookmarks, bookmark]);
		return { ...bookmark };
	}

	listBookmarks(filePath: string): PositionBookmark[] {
		return (this.state.bookmarks[filePath] ?? [])
			.map(bookmark => ({ ...bookmark }))
			.sort((left, right) => left.createdAt - right.createdAt || left.name.localeCompare(right.name));
	}

	deleteBookmark(filePath: string, target: PositionBookmark): boolean {
		if (!isValidPath(filePath)) return false;
		const bookmarks = this.state.bookmarks[filePath];
		if (!bookmarks) return false;

		const index = bookmarks.findIndex(bookmark =>
			bookmark.name === target.name
			&& bookmark.height === target.height
			&& bookmark.createdAt === target.createdAt,
		);
		if (index < 0) return false;

		const remaining = bookmarks.filter((_, bookmarkIndex) => bookmarkIndex !== index);
		if (remaining.length === 0) {
			delete this.state.bookmarks[filePath];
		} else {
			setOwn(this.state.bookmarks, filePath, remaining);
		}
		return true;
	}

	merge(incoming: PositionState): void {
		this.state = mergePositionStates(this.state, incoming);
	}

	deleteFile(filePath: string): boolean {
		let deleted = Object.prototype.hasOwnProperty.call(this.state.files, filePath);
		if (deleted) delete this.state.files[filePath];
		if (Object.prototype.hasOwnProperty.call(this.state.bookmarks, filePath)) {
			delete this.state.bookmarks[filePath];
			deleted = true;
		}
		for (const [leafId, record] of Object.entries(this.state.leaves)) {
			if (record.filePath !== filePath) continue;
			delete this.state.leaves[leafId];
			deleted = true;
		}
		return deleted;
	}

	snapshot(): PositionState {
		return clonePositionState(this.state);
	}
}
