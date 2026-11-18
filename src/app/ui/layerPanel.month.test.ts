import { describe, expect, it } from 'vitest';
import { summariseTemperature } from '../../core/index';
import { progressOf } from '../../core/testing/temperatureFixtures';
import {
	rampGradient,
	SEASONAL_RANGE_RAMP,
	TEMPERATURE_RAMP,
} from '../globe/ramp';
import { PLAYBACK_STEP_MS } from '../layers/playback';
import {
	layerCaption,
	SEASONAL_RANGE_TICK_STEP,
	TEMPERATURE_LAYER,
	TEMPERATURE_NOT_SHOWN_TEXT,
} from '../layers/scalar';
import { DEFAULT_MONTH, DEFAULT_PAGE_VIEW, type Summary } from '../layers/view';
import {
	createStage,
	resultOnGrid,
	resultWith,
	tickLabels,
	yearRange,
} from '../testing/layerPanelStage';
import { LEGEND_OUT_OF_DATE_TEXT } from './main/legend';

describe('createLayerPanel, the month', () => {
	it('shows the month the slider is moved to, on the same scale as July', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		const result = resultWith();
		stage.arrive(result);
		const ticks = tickLabels(stage.lastLegend());
		stage.panel.setMonth(0);
		stage.panel.setMonth(11);
		expect(stage.shown.map((shown) => shown.field)).toEqual([
			result.months[DEFAULT_MONTH],
			result.months[0],
			result.months[11],
		]);
		expect(stage.shown[2]?.field).toBe(result.months[11]);
		// The colours keep their meaning: one range, one ramp.
		expect(stage.shown[1]?.range).toBe(stage.shown[0]?.range);
		expect(stage.shown[2]?.range).toBe(stage.shown[0]?.range);
		expect(stage.shown.every((shown) => shown.ramp === TEMPERATURE_RAMP)).toBe(
			true,
		);
		expect(tickLabels(stage.lastLegend())).toEqual(ticks);
		expect(stage.told.at(-1)).toEqual({
			layer: 'temperature',
			summaries: { temperature: 'month', pressure: 'month' },
			source: 'simulated',
			month: 11,
			sunlight: false,
			winds: false,
			grid: false,
		});
	});

	it('asks nothing for the month already on screen', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		stage.arrive(resultWith());
		const told = stage.told.length;
		stage.panel.setMonth(DEFAULT_MONTH);
		expect(stage.shown).toHaveLength(1);
		expect(stage.told).toHaveLength(told);
	});

	it('keeps the month across a switch to the terrain and back', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		const result = resultWith();
		stage.arrive(result);
		stage.panel.setMonth(2);
		stage.panel.setLayer('terrain');
		stage.panel.setLayer('temperature');
		expect(stage.shown.at(-1)?.field).toBe(result.months[2]);
	});

	it('keeps the month and the view for a new result, as after an edit', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		stage.arrive(resultWith());
		stage.panel.setMonth(2);
		const next = resultWith(5);
		stage.arrive(next);
		expect(stage.shown.at(-1)?.field).toBe(next.months[2]);
		expect(stage.lastView()?.view.month).toBe(2);
	});

	it('puts July back on screen and stops playing for a new world, keeping the view', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		const result = resultWith();
		stage.arrive(result);
		stage.panel.setMonth(2);
		stage.panel.togglePlaying();
		stage.panel.newWorld(null);
		expect(stage.lastView()).toEqual({
			view: {
				layer: 'temperature',
				summaries: { temperature: 'month', pressure: 'month' },
				source: 'simulated',
				month: 6,
				sunlight: false,
				winds: false,
				grid: false,
			},
			playing: false,
		});
		expect(stage.told.at(-1)?.month).toBe(DEFAULT_MONTH);
		expect(stage.shown.at(-1)?.field).toBe(result.months[DEFAULT_MONTH]);
		expect(stage.timers.pending()).toBe(0);
	});

	it('stops playing for a new world on July, sending nothing more', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		stage.arrive(resultWith());
		stage.panel.togglePlaying();
		const shown = stage.shown.length;
		stage.panel.newWorld(null);
		expect(stage.timers.pending()).toBe(0);
		expect(stage.lastView()).toEqual({
			view: {
				layer: 'temperature',
				summaries: { temperature: 'month', pressure: 'month' },
				source: 'simulated',
				month: 6,
				sunlight: false,
				winds: false,
				grid: false,
			},
			playing: false,
		});
		expect(stage.shown).toHaveLength(shown);
	});

	it('keeps a summary chosen when a new world puts July back', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		stage.panel.setSummary('temperature', 'range');
		stage.panel.setMonth(2);
		stage.panel.newWorld(null);
		expect(stage.lastView()?.view).toEqual({
			layer: 'temperature',
			summaries: { temperature: 'range', pressure: 'month' },
			source: 'simulated',
			month: DEFAULT_MONTH,
			sunlight: false,
			winds: false,
			grid: false,
		});
	});
});

