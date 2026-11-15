import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TemperatureProgress } from '../../core/index';
import { progressOf } from '../../core/testing/temperatureFixtures';
import { TEMPERATURE_RAMP } from '../globe/ramp';
import type { LayerStatus } from '../layers';
import {
	PRESSURE_LAYER,
	PRESSURE_UNAVAILABLE_TEXT,
	TEMPERATURE_LAYER,
	TEMPERATURE_NOT_SHOWN_TEXT,
	TEMPERATURE_UNAVAILABLE_TEXT,
} from '../scalarLayer';
import {
	byClass,
	createFakeDocument,
	type FakeElement,
	findAll,
	oneByClass,
} from '../testing/fakeDocument';
import { READOUT_OUT_OF_DATE_TEXT, type ReadoutText } from './cursorReadout';
import { createInfoBox, infoStatus } from './infoBox';
import {
	LEGEND_CALCULATING_TEXT,
	LEGEND_EMPTY_TEXT,
	LEGEND_FIRST_YEAR_TEXT,
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

/**
 * What the legend is shown for the temperature in a status, with its scale
 * on show; a calculation with the progress given.
 */
const legendOf = (
	status: LayerStatus,
	progress: TemperatureProgress | null = null,
	layer = TEMPERATURE_LAYER,
): LegendContent => legendContent(layer, { status, progress }, SOURCE, true);

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
		expect(infoStatus(null, null)).toEqual({ text: null, bar: null });
		expect(infoStatus(legendOf('current'), null)).toEqual({
			text: null,
			bar: null,
		});
		expect(infoStatus(null, keyOf('current'))).toEqual({
			text: null,
			bar: null,
		});
		expect(infoStatus(legendOf('current'), keyOf('current'))).toEqual({
			text: null,
			bar: null,
		});
	});

	it('says the legend’s line alone, with its bar, and the key’s alone, with none', () => {
		expect(infoStatus(legendOf('outOfDate'), null)).toEqual({
			text: LEGEND_OUT_OF_DATE_TEXT,
			bar: null,
		});
		expect(infoStatus(legendOf('empty'), null)).toEqual({
			text: LEGEND_EMPTY_TEXT,
			bar: null,
		});
		expect(infoStatus(legendOf('unavailable'), null)).toEqual({
			text: TEMPERATURE_UNAVAILABLE_TEXT,
			bar: null,
		});
		expect(infoStatus(legendOf('calculating'), null)).toEqual({
			text: LEGEND_FIRST_YEAR_TEXT,
			bar: { fraction: null },
		});
		expect(infoStatus(null, keyOf('calculating'))).toEqual({
			text: WINDS_CALCULATING_TEXT,
			bar: null,
		});
		expect(infoStatus(null, keyOf('unavailable'))).toEqual({
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
			const said = infoStatus(fromLegend, fromKey);
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
		expect(infoStatus(legendOf('calculating'), keyOf('unavailable')).text).toBe(
			WINDS_UNAVAILABLE_TEXT,
		);
		expect(infoStatus(legendOf('unavailable'), keyOf('calculating')).text).toBe(
			TEMPERATURE_UNAVAILABLE_TEXT,
		);
		expect(infoStatus(legendOf('outOfDate'), keyOf('calculating')).text).toBe(
			WINDS_CALCULATING_TEXT,
		);
		expect(infoStatus(legendOf('empty'), keyOf('outOfDate')).text).toBe(
			LEGEND_OUT_OF_DATE_TEXT,
		);
		expect(infoStatus(legendOf('current'), keyOf('empty')).text).toBe(
			LEGEND_EMPTY_TEXT,
		);
	});

	it('carries the progress of a temperature being calculated, whatever the key says of the winds waiting for it', () => {
		const progress = { ...progressOf(3), estimatedYearsLeft: 2 };
		expect(
			infoStatus(legendOf('calculating', progress), keyOf('calculating')),
		).toEqual({
			text: 'Calculating · year 3, about 2 to go',
			bar: { fraction: 0.6 },
		});
		expect(
			infoStatus(legendOf('calculating', progress), keyOf('outOfDate')),
		).toEqual({
			text: 'Calculating · year 3, about 2 to go',
			bar: { fraction: 0.6 },
		});
	});

	it('carries no progress for a layer that does not tell its years, nor for the winds', () => {
		const pressure = legendOf('calculating', null, PRESSURE_LAYER);
		expect(infoStatus(pressure, keyOf('calculating'))).toEqual({
			text: LEGEND_CALCULATING_TEXT,
			bar: { fraction: null },
		});
		expect(infoStatus(legendOf('current'), keyOf('calculating'))).toEqual({
			text: WINDS_CALCULATING_TEXT,
			bar: null,
		});
		expect(
			infoStatus(legendOf('unavailable', null, PRESSURE_LAYER), null).text,
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
		expect(infoStatus(legend, key)).toEqual({ text: 'Other words', bar: null });
		expect(
			infoStatus(legend, { state: 'empty', status: LEGEND_OUT_OF_DATE_TEXT }),
		).toEqual({ text: 'Some words', bar: null });
	});

	it('takes a layer that could not be shown as unavailable, and a kept earlier result as out of date', () => {
		const notShown = legendContent(
			TEMPERATURE_LAYER,
			{ status: 'current', progress: null },
			null,
			false,
		);
		expect(infoStatus(notShown, keyOf('calculating')).text).toBe(
			TEMPERATURE_NOT_SHOWN_TEXT,
		);
		const kept = legendContent(
			TEMPERATURE_LAYER,
			{ status: 'current', progress: null },
			SOURCE,
			false,
		);
		expect(infoStatus(kept, keyOf('empty')).text).toBe(LEGEND_OUT_OF_DATE_TEXT);
		expect(infoStatus(kept, keyOf('calculating')).text).toBe(
			WINDS_CALCULATING_TEXT,
		);
	});

	it.each([OBSERVED_WINDS_LOADING_TEXT, OBSERVED_WINDS_FAILED_TEXT])(
		'says the observed winds’ line “%s” only while the results are current',
		(observed) => {
			const key: WindKeyContent = { state: 'current', status: observed };
			expect(infoStatus(null, key).text).toBe(observed);
			expect(infoStatus(legendOf('current'), key).text).toBe(observed);
			for (const status of STATUSES.filter((each) => each !== 'current')) {
				const legend = legendOf(status);
				expect(infoStatus(legend, key).text).toBe(legend.status);
			}
		},
	);
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
			legendContent(
				TEMPERATURE_LAYER,
				{ status: 'empty', progress: null },
				null,
				false,
			),
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
		expect(parts.status.textContent).toBe(LEGEND_FIRST_YEAR_TEXT);
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
				{ status: 'current', progress: null },
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
