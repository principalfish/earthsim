import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGrid, type TemperatureProgress } from '../../core/index';
import {
	progressOf,
	temperatureOf,
} from '../../core/testing/temperatureFixtures';
import {
	rampGradient,
	SEASONAL_RANGE_RAMP,
	TEMPERATURE_RAMP,
} from '../globe/ramp';
import type { TemperatureLayer } from '../layers';
import {
	createFakeDocument,
	type FakeElement,
	oneByClass,
} from '../testing/fakeDocument';
import { TWO_STOP_RAMP } from '../testing/rampFixtures';
import {
	cellWeights,
	createLegend,
	FIT_TAIL_SHARE,
	fitRange,
	fitRangeFromZero,
	formatTick,
	LEGEND_EMPTY_TEXT,
	LEGEND_FIRST_YEAR_TEXT,
	LEGEND_NOT_SHOWN_TEXT,
	LEGEND_OUT_OF_DATE_TEXT,
	LEGEND_UNAVAILABLE_TEXT,
	legendContent,
	legendTicks,
	MAX_LEGEND_TICKS,
	MAX_STEPPED_TICKS,
	MIN_FITTED_SPAN_C,
	NOTHING_BEYOND,
	progressFraction,
	progressLine,
	tickPosition,
} from './legend';

/** Twelve one-cell fields with the values given, January first. */
const monthsOf = (...values: number[]): Float32Array[] =>
	values.map((value) => Float32Array.of(value, value / 2));

/** Progress with an estimate of the years left. */
const progressWith = (
	yearsDone: number,
	estimatedYearsLeft: number | null,
): TemperatureProgress => ({ ...progressOf(yearsDone), estimatedYearsLeft });

/** Equal weights for fields of the cells given. */
const evenly = (cells: number): Float64Array => new Float64Array(cells).fill(1);

