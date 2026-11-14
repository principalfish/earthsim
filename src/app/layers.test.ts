import { describe, expect, it } from 'vitest';
import type { TemperatureResult } from '../core/index';
import { progressOf, temperatureOf } from '../core/testing/temperatureFixtures';
import { windResultOf } from '../core/testing/windFixtures';
import {
	createLayerStore,
	type LayerStatus,
	type LayerStore,
	MAX_CHANGES_TOLD_IN_A_ROUND,
	type SolvedWinds,
	type TemperatureLayer,
} from './layers';

/** For a store whose listeners never throw: there is nothing to report. */
const ignore = (): void => {};

/** A store with a listener that keeps every layer it is told of. */
const createWatched = (): {
	readonly store: LayerStore;
	readonly heard: TemperatureLayer[];
	readonly statuses: () => LayerStatus[];
} => {
	const store = createLayerStore(ignore);
	const heard: TemperatureLayer[] = [];
	store.addListener((layer) => heard.push(layer));
	return { store, heard, statuses: () => heard.map((layer) => layer.status) };
};

describe('createLayerStore', () => {
	it('starts empty, with no result and no progress', () => {
		expect(createLayerStore(ignore).temperature).toEqual({
			status: 'empty',
			result: null,
			progress: null,
		});
	});

	it('tells every listener of each change, in order, with the layer as it now is', () => {
		const store = createLayerStore(ignore);
		const calls: string[] = [];
		store.addListener((layer) => calls.push(`one ${layer.status}`));
		store.addListener((layer) => calls.push(`two ${layer.status}`));
		store.markCalculating();
		expect(calls).toEqual(['one calculating', 'two calculating']);
	});

	it('tells nobody of a call that changes nothing', () => {
		const { store, heard } = createWatched();
		store.clear();
		store.markOutOfDate();
		store.markFailed();
		store.setProgress(progressOf(1));
		expect(heard).toEqual([]);

		store.markCalculating();
		store.markCalculating();
		expect(heard).toHaveLength(1);
	});

	it('gives a new, unchangeable layer at each change', () => {
		const { store } = createWatched();
		const before = store.temperature;
		store.markCalculating();
		expect(store.temperature).not.toBe(before);
		expect(before.status).toBe('empty');
		expect(Object.isFrozen(store.temperature)).toBe(true);
	});

	it('makes the change, tells every listener and reports the error of one that throws, throwing nothing', () => {
		const reported: [unknown, LayerStatus][] = [];
		const store = createLayerStore((error) =>
			reported.push([error, store.temperature.status]),
		);
		const failure = new Error('could not draw');
		const heard: LayerStatus[] = [];
		store.addListener(() => {
			throw failure;
		});
		store.addListener((layer) => heard.push(layer.status));
		expect(() => store.markCalculating()).not.toThrow();
		expect(heard).toEqual(['calculating']);
		expect(store.temperature.status).toBe('calculating');
		// Reported once, with the layer already changed.
		expect(reported).toEqual([[failure, 'calculating']]);
	});

	it('reports the error of each of several listeners once, in order, after telling them all', () => {
		const reported: unknown[] = [];
		const store = createLayerStore((error) => reported.push(error));
		const first = new Error('first');
		const second = new Error('second');
		const heard: LayerStatus[] = [];
		store.addListener(() => {
			throw first;
		});
		store.addListener((layer) => heard.push(layer.status));
		store.addListener(() => {
			throw second;
		});
		store.addListener((layer) => heard.push(layer.status));
		expect(() => store.markCalculating()).not.toThrow();
		expect(heard).toEqual(['calculating', 'calculating']);
		expect(store.temperature.status).toBe('calculating');
		expect(reported).toEqual([first, second]);
	});

	it('lets nothing out when the reporter throws too, and still tells every listener', () => {
		let reports = 0;
		const store = createLayerStore(() => {
			reports++;
			throw new Error('the record of errors failed');
		});
		const heard: LayerStatus[] = [];
		store.addListener(() => {
			throw new Error('could not draw');
		});
		store.addListener((layer) => heard.push(layer.status));
		store.addListener(() => {
			throw new Error('could not draw either');
		});
		expect(() => store.markCalculating()).not.toThrow();
		expect(heard).toEqual(['calculating']);
		expect(reports).toBe(2);
		expect(store.temperature.status).toBe('calculating');
	});
});

