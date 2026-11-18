import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TemperatureProgress } from '../../../core/index';
import {
	progressOf,
	temperatureOf,
} from '../../../core/testing/temperatureFixtures';
import { TEMPERATURE_RAMP } from '../../globe/ramp';
import {
	createLayerStore,
	type LayerStatus,
	type LayerStore,
} from '../../layers/layers';
import {
	PRESSURE_LAYER,
	PRESSURE_UNAVAILABLE_TEXT,
	TEMPERATURE_LAYER,
	TEMPERATURE_NOT_SHOWN_TEXT,
	TEMPERATURE_UNAVAILABLE_TEXT,
} from '../../layers/scalar';
import { climateOf } from '../../testing/climateStore';
import {
	byClass,
	createFakeDocument,
	type FakeElement,
	findAll,
	oneByClass,
} from '../../testing/fakeDocument';
import { READOUT_OUT_OF_DATE_TEXT, type ReadoutText } from './cursorReadout';
import {
	CALCULATING_CLIMATE_TEXT,
	type CalculationContent,
	CLIMATE_UNAVAILABLE_TEXT,
	calculationContent,
	climateFraction,
	createInfoBox,
	infoStatus,
	PAUSED_TEXT,
	progressFraction,
	refiningClimateText,
} from './infoBox';
import {
	LEGEND_CALCULATING_TEXT,
	LEGEND_EMPTY_TEXT,
	LEGEND_OUT_OF_DATE_TEXT,
	type LegendContent,
	legendContent,
} from './legend';
import {
	OBSERVED_WINDS_FAILED_TEXT,
	OBSERVED_WINDS_LOADING_TEXT,
	WINDS_CALCULATING_TEXT,
	WINDS_UNAVAILABLE_TEXT,
	type WindKeyContent,
	windKeyContent,
} from './windKey';

/** What the globe shows of the temperature, for the legend to draw. */
const SOURCE = {
	range: { min: -10, max: 30 },
	ramp: TEMPERATURE_RAMP,
	caption: 'Air temperature in July, °C',
};

/** The statuses a layer can have, in no particular order. */
const STATUSES: readonly LayerStatus[] = [
	'current',
	'calculating',
	'outOfDate',
	'empty',
	'unavailable',
];

/** The calculation with both results current. */
const CALCULATED: CalculationContent = {
	state: 'current',
	status: null,
	bar: null,
};

/**
 * What the legend is shown for a layer, the temperature when none is given,
 * in a status, with its scale on show.
 */
const legendOf = (
	status: LayerStatus,
	layer = TEMPERATURE_LAYER,
): LegendContent => legendContent(layer, { status }, SOURCE, true);

/** What the key is shown for the winds in a status. */
const keyOf = (status: LayerStatus): WindKeyContent =>
	windKeyContent({ status });

/** The text of a place under the pointer, with a value and a wind. */
const READOUT: ReadoutText = {
	position: '27.9° N, 86.9° E',
	elevation: '8,123 m',
	value: '−18 °C',
	status: null,
	wind: '7 m/s NE',
	windStatus: null,
};

/**
 * What a line of the pointer's block reads, as drawn: its parts shown, a
 * value and its mark a space apart.
 */
const lineOf = (line: FakeElement): string =>
	line.children
		.filter((part) => !part.hidden)
		.map((part) =>
			part.children.length === 0
				? part.textContent
				: part.children
						.filter((piece) => !piece.hidden)
						.map((piece) => piece.textContent)
						.join(' '),
		)
		.join('');

