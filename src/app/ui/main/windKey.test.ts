import { describe, expect, it } from 'vitest';
import { temperatureOf } from '../../../core/testing/temperatureFixtures';
import { windResultOf } from '../../../core/testing/windFixtures';
import { createLayerStore, type WindsLayer } from '../../layers/layers';
import { LEGEND_EMPTY_TEXT, LEGEND_OUT_OF_DATE_TEXT } from './legend';
import {
	OBSERVED_WINDS_FAILED_TEXT,
	OBSERVED_WINDS_LOADING_TEXT,
	WINDS_CALCULATING_TEXT,
	WINDS_UNAVAILABLE_TEXT,
	windKeyContent,
} from './windKey';

describe('windKeyContent', () => {
	const layer = (status: WindsLayer['status']): WindsLayer => ({
		status,
		result: null,
	});

	it.each([
		['current', null],
		['outOfDate', LEGEND_OUT_OF_DATE_TEXT],
		['calculating', WINDS_CALCULATING_TEXT],
		['empty', LEGEND_EMPTY_TEXT],
		['unavailable', WINDS_UNAVAILABLE_TEXT],
	] as const)(
		'words the %s winds as the legend does, and gives their state',
		(status, words) => {
			expect(windKeyContent(layer(status))).toEqual({
				state: status,
				status: words,
			});
		},
	);

	it('follows the store’s winds through a calculation', () => {
		const store = createLayerStore(() => {});
		const said = (): string | null => windKeyContent(store.winds).status;
		expect(said()).toBe('Not calculated yet');
		store.markWindsCalculating();
		expect(said()).toBe('Calculating');
		store.setWindsResult(
			{
				winds: windResultOf(1),
				temperature: temperatureOf(1),
				dayLengthHours: 24,
			},
			true,
		);
		expect(said()).toBeNull();
		store.markWindsOutOfDate();
		expect(said()).toBe('Out of date');
		store.markWindsUnavailable();
		expect(said()).toBe('Winds unavailable');
	});
});

describe('the observed winds’ lines', () => {
	it('words the loading and the failure of the observed winds', () => {
		expect(OBSERVED_WINDS_LOADING_TEXT).toBe('Loading observed winds');
		expect(OBSERVED_WINDS_FAILED_TEXT).toBe(
			'Observed winds could not be loaded',
		);
	});
});
