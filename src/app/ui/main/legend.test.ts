import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TemperatureProgress } from '../../../core/index';
import { weightedQuantiles } from '../../../core/index';
import {
	progressOf,
	temperatureOf,
} from '../../../core/testing/temperatureFixtures';
import {
	PRESSURE_RAMP,
	rampGradient,
	SEASONAL_RANGE_RAMP,
	TEMPERATURE_RAMP,
} from '../../globe/ramp';
import type { TemperatureLayer } from '../../layers/layers';
import {
	fitSummaryScale,
	inUnit,
	PRESSURE_LAYER,
	summaryOf,
	TEMPERATURE_LAYER,
	TEMPERATURE_NOT_SHOWN_TEXT,
	TEMPERATURE_UNAVAILABLE_TEXT,
	toLayerUnit,
	yearField,
} from '../../layers/scalar';
import { cellWeights, FIT_TAIL_SHARE } from '../../layers/scalar/fit';
import {
	earthLikePressure,
	earthLikeTemperature,
} from '../../testing/earthLikeFixtures';
import {
	byClass,
	createFakeDocument,
	type FakeElement,
	oneByClass,
} from '../../testing/fakeDocument';
import { SEVEN_STOP_RAMP, TWO_STOP_RAMP } from '../../testing/rampFixtures';
import { MADE_UP_LAYER, weightedMean } from '../../testing/scalarLayerFixtures';
import {
	createLegend,
	formatFigures,
	LEGEND_CALCULATING_TEXT,
	LEGEND_EMPTY_TEXT,
	LEGEND_OUT_OF_DATE_TEXT,
	legendContent,
	legendTicks,
	MAX_LEGEND_TICKS,
	MAX_STEPPED_TICKS,
	tickPosition,
} from './legend';

