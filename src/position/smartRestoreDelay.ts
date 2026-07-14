const MIN_SMART_RESTORE_DELAY_MS = 300;
const MAX_SMART_RESTORE_DELAY_MS = 4000;

function normalizeCharacterCount(value: number): number {
	return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function calculateSmartRestoreDelay(
	targetCharacterCount: number,
	sourceCharacterCount = 0,
): number {
	const target = normalizeCharacterCount(targetCharacterCount);
	const source = normalizeCharacterCount(sourceCharacterCount);
	const calculated = Math.round(300 + target / 500 + source / 1250);
	return Math.min(
		MAX_SMART_RESTORE_DELAY_MS,
		Math.max(MIN_SMART_RESTORE_DELAY_MS, calculated),
	);
}