describe('fitRange', () => {
	it('spans a handful of values from the lowest to the highest, rounded outward to whole degrees', () => {
		// The coldest value is in January and the hottest in December, both
		// far from July's.
		const months = monthsOf(-40, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 30);
		months[0]?.set([-40, -52.5]);
		months[11]?.set([30, 41.5]);
		expect(fitRange(months, evenly(2))).toEqual({
			range: { min: -53, max: 42 },
			beyond: NOTHING_BEYOND,
		});
	});

	it('keeps ends that are whole already', () => {
		expect(fitRange([Float32Array.of(-10, 30)], evenly(2)).range).toEqual({
			min: -10,
			max: 30,
		});
	});

	it('widens a constant field about its value', () => {
		const months = Array.from({ length: 12 }, () =>
			Float32Array.of(12, 12, 12),
		);
		expect(fitRange(months, evenly(3)).range).toEqual({
			min: 12 - MIN_FITTED_SPAN_C / 2,
			max: 12 + MIN_FITTED_SPAN_C / 2,
		});
	});

	it('widens a field that varies less than the narrowest span about its middle, then rounds outward', () => {
		// 5.25 ± 1 is 4.25 to 6.25.
		expect(fitRange([Float32Array.of(5, 5.5)], evenly(2)).range).toEqual({
			min: 4,
			max: 7,
		});
	});

	it('leaves out half a percent of the weight at each end, and says values lie beyond', () => {
		// A thousand cells from 0 to 999: half a percent of them is five.
		const field = Float32Array.from({ length: 1000 }, (_, cell) => cell);
		expect(FIT_TAIL_SHARE).toBe(0.005);
		expect(fitRange([field], evenly(1000))).toEqual({
			range: { min: 4, max: 995 },
			beyond: { below: true, above: true },
		});
	});

	it('weights each cell by the weights given', () => {
		// The first cell is cold; it is left out while it weighs a tenth of
		// a percent of the whole, and kept once it weighs one percent.
		const field = Float32Array.from({ length: 1000 }, (_, cell) =>
			cell === 0 ? -100 : 10 + (cell % 10),
		);
		const light = fitRange([field], evenly(1000));
		expect(light.range.min).toBe(10);
		expect(light.beyond.below).toBe(true);
		const weights = evenly(1000);
		weights[0] = 10;
		const heavy = fitRange([field], weights);
		expect(heavy.range.min).toBe(-100);
		expect(heavy.beyond.below).toBe(false);
	});

	it('is not stretched by one tall peak, which is said to lie beyond', () => {
		// One cell of a thousand far colder than the rest in every month.
		const months = Array.from({ length: 12 }, (_, m) =>
			Float32Array.from({ length: 1000 }, (_, cell) =>
				cell === 0 ? -94 : -30 + ((cell * 7 + m) % 61),
			),
		);
		const without = fitRange(
			months.map((month) => month.slice(1)),
			evenly(999),
		);
		const withPeak = fitRange(months, evenly(1000));
		expect(withPeak.range).toEqual({ min: -30, max: 30 });
		expect(withPeak.range).toEqual(without.range);
		expect(withPeak.beyond).toEqual({ below: true, above: false });
	});

	it('says values lie beyond only an end they are beyond', () => {
		// Four cold cells of a thousand are left out; the hot end is the
		// highest value.
		const field = Float32Array.from({ length: 1000 }, (_, cell) =>
			cell < 4 ? -50 : 20 + (cell % 5),
		);
		expect(fitRange([field], evenly(1000))).toEqual({
			range: { min: 20, max: 24 },
			beyond: { below: true, above: false },
		});
	});

	it('says nothing lies beyond an end that rounding outward took in', () => {
		// The low cut is 2.6, the high 7.4; the values left out, 2.5 and
		// 7.5, are within the whole degrees around them.
		const field = Float32Array.from({ length: 1000 }, (_, cell) =>
			cell === 0 ? 2.5 : cell === 999 ? 7.5 : cell < 500 ? 2.6 : 7.4,
		);
		expect(fitRange([field], evenly(1000))).toEqual({
			range: { min: 2, max: 8 },
			beyond: NOTHING_BEYOND,
		});
	});

	it('says what lies beyond the range as widened and rounded, not beyond the cuts', () => {
		// The cuts, 10 and 10.5, are widened to 9.25 to 11.25 and rounded to
		// 9 to 12. The values left out below, at 9.2, are within it; of
		// those left out above, 11.8 is within it and 60 is beyond.
		const field = Float32Array.from({ length: 1000 }, (_, cell) =>
			cell < 4
				? 9.2
				: cell < 7
					? 11.8
					: cell === 7
						? 60
						: cell % 2 === 0
							? 10
							: 10.5,
		);
		expect(fitRange([field], evenly(1000))).toEqual({
			range: { min: 9, max: 12 },
			beyond: { below: false, above: true },
		});
	});

	it('passes over values that are not numbers', () => {
		expect(
			fitRange([Float32Array.of(Number.NaN, -10, 10)], evenly(3)).range,
		).toEqual({ min: -10, max: 10 });
	});

	it('passes over infinite values', () => {
		expect(
			fitRange(
				[
					Float32Array.of(Number.POSITIVE_INFINITY, -10),
					Float32Array.of(10, Number.NEGATIVE_INFINITY),
				],
				evenly(2),
			),
		).toEqual({ range: { min: -10, max: 10 }, beyond: NOTHING_BEYOND });
	});

	it('refuses fields with no value to fit', () => {
		expect(() => fitRange([], evenly(1))).toThrow(RangeError);
		expect(() => fitRange([Float32Array.of(Number.NaN)], evenly(1))).toThrow(
			RangeError,
		);
		expect(() =>
			fitRange(
				[
					Float32Array.of(Number.POSITIVE_INFINITY, Number.NaN),
					Float32Array.of(Number.NEGATIVE_INFINITY),
				],
				evenly(2),
			),
		).toThrow(RangeError);
	});
});

