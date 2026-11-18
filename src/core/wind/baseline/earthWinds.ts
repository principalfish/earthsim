/**
 * The error figures of the simulated Earth's winds and sea-level pressure
 * against the observed, and the check that a change to the model has not
 * made them worse than those committed beside this module in
 * `earthWinds.json`.
 *
 * The committed figures are for the Earth preset at 64 cells per face edge,
 * with Earth's planet settings and the preset's sea level, its winds those
 * of the climate loop that works the temperature and the winds out together,
 * with the wind model's default settings, against the observed winds and
 * pressure on the same cells, rounded to {@link WIND_BASELINE_DECIMALS}
 * decimals. The test beside this module solves that world and fails if any
 * figure is worse than its committed value by more than its tolerance in
 * {@link WIND_BASELINE_TOLERANCES}; `npm run baseline:winds` writes the
 * figures afresh, to be committed when a change is meant to move them.
 *
 * The winds follow the temperature and the temperature the winds, so a
 * change to the temperature model moves these figures as well as the
 * temperature's own baseline.
 */

import type { Grid, Resolution } from '../../grid/grid';
import {
	type WindErrorFigures,
	type WindResult,
	windErrorFigures,
} from '../model';

/** The resolution the baseline is worked out at. */
export const WIND_BASELINE_RESOLUTION: Resolution = 64;

/** The decimals the committed figures are rounded to. */
export const WIND_BASELINE_DECIMALS = 3;

/** The three figures the baseline holds for each part of the year. */
export type WindBaselineFigures = {
	/**
	 * The root-mean-square length of the simulated wind less the observed,
	 * as vectors, in metres a second: worse when higher.
	 */
	readonly rmsVectorDifference: number;
	/**
	 * Of the surface whose observed wind is at least 1 m/s, the share where
	 * the simulated wind points within 45° of the observed, as a percentage,
	 * 0 to 100: worse when lower. NaN when no cell's observed wind is that
	 * strong, which the file holds as `null`.
	 */
	readonly directionSharePercent: number;
	/**
	 * The root-mean-square of the simulated sea-level pressure less the
	 * observed, in hectopascals: worse when higher.
	 */
	readonly pressureRmsDifference: number;
};

/** The name of one of the three figures. */
export type WindBaselineFigure = keyof WindBaselineFigures;

/** The three figures, in the order the file and the check take them. */
export const WIND_BASELINE_FIGURES: readonly WindBaselineFigure[] =
	Object.freeze([
		'rmsVectorDifference',
		'directionSharePercent',
		'pressureRmsDifference',
	]);

/** How much worse than the baseline each figure may be. */
export type WindBaselineTolerances = Readonly<
	Record<WindBaselineFigure, number>
>;

/**
 * How much worse than the baseline a figure may be before the check fails:
 * 0.02 m/s of the wind's difference as vectors, 0.2 percentage points of
 * the direction share and 0.05 hPa of the pressure's difference. Room for
 * the rounding of the committed figures and for a change that moves the
 * answer by a whisker, far below the model's own accuracy.
 */
export const WIND_BASELINE_TOLERANCES: WindBaselineTolerances = Object.freeze({
	rmsVectorDifference: 0.02,
	directionSharePercent: 0.2,
	pressureRmsDifference: 0.05,
});

/** The parts of the year the baseline holds figures for. */
export const WIND_BASELINE_PERIODS = ['year', 'january', 'july'] as const;

/** A part of the year the baseline holds figures for. */
export type WindBaselinePeriod = (typeof WIND_BASELINE_PERIODS)[number];

/** The Earth's wind and pressure error figures: simulated against observed. */
export type EarthWindFigures = {
	/** Cells along a face edge of the world the figures are for. */
	readonly resolution: number;
	/** The twelve months taken together. */
	readonly year: WindBaselineFigures;
	/** January's. */
	readonly january: WindBaselineFigures;
	/** July's. */
	readonly july: WindBaselineFigures;
};

/** The months of the year {@link earthWindFigures} reads, from 0. */
const PERIOD_MONTHS = { january: 0, july: 6 } as const;

/** The three figures of the baseline from the wind model's figures. */
const baselineFiguresOf = (figures: WindErrorFigures): WindBaselineFigures => ({
	rmsVectorDifference: figures.rmsVectorDifference,
	directionSharePercent:
		figures.directionShare === null ? Number.NaN : figures.directionShare * 100,
	pressureRmsDifference: figures.pressureRmsDifference,
});

/**
 * The Earth's wind and pressure error figures for a simulated year against
 * the observed one.
 *
 * @remarks
 * Each figure is {@link windErrorFigures}'s: the whole year's from its
 * `year`, January's and July's from its `months`. The direction share,
 * which that gives as a share from 0 to 1, is given here as a percentage;
 * where it gives none, because no cell's observed wind is at least 1 m/s,
 * the share is NaN.
 *
 * @param simulated - The simulated year, as `solveWinds` gives it. Not
 * changed.
 * @param observed - The observed year on the same cells, in the same form.
 * Not changed.
 * @param grid - The grid both are on.
 * @returns New figures, unrounded.
 * @throws RangeError if either does not hold twelve months, or any field
 * does not hold one value per cell of `grid`.
 */
