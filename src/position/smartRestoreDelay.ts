const MIN_SMART_RESTORE_DELAY_MS = 300;
const MAX_SMART_RESTORE_DELAY_MS = 2000;
const INCLUDED_CHARACTER_COUNT = 50_000;

function normalizeCharacterCount(value: number): number {
	return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function calculateSmartRestoreDelay(
	targetCharacterCount: number,
	sourceCharacterCount = 0,
): number {
	const target = normalizeCharacterCount(targetCharacterCount);
	const source = normalizeCharacterCount(sourceCharacterCount);
	const targetExtra = Math.max(0, target - INCLUDED_CHARACTER_COUNT) / 1000;
	const sourceExtra = Math.max(0, source - INCLUDED_CHARACTER_COUNT) / 2500;
	const calculated = Math.round(300 + targetExtra + sourceExtra);
	return Math.min(
		MAX_SMART_RESTORE_DELAY_MS,
		Math.max(MIN_SMART_RESTORE_DELAY_MS, calculated),
	);
}
