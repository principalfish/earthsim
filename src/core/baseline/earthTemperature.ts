/**
 * The error figures of the simulated Earth against the observed
 * temperature, and the check that a change to the model has not made them
 * worse than those committed beside this module in
 * `earthTemperature.json`.
 *
 * The committed figures are for the Earth preset at 64 cells per face edge,
 * with Earth's planet settings and the preset's sea level, simulated less
 * observed, in kelvin, rounded to {@link BASELINE_DECIMALS} decimals. The
 * test beside this module solves that world and fails if any figure is
 * worse than its committed value by more than {@link BASELINE_TOLERANCE_K};
 * `npm run baseline:temperature` writes the figures afresh, to be
 * committed when a change is meant to move them.
 */

import { compareField, type FieldDifference } from '../compare';
import type { Grid, Resolution } from '../grid';
import { MONTH_NAMES, MONTHS_PER_YEAR } from '../insolation';
import type { MonthlyTemperature } from '../observed';
import { summariseTemperature } from '../temperature';

/** The resolution the baseline is worked out at. */
export const BASELINE_RESOLUTION: Resolution = 64;

/**
 * How much worse than the baseline a figure may be, in kelvin, before the
 * check fails: room for the rounding of the committed figures and for a
 * change that moves the answer by a whisker, far below the model's own
 * accuracy.
 */
export const BASELINE_TOLERANCE_K = 0.05;

/** The decimals the committed figures are rounded to. */
export const BASELINE_DECIMALS = 3;

/** The summaries of the year the baseline holds figures for. */
export const BASELINE_SUMMARIES = [
	'annualMean',
	'warmest',
	'coldest',
	'range',
] as const;

/** A summary of the year the baseline holds figures for. */
export type BaselineSummary = (typeof BASELINE_SUMMARIES)[number];

/** The Earth's error figures: simulated less observed, in kelvin. */
export type EarthTemperatureFigures = {
	/** Cells along a face edge of the world the figures are for. */
	readonly resolution: number;
	/** The annual average's figures. */
	readonly annualMean: FieldDifference;
	/** Each month's, January to December. */
	readonly months: readonly FieldDifference[];
	/** The warmest month's, each cell's own. */
	readonly warmest: FieldDifference;
	/** The coldest month's, each cell's own. */
	readonly coldest: FieldDifference;
	/** The seasonal range's: the warmest less the coldest month. */
	readonly range: FieldDifference;
};

/**
 * The Earth's error figures for a simulated year against the observed one.
 *
 * @remarks
 * Each figure is {@link compareField}'s for one pair of fields: a month of
 * the simulated year against the same month observed, and a summary of the
 * simulated year, from {@link summariseTemperature}, against the same
 * summary of the observed year. These are the figures the page shows under
 * its legend for the same view.
 *
 * @param simulated - Twelve simulated months, one value per cell of `grid`.
 * Not changed.
 * @param observed - The twelve observed months on the same grid. Not
 * changed.
 * @param grid - The grid both are on.
 * @returns New figures, unrounded.
 * @throws RangeError if either does not hold twelve fields of one value per
 * cell.
 */
export const earthTemperatureFigures = (
	simulated: MonthlyTemperature,
	observed: MonthlyTemperature,
	grid: Grid,
): EarthTemperatureFigures => {
	if (
		simulated.length !== MONTHS_PER_YEAR ||
		observed.length !== MONTHS_PER_YEAR
	) {
		throw new RangeError(`Comparing needs ${MONTHS_PER_YEAR} months of each`);
	}
	const months = simulated.map((field, month) =>
		compareField(field, observed[month] as Float32Array, grid),
	);
	const ours = summariseTemperature(simulated);
	const theirs = summariseTemperature(observed);
	const summary = (name: BaselineSummary): FieldDifference =>
		compareField(ours[name], theirs[name], grid);
	return {
		resolution: grid.n,
		annualMean: summary('annualMean'),
		months,
		warmest: summary('warmest'),
		coldest: summary('coldest'),
		range: summary('range'),
	};
};

/** A number rounded to {@link BASELINE_DECIMALS} decimals, never `-0`. */
const rounded = (value: number): number => {
	const result = Number(value.toFixed(BASELINE_DECIMALS));
	return result === 0 ? 0 : result;
};

/** A pair of figures rounded as the baseline keeps them. */
const roundedPair = (figures: FieldDifference): FieldDifference => ({
	meanDifference: rounded(figures.meanDifference),
	rmsDifference: rounded(figures.rmsDifference),
});