describe('legendTicks', () => {
	it('marks a narrow range at fine round steps', () => {
		expect(legendTicks(14.25, 15.1)).toEqual([14.4, 14.6, 14.8, 15]);
	});

	it('marks a wide range at coarse round steps', () => {
		expect(legendTicks(-62.3, 41.7)).toEqual([-60, -40, -20, 0, 20, 40]);
	});

	it('marks a range below zero alone', () => {
		expect(legendTicks(-80.5, -31.2)).toEqual([-80, -70, -60, -50, -40]);
	});

	it('marks the ends of a range that falls on round values', () => {
		expect(legendTicks(-10, 10)).toEqual([-10, -5, 0, 5, 10]);
	});

	it('marks ends on a step that does not divide exactly', () => {
		// 0.3 / 0.05 is 5.999…, which would leave 0.3 out.
		expect(legendTicks(0.1, 0.3)).toEqual([0.1, 0.15, 0.2, 0.25, 0.3]);
		expect(legendTicks(-0.3, -0.1)).toEqual([-0.3, -0.25, -0.2, -0.15, -0.1]);
	});

	it('writes zero without a sign', () => {
		expect(
			Object.is(
				legendTicks(-1, 1).find((tick) => tick === 0),
				0,
			),
		).toBe(true);
	});

	it('gives two to the most ticks, round and inside, for any range', () => {
		// Ranges from a fixed sequence, from a tenth of a degree to hundreds.
		let seed = 7;
		const next = (): number => {
			seed = (seed * 16807) % 2147483647;
			return seed / 2147483647;
		};
		for (let i = 0; i < 500; i++) {
			const min = (next() - 0.5) * 200;
			const max = min + 10 ** (next() * 3.5 - 1);
			const ticks = legendTicks(min, max);
			expect(ticks.length).toBeGreaterThanOrEqual(2);
			expect(ticks.length).toBeLessThanOrEqual(MAX_LEGEND_TICKS);
			const step = (ticks[1] as number) - (ticks[0] as number);
			const power = 10 ** Math.floor(Math.log10(step) + 1e-9);
			expect([1, 2, 5]).toContain(Math.round(step / power));
			for (const tick of ticks) {
				expect(tick).toBeGreaterThanOrEqual(min);
				expect(tick).toBeLessThanOrEqual(max);
				expect(Math.abs(tick / step - Math.round(tick / step))).toBeLessThan(
					1e-6,
				);
				// Round values print without a long tail of digits.
				expect(String(tick)).toMatch(/^-?\d+(\.\d{1,3})?$/);
			}
		}
	});

	it('refuses a range that does not run up between finite ends', () => {
		expect(() => legendTicks(5, 5)).toThrow(RangeError);
		expect(() => legendTicks(5, 1)).toThrow(RangeError);
		expect(() => legendTicks(Number.NaN, 1)).toThrow(RangeError);
		expect(() => legendTicks(0, Number.POSITIVE_INFINITY)).toThrow(RangeError);
	});

	it.each([
		// A step of zero, which once searched for a step for ever.
		['too narrow for any step', 0, 1e-323],
		['too narrow for a step of ten to be a number', 0, 1e-310],
		['too wide for its width to be a number', -1e308, 1e308],
		['too narrow for its distance from zero', 1e9, 1e9 + 1e-6],
	])(
		'refuses a range %s, rather than mark fewer than two values',
		(_, min, max) => {
			expect(() => legendTicks(min, max)).toThrow(RangeError);
		},
	);

	it('marks a range at a step it is given, ends included', () => {
		expect(legendTicks(0, 49, 5)).toEqual([
			0, 5, 10, 15, 20, 25, 30, 35, 40, 45,
		]);
		expect(legendTicks(-3.5, 21, 5)).toEqual([0, 5, 10, 15, 20]);
		expect(legendTicks(0, 5 * (MAX_STEPPED_TICKS - 1), 5)).toHaveLength(
			MAX_STEPPED_TICKS,
		);
	});

	it('chooses its own step when the step given would mark too many values', () => {
		const max = 5 * MAX_STEPPED_TICKS;
		expect(legendTicks(0, max, 5)).toEqual(legendTicks(0, max));
		expect(legendTicks(0, 1e6, 5)).toEqual(legendTicks(0, 1e6));
	});

	it('chooses its own step when the step given would mark fewer than two values', () => {
		expect(legendTicks(0, 3, 5)).toEqual([0, 1, 2, 3]);
		expect(legendTicks(1, 4, 5)).toEqual(legendTicks(1, 4));
	});

	it.each([
		['zero', 0],
		['below zero', -5],
		['not whole', 2.5],
		['not a number', Number.NaN],
		['infinite', Number.POSITIVE_INFINITY],
	])('refuses a step that is %s', (_, step) => {
		expect(() => legendTicks(0, 49, step)).toThrow(RangeError);
	});

	it('still refuses a range it cannot mark, whatever the step', () => {
		expect(() => legendTicks(5, 1, 5)).toThrow(RangeError);
		expect(() => legendTicks(1e9, 1e9 + 1e-6, 5)).toThrow(RangeError);
		// Multiples of 5 past the most it counts to.
		expect(() => legendTicks(1.5e15, 1.5e15 + 50, 5)).toThrow(RangeError);
	});

	it('marks the widest and narrowest ranges it takes at two values or more', () => {
		expect(legendTicks(0, 1.7e308)).toEqual([0, 5e307, 1e308, 1.5e308]);
		expect(legendTicks(0, 1e-300).length).toBe(MAX_LEGEND_TICKS);
	});
});

describe('formatFigures', () => {
	it('writes the mean signed and the RMS unsigned, each to one decimal', () => {
		expect(
			formatFigures({ meanDifference: -0.145, rmsDifference: 3.934 }, '°C'),
		).toBe('Mean −0.1 °C · RMS 3.9 °C');
		expect(
			formatFigures({ meanDifference: 0.26, rmsDifference: 12.05 }, '°C'),
		).toBe('Mean +0.3 °C · RMS 12.1 °C');
	});

	it('writes a mean that rounds to zero as 0.0, with no sign', () => {
		for (const meanDifference of [0, -0, 0.04, -0.04, -0.049]) {
			expect(
				formatFigures({ meanDifference, rmsDifference: 0 }, '°C'),
				`${meanDifference}`,
			).toBe('Mean 0.0 °C · RMS 0.0 °C');
		}
	});

	it('rounds a half away from zero', () => {
		expect(
			formatFigures({ meanDifference: -1.25, rmsDifference: 1.25 }, '°C'),
		).toBe('Mean −1.3 °C · RMS 1.3 °C');
	});
});

