import { describe, expect, it } from 'vitest';
import {
	readEarthDataFile,
	readObservedSeaTemperatureFile,
	readObservedTemperatureFile,
} from '../../../../scripts/earth/dataFile.mjs';
import { solveClimate } from '../../climate';
import {
	compareField,
	compareFields,
	compareFieldWhereBoth,
} from '../../compare';
import { decodeEarth, earthWorld, isMeasuredEarth } from '../../earth/earth';
import { getGrid } from '../../grid/grid';
import {
	decodeObservedSeaTemperature,
	observedSeaTemperatureOn,
} from '../../ocean/observed';
import { decodeObservedTemperature, observedTemperature } from '../observed';
import { summariseTemperature } from '../temperature';
import {
	BASELINE_RESOLUTION,
	BASELINE_TOLERANCE_K,
	baselineRegressions,
	baselineText,
	COAST_CONTRAST_TOLERANCE_K,
	type EarthTemperatureFigures,
	earthTemperatureFigures,
	seaTemperatureFigures,
} from './earthTemperature';
import committed from './earthTemperature.json';

/**
 * Time allowed for the test that solves the Earth's climate: about ten
 * seconds, and up to seven times that under coverage instrumentation.
 */
const SOLVE_TIMEOUT_MS = 180_000;

/** Figures that are all the same pair, for the tests of the check. */
const uniform = (meanDifference: number, rmsDifference: number) => {
	const pair = { meanDifference, rmsDifference };
	return {
		resolution: BASELINE_RESOLUTION,
		annualMean: pair,
		months: Array.from({ length: 12 }, () => pair),
		warmest: pair,
		coldest: pair,
		range: pair,
	} satisfies EarthTemperatureFigures;
};

/** The figures with one pair changed. */
const withPart = (
	figures: EarthTemperatureFigures,
	part: 'annualMean' | 'warmest' | 'coldest' | 'range' | number,
	meanDifference: number,
	rmsDifference: number,
): EarthTemperatureFigures => {
	const pair = { meanDifference, rmsDifference };
	if (typeof part === 'number') {
		return {
			...figures,
			months: figures.months.map((month, index) =>
				index === part ? pair : month,
			),
		};
	}
	return { ...figures, [part]: pair };
};

describe('the Earth temperature baseline', () => {
	it(
		'is not worsened by more than the tolerance by the Earth as solved now',
		() => {
			const earth = earthWorld(
				decodeEarth(readEarthDataFile()),
				BASELINE_RESOLUTION,
			);
			expect(isMeasuredEarth(earth)).toBe(true);
			const observed = observedTemperature(
				decodeObservedTemperature(readObservedTemperatureFile()),
				BASELINE_RESOLUTION,
			);
			const grid = getGrid(BASELINE_RESOLUTION);
			const { temperature } = solveClimate(earth);
			const now = earthTemperatureFigures(
				temperature.months,
				observed,
				grid,
				earth,
				{
					simulated: temperature.seaMonths,
					observed: observedSeaTemperatureOn(
						grid,
						decodeObservedSeaTemperature(readObservedSeaTemperatureFile()),
					),
				},
			);
			const worse = baselineRegressions(now, committed);
			expect(
				worse.map(
					({ figure, baseline, now }) =>
						`${figure}: ${now.toFixed(3)} K against the baseline's ${baseline.toFixed(3)} K`,
				),
			).toEqual([]);
		},
		SOLVE_TIMEOUT_MS,
	);

	it('is the committed file in the form the update writes it', () => {
		expect(committed.resolution).toBe(BASELINE_RESOLUTION);
		expect(committed.months).toHaveLength(12);
		expect(JSON.parse(baselineText(committed))).toEqual(committed);
	});

	it('holds the west–east coast contrasts, the winds’ and the currents’ heat carrying keeping them above what the model without either gives', () => {
		// The model without winds or currents gives Europe against Asia 0.7 K
		// for the year and 2.4 K in January, and North America −0.8 and −0.6 K,
		// against the observed 11.5 and 22.9, and 5.8 and 15.1. The winds
		// without the currents give 2.8 and 6.3, and −0.1 and 2.8; with the
		// currents and the upwelling, 0.9 and 4.2, and 1.4 and 4.2: the
		// currents warm East Asia's coasts, beside the Kuroshio, more than
		// western Europe.
		const { europeAsia, northAmerica } = committed.coastContrast;
		expect(europeAsia.simulated.annual).toBeGreaterThan(0.7);
		expect(europeAsia.simulated.january).toBeGreaterThan(4);
		expect(northAmerica.simulated.annual).toBeGreaterThan(1);
		expect(northAmerica.simulated.january).toBeGreaterThan(3.5);
		expect(europeAsia.observed.annual).toBeGreaterThan(11);
		expect(europeAsia.observed.january).toBeGreaterThan(22);
	});
});