describe('infoStatus', () => {
	it('says nothing while nothing is shown, and nothing while all is current', () => {
		expect(infoStatus(null, null, CALCULATED)).toEqual({
			text: null,
			bar: null,
		});
		expect(infoStatus(legendOf('current'), null, CALCULATED)).toEqual({
			text: null,
			bar: null,
		});
		expect(infoStatus(null, keyOf('current'), CALCULATED)).toEqual({
			text: null,
			bar: null,
		});
		expect(
			infoStatus(legendOf('current'), keyOf('current'), CALCULATED),
		).toEqual({
			text: null,
			bar: null,
		});
	});

	it('says the legend’s line alone, with its bar, and the key’s alone, with none', () => {
		expect(infoStatus(legendOf('outOfDate'), null, CALCULATED)).toEqual({
			text: LEGEND_OUT_OF_DATE_TEXT,
			bar: null,
		});
		expect(infoStatus(legendOf('empty'), null, CALCULATED)).toEqual({
			text: LEGEND_EMPTY_TEXT,
			bar: null,
		});
		expect(infoStatus(legendOf('unavailable'), null, CALCULATED)).toEqual({
			text: TEMPERATURE_UNAVAILABLE_TEXT,
			bar: null,
		});
		expect(infoStatus(legendOf('calculating'), null, CALCULATED)).toEqual({
			text: LEGEND_CALCULATING_TEXT,
			bar: { fraction: null },
		});
		expect(infoStatus(null, keyOf('calculating'), CALCULATED)).toEqual({
			text: WINDS_CALCULATING_TEXT,
			bar: null,
		});
		expect(infoStatus(null, keyOf('unavailable'), CALCULATED)).toEqual({
			text: WINDS_UNAVAILABLE_TEXT,
			bar: null,
		});
	});

	/** The statuses a line says, the worst first. */
	const WORST_FIRST: readonly LayerStatus[] = [
		'unavailable',
		'calculating',
		'outOfDate',
		'empty',
		'current',
	];

	it.each(
		STATUSES.flatMap((legend) => STATUSES.map((key) => [legend, key] as const)),
	)(
		'says the worse of a legend %s and a key %s, the legend’s when as bad',
		(legend, key) => {
			const worst = WORST_FIRST.find((status) =>
				[legend, key].includes(status),
			);
			const fromLegend = legendOf(legend);
			const fromKey = keyOf(key);
			const said = infoStatus(fromLegend, fromKey, CALCULATED);
			if (worst === 'current') {
				expect(said).toEqual({ text: null, bar: null });
			} else if (worst === legend) {
				expect(said).toEqual({ text: fromLegend.status, bar: fromLegend.bar });
			} else {
				expect(said).toEqual({ text: fromKey.status, bar: null });
			}
		},
	);

	it('puts unavailable before calculating, calculating before out of date, and out of date before not calculated yet', () => {
		expect(
			infoStatus(legendOf('calculating'), keyOf('unavailable'), CALCULATED)
				.text,
		).toBe(WINDS_UNAVAILABLE_TEXT);
		expect(
			infoStatus(legendOf('unavailable'), keyOf('calculating'), CALCULATED)
				.text,
		).toBe(TEMPERATURE_UNAVAILABLE_TEXT);
		expect(
			infoStatus(legendOf('outOfDate'), keyOf('calculating'), CALCULATED).text,
		).toBe(WINDS_CALCULATING_TEXT);
		expect(
			infoStatus(legendOf('empty'), keyOf('outOfDate'), CALCULATED).text,
		).toBe(LEGEND_OUT_OF_DATE_TEXT);
		expect(
			infoStatus(legendOf('current'), keyOf('empty'), CALCULATED).text,
		).toBe(LEGEND_EMPTY_TEXT);
	});

	it('carries no progress for a layer that does not tell its years, nor for the winds', () => {
		const pressure = legendOf('calculating', PRESSURE_LAYER);
		expect(infoStatus(pressure, keyOf('calculating'), CALCULATED)).toEqual({
			text: LEGEND_CALCULATING_TEXT,
			bar: { fraction: null },
		});
		expect(
			infoStatus(legendOf('current'), keyOf('calculating'), CALCULATED),
		).toEqual({
			text: WINDS_CALCULATING_TEXT,
			bar: null,
		});
		expect(
			infoStatus(legendOf('unavailable', PRESSURE_LAYER), null, CALCULATED)
				.text,
		).toBe(PRESSURE_UNAVAILABLE_TEXT);
	});

	it('ranks each line by the state it is given, whatever its words', () => {
		const legend: LegendContent = {
			scale: null,
			state: 'outOfDate',
			status: 'Some words',
			bar: null,
		};
		const key: WindKeyContent = { state: 'calculating', status: 'Other words' };
		expect(infoStatus(legend, key, CALCULATED)).toEqual({
			text: 'Other words',
			bar: null,
		});
		expect(
			infoStatus(
				legend,
				{ state: 'empty', status: LEGEND_OUT_OF_DATE_TEXT },
				CALCULATED,
			),
		).toEqual({ text: 'Some words', bar: null });
	});

	it('takes a layer that could not be shown as unavailable, and a kept earlier result as out of date', () => {
		const notShown = legendContent(
			TEMPERATURE_LAYER,
			{ status: 'current' },
			null,
			false,
		);
		expect(infoStatus(notShown, keyOf('calculating'), CALCULATED).text).toBe(
			TEMPERATURE_NOT_SHOWN_TEXT,
		);
		const kept = legendContent(
			TEMPERATURE_LAYER,
			{ status: 'current' },
			SOURCE,
			false,
		);
		expect(infoStatus(kept, keyOf('empty'), CALCULATED).text).toBe(
			LEGEND_OUT_OF_DATE_TEXT,
		);
		expect(infoStatus(kept, keyOf('calculating'), CALCULATED).text).toBe(
			WINDS_CALCULATING_TEXT,
		);
	});

	it.each([OBSERVED_WINDS_LOADING_TEXT, OBSERVED_WINDS_FAILED_TEXT])(
		'says the observed winds’ line “%s” only while the results are current',
		(observed) => {
			const key: WindKeyContent = { state: 'current', status: observed };
			expect(infoStatus(null, key, CALCULATED).text).toBe(observed);
			expect(infoStatus(legendOf('current'), key, CALCULATED).text).toBe(
				observed,
			);
			for (const status of STATUSES.filter((each) => each !== 'current')) {
				const legend = legendOf(status);
				expect(infoStatus(legend, key, CALCULATED).text).toBe(legend.status);
			}
		},
	);
});

