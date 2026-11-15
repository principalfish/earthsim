import { describe, expect, it } from 'vitest';
import {
	directionToLatLon,
	getGrid,
	MONTHS_PER_YEAR,
	type WindResult,
} from '../../src/core/index';
import {
	ASIA_BOX,
	cellsInBox,
	extremeIn,
	faultMeasures,
	MONSOON_BOX,
	meanIn,
	SUBTROPICS_BOX,
	WINTER_HIGH_BOX,
} from './faults';

const grid = getGrid(64);

const latLonOf = (cell: number) =>
	directionToLatLon([
		grid.centres[3 * cell] as number,
		grid.centres[3 * cell + 1] as number,
		grid.centres[3 * cell + 2] as number,
	]);

describe('cellsInBox', () => {
	it('finds exactly the cells whose centres lie in the box', () => {
		const box = { south: 5, north: 20, west: 60, east: 95 };
		const found = new Set(cellsInBox(grid, box));
		expect(found.size).toBeGreaterThan(50);
		for (let cell = 0; cell < grid.cellCount; cell++) {
			const { latitudeDeg, longitudeDeg } = latLonOf(cell);
			const inside =
				latitudeDeg >= 5 &&
				latitudeDeg <= 20 &&
				longitudeDeg >= 60 &&
				longitudeDeg <= 95;
			expect(found.has(cell)).toBe(inside);
		}
	});
});

describe('extremeIn and meanIn', () => {
	it('find the lowest and highest cell and where it lies, and the area-weighted mean', () => {
		const cells = cellsInBox(grid, ASIA_BOX);
		// A field that is the latitude: lowest at the box's south, highest at
		// its north.
		const field = new Float32Array(grid.cellCount).map(
			(_, cell) => latLonOf(cell).latitudeDeg,
		);
		const lowest = extremeIn(grid, field, cells, false);
		const highest = extremeIn(grid, field, cells, true);
		expect(lowest.value).toBeCloseTo(ASIA_BOX.south, 0);
		expect(lowest.latitude).toBeCloseTo(lowest.value, 4);
		expect(highest.value).toBeCloseTo(ASIA_BOX.north, 0);
		expect(highest.longitude).toBeGreaterThanOrEqual(ASIA_BOX.west);
		expect(highest.longitude).toBeLessThanOrEqual(ASIA_BOX.east);
		expect(
			meanIn(grid, new Float32Array(grid.cellCount).fill(3), cells),
		).toBeCloseTo(3, 12);
		expect(() => extremeIn(grid, field, [], true)).toThrow(RangeError);
		expect(() => meanIn(grid, field, [])).toThrow(RangeError);
	});
});

describe('faultMeasures', () => {
	it('takes January’s and July’s numbers from their months', () => {
		// Each month's pressure 1000 hPa plus the month, and its wind the
		// month eastward and minus it northward, with one cell of July in
		// each box made the lowest, and of January the highest.
		const filled = (value: (month: number) => number) =>
			Array.from({ length: MONTHS_PER_YEAR }, (_, month) =>
				new Float32Array(grid.cellCount).fill(value(month)),
			);
		const year: WindResult = {
			east: filled((month) => month),
			north: filled((month) => -month),
			pressure: filled((month) => 1000 + month),
		};
		// North of the subtropics' box, so that it does not reach their mean.
		const lowCell = cellsInBox(grid, ASIA_BOX).find(
			(cell) => latLonOf(cell).latitudeDeg > 50,
		) as number;
		const highCell = cellsInBox(grid, WINTER_HIGH_BOX)[20] as number;
		(year.pressure[6] as Float32Array)[lowCell] = 990;
		(year.pressure[0] as Float32Array)[highCell] = 1040;
		const measures = faultMeasures(grid, year);
		expect(measures.julyAsiaLow.value).toBe(990);
		expect(measures.julyAsiaLow.latitude).toBeCloseTo(
			latLonOf(lowCell).latitudeDeg,
			9,
		);
		expect(measures.januaryAsiaHigh.value).toBe(1040);
		expect(measures.januaryAsiaHigh.longitude).toBeCloseTo(
			latLonOf(highCell).longitudeDeg,
			9,
		);
		expect(measures.julySubtropicsHpa).toBeCloseTo(1006, 5);
		expect(measures.januaryMonsoon).toEqual({ east: 0, north: 0 });
		expect(measures.julyMonsoon.east).toBeCloseTo(6, 5);
		expect(measures.julyMonsoon.north).toBeCloseTo(-6, 5);
		expect(cellsInBox(grid, SUBTROPICS_BOX).length).toBeGreaterThan(0);
		expect(cellsInBox(grid, MONSOON_BOX).length).toBeGreaterThan(0);
		expect(() =>
			faultMeasures(grid, { ...year, pressure: year.pressure.slice(0, 3) }),
		).toThrow(RangeError);
	});
});