describe('earthTemperatureFigures', () => {
	const grid = getGrid(64);
	/** Twelve months that vary by cell and month. */
	const year = (offset: (month: number, cell: number) => number) =>
		Array.from({ length: 12 }, (_, month) => {
			const field = new Float32Array(grid.cellCount);
			for (let cell = 0; cell < grid.cellCount; cell++) {
				field[cell] =
					10 + 8 * Math.sin(cell / 997 + month) + offset(month, cell);
			}
			return field;
		});

	it('gives compareField of each month and of each summary', () => {
		const observed = year(() => 0);
		const simulated = year((month, cell) => (cell % 5) - month / 3);
		const figures = earthTemperatureFigures(simulated, observed, grid);
		expect(figures.resolution).toBe(64);
		expect(figures.months).toEqual(
			compareFields(simulated, observed, grid).months,
		);
		const ours = summariseTemperature(simulated);
		const theirs = summariseTemperature(observed);
		for (const part of ['annualMean', 'warmest', 'coldest', 'range'] as const) {
			expect(figures[part]).toEqual(
				compareField(ours[part], theirs[part], grid),
			);
		}
	});

	it('refuses anything but twelve months of each', () => {
		const months = year(() => 0);
		expect(() =>
			earthTemperatureFigures(months.slice(1), months, grid),
		).toThrow(RangeError);
		expect(() =>
			earthTemperatureFigures(months, months.slice(1), grid),
		).toThrow(RangeError);
	});

	it("holds the sea's figures, over the cells that are sea in both, only when given the sea's year", () => {
		const observed = year(() => 0);
		const simulated = year((month) => 1 + month / 12);
		// Land in the simulated sea, no data in the observed.
		for (const field of simulated) {
			field.fill(Number.NaN, 0, 1000);
		}
		for (const field of observed) {
			field.fill(Number.NaN, 500, 2000);
		}
		const sea = { simulated, observed };
		const figures = earthTemperatureFigures(
			observed,
			observed,
			grid,
			undefined,
			sea,
		);
		expect(figures.seaTemperature).toEqual(seaTemperatureFigures(sea, grid));
		expect(figures.seaTemperature?.january).toEqual(
			compareFieldWhereBoth(
				simulated[0] as Float32Array,
				observed[0] as Float32Array,
				grid,
			),
		);
		// The annual means differ by the months' mean offset.
		expect(figures.seaTemperature?.annualMean.meanDifference).toBeCloseTo(
			1 + 11 / 24,
			5,
		);
		expect(
			earthTemperatureFigures(observed, observed, grid),
		).not.toHaveProperty('seaTemperature');
		expect(() =>
			seaTemperatureFigures({ simulated: simulated.slice(1), observed }, grid),
		).toThrow(RangeError);
		expect(() =>
			seaTemperatureFigures({ simulated, observed: observed.slice(2) }, grid),
		).toThrow(RangeError);
	});
});

describe('baselineText', () => {
	it('rounds every figure to three decimals, never writing -0', () => {
		const text = baselineText(uniform(-0.00012, 3.93449));
		const read = JSON.parse(text) as EarthTemperatureFigures;
		expect(read.annualMean).toEqual({
			meanDifference: 0,
			rmsDifference: 3.934,
		});
		expect(text).not.toContain('-0,');
		expect(text.endsWith('}\n')).toBe(true);
	});

	it('keeps the sign and the resolution', () => {
		const read = JSON.parse(
			baselineText(withPart(uniform(0, 1), 'warmest', -1.0004, 3.9106)),
		) as EarthTemperatureFigures;
		expect(read.resolution).toBe(BASELINE_RESOLUTION);
		expect(read.warmest).toEqual({ meanDifference: -1, rmsDifference: 3.911 });
	});
});