describe('createLayerPanel, playing the year', () => {
	/** A stage in the Month view with a result on show, playing from a month. */
	const playingFrom = (month: number) => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		const result = resultWith();
		stage.arrive(result);
		stage.panel.setMonth(month);
		stage.panel.togglePlaying();
		return { stage, result };
	};

	it('says it is playing and moves on a month each step, slider and globe together', () => {
		const { stage, result } = playingFrom(DEFAULT_MONTH);
		expect(stage.lastView()?.playing).toBe(true);
		stage.timers.advance(PLAYBACK_STEP_MS);
		expect(stage.shown.at(-1)?.field).toBe(result.months[7]);
		expect(stage.lastView()).toEqual({
			view: {
				layer: 'temperature',
				summaries: { temperature: 'month', pressure: 'month' },
				source: 'simulated',
				month: 7,
				sunlight: false,
				winds: false,
				grid: false,
			},
			playing: true,
		});
		expect(stage.told.at(-1)?.month).toBe(7);
		expect(stage.lastLegend()?.scale?.caption).toBe(
			'Air temperature in August, °C',
		);
	});

	it('wraps from December to January', () => {
		const { stage, result } = playingFrom(11);
		stage.timers.advance(PLAYBACK_STEP_MS);
		expect(stage.shown.at(-1)?.field).toBe(result.months[0]);
		expect(stage.lastView()?.view.month).toBe(0);
	});

	it('stops when the button is pressed again', () => {
		const { stage } = playingFrom(DEFAULT_MONTH);
		stage.panel.togglePlaying();
		expect(stage.lastView()?.playing).toBe(false);
		const shown = stage.shown.length;
		stage.timers.advance(5 * PLAYBACK_STEP_MS);
		expect(stage.shown).toHaveLength(shown);
		expect(stage.lastView()?.view.month).toBe(DEFAULT_MONTH);
	});

	it('stops when the view leaves the Month view', () => {
		const { stage } = playingFrom(DEFAULT_MONTH);
		stage.panel.setSummary('temperature', 'annualMean');
		expect(stage.lastView()?.playing).toBe(false);
		expect(stage.timers.pending()).toBe(0);
		stage.panel.setSummary('temperature', 'month');
		expect(stage.lastView()?.playing).toBe(false);
	});

	it('stops when the layer leaves Temperature', () => {
		const { stage } = playingFrom(DEFAULT_MONTH);
		stage.panel.setLayer('terrain');
		expect(stage.lastView()?.playing).toBe(false);
		expect(stage.timers.pending()).toBe(0);
		stage.timers.advance(PLAYBACK_STEP_MS);
		expect(stage.lastView()?.view.month).toBe(DEFAULT_MONTH);
		stage.panel.setLayer('temperature');
		expect(stage.lastView()?.playing).toBe(false);
		expect(stage.timers.pending()).toBe(0);
	});

	it('keeps playing when the Month view is chosen again', () => {
		const { stage, result } = playingFrom(DEFAULT_MONTH);
		const views = stage.views.length;
		stage.panel.setSummary('temperature', 'month');
		expect(stage.views).toHaveLength(views);
		expect(stage.timers.pending()).toBe(1);
		stage.timers.advance(PLAYBACK_STEP_MS);
		expect(stage.shown.at(-1)?.field).toBe(result.months[7]);
		expect(stage.lastView()?.playing).toBe(true);
	});

	it('carries on from a month the slider is moved to, a whole step later', () => {
		const { stage, result } = playingFrom(DEFAULT_MONTH);
		stage.timers.advance(PLAYBACK_STEP_MS - 10);
		stage.panel.setMonth(3);
		expect(stage.shown.at(-1)?.field).toBe(result.months[3]);
		expect(stage.lastView()).toEqual({
			view: {
				layer: 'temperature',
				summaries: { temperature: 'month', pressure: 'month' },
				source: 'simulated',
				month: 3,
				sunlight: false,
				winds: false,
				grid: false,
			},
			playing: true,
		});
		stage.timers.advance(PLAYBACK_STEP_MS - 1);
		expect(stage.lastView()?.view.month).toBe(3);
		stage.timers.advance(1);
		expect(stage.shown.at(-1)?.field).toBe(result.months[4]);
		expect(stage.lastView()?.view.month).toBe(4);
	});

	it('reports what the globe throws on a step and stops playing, the legend on what it shows', () => {
		const { stage, result } = playingFrom(DEFAULT_MONTH);
		const failure = new RangeError('Refused once');
		stage.failNext(failure);
		expect(() => stage.timers.advance(PLAYBACK_STEP_MS)).not.toThrow();
		expect(stage.reported).toEqual([failure]);
		expect(stage.errors).toEqual([]);
		expect(stage.timers.pending()).toBe(0);
		expect(stage.lastView()).toEqual({
			view: {
				layer: 'temperature',
				summaries: { temperature: 'month', pressure: 'month' },
				source: 'simulated',
				month: 7,
				sunlight: false,
				winds: false,
				grid: false,
			},
			playing: false,
		});
		// The globe still shows July, and the legend says so, marking it out
		// of date beside the current result it refused.
		expect(stage.shown.map((shown) => shown.field)).toEqual([
			result.months[DEFAULT_MONTH],
		]);
		const legend = stage.lastLegend();
		expect(legend?.scale?.caption).toBe('Air temperature in July, °C');
		expect(legend?.status).toBe(LEGEND_OUT_OF_DATE_TEXT);
		stage.timers.advance(5 * PLAYBACK_STEP_MS);
		expect(stage.reported).toEqual([failure]);
	});

	it('stops playing even when reporting what the globe threw throws too', () => {
		const { stage } = playingFrom(DEFAULT_MONTH);
		const failure = new RangeError('Refused once');
		const unreported = new Error('The report failed');
		stage.failNext(failure);
		stage.failReports(unreported);
		expect(() => stage.timers.advance(PLAYBACK_STEP_MS)).toThrow(unreported);
		expect(stage.reported).toEqual([failure]);
		expect(stage.timers.pending()).toBe(0);
		expect(stage.lastView()).toEqual({
			view: {
				layer: 'temperature',
				summaries: { temperature: 'month', pressure: 'month' },
				source: 'simulated',
				month: 7,
				sunlight: false,
				winds: false,
				grid: false,
			},
			playing: false,
		});
		stage.timers.advance(5 * PLAYBACK_STEP_MS);
		expect(stage.reported).toEqual([failure]);
	});

	it('hands what the globe throws for a move of the slider back to it, playing on', () => {
		const { stage, result } = playingFrom(DEFAULT_MONTH);
		const failure = new RangeError('Refused once');
		stage.failNext(failure);
		expect(() => stage.panel.setMonth(3)).toThrow(failure);
		expect(stage.reported).toEqual([]);
		expect(stage.lastView()?.playing).toBe(true);
		stage.timers.advance(PLAYBACK_STEP_MS);
		expect(stage.shown.at(-1)?.field).toBe(result.months[4]);
	});

	it('moves the month on before there is a result, and shows it once there is', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		stage.panel.togglePlaying();
		stage.timers.advance(2 * PLAYBACK_STEP_MS);
		expect(stage.shown).toEqual([]);
		const result = resultWith();
		stage.arrive(result);
		expect(stage.shown.at(-1)?.field).toBe(result.months[8]);
	});
});

