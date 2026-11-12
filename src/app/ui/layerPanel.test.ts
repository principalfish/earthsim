import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TemperatureResult } from '../../core/index';
import {
	progressOf,
	temperatureOf,
} from '../../core/testing/temperatureFixtures';
import {
	type ColourRamp,
	rampGradient,
	TEMPERATURE_RAMP,
	type ValueRange,
} from '../globe/ramp';
import { createLayerStore, type LayerStore } from '../layers';
import {
	byClass,
	createFakeDocument,
	type FakeDocument,
	type FakeElement,
	oneByClass,
} from '../testing/fakeDocument';
import { type Layer, SHOWN_MONTH } from '../view';
import {
	createLayerControls,
	createLayerPanel,
	type LayerControlsOptions,
	TEMPERATURE_CAPTION,
} from './layerPanel';
import {
	fitRange,
	LEGEND_EMPTY_TEXT,
	LEGEND_NOT_SHOWN_TEXT,
	LEGEND_OUT_OF_DATE_TEXT,
	LEGEND_UNAVAILABLE_TEXT,
	type LegendContent,
} from './legend';

/** What the globe was asked to show: a field, its range and ramp, or none. */
type Shown = {
	readonly field: Float32Array | null;
	readonly range?: ValueRange;
	readonly ramp?: ColourRamp;
};

/**
 * A result whose months each hold different values: month m holds m - 30
 * and m + 10 in its two cells, so January holds the coldest value and
 * December the hottest, and every month's field is told apart.
 */
const resultWith = (offset = 0): TemperatureResult => {
	const result = temperatureOf(1);
	result.months.forEach((month, m) => {
		month.set([m - 30 + offset, m + 10 + offset]);
	});
	return result;
};

/** A result whose every month runs from min in one cell to max in the other. */
const resultSpanning = (min: number, max: number): TemperatureResult => {
	const result = temperatureOf(1);
	for (const month of result.months) {
		month.set([min, max]);
	}
	return result;
};

/** The labels of the ticks along a legend's scale, if it has one. */
const tickLabels = (legend: LegendContent | null | undefined) =>
	legend?.scale?.ticks.map((tick) => tick.label);

/** The layer panel on a real store, with stand-ins for everything else. */
const createStage = () => {
	const errors: unknown[] = [];
	const store: LayerStore = createLayerStore((error) => errors.push(error));
	const shown: Shown[] = [];
	const showing: boolean[] = [];
	const legends: (LegendContent | null)[] = [];
	let controls: LayerControlsOptions | undefined;
	/** What the globe throws when next asked to show something, if anything. */
	let failure: Error | null = null;
	createLayerPanel({
		store,
		globe: {
			setLayer: (field, range, ramp) => {
				if (failure !== null) {
					const thrown = failure;
					failure = null;
					throw thrown;
				}
				shown.push({ field, range, ramp });
			},
		},
		temperature: { setShowing: (next) => showing.push(next) },
		createControls: (options) => {
			controls = options;
			return { showLegend: (content) => legends.push(content) };
		},
	});
	const required = (): LayerControlsOptions => {
		if (controls === undefined) {
			throw new Error('The panel made no controls');
		}
		return controls;
	};
	/** Has a result arrive, current, as the scheduler does. */
	const arrive = (result: TemperatureResult): void => {
		store.markCalculating();
		store.setResult(result, true);
	};
	return {
		store,
		errors,
		shown,
		showing,
		legends,
		get controls() {
			return required();
		},
		arrive,
		lastLegend: () => legends.at(-1),
		/** Has the globe throw this the next time it is asked to show something. */
		failNext: (error: Error): void => {
			failure = error;
		},
	};
};