describe('baselineRegressions', () => {
	const baseline = uniform(-0.5, 4);

	it('passes figures equal to the baseline', () => {
		expect(baselineRegressions(baseline, baseline)).toEqual([]);
	});

	it('passes figures worse by no more than the tolerance', () => {
		const within = BASELINE_TOLERANCE_K * 0.9;
		expect(
			baselineRegressions(uniform(-0.5 - within, 4 + within), baseline),
		).toEqual([]);
		// A mean that crosses zero is judged by its size.
		expect(baselineRegressions(uniform(0.5 + within, 4), baseline)).toEqual([]);
	});

	it('passes figures that are better', () => {
		expect(baselineRegressions(uniform(-0.1, 3), baseline)).toEqual([]);
		expect(baselineRegressions(uniform(0.2, 2.5), baseline)).toEqual([]);
	});

	it('names an RMS worse by more than the tolerance', () => {
		expect(
			baselineRegressions(withPart(baseline, 6, -0.5, 4.06), baseline),
		).toEqual([{ figure: 'July RMS', baseline: 4, now: 4.06 }]);
	});

	it('names a mean worse by more than the tolerance, of either sign', () => {
		expect(
			baselineRegressions(withPart(baseline, 'annualMean', -0.56, 4), baseline),
		).toEqual([{ figure: 'annual average mean', baseline: -0.5, now: -0.56 }]);
		expect(
			baselineRegressions(withPart(baseline, 'range', 0.56, 4), baseline),
		).toEqual([{ figure: 'seasonal range mean', baseline: -0.5, now: 0.56 }]);
	});

	it('names a figure that is not a number', () => {
		expect(
			baselineRegressions(withPart(baseline, 3, Number.NaN, 4), baseline),
		).toEqual([{ figure: 'April mean', baseline: -0.5, now: Number.NaN }]);
		expect(
			baselineRegressions(
				withPart(baseline, 'coldest', -0.5, Number.NaN),
				baseline,
			),
		).toEqual([{ figure: 'coldest month RMS', baseline: 4, now: Number.NaN }]);
	});

	it('names a figure that is infinite, of either sign', () => {
		expect(
			baselineRegressions(
				withPart(baseline, 'warmest', -0.5, Infinity),
				baseline,
			),
		).toEqual([{ figure: 'warmest month RMS', baseline: 4, now: Infinity }]);
		expect(
			baselineRegressions(
				withPart(baseline, 'annualMean', -Infinity, 4),
				baseline,
			),
		).toEqual([
			{ figure: 'annual average mean', baseline: -0.5, now: -Infinity },
		]);
	});

	it('names a figure whose baseline is not finite', () => {
		expect(
			baselineRegressions(
				baseline,
				withPart(baseline, 'range', -0.5, Infinity),
			),
		).toEqual([{ figure: 'seasonal range RMS', baseline: Infinity, now: 4 }]);
		expect(
			baselineRegressions(baseline, withPart(baseline, 0, Number.NaN, 4)),
		).toEqual([{ figure: 'January mean', baseline: Number.NaN, now: -0.5 }]);
	});

	it('names every figure that is worse, in order', () => {
		const worse = withPart(
			withPart(withPart(baseline, 0, -0.5, 5), 'warmest', -0.7, 4.2),
			'coldest',
			-0.5,
			4.1,
		);
		expect(
			baselineRegressions(worse, baseline).map(({ figure }) => figure),
		).toEqual([
			'January RMS',
			'warmest month mean',
			'warmest month RMS',
			'coldest month RMS',
		]);
	});

	it('takes a tolerance of its own', () => {
		expect(baselineRegressions(uniform(-0.5, 4.2), baseline, 0.25)).toEqual([]);
		expect(baselineRegressions(uniform(-0.5, 4.2), baseline, 0.1)).toHaveLength(
			16,
		);
	});

	it('refuses figures for another resolution, or without twelve months', () => {
		expect(() =>
			baselineRegressions({ ...baseline, resolution: 128 }, baseline),
		).toThrow(RangeError);
		expect(() =>
			baselineRegressions(
				{ ...baseline, months: baseline.months.slice(1) },
				baseline,
			),
		).toThrow(RangeError);
		expect(() =>
			baselineRegressions(baseline, {
				...baseline,
				months: baseline.months.slice(1),
			}),
		).toThrow(RangeError);
	});
});