/**
 * Where the calculation stands, with the temperature given, its progress
 * and the climate's pass under way.
 */
const calculationOf = (
	temperature: LayerStatus,
	paused = false,
	progress: TemperatureProgress | null = null,
	pass: number | null = temperature === 'calculating' ? 1 : null,
): CalculationContent =>
	calculationContent({ status: temperature, progress, pass }, paused);

describe('calculationContent', () => {
	it('names the climate while its first pass is calculated, with a bar of the temperature’s progress', () => {
		expect(calculationOf('calculating')).toEqual({
			state: 'calculating',
			status: CALCULATING_CLIMATE_TEXT,
			bar: { fraction: null },
		});
		expect(
			calculationOf('calculating', false, {
				...progressOf(3),
				estimatedYearsLeft: 1,
			}),
		).toEqual({
			state: 'calculating',
			status: CALCULATING_CLIMATE_TEXT,
			bar: { fraction: 0.75 },
		});
		// Calculated with no pass told, as by no climate, it is the first.
		expect(calculationOf('calculating', false, null, null).status).toBe(
			CALCULATING_CLIMATE_TEXT,
		);
	});

	it('names the pass under way while the climate is refined, with a full bar', () => {
		expect(calculationOf('calculating', false, null, 2)).toEqual({
			state: 'calculating',
			status: 'Refining climate (pass 2)',
			bar: { fraction: 1 },
		});
		expect(
			calculationOf(
				'calculating',
				false,
				{ ...progressOf(1), estimatedYearsLeft: 3 },
				5,
			),
		).toEqual({
			state: 'calculating',
			status: refiningClimateText(5),
			bar: { fraction: 1 },
		});
	});

	/** Progress with an estimate of the years left. */
	const yearsOf = (
		yearsDone: number,
		estimatedYearsLeft: number,
	): TemperatureProgress => ({ ...progressOf(yearsDone), estimatedYearsLeft });

	/**
	 * The bar's fractions as a climate goes through a store, from the
	 * moment it is asked for until its answer: each time its line is
	 * worked out from the temperature layer.
	 */
	const barThrough = (
		steps: readonly ((store: LayerStore) => void)[],
	): (number | null)[] => {
		const store = createLayerStore(() => {});
		store.markClimateCalculating();
		const fractions: (number | null)[] = [];
		const look = (): void => {
			const { bar } = calculationContent(store.temperature, false);
			if (bar !== null) {
				fractions.push(bar.fraction);
			}
		};
		look();
		for (const step of steps) {
			step(store);
			look();
		}
		return fractions;
	};

	/**
	 * Fails unless the fractions never fall back: none smaller than one
	 * before it, and none that does not know how far it has come once one
	 * did.
	 */
	const expectNeverBack = (fractions: readonly (number | null)[]): void => {
		let before: number | null = null;
		for (const fraction of fractions) {
			if (before !== null) {
				expect(fraction).not.toBeNull();
				expect(fraction ?? 0).toBeGreaterThanOrEqual(before);
			}
			before = fraction ?? before;
		}
	};

	it('moves its bar on and never back, through the years of the first pass and every pass after', () => {
		const pass = climateOf(temperatureOf(1));
		const fractions = barThrough([
			(store) => store.setProgress(progressOf(1), 1),
			(store) => store.setProgress(yearsOf(2, 6), 1),
			(store) => store.setProgress(yearsOf(6, 2), 1),
			(store) => store.setProgress(yearsOf(8, 0), 1),
			// The first pass finished: the second under way, no year done yet.
			(store) => store.setPass(pass, 1),
			(store) => store.setProgress(yearsOf(1, 2), 2),
			(store) => store.setPass(pass, 2),
			(store) => store.setProgress(yearsOf(1, 1), 3),
			(store) => store.setPass(pass, 3, true),
		]);
		expect(fractions.filter((fraction) => fraction !== null).length).toBe(
			fractions.length - 2,
		);
		expectNeverBack(fractions);
		expect(fractions.at(-1)).toBe(1);
	});

	it('keeps its bar where it was when the first pass is the last, as at a cap of one pass', () => {
		const fractions = barThrough([
			(store) => store.setProgress(yearsOf(1, 1), 1),
			(store) => store.setProgress(yearsOf(2, 0), 1),
			(store) => store.setPass(climateOf(temperatureOf(1)), 1, true),
		]);
		expect(fractions).toEqual([null, 0.5, 1, 1]);
		expectNeverBack(fractions);
	});

	it('says nothing while the results are current, paused or not', () => {
		const calculated = { state: 'current', status: null, bar: null };
		expect(calculationOf('current')).toEqual(calculated);
		expect(calculationOf('current', true)).toEqual(calculated);
	});

	it.each<[string, LayerStatus]>([
		['the climate out of date', 'outOfDate'],
		['no climate', 'empty'],
	])('says Paused for %s while paused', (_name, temperature) => {
		expect(calculationOf(temperature, true)).toEqual({
			state: 'paused',
			status: PAUSED_TEXT,
			bar: null,
		});
	});

	it('says in the legend’s words what is not current while not paused', () => {
		expect(calculationOf('outOfDate')).toEqual({
			state: 'outOfDate',
			status: LEGEND_OUT_OF_DATE_TEXT,
			bar: null,
		});
		expect(calculationOf('empty')).toEqual({
			state: 'empty',
			status: LEGEND_EMPTY_TEXT,
			bar: null,
		});
	});

	it('says a pass left to finish while paused is under way', () => {
		expect(calculationOf('calculating', true).status).toBe(
			CALCULATING_CLIMATE_TEXT,
		);
		expect(calculationOf('calculating', true, null, 3).status).toBe(
			refiningClimateText(3),
		);
	});

	it('says what can no longer be calculated, paused or not', () => {
		for (const paused of [false, true]) {
			expect(calculationOf('unavailable', paused)).toEqual({
				state: 'unavailable',
				status: CLIMATE_UNAVAILABLE_TEXT,
				bar: null,
			});
		}
	});
});