describe('createLayerPanel', () => {
	it('opens on the terrain, asking nothing of the globe or the temperature', () => {
		const stage = createStage();
		expect(stage.controls.layer).toBe('terrain');
		expect(stage.shown).toEqual([]);
		expect(stage.showing).toEqual([]);
		expect(stage.legends).toEqual([null]);
	});

	it('leaves the globe on the terrain while a result arrives in Terrain view', () => {
		const stage = createStage();
		stage.arrive(resultWith());
		expect(stage.shown).toEqual([]);
		expect(stage.legends.every((legend) => legend === null)).toBe(true);
	});

	it('switches the temperature on when chosen, and says nothing is there yet', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		expect(stage.showing).toEqual([true]);
		expect(stage.shown).toEqual([]);
		expect(stage.lastLegend()).toEqual({
			scale: null,
			status: LEGEND_EMPTY_TEXT,
			bar: null,
		});
	});

	it("shows July's field once a result arrives, on the year's fitted range and the ramp", () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		const result = resultWith();
		stage.arrive(result);
		expect(stage.shown).toHaveLength(1);
		const [first] = stage.shown;
		expect(first?.field).toBe(result.months[SHOWN_MONTH]);
		expect(first?.range).toEqual({ min: -30, max: 21 });
		expect(first?.range).toEqual(fitRange(result.months));
		expect(first?.ramp).toBe(TEMPERATURE_RAMP);
		const legend = stage.lastLegend();
		expect(legend?.status).toBeNull();
		expect(legend?.scale?.gradient).toBe(rampGradient(TEMPERATURE_RAMP));
		expect(legend?.scale?.ticks.map((tick) => tick.label)).toEqual([
			'−30',
			'−20',
			'−10',
			'0',
			'10',
			'20',
		]);
	});

	it('shows the result on hand at once when chosen again', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		const result = resultWith();
		stage.arrive(result);
		stage.controls.onLayer('terrain');
		stage.controls.onLayer('temperature');
		expect(stage.shown.map((shown) => shown.field)).toEqual([
			result.months[SHOWN_MONTH],
			null,
			result.months[SHOWN_MONTH],
		]);
		expect(stage.shown[2]?.field).toBe(result.months[SHOWN_MONTH]);
		expect(stage.showing).toEqual([true, false, true]);
	});

	it('goes back to the height colours and switches the temperature off for Terrain', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		stage.arrive(resultWith());
		stage.controls.onLayer('terrain');
		expect(stage.shown.at(-1)).toEqual({
			field: null,
			range: undefined,
			ramp: undefined,
		});
		expect(stage.showing).toEqual([true, false]);
		expect(stage.lastLegend()).toBeNull();
	});

	it('asks nothing for a layer chosen again that is already on show', () => {
		const stage = createStage();
		stage.controls.onLayer('terrain');
		stage.controls.onLayer('temperature');
		stage.controls.onLayer('temperature');
		expect(stage.showing).toEqual([true]);
	});

	it('sends each new result to the globe, on its own range', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		stage.arrive(resultWith());
		const next = resultWith(5);
		stage.arrive(next);
		expect(stage.shown).toHaveLength(2);
		expect(stage.shown[1]?.field).toBe(next.months[SHOWN_MONTH]);
		expect(stage.shown[1]?.range).toEqual({ min: -25, max: 26 });
	});

	it('keeps the previous field on the globe while it is out of date or calculated again', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		const result = resultWith();
		stage.arrive(result);
		stage.store.markOutOfDate();
		expect(stage.lastLegend()?.status).toBe(LEGEND_OUT_OF_DATE_TEXT);
		expect(stage.lastLegend()?.scale).not.toBeNull();
		stage.store.markCalculating();
		stage.store.setProgress({ ...progressOf(2), estimatedYearsLeft: 2 });
		expect(stage.lastLegend()?.status).toBe(
			'Calculating · year 2, about 2 to go',
		);
		expect(stage.lastLegend()?.bar).toEqual({ fraction: 0.5 });
		expect(stage.lastLegend()?.scale).not.toBeNull();
		stage.store.markFailed();
		expect(stage.shown).toHaveLength(1);
		expect(stage.shown[0]?.field).toBe(result.months[SHOWN_MONTH]);
	});

	it('goes back to the height colours when the store drops its result, as for a new world', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		stage.arrive(resultWith());
		stage.store.clear();
		expect(stage.shown.at(-1)?.field).toBeNull();
		expect(stage.lastLegend()).toEqual({
			scale: null,
			status: LEGEND_EMPTY_TEXT,
			bar: null,
		});
		// The choice is kept: the new world's result is shown when it comes.
		const next = resultWith(1);
		stage.arrive(next);
		expect(stage.shown.at(-1)?.field).toBe(next.months[SHOWN_MONTH]);
		expect(stage.showing).toEqual([true]);
	});

	it('fits a result afresh that comes again after the store dropped it', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		const result = resultWith();
		stage.arrive(result);
		stage.store.clear();
		// The same result, with other values: a scale kept from before the
		// store dropped it would no longer fit.
		result.months.forEach((month, m) => {
			month.set([m - 50, m + 50]);
		});
		stage.arrive(result);
		expect(stage.shown.at(-1)?.range).toEqual({ min: -50, max: 61 });
	});

	it('keeps the field on the globe once the temperature is unavailable', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		const result = resultWith();
		stage.arrive(result);
		stage.store.markUnavailable();
		expect(stage.shown.map((shown) => shown.field)).toEqual([
			result.months[SHOWN_MONTH],
		]);
		expect(stage.lastLegend()?.status).toBe(LEGEND_UNAVAILABLE_TEXT);
		expect(stage.lastLegend()?.scale).not.toBeNull();
	});

	it('says the temperature is unavailable with no result, leaving the terrain', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		stage.store.markUnavailable();
		expect(stage.shown).toEqual([]);
		expect(stage.lastLegend()).toEqual({
			scale: null,
			status: LEGEND_UNAVAILABLE_TEXT,
			bar: null,
		});
	});

	it('records what the globe throws, still updates the legend, and shows the next result', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		const failure = new RangeError('The field is not one value per cell');
		stage.failNext(failure);
		stage.arrive(resultWith());
		expect(stage.errors).toEqual([failure]);
		// The globe was left on the terrain, so the legend has no scale, and
		// it says the temperature could not be shown, not that it is still
		// being calculated.
		expect(stage.shown).toEqual([]);
		expect(stage.lastLegend()?.status).toBe(LEGEND_NOT_SHOWN_TEXT);
		expect(stage.lastLegend()?.scale).toBeNull();
		// Straight to the next result, with no change between to send the
		// first again.
		const next = resultWith(5);
		stage.store.setResult(next, true);
		expect(stage.shown.map((shown) => shown.field)).toEqual([
			next.months[SHOWN_MONTH],
		]);
		expect(stage.shown[0]?.range).toEqual({ min: -25, max: 26 });
		expect(stage.lastLegend()?.status).toBeNull();
		expect(stage.errors).toEqual([failure]);
	});

	it('sends a field the globe refused again at the next change', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		const result = resultWith();
		stage.failNext(new RangeError('Refused once'));
		stage.arrive(result);
		stage.store.markOutOfDate();
		expect(stage.shown.map((shown) => shown.field)).toEqual([
			result.months[SHOWN_MONTH],
		]);
		expect(stage.errors).toHaveLength(1);
	});

	it("keeps the legend on the globe's scale while the globe refuses a new result, until it takes it", () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		const first = resultSpanning(-10, 10);
		stage.arrive(first);
		const firstTicks = ['−10', '−5', '0', '5', '10'];
		expect(tickLabels(stage.lastLegend())).toEqual(firstTicks);
		const failure = new RangeError('Refused once');
		stage.failNext(failure);
		const second = resultSpanning(0, 40);
		stage.store.markCalculating();
		stage.store.setResult(second, false);
		expect(stage.errors).toEqual([failure]);
		// The globe still shows the first result, and the legend its scale,
		// while its line says where the store's result stands.
		expect(stage.shown.map((shown) => shown.field)).toEqual([
			first.months[SHOWN_MONTH],
		]);
		expect(tickLabels(stage.lastLegend())).toEqual(firstTicks);
		expect(stage.lastLegend()?.status).toBe(LEGEND_OUT_OF_DATE_TEXT);
		// The next change sends the refused field again; taken, the legend
		// moves to its scale.
		stage.store.markCalculating();
		expect(stage.shown.at(-1)?.field).toBe(second.months[SHOWN_MONTH]);
		expect(stage.shown.at(-1)?.range).toEqual({ min: 0, max: 40 });
		expect(tickLabels(stage.lastLegend())).toEqual([
			'0',
			'10',
			'20',
			'30',
			'40',
		]);
		expect(stage.errors).toEqual([failure]);
	});

	it('marks the earlier result out of date while the globe refuses a current one, until it takes it', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		const first = resultSpanning(-10, 10);
		stage.arrive(first);
		expect(stage.lastLegend()?.status).toBeNull();
		const failure = new RangeError('Refused once');
		stage.failNext(failure);
		const second = resultSpanning(0, 40);
		stage.store.markCalculating();
		stage.store.setResult(second, true);
		expect(stage.store.temperature.status).toBe('current');
		expect(stage.errors).toEqual([failure]);
		// The globe still shows the first result, on its scale, and the
		// legend does not pass it off as the current one.
		expect(stage.shown.map((shown) => shown.field)).toEqual([
			first.months[SHOWN_MONTH],
		]);
		expect(tickLabels(stage.lastLegend())).toEqual([
			'−10',
			'−5',
			'0',
			'5',
			'10',
		]);
		expect(stage.lastLegend()?.status).toBe(LEGEND_OUT_OF_DATE_TEXT);
		// Leaving for the terrain and coming back sends the refused field;
		// taken, the legend moves to its scale with nothing said.
		stage.controls.onLayer('terrain');
		stage.controls.onLayer('temperature');
		expect(stage.shown.at(-1)?.field).toBe(second.months[SHOWN_MONTH]);
		expect(tickLabels(stage.lastLegend())).toEqual([
			'0',
			'10',
			'20',
			'30',
			'40',
		]);
		expect(stage.lastLegend()?.status).toBeNull();
	});

	it('shows no scale but says where the result stands when the first field is refused', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		stage.failNext(new RangeError('Refused once'));
		stage.store.markCalculating();
		stage.store.setResult(resultSpanning(-10, 10), false);
		expect(stage.shown).toEqual([]);
		expect(stage.lastLegend()).toEqual({
			scale: null,
			status: LEGEND_OUT_OF_DATE_TEXT,
			bar: null,
		});
	});

	it('says a current first result the globe refused could not be shown, until it takes one', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		stage.failNext(new RangeError('Refused once'));
		stage.arrive(resultSpanning(-10, 10));
		expect(stage.store.temperature.status).toBe('current');
		expect(stage.shown).toEqual([]);
		expect(stage.lastLegend()).toEqual({
			scale: null,
			status: LEGEND_NOT_SHOWN_TEXT,
			bar: null,
		});
		// The next result, straight after with no change between, is taken,
		// and its scale replaces the line.
		const next = resultSpanning(0, 40);
		stage.store.setResult(next, true);
		expect(stage.shown.map((shown) => shown.field)).toEqual([
			next.months[SHOWN_MONTH],
		]);
		expect(stage.lastLegend()?.status).toBeNull();
		expect(tickLabels(stage.lastLegend())).toEqual([
			'0',
			'10',
			'20',
			'30',
			'40',
		]);
	});

	it('records nothing as an error in normal use', () => {
		const stage = createStage();
		stage.controls.onLayer('temperature');
		stage.arrive(resultWith());
		stage.store.markOutOfDate();
		stage.store.clear();
		expect(stage.errors).toEqual([]);
	});
});

