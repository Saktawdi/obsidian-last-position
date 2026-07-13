export interface ScrollPositionRecord {
	height: number;
	lastAccessed: number;
}

export interface LeafPositionRecord extends ScrollPositionRecord {
	filePath: string;
}

export interface PositionState {
	version: 2;
	files: Record<string, ScrollPositionRecord>;
	leaves: Record<string, LeafPositionRecord>;
}

export type LegacyPositionData = Record<string, number | Partial<ScrollPositionRecord>>;

export function emptyPositionState(): PositionState {
	return {
		version: 2,
		files: {},
		leaves: {},
	};
}

function isValidHeight(height: unknown): height is number {
	return typeof height === 'number' && Number.isFinite(height) && height >= 0;
}

function normalizeTimestamp(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0
		? value
		: fallback;
}

function cloneState(state: PositionState): PositionState {
	return {
		version: 2,
		files: Object.fromEntries(
			Object.entries(state.files).map(([path, record]) => [path, { ...record }]),
		),
		leaves: Object.fromEntries(
			Object.entries(state.leaves).map(([leafId, record]) => [leafId, { ...record }]),
		),
	};
}

function readVersionedState(value: unknown, now: number): PositionState | undefined {
	if (!value || typeof value !== 'object') return undefined;

	const candidate = value as Partial<PositionState>;
	if (candidate.version !== 2 || !candidate.files || !candidate.leaves) return undefined;

	const state = emptyPositionState();
	for (const [path, record] of Object.entries(candidate.files)) {
		if (!record || !isValidHeight(record.height)) continue;
		state.files[path] = {
			height: record.height,
			lastAccessed: normalizeTimestamp(record.lastAccessed, now),
		};
	}

	for (const [leafId, record] of Object.entries(candidate.leaves)) {
		if (!record || typeof record.filePath !== 'string' || !isValidHeight(record.height)) continue;
		state.leaves[leafId] = {
			filePath: record.filePath,
			height: record.height,
			lastAccessed: normalizeTimestamp(record.lastAccessed, now),
		};
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
		if (isValidHeight(value)) {
			migrated.files[path] = { height: value, lastAccessed: now };
			continue;
		}

		if (!value || typeof value !== 'object' || !isValidHeight(value.height)) continue;
		migrated.files[path] = {
			height: value.height,
			lastAccessed: normalizeTimestamp(value.lastAccessed, now),
		};
	}

	return migrated;
}

export class PositionStore {
	private state: PositionState;

	constructor(state: PositionState = emptyPositionState()) {
		this.state = cloneState(state);
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

	replaceFileRecords(legacy: unknown, now = Date.now()): void {
		this.state.files = migratePositionState(undefined, legacy, now).files;
	}

	deleteFile(filePath: string): boolean {
		let deleted = Object.prototype.hasOwnProperty.call(this.state.files, filePath);
		if (deleted) delete this.state.files[filePath];
		for (const [leafId, record] of Object.entries(this.state.leaves)) {
			if (record.filePath !== filePath) continue;
			delete this.state.leaves[leafId];
			deleted = true;
		}
		return deleted;
	}

	snapshot(): PositionState {
		return cloneState(this.state);
	}
}
