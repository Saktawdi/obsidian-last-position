import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSettingsData } from '../../src/position/settingsData';

test('treats an empty settings file as repairable empty data', () => {
	assert.deepEqual(parseSettingsData(' \r\n\t'), {
		data: {},
		shouldRepair: true,
	});
});

test('preserves valid legacy settings for migration', () => {
	const parsed = parseSettingsData(JSON.stringify({
		myInterval: 3,
		scrollHeightData: { 'note.md': 42 },
	}));

	assert.equal(parsed.shouldRepair, false);
	assert.deepEqual(parsed.data.scrollHeightData, { 'note.md': 42 });
});

test('treats malformed JSON as repairable without throwing', () => {
	assert.deepEqual(parseSettingsData('{"scrollHeightData":'), {
		data: {},
		shouldRepair: true,
	});
});

test('does not accept non-object JSON as settings', () => {
	assert.deepEqual(parseSettingsData('null'), {
		data: {},
		shouldRepair: true,
	});
});
