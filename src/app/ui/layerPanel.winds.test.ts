import { describe, expect, it } from 'vitest';
import { getGrid, type MonthlyWind, summariseWinds } from '../../core/index';
import { temperatureOf } from '../../core/testing/temperatureFixtures';
import type { LayerStore, SolvedWinds } from '../layers/layers';
import { PLAYBACK_STEP_MS } from '../layers/playback';
import { DEFAULT_MONTH, DEFAULT_PAGE_VIEW, WIND_SOURCES } from '../layers/view';
import { answerWinds, keepingTemperature } from '../testing/climateStore';
import {
	createDeferredLoader,
	createStage,
	solvedWinds,
} from '../testing/layerPanelStage';
import { settle } from '../testing/settle';
import type { LayerPanel } from './layerPanel';
import { LEGEND_EMPTY_TEXT, LEGEND_OUT_OF_DATE_TEXT } from './main/legend';
import {
	OBSERVED_WINDS_FAILED_TEXT,
	OBSERVED_WINDS_LOADING_TEXT,
	WINDS_CALCULATING_TEXT,
	WINDS_UNAVAILABLE_TEXT,
} from './main/windKey';

describe('createLayerPanel, the winds', () => {
	/** A stage with the winds switched on. */
	const windy = () => {
		const stage = createStage();
		stage.panel.setWinds(true);
		return stage;
	};
	/** Has winds arrive, current, as the scheduler does. */
	const arrive = (
		stage: ReturnType<typeof createStage>,
		solved: SolvedWinds,
	) => {
		answerWinds(stage.store, solved, true);
	};
	/** The field of a month of a year of winds. */
	const monthOf = (solved: SolvedWinds, month: number) => ({
		east: solved.winds.east[month],
		north: solved.winds.north[month],
	});

	it('starts off, giving the globe no winds and hiding the key', () => {
		const stage = createStage();
		stage.panel.setSunlight(true);
		expect(stage.told.at(-1)?.winds).toBe(false);
		arrive(stage, solvedWinds());
		expect(stage.winds).toEqual([]);
		expect(stage.keys.every((key) => key === null)).toBe(true);
	});

	it('shows the winds when turned on, telling of it with the view, and says nothing is there yet', () => {
		const stage = createStage();
		stage.panel.setWinds(true);
		expect(stage.told.at(-1)).toEqual({ ...DEFAULT_PAGE_VIEW, winds: true });
		expect(stage.winds).toEqual([]);
		expect(stage.keys.at(-1)).toEqual({
			state: 'empty',
			status: LEGEND_EMPTY_TEXT,
		});
	});

	it('tells nothing for the setting it already has', () => {
		const stage = createStage();
		stage.panel.setWinds(false);
		expect(stage.told).toEqual([]);
	});

	it('gives the globe the month on screen of a result as it arrives, the result’s own arrays, and clears the key’s line', () => {
		const stage = windy();
		const solved = solvedWinds();
		arrive(stage, solved);
		expect(stage.winds).toHaveLength(1);
		expect(stage.winds[0]?.east).toBe(solved.winds.east[DEFAULT_MONTH]);
		expect(stage.winds[0]?.north).toBe(solved.winds.north[DEFAULT_MONTH]);
		expect(stage.keys.at(-1)).toEqual({ state: 'current', status: null });
	});

	it('follows the month on the slider and as the year plays, in Terrain view', () => {
		const stage = windy();
		const solved = solvedWinds();
		arrive(stage, solved);
		stage.panel.setMonth(0);
		stage.panel.togglePlaying();
		stage.timers.advance(2 * PLAYBACK_STEP_MS);
		expect(stage.winds).toEqual([
			monthOf(solved, DEFAULT_MONTH),
			monthOf(solved, 0),
			monthOf(solved, 1),
			monthOf(solved, 2),
		]);
	});

	it('gives the new result’s month when a new result arrives, and nothing more as the status changes', () => {
		const stage = windy();
		const first = solvedWinds();
		arrive(stage, first);
		stage.store.markOutOfDate();
		stage.store.markClimateCalculating();
		expect(stage.winds).toHaveLength(1);
		const second = solvedWinds(5);
		stage.store.setClimateResult(keepingTemperature(stage.store, second), true);
		expect(stage.winds).toEqual([
			monthOf(first, DEFAULT_MONTH),
			monthOf(second, DEFAULT_MONTH),
		]);
	});

	it.each([
		[
			'out of date',
			(store: LayerStore) => store.markOutOfDate(),
			'outOfDate',
			LEGEND_OUT_OF_DATE_TEXT,
		],
		[
			'being worked out',
			(store: LayerStore) => store.markClimateCalculating(),
			'calculating',
			WINDS_CALCULATING_TEXT,
		],
		[
			'no longer calculable',
			(store: LayerStore) => store.markUnavailable(),
			'unavailable',
			WINDS_UNAVAILABLE_TEXT,
		],
	] as const)(
		'keeps the arrows while the winds are %s, and the key says so',
		(_name, change, state, words) => {
			const stage = windy();
			arrive(stage, solvedWinds());
			change(stage.store);
			expect(stage.winds).toHaveLength(1);
			expect(stage.keys.at(-1)).toEqual({ state, status: words });
		},
	);

	it('drops the arrows when the store drops its winds, as for a new world', () => {
		const stage = windy();
		arrive(stage, solvedWinds());
		stage.store.clear();
		expect(stage.winds.at(-1)).toBeNull();
		expect(stage.keys.at(-1)).toEqual({
			state: 'empty',
			status: LEGEND_EMPTY_TEXT,
		});
	});

	it('shows the annual mean on Annual average, worked out once for each result', () => {
		const stage = windy();
		const solved = solvedWinds();
		arrive(stage, solved);
		stage.panel.setLayer('temperature');
		stage.panel.setSummary('temperature', 'annualMean');
		const mean = stage.winds.at(-1);
		expect(mean?.east).toEqual(summariseWinds(solved.winds).east);
		expect(mean?.north).toEqual(summariseWinds(solved.winds).north);
		stage.panel.setSummary('temperature', 'month');
		stage.panel.setSummary('temperature', 'annualMean');
		expect(stage.winds.at(-1)?.east).toBe(mean?.east);
		expect(stage.winds.at(-1)?.north).toBe(mean?.north);
	});

	it.each(['warmest', 'coldest', 'range'] as const)(
		'keeps the month last on screen on the %s',
		(view) => {
			const stage = windy();
			const solved = solvedWinds();
			arrive(stage, solved);
			stage.panel.setLayer('temperature');
			stage.panel.setMonth(3);
			stage.panel.setSummary('temperature', view);
			expect(stage.winds.at(-1)).toEqual(monthOf(solved, 3));
			expect(stage.winds).toHaveLength(2);
		},
	);

	it('shows the month on screen in Terrain view, whatever summary was last chosen in Temperature view', () => {
		const stage = windy();
		const solved = solvedWinds();
		arrive(stage, solved);
		stage.panel.setLayer('temperature');
		stage.panel.setSummary('temperature', 'annualMean');
		stage.panel.setLayer('terrain');
		expect(stage.winds.at(-1)).toEqual(monthOf(solved, DEFAULT_MONTH));
	});

	it('removes the arrows when turned off, and hides the key', () => {
		const stage = windy();
		arrive(stage, solvedWinds());
		stage.panel.setWinds(false);
		expect(stage.winds.at(-1)).toBeNull();
		expect(stage.keys.at(-1)).toBeNull();
		stage.store.setClimateResult(
			keepingTemperature(stage.store, solvedWinds(3)),
			true,
		);
		expect(stage.winds.at(-1)).toBeNull();
		expect(stage.winds).toHaveLength(2);
	});

	it('offers the month in Terrain view while on, and stops the year when turned off there with sunlight off', () => {
		const stage = windy();
		expect(stage.lastView()).toEqual({
			view: { ...DEFAULT_PAGE_VIEW, winds: true },
			playing: false,
		});
		stage.panel.togglePlaying();
		stage.panel.setWinds(false);
		expect(stage.timers.pending()).toBe(0);
		expect(stage.lastView()).toEqual({
			view: DEFAULT_PAGE_VIEW,
			playing: false,
		});
	});

	it('keeps the year playing in Terrain view when turned off with sunlight still on', () => {
		const stage = windy();
		stage.panel.setSunlight(true);
		stage.panel.togglePlaying();
		stage.panel.setWinds(false);
		expect(stage.timers.pending()).toBe(1);
		expect(stage.lastView()?.playing).toBe(true);
	});

	it('says the globe shows no winds while they are off, and none before a result', () => {
		const stage = createStage();
		arrive(stage, solvedWinds());
		expect(stage.panel.shownWinds()).toBeNull();
		const on = windy();
		expect(on.panel.shownWinds()).toBeNull();
	});

	it('says the globe shows the very winds its arrows are drawn from, the month’s, current', () => {
		const stage = windy();
		const solved = solvedWinds();
		arrive(stage, solved);
		const shown = stage.panel.shownWinds();
		expect(shown?.field).toBe(stage.winds.at(-1));
		expect(shown?.field.east).toBe(solved.winds.east[DEFAULT_MONTH]);
		expect(shown?.field.north).toBe(solved.winds.north[DEFAULT_MONTH]);
		expect(shown?.current).toBe(true);
		stage.panel.setMonth(2);
		expect(stage.panel.shownWinds()?.field.east).toBe(solved.winds.east[2]);
	});

	it('says the globe shows the year’s mean winds on Annual average, and the month’s again after', () => {
		const stage = windy();
		const solved = solvedWinds();
		arrive(stage, solved);
		stage.panel.setLayer('temperature');
		stage.panel.setSummary('temperature', 'annualMean');
		const shown = stage.panel.shownWinds();
		expect(shown?.field).toBe(stage.winds.at(-1));
		// Month m blows m + 1 m/s, so the year's mean blows 6.5 m/s.
		expect(Array.from(shown?.field.east ?? [])).toEqual([6.5, 0]);
		expect(shown?.current).toBe(true);
		stage.panel.setSummary('temperature', 'warmest');
		expect(stage.panel.shownWinds()?.field.east).toBe(
			solved.winds.east[DEFAULT_MONTH],
		);
	});

	it.each([
		['out of date', (store: LayerStore) => store.markOutOfDate()],
		['being worked out', (store: LayerStore) => store.markClimateCalculating()],
		['no longer calculable', (store: LayerStore) => store.markUnavailable()],
	])(
		'says the winds on the globe are not current while the store’s are %s',
		(_name, change) => {
			const stage = windy();
			arrive(stage, solvedWinds());
			change(stage.store);
			expect(stage.panel.shownWinds()?.current).toBe(false);
		},
	);

	it('says the winds on the globe are current again once new ones arrive', () => {
		const stage = windy();
		arrive(stage, solvedWinds());
		stage.store.markOutOfDate();
		const next = solvedWinds(4);
		arrive(stage, next);
		expect(stage.panel.shownWinds()).toMatchObject({
			field: { east: next.winds.east[DEFAULT_MONTH] },
			current: true,
		});
	});

	it('says the earlier winds the globe keeps are not current when it refuses the new', () => {
		const stage = windy();
		const solved = solvedWinds();
		arrive(stage, solved);
		const failure = new Error('refused');
		stage.failWindsNext(failure);
		stage.store.setClimateResult(
			keepingTemperature(stage.store, solvedWinds(4)),
			true,
		);
		expect(stage.errors).toEqual([failure]);
		const shown = stage.panel.shownWinds();
		expect(shown?.field.east).toBe(solved.winds.east[DEFAULT_MONTH]);
		expect(shown?.current).toBe(false);
	});

	it('says the globe shows no winds once they are turned off, or the store drops them', () => {
		const stage = windy();
		arrive(stage, solvedWinds());
		stage.panel.setWinds(false);
		expect(stage.panel.shownWinds()).toBeNull();
		stage.panel.setWinds(true);
		expect(stage.panel.shownWinds()).not.toBeNull();
		stage.store.clear();
		expect(stage.panel.shownWinds()).toBeNull();
	});

	it('keeps the winds for a new world', () => {
		const stage = windy();
		stage.panel.setMonth(2);
		stage.panel.newWorld(null);
		expect(stage.lastView()?.view).toEqual({
			...DEFAULT_PAGE_VIEW,
			winds: true,
		});
		expect(stage.told.at(-1)?.winds).toBe(true);
	});
});