export const earthWindFigures = (
	simulated: WindResult,
	observed: WindResult,
	grid: Grid,
): EarthWindFigures => {
	const { months, year } = windErrorFigures(simulated, observed, grid);
	return {
		resolution: grid.n,
		year: baselineFiguresOf(year),
		january: baselineFiguresOf(
			months[PERIOD_MONTHS.january] as WindErrorFigures,
		),
		july: baselineFiguresOf(months[PERIOD_MONTHS.july] as WindErrorFigures),
	};
};

/**
 * A number rounded to {@link WIND_BASELINE_DECIMALS} decimals, never `-0`;
 * NaN and the infinities as they are.
 */
const rounded = (value: number): number => {
	const result = Number(value.toFixed(WIND_BASELINE_DECIMALS));
	return result === 0 ? 0 : result;
};

/** A part's three figures rounded as the baseline keeps them, in order. */
const roundedFigures = (figures: WindBaselineFigures): WindBaselineFigures => ({
	rmsVectorDifference: rounded(figures.rmsVectorDifference),
	directionSharePercent: rounded(figures.directionSharePercent),
	pressureRmsDifference: rounded(figures.pressureRmsDifference),
});

/**
 * The figures as the baseline file holds them: each rounded to
 * {@link WIND_BASELINE_DECIMALS} decimals, in JSON with two spaces of
 * indent, the keys always in the same order, and a line ending at the end,
 * the form the project's formatter leaves as it is. A figure that is not
 * finite is written as `null`, as JSON writes it.
 *
 * @param figures - The figures. Not changed.
 * @returns The whole text of the file.
 */
export const windBaselineText = (figures: EarthWindFigures): string => {
	const file: EarthWindFigures = {
		resolution: figures.resolution,
		year: roundedFigures(figures.year),
		january: roundedFigures(figures.january),
		july: roundedFigures(figures.july),
	};
	return `${JSON.stringify(file, null, 2)}\n`;
};

/**
 * Figures as the baseline file may hold them once read: a figure that was
 * not finite when written comes back as `null`.
 */
export type StoredEarthWindFigures = {
	/** Cells along a face edge of the world the figures are for. */
	readonly resolution: number;
} & {
	readonly [period in WindBaselinePeriod]: {
		readonly [figure in WindBaselineFigure]: number | null;
	};
};

/** One figure that is worse than the baseline's by more than its tolerance. */
export type WindBaselineRegression = {
	/** Which figure, such as `July direction share` or `whole year wind RMS`. */
	readonly figure: string;
	/** The baseline's value, in the figure's own unit; null if it had none. */
	readonly baseline: number | null;
	/** The value now, in the same unit. */
	readonly now: number;
};

/** What each part of the year is called in a regression. */
const PERIOD_NAMES: Readonly<Record<WindBaselinePeriod, string>> = {
	year: 'whole year',
	january: 'January',
	july: 'July',
};

/** What each figure is called in a regression. */
const FIGURE_NAMES: Readonly<Record<WindBaselineFigure, string>> = {
	rmsVectorDifference: 'wind RMS',
	directionSharePercent: 'direction share',
	pressureRmsDifference: 'pressure RMS',
};

/**
 * The figures that are worse than the baseline's by more than their
 * tolerances.
 *
 * @remarks
 * The wind's and the pressure's root-mean-square differences are worse when
 * more than their tolerance above the baseline's, and the direction share
 * when more than its tolerance below. A figure that is better, or no worse
 * than its tolerance allows, passes, as does one exactly at it. A figure
 * that is not a finite number, NaN included, is worse whatever its value,
 * as is any figure whose baseline is not a finite number: a solve that
 * went wrong never passes.
 *
 * @param now - The figures as they are now.
 * @param baseline - The committed figures.
 * @param tolerances - How much worse each figure may be; left out,
 * {@link WIND_BASELINE_TOLERANCES}.
 * @returns The figures that are worse, in the order the year, January and
 * July, and within each the wind's difference as vectors, the direction
 * share and the pressure's difference; empty when none is.
 * @throws RangeError if the two are not for the same resolution.
 */
export const windBaselineRegressions = (
	now: EarthWindFigures,
	baseline: EarthWindFigures | StoredEarthWindFigures,
	tolerances: WindBaselineTolerances = WIND_BASELINE_TOLERANCES,
): WindBaselineRegression[] => {
	if (now.resolution !== baseline.resolution) {
		throw new RangeError(
			`The baseline is for ${baseline.resolution} cells per face edge; the figures are for ${now.resolution}`,
		);
	}
	const regressions: WindBaselineRegression[] = [];
	for (const period of WIND_BASELINE_PERIODS) {
		for (const figure of WIND_BASELINE_FIGURES) {
			const ours = now[period][figure];
			const theirs = baseline[period][figure];
			const tolerance = tolerances[figure];
			const passes =
				Number.isFinite(ours) &&
				typeof theirs === 'number' &&
				Number.isFinite(theirs) &&
				(figure === 'directionSharePercent'
					? ours >= theirs - tolerance
					: ours <= theirs + tolerance);
			if (!passes) {
				regressions.push({
					figure: `${PERIOD_NAMES[period]} ${FIGURE_NAMES[figure]}`,
					baseline: theirs,
					now: ours,
				});
			}
		}
	}
	return regressions;
};