describe('progressFraction', () => {
	/** Progress with an estimate of the years left. */
	const progressWith = (
		yearsDone: number,
		estimatedYearsLeft: number | null,
	): TemperatureProgress => ({ ...progressOf(yearsDone), estimatedYearsLeft });

	it('knows nothing before any progress, nor while there is no estimate', () => {
		expect(progressFraction(null)).toBeNull();
		expect(progressFraction(progressWith(3, null))).toBeNull();
	});

	it('gives the years done over those done and expected to go, full on the last', () => {
		expect(progressFraction(progressWith(3, 2))).toBe(0.6);
		expect(progressFraction(progressWith(4, 1))).toBe(0.8);
		expect(progressFraction(progressWith(5, 0))).toBe(1);
	});
});

describe('climateFraction', () => {
	it('is the first pass’s progress, and then full', () => {
		const progress = { ...progressOf(1), estimatedYearsLeft: 3 };
		expect(climateFraction({ progress: null, pass: 1 })).toBeNull();
		expect(climateFraction({ progress, pass: 1 })).toBe(0.25);
		expect(climateFraction({ progress, pass: null })).toBe(0.25);
		expect(climateFraction({ progress, pass: 2 })).toBe(1);
		expect(climateFraction({ progress: null, pass: 8 })).toBe(1);
	});
});

