import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TemperatureProgress } from '../../core/index';
import {
	progressOf,
	temperatureOf,
} from '../../core/testing/temperatureFixtures';
import { rampGradient, TEMPERATURE_RAMP } from '../globe/ramp';
import type { TemperatureLayer } from '../layers';
import {
	createFakeDocument,
	type FakeElement,
	oneByClass,
} from '../testing/fakeDocument';
import { TWO_STOP_RAMP } from '../testing/rampFixtures';
import {
	createLegend,
	fitRange,
	formatTick,
	LEGEND_EMPTY_TEXT,
	LEGEND_FIRST_YEAR_TEXT,
	LEGEND_NOT_SHOWN_TEXT,
	LEGEND_OUT_OF_DATE_TEXT,
	LEGEND_UNAVAILABLE_TEXT,
	legendContent,
	legendTicks,
	MAX_LEGEND_TICKS,
	MIN_FITTED_SPAN_C,
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

describe('fitRange', () => {
	it('spans the coldest and hottest values of all twelve months', () => {
		// The coldest value is in January and the hottest in December, both
		// far from July's.
		const months = monthsOf(-40, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 30);
		months[0]?.set([-40, -52.5]);
		months[11]?.set([30, 41.5]);
		expect(fitRange(months)).toEqual({ min: -52.5, max: 41.5 });
	});

	it('widens a constant field about its value', () => {
		const months = Array.from({ length: 12 }, () =>
			Float32Array.of(12, 12, 12),
		);
		expect(fitRange(months)).toEqual({
			min: 12 - MIN_FITTED_SPAN_C / 2,
			max: 12 + MIN_FITTED_SPAN_C / 2,
		});
	});

	it('widens a field that varies less than the narrowest span about its middle', () => {
		expect(fitRange([Float32Array.of(5, 5.5)])).toEqual({
			min: 5.25 - MIN_FITTED_SPAN_C / 2,
			max: 5.25 + MIN_FITTED_SPAN_C / 2,
		});
	});

	it('passes over values that are not numbers', () => {
		expect(fitRange([Float32Array.of(Number.NaN, -10, 10)])).toEqual({
			min: -10,
			max: 10,
		});
	});

	it('passes over infinite values', () => {
		expect(
			fitRange([
				Float32Array.of(Number.POSITIVE_INFINITY, -10),
				Float32Array.of(10, Number.NEGATIVE_INFINITY),
			]),
		).toEqual({ min: -10, max: 10 });
	});

	it('refuses fields with no value to fit', () => {
		expect(() => fitRange([])).toThrow(RangeError);
		expect(() => fitRange([Float32Array.of(Number.NaN)])).toThrow(RangeError);
		expect(() =>
			fitRange([
				Float32Array.of(Number.POSITIVE_INFINITY, Number.NaN),
				Float32Array.of(Number.NEGATIVE_INFINITY),
			]),
		).toThrow(RangeError);
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

describe('legendContent', () => {
	const range = { min: -10, max: 30 };
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
		expect(
			legendContent(layerOf('current'), range, TEMPERATURE_RAMP, true),
		).toEqual({
			scale: {
				gradient: rampGradient(TEMPERATURE_RAMP),
				ticks: [
					{ label: '−10', position: 0 },
					{ label: '0', position: 25 },
					{ label: '10', position: 50 },
					{ label: '20', position: 75 },
					{ label: '30', position: 100 },
				],
			},
			status: null,
			bar: null,
		});
	});

	it('says a current result the globe shows no scale for could not be shown', () => {
		expect(
			legendContent(layerOf('current'), null, TEMPERATURE_RAMP, false),
		).toEqual({
			scale: null,
			status: LEGEND_NOT_SHOWN_TEXT,
			bar: null,
		});
	});

	it('marks a current result out of date while the globe still shows an earlier one', () => {
		const content = legendContent(
			layerOf('current'),
			range,
			TEMPERATURE_RAMP,
			false,
		);
		expect(content.scale).not.toBeNull();
		expect(content.status).toBe(LEGEND_OUT_OF_DATE_TEXT);
		expect(content.bar).toBeNull();
	});

	it('draws the ramp it is given', () => {
		const content = legendContent(
			layerOf('current'),
			range,
			TWO_STOP_RAMP,
			true,
		);
		expect(content.scale?.gradient).toBe(rampGradient(TWO_STOP_RAMP));
	});

	it('marks an out-of-date result, still drawn', () => {
		const content = legendContent(
			layerOf('outOfDate'),
			range,
			TEMPERATURE_RAMP,
			true,
		);
		expect(content.scale).not.toBeNull();
		expect(content.status).toBe(LEGEND_OUT_OF_DATE_TEXT);
		expect(content.bar).toBeNull();
	});

	it('marks a calculation under way with its progress, over the result on hand', () => {
		const content = legendContent(
			layerOf('calculating', true, progressWith(3, 2)),
			range,
			TEMPERATURE_RAMP,
			true,
		);
		expect(content.scale).not.toBeNull();
		expect(content.status).toBe('Calculating · year 3, about 2 to go');
		expect(content.bar).toEqual({ fraction: 0.6 });
	});

	it('shows the progress alone while the first result is calculated', () => {
		const content = legendContent(
			layerOf('calculating', false),
			null,
			TEMPERATURE_RAMP,
			false,
		);
		expect(content).toEqual({
			scale: null,
			status: LEGEND_FIRST_YEAR_TEXT,
			bar: { fraction: null },
		});
	});

	it('says there is nothing yet before the first result', () => {
		expect(
			legendContent(layerOf('empty', false), null, TEMPERATURE_RAMP, false),
		).toEqual({
			scale: null,
			status: LEGEND_EMPTY_TEXT,
			bar: null,
		});
	});

	it('says the temperature is unavailable, keeping a result on hand', () => {
		const kept = legendContent(
			layerOf('unavailable'),
			range,
			TEMPERATURE_RAMP,
			true,
		);
		expect(kept.scale).not.toBeNull();
		expect(kept.status).toBe(LEGEND_UNAVAILABLE_TEXT);
		const none = legendContent(
			layerOf('unavailable', false),
			null,
			TEMPERATURE_RAMP,
			false,
		);
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
		const legend = createLegend('Air temperature, °C');
		const root = legend.element as unknown as FakeElement;
		return {
			legend,
			root,
			ramp: oneByClass(root, 'legend__ramp'),
			ticks: oneByClass(root, 'legend__ticks'),
			scale: oneByClass(root, 'legend__scale'),
			status: oneByClass(root, 'legend__status'),
			bar: oneByClass(root, 'legend__bar'),
		};
	};

	it('starts hidden, with its caption', () => {
		const { root, scale } = make();
		expect(root.hidden).toBe(true);
		expect(oneByClass(scale, 'legend__caption').textContent).toBe(
			'Air temperature, °C',
		);
	});

	it('draws the scale and its ticks, with no status or bar for a current result', () => {
		const parts = make();
		parts.legend.show({
			scale: {
				gradient: 'linear-gradient(red, blue)',
				ticks: [
					{ label: '−10', position: 0 },
					{ label: '20', position: 75 },
				],
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
					gradient: 'g',
					ticks: labels.map((label, index) => ({ label, position: index })),
				},
				status: null,
				bar: null,
			});
		show(['1', '2', '3']);
		show(['4']);
		expect(parts.ticks.children.map((tick) => tick.textContent)).toEqual(['4']);
	});

	it('hides for nothing to show', () => {
		const parts = make();
		parts.legend.show({ scale: null, status: 'x', bar: null });
		parts.legend.show(null);
		expect(parts.root.hidden).toBe(true);
	});
});
