import { describe, expect, it } from 'vitest';
import { progressOf, temperatureOf } from '../core/testing/temperatureFixtures';
import {
	createLayerStore,
	type LayerStore,
	MAX_CHANGES_TOLD_IN_A_ROUND,
	type TemperatureLayer,
	type TemperatureStatus,
} from './layers';

/** For a store whose listeners never throw: there is nothing to report. */
const ignore = (): void => {};

/** A store with a listener that keeps every layer it is told of. */
const createWatched = (): {
	readonly store: LayerStore;
	readonly heard: TemperatureLayer[];
	readonly statuses: () => TemperatureStatus[];
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
		const reported: [unknown, TemperatureStatus][] = [];
		const store = createLayerStore((error) =>
			reported.push([error, store.temperature.status]),
		);
		const failure = new Error('could not draw');
		const heard: TemperatureStatus[] = [];
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
		const heard: TemperatureStatus[] = [];
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
		const heard: TemperatureStatus[] = [];
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
		const late: TemperatureStatus[] = [];
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