describe('cellWeights', () => {
	it("gives a grid's own cell areas for a field of its cells", () => {
		for (const n of [64, 128]) {
			const grid = getGrid(n);
			expect(cellWeights(grid.cellCount)).toBe(grid.areas);
		}
	});

	it('counts every cell the same for a field no grid has', () => {
		expect(Array.from(cellWeights(2))).toEqual([1, 1]);
		expect(cellWeights(getGrid(64).cellCount + 1)).toHaveLength(
			getGrid(64).cellCount + 1,
		);
		expect(Array.from(cellWeights(6 * 10 * 10)).every((w) => w === 1)).toBe(
			true,
		);
	});

	it('fits a real grid by area, unlike by count', () => {
		// The smallest cells, cold, are a few more than half a percent of
		// the cells but cover less than half a percent of the area.
		const grid = getGrid(64);
		const order = Array.from(grid.areas.keys()).sort(
			(a, b) => (grid.areas[a] as number) - (grid.areas[b] as number),
		);
		const total = grid.areas.reduce((sum, area) => sum + area, 0);
		const cold = order.slice(0, Math.ceil(grid.cellCount * FIT_TAIL_SHARE) + 3);
		const coldArea = cold.reduce(
			(sum, cell) => sum + (grid.areas[cell] as number),
			0,
		);
		expect(coldArea / total).toBeLessThan(FIT_TAIL_SHARE);
		const field = new Float32Array(grid.cellCount).fill(10);
		for (const cell of cold) {
			field[cell] = -60;
		}
		expect(fitRange([field], cellWeights(grid.cellCount)).range.min).toBe(9);
		expect(fitRange([field], evenly(grid.cellCount)).range.min).toBe(-60);
	});
});

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

describe('formatTick', () => {
	it('writes negatives with a minus sign rather than a hyphen', () => {
		expect(formatTick(-20)).toBe('−20');
	});

	it('writes zero and decimals plainly', () => {
		expect(formatTick(0)).toBe('0');
		expect(formatTick(-0)).toBe('0');
		expect(formatTick(14.5)).toBe('14.5');
		expect(formatTick(0.2 + 0.1)).toBe('0.3');
	});
});

describe('tickPosition', () => {
	it('gives the share of the range below a value, in percent', () => {
		expect(tickPosition(-10, { min: -10, max: 30 })).toBe(0);
		expect(tickPosition(0, { min: -10, max: 30 })).toBe(25);
		expect(tickPosition(30, { min: -10, max: 30 })).toBe(100);
	});
});

describe('progressLine and progressFraction', () => {
	it('say the first year is under way before any progress, with no fraction', () => {
		expect(progressLine(null)).toBe(LEGEND_FIRST_YEAR_TEXT);
		expect(progressFraction(null)).toBeNull();
	});

	it('give the years done alone while there is no estimate', () => {
		const progress = progressWith(3, null);
		expect(progressLine(progress)).toBe('Calculating · year 3');
		expect(progressFraction(progress)).toBeNull();
	});

	it('give the years expected to go with an estimate', () => {
		const progress = progressWith(3, 2);
		expect(progressLine(progress)).toBe('Calculating · year 3, about 2 to go');
		expect(progressFraction(progress)).toBe(0.6);
		expect(progressLine(progressWith(4, 1))).toBe(
			'Calculating · year 4, about 1 to go',
		);
		expect(progressFraction(progressWith(4, 1))).toBe(0.8);
	});

	it('say so on the last year, with the bar full', () => {
		const progress = progressWith(5, 0);
		expect(progressLine(progress)).toBe('Calculating · year 5, finishing');
		expect(progressFraction(progress)).toBe(1);
	});
});