describe('tickPosition', () => {
	it('gives the share of the range below a value, in percent', () => {
		expect(tickPosition(-10, { min: -10, max: 30 })).toBe(0);
		expect(tickPosition(0, { min: -10, max: 30 })).toBe(25);
		expect(tickPosition(30, { min: -10, max: 30 })).toBe(100);
	});
});

describe('legendContent', () => {
	const source = {
		range: { min: -10, max: 30 },
		ramp: TEMPERATURE_RAMP,
		caption: 'Air temperature in July, °C',
	};
	const result = temperatureOf(1);
	const layerOf = (
		status: TemperatureLayer['status'],
		withResult = true,
	): TemperatureLayer => ({
		status,
		result: withResult ? result : null,
		progress: null,
		pass: null,
	});

	it('draws the ramp and its ticks for a current result, with nothing said', () => {
		expect(
			legendContent(TEMPERATURE_LAYER, layerOf('current'), source, true),
		).toEqual({
			scale: {
				caption: 'Air temperature in July, °C',
				gradient: rampGradient(TEMPERATURE_RAMP),
				ticks: [
					{ label: '−10', position: 0 },
					{ label: '0', position: 25 },
					{ label: '10', position: 50 },
					{ label: '20', position: 75 },
					{ label: '30', position: 100 },
				],
				figures: null,
			},
			state: 'current',
			status: null,
			bar: null,
		});
	});

	it('writes the error figures of a source that has them', () => {
		const figures = { meanDifference: 0.31, rmsDifference: 4.44 };
		expect(
			legendContent(
				TEMPERATURE_LAYER,
				layerOf('current'),
				{ ...source, figures },
				true,
			).scale?.figures,
		).toBe('Mean +0.3 °C · RMS 4.4 °C');
		expect(
			legendContent(
				TEMPERATURE_LAYER,
				layerOf('current'),
				{ ...source, figures: null },
				true,
			).scale?.figures,
		).toBeNull();
	});

	it('has no words for what lies beyond the ends, which take the end colours', () => {
		const { scale } = legendContent(
			TEMPERATURE_LAYER,
			layerOf('current'),
			source,
			true,
		);
		expect(Object.keys(scale ?? {})).toEqual([
			'caption',
			'gradient',
			'ticks',
			'figures',
		]);
	});

	it('marks the scale at its own step when it has one', () => {
		const content = legendContent(
			TEMPERATURE_LAYER,
			layerOf('current'),
			{
				...source,
				range: { min: 0, max: 49 },
				ramp: SEASONAL_RANGE_RAMP,
				tickStep: 5,
			},
			true,
		);
		expect(content.scale?.ticks.map((tick) => tick.label)).toEqual([
			'0',
			'5',
			'10',
			'15',
			'20',
			'25',
			'30',
			'35',
			'40',
			'45',
		]);
	});

	it('says a current result the globe shows no scale for could not be shown', () => {
		expect(
			legendContent(TEMPERATURE_LAYER, layerOf('current'), null, false),
		).toEqual({
			scale: null,
			state: 'unavailable',
			status: TEMPERATURE_NOT_SHOWN_TEXT,
			bar: null,
		});
	});

	it('marks a current result out of date while the globe still shows an earlier one', () => {
		const content = legendContent(
			TEMPERATURE_LAYER,
			layerOf('current'),
			source,
			false,
		);
		expect(content.scale).not.toBeNull();
		expect(content.status).toBe(LEGEND_OUT_OF_DATE_TEXT);
		expect(content.bar).toBeNull();
	});

	it('draws the ramp it is given', () => {
		const content = legendContent(
			TEMPERATURE_LAYER,
			layerOf('current'),
			{ ...source, ramp: TWO_STOP_RAMP },
			true,
		);
		expect(content.scale?.gradient).toBe(rampGradient(TWO_STOP_RAMP));
	});

	it('marks an out-of-date result, still drawn', () => {
		const content = legendContent(
			TEMPERATURE_LAYER,
			layerOf('outOfDate'),
			source,
			true,
		);
		expect(content.scale).not.toBeNull();
		expect(content.status).toBe(LEGEND_OUT_OF_DATE_TEXT);
		expect(content.bar).toBeNull();
	});

	it('marks a calculation under way over the result on hand, whatever its progress, which the info box says', () => {
		const calculating: TemperatureLayer = {
			...layerOf('calculating'),
			progress: { ...progressOf(3), estimatedYearsLeft: 2 },
		};
		const content = legendContent(TEMPERATURE_LAYER, calculating, source, true);
		expect(content.scale).not.toBeNull();
		expect(content.status).toBe(LEGEND_CALCULATING_TEXT);
		expect(content.bar).toEqual({ fraction: null });
	});

	it('says only that it is calculating while the first result is calculated', () => {
		const content = legendContent(
			TEMPERATURE_LAYER,
			layerOf('calculating', false),
			null,
			false,
		);
		expect(content).toEqual({
			scale: null,
			state: 'calculating',
			status: LEGEND_CALCULATING_TEXT,
			bar: { fraction: null },
		});
	});

	it('says there is nothing yet before the first result', () => {
		expect(
			legendContent(TEMPERATURE_LAYER, layerOf('empty', false), null, false),
		).toEqual({
			scale: null,
			state: 'empty',
			status: LEGEND_EMPTY_TEXT,
			bar: null,
		});
	});

	it('says the temperature is unavailable, keeping a result on hand', () => {
		const kept = legendContent(
			TEMPERATURE_LAYER,
			layerOf('unavailable'),
			source,
			true,
		);
		expect(kept.scale).not.toBeNull();
		expect(kept.status).toBe(TEMPERATURE_UNAVAILABLE_TEXT);
		const none = legendContent(
			TEMPERATURE_LAYER,
			layerOf('unavailable', false),
			null,
			false,
		);
		expect(none.scale).toBeNull();
		expect(none.status).toBe(TEMPERATURE_UNAVAILABLE_TEXT);
		expect(none.bar).toBeNull();
	});
});

