import { describe, expect, it } from 'vitest';
import type { TemperatureResult } from '../../core/index';
import {
	progressOf,
	temperatureOf,
} from '../../core/testing/temperatureFixtures';
import { windResultOf } from '../../core/testing/windFixtures';
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

/** Winds worked out with a temperature result, told apart by their value. */
const windsFrom = (
	temperature: TemperatureResult,
	value = 1,
	dayLengthHours = 24,
): SolvedWinds => ({
	winds: windResultOf(value),
	temperature,
	dayLengthHours,
});

/** A climate whose temperature is that result, with winds of its own. */
const climateWith = (result: TemperatureResult): SolvedWinds =>
	windsFrom(result);

describe('createLayerStore', () => {
	it('starts empty, with no result and no progress', () => {
		expect(createLayerStore(ignore).temperature).toEqual({
			status: 'empty',
			result: null,
			progress: null,
			pass: null,
		});
		expect(createLayerStore(ignore).winds).toEqual({
			status: 'empty',
			result: null,
		});
	});

	it('tells every listener of each change, in order, with the layer as it now is', () => {
		const store = createLayerStore(ignore);
		const calls: string[] = [];
		store.addListener((layer) => calls.push(`one ${layer.status}`));
		store.addListener((layer) => calls.push(`two ${layer.status}`));
		store.markClimateCalculating();
		expect(calls).toEqual(['one calculating', 'two calculating']);
	});

	it('tells nobody of a call that changes nothing', () => {
		const { store, heard } = createWatched();
		store.clear();
		store.markOutOfDate();
		store.markClimateStopped();
		store.setProgress(progressOf(1));
		expect(heard).toEqual([]);

		store.markClimateCalculating();
		store.markClimateCalculating();
		expect(heard).toHaveLength(1);
	});

	it('gives a new, unchangeable layer at each change', () => {
		const { store } = createWatched();
		const before = store.temperature;
		const winds = store.winds;
		store.markClimateCalculating();
		expect(store.temperature).not.toBe(before);
		expect(store.winds).not.toBe(winds);
		expect(before.status).toBe('empty');
		expect(Object.isFrozen(store.temperature)).toBe(true);
		expect(Object.isFrozen(store.winds)).toBe(true);
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
		expect(() => store.markClimateCalculating()).not.toThrow();
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
		expect(() => store.markClimateCalculating()).not.toThrow();
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
		expect(() => store.markClimateCalculating()).not.toThrow();
		expect(heard).toEqual(['calculating']);
		expect(reports).toBe(2);
		expect(store.temperature.status).toBe('calculating');
	});
});