describe('the west–east coast contrasts in the baseline check', () => {
	const contrast = (annual: number, january: number) => ({
		simulated: { annual, january },
		observed: { annual: 11.5, january: 22.9 },
	});
	const coast = (europeAsia: number, northAmerica: number) => ({
		europeAsia: contrast(europeAsia, 2 * europeAsia),
		northAmerica: contrast(northAmerica, 2 * northAmerica),
	});
	const baseline = { ...uniform(-0.5, 4), coastContrast: coast(3, 1) };

	it('passes contrasts as large as the baseline’s, or larger, or smaller by no more than the tolerance', () => {
		expect(baselineRegressions(baseline, baseline)).toEqual([]);
		expect(
			baselineRegressions(
				{ ...baseline, coastContrast: coast(5, 4) },
				baseline,
			),
		).toEqual([]);
		const within = COAST_CONTRAST_TOLERANCE_K * 0.9;
		expect(
			baselineRegressions(
				{ ...baseline, coastContrast: coast(3 - within / 2, 1 - within / 2) },
				baseline,
			),
		).toEqual([]);
	});

	it('names a contrast that has shrunk by more than the tolerance, or is not a number, or is missing', () => {
		const shrunk = baselineRegressions(
			{ ...baseline, coastContrast: coast(2, 1) },
			baseline,
		);
		expect(shrunk.map(({ figure }) => figure)).toEqual([
			'Europe–Asia annual coast contrast',
			'Europe–Asia January coast contrast',
		]);
		expect(shrunk[0]).toEqual({
			figure: 'Europe–Asia annual coast contrast',
			baseline: 3,
			now: 2,
		});
		expect(
			baselineRegressions(
				{ ...baseline, coastContrast: coast(Number.NaN, 1) },
				baseline,
			).map(({ figure }) => figure),
		).toEqual([
			'Europe–Asia annual coast contrast',
			'Europe–Asia January coast contrast',
		]);
		expect(
			baselineRegressions(uniform(-0.5, 4), baseline).map(
				({ figure }) => figure,
			),
		).toHaveLength(4);
		// A baseline with no contrasts holds none to lose.
		expect(baselineRegressions(baseline, uniform(-0.5, 4))).toEqual([]);
	});

	it('writes the contrasts rounded to three decimals, and none when there are none', () => {
		const text = baselineText({
			...uniform(0, 1),
			coastContrast: coast(2.92149, 0.03849),
		});
		const read = JSON.parse(text) as EarthTemperatureFigures;
		expect(read.coastContrast?.europeAsia.simulated.annual).toBe(2.921);
		expect(read.coastContrast?.northAmerica.simulated.annual).toBe(0.038);
		expect(JSON.parse(baselineText(uniform(0, 1)))).not.toHaveProperty(
			'coastContrast',
		);
	});
});

describe("the sea's own temperature in the baseline check", () => {
	const sea = (rms: number) => ({
		annualMean: { meanDifference: -0.3, rmsDifference: rms },
		january: { meanDifference: -0.1, rmsDifference: rms + 0.1 },
	});
	const baseline = { ...uniform(-0.5, 4), seaTemperature: sea(2.4) };

	it('passes figures no worse than the tolerance allows, and checks none against a baseline without them', () => {
		expect(baselineRegressions(baseline, baseline)).toEqual([]);
		expect(
			baselineRegressions(
				{ ...baseline, seaTemperature: sea(2.4 + BASELINE_TOLERANCE_K * 0.9) },
				baseline,
			),
		).toEqual([]);
		expect(baselineRegressions(uniform(-0.5, 4), uniform(-0.5, 4))).toEqual([]);
	});

	it('names a worse or missing sea figure', () => {
		expect(
			baselineRegressions({ ...baseline, seaTemperature: sea(3) }, baseline),
		).toEqual([
			{ figure: 'sea temperature annual average RMS', baseline: 2.4, now: 3 },
			{ figure: 'sea temperature January RMS', baseline: 2.5, now: 3.1 },
		]);
		expect(
			baselineRegressions(uniform(-0.5, 4), baseline).map(
				({ figure }) => figure,
			),
		).toEqual([
			'sea temperature annual average mean',
			'sea temperature annual average RMS',
			'sea temperature January mean',
			'sea temperature January RMS',
		]);
	});

	it('writes the sea figures rounded to three decimals, and none when there are none', () => {
		const read = JSON.parse(
			baselineText({ ...uniform(0, 1), seaTemperature: sea(2.41449) }),
		) as EarthTemperatureFigures;
		expect(read.seaTemperature?.annualMean).toEqual({
			meanDifference: -0.3,
			rmsDifference: 2.414,
		});
		expect(JSON.parse(baselineText(uniform(0, 1)))).not.toHaveProperty(
			'seaTemperature',
		);
	});
});