describe('legendContent for the pressure', () => {
	const source = {
		range: { min: 996, max: 1030 },
		ramp: PRESSURE_RAMP,
		caption: 'Sea-level pressure in July, hPa',
	};
	const reading = (status: TemperatureLayer['status']) => ({
		status,
		progress: null,
	});

	it('writes its ticks as whole hPa, grouped in thousands', () => {
		const { scale, status } = legendContent(
			PRESSURE_LAYER,
			reading('current'),
			source,
			true,
		);
		expect(status).toBeNull();
		expect(scale?.caption).toBe('Sea-level pressure in July, hPa');
		expect(scale?.gradient).toBe(rampGradient(PRESSURE_RAMP));
		expect(scale?.ticks.map((tick) => tick.label)).toEqual([
			'1,000',
			'1,010',
			'1,020',
			'1,030',
		]);
		expect(scale).not.toHaveProperty('below');
		expect(scale).not.toHaveProperty('above');
		expect(scale?.figures).toBeNull();
	});

	it('says Pressure unavailable, and that it could not be shown, in its own words', () => {
		expect(
			legendContent(PRESSURE_LAYER, reading('unavailable'), null, false).status,
		).toBe('Pressure unavailable');
		expect(
			legendContent(PRESSURE_LAYER, reading('current'), null, false).status,
		).toBe('Pressure could not be shown');
	});

	it('says Calculating while it is worked out, with no year count', () => {
		expect(
			legendContent(PRESSURE_LAYER, reading('calculating'), null, false),
		).toEqual({
			scale: null,
			state: 'calculating',
			status: 'Calculating',
			bar: { fraction: null },
		});
		expect(
			legendContent(PRESSURE_LAYER, reading('calculating'), source, true)
				.status,
		).toBe('Calculating');
	});
});

