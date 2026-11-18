import { describe, expect, it } from 'vitest';
import {
	readEarthDataFile,
	readObservedPressureFile,
	readObservedWindFile,
} from '../../../../scripts/earth/dataFile.mjs';
import { decodeEarth, earthWorld, isMeasuredEarth } from '../../earth/earth';
import { getGrid } from '../../grid/grid';
import { solveTemperature } from '../../temperature/temperature';
import {
	type WindErrorFigures,
	type WindResult,
	windErrorFigures,
} from '../model';
import {
	decodeObservedPressure,
	decodeObservedWind,
	observedPressure,
	observedWind,
} from '../observedWind';
import { solveWinds, type WindSettings } from '../solve';
import {
	type EarthWindFigures,
	earthWindFigures,
	WIND_BASELINE_RESOLUTION,
	WIND_BASELINE_TOLERANCES,
	type WindBaselineFigures,
	windBaselineRegressions,
	windBaselineText,
} from './earthWinds';
import committed from './earthWinds.json';

/**
 * Time allowed for each test that solves the Earth's year of temperature
 * and winds: a few seconds, and several times that under coverage
 * instrumentation.
 */
const SOLVE_TIMEOUT_MS = 60_000;

/** The Earth's year of winds as solved now, against the observed. */
const solvedEarth = (settings?: Partial<WindSettings>): EarthWindFigures => {
	const earth = earthWorld(
		decodeEarth(readEarthDataFile()),
		WIND_BASELINE_RESOLUTION,
	);
	expect(isMeasuredEarth(earth)).toBe(true);
	const observed: WindResult = {
		...observedWind(
			decodeObservedWind(readObservedWindFile()),
			WIND_BASELINE_RESOLUTION,
		),
		pressure: observedPressure(
			decodeObservedPressure(readObservedPressureFile()),
			WIND_BASELINE_RESOLUTION,
		),
	};
	return earthWindFigures(
		solveWinds(earth, solveTemperature(earth).months, { settings }),
		observed,
		getGrid(WIND_BASELINE_RESOLUTION),
	);
};

/** A regression as the failing test words it. */
const described = ({
	figure,
	baseline,
	now,
}: {
	readonly figure: string;
	readonly baseline: number | null;
	readonly now: number;
}): string =>
	`${figure}: ${now.toFixed(3)} against the baseline's ${baseline?.toFixed(3) ?? 'none'}`;

/** The same three figures for every part of the year. */
const uniform = (
	rmsVectorDifference: number,
	directionSharePercent: number,
	pressureRmsDifference: number,
): EarthWindFigures => {
	const figures = {
		rmsVectorDifference,
		directionSharePercent,
		pressureRmsDifference,
	};
	return {
		resolution: WIND_BASELINE_RESOLUTION,
		year: figures,
		january: figures,
		july: figures,
	};
};

/** The figures with one figure of one part of the year changed. */
const withFigure = (
	figures: EarthWindFigures,
	period: 'year' | 'january' | 'july',
	figure: keyof WindBaselineFigures,
	value: number,
): EarthWindFigures => ({
	...figures,
	[period]: { ...figures[period], [figure]: value },
});

describe('the Earth winds baseline', () => {
	it(
		'is not worsened by more than the tolerances by the Earth as solved now',
		() => {
			expect(
				windBaselineRegressions(solvedEarth(), committed).map(described),
			).toEqual([]);
		},
		SOLVE_TIMEOUT_MS,
	);

	it(
		'is worsened by the thermal highs and lows made twice as strong',
		() => {
			// The thermal response doubled, from 3 to 6 hPa a kelvin, worsens
			// every one of the nine figures: the whole year's wind RMS to
			// 4.52 m/s, its direction share to 59.58% and its pressure RMS to
			// 8.34 hPa.
			const worse = windBaselineRegressions(
				solvedEarth({ thermalHpaPerK: 6 }),
				committed,
			);
			expect(worse.map(({ figure }) => figure)).toEqual([
				'whole year wind RMS',
				'whole year direction share',
				'whole year pressure RMS',
				'January wind RMS',
				'January direction share',
				'January pressure RMS',
				'July wind RMS',
				'July direction share',
				'July pressure RMS',
			]);
		},
		SOLVE_TIMEOUT_MS,
	);

	it('is committed for the baseline’s resolution', () => {
		expect(committed.resolution).toBe(WIND_BASELINE_RESOLUTION);
	});
});

