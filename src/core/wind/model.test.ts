import { describe, expect, it } from 'vitest';
import { type Grid, getGrid } from '../grid';
import { cellLatitudes, MONTHS_PER_YEAR } from '../insolation';
import {
	DIRECTION_MIN_SPEED_M_PER_S,
	type WindMonth,
	type WindResult,
	windErrorFigures,
	windMonthErrorFigures,
	ZONAL_BANDS,
	zonalMean,
} from './model';

/**
 * A stand-in grid of a few cells, for figures worked by hand: only the
 * cell count, the areas and the centres are read.
 */
const smallGrid = (
	areas: readonly number[],
	centres: readonly number[] = [],
): Grid =>
	({
		cellCount: areas.length,
		areas: Float64Array.from(areas),
		centres: Float64Array.from(centres),
	}) as unknown as Grid;

const month = (
	east: readonly number[],
	north: readonly number[],
	pressure: readonly number[],
): WindMonth => ({
	east: Float32Array.from(east),
	north: Float32Array.from(north),
	pressure: Float32Array.from(pressure),
});

/** A year of twelve months, each the one month given by its index. */
const year = (monthOf: (index: number) => WindMonth): WindResult => {
	const months = Array.from({ length: MONTHS_PER_YEAR }, (_, index) =>
		monthOf(index),
	);
	return {
		east: months.map(({ east }) => Float32Array.from(east)),
		north: months.map(({ north }) => Float32Array.from(north)),
		pressure: months.map(({ pressure }) => Float32Array.from(pressure)),
	};
};

// Four cells of areas 1, 1, 2 and 4: 8 in all.
//
// cell 0: simulated (3, 4), observed (3, 0). Difference (0, 4), squared 16.
//   Speeds 5 and 3: +2. The angle between them is acos(9 / 15) = 53.1°,
//   more than 45°; the observed 3 m/s counts.
// cell 1: simulated (1, 0), observed (2, 0). Difference (-1, 0), squared 1.
//   Speeds 1 and 2: -1. Same direction; counts.
// cell 2: simulated (0, 0), observed (0, 0.5). Difference (0, -0.5),
//   squared 0.25. Speeds 0 and 0.5: -0.5. Observed under 1 m/s: ignored.
// cell 3: simulated (0, -2), observed (1, -2). Difference (-1, 0), squared
//   1. Speeds 2 and √5 = 2.236068: -0.236068. The angle is
//   acos(4 / (2√5)) = 26.6°; counts.
//
// RMS of the vector difference: √((16 + 1 + 2·0.25 + 4·1) / 8) = √2.6875
//   = 1.639360.
// Mean speed difference: (2 - 1 - 2·0.5 - 4·0.236068) / 8 = -0.118034.
// Direction: counted area 1 + 1 + 4 = 6 (0.75 of the surface), of which
//   cells 1 and 3 point within 45°: 5 / 6 = 0.833333.
// Pressure: simulated 1010, 1000, 1020, 1013 against observed 1012, 1000,
//   1017, 1013, differences -2, 0, 3, 0: mean (-2 + 2·3) / 8 = 0.5, RMS
//   √((4 + 2·9) / 8) = √2.75 = 1.658312.
const AREAS = [1, 1, 2, 4];
const SIMULATED = month([3, 1, 0, 0], [4, 0, 0, -2], [1010, 1000, 1020, 1013]);
const OBSERVED = month([3, 2, 0, 1], [0, 0, 0.5, -2], [1012, 1000, 1017, 1013]);

describe('windMonthErrorFigures', () => {
	it('gives the figures worked by hand', () => {
		const figures = windMonthErrorFigures(
			SIMULATED,
			OBSERVED,
			smallGrid(AREAS),
		);
		expect(figures.rmsVectorDifference).toBeCloseTo(1.63936, 5);
		expect(figures.meanSpeedDifference).toBeCloseTo(-0.118034, 5);
		expect(figures.directionShare).toBeCloseTo(5 / 6, 10);
		expect(figures.directionCountedShare).toBeCloseTo(0.75, 10);
		expect(figures.pressureMeanDifference).toBeCloseTo(0.5, 10);
		expect(figures.pressureRmsDifference).toBeCloseTo(1.658312, 5);
	});

	it('is zero for a month against itself, with every direction right', () => {
		const figures = windMonthErrorFigures(OBSERVED, OBSERVED, smallGrid(AREAS));
		expect(figures).toEqual({
			rmsVectorDifference: 0,
			meanSpeedDifference: 0,
			directionShare: 1,
			directionCountedShare: 0.75,
			pressureMeanDifference: 0,
			pressureRmsDifference: 0,
		});
	});

	it('ignores the direction where the observed wind is under the threshold', () => {
		// Each simulated wind blows against the observed. Cell 0's observed
		// wind is just under the threshold and is ignored; cell 1's is at
		// it and counts, and points wrongly.
		const under = DIRECTION_MIN_SPEED_M_PER_S - 0.01;
		const figures = windMonthErrorFigures(
			month([-under, -2], [0, 0], [1000, 1000]),
			month([under, DIRECTION_MIN_SPEED_M_PER_S], [0, 0], [1000, 1000]),
			smallGrid([3, 1]),
		);
		expect(figures.directionShare).toBe(0);
		expect(figures.directionCountedShare).toBeCloseTo(0.25, 10);

		const allCalm = windMonthErrorFigures(
			month([5], [5], [1000]),
			month([under], [0], [1000]),
			smallGrid([1]),
		);
		expect(allCalm.directionShare).toBeNull();
		expect(allCalm.directionCountedShare).toBe(0);
	});

	it('counts a calm simulated wind as pointing wrongly', () => {
		const figures = windMonthErrorFigures(
			month([0], [0], [1000]),
			month([3], [0], [1000]),
			smallGrid([1]),
		);
		expect(figures.directionShare).toBe(0);
	});

	it('refuses fields of the wrong length', () => {
		const grid = smallGrid(AREAS);
		expect(() =>
			windMonthErrorFigures(
				month([1, 2, 3], [0, 0, 0, 0], [0, 0, 0, 0]),
				OBSERVED,
				grid,
			),
		).toThrow(RangeError);
		expect(() =>
			windMonthErrorFigures(
				SIMULATED,
				month([0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0]),
				grid,
			),
		).toThrow(/observed pressure/);
	});
});