describe('legendContent for another layer', () => {
	const source = {
		range: { min: 1000, max: 1030 },
		ramp: SEVEN_STOP_RAMP,
		caption: 'Made-up pressure in month 7, hPa',
	};
	const reading = (
		status: TemperatureLayer['status'],
		progress: TemperatureProgress | null = null,
	) => ({ status, progress });

	it('writes the ticks and the figures as the layer writes them, in its unit', () => {
		const { scale } = legendContent(
			MADE_UP_LAYER,
			reading('current'),
			{ ...source, figures: { meanDifference: 1.26, rmsDifference: 2 } },
			true,
		);
		expect(scale?.caption).toBe('Made-up pressure in month 7, hPa');
		expect(scale?.gradient).toBe(rampGradient(SEVEN_STOP_RAMP));
		expect(scale?.ticks.map((tick) => tick.label)).toEqual([
			'≈1,000',
			'≈1,010',
			'≈1,020',
			'≈1,030',
		]);
		expect(scale).not.toHaveProperty('below');
		expect(scale).not.toHaveProperty('above');
		expect(scale?.figures).toBe('Mean +1.3 hPa · RMS 2.0 hPa');
	});

	it('says what the layer says when it cannot be calculated or shown', () => {
		expect(
			legendContent(MADE_UP_LAYER, reading('unavailable'), null, false).status,
		).toBe('Made-up pressure unavailable');
		expect(
			legendContent(MADE_UP_LAYER, reading('current'), null, false).status,
		).toBe('Made-up pressure could not be shown');
	});

	it('has no year line for a calculation that tells no years', () => {
		expect(
			legendContent(MADE_UP_LAYER, reading('calculating'), source, true),
		).toMatchObject({
			status: LEGEND_CALCULATING_TEXT,
			bar: { fraction: null },
		});
		expect(LEGEND_CALCULATING_TEXT).toBe('Calculating');
	});

	it('writes a scale kept from another layer as that layer does, and the line in the chosen layer’s words', () => {
		const temperatureSource = {
			range: { min: -10, max: 30 },
			ramp: TEMPERATURE_RAMP,
			caption: 'Air temperature in July, °C',
			figures: { meanDifference: 1.26, rmsDifference: 2 },
		};
		const kept = legendContent(
			MADE_UP_LAYER,
			reading('calculating'),
			temperatureSource,
			false,
			TEMPERATURE_LAYER,
		);
		expect(kept.scale).toEqual(
			legendContent(
				TEMPERATURE_LAYER,
				reading('current'),
				temperatureSource,
				true,
			).scale,
		);
		expect(kept.scale?.ticks.map((tick) => tick.label)).toEqual([
			'−10',
			'0',
			'10',
			'20',
			'30',
		]);
		expect(kept.scale).not.toHaveProperty('below');
		expect(kept.scale?.figures).toBe('Mean +1.3 °C · RMS 2.0 °C');
		expect(kept.status).toBe(LEGEND_CALCULATING_TEXT);
		expect(kept.bar).toEqual({ fraction: null });
	});
});