describe('a listener that writes to the store', () => {
	/** A store calculating its first climate, with nothing yet told. */
	const calculating = (reportError: (error: unknown) => void): LayerStore => {
		const store = createLayerStore(reportError);
		store.markClimateCalculating();
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
		store.setClimateResult(climateWith(temperatureOf(1)), true);
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
		expect(() =>
			store.setClimateResult(climateWith(temperatureOf(1)), true),
		).not.toThrow();
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
		store.setClimateResult(climateWith(temperatureOf(1)), true);
		expect(late).toEqual([]);
		store.markClimateCalculating();
		expect(late).toEqual(['calculating']);
	});

	it('is stopped, with one error reported, when listeners go on undoing each other', () => {
		const reported: unknown[] = [];
		const store = calculating((error) => reported.push(error));
		const climate = climateWith(temperatureOf(1));
		let told = 0;
		store.addListener((layer) => {
			told++;
			if (layer.status === 'current') {
				store.markOutOfDate();
			}
		});
		store.addListener((layer) => {
			if (layer.status === 'outOfDate') {
				store.setClimateResult(climate, true);
			}
		});
		store.setClimateResult(climate, true);
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
		store.markClimateCalculating();
		store.setProgress(progressOf(1));
		store.setProgress(progressOf(2));
		expect(store.temperature.progress).toEqual(progressOf(2));

		const result = temperatureOf(2);
		store.setClimateResult(climateWith(result), true);
		expect(store.temperature).toEqual({
			status: 'current',
			result,
			progress: null,
			pass: null,
		});
		expect(store.temperature.result).toBe(result);
	});

	it('keeps the previous results on hand while the next are calculated', () => {
		const { store } = createWatched();
		const first = climateWith(temperatureOf(1));
		store.setClimateResult(first, true);
		store.markClimateCalculating();
		expect(store.temperature.status).toBe('calculating');
		expect(store.temperature.result).toBe(first.temperature);
		expect(store.winds).toEqual({ status: 'calculating', result: first });

		// Told apart from calculating with nothing to show.
		const fresh = createLayerStore(ignore);
		fresh.markClimateCalculating();
		expect(fresh.temperature).toMatchObject({
			status: 'calculating',
			result: null,
		});
		expect(fresh.winds).toEqual({ status: 'calculating', result: null });
	});

	it('starts each calculation with no progress', () => {
		const { store } = createWatched();
		store.markClimateCalculating();
		store.setProgress(progressOf(3));
		store.markClimateCalculating();
		expect(store.temperature.progress).toBeNull();
	});

	it('keeps a result that was overtaken by a change as out of date', () => {
		const { store } = createWatched();
		store.markClimateCalculating();
		const climate = climateWith(temperatureOf(4));
		store.setClimateResult(climate, false);
		expect(store.temperature).toEqual({
			status: 'outOfDate',
			result: climate.temperature,
			progress: null,
			pass: null,
		});
		expect(store.winds).toEqual({ status: 'outOfDate', result: climate });
	});

	it('ignores progress unless calculating', () => {
		const { store } = createWatched();
		store.setClimateResult(climateWith(temperatureOf(1)), true);
		store.setProgress(progressOf(1), 2);
		expect(store.temperature.progress).toBeNull();
		expect(store.temperature.pass).toBeNull();
	});
});

describe('a change of the world', () => {
	it('marks both current results out of date, in one change, and keeps them', () => {
		const { store, statuses } = createWatched();
		const climate = climateWith(temperatureOf(1));
		store.setClimateResult(climate, true);
		store.markOutOfDate();
		expect(store.temperature).toMatchObject({
			status: 'outOfDate',
			result: climate.temperature,
		});
		expect(store.winds).toEqual({ status: 'outOfDate', result: climate });
		expect(statuses()).toEqual(['current', 'outOfDate']);
	});

	it('leaves a calculation under way as it is', () => {
		const { store } = createWatched();
		store.markClimateCalculating();
		store.setProgress(progressOf(1));
		store.markOutOfDate();
		expect(store.temperature).toMatchObject({
			status: 'calculating',
			progress: progressOf(1),
		});
		expect(store.winds.status).toBe('calculating');
	});
});