describe('earthWindFigures', () => {
	const grid = getGrid(64);
	/** A year of winds and pressure that vary by cell and month. */
	const year = (
		offset: (month: number, cell: number) => number,
	): WindResult => {
		const fields = (value: (month: number, cell: number) => number) =>
			Array.from({ length: 12 }, (_, month) =>
				Float32Array.from({ length: grid.cellCount }, (_, cell) =>
					value(month, cell),
				),
			);
		return {
			east: fields(
				(month, cell) => 5 * Math.sin(cell / 997 + month) + offset(month, cell),
			),
			north: fields((month, cell) => 3 * Math.cos(cell / 613 - month)),
			pressure: fields(
				(month, cell) =>
					1013 + 8 * Math.sin(cell / 331 + month) + offset(month, cell),
			),
		};
	};
	/** The three figures the baseline takes from the wind model's. */
	const expected = (figures: WindErrorFigures): WindBaselineFigures => ({
		rmsVectorDifference: figures.rmsVectorDifference,
		directionSharePercent: (figures.directionShare as number) * 100,
		pressureRmsDifference: figures.pressureRmsDifference,
	});

	it("gives windErrorFigures' for the year, January and July, the share as a percentage", () => {
		const observed = year(() => 0);
		const simulated = year((month, cell) => ((cell % 7) - 3) * (month + 1));
		const figures = earthWindFigures(simulated, observed, grid);
		const theirs = windErrorFigures(simulated, observed, grid);
		expect(figures).toEqual({
			resolution: 64,
			year: expected(theirs.year),
			january: expected(theirs.months[0] as WindErrorFigures),
			july: expected(theirs.months[6] as WindErrorFigures),
		});
		expect(figures.july.directionSharePercent).toBeGreaterThan(1);
		expect(figures.july.directionSharePercent).toBeLessThan(100);
	});

	it('gives a direction share of NaN where no observed wind is strong enough', () => {
		const calm = year(() => 0);
		const observed: WindResult = {
			...calm,
			east: calm.east.map((field) => field.map(() => 0)),
			north: calm.north.map((field) => field.map(() => 0)),
		};
		expect(
			earthWindFigures(
				year(() => 0),
				observed,
				grid,
			).year.directionSharePercent,
		).toBeNaN();
	});

	it('refuses anything but twelve months of each', () => {
		const months = year(() => 0);
		const short: WindResult = {
			east: months.east.slice(1),
			north: months.north.slice(1),
			pressure: months.pressure.slice(1),
		};
		expect(() => earthWindFigures(short, months, grid)).toThrow(RangeError);
		expect(() => earthWindFigures(months, short, grid)).toThrow(RangeError);
	});
});

describe('windBaselineText', () => {
	it('rounds every figure to three decimals, never writing -0', () => {
		const text = windBaselineText(uniform(3.82249, 60.91051, -0.00012));
		const read = JSON.parse(text) as EarthWindFigures;
		expect(read.year).toEqual({
			rmsVectorDifference: 3.822,
			directionSharePercent: 60.911,
			pressureRmsDifference: 0,
		});
		expect(text).not.toContain('-0');
		expect(text.endsWith('}\n')).toBe(true);
	});

	it('keeps the resolution and the order of its keys', () => {
		const text = windBaselineText(
			withFigure(uniform(4, 60, 7), 'july', 'directionSharePercent', 57.8866),
		);
		const read = JSON.parse(text) as EarthWindFigures;
		expect(read.resolution).toBe(WIND_BASELINE_RESOLUTION);
		expect(read.july.directionSharePercent).toBe(57.887);
		expect(Object.keys(read)).toEqual([
			'resolution',
			'year',
			'january',
			'july',
		]);
		expect(Object.keys(read.year)).toEqual([
			'rmsVectorDifference',
			'directionSharePercent',
			'pressureRmsDifference',
		]);
	});
});