describe('createLegend', () => {
	beforeEach(() => {
		vi.stubGlobal('document', createFakeDocument().document);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const make = () => {
		const legend = createLegend();
		const root = legend.element as unknown as FakeElement;
		return {
			legend,
			root,
			ramp: oneByClass(root, 'legend__ramp'),
			ticks: oneByClass(root, 'legend__ticks'),
			figures: oneByClass(root, 'legend__figures'),
		};
	};

	it('starts hidden', () => {
		const { root } = make();
		expect(root.hidden).toBe(true);
	});

	it('writes the caption of the scale it is given, and the next one', () => {
		const parts = make();
		const caption = oneByClass(parts.root, 'legend__caption');
		const show = (text: string): void =>
			parts.legend.show({
				scale: {
					caption: text,
					gradient: 'g',
					ticks: [],
					figures: null,
				},
				state: 'current',
				status: null,
				bar: null,
			});
		show('Air temperature in July, °C');
		expect(caption.textContent).toBe('Air temperature in July, °C');
		show('Seasonal range, °C');
		expect(caption.textContent).toBe('Seasonal range, °C');
		// Hidden while there is no scale.
		parts.legend.show({
			scale: null,
			state: 'unavailable',
			status: 'x',
			bar: null,
		});
		expect(parts.root.hidden).toBe(true);
	});

	it('draws the scale and its ticks, with no status line or bar of its own', () => {
		const parts = make();
		parts.legend.show({
			scale: {
				caption: 'Air temperature, °C',
				gradient: 'linear-gradient(red, blue)',
				ticks: [
					{ label: '−10', position: 0 },
					{ label: '20', position: 75 },
				],
				figures: null,
			},
			state: 'current',
			status: null,
			bar: null,
		});
		expect(parts.root.hidden).toBe(false);
		expect(parts.ramp.style.background).toBe('linear-gradient(red, blue)');
		expect(
			parts.ticks.children.map((tick) => [tick.textContent, tick.style.left]),
		).toEqual([
			['−10', '0%'],
			['20', '75%'],
		]);
		// The info box says the legend's line, with its bar, on its one
		// status line.
		expect(byClass(parts.root, 'legend__status')).toEqual([]);
		expect(byClass(parts.root, 'legend__bar')).toEqual([]);
		expect(parts.root.getAttribute('aria-live')).toBeNull();
	});

	it('shows nothing but its scale, hiding while a calculation has none to show', () => {
		const parts = make();
		parts.legend.show({
			scale: null,
			state: 'calculating',
			status: 'year 3',
			bar: { fraction: 0.6 },
		});
		expect(parts.root.hidden).toBe(true);
	});

	it('replaces the ticks of the scale before', () => {
		const parts = make();
		const show = (labels: string[]): void =>
			parts.legend.show({
				scale: {
					caption: 'c',
					gradient: 'g',
					ticks: labels.map((label, index) => ({ label, position: index })),
					figures: null,
				},
				state: 'current',
				status: null,
				bar: null,
			});
		show(['1', '2', '3']);
		show(['4']);
		expect(parts.ticks.children.map((tick) => tick.textContent)).toEqual(['4']);
	});

	it('writes the error figures on a line of their own under the ticks, only while there are some', () => {
		const parts = make();
		const show = (figures: string | null): void =>
			parts.legend.show({
				scale: {
					caption: 'c',
					gradient: 'g',
					ticks: [],
					figures,
				},
				state: 'current',
				status: null,
				bar: null,
			});
		show(null);
		expect(parts.figures.hidden).toBe(true);
		show('Mean −0.1 °C · RMS 3.9 °C');
		expect(parts.figures.hidden).toBe(false);
		expect(parts.figures.textContent).toBe('Mean −0.1 °C · RMS 3.9 °C');
		expect(parts.root.children.at(-1)).toBe(parts.figures);
		show(null);
		expect(parts.figures.hidden).toBe(true);
		expect(parts.figures.textContent).toBe('');
	});

	it('holds its caption, ramp, ticks and figures, and no line of words for the ends', () => {
		const parts = make();
		parts.legend.show({
			scale: {
				caption: 'c',
				gradient: 'g',
				ticks: [{ label: '−34', position: 0 }],
				figures: null,
			},
			state: 'current',
			status: null,
			bar: null,
		});
		expect(parts.root.children.map((child) => child.className)).toEqual([
			'legend__caption',
			'legend__ramp',
			'legend__ticks',
			'legend__figures',
		]);
		expect(byClass(parts.root, 'legend__ends')).toEqual([]);
		expect(byClass(parts.root, 'legend__end')).toEqual([]);
	});

	it('hides for nothing to show', () => {
		const parts = make();
		parts.legend.show({
			scale: null,
			state: 'unavailable',
			status: 'x',
			bar: null,
		});
		parts.legend.show(null);
		expect(parts.root.hidden).toBe(true);
	});
});

describe('marking a scale in a unit', () => {
	it('marks a scale at a step with decimals, each tick the nearest number to its decimal', () => {
		expect(legendTicks(-0.6, 0.6, 0.3, 2)).toEqual([-0.6, -0.3, 0, 0.3, 0.6]);
		expect(legendTicks(29.4, 30.5, 0.3, 2)).toEqual([29.4, 29.7, 30, 30.3]);
		expect(legendTicks(0, 49, 5, 2)).toEqual(legendTicks(0, 49, 5));
		// A step that gives too many falls back on a step of the legend's.
		expect(legendTicks(29, 30, 0.05, 2)).toEqual(legendTicks(29, 30));
	});

	it.each([
		['more decimals than given', 0.25, 1],
		['decimals that are not whole', 0.3, 1.5],
		['decimals below zero', 3, -1],
	])('refuses %s', (_, step, decimals) => {
		expect(() => legendTicks(0, 1, step, decimals)).toThrow(RangeError);
	});

	it('writes the error figures to the decimals given', () => {
		expect(
			formatFigures(
				{ meanDifference: 0.0312, rmsDifference: 0.1178 },
				'inHg',
				3,
			),
		).toBe('Mean +0.031 inHg · RMS 0.118 inHg');
		expect(
			formatFigures({ meanDifference: -0.0004, rmsDifference: 0 }, 'inHg', 3),
		).toBe('Mean 0.000 inHg · RMS 0.000 inHg');
	});

	it('draws the scale in the source’s unit, its ticks written as the layer writes them there', () => {
		const content = legendContent(
			PRESSURE_LAYER,
			{ status: 'current' },
			{
				range: { min: -0.6, max: 0.6 },
				ramp: PRESSURE_RAMP,
				caption: 'Simulated less observed in July, inHg',
				unit: 'inHg',
				tickStep: 0.3,
				figures: { meanDifference: 0.0312, rmsDifference: 0.1178 },
			},
			true,
		);
		expect(content.scale?.ticks).toEqual([
			{ label: '−0.60', position: 0 },
			{ label: '−0.30', position: 25 },
			{ label: '0.00', position: 50 },
			{ label: '0.30', position: 75 },
			{ label: '0.60', position: 100 },
		]);
		expect(content.scale?.figures).toBe('Mean +0.031 inHg · RMS 0.118 inHg');
		const kelvin = legendContent(
			TEMPERATURE_LAYER,
			{ status: 'current' },
			{
				range: { min: 239, max: 305 },
				ramp: TEMPERATURE_RAMP,
				caption: 'Air temperature in July, K',
				unit: 'K',
				figures: { meanDifference: -0.14, rmsDifference: 3.93 },
			},
			true,
		);
		expect(kelvin.scale?.ticks.map((tick) => tick.label)).toEqual([
			'240',
			'260',
			'280',
			'300',
		]);
		expect(kelvin.scale?.figures).toBe('Mean −0.1 K · RMS 3.9 K');
	});

	it('refuses a source in a unit of another quantity', () => {
		expect(() =>
			legendContent(
				PRESSURE_LAYER,
				{ status: 'current' },
				{
					range: { min: 0, max: 10 },
					ramp: PRESSURE_RAMP,
					caption: 'Pressure',
					unit: '°F',
				},
				true,
			),
		).toThrow(RangeError);
	});
});

/** Whether a number is written exactly with no more than two decimals. */
const hasTwoDecimals = (value: number): boolean =>
	Number(value.toFixed(2)) === value;

describe('fitSummaryScale in a unit, on an Earth-like year', () => {
	const temperature = { months: earthLikeTemperature() };
	const pressure = { months: earthLikePressure() };
	const weights = cellWeights(temperature.months[0]?.length ?? 0);
	/** The values between the two quantiles a scale spans, in a unit. */
	const cutsIn = (
		months: readonly Float32Array[],
		toUnit: (value: number) => number,
	) => {
		const cuts = weightedQuantiles(months, weights, FIT_TAIL_SHARE);
		return { low: toUnit(cuts.low), high: toUnit(cuts.high) };
	};

	it.each([
		['°F', 4],
		['K', 2],
	] as const)(
		'fits July’s temperature in %s to whole ends that hold every value, marked at whole ticks',
		(unit, minSpan) => {
			const view = summaryOf(TEMPERATURE_LAYER, 'month');
			const range = fitSummaryScale(
				TEMPERATURE_LAYER,
				view,
				[temperature],
				6,
				unit,
			);
			expect(Number.isInteger(range.min), `${range.min}`).toBe(true);
			expect(Number.isInteger(range.max), `${range.max}`).toBe(true);
			expect(range.max - range.min).toBeGreaterThanOrEqual(minSpan);
			const cuts = cutsIn(temperature.months, (value) =>
				toLayerUnit(TEMPERATURE_LAYER, unit, value, false),
			);
			expect(range.min).toBeLessThanOrEqual(cuts.low);
			expect(range.max).toBeGreaterThanOrEqual(cuts.high);
			// Rounded outward by less than a whole unit.
			expect(cuts.low - range.min).toBeLessThan(1);
			expect(range.max - cuts.high).toBeLessThan(1);
			const ticks = legendTicks(range.min, range.max);
			expect(ticks.every(Number.isInteger), `${ticks}`).toBe(true);
		},
	);

	it('fits the temperature’s range of the seasons in °F by the scale alone, holding every value', () => {
		const view = summaryOf(TEMPERATURE_LAYER, 'range');
		const celsius = fitSummaryScale(
			TEMPERATURE_LAYER,
			view,
			[temperature],
			'range',
		);
		const fahrenheit = fitSummaryScale(
			TEMPERATURE_LAYER,
			view,
			[temperature],
			'range',
			'°F',
		);
		const field = yearField(TEMPERATURE_LAYER, temperature, 'range');
		const largest = Math.max(...field);
		expect(celsius).toEqual({ min: 0, max: Math.ceil(largest) });
		expect(fahrenheit).toEqual({ min: 0, max: Math.ceil(largest * 1.8) });
		expect(
			legendTicks(0, fahrenheit.max, inUnit(view.tickStep ?? {}, '°F')),
		).toEqual(
			Array.from(
				{ length: Math.floor(fahrenheit.max / 10) + 1 },
				(_, k) => k * 10,
			),
		);
	});

	it('fits July’s pressure in inHg about the year’s mean, to ends and ticks of two decimals that hold every value', () => {
		const view = summaryOf(PRESSURE_LAYER, 'month');
		const range = fitSummaryScale(PRESSURE_LAYER, view, [pressure], 6, 'inHg');
		expect(hasTwoDecimals(range.min), `${range.min}`).toBe(true);
		expect(hasTwoDecimals(range.max), `${range.max}`).toBe(true);
		const middle = (range.min + range.max) / 2;
		const mean = toLayerUnit(
			PRESSURE_LAYER,
			'inHg',
			weightedMean(pressure.months, weights),
			false,
		);
		expect(Math.abs(middle - mean)).toBeLessThanOrEqual(0.005 + 1e-9);
		const cuts = cutsIn(pressure.months, (value) =>
			toLayerUnit(PRESSURE_LAYER, 'inHg', value, false),
		);
		expect(range.min).toBeLessThanOrEqual(cuts.low);
		expect(range.max).toBeGreaterThanOrEqual(cuts.high);
		const ticks = legendTicks(range.min, range.max, undefined, 2);
		expect(ticks.every(hasTwoDecimals), `${ticks}`).toBe(true);
		expect(
			ticks.map((tick) => PRESSURE_LAYER.formatTick(tick, 'inHg')),
		).toEqual(ticks.map((tick) => tick.toFixed(2)));
	});

	it('fits the pressure in hPa as it always has', () => {
		const view = summaryOf(PRESSURE_LAYER, 'month');
		expect(fitSummaryScale(PRESSURE_LAYER, view, [pressure], 6, 'hPa')).toEqual(
			fitSummaryScale(PRESSURE_LAYER, view, [pressure], 6),
		);
	});

	it('refuses a unit of another quantity', () => {
		const view = summaryOf(PRESSURE_LAYER, 'month');
		expect(() =>
			fitSummaryScale(PRESSURE_LAYER, view, [pressure], 6, '°F'),
		).toThrow(RangeError);
	});
});