describe('a replacement of the world', () => {
	it('drops both results and leaves the layers empty, then calculating once asked', () => {
		const { store, statuses } = createWatched();
		store.setClimateResult(climateWith(temperatureOf(1)), true);
		store.markClimateCalculating();
		store.setProgress(progressOf(1));

		store.clear();
		expect(store.temperature).toEqual({
			status: 'empty',
			result: null,
			progress: null,
			pass: null,
		});
		expect(store.winds).toEqual({ status: 'empty', result: null });
		store.markClimateCalculating();
		expect(store.temperature).toEqual({
			status: 'calculating',
			result: null,
			progress: null,
			pass: 1,
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
	it('marks the results out of date and keeps every field of them', () => {
		const { store } = createWatched();
		const result = temperatureOf(5);
		const months = result.months.slice();
		const climate = climateWith(result);
		store.setClimateResult(climate, true);
		store.markClimateCalculating();
		store.setProgress(progressOf(2));

		store.markClimateStopped();
		expect(store.temperature).toEqual({
			status: 'outOfDate',
			result,
			progress: null,
			pass: null,
		});
		expect(store.temperature.result).toBe(result);
		expect(store.temperature.result?.months).toEqual(months);
		expect(store.temperature.result?.state).toBe(result.state);
		expect(store.winds).toEqual({ status: 'outOfDate', result: climate });
	});

	it('leaves the layers empty when there was no result', () => {
		const { store } = createWatched();
		store.markClimateCalculating();
		store.markClimateStopped();
		expect(store.temperature).toEqual({
			status: 'empty',
			result: null,
			progress: null,
			pass: null,
		});
		expect(store.winds).toEqual({ status: 'empty', result: null });
	});
});

describe('unavailability', () => {
	it('is for good, for both layers at once, keeping the results until they are cleared', () => {
		const { store, heard } = createWatched();
		const climate = climateWith(temperatureOf(1));
		store.setClimateResult(climate, true);
		store.markClimateCalculating();
		store.setProgress(progressOf(1));
		heard.length = 0;

		store.markUnavailable();
		expect(heard).toHaveLength(1);
		expect(store.temperature).toEqual({
			status: 'unavailable',
			result: climate.temperature,
			progress: null,
			pass: null,
		});
		expect(store.winds).toEqual({ status: 'unavailable', result: climate });

		store.markClimateCalculating();
		store.markClimateStopped();
		store.markOutOfDate();
		store.setPass(climateWith(temperatureOf(3)), 1);
		expect(store.temperature.status).toBe('unavailable');
		expect(store.temperature.result).toBe(climate.temperature);
		const late = climateWith(temperatureOf(2));
		store.setClimateResult(late, true);
		expect(store.temperature).toMatchObject({
			status: 'unavailable',
			result: late.temperature,
		});
		expect(store.winds).toEqual({ status: 'unavailable', result: late });

		store.clear();
		expect(store.temperature).toEqual({
			status: 'unavailable',
			result: null,
			progress: null,
			pass: null,
		});
		expect(store.winds).toEqual({ status: 'unavailable', result: null });
	});

	it('is so at once with a current result, as with none', () => {
		const current = createWatched().store;
		current.setClimateResult(climateWith(temperatureOf(1)), true);
		current.markUnavailable();
		expect(current.winds.status).toBe('unavailable');

		const none = createWatched().store;
		none.markUnavailable();
		expect(none.winds).toEqual({ status: 'unavailable', result: null });
	});
});

/** A pass of the climate, its winds worked out with its temperature. */
const passOf = (value: number): SolvedWinds =>
	windsFrom(temperatureOf(value), value);

describe('a climate', () => {
	it('makes both layers calculating in one change, each keeping its result, the first pass under way', () => {
		const { store, heard } = createWatched();
		const settled = passOf(1);
		store.setClimateResult(settled, true);
		heard.length = 0;

		store.markClimateCalculating();
		expect(heard).toHaveLength(1);
		expect(store.temperature).toEqual({
			status: 'calculating',
			result: settled.temperature,
			progress: null,
			pass: 1,
		});
		expect(store.winds).toEqual({ status: 'calculating', result: settled });
	});

	it('shows each pass at once in both layers, still calculating, with the next pass under way', () => {
		const { store, heard } = createWatched();
		store.markClimateCalculating();
		store.setProgress(progressOf(3), 1);
		expect(store.temperature.pass).toBe(1);
		heard.length = 0;

		const first = passOf(1);
		store.setPass(first, 1);
		expect(heard).toHaveLength(1);
		expect(store.temperature).toEqual({
			status: 'calculating',
			result: first.temperature,
			progress: null,
			pass: 2,
		});
		expect(store.winds).toEqual({ status: 'calculating', result: first });

		// The temperature and the winds on show are always of the same pass.
		store.setProgress(progressOf(1), 2);
		const second = passOf(2);
		store.setPass(second, 2);
		expect(store.temperature.result).toBe(second.temperature);
		expect(store.winds.result?.temperature).toBe(store.temperature.result);
		expect(store.temperature.pass).toBe(3);

		// The last pass leaves itself under way until the answer, with its
		// progress as it was, so that what is shown of it does not go back.
		store.setProgress({ ...progressOf(4), estimatedYearsLeft: 0 }, 3);
		store.setPass(passOf(3), 3, true);
		expect(store.temperature).toMatchObject({
			pass: 3,
			progress: { ...progressOf(4), estimatedYearsLeft: 0 },
		});
	});

	it('starts a climate carried on from a pass reached at the pass after it', () => {
		const { store } = createWatched();
		store.markClimateCalculating(4);
		expect(store.temperature).toMatchObject({
			status: 'calculating',
			pass: 4,
		});
		store.setPass(passOf(1), 4);
		expect(store.temperature.pass).toBe(5);
	});

	it('keeps the pass under way that progress tells, and the one on hand when it tells none', () => {
		const { store } = createWatched();
		store.markClimateCalculating();
		store.setProgress(progressOf(1), 4);
		expect(store.temperature.pass).toBe(4);
		store.setProgress(progressOf(2));
		expect(store.temperature).toMatchObject({
			pass: 4,
			progress: progressOf(2),
		});
	});

	it('keeps no pass unless calculating', () => {
		const { store, heard } = createWatched();
		store.setPass(passOf(1), 1);
		expect(heard).toEqual([]);
		expect(store.temperature.result).toBeNull();
		expect(store.winds.result).toBeNull();
	});

	it('settles both layers in one change, as current or out of date', () => {
		const { store, heard } = createWatched();
		store.markClimateCalculating();
		store.setPass(passOf(1), 1);
		heard.length = 0;

		const last = passOf(2);
		store.setClimateResult(last, true);
		expect(heard).toHaveLength(1);
		expect(store.temperature).toEqual({
			status: 'current',
			result: last.temperature,
			progress: null,
			pass: null,
		});
		expect(store.winds).toEqual({ status: 'current', result: last });

		store.markClimateCalculating();
		store.setClimateResult(passOf(3), false);
		expect(store.temperature.status).toBe('outOfDate');
		expect(store.winds.status).toBe('outOfDate');
	});

	it('when stopped or failed, keeps both results out of date, or leaves both empty with none', () => {
		const none = createWatched();
		none.store.markClimateCalculating();
		none.store.markClimateStopped();
		expect(none.heard).toHaveLength(2);
		expect(none.store.temperature).toEqual({
			status: 'empty',
			result: null,
			progress: null,
			pass: null,
		});
		expect(none.store.winds).toEqual({ status: 'empty', result: null });

		const { store } = createWatched();
		store.markClimateCalculating();
		const reached = passOf(1);
		store.setPass(reached, 1);
		store.markClimateStopped();
		expect(store.temperature).toEqual({
			status: 'outOfDate',
			result: reached.temperature,
			progress: null,
			pass: null,
		});
		expect(store.winds).toEqual({ status: 'outOfDate', result: reached });
	});

	it('is unavailable together once the worker is gone, keeping what it had', () => {
		const { store } = createWatched();
		store.markClimateCalculating();
		const reached = passOf(1);
		store.setPass(reached, 1);
		store.markUnavailable();
		expect(store.temperature).toMatchObject({
			status: 'unavailable',
			result: reached.temperature,
		});
		expect(store.winds).toEqual({ status: 'unavailable', result: reached });

		store.markClimateCalculating();
		store.markClimateStopped();
		store.setClimateResult(passOf(2), true);
		expect(store.temperature.status).toBe('unavailable');
		expect(store.winds.status).toBe('unavailable');
	});

	it('is dropped, both layers, when the world is replaced', () => {
		const { store } = createWatched();
		store.markClimateCalculating();
		store.setPass(passOf(1), 1);
		store.clear();
		expect(store.temperature).toEqual({
			status: 'empty',
			result: null,
			progress: null,
			pass: null,
		});
		expect(store.winds).toEqual({ status: 'empty', result: null });
	});
});