describe('a listener that writes to the store', () => {
	/** A store calculating its first result, with nothing yet told. */
	const calculating = (reportError: (error: unknown) => void): LayerStore => {
		const store = createLayerStore(reportError);
		store.markCalculating();
		return store;
	};

	it('has its change told to every listener once, in order, after the change under way', () => {
		const store = calculating(ignore);
		const calls: string[] = [];
		store.addListener((layer) => {
			calls.push(`A ${layer.status}`);
			if (layer.status === 'current') {
				store.markOutOfDate();
				// The layer itself changes at once.
				calls.push(`A then sees ${store.temperature.status}`);
			}
		});
		store.addListener((layer) => {
			calls.push(`B ${layer.status}`);
		});
		store.setResult(temperatureOf(1), true);
		expect(calls).toEqual([
			'A current',
			'A then sees outOfDate',
			'B current',
			'A outOfDate',
			'B outOfDate',
		]);
		expect(store.temperature.status).toBe('outOfDate');
	});

	it('still has its change told, and its error reported once, when it throws after writing', () => {
		const reported: unknown[] = [];
		const store = calculating((error) => reported.push(error));
		const failure = new Error('could not draw');
		const calls: string[] = [];
		store.addListener((layer) => {
			calls.push(`A ${layer.status}`);
			if (layer.status === 'current') {
				store.markOutOfDate();
				throw failure;
			}
		});
		store.addListener((layer) => {
			calls.push(`B ${layer.status}`);
		});
		expect(() => store.setResult(temperatureOf(1), true)).not.toThrow();
		expect(calls).toEqual([
			'A current',
			'B current',
			'A outOfDate',
			'B outOfDate',
		]);
		expect(reported).toEqual([failure]);
		expect(store.temperature.status).toBe('outOfDate');
	});

	it('does not tell a listener it adds of a change made before it was added', () => {
		const store = calculating(ignore);
		const late: LayerStatus[] = [];
		store.addListener((layer) => {
			if (layer.status === 'current') {
				store.markOutOfDate();
				store.addListener((told) => late.push(told.status));
			}
		});
		store.setResult(temperatureOf(1), true);
		expect(late).toEqual([]);
		store.markFailed();
		store.markCalculating();
		expect(late).toEqual(['calculating']);
	});

	it('is stopped, with one error reported, when listeners go on undoing each other', () => {
		const reported: unknown[] = [];
		const store = calculating((error) => reported.push(error));
		const result = temperatureOf(1);
		let told = 0;
		store.addListener((layer) => {
			told++;
			if (layer.status === 'current') {
				store.markOutOfDate();
			}
		});
		store.addListener((layer) => {
			if (layer.status === 'outOfDate') {
				store.setResult(result, true);
			}
		});
		store.setResult(result, true);
		expect(told).toBe(MAX_CHANGES_TOLD_IN_A_ROUND);
		expect(reported).toHaveLength(1);
		expect(reported[0]).toBeInstanceOf(Error);
		expect((reported[0] as Error).message).toContain(
			`${MAX_CHANGES_TOLD_IN_A_ROUND} changes`,
		);

		// The store still works: the next change is told as usual, and the
		// changes that were dropped are not.
		const before = told;
		store.clear();
		expect(told).toBe(before + 1);
		expect(store.temperature.status).toBe('empty');
	});
});

