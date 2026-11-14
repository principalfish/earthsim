import { describe, expect, it } from 'vitest';
import {
	cellLatitudes,
	directionToLatLon,
	getGrid,
	MONTHS_PER_YEAR,
	solveTemperature,
	solveWinds,
	type WindResult,
} from '../../src/core/index';
import { oneContinentWorld } from './cases';
import {
	bandPlaces,
	OPEN_OCEAN_MARGIN_DEG,
	oceanicSwing,
	openOceanCells,
	sectorMean,
} from './oceanBands';
import { MEASURE_BANDS, type Measure } from './summary';

const grid = getGrid(64);
const latitudes = cellLatitudes(grid);
const longitudes = Array.from(
	{ length: grid.cellCount },
	(_, cell) =>
		directionToLatLon([
			grid.centres[3 * cell] as number,
			grid.centres[3 * cell + 1] as number,
			grid.centres[3 * cell + 2] as number,
		]).longitudeDeg,
);

const measuredValue = (measure: Measure): number => {
	if (measure.value === null) {
		throw new Error(`Not measured: ${measure.missing}`);
	}
	return measure.value;
};

/**
 * A made-up pressure with a low at `low` and highs 30° either side of it,
 * falling beyond them to lows 60° from it.
 */
const bandsAround = (latitude: number, low: number): number =>
	1010 - 5 * Math.cos((Math.PI * (latitude - low)) / 30);

/**
 * A made-up month: the bands around `oceanLow` over the open ocean, and
 * around `landLow` everywhere else.
 */
const monthOf = (oceanLow: number, landLow: number): Float32Array => {
	const field = new Float32Array(grid.cellCount);
	for (let cell = 0; cell < grid.cellCount; cell++) {
		const far = Math.abs(longitudes[cell] as number) > 71.6 + 60;
		field[cell] = bandsAround(
			latitudes[cell] as number,
			far ? oceanLow : landLow,
		);
	}
	return field;
};

describe('openOceanCells', () => {
	it('takes the cells more than 60° of longitude beyond the continent’s widest reach', () => {
		expect(OPEN_OCEAN_MARGIN_DEG).toBe(60);
		const cells = openOceanCells(grid);
		expect(cells.length).toBeGreaterThan(0);
		for (const cell of cells) {
			expect(Math.abs(longitudes[cell] as number)).toBeGreaterThan(131.6);
		}
		// About 97° of 360°.
		expect(cells.length / grid.cellCount).toBeCloseTo(96.8 / 360, 1);
	});
});

describe('bandPlaces and oceanicSwing', () => {
	it('find the band low and the subtropical highs between bands, over the open ocean alone', () => {
		const profile = sectorMean(grid, monthOf(-3, 20), openOceanCells(grid));
		expect(profile.means).toHaveLength(MEASURE_BANDS);
		const places = bandPlaces(profile);
		expect(Math.abs(measuredValue(places.low) + 3)).toBeLessThan(0.2);
		expect(Math.abs(measuredValue(places.southHigh) + 33)).toBeLessThan(0.2);
		expect(Math.abs(measuredValue(places.northHigh) - 27)).toBeLessThan(0.2);

		const pressure = Array.from({ length: MONTHS_PER_YEAR }, (_, month) =>
			month === 6 ? monthOf(5, 30) : monthOf(-3, -10),
		);
		const year: WindResult = {
			east: pressure.map(() => new Float32Array(grid.cellCount)),
			north: pressure.map(() => new Float32Array(grid.cellCount)),
			pressure,
		};
		const swing = oceanicSwing(grid, year);
		for (const part of ['low', 'southHigh', 'northHigh'] as const) {
			expect(Math.abs(measuredValue(swing.change[part]) - 8)).toBeLessThan(0.3);
		}
		expect(Math.abs(measuredValue(swing.july.low) - 5)).toBeLessThan(0.2);
	});

	it('takes the low as a turning point, not the fall towards a subpolar low, and does not measure a range with none, nor highs without a low', () => {
		// A shallow low at 14°S and a deep fall from 20°N to a low at 50°N:
		// the band low is the shallow one.
		const shallow = sectorMean(
			grid,
			Float32Array.from(latitudes, (latitude) =>
				latitude < 20
					? 1008 + 0.01 * (latitude + 14) ** 2
					: 1008 + 0.01 * 34 ** 2 - 0.02 * (latitude - 20) ** 2,
			),
			openOceanCells(grid),
		);
		expect(Math.abs(measuredValue(bandPlaces(shallow).low) + 14)).toBeLessThan(
			0.2,
		);
		// Pressure falling all the way to the north: no turning point.
		const falling = sectorMean(
			grid,
			Float32Array.from(latitudes, (latitude) => 1010 - latitude / 10),
			openOceanCells(grid),
		);
		const places = bandPlaces(falling);
		expect(places.low.value).toBeNull();
		expect(places.northHigh).toEqual({
			value: null,
			missing: 'the band low is not measured',
		});
		expect(places.low).toEqual({
			value: null,
			missing: 'no turning point in the range looked in',
		});
		const empty = bandPlaces(sectorMean(grid, new Float32Array(), []));
		expect(empty.low.value).toBeNull();
	});
});

describe('the one-continent world’s oceanic swing', () => {
	// A solve of the world's temperature, about a second, and two runs of a
	// year of winds, about half a second each, more under coverage, hence
	// the longer time allowed.
	it('is much less with the bands placed by longitude than with one pattern round the globe', () => {
		const world = oneContinentWorld();
		const months = solveTemperature(world).months;
		const swingOf = (settings = {}) =>
			oceanicSwing(grid, solveWinds(world, months, { settings })).change;
		// With one pattern round the globe, as before the bands varied by
		// longitude, the open ocean's southern high moved 18.2° from January
		// to July, its band low 29.7° and its northern high 22.8°.
		const zonal = swingOf({ localBandsShare: 0 });
		expect(measuredValue(zonal.southHigh)).toBeCloseTo(18.2, 1);
		expect(measuredValue(zonal.low)).toBeCloseTo(29.7, 1);
		expect(measuredValue(zonal.northHigh)).toBeCloseTo(22.8, 1);
		// With them placed by longitude: about 5.4°, 1.2° and 7.0°, near the
		// observed oceanic highs' 5° to 10°.
		const local = swingOf();
		for (const part of ['southHigh', 'low', 'northHigh'] as const) {
			const moved = Math.abs(measuredValue(local[part]));
			expect(moved, part).toBeLessThan(10);
			expect(moved, part).toBeLessThan(
				0.5 * Math.abs(measuredValue(zonal[part])),
			);
		}
	}, 60_000);
});