describe('infoStatus with the calculation', () => {
	it('says the calculation’s line with its bar while nothing else is shown, as on Terrain', () => {
		expect(infoStatus(null, null, calculationOf('calculating'))).toEqual({
			text: CALCULATING_CLIMATE_TEXT,
			bar: { fraction: null },
		});
		expect(
			infoStatus(null, null, calculationOf('calculating', false, null, 2)),
		).toEqual({ text: refiningClimateText(2), bar: { fraction: 1 } });
		expect(infoStatus(null, null, calculationOf('current'))).toEqual({
			text: null,
			bar: null,
		});
	});

	it('says the calculation’s line over a current legend and key', () => {
		expect(
			infoStatus(
				legendOf('current'),
				keyOf('current'),
				calculationOf('calculating', false, null, 3),
			).text,
		).toBe(refiningClimateText(3));
	});

	it('puts Paused after calculating and unavailable, and before out of date and not calculated yet', () => {
		const paused = calculationOf('outOfDate', true);
		for (const status of ['outOfDate', 'empty'] as const) {
			expect(infoStatus(legendOf(status), keyOf(status), paused).text).toBe(
				PAUSED_TEXT,
			);
		}
		expect(infoStatus(legendOf('calculating'), null, paused).text).toBe(
			legendOf('calculating').status,
		);
		expect(infoStatus(null, keyOf('unavailable'), paused).text).toBe(
			WINDS_UNAVAILABLE_TEXT,
		);
	});

	it('says the legend’s line among lines as bad, then the calculation’s, then the key’s', () => {
		const outOfDate = calculationOf('outOfDate');
		const legend = legendOf('outOfDate');
		expect(infoStatus(legend, keyOf('outOfDate'), outOfDate)).toEqual({
			text: legend.status,
			bar: legend.bar,
		});
		const progress = { ...progressOf(2), estimatedYearsLeft: 2 };
		const calculating = calculationOf('calculating', false, progress);
		expect(infoStatus(null, keyOf('calculating'), calculating)).toEqual({
			text: CALCULATING_CLIMATE_TEXT,
			bar: { fraction: 0.5 },
		});
		const pressure = legendOf('unavailable', PRESSURE_LAYER);
		expect(infoStatus(pressure, null, calculationOf('unavailable')).text).toBe(
			PRESSURE_UNAVAILABLE_TEXT,
		);
	});

	it('says the climate’s line, by its pass, over any legend being calculated, the temperature’s with its years included', () => {
		const progress = { ...progressOf(3), estimatedYearsLeft: 1 };
		const pressure = legendOf('calculating', PRESSURE_LAYER);
		expect(
			infoStatus(
				pressure,
				keyOf('calculating'),
				calculationOf('calculating', false, progress),
			),
		).toEqual({ text: CALCULATING_CLIMATE_TEXT, bar: { fraction: 0.75 } });
		expect(
			infoStatus(
				legendOf('calculating'),
				keyOf('calculating'),
				calculationOf('calculating', false, progress),
			),
		).toEqual({ text: CALCULATING_CLIMATE_TEXT, bar: { fraction: 0.75 } });
		expect(
			infoStatus(
				legendOf('calculating'),
				null,
				calculationOf('calculating', false, null, 4),
			),
		).toEqual({ text: refiningClimateText(4), bar: { fraction: 1 } });
	});

	it('ranks the legend against the calculation by the state it is given, whatever its words', () => {
		const known: LegendContent = {
			scale: null,
			state: 'calculating',
			status: 'Some words',
			bar: { fraction: 0.25 },
		};
		const calculating = calculationOf('calculating');
		expect(infoStatus(known, null, calculating).text).toBe(
			CALCULATING_CLIMATE_TEXT,
		);
		expect(infoStatus(known, null, calculationOf('current'))).toEqual({
			text: 'Some words',
			bar: { fraction: 0.25 },
		});
		expect(
			infoStatus({ ...known, state: 'outOfDate' }, null, calculationOf('empty'))
				.text,
		).toBe('Some words');
	});
});