describe('fitRangeFromZero', () => {
	it('runs from zero to the largest value, rounded up to a whole number', () => {
		expect(fitRangeFromZero(Float32Array.of(0.5, 41.2, 12))).toEqual({
			min: 0,
			max: 42,
		});
	});

	it('keeps a largest value that is already whole', () => {
		expect(fitRangeFromZero(Float32Array.of(3, 30))).toEqual({
			min: 0,
			max: 30,
		});
	});

	it('runs at least as far as the narrowest span', () => {
		expect(fitRangeFromZero(Float32Array.of(0, 0.3))).toEqual({
			min: 0,
			max: MIN_FITTED_SPAN_C,
		});
	});

	it('passes over values that are not finite numbers', () => {
		expect(
			fitRangeFromZero(
				Float32Array.of(Number.NaN, Number.POSITIVE_INFINITY, 7.5),
			),
		).toEqual({ min: 0, max: 8 });
	});

	it('refuses a field with no finite value', () => {
		expect(() => fitRangeFromZero(Float32Array.of(Number.NaN))).toThrow(
			RangeError,
		);
	});
});

describe('legendContent', () => {
	const source = {
		range: { min: -10, max: 30 },
		ramp: TEMPERATURE_RAMP,
		caption: 'Air temperature in July, °C',
		beyond: NOTHING_BEYOND,
	};
	const result = temperatureOf(1);
	const layerOf = (
		status: TemperatureLayer['status'],
		withResult = true,
		progress: TemperatureProgress | null = null,
	): TemperatureLayer => ({
		status,
		result: withResult ? result : null,
		progress,
	});

	it('draws the ramp and its ticks for a current result, with nothing said', () => {
		expect(legendContent(layerOf('current'), source, true)).toEqual({
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
				below: null,
				above: null,
			},
			status: null,
			bar: null,
		});
	});

	it('says what the end colours stand for at each end with values beyond it', () => {
		const ends = (below: boolean, above: boolean) => {
			const { scale } = legendContent(
				layerOf('current'),
				{ ...source, beyond: { below, above } },
				true,
			);
			return [scale?.below, scale?.above];
		};
		expect(ends(true, true)).toEqual(['−10 and below', '30 and above']);
		expect(ends(true, false)).toEqual(['−10 and below', null]);
		expect(ends(false, true)).toEqual([null, '30 and above']);
		expect(ends(false, false)).toEqual([null, null]);
	});

	it('marks the scale at its own step when it has one', () => {
		const content = legendContent(
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
		expect(legendContent(layerOf('current'), null, false)).toEqual({
			scale: null,
			status: LEGEND_NOT_SHOWN_TEXT,
			bar: null,
		});
	});

	it('marks a current result out of date while the globe still shows an earlier one', () => {
		const content = legendContent(layerOf('current'), source, false);
		expect(content.scale).not.toBeNull();
		expect(content.status).toBe(LEGEND_OUT_OF_DATE_TEXT);
		expect(content.bar).toBeNull();
	});

	it('draws the ramp it is given', () => {
		const content = legendContent(
			layerOf('current'),
			{ ...source, ramp: TWO_STOP_RAMP },
			true,
		);
		expect(content.scale?.gradient).toBe(rampGradient(TWO_STOP_RAMP));
	});

	it('marks an out-of-date result, still drawn', () => {
		const content = legendContent(layerOf('outOfDate'), source, true);
		expect(content.scale).not.toBeNull();
		expect(content.status).toBe(LEGEND_OUT_OF_DATE_TEXT);
		expect(content.bar).toBeNull();
	});

	it('marks a calculation under way with its progress, over the result on hand', () => {
		const content = legendContent(
			layerOf('calculating', true, progressWith(3, 2)),
			source,
			true,
		);
		expect(content.scale).not.toBeNull();
		expect(content.status).toBe('Calculating · year 3, about 2 to go');
		expect(content.bar).toEqual({ fraction: 0.6 });
	});

	it('shows the progress alone while the first result is calculated', () => {
		const content = legendContent(layerOf('calculating', false), null, false);
		expect(content).toEqual({
			scale: null,
			status: LEGEND_FIRST_YEAR_TEXT,
			bar: { fraction: null },
		});
	});

	it('says there is nothing yet before the first result', () => {
		expect(legendContent(layerOf('empty', false), null, false)).toEqual({
			scale: null,
			status: LEGEND_EMPTY_TEXT,
			bar: null,
		});
	});

	it('says the temperature is unavailable, keeping a result on hand', () => {
		const kept = legendContent(layerOf('unavailable'), source, true);
		expect(kept.scale).not.toBeNull();
		expect(kept.status).toBe(LEGEND_UNAVAILABLE_TEXT);
		const none = legendContent(layerOf('unavailable', false), null, false);
		expect(none.scale).toBeNull();
		expect(none.status).toBe(LEGEND_UNAVAILABLE_TEXT);
		expect(none.bar).toBeNull();
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
			ends: oneByClass(root, 'legend__ends'),
			low: oneByClass(root, 'legend__end--low'),
			high: oneByClass(root, 'legend__end--high'),
			ticks: oneByClass(root, 'legend__ticks'),
			scale: oneByClass(root, 'legend__scale'),
			status: oneByClass(root, 'legend__status'),
			bar: oneByClass(root, 'legend__bar'),
		};
	};

	it('starts hidden', () => {
		const { root } = make();
		expect(root.hidden).toBe(true);
	});

	it('writes the caption of the scale it is given, and the next one', () => {
		const parts = make();
		const caption = oneByClass(parts.scale, 'legend__caption');
		const show = (text: string): void =>
			parts.legend.show({
				scale: {
					caption: text,
					gradient: 'g',
					ticks: [],
					below: null,
					above: null,
				},
				status: null,
				bar: null,
			});
		show('Air temperature in July, °C');
		expect(caption.textContent).toBe('Air temperature in July, °C');
		show('Seasonal range, °C');
		expect(caption.textContent).toBe('Seasonal range, °C');
		// Hidden with its scale while there is none.
		parts.legend.show({ scale: null, status: 'x', bar: null });
		expect(parts.scale.hidden).toBe(true);
	});

	it('draws the scale and its ticks, with no status or bar for a current result', () => {
		const parts = make();
		parts.legend.show({
			scale: {
				caption: 'Air temperature, °C',
				gradient: 'linear-gradient(red, blue)',
				ticks: [
					{ label: '−10', position: 0 },
					{ label: '20', position: 75 },
				],
				below: null,
				above: null,
			},
			status: null,
			bar: null,
		});
		expect(parts.root.hidden).toBe(false);
		expect(parts.scale.hidden).toBe(false);
		expect(parts.ramp.style.background).toBe('linear-gradient(red, blue)');
		expect(
			parts.ticks.children.map((tick) => [tick.textContent, tick.style.left]),
		).toEqual([
			['−10', '0%'],
			['20', '75%'],
		]);
		// Left empty, not hidden, so that a screen reader announces what
		// is written into it next.
		expect(parts.status.hidden).toBe(false);
		expect(parts.status.textContent).toBe('');
		expect(parts.bar.hidden).toBe(true);
	});

	it('keeps its status line in the page as the words come and go', () => {
		const parts = make();
		parts.legend.show({ scale: null, status: 'Out of date', bar: null });
		expect(parts.status.hidden).toBe(false);
		parts.legend.show({ scale: null, status: null, bar: null });
		expect(parts.status.hidden).toBe(false);
		expect(parts.status.textContent).toBe('');
		expect(parts.status.getAttribute('aria-live')).toBe('polite');
	});

	it('rewrites its status line only when the words change', () => {
		const parts = make();
		parts.legend.show({
			scale: null,
			status: 'year 3',
			bar: { fraction: 0.2 },
		});
		const writes = vi.spyOn(parts.status, 'textContent', 'set');
		parts.legend.show({
			scale: null,
			status: 'year 3',
			bar: { fraction: 0.4 },
		});
		expect(writes).not.toHaveBeenCalled();
		parts.legend.show({
			scale: null,
			status: 'year 4',
			bar: { fraction: 0.6 },
		});
		expect(writes).toHaveBeenCalledTimes(1);
		expect(parts.status.textContent).toBe('year 4');
	});

	it('shows the progress line and a bar that knows how far it has come', () => {
		const parts = make();
		parts.legend.show({
			scale: null,
			status: 'year 3',
			bar: { fraction: 0.6 },
		});
		expect(parts.scale.hidden).toBe(true);
		expect(parts.status.hidden).toBe(false);
		expect(parts.status.textContent).toBe('year 3');
		expect(parts.bar.hidden).toBe(false);
		expect(parts.bar.getAttribute('value')).toBe('0.6');
	});

	it('draws a bar with no value while how far it has come is not known', () => {
		const parts = make();
		parts.legend.show({
			scale: null,
			status: 'year 3',
			bar: { fraction: 0.6 },
		});
		parts.legend.show({
			scale: null,
			status: 'year 3',
			bar: { fraction: null },
		});
		expect(parts.bar.hidden).toBe(false);
		expect(parts.bar.getAttribute('value')).toBeNull();
	});

	it('replaces the ticks of the scale before', () => {
		const parts = make();
		const show = (labels: string[]): void =>
			parts.legend.show({
				scale: {
					caption: 'c',
					gradient: 'g',
					ticks: labels.map((label, index) => ({ label, position: index })),
					below: null,
					above: null,
				},
				status: null,
				bar: null,
			});
		show(['1', '2', '3']);
		show(['4']);
		expect(parts.ticks.children.map((tick) => tick.textContent)).toEqual(['4']);
	});

	/** Shows a scale with the words at its ends given. */
	const showEnds = (
		legend: ReturnType<typeof make>['legend'],
		below: string | null,
		above: string | null,
	): void =>
		legend.show({
			scale: { caption: 'c', gradient: 'g', ticks: [], below, above },
			status: null,
			bar: null,
		});

	it('writes what the end colours stand for on a line of its own under the ticks', () => {
		const parts = make();
		showEnds(parts.legend, '−34 and below', '29 and above');
		expect(parts.scale.children.map((child) => child.className)).toEqual([
			'legend__caption',
			'legend__ramp',
			'legend__ticks',
			'legend__ends',
		]);
		expect(parts.ends.hidden).toBe(false);
		expect(parts.ends.children).toEqual([parts.low, parts.high]);
		expect([parts.low.hidden, parts.low.textContent]).toEqual([
			false,
			'−34 and below',
		]);
		expect([parts.high.hidden, parts.high.textContent]).toEqual([
			false,
			'29 and above',
		]);
	});

	it('shows each end on its own, hiding the other', () => {
		const parts = make();
		showEnds(parts.legend, '−34 and below', null);
		expect(parts.ends.hidden).toBe(false);
		expect(parts.low.hidden).toBe(false);
		expect([parts.high.hidden, parts.high.textContent]).toEqual([true, '']);
		showEnds(parts.legend, null, '29 and above');
		expect([parts.low.hidden, parts.low.textContent]).toEqual([true, '']);
		expect([parts.high.hidden, parts.high.textContent]).toEqual([
			false,
			'29 and above',
		]);
	});

	it('hides the line, keeping no room for it, when neither end has words', () => {
		const parts = make();
		showEnds(parts.legend, '−34 and below', '29 and above');
		showEnds(parts.legend, null, null);
		expect(parts.ends.hidden).toBe(true);
		expect(parts.low.textContent).toBe('');
		expect(parts.high.textContent).toBe('');
	});

	it('hides for nothing to show', () => {
		const parts = make();
		parts.legend.show({ scale: null, status: 'x', bar: null });
		parts.legend.show(null);
		expect(parts.root.hidden).toBe(true);
	});
});