describe('createLayerPanel, under sunlight', () => {
	/** A stage in Terrain view with sunlight on. */
	const sunlit = () => {
		const stage = createStage();
		stage.panel.setSunlight(true);
		return stage;
	};

	it('tells of the sunlight with the rest of the view, which starts with it off', () => {
		const stage = createStage();
		stage.panel.setWinds(true);
		expect(stage.told.at(-1)?.sunlight).toBe(false);
		stage.panel.setWinds(false);
		stage.panel.setSunlight(true);
		expect(stage.lastView()).toEqual({
			view: { ...DEFAULT_PAGE_VIEW, sunlight: true },
			playing: false,
		});
		expect(stage.told.at(-1)).toEqual({ ...DEFAULT_PAGE_VIEW, sunlight: true });
	});

	it('tells nothing for the sunlight it already has', () => {
		const stage = createStage();
		stage.panel.setSunlight(false);
		expect(stage.views).toEqual([]);
		expect(stage.told).toEqual([]);
	});

	it('plays the year in Terrain view, the month moving on with the globe on the terrain', () => {
		const stage = sunlit();
		stage.panel.togglePlaying();
		expect(stage.lastView()?.playing).toBe(true);
		stage.timers.advance(2 * PLAYBACK_STEP_MS);
		expect(stage.lastView()).toEqual({
			view: { ...DEFAULT_PAGE_VIEW, month: 8, sunlight: true },
			playing: true,
		});
		expect(stage.told.at(-1)?.month).toBe(8);
		expect(stage.shown).toEqual([]);
	});

	it('takes the month from the slider in Terrain view', () => {
		const stage = sunlit();
		stage.panel.setMonth(1);
		expect(stage.told.at(-1)).toEqual({
			...DEFAULT_PAGE_VIEW,
			month: 1,
			sunlight: true,
			winds: false,
			grid: false,
		});
		expect(stage.shown).toEqual([]);
	});

	it('stops the year when sunlight is turned off in Terrain view', () => {
		const stage = sunlit();
		stage.panel.togglePlaying();
		stage.timers.advance(PLAYBACK_STEP_MS);
		stage.panel.setSunlight(false);
		expect(stage.timers.pending()).toBe(0);
		expect(stage.lastView()).toEqual({
			view: { ...DEFAULT_PAGE_VIEW, month: 7 },
			playing: false,
		});
		stage.timers.advance(5 * PLAYBACK_STEP_MS);
		expect(stage.lastView()?.view.month).toBe(7);
	});

	it('keeps the year playing in Temperature view when sunlight is turned on or off', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		stage.panel.togglePlaying();
		stage.panel.setSunlight(true);
		expect(stage.lastView()?.playing).toBe(true);
		stage.panel.setSunlight(false);
		expect(stage.lastView()?.playing).toBe(true);
		expect(stage.timers.pending()).toBe(1);
	});

	it('keeps the year playing from the Month view to Terrain, and stops it on the way to a summary', () => {
		const stage = createStage();
		stage.panel.setSunlight(true);
		stage.panel.setLayer('temperature');
		stage.panel.togglePlaying();
		stage.panel.setLayer('terrain');
		expect(stage.lastView()?.playing).toBe(true);
		expect(stage.timers.pending()).toBe(1);
		stage.panel.setSummary('temperature', 'annualMean');
		expect(stage.lastView()?.playing).toBe(true);
		stage.panel.setLayer('temperature');
		expect(stage.lastView()?.playing).toBe(false);
		expect(stage.timers.pending()).toBe(0);
	});

	it('stops the year on a summary chosen in Temperature view, as without sunlight', () => {
		const stage = sunlit();
		stage.panel.setLayer('temperature');
		stage.panel.togglePlaying();
		stage.panel.setSummary('temperature', 'warmest');
		expect(stage.lastView()?.playing).toBe(false);
		expect(stage.timers.pending()).toBe(0);
	});

	it('keeps the month last on screen while a summary is shown', () => {
		const stage = sunlit();
		stage.panel.setLayer('temperature');
		stage.panel.setMonth(2);
		stage.panel.setSummary('temperature', 'range');
		stage.panel.setLayer('terrain');
		expect(stage.told.at(-1)).toEqual({
			layer: 'terrain',
			summaries: { temperature: 'range', pressure: 'month' },
			source: 'simulated',
			month: 2,
			sunlight: true,
			winds: false,
			grid: false,
		});
	});

	it('keeps the sunlight for a new world', () => {
		const stage = sunlit();
		stage.panel.setMonth(2);
		stage.panel.togglePlaying();
		stage.panel.newWorld(null);
		expect(stage.lastView()).toEqual({
			view: { ...DEFAULT_PAGE_VIEW, sunlight: true },
			playing: false,
		});
	});
});