describe('createInfoBox', () => {
	beforeEach(() => {
		vi.stubGlobal('document', createFakeDocument().document);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const make = () => {
		const box = createInfoBox();
		const root = box.element as unknown as FakeElement;
		return {
			box,
			root,
			legend: oneByClass(root, 'legend'),
			status: oneByClass(root, 'info-box__status'),
			bar: oneByClass(root, 'info-box__bar'),
			readout: oneByClass(root, 'cursor-readout'),
		};
	};

	it('starts hidden, holding the legend, the status line and its bar, and the pointer’s read-out, in that order', () => {
		const { root } = make();
		expect(root.hidden).toBe(true);
		expect(root.children.map((child) => child.className)).toEqual([
			'legend',
			'info-box__status',
			'info-box__bar',
			'cursor-readout',
		]);
		for (const child of root.children) {
			if (child.className !== 'info-box__status') {
				expect(child.hidden).toBe(true);
			}
		}
	});

	it('has one live region, its status line, and hides the pointer’s read-out from screen readers', () => {
		const { root, status, readout, bar } = make();
		const live = [root, ...root.children].filter(
			(element) => element.getAttribute('aria-live') !== null,
		);
		expect(live).toEqual([status]);
		expect(status.getAttribute('aria-live')).toBe('polite');
		expect(readout.getAttribute('aria-hidden')).toBe('true');
		expect(bar.getAttribute('aria-label')).toBe('Calculation progress');
	});

	it.each(
		[false, true].flatMap((layer) =>
			[false, true].flatMap((winds) =>
				[false, true].map((pointer) => [layer, winds, pointer] as const),
			),
		),
	)(
		'with a computed layer %s, Winds %s and the pointer over the globe %s, shows just the blocks that apply',
		(layer, winds, pointer) => {
			const parts = make();
			parts.box.showLegend(layer ? legendOf('current') : null);
			parts.box.showWindKey(winds ? keyOf('current') : null);
			parts.box.showReadout(pointer ? READOUT : null);
			expect(parts.legend.hidden).toBe(!layer);
			expect(parts.readout.hidden).toBe(!pointer);
			// Current winds add nothing to the box.
			expect(parts.root.hidden).toBe(!layer && !pointer);
			// All is current, so there is nothing to say.
			expect(parts.status.textContent).toBe('');
			expect(parts.bar.hidden).toBe(true);
		},
	);

	it('shows no key, caption, sample arrows, streaks line or figures for the winds, whatever it is given', () => {
		const parts = make();
		const noKey = (): void => {
			for (const name of [
				'wind-key',
				'wind-key__caption',
				'wind-key__row',
				'wind-key__arrow',
				'wind-key__label',
				'wind-key__streaks',
				'wind-figures',
			]) {
				expect(byClass(parts.root, name)).toEqual([]);
			}
			expect(
				findAll(parts.root, (element) => element.tagName === 'SVG'),
			).toEqual([]);
			const words = findAll(parts.root, () => true).map(
				(element) => element.textContent,
			);
			expect(words).not.toContain('Surface wind');
			expect(words).not.toContain('Faster, longer streaks are stronger winds');
			expect(words).not.toContain('5 m/s');
			expect(words).not.toContain('10+ m/s');
			for (const word of words) {
				expect(word ?? '').not.toMatch(/^Wind:|correct direction|Off by/);
			}
		};
		noKey();
		for (const status of STATUSES) {
			parts.box.showWindKey(keyOf(status));
			noKey();
		}
		parts.box.showLegend(legendOf('current'));
		parts.box.showReadout(READOUT);
		noKey();
	});

	it('shows the box for a status line alone, while the layer has no scale yet, and hides it again for nothing', () => {
		const parts = make();
		parts.box.showLegend(
			legendContent(TEMPERATURE_LAYER, { status: 'empty' }, null, false),
		);
		expect(parts.legend.hidden).toBe(true);
		expect(parts.root.hidden).toBe(false);
		expect(parts.status.textContent).toBe(LEGEND_EMPTY_TEXT);
		parts.box.showLegend(null);
		expect(parts.root.hidden).toBe(true);
		expect(parts.status.textContent).toBe('');
	});

	it('keeps its status line in the page as the words come and go', () => {
		const parts = make();
		parts.box.showLegend(legendOf('outOfDate'));
		expect(parts.status.hidden).toBe(false);
		expect(parts.status.textContent).toBe(LEGEND_OUT_OF_DATE_TEXT);
		parts.box.showLegend(legendOf('current'));
		expect(parts.status.hidden).toBe(false);
		expect(parts.status.textContent).toBe('');
	});

	it('says one line for the legend and the key together, never two', () => {
		const parts = make();
		parts.box.showLegend(legendOf('outOfDate'));
		parts.box.showWindKey(keyOf('calculating'));
		expect(byClass(parts.root, 'legend__status')).toEqual([]);
		expect(byClass(parts.root, 'wind-key__status')).toEqual([]);
		expect(parts.status.textContent).toBe(WINDS_CALCULATING_TEXT);
		parts.box.showWindKey(keyOf('current'));
		expect(parts.status.textContent).toBe(LEGEND_OUT_OF_DATE_TEXT);
		parts.box.showLegend(null);
		expect(parts.status.textContent).toBe('');
	});

	it('rewrites its status line only when the words change, so each change is announced once', () => {
		const parts = make();
		parts.box.showLegend({
			scale: null,
			state: 'calculating',
			status: 'year 3',
			bar: { fraction: 0.2 },
		});
		const writes = vi.spyOn(parts.status, 'textContent', 'set');
		parts.box.showLegend({
			scale: null,
			state: 'calculating',
			status: 'year 3',
			bar: { fraction: 0.4 },
		});
		parts.box.showWindKey(keyOf('calculating'));
		expect(writes).not.toHaveBeenCalled();
		parts.box.showLegend({
			scale: null,
			state: 'calculating',
			status: 'year 4',
			bar: { fraction: 0.6 },
		});
		expect(writes).toHaveBeenCalledTimes(1);
		expect(parts.status.textContent).toBe('year 4');
	});

	it('never rewrites its status line for the pointer', () => {
		const parts = make();
		parts.box.showLegend(legendOf('outOfDate'));
		const writes = vi.spyOn(parts.status, 'textContent', 'set');
		parts.box.showReadout(READOUT);
		parts.box.showReadout({ ...READOUT, elevation: '8,124 m' });
		parts.box.showReadout(null);
		expect(writes).not.toHaveBeenCalled();
		expect(parts.status.textContent).toBe(LEGEND_OUT_OF_DATE_TEXT);
	});

	it('shows the progress line and a bar that knows how far it has come', () => {
		const parts = make();
		parts.box.showLegend({
			scale: null,
			state: 'calculating',
			status: 'year 3',
			bar: { fraction: 0.6 },
		});
		expect(parts.legend.hidden).toBe(true);
		expect(parts.status.textContent).toBe('year 3');
		expect(parts.bar.hidden).toBe(false);
		expect(parts.bar.getAttribute('value')).toBe('0.6');
	});

	it('draws a bar with no value while how far it has come is not known, and none once current', () => {
		const parts = make();
		parts.box.showLegend({
			scale: null,
			state: 'calculating',
			status: 'year 3',
			bar: { fraction: 0.6 },
		});
		parts.box.showLegend({
			scale: null,
			state: 'calculating',
			status: 'year 3',
			bar: { fraction: null },
		});
		expect(parts.bar.hidden).toBe(false);
		expect(parts.bar.getAttribute('value')).toBeNull();
		parts.box.showLegend(legendOf('current'));
		expect(parts.bar.hidden).toBe(true);
	});

	it('shows the box for the calculation’s line alone, with its bar, and hides it once all is current', () => {
		const parts = make();
		parts.box.showCalculation(
			calculationOf('calculating', false, {
				...progressOf(1),
				estimatedYearsLeft: 3,
			}),
		);
		expect(parts.root.hidden).toBe(false);
		expect(parts.legend.hidden).toBe(true);
		expect(parts.status.textContent).toBe(CALCULATING_CLIMATE_TEXT);
		expect(parts.bar.hidden).toBe(false);
		expect(parts.bar.getAttribute('value')).toBe('0.25');

		parts.box.showCalculation(calculationOf('calculating', false, null, 2));
		expect(parts.status.textContent).toBe('Refining climate (pass 2)');
		expect(parts.bar.getAttribute('value')).toBe('1');

		parts.box.showCalculation(calculationOf('empty', true));
		expect(parts.status.textContent).toBe(PAUSED_TEXT);
		expect(parts.bar.hidden).toBe(true);

		parts.box.showCalculation(calculationOf('current'));
		expect(parts.status.textContent).toBe('');
		expect(parts.root.hidden).toBe(true);
	});

	it('draws no bar for the key’s line, though it is a calculation’s', () => {
		const parts = make();
		parts.box.showWindKey(keyOf('calculating'));
		expect(parts.status.textContent).toBe(WINDS_CALCULATING_TEXT);
		expect(parts.bar.hidden).toBe(true);
	});

	it('says the observed winds’ loading on the status line once the winds are current', () => {
		const parts = make();
		parts.box.showWindKey({
			state: 'current',
			status: OBSERVED_WINDS_LOADING_TEXT,
		});
		expect(parts.status.textContent).toBe(OBSERVED_WINDS_LOADING_TEXT);
		parts.box.showLegend(legendOf('calculating'));
		expect(parts.status.textContent).toBe(LEGEND_CALCULATING_TEXT);
		parts.box.showLegend(legendOf('current'));
		expect(parts.status.textContent).toBe(OBSERVED_WINDS_LOADING_TEXT);
		parts.box.showWindKey({
			state: 'current',
			status: OBSERVED_WINDS_FAILED_TEXT,
		});
		expect(parts.status.textContent).toBe(OBSERVED_WINDS_FAILED_TEXT);
	});

	it('words the legend’s scale and figures and the pointer’s two lines as they are given', () => {
		const parts = make();
		parts.box.showLegend(
			legendContent(
				TEMPERATURE_LAYER,
				{ status: 'current' },
				{
					...SOURCE,
					figures: { meanDifference: 1.25, rmsDifference: 2.04 },
				},
				true,
			),
		);
		expect(oneByClass(parts.legend, 'legend__caption').textContent).toBe(
			'Air temperature in July, °C',
		);
		expect(
			byClass(parts.legend, 'legend__tick').map((tick) => tick.textContent),
		).toEqual(['−10', '0', '10', '20', '30']);
		expect(byClass(parts.legend, 'legend__ends')).toEqual([]);
		expect(oneByClass(parts.legend, 'legend__figures').textContent).toBe(
			'Mean +1.3 °C · RMS 2.0 °C',
		);
		parts.box.showReadout({
			...READOUT,
			status: READOUT_OUT_OF_DATE_TEXT,
		});
		const part = (name: string) =>
			oneByClass(parts.readout, `cursor-readout__${name}`).textContent;
		expect(part('position')).toBe('27.9° N, 86.9° E');
		expect(part('elevation')).toBe('8,123 m');
		expect(part('value')).toBe('−18 °C');
		expect(part('status')).toBe('out of date');
		expect(part('wind-value')).toBe('7 m/s NE');
		expect(parts.readout.children.map((line) => lineOf(line))).toEqual([
			'27.9° N, 86.9° E · 8,123 m',
			'−18 °C out of date · 7 m/s NE',
		]);
	});
});