describe('createLayerControls', () => {
	let fake: FakeDocument;
	beforeEach(() => {
		fake = createFakeDocument();
		vi.stubGlobal('document', fake.document);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const make = (layer: Layer = 'terrain') => {
		const chosen: string[] = [];
		const panel = fake.createElement('aside');
		const controls = createLayerControls(panel as unknown as HTMLElement, {
			layer,
			onLayer: (next) => chosen.push(next),
		});
		const [section] = panel.children as [FakeElement];
		const radios = (name: string): FakeElement[] =>
			byClass(section, 'segmented__input').filter(
				(input) => input.name === name,
			);
		return { controls, chosen, section, radios };
	};

	it('adds a Layers section with Terrain chosen and the legend hidden', () => {
		const { section, radios } = make();
		expect(oneByClass(section, 'panel__heading').textContent).toBe('Layers');
		expect(
			radios('layer').map((radio) => [radio.value, radio.checked]),
		).toEqual([
			['terrain', true],
			['temperature', false],
		]);
		expect(
			byClass(section, 'segmented__label').map((label) => label.textContent),
		).toEqual(['Terrain', 'Temperature']);
		const legend = oneByClass(section, 'legend');
		expect(legend.hidden).toBe(true);
		expect(oneByClass(legend, 'legend__caption').textContent).toBe(
			TEMPERATURE_CAPTION,
		);
	});

	it('starts on the layer it is given', () => {
		const { radios } = make('temperature');
		expect(
			radios('layer').map((radio) => [radio.value, radio.checked]),
		).toEqual([
			['terrain', false],
			['temperature', true],
		]);
	});

	it('passes on the layer chosen', () => {
		const { radios, chosen } = make();
		fake.pick(radios('layer')[1] as FakeElement);
		fake.pick(radios('layer')[0] as FakeElement);
		expect(chosen).toEqual(['temperature', 'terrain']);
	});

	it('shows the legend it is given', () => {
		const { controls, section } = make();
		controls.showLegend({ scale: null, status: 'x', bar: null });
		expect(oneByClass(section, 'legend').hidden).toBe(false);
		controls.showLegend(null);
		expect(oneByClass(section, 'legend').hidden).toBe(true);
	});
});