describe('a calculation', () => {
	it('keeps the latest progress while calculating, and drops it with the result', () => {
		const { store } = createWatched();
		store.markCalculating();
		store.setProgress(progressOf(1));
		store.setProgress(progressOf(2));
		expect(store.temperature.progress).toEqual(progressOf(2));

		const result = temperatureOf(2);
		store.setResult(result, true);
		expect(store.temperature).toEqual({
			status: 'current',
			result,
			progress: null,
		});
		expect(store.temperature.result).toBe(result);
	});

	it('keeps the previous result on hand while the next is calculated', () => {
		const { store } = createWatched();
		const first = temperatureOf(1);
		store.setResult(first, true);
		store.markCalculating();
		expect(store.temperature.status).toBe('calculating');
		expect(store.temperature.result).toBe(first);

		// Told apart from calculating with nothing to show.
		const fresh = createLayerStore(ignore);
		fresh.markCalculating();
		expect(fresh.temperature).toMatchObject({
			status: 'calculating',
			result: null,
		});
	});

	it('starts each calculation with no progress', () => {
		const { store } = createWatched();
		store.markCalculating();
		store.setProgress(progressOf(3));
		store.markCalculating();
		expect(store.temperature.progress).toBeNull();
	});

	it('keeps a result that was overtaken by a change as out of date', () => {
		const { store } = createWatched();
		store.markCalculating();
		const result = temperatureOf(4);
		store.setResult(result, false);
		expect(store.temperature).toEqual({
			status: 'outOfDate',
			result,
			progress: null,
		});
	});

	it('ignores progress unless calculating', () => {
		const { store } = createWatched();
		store.setResult(temperatureOf(1), true);
		store.setProgress(progressOf(1));
		expect(store.temperature.progress).toBeNull();
	});
});

describe('a change of the world', () => {
	it('marks a current result out of date and keeps it', () => {
		const { store, statuses } = createWatched();
		const result = temperatureOf(1);
		store.setResult(result, true);
		store.markOutOfDate();
		expect(store.temperature).toMatchObject({ status: 'outOfDate', result });
		expect(statuses()).toEqual(['current', 'outOfDate']);
	});

	it('leaves a calculation under way as it is', () => {
		const { store } = createWatched();
		store.markCalculating();
		store.setProgress(progressOf(1));
		store.markOutOfDate();
		expect(store.temperature).toMatchObject({
			status: 'calculating',
			progress: progressOf(1),
		});
	});
});

describe('a replacement of the world', () => {
	it('drops the result and leaves the layer empty, then calculating once asked', () => {
		const { store, statuses } = createWatched();
		store.setResult(temperatureOf(1), true);
		store.markCalculating();
		store.setProgress(progressOf(1));

		store.clear();
		expect(store.temperature).toEqual({
			status: 'empty',
			result: null,
			progress: null,
		});
		store.markCalculating();
		expect(store.temperature).toEqual({
			status: 'calculating',
			result: null,
			progress: null,
		});
		expect(statuses()).toEqual([
			'current',
			'calculating',
			'calculating',
			'empty',
			'calculating',
		]);
	});
});

describe('a failed request', () => {
	it('marks the result out of date and keeps every field of it', () => {
		const { store } = createWatched();
		const result = temperatureOf(5);
		const months = result.months.slice();
		store.setResult(result, true);
		store.markCalculating();
		store.setProgress(progressOf(2));

		store.markFailed();
		expect(store.temperature).toEqual({
			status: 'outOfDate',
			result,
			progress: null,
		});
		expect(store.temperature.result).toBe(result);
		expect(store.temperature.result?.months).toEqual(months);
		expect(store.temperature.result?.state).toBe(result.state);
	});

	it('leaves the layer empty when there was no result', () => {
		const { store } = createWatched();
		store.markCalculating();
		store.markFailed();
		expect(store.temperature).toEqual({
			status: 'empty',
			result: null,
			progress: null,
		});
	});
});

