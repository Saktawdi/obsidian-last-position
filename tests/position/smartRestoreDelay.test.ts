import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateSmartRestoreDelay } from '../../src/position/smartRestoreDelay';
import { DEFAULT_SETTINGS } from '../../src/settings/settingsModel';

test('calculates smart restore delays from target and source character counts', () => {
	assert.equal(calculateSmartRestoreDelay(0, 0), 300);
	assert.equal(calculateSmartRestoreDelay(10_000, 10_000), 328);
	assert.equal(calculateSmartRestoreDelay(500_000, 0), 1300);
	assert.equal(calculateSmartRestoreDelay(500_000, 500_000), 1700);
});

test('bounds smart restore delays and normalizes invalid counts', () => {
	assert.equal(calculateSmartRestoreDelay(5_000_000, 5_000_000), 4000);
	assert.equal(calculateSmartRestoreDelay(-100, Number.NaN), 300);
});

test('keeps smart restore delay disabled by default', () => {
	assert.equal(DEFAULT_SETTINGS.enableSmartRestoreDelay, false);
});