describe('createLayerPanel, the observed winds', () => {
	const grid = getGrid(64);
	/** Twelve months of a field on the 64 grid, from a value of the month and cell. */
	const monthsOf = (value: (m: number, cell: number) => number) =>
		Array.from({ length: 12 }, (_, m) =>
			Float32Array.from({ length: grid.cellCount }, (_, cell) =>
				value(m, cell),
			),
		);
	/** A simulated year of winds on the 64 grid, differing by cell and month. */
	const simulatedOnGrid = (offset = 0): SolvedWinds => ({
		winds: {
			east: monthsOf((m, cell) => 4 + (cell % 5) + m * 0.2 + offset),
			north: monthsOf((m, cell) => (cell % 3) - 1 - m * 0.1),
			pressure: monthsOf(() => 1013),
		},
		temperature: temperatureOf(1, grid.cellCount),
		dayLengthHours: 24,
	});
	/** Observed winds on the 64 grid, apart from the simulated in places. */
	const observedOnGrid = (): MonthlyWind => ({
		east: monthsOf((m, cell) => 6 - (cell % 7) + m * 0.1),
		north: monthsOf((m, cell) => (cell % 4) - 1.5 + m * 0.05),
	});
	/** Has winds arrive, current, as the scheduler does. */
	const arrive = (
		stage: ReturnType<typeof createStage>,
		solved: SolvedWinds,
	): SolvedWinds => {
		answerWinds(stage.store, solved, true);
		return solved;
	};
	/**
	 * A stage on the measured Earth at 64 with the winds on and a result,
	 * and the observed winds' loader answering when a test says.
	 */
	const createWindsStage = () => {
		const stage = createStage();
		const deferred = createDeferredLoader<MonthlyWind>();
		stage.setWindsLoader(deferred.loader);
		// A layer chosen on Observed asks for its observed year, which stays
		// on its way here.
		stage.setLoader(() => new Promise(() => {}));
		stage.panel.setWinds(true);
		stage.panel.newWorld(64);
		const solved = arrive(stage, simulatedOnGrid());
		const observed = observedOnGrid();
		/** Chooses Observed and has the observed winds arrive. */
		const observe = async (): Promise<void> => {
			stage.panel.setSource('observed');
			deferred.last().resolve(observed);
			await settle();
		};
		return { stage, deferred, solved, observed, observe };
	};

	it('offers Simulated and Observed only on the measured Earth, on Simulated, and fetches nothing until Observed is first chosen', () => {
		const stage = createStage();
		const deferred = createDeferredLoader<MonthlyWind>();
		stage.setWindsLoader(deferred.loader);
		stage.panel.setWinds(true);
		arrive(stage, simulatedOnGrid());
		stage.panel.setEarth(64);
		expect(stage.lastComparison()).toEqual({
			offered: WIND_SOURCES,
			source: 'simulated',
			message: null,
		});
		stage.panel.setLayer('temperature');
		stage.panel.setMonth(2);
		stage.panel.setWinds(false);
		stage.panel.setWinds(true);
		stage.panel.setLayer('terrain');
		expect(deferred.calls).toEqual([]);
		stage.panel.setSource('observed');
		expect(deferred.calls.map((call) => call.resolution)).toEqual([64]);
		expect(stage.lastComparison()).toEqual({
			offered: WIND_SOURCES,
			source: 'observed',
			message: null,
		});
		stage.panel.setEarth(null);
		expect(stage.lastComparison()).toEqual({
			offered: [],
			source: 'simulated',
			message: null,
		});
	});

	it('ignores Observed chosen while the world is not the measured Earth', () => {
		const stage = createStage();
		const deferred = createDeferredLoader<MonthlyWind>();
		stage.setWindsLoader(deferred.loader);
		stage.panel.setWinds(true);
		stage.panel.setSource('observed');
		expect(deferred.calls).toEqual([]);
		expect(stage.lastComparison()).toEqual({
			offered: [],
			source: 'simulated',
			message: null,
		});
		expect(stage.told.at(-1)?.source).toBe('simulated');
	});

	it('says on the key that the observed winds are loading, keeping the simulated arrows until they arrive', () => {
		const { stage, solved } = createWindsStage();
		stage.panel.setSource('observed');
		expect(stage.lastKey()?.status).toBe(OBSERVED_WINDS_LOADING_TEXT);
		expect(stage.panel.shownWinds()?.source).toBe('simulated');
		expect(stage.winds.at(-1)?.east).toBe(solved.winds.east[DEFAULT_MONTH]);
		// Whatever is chosen meanwhile, the key says so until they arrive.
		stage.panel.setSource('simulated');
		expect(stage.lastKey()?.status).toBe(OBSERVED_WINDS_LOADING_TEXT);
	});

	it('draws the arrows from the observed winds once they arrive, the month’s, following the month', async () => {
		const { stage, observed, observe } = createWindsStage();
		await observe();
		expect(stage.winds.at(-1)?.east).toBe(observed.east[DEFAULT_MONTH]);
		expect(stage.winds.at(-1)?.north).toBe(observed.north[DEFAULT_MONTH]);
		expect(stage.panel.shownWinds()).toMatchObject({
			source: 'observed',
			current: true,
		});
		expect(stage.lastKey()?.status).toBeNull();
		stage.panel.setMonth(0);
		expect(stage.winds.at(-1)?.east).toBe(observed.east[0]);
	});

	it('draws the observed winds’ year mean on the annual average, worked out once, as the simulated mean is', async () => {
		const { stage, solved, observed, observe } = createWindsStage();
		await observe();
		stage.panel.setLayer('temperature');
		stage.panel.setSummary('temperature', 'annualMean');
		const mean = stage.winds.at(-1);
		const expected = summariseWinds({
			...observed,
			pressure: solved.winds.pressure,
		});
		expect(mean?.east).toEqual(expected.east);
		expect(mean?.north).toEqual(expected.north);
		expect(stage.panel.shownWinds()).toMatchObject({
			field: mean,
			source: 'observed',
		});
		stage.panel.setSummary('temperature', 'month');
		stage.panel.setSummary('temperature', 'annualMean');
		expect(stage.winds.at(-1)?.east).toBe(mean?.east);
		// The simulated mean again, once Simulated is chosen.
		stage.panel.setSource('simulated');
		expect(stage.winds.at(-1)?.east).toEqual(summariseWinds(solved.winds).east);
		expect(stage.panel.shownWinds()?.source).toBe('simulated');
	});

	it('draws the simulated arrows again when Simulated is chosen, fetching nothing more', async () => {
		const { stage, deferred, solved, observed, observe } = createWindsStage();
		await observe();
		stage.panel.setSource('simulated');
		expect(stage.winds.at(-1)?.east).toBe(solved.winds.east[DEFAULT_MONTH]);
		expect(stage.panel.shownWinds()?.source).toBe('simulated');
		stage.panel.setSource('observed');
		expect(stage.winds.at(-1)?.east).toBe(observed.east[DEFAULT_MONTH]);
		expect(deferred.calls).toHaveLength(1);
	});

	it('says where the winds stand before anything about the observed winds, loading or failed', async () => {
		const { stage, deferred } = createWindsStage();
		// While the observed winds load, winds that are out of date or being
		// worked out again say so.
		stage.panel.setSource('observed');
		expect(stage.lastKey()?.status).toBe(OBSERVED_WINDS_LOADING_TEXT);
		stage.store.markOutOfDate();
		expect(stage.lastKey()?.status).toBe(LEGEND_OUT_OF_DATE_TEXT);
		stage.store.markClimateCalculating();
		expect(stage.lastKey()?.status).toBe(WINDS_CALCULATING_TEXT);
		// So they do once the load has failed, and the failure shows again
		// when they are current.
		deferred.last().reject(new Error('offline'));
		await settle();
		expect(stage.lastKey()?.status).toBe(WINDS_CALCULATING_TEXT);
		arrive(stage, simulatedOnGrid());
		expect(stage.lastKey()?.status).toBe(OBSERVED_WINDS_FAILED_TEXT);
		stage.store.markOutOfDate();
		expect(stage.lastKey()?.status).toBe(LEGEND_OUT_OF_DATE_TEXT);
	});

	it('goes back to Simulated when the observed winds cannot be loaded, the status line saying so, and fetches again at the next choice', async () => {
		const { stage, deferred, solved } = createWindsStage();
		stage.panel.setSource('observed');
		const error = new Error('offline');
		deferred.last().reject(error);
		await settle();
		expect(stage.reported).toEqual([error]);
		expect(stage.lastKey()?.status).toBe(OBSERVED_WINDS_FAILED_TEXT);
		expect(stage.lastComparison()).toMatchObject({
			offered: WIND_SOURCES,
			source: 'simulated',
		});
		expect(stage.panel.shownWinds()?.source).toBe('simulated');
		expect(stage.winds.at(-1)?.east).toBe(solved.winds.east[DEFAULT_MONTH]);
		stage.panel.setSource('observed');
		expect(deferred.calls).toHaveLength(2);
		expect(stage.lastKey()?.status).toBe(OBSERVED_WINDS_LOADING_TEXT);
	});

	it.each([
		['a new world', (panel: LayerPanel) => panel.newWorld(64)],
		[
			'the world stopped being the measured Earth',
			(panel: LayerPanel) => panel.setEarth(null),
		],
		[
			'the world stopped and started being the measured Earth',
			(panel: LayerPanel) => {
				panel.setEarth(null);
				panel.setEarth(64);
			},
		],
	])(
		'sets aside the observed winds that arrive after %s',
		async (_, change) => {
			for (const outcome of ['arrives', 'fails'] as const) {
				const { stage, deferred, observed } = createWindsStage();
				stage.panel.setSource('observed');
				change(stage.panel);
				const sent = stage.winds.length;
				const comparisons = stage.comparisons.length;
				const keys = stage.keys.length;
				if (outcome === 'arrives') {
					deferred.last().resolve(observed);
				} else {
					deferred.last().reject(new Error('late'));
				}
				await settle();
				expect(stage.winds, outcome).toHaveLength(sent);
				expect(stage.comparisons, outcome).toHaveLength(comparisons);
				expect(stage.keys, outcome).toHaveLength(keys);
				expect(stage.reported, outcome).toEqual([]);
				expect(stage.lastComparison()?.source, outcome).toBe('simulated');
				expect(stage.panel.shownWinds()?.source ?? 'simulated', outcome).toBe(
					'simulated',
				);
			}
		},
	);

	it('goes back to Simulated when the world stops being the measured Earth, keeping the observed winds for the same grid', async () => {
		const { stage, deferred, solved, observed, observe } = createWindsStage();
		await observe();
		stage.panel.setEarth(null);
		expect(stage.lastComparison()).toMatchObject({
			offered: [],
			source: 'simulated',
		});
		expect(stage.winds.at(-1)?.east).toBe(solved.winds.east[DEFAULT_MONTH]);
		stage.panel.setEarth(64);
		expect(stage.lastComparison()).toMatchObject({
			offered: WIND_SOURCES,
			source: 'simulated',
		});
		stage.panel.setSource('observed');
		expect(deferred.calls).toHaveLength(1);
		expect(stage.winds.at(-1)?.east).toBe(observed.east[DEFAULT_MONTH]);
	});

	it('forgets the observed winds and the choice for a new world', async () => {
		const { stage, deferred, solved, observe } = createWindsStage();
		await observe();
		stage.panel.newWorld(64);
		expect(stage.lastComparison()).toMatchObject({
			offered: WIND_SOURCES,
			source: 'simulated',
		});
		arrive(stage, solved);
		stage.panel.setSource('observed');
		expect(deferred.calls).toHaveLength(2);
	});

	it('says only where the winds stand, with no figures of them against the observed winds, for both sources', async () => {
		const { stage, observe } = createWindsStage();
		await observe();
		expect(stage.lastKey()).toEqual({ state: 'current', status: null });
		stage.panel.setSource('simulated');
		expect(stage.lastKey()).toEqual({ state: 'current', status: null });
		stage.panel.setLayer('temperature');
		stage.panel.setSummary('temperature', 'annualMean');
		expect(stage.lastKey()).toEqual({ state: 'current', status: null });
	});

	it('says nothing of the simulated winds being out of date under the observed, and says so under the simulated', async () => {
		const { stage, observe } = createWindsStage();
		await observe();
		stage.store.markOutOfDate();
		// Under the observed winds, which are never out of date.
		expect(stage.lastKey()?.status).toBeNull();
		expect(stage.panel.shownWinds()?.current).toBe(true);
		stage.panel.setSource('simulated');
		expect(stage.lastKey()?.status).toBe(LEGEND_OUT_OF_DATE_TEXT);
		expect(stage.panel.shownWinds()?.current).toBe(false);
		stage.store.markClimateCalculating();
		expect(stage.lastKey()?.status).toBe(WINDS_CALCULATING_TEXT);
	});

	it('says nothing of the winds off the measured Earth once they are current, and drops the arrows without a simulated result', async () => {
		const { stage, observe } = createWindsStage();
		await observe();
		stage.store.clear();
		expect(stage.winds.at(-1)).toBeNull();
		const elsewhere = createStage();
		elsewhere.panel.setWinds(true);
		arrive(elsewhere, simulatedOnGrid());
		expect(elsewhere.lastKey()).toEqual({ state: 'current', status: null });
	});
});