describe('windBaselineRegressions', () => {
	const baseline = uniform(3.75, 60.5, 7.25);
	const tolerance = WIND_BASELINE_TOLERANCES;

	it('passes figures equal to the baseline', () => {
		expect(windBaselineRegressions(baseline, baseline)).toEqual([]);
	});

	it('passes figures worse by no more than the tolerance', () => {
		expect(
			windBaselineRegressions(
				uniform(
					3.75 + tolerance.rmsVectorDifference * 0.9,
					60.5 - tolerance.directionSharePercent * 0.9,
					7.25 + tolerance.pressureRmsDifference * 0.9,
				),
				baseline,
			),
		).toEqual([]);
	});

	it('passes figures worse by exactly the tolerance', () => {
		expect(
			windBaselineRegressions(
				uniform(
					3.75 + tolerance.rmsVectorDifference,
					60.5 - tolerance.directionSharePercent,
					7.25 + tolerance.pressureRmsDifference,
				),
				baseline,
			),
		).toEqual([]);
	});

	it('passes figures that are better', () => {
		expect(windBaselineRegressions(uniform(3, 70, 6), baseline)).toEqual([]);
	});

	it('names each figure worse by more than its tolerance', () => {
		expect(
			windBaselineRegressions(
				withFigure(baseline, 'year', 'rmsVectorDifference', 3.775),
				baseline,
			),
		).toEqual([{ figure: 'whole year wind RMS', baseline: 3.75, now: 3.775 }]);
		expect(
			windBaselineRegressions(
				withFigure(baseline, 'january', 'directionSharePercent', 60.25),
				baseline,
			),
		).toEqual([
			{ figure: 'January direction share', baseline: 60.5, now: 60.25 },
		]);
		expect(
			windBaselineRegressions(
				withFigure(baseline, 'july', 'pressureRmsDifference', 7.31),
				baseline,
			),
		).toEqual([{ figure: 'July pressure RMS', baseline: 7.25, now: 7.31 }]);
	});

	it('counts a direction share as worse when lower and an RMS when higher', () => {
		// A higher share and lower RMS figures, each by far more than its
		// tolerance, pass.
		expect(windBaselineRegressions(uniform(3.5, 61, 7), baseline)).toEqual([]);
		expect(
			windBaselineRegressions(uniform(4, 60, 7.5), baseline).map(
				({ figure }) => figure,
			),
		).toEqual([
			'whole year wind RMS',
			'whole year direction share',
			'whole year pressure RMS',
			'January wind RMS',
			'January direction share',
			'January pressure RMS',
			'July wind RMS',
			'July direction share',
			'July pressure RMS',
		]);
	});

	it('names a figure that is not a number', () => {
		expect(
			windBaselineRegressions(
				withFigure(baseline, 'july', 'directionSharePercent', Number.NaN),
				baseline,
			),
		).toEqual([
			{ figure: 'July direction share', baseline: 60.5, now: Number.NaN },
		]);
		expect(
			windBaselineRegressions(
				withFigure(baseline, 'year', 'pressureRmsDifference', Number.NaN),
				baseline,
			),
		).toEqual([
			{ figure: 'whole year pressure RMS', baseline: 7.25, now: Number.NaN },
		]);
	});

	it('names a figure that is infinite, of either sign', () => {
		expect(
			windBaselineRegressions(
				withFigure(baseline, 'january', 'rmsVectorDifference', Infinity),
				baseline,
			),
		).toEqual([{ figure: 'January wind RMS', baseline: 3.75, now: Infinity }]);
		expect(
			windBaselineRegressions(
				withFigure(baseline, 'january', 'pressureRmsDifference', -Infinity),
				baseline,
			),
		).toEqual([
			{ figure: 'January pressure RMS', baseline: 7.25, now: -Infinity },
		]);
		expect(
			windBaselineRegressions(
				withFigure(baseline, 'year', 'directionSharePercent', Infinity),
				baseline,
			),
		).toEqual([
			{ figure: 'whole year direction share', baseline: 60.5, now: Infinity },
		]);
	});

	it('names a figure whose baseline is not finite, or missing', () => {
		expect(
			windBaselineRegressions(
				baseline,
				withFigure(baseline, 'july', 'rmsVectorDifference', Infinity),
			),
		).toEqual([{ figure: 'July wind RMS', baseline: Infinity, now: 3.75 }]);
		expect(
			windBaselineRegressions(
				baseline,
				withFigure(baseline, 'year', 'directionSharePercent', Number.NaN),
			),
		).toEqual([
			{
				figure: 'whole year direction share',
				baseline: Number.NaN,
				now: 60.5,
			},
		]);
		// A figure written while it was not finite is read back as null.
		const stored = JSON.parse(
			windBaselineText(
				withFigure(baseline, 'january', 'directionSharePercent', Number.NaN),
			),
		);
		expect(stored.january.directionSharePercent).toBeNull();
		expect(windBaselineRegressions(baseline, stored)).toEqual([
			{ figure: 'January direction share', baseline: null, now: 60.5 },
		]);
	});

	it('names every figure that is worse, in order', () => {
		const worse = withFigure(
			withFigure(
				withFigure(baseline, 'july', 'rmsVectorDifference', 4),
				'january',
				'pressureRmsDifference',
				8,
			),
			'year',
			'directionSharePercent',
			59,
		);
		expect(
			windBaselineRegressions(worse, baseline).map(({ figure }) => figure),
		).toEqual([
			'whole year direction share',
			'January pressure RMS',
			'July wind RMS',
		]);
	});

	it('takes tolerances of its own', () => {
		const now = uniform(3.85, 60.1, 7.4);
		expect(
			windBaselineRegressions(now, baseline, {
				rmsVectorDifference: 0.2,
				directionSharePercent: 0.5,
				pressureRmsDifference: 0.2,
			}),
		).toEqual([]);
		expect(windBaselineRegressions(now, baseline)).toHaveLength(9);
		expect(
			windBaselineRegressions(now, baseline, {
				rmsVectorDifference: 0.2,
				directionSharePercent: 0.3,
				pressureRmsDifference: 0.2,
			}).map(({ figure }) => figure),
		).toEqual([
			'whole year direction share',
			'January direction share',
			'July direction share',
		]);
	});

	it('refuses figures for another resolution', () => {
		expect(() =>
			windBaselineRegressions({ ...baseline, resolution: 128 }, baseline),
		).toThrow(RangeError);
	});
});
