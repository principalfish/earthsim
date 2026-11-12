import { describe, expect, it } from 'vitest';
import { DEFAULT_PAGE_VIEW, type PageView } from '../view';
import { createDateLine, dateLineText, formatWorldAge } from './dateLine';

/** The view in Temperature view with the month and summary given. */
const temperatureView = (
	temperature: PageView['temperatureView'] = 'month',
	month = 6,
): PageView => ({
	layer: 'temperature',
	temperatureView: temperature,
	source: 'simulated',
	month,
	sunlight: false,
});

describe('formatWorldAge', () => {
	it.each([
		[0, 'Year 0'],
		[1, 'Year 1'],
		[9_999, 'Year 9,999'],
		[10_000, '10,000 years'],
		[12_345, '12,345 years'],
		[999_999, '999,999 years'],
		[1_000_000, '1 million years'],
		[2_400_000, '2.4 million years'],
	])('writes %s years as %s', (years, text) => {
		expect(formatWorldAge(years)).toBe(text);
	});

	it('counts the year a world is in, not the years to come', () => {
		expect(formatWorldAge(0.75)).toBe('Year 0');
		expect(formatWorldAge(9_999.9)).toBe('Year 9,999');
	});

	it('rounds down, so an age is never written as one not yet reached', () => {
		expect(formatWorldAge(12_345.9)).toBe('12,345 years');
		expect(formatWorldAge(2_499_999)).toBe('2.4 million years');
		expect(formatWorldAge(999_999_999)).toBe('999.9 million years');
	});

	it('writes ages from a thousand million in billions', () => {
		expect(formatWorldAge(1_000_000_000)).toBe('1 billion years');
		expect(formatWorldAge(4_540_000_000)).toBe('4.5 billion years');
		expect(formatWorldAge(13_800_000_000_000)).toBe('13,800 billion years');
	});
});

describe('dateLineText', () => {
	it('gives the age alone in Terrain view', () => {
		expect(dateLineText(0, DEFAULT_PAGE_VIEW)).toBe('Year 0');
		expect(
			dateLineText(0, { ...DEFAULT_PAGE_VIEW, temperatureView: 'range' }),
		).toBe('Year 0');
	});

	it('gives the age and the month on screen in the Month view', () => {
		expect(dateLineText(0, temperatureView('month', 6))).toBe('Year 0 · July');
		expect(dateLineText(12_345, temperatureView('month', 0))).toBe(
			'12,345 years · January',
		);
	});

	it.each([
		['annualMean', 'Year 0 · Annual average'],
		['warmest', 'Year 0 · Warmest month'],
		['coldest', 'Year 0 · Coldest month'],
		['range', 'Year 0 · Seasonal range'],
	] as const)('gives the age and the summary for %s', (view, text) => {
		expect(dateLineText(0, temperatureView(view, 2))).toBe(text);
	});
});

describe('dateLineText, under sunlight', () => {
	it('gives the age and the month on screen in Terrain view', () => {
		const terrain = { ...DEFAULT_PAGE_VIEW, sunlight: true };
		expect(dateLineText(0, terrain)).toBe('Year 0 · July');
		expect(
			dateLineText(0, { ...terrain, temperatureView: 'range', month: 0 }),
		).toBe('Year 0 · January');
	});

	it('changes nothing in Temperature view', () => {
		for (const view of ['month', 'annualMean', 'range'] as const) {
			expect(
				dateLineText(0, { ...temperatureView(view, 2), sunlight: true }),
			).toBe(dateLineText(0, temperatureView(view, 2)));
		}
	});
});

describe('createDateLine', () => {
	const make = (years = 0, view: PageView = DEFAULT_PAGE_VIEW) => {
		const written: string[] = [];
		const line = createDateLine({
			years,
			view,
			show: (text) => written.push(text),
		});
		return { line, written };
	};

	it('writes the line at once', () => {
		expect(make(0, temperatureView()).written).toEqual(['Year 0 · July']);
	});

	it('follows the month on screen and the age', () => {
		const { line, written } = make(0, temperatureView());
		line.setView(temperatureView('month', 7));
		line.setYears(2_400_000);
		expect(written).toEqual([
			'Year 0 · July',
			'Year 0 · August',
			'2.4 million years · August',
		]);
	});

	it('writes the line again only when its words change', () => {
		const { line, written } = make(0, temperatureView('annualMean', 6));
		line.setView(temperatureView('annualMean', 7));
		line.setYears(0.5);
		line.setView({ ...DEFAULT_PAGE_VIEW, month: 3 });
		line.setView(DEFAULT_PAGE_VIEW);
		expect(written).toEqual(['Year 0 · Annual average', 'Year 0']);
	});

	it('names the month in Terrain view while sunlight is on, and drops it after', () => {
		const { line, written } = make();
		line.setView({ ...DEFAULT_PAGE_VIEW, sunlight: true });
		line.setView({ ...DEFAULT_PAGE_VIEW, sunlight: true, month: 7 });
		line.setView({ ...DEFAULT_PAGE_VIEW, month: 7 });
		expect(written).toEqual([
			'Year 0',
			'Year 0 · July',
			'Year 0 · August',
			'Year 0',
		]);
	});
});