/**
 * The figures as the baseline file holds them: each rounded to
 * {@link BASELINE_DECIMALS} decimals, in JSON with two spaces of indent and
 * a line ending at the end, the form the project's formatter leaves as it
 * is.
 *
 * @param figures - The figures. Not changed.
 * @returns The whole text of the file.
 */
export const baselineText = (figures: EarthTemperatureFigures): string => {
	const file: EarthTemperatureFigures = {
		resolution: figures.resolution,
		annualMean: roundedPair(figures.annualMean),
		months: figures.months.map(roundedPair),
		warmest: roundedPair(figures.warmest),
		coldest: roundedPair(figures.coldest),
		range: roundedPair(figures.range),
	};
	return `${JSON.stringify(file, null, 2)}\n`;
};

/** One figure that is worse than the baseline's by more than the tolerance. */
export type BaselineRegression = {
	/** Which figure, such as `July RMS` or `annual average mean`. */
	readonly figure: string;
	/** The baseline's value, in kelvin. */
	readonly baseline: number;
	/** The value now, in kelvin. */
	readonly now: number;
};

/** What each part of the figures is called in a regression. */
const PART_NAMES: Readonly<Record<BaselineSummary, string>> = {
	annualMean: 'annual average',
	warmest: 'warmest month',
	coldest: 'coldest month',
	range: 'seasonal range',
};

/**
 * The figures that are worse than the baseline's by more than a tolerance.
 *
 * @remarks
 * A root-mean-square difference is worse when it is more than the
 * tolerance above the baseline's. A mean difference is worse when its size
 * is more than the tolerance above the size of the baseline's, whichever
 * its sign: a mean that crosses zero is no worse for that if its size is
 * within the tolerance. A figure that is better, or no worse than the
 * tolerance allows, passes. A figure that is not a finite number, NaN
 * included, is worse whatever its value, as is any figure whose baseline is
 * not finite: a solve that went wrong never passes.
 *
 * @param now - The figures as they are now.
 * @param baseline - The committed figures.
 * @param toleranceK - How much worse a figure may be; left out,
 * {@link BASELINE_TOLERANCE_K}.
 * @returns The figures that are worse, in the order annual average, the
 * months, warmest, coldest and seasonal range, each mean before its RMS;
 * empty when none is.
 * @throws RangeError if the two are not for the same resolution, or either
 * does not hold twelve months.
 */
export const baselineRegressions = (
	now: EarthTemperatureFigures,
	baseline: EarthTemperatureFigures,
	toleranceK = BASELINE_TOLERANCE_K,
): BaselineRegression[] => {
	if (now.resolution !== baseline.resolution) {
		throw new RangeError(
			`The baseline is for ${baseline.resolution} cells per face edge; the figures are for ${now.resolution}`,
		);
	}
	if (
		now.months.length !== MONTHS_PER_YEAR ||
		baseline.months.length !== MONTHS_PER_YEAR
	) {
		throw new RangeError(`The figures need ${MONTHS_PER_YEAR} months`);
	}
	const regressions: BaselineRegression[] = [];
	/** Whether a figure is worse than its baseline by more than the tolerance. */
	const worse = (figure: number, base: number): boolean =>
		!(
			Number.isFinite(figure) &&
			Number.isFinite(base) &&
			figure <= base + toleranceK
		);
	const check = (
		name: string,
		ours: FieldDifference,
		theirs: FieldDifference,
	): void => {
		if (worse(Math.abs(ours.meanDifference), Math.abs(theirs.meanDifference))) {
			regressions.push({
				figure: `${name} mean`,
				baseline: theirs.meanDifference,
				now: ours.meanDifference,
			});
		}
		if (worse(ours.rmsDifference, theirs.rmsDifference)) {
			regressions.push({
				figure: `${name} RMS`,
				baseline: theirs.rmsDifference,
				now: ours.rmsDifference,
			});
		}
	};
	check(PART_NAMES.annualMean, now.annualMean, baseline.annualMean);
	MONTH_NAMES.forEach((name, month) => {
		check(
			name,
			now.months[month] as FieldDifference,
			baseline.months[month] as FieldDifference,
		);
	});
	for (const part of ['warmest', 'coldest', 'range'] as const) {
		check(PART_NAMES[part], now[part], baseline[part]);
	}
	return regressions;
};