describe('unavailability', () => {
	it('is for good, keeping the result until it is cleared', () => {
		const { store } = createWatched();
		const result = temperatureOf(1);
		store.setResult(result, true);
		store.markCalculating();
		store.setProgress(progressOf(1));

		store.markUnavailable();
		expect(store.temperature).toEqual({
			status: 'unavailable',
			result,
			progress: null,
		});

		store.markCalculating();
		store.markFailed();
		store.markOutOfDate();
		expect(store.temperature.status).toBe('unavailable');
		const late = temperatureOf(2);
		store.setResult(late, true);
		expect(store.temperature).toMatchObject({
			status: 'unavailable',
			result: late,
		});

		store.clear();
		expect(store.temperature).toEqual({
			status: 'unavailable',
			result: null,
			progress: null,
		});
	});
});

/** Winds worked out from a temperature result, told apart by their value. */
const windsFrom = (
	temperature: TemperatureResult,
	value = 1,
	dayLengthHours = 24,
): SolvedWinds => ({
	winds: windResultOf(value),
	temperature,
	dayLengthHours,
});

describe('the winds', () => {
	it('start empty, with no result, beside an empty temperature', () => {
		expect(createLayerStore(ignore).winds).toEqual({
			status: 'empty',
			result: null,
		});
	});

	it('follow the temperature through calculating, current and out of date', () => {
		const { store, statuses } = createWatched();
		const temperature = temperatureOf(1);
		store.setResult(temperature, true);
		const first = windsFrom(temperature, 1);

		store.markWindsCalculating();
		expect(store.winds).toEqual({ status: 'calculating', result: null });
		store.setWindsResult(first, true);
		expect(store.winds).toEqual({ status: 'current', result: first });

		// A change of the world puts both out of date, in one change.
		store.markOutOfDate();
		expect(store.temperature.status).toBe('outOfDate');
		expect(store.winds).toEqual({ status: 'outOfDate', result: first });

		// The winds on hand stay while the next are calculated.
		store.markWindsCalculating();
		expect(store.winds).toEqual({ status: 'calculating', result: first });
		const second = windsFrom(temperature, 2);
		store.setWindsResult(second, false);
		expect(store.winds).toEqual({ status: 'outOfDate', result: second });

		expect(statuses()).toEqual([
			'current',
			'current',
			'current',
			'outOfDate',
			'outOfDate',
			'outOfDate',
		]);
	});

	it('tell every listener of each change of theirs, with the temperature layer as it stands', () => {
		const { store, heard } = createWatched();
		const before = store.winds;
		store.markWindsCalculating();
		store.markWindsCalculating();
		expect(heard).toEqual([store.temperature]);
		expect(heard[0]).toBe(store.temperature);
		expect(store.winds).not.toBe(before);
		expect(Object.isFrozen(store.winds)).toBe(true);
	});

	it('alone go out of date for a change of the day length', () => {
		const { store } = createWatched();
		const temperature = temperatureOf(1);
		store.setResult(temperature, true);
		const winds = windsFrom(temperature);
		store.setWindsResult(winds, true);

		store.markWindsOutOfDate();
		expect(store.winds).toEqual({ status: 'outOfDate', result: winds });
		expect(store.temperature.status).toBe('current');
	});

	it('leave a calculation under way as it is when the world changes', () => {
		const { store } = createWatched();
		store.markWindsCalculating();
		store.markOutOfDate();
		store.markWindsOutOfDate();
		expect(store.winds.status).toBe('calculating');
	});

	it('are dropped with the temperature when the world is replaced', () => {
		const { store } = createWatched();
		const temperature = temperatureOf(1);
		store.setResult(temperature, true);
		store.setWindsResult(windsFrom(temperature), true);

		store.clear();
		expect(store.winds).toEqual({ status: 'empty', result: null });
		expect(store.temperature.status).toBe('empty');
	});

	it('keep their result, out of date, when a request fails, and are empty with none', () => {
		const { store } = createWatched();
		store.markWindsCalculating();
		store.markWindsFailed();
		expect(store.winds).toEqual({ status: 'empty', result: null });

		const winds = windsFrom(temperatureOf(1));
		store.setWindsResult(winds, true);
		store.markWindsCalculating();
		store.markWindsFailed();
		expect(store.winds).toEqual({ status: 'outOfDate', result: winds });
	});

	it('are unavailable for good on their own, keeping their result until cleared, and leave the temperature be', () => {
		const { store } = createWatched();
		const winds = windsFrom(temperatureOf(1));
		store.setWindsResult(winds, true);

		store.markWindsUnavailable();
		expect(store.winds).toEqual({ status: 'unavailable', result: winds });
		store.markWindsCalculating();
		store.markWindsFailed();
		store.markOutOfDate();
		store.markWindsOutOfDate();
		expect(store.winds.status).toBe('unavailable');
		const late = windsFrom(temperatureOf(2), 2);
		store.setWindsResult(late, true);
		expect(store.winds).toEqual({ status: 'unavailable', result: late });
		store.clear();
		expect(store.winds).toEqual({ status: 'unavailable', result: null });

		store.markCalculating();
		expect(store.temperature.status).toBe('calculating');
	});

	it('are still worked out while the unavailable temperature is current', () => {
		const { store } = createWatched();
		const temperature = temperatureOf(1);
		store.setResult(temperature, true);
		const winds = windsFrom(temperature);
		store.setWindsResult(winds, true);

		store.markUnavailable();
		expect(store.winds).toEqual({ status: 'current', result: winds });
		expect(store.currentTemperature).toBe(temperature);
		store.markWindsOutOfDate();
		store.markWindsCalculating();
		expect(store.winds.status).toBe('calculating');
		const next = windsFrom(temperature, 2, 30);
		store.setWindsResult(next, true);
		expect(store.winds).toEqual({ status: 'current', result: next });
	});

	it('become unavailable once the temperature is unavailable with no current result', () => {
		const { store } = createWatched();
		const temperature = temperatureOf(1);
		store.setResult(temperature, true);
		const winds = windsFrom(temperature);
		store.setWindsResult(winds, true);
		store.markUnavailable();

		// A change of the world leaves no temperature to work them out from.
		store.markOutOfDate();
		expect(store.currentTemperature).toBeNull();
		expect(store.winds).toEqual({ status: 'unavailable', result: winds });
		store.markWindsCalculating();
		store.markWindsFailed();
		store.setWindsResult(windsFrom(temperature, 2), true);
		expect(store.winds.status).toBe('unavailable');
		store.clear();
		expect(store.winds).toEqual({ status: 'unavailable', result: null });
	});

	it('become unavailable at once when the temperature does with a result out of date, or none', () => {
		const outOfDate = createWatched().store;
		outOfDate.setResult(temperatureOf(1), false);
		outOfDate.markUnavailable();
		expect(outOfDate.winds.status).toBe('unavailable');

		const none = createWatched().store;
		none.markUnavailable();
		expect(none.winds).toEqual({ status: 'unavailable', result: null });
	});

	it('give the temperature result as current only while it describes the world', () => {
		const { store } = createWatched();
		const temperature = temperatureOf(1);
		expect(store.currentTemperature).toBeNull();
		store.setResult(temperature, false);
		expect(store.currentTemperature).toBeNull();
		store.setResult(temperature, true);
		expect(store.currentTemperature).toBe(temperature);
		store.markCalculating();
		expect(store.currentTemperature).toBeNull();
		store.setResult(temperature, true);
		store.markFailed();
		expect(store.currentTemperature).toBeNull();
		store.setResult(temperature, true);
		store.clear();
		expect(store.currentTemperature).toBeNull();
	});

	it('alone are dropped by clearWinds, the temperature left as it is', () => {
		const { store } = createWatched();
		const temperature = temperatureOf(1);
		store.setResult(temperature, true);
		store.setWindsResult(windsFrom(temperature), true);
		store.clearWinds();
		expect(store.winds).toEqual({ status: 'empty', result: null });
		expect(store.temperature).toMatchObject({
			status: 'current',
			result: temperature,
		});
		store.markWindsUnavailable();
		store.clearWinds();
		expect(store.winds).toEqual({ status: 'unavailable', result: null });
	});
});