describe('windErrorFigures', () => {
	// Even months are the hand-worked month; odd months are calm everywhere
	// in both, so they add no error and no counted direction.
	const calm = month([0, 0, 0, 0], [0, 0, 0, 0], [1013, 1013, 1013, 1013]);
	const simulated = year((index) => (index % 2 === 0 ? SIMULATED : calm));
	const observed = year((index) => (index % 2 === 0 ? OBSERVED : calm));

	it('gives each month its own figures and pools the year', () => {
		const grid = smallGrid(AREAS);
		const comparison = windErrorFigures(simulated, observed, grid);
		expect(comparison.months).toHaveLength(MONTHS_PER_YEAR);
		expect(comparison.months[0]).toEqual(
			windMonthErrorFigures(SIMULATED, OBSERVED, grid),
		);
		expect(comparison.months[1]?.directionShare).toBeNull();
		expect(comparison.months[1]?.rmsVectorDifference).toBe(0);
		// Half the months have a mean square of 2.6875, half none.
		expect(comparison.year.rmsVectorDifference).toBeCloseTo(
			Math.sqrt(2.6875 / 2),
			6,
		);
		expect(comparison.year.meanSpeedDifference).toBeCloseTo(-0.118034 / 2, 6);
		// The calm months count no area, so the year's share is the even
		// months' share; the counted share is half theirs.
		expect(comparison.year.directionShare).toBeCloseTo(5 / 6, 10);
		expect(comparison.year.directionCountedShare).toBeCloseTo(0.375, 10);
		expect(comparison.year.pressureMeanDifference).toBeCloseTo(0.25, 10);
		expect(comparison.year.pressureRmsDifference).toBeCloseTo(
			Math.sqrt(2.75 / 2),
			6,
		);
	});

	it('is zero for a year against itself', () => {
		const { year: figures } = windErrorFigures(
			observed,
			observed,
			smallGrid(AREAS),
		);
		expect(figures.rmsVectorDifference).toBe(0);
		expect(figures.meanSpeedDifference).toBe(0);
		expect(figures.directionShare).toBe(1);
		expect(figures.pressureMeanDifference).toBe(0);
		expect(figures.pressureRmsDifference).toBe(0);
	});

	it('refuses a year that is not twelve months of one value per cell', () => {
		const grid = smallGrid(AREAS);
		expect(() =>
			windErrorFigures(
				{ ...simulated, north: simulated.north.slice(0, 11) },
				observed,
				grid,
			),
		).toThrow(/simulated north must hold 12 months/);
		expect(() =>
			windErrorFigures(simulated, observed, smallGrid([1, 1, 2])),
		).toThrow(RangeError);
	});
});

describe('zonalMean', () => {
	const grid = getGrid(64);
	const latitudes = cellLatitudes(grid);

	it('gives a field that depends only on latitude back at the bands', () => {
		const field = Float32Array.from(latitudes, (latitude) =>
			Math.sin((latitude * Math.PI) / 180),
		);
		const zonal = zonalMean(grid, field);
		expect(zonal.latitudes).toHaveLength(ZONAL_BANDS);
		expect(zonal.latitudes[0]).toBe(-87.5);
		expect(zonal.latitudes[ZONAL_BANDS - 1]).toBe(87.5);
		for (const [band, latitude] of zonal.latitudes.entries()) {
			// The area-weighted mean of sin φ over a whole 5° band lies
			// within 0.001 of its value at the band's middle; the cells,
			// which do not fill a band evenly, bring the largest difference
			// at 64 cells per face edge to 0.0022.
			expect(
				Math.abs(
					(zonal.means[band] as number) - Math.sin((latitude * Math.PI) / 180),
				),
			).toBeLessThan(0.004);
		}
	});

	it('gives a field that is constant within each band back exactly', () => {
		const field = Float32Array.from(latitudes, (latitude) =>
			Math.min(35, Math.floor((latitude + 90) / 5)),
		);
		const zonal = zonalMean(grid, field);
		for (const [band, mean] of zonal.means.entries()) {
			expect(mean).toBeCloseTo(band, 10);
		}
	});

	it('gives null for a band that holds no cell', () => {
		// Two cells, at 10° and 50° north, in three bands of 60°.
		const at = (degrees: number): number[] => {
			const radians = (degrees * Math.PI) / 180;
			return [Math.cos(radians), 0, Math.sin(radians)];
		};
		const small = smallGrid([1, 3], [...at(10), ...at(50)]);
		const zonal = zonalMean(small, [2, 6], 3);
		expect(zonal.latitudes).toEqual([-60, 0, 60]);
		expect(zonal.means).toEqual([null, 2, 6]);
	});

	it('refuses a field of the wrong length or a bad number of bands', () => {
		expect(() => zonalMean(grid, new Float32Array(10))).toThrow(RangeError);
		expect(() => zonalMean(grid, new Float32Array(grid.cellCount), 0)).toThrow(
			RangeError,
		);
		expect(() =>
			zonalMean(grid, new Float32Array(grid.cellCount), 2.5),
		).toThrow(RangeError);
	});
});
