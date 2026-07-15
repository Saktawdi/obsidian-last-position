export interface ParsedSettingsData {
	data: Record<string, unknown>;
	shouldRepair: boolean;
}

function emptySettingsData(): ParsedSettingsData {
	return { data: {}, shouldRepair: true };
}

export function parseSettingsData(raw: string): ParsedSettingsData {
	const normalized = raw.replace(/^\uFEFF/, '').trim();
	if (!normalized) return emptySettingsData();

	try {
		const parsed: unknown = JSON.parse(normalized);
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			return emptySettingsData();
		}

		return {
			data: parsed as Record<string, unknown>,
			shouldRepair: false,
		};
	} catch {
		return emptySettingsData();
	}
}
