export function snapshotLegacyPositionData<T>(
	entries: ReadonlyMap<string, T>,
): Record<string, T> {
	return Object.fromEntries(entries) as Record<string, T>;
}