describe('createLayerPanel, the summaries', () => {
	it.each([
		['annualMean', 'Annual average air temperature, °C'],
		['warmest', 'Air temperature in the warmest month, °C'],
		['coldest', 'Air temperature in the coldest month, °C'],
	] as const)("shows the %s on the year's scale and ramp", (view, caption) => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		const result = resultWith();
		stage.arrive(result);
		stage.panel.setSummary('temperature', view);
		const summary = summariseTemperature(result.months);
		const last = stage.shown.at(-1);
		expect(last?.field).toEqual(summary[view]);
		expect(last?.range).toBe(stage.shown[0]?.range);
		expect(last?.range).toEqual(yearRange(result));
		expect(last?.ramp).toBe(TEMPERATURE_RAMP);
		expect(stage.lastLegend()?.scale?.caption).toBe(caption);
		expect(layerCaption(TEMPERATURE_LAYER, view, 0)).toBe(caption);
		expect(stage.told.at(-1)?.summaries.temperature).toBe(view);
	});

	it('gives the expected values for each summary', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		stage.arrive(resultWith());
		const fieldFor = (view: Summary) => {
			stage.panel.setSummary('temperature', view);
			return Array.from(stage.shown.at(-1)?.field ?? []);
		};
		// Month m holds m - 30 and m + 10.
		expect(fieldFor('annualMean')).toEqual([-24.5, 15.5]);
		expect(fieldFor('warmest')).toEqual([-19, 21]);
		expect(fieldFor('coldest')).toEqual([-30, 10]);
		expect(fieldFor('range')).toEqual([11, 11]);
	});

	it('shows the seasonal range on its own scale from zero, in its own ramp', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		const result = resultWith();
		result.months[0]?.set([-40.5, 10]);
		stage.arrive(result);
		stage.panel.setSummary('temperature', 'range');
		const last = stage.shown.at(-1);
		expect(last?.field).toEqual(summariseTemperature(result.months).range);
		// Cell 0 runs from -40.5 in January to -19 in December.
		expect(last?.range).toEqual({ min: 0, max: 22 });
		expect(last?.ramp).toBe(SEASONAL_RANGE_RAMP);
		const legend = stage.lastLegend();
		expect(legend?.scale?.gradient).toBe(rampGradient(SEASONAL_RANGE_RAMP));
		expect(legend?.scale?.caption).toBe(
			'Seasonal range: difference between the warmest and coldest months, °C',
		);
		expect(tickLabels(legend)).toEqual(['0', '5', '10', '15', '20']);
		// Back to a month: the year's scale and ramp again.
		stage.panel.setSummary('temperature', 'month');
		expect(stage.shown.at(-1)?.range).toEqual(yearRange(result));
		expect(stage.shown.at(-1)?.ramp).toBe(TEMPERATURE_RAMP);
	});

	it('marks the seasonal range every 5 degrees, with no words at its ends', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		stage.arrive(resultOnGrid());
		expect(stage.lastLegend()?.scale).not.toHaveProperty('below');
		stage.panel.setSummary('temperature', 'range');
		expect(stage.shown.at(-1)?.range).toEqual({ min: 0, max: 44 });
		const legend = stage.lastLegend();
		expect(SEASONAL_RANGE_TICK_STEP).toBe(5);
		expect(tickLabels(legend)).toEqual([
			'0',
			'5',
			'10',
			'15',
			'20',
			'25',
			'30',
			'35',
			'40',
		]);
		expect(legend?.scale).not.toHaveProperty('below');
		expect(legend?.scale).not.toHaveProperty('above');
	});

	it('asks nothing for the temperature view already chosen', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		stage.arrive(resultWith());
		stage.panel.setSummary('temperature', 'range');
		const counts = () => [
			stage.shown.length,
			stage.views.length,
			stage.told.length,
			stage.legends.length,
		];
		const before = counts();
		stage.panel.setSummary('temperature', 'range');
		expect(counts()).toEqual(before);
	});

	it('works each summary out once per result, giving the same arrays again', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		const result = resultWith();
		stage.arrive(result);
		stage.panel.setSummary('temperature', 'annualMean');
		const mean = stage.shown.at(-1)?.field;
		const sent = stage.shown.length;
		stage.store.markOutOfDate();
		stage.store.markClimateCalculating();
		stage.store.setProgress(progressOf(1));
		expect(stage.shown).toHaveLength(sent);
		stage.panel.setSummary('temperature', 'range');
		const range = stage.shown.at(-1)?.field;
		const rangeScale = stage.shown.at(-1)?.range;
		stage.panel.setSummary('temperature', 'annualMean');
		expect(stage.shown.at(-1)?.field).toBe(mean);
		stage.panel.setSummary('temperature', 'range');
		expect(stage.shown.at(-1)?.field).toBe(range);
		expect(stage.shown.at(-1)?.range).toBe(rangeScale);
		// A new result has summaries of its own.
		stage.arrive(resultWith(5));
		expect(stage.shown.at(-1)?.field).not.toBe(range);
		expect(Array.from(stage.shown.at(-1)?.field ?? [])).toEqual([11, 11]);
	});

	it('works the summaries out afresh for a result that comes again after the store dropped it', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		stage.panel.setSummary('temperature', 'annualMean');
		const result = resultWith();
		stage.arrive(result);
		stage.store.clear();
		result.months.forEach((month) => {
			month.set([1, 2]);
		});
		stage.arrive(result);
		expect(Array.from(stage.shown.at(-1)?.field ?? [])).toEqual([1, 2]);
	});

	it('goes back to the height colours when the store drops its result in a summary', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		stage.panel.setSummary('temperature', 'range');
		stage.arrive(resultWith());
		stage.store.clear();
		expect(stage.shown.at(-1)?.field).toBeNull();
		expect(stage.lastLegend()?.scale).toBeNull();
	});

	it('says a seasonal range the globe refused could not be shown, and sends it at the next change', () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		stage.panel.setSummary('temperature', 'range');
		const failure = new RangeError('Refused once');
		stage.failNext(failure);
		const result = resultWith();
		stage.arrive(result);
		expect(stage.errors).toEqual([failure]);
		expect(stage.shown).toEqual([]);
		expect(stage.lastLegend()).toEqual({
			scale: null,
			state: 'unavailable',
			status: TEMPERATURE_NOT_SHOWN_TEXT,
			bar: null,
		});
		stage.store.markOutOfDate();
		expect(stage.shown.at(-1)?.ramp).toBe(SEASONAL_RANGE_RAMP);
		expect(stage.shown.at(-1)?.range).toEqual({ min: 0, max: 11 });
		expect(stage.lastLegend()?.scale?.gradient).toBe(
			rampGradient(SEASONAL_RANGE_RAMP),
		);
	});

	it("keeps the legend on what the globe shows while it refuses another view's field", () => {
		const stage = createStage();
		stage.panel.setLayer('temperature');
		const result = resultWith();
		stage.arrive(result);
		const failure = new RangeError('Refused once');
		stage.failNext(failure);
		// From a control, the error reaches whoever made the choice.
		expect(() => stage.panel.setSummary('temperature', 'range')).toThrow(
			failure,
		);
		expect(stage.shown.map((shown) => shown.field)).toEqual([
			result.months[DEFAULT_MONTH],
		]);
		const legend = stage.lastLegend();
		expect(legend?.scale?.caption).toBe('Air temperature in July, °C');
		expect(legend?.scale?.gradient).toBe(rampGradient(TEMPERATURE_RAMP));
		expect(legend?.status).toBe(LEGEND_OUT_OF_DATE_TEXT);
		// The view is chosen all the same, and its field sent at the next
		// change.
		expect(stage.lastView()?.view.summaries.temperature).toBe('range');
		stage.store.markOutOfDate();
		expect(stage.shown.at(-1)?.ramp).toBe(SEASONAL_RANGE_RAMP);
		expect(stage.lastLegend()?.scale?.gradient).toBe(
			rampGradient(SEASONAL_RANGE_RAMP),
		);
	});
});
