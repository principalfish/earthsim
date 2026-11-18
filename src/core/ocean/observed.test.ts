import { describe, expect, it } from 'vitest';
import {
	readObservedCurrentsFile,
	readObservedSeaTemperatureFile,
} from '../../../scripts/earth/dataFile.mjs';
import { getGrid, SUPPORTED_RESOLUTIONS } from '../grid/grid';
import { cellLatitudes, MONTHS_PER_YEAR } from '../planet/insolation';
import {
	decodeObservedCurrents,
	decodeObservedSeaTemperature,
	dequantiseCurrent,
	dequantiseSeaTemperature,
	encodeObservedCurrents,
	encodeObservedSeaTemperature,
	type ObservedCurrents,
	type ObservedSeaTemperature,
	OCEAN_COLUMNS,
	OCEAN_CURRENT_MAX_M_PER_S,
	OCEAN_CURRENT_MIN_M_PER_S,
	OCEAN_CURRENT_NO_DATA_BYTE,
	OCEAN_CURRENT_STEP_M_PER_S,
	OCEAN_CURRENTS_BYTES,
	OCEAN_ROWS,
	OCEAN_VALUES_PER_MONTH,
	observedCurrentsOn,
	observedSeaTemperatureOn,
	quantiseCurrent,
	quantiseSeaTemperature,
	SEA_TEMPERATURE_BASE_C,
	SEA_TEMPERATURE_BYTES,
	SEA_TEMPERATURE_MAX_C,
	SEA_TEMPERATURE_MIN_C,
	SEA_TEMPERATURE_NO_DATA_BYTE,
	SEA_TEMPERATURE_STEP_C,
	writeOceanLocation,
} from './observed';

const RADIANS_PER_DEGREE = Math.PI / 180;

/** The real data, as the page would load it. */
const SEA = decodeObservedSeaTemperature(readObservedSeaTemperatureFile());
const CURRENTS = decodeObservedCurrents(readObservedCurrentsFile());

/** Twelve grids, each value made by a function of the month, row and column. */
const twelve = (
	value: (month: number, row: number, column: number) => number,
): Float32Array[] =>
	Array.from({ length: MONTHS_PER_YEAR }, (_, month) =>
		Float32Array.from({ length: OCEAN_VALUES_PER_MONTH }, (_, index) =>
			value(month, Math.floor(index / OCEAN_COLUMNS), index % OCEAN_COLUMNS),
		),
	);

/** The latitude of a row's points, and the longitude of a column's. */
const latitudeOf = (row: number): number => 89.5 - row;
const longitudeOf = (column: number): number => column + 0.5;

/** A cell's longitude in degrees east, from 0 up to 360. */
const cellLongitude = (resolution: number, cell: number): number => {
	const { centres } = getGrid(resolution);
	const degrees =
		Math.atan2(centres[3 * cell + 1] as number, centres[3 * cell] as number) /
		RADIANS_PER_DEGREE;
	return degrees < 0 ? degrees + 360 : degrees;
};

/** The cells whose centres lie in a box, by latitude and longitude east. */
const cellsIn = (
	resolution: number,
	latitudes: readonly [number, number],
	longitudes: readonly [number, number],
): number[] => {
	const latitude = cellLatitudes(getGrid(resolution));
	const found: number[] = [];
	latitude.forEach((lat, cell) => {
		const lon = cellLongitude(resolution, cell);
		if (
			lat >= latitudes[0] &&
			lat <= latitudes[1] &&
			lon >= longitudes[0] &&
			lon <= longitudes[1]
		) {
			found.push(cell);
		}
	});
	return found;
};

/** The mean of the values of some cells that have data, over some months. */
const meanOf = (
	months: readonly Float32Array[],
	cells: readonly number[],
	which: readonly number[],
): number => {
	let total = 0;
	let count = 0;
	for (const month of which) {
		for (const cell of cells) {
			const value = (months[month] as Float32Array)[cell] as number;
			if (!Number.isNaN(value)) {
				total += value;
				count++;
			}
		}
	}
	return total / count;
};

const YEAR = Array.from({ length: MONTHS_PER_YEAR }, (_, month) => month);

describe('the sea temperature codec', () => {
	it('stores quarter degrees from -2 °C in bytes 0 to 254, and keeps 255 for no data', () => {
		expect(SEA_TEMPERATURE_BASE_C).toBe(-2);
		expect(SEA_TEMPERATURE_STEP_C).toBe(0.25);
		expect(SEA_TEMPERATURE_MIN_C).toBe(-2);
		expect(SEA_TEMPERATURE_MAX_C).toBe(61.5);
		expect(SEA_TEMPERATURE_NO_DATA_BYTE).toBe(255);
		expect(quantiseSeaTemperature(-2)).toBe(0);
		expect(quantiseSeaTemperature(0)).toBe(8);
		expect(quantiseSeaTemperature(27.6)).toBe(118);
		expect(quantiseSeaTemperature(61.5)).toBe(254);
		expect(quantiseSeaTemperature(Number.NaN)).toBe(255);
		expect(dequantiseSeaTemperature(118)).toBe(27.5);
		expect(dequantiseSeaTemperature(255)).toBeNaN();
	});

	it('loses no more than an eighth of a degree across the range', () => {
		for (
			let celsius = SEA_TEMPERATURE_MIN_C;
			celsius <= SEA_TEMPERATURE_MAX_C;
			celsius += 0.013
		) {
			const back = dequantiseSeaTemperature(quantiseSeaTemperature(celsius));
			expect(Math.abs(back - celsius)).toBeLessThanOrEqual(0.125 + 1e-9);
		}
	});

	it('refuses a temperature the file cannot hold, rather than clip it', () => {
		expect(() => quantiseSeaTemperature(-2.2)).toThrow(RangeError);
		expect(() => quantiseSeaTemperature(61.7)).toThrow(RangeError);
		expect(() => quantiseSeaTemperature(Number.POSITIVE_INFINITY)).toThrow(
			RangeError,
		);
		// Within half a step of an end, a value rounds to the end itself.
		expect(quantiseSeaTemperature(-2.1)).toBe(0);
	});
});

describe('the sea temperature file', () => {
	/** Twelve grids of stored steps, land NaN where the index is a multiple of 7. */
	const months = twelve((month, row, column) =>
		(month * 31 + row * 7 + column) % 11 === 0
			? Number.NaN
			: -2 + 0.25 * ((month * 31 + row * 7 + column) % 250),
	);

	it('round-trips values that lie on its steps, and land', () => {
		const bytes = encodeObservedSeaTemperature(months);
		expect(bytes).toHaveLength(SEA_TEMPERATURE_BYTES);
		expect(SEA_TEMPERATURE_BYTES).toBe(12 * 180 * 360);
		const { months: back } = decodeObservedSeaTemperature(bytes);
		expect(back).toHaveLength(12);
		months.forEach((values, month) => {
			expect(back[month]).toEqual(values);
		});
	});

	it('stores each value as a byte, month by month, row by row from the north', () => {
		const bytes = encodeObservedSeaTemperature(months);
		expect(bytes[0]).toBe(255);
		expect(bytes[1]).toBe(quantiseSeaTemperature(months[0]?.[1] as number));
		const second = OCEAN_VALUES_PER_MONTH + OCEAN_COLUMNS + 2;
		expect(bytes[second]).toBe(
			quantiseSeaTemperature(
				(months[1] as Float32Array)[OCEAN_COLUMNS + 2] as number,
			),
		);
	});

	it('moves no value by more than an eighth of a degree', () => {
		const source = twelve(
			(month, row, column) =>
				-1.8 + ((month * 7919 + row * 131 + column * 17) % 3600) / 100,
		);
		const { months: back } = decodeObservedSeaTemperature(
			encodeObservedSeaTemperature(source),
		);
		let largest = 0;
		source.forEach((values, month) => {
			const stored = back[month] as Float32Array;
			for (let index = 0; index < values.length; index++) {
				largest = Math.max(
					largest,
					Math.abs((stored[index] as number) - (values[index] as number)),
				);
			}
		});
		expect(largest).toBeLessThanOrEqual(0.125 + 1e-6);
		expect(largest).toBeGreaterThan(0.1);
	});

	it('refuses to encode the wrong number or length of grids, or a value it cannot hold', () => {
		expect(() => encodeObservedSeaTemperature(months.slice(1))).toThrow(
			'Observed sea temperature has 12 months; got 11',
		);
		expect(() =>
			encodeObservedSeaTemperature([...months.slice(1), new Float32Array(5)]),
		).toThrow('month 11 has 5');
		const hot = months.map((values) => values.slice());
		(hot[3] as Float32Array)[10] = 70;
		expect(() => encodeObservedSeaTemperature(hot)).toThrow(RangeError);
	});

	it('refuses to decode bytes of the wrong length', () => {
		expect(() =>
			decodeObservedSeaTemperature(new Uint8Array(SEA_TEMPERATURE_BYTES - 1)),
		).toThrow(RangeError);
	});
});

describe('the currents codec', () => {
	it('stores thirty-seconds of a metre a second in bytes -127 to 127, and keeps -128 for no data', () => {
		expect(OCEAN_CURRENT_STEP_M_PER_S).toBe(0.03125);
		expect(OCEAN_CURRENT_MIN_M_PER_S).toBe(-3.968_75);
		expect(OCEAN_CURRENT_MAX_M_PER_S).toBe(3.968_75);
		expect(OCEAN_CURRENT_NO_DATA_BYTE).toBe(-128);
		expect(quantiseCurrent(0)).toBe(0);
		expect(Object.is(quantiseCurrent(-0.01), 0)).toBe(true);
		expect(quantiseCurrent(1)).toBe(32);
		expect(quantiseCurrent(-1.3)).toBe(-42);
		expect(quantiseCurrent(3.968_75)).toBe(127);
		expect(quantiseCurrent(-3.968_75)).toBe(-127);
		expect(dequantiseCurrent(-42)).toBe(-1.3125);
	});

	it('loses no more than half a step across the range', () => {
		for (
			let speed = OCEAN_CURRENT_MIN_M_PER_S;
			speed <= OCEAN_CURRENT_MAX_M_PER_S;
			speed += 0.0017
		) {
			const back = dequantiseCurrent(quantiseCurrent(speed));
			expect(Math.abs(back - speed)).toBeLessThanOrEqual(0.015_625 + 1e-9);
		}
	});

	it('refuses NaN and a current the file cannot hold, rather than clip it', () => {
		expect(() => quantiseCurrent(Number.NaN)).toThrow(RangeError);
		expect(() => quantiseCurrent(4)).toThrow(RangeError);
		expect(() => quantiseCurrent(-4)).toThrow(RangeError);
	});
});

describe('the currents file', () => {
	const stored = (month: number, row: number, column: number): number =>
		0.03125 * (((month * 13 + row * 5 + column) % 120) - 60);
	const noData = (month: number, row: number, column: number): boolean =>
		(month + row + column) % 5 === 0;
	const currents = {
		east: twelve((m, r, c) => (noData(m, r, c) ? Number.NaN : stored(m, r, c))),
		north: twelve((m, r, c) =>
			noData(m, r, c) ? Number.NaN : 0 - stored(m, r, c),
		),
	};

	it('round-trips values that lie on its steps, and land, in both components', () => {
		const bytes = encodeObservedCurrents(currents);
		expect(bytes).toHaveLength(OCEAN_CURRENTS_BYTES);
		expect(OCEAN_CURRENTS_BYTES).toBe(12 * 2 * 180 * 360);
		const back = decodeObservedCurrents(bytes);
		currents.east.forEach((values, month) => {
			expect(back.east[month]).toEqual(values);
			expect(back.north[month]).toEqual(currents.north[month]);
		});
	});

	it('stores each month as the whole eastward grid and then the whole northward one', () => {
		const bytes = encodeObservedCurrents(currents);
		const signed = new Int8Array(bytes.buffer);
		// Month 1, row 0, column 2: a place with data.
		const east = 2 * OCEAN_VALUES_PER_MONTH + 2;
		expect(signed[east]).toBe(quantiseCurrent(stored(1, 0, 2)));
		expect(signed[east + OCEAN_VALUES_PER_MONTH]).toBe(
			quantiseCurrent(-stored(1, 0, 2)),
		);
		// Month 0, row 0, column 0: no data, as -128 in both.
		expect(signed[0]).toBe(-128);
		expect(signed[OCEAN_VALUES_PER_MONTH]).toBe(-128);
	});

	it('refuses a place with one component and not the other', () => {
		const lopsided = {
			east: currents.east,
			north: currents.north.map((values) => values.slice()),
		};
		(lopsided.north[0] as Float32Array)[1] = Number.NaN;
		expect(() => encodeObservedCurrents(lopsided)).toThrow(
			'Month 0 has only one component of the current at value 1',
		);
	});

	it('refuses the wrong number or length of grids, or a current it cannot hold', () => {
		expect(() =>
			encodeObservedCurrents({
				east: currents.east.slice(1),
				north: currents.north,
			}),
		).toThrow('Observed eastward current has 12 months; got 11');
		expect(() =>
			encodeObservedCurrents({
				east: currents.east,
				north: [...currents.north.slice(1), new Float32Array(2)],
			}),
		).toThrow('Each month of observed northward current has 64800 values');
		const fast = currents.east.map((values) => values.slice());
		(fast[2] as Float32Array)[3] = 5;
		expect(() =>
			encodeObservedCurrents({ east: fast, north: currents.north }),
		).toThrow(RangeError);
	});

	it('reads a place without data in one component as without data in both', () => {
		const bytes = new Uint8Array(OCEAN_CURRENTS_BYTES).fill(0);
		new Int8Array(bytes.buffer)[5] = -128;
		const back = decodeObservedCurrents(bytes);
		expect(back.east[0]?.[5]).toBeNaN();
		expect(back.north[0]?.[5]).toBeNaN();
		expect(back.east[0]?.[6]).toBe(0);
	});

	it('refuses bytes of the wrong length', () => {
		expect(() =>
			decodeObservedCurrents(new Uint8Array(OCEAN_CURRENTS_BYTES + 1)),
		).toThrow(RangeError);
	});
});

describe('the observed sea files', () => {
	it('are the length the format says, one grid for each month', () => {
		expect(readObservedSeaTemperatureFile()).toHaveLength(
			SEA_TEMPERATURE_BYTES,
		);
		expect(readObservedCurrentsFile()).toHaveLength(OCEAN_CURRENTS_BYTES);
		expect(SEA.months).toHaveLength(12);
		expect(CURRENTS.east).toHaveLength(12);
	});

	it('mark land and no data as NaN, never as zero, in every month', () => {
		const at = (latitude: number, longitude: number): number =>
			(89.5 - latitude) * OCEAN_COLUMNS + (longitude - 0.5);
		for (let month = 0; month < 12; month++) {
			// The middle of North America, the Sahara and the Antarctic ice.
			for (const [latitude, longitude] of [
				[40.5, 260.5],
				[24.5, 10.5],
				[-80.5, 100.5],
			] as const) {
				expect(SEA.months[month]?.[at(latitude, longitude)]).toBeNaN();
				expect(CURRENTS.east[month]?.[at(latitude, longitude)]).toBeNaN();
				expect(CURRENTS.north[month]?.[at(latitude, longitude)]).toBeNaN();
			}
		}
		const seaCells = SEA.months[0]?.filter((value) => !Number.isNaN(value));
		expect(seaCells?.length).toBe(44_219);
		const currentCells = CURRENTS.east[0]?.filter(
			(value) => !Number.isNaN(value),
		);
		expect(currentCells?.length).toBeGreaterThan(30_000);
		let lopsided = 0;
		for (let month = 0; month < 12; month++) {
			const north = CURRENTS.north[month] as Float32Array;
			CURRENTS.east[month]?.forEach((value, index) => {
				if (Number.isNaN(value) !== Number.isNaN(north[index] as number)) {
					lopsided++;
				}
			});
		}
		expect(lopsided).toBe(0);
	});

	it('hold sea temperatures from the freezing point of sea water to a little over 34 °C', () => {
		let low = Number.POSITIVE_INFINITY;
		let high = Number.NEGATIVE_INFINITY;
		for (const values of SEA.months) {
			for (const value of values) {
				if (!Number.isNaN(value)) {
					low = Math.min(low, value);
					high = Math.max(high, value);
				}
			}
		}
		expect(low).toBeGreaterThanOrEqual(-2);
		expect(low).toBeLessThan(-1.5);
		expect(high).toBeGreaterThan(33.5);
		expect(high).toBeLessThanOrEqual(34.5);
	});

	it('hold the currents the drifters measured, none above three metres a second', () => {
		let fastest = 0;
		for (let month = 0; month < 12; month++) {
			CURRENTS.east[month]?.forEach((u, index) => {
				const v = (CURRENTS.north[month] as Float32Array)[index] as number;
				if (!Number.isNaN(u)) {
					fastest = Math.max(fastest, Math.hypot(u, v));
				}
			});
		}
		expect(fastest).toBeGreaterThan(2);
		expect(fastest).toBeLessThan(3.5);
	});

	/** The fastest current in a box of the file's own grid, with its direction. */
	const fastestIn = (
		latitudes: readonly [number, number],
		longitudes: readonly [number, number],
	): { speed: number; east: number; north: number } => {
		let best = { speed: 0, east: 0, north: 0 };
		for (let row = 0; row < OCEAN_ROWS; row++) {
			for (let column = 0; column < OCEAN_COLUMNS; column++) {
				const latitude = latitudeOf(row);
				const longitude = longitudeOf(column);
				if (
					latitude < latitudes[0] ||
					latitude > latitudes[1] ||
					longitude < longitudes[0] ||
					longitude > longitudes[1]
				) {
					continue;
				}
				for (let month = 0; month < 12; month++) {
					const u = (CURRENTS.east[month] as Float32Array)[
						row * OCEAN_COLUMNS + column
					] as number;
					const v = (CURRENTS.north[month] as Float32Array)[
						row * OCEAN_COLUMNS + column
					] as number;
					if (!Number.isNaN(u) && Math.hypot(u, v) > best.speed) {
						best = { speed: Math.hypot(u, v), east: u, north: v };
					}
				}
			}
		}
		return best;
	};

	it('show the Gulf Stream running north-east off the American coast', () => {
		const stream = fastestIn([30, 40], [278, 295]);
		expect(stream.speed).toBeGreaterThan(1);
		expect(stream.speed).toBeLessThan(1.6);
		expect(stream.east).toBeGreaterThan(0.4);
		expect(stream.north).toBeGreaterThan(0.4);
	});

	it('show the Kuroshio running east off Japan', () => {
		const stream = fastestIn([28, 38], [130, 150]);
		expect(stream.speed).toBeGreaterThan(0.8);
		expect(stream.east).toBeGreaterThan(0.8);
	});

	it('show the Agulhas Current running south-west off South Africa', () => {
		const stream = fastestIn([-40, -28], [20, 35]);
		expect(stream.speed).toBeGreaterThan(1);
		expect(stream.east).toBeLessThan(-0.5);
		expect(stream.north).toBeLessThan(-0.5);
	});

	it('show the Antarctic Circumpolar Current running east round the Southern Ocean', () => {
		let total = 0;
		let count = 0;
		for (let row = 0; row < OCEAN_ROWS; row++) {
			const latitude = latitudeOf(row);
			if (latitude < -58 || latitude > -50) {
				continue;
			}
			for (let column = 0; column < OCEAN_COLUMNS; column++) {
				for (let month = 0; month < 12; month++) {
					const u = (CURRENTS.east[month] as Float32Array)[
						row * OCEAN_COLUMNS + column
					] as number;
					if (!Number.isNaN(u)) {
						total += u;
						count++;
					}
				}
			}
		}
		expect(count).toBeGreaterThan(10_000);
		expect(total / count).toBeGreaterThan(0.08);
	});
});

describe('writeOceanLocation', () => {
	const locate = (latitude: number, longitude: number) => {
		const corners = new Int32Array(8);
		const weights = new Float64Array(8);
		// Written from index 4, to show that it goes where it is told.
		writeOceanLocation(latitude, longitude, corners, weights, 4);
		return { corners: [...corners.slice(4)], weights: [...weights.slice(4)] };
	};
	const index = (row: number, column: number): number =>
		row * OCEAN_COLUMNS + column;

	it('weights the four points around a place by how near each is', () => {
		// 10.5° north, 20.5° east is the point at row 79, column 20 itself.
		expect(locate(10.5, 20.5)).toEqual({
			corners: [index(79, 20), index(79, 21), index(80, 20), index(80, 21)],
			weights: [1, 0, 0, 0],
		});
		// A quarter of the way east and three quarters of the way south.
		const quarter = locate(9.75, 20.75);
		expect(quarter.corners).toEqual([
			index(79, 20),
			index(79, 21),
			index(80, 20),
			index(80, 21),
		]);
		expect(quarter.weights[0]).toBeCloseTo(0.75 * 0.25, 12);
		expect(quarter.weights[1]).toBeCloseTo(0.25 * 0.25, 12);
		expect(quarter.weights[2]).toBeCloseTo(0.75 * 0.75, 12);
		expect(quarter.weights[3]).toBeCloseTo(0.25 * 0.75, 12);
		expect(quarter.weights.reduce((a, b) => a + b)).toBeCloseTo(1, 12);
	});

	it('wraps longitude: between 359.5° and 0.5° east lies between the last column and the first', () => {
		const across = locate(0.5, 0);
		expect(across.corners[0]).toBe(index(89, 359));
		expect(across.corners[1]).toBe(index(89, 0));
		expect(across.weights[0]).toBeCloseTo(0.5, 12);
		expect(across.weights[1]).toBeCloseTo(0.5, 12);
		expect(locate(0.5, -0.25).corners).toEqual(locate(0.5, 359.75).corners);
		expect(locate(0.5, 360.25).corners).toEqual(locate(0.5, 0.25).corners);
		expect(locate(0.5, -1e-18).corners[0]).toBe(index(89, 359));
	});

	it('holds latitude at the first and last rows beyond them, making nothing up', () => {
		for (const latitude of [89.5, 90, 89.9]) {
			const north = locate(latitude, 100.5);
			expect(north.corners.slice(0, 2)).toEqual([index(0, 100), index(0, 101)]);
			expect(north.weights).toEqual([1, 0, 0, 0]);
		}
		for (const latitude of [-89.5, -90, -89.9]) {
			const south = locate(latitude, 100.5);
			expect(south.corners[0]).toBe(index(179, 100));
			expect(south.corners[2]).toBe(index(179, 100));
			expect(south.weights).toEqual([1, 0, 0, 0]);
		}
	});
});

describe('observedSeaTemperatureOn', () => {
	const grid = getGrid(64);

	it('gives twelve arrays with one value for each cell', () => {
		const months = observedSeaTemperatureOn(grid, SEA);
		expect(months).toHaveLength(12);
		for (const values of months) {
			expect(values).toBeInstanceOf(Float32Array);
			expect(values).toHaveLength(grid.cellCount);
		}
	});

	it('gives a value that is the same wherever the data is the same, even beside land', () => {
		const sea: ObservedSeaTemperature = {
			months: twelve((_month, _row, column) =>
				column < 120 ? Number.NaN : 20,
			),
		};
		const months = observedSeaTemperatureOn(grid, sea);
		const near = cellsIn(64, [-60, 60], [118, 125]);
		expect(near.length).toBeGreaterThan(5);
		for (const cell of near) {
			// Every cell has 20 or nothing: a cell on the coast is 20, not
			// pulled down towards the land's NaN or a zero.
			const value = (months[0] as Float32Array)[cell] as number;
			expect(Number.isNaN(value) || Math.abs(value - 20) < 1e-5).toBe(true);
		}
		const coast = cellsIn(64, [-60, 60], [120.6, 121.4]);
		for (const cell of coast) {
			expect(
				Math.abs(((months[5] as Float32Array)[cell] as number) - 20),
			).toBeLessThan(1e-5);
		}
		// Well inland: no data.
		for (const cell of cellsIn(64, [-60, 60], [30, 100])) {
			expect((months[0] as Float32Array)[cell]).toBeNaN();
		}
	});

	it('interpolates between points: a field that rises with latitude gives each cell its latitude', () => {
		const field: ObservedSeaTemperature = {
			months: twelve((month, row) => latitudeOf(row) / 3 + month),
		};
		const months = observedSeaTemperatureOn(grid, field);
		const latitudes = cellLatitudes(grid);
		for (let cell = 0; cell < grid.cellCount; cell++) {
			const latitude = latitudes[cell] as number;
			if (Math.abs(latitude) < 89.5) {
				expect(
					Math.abs(
						((months[4] as Float32Array)[cell] as number) - (latitude / 3 + 4),
					),
				).toBeLessThan(1e-4);
			}
		}
	});

	it('takes the value of the one point that has data, wherever a cell leans on it', () => {
		const lonely: ObservedSeaTemperature = {
			months: twelve((_m, row, column) =>
				row === 30 && column === 100 ? 7 : Number.NaN,
			),
		};
		const months = observedSeaTemperatureOn(grid, lonely);
		// The point is at 59.5° north, 100.5° east.
		const near = cellsIn(64, [58.8, 60.2], [99.8, 101.2]);
		expect(near.length).toBeGreaterThan(0);
		for (const cell of near) {
			expect((months[2] as Float32Array)[cell]).toBeCloseTo(7, 5);
		}
		const [cell] = cellsIn(64, [0, 1], [0, 1]);
		expect((months[2] as Float32Array)[cell as number]).toBeNaN();
		const marked = (months[2] as Float32Array).filter(
			(value) => !Number.isNaN(value),
		);
		expect(marked.length).toBeGreaterThan(0);
		expect(marked.length).toBeLessThan(20);
	});

	it('does not change the data', () => {
		const before = SEA.months.map((values) => values.slice());
		observedSeaTemperatureOn(grid, SEA);
		expect(SEA.months).toEqual(before);
	});

	it('refuses data without twelve months of the right length', () => {
		expect(() =>
			observedSeaTemperatureOn(grid, { months: SEA.months.slice(1) }),
		).toThrow(RangeError);
		expect(() =>
			observedSeaTemperatureOn(grid, {
				months: [...SEA.months.slice(1), new Float32Array(3)],
			}),
		).toThrow(RangeError);
	});

	it('is the same each time it is asked', () => {
		expect(observedSeaTemperatureOn(grid, SEA)).toEqual(
			observedSeaTemperatureOn(grid, SEA),
		);
	});

	it('gives one value for each cell on every supported grid', () => {
		for (const resolution of SUPPORTED_RESOLUTIONS) {
			const months = observedSeaTemperatureOn(getGrid(resolution), SEA);
			expect(months).toHaveLength(12);
			expect(months[0]).toHaveLength(getGrid(resolution).cellCount);
		}
	}, 60_000);

	describe('on the real data', () => {
		const months = observedSeaTemperatureOn(grid, SEA);

		it('has the tropical sea at 27 to 29 °C over the year', () => {
			const tropics = cellsIn(64, [-10, 10], [0, 360]);
			const mean = meanOf(months, tropics, YEAR);
			expect(mean).toBeGreaterThan(26.5);
			expect(mean).toBeLessThan(29);
		});

		it('has a warm tongue of the Gulf Stream and North Atlantic Drift reaching far to the north-east', () => {
			// 45° to 55° north is far warmer at 20° to 40° west than at 160° to
			// 170° west, in the Pacific.
			const atlantic = meanOf(months, cellsIn(64, [45, 55], [320, 340]), YEAR);
			const pacific = meanOf(months, cellsIn(64, [45, 55], [190, 200]), YEAR);
			expect(atlantic - pacific).toBeGreaterThan(3);
		});

		it('has cold water off Peru and off the Benguela coast', () => {
			const peru = meanOf(
				months,
				cellsIn(64, [-15, -5], [275, 282]),
				[6, 7, 8],
			);
			const equator = meanOf(
				months,
				cellsIn(64, [-5, 5], [180, 240]),
				[6, 7, 8],
			);
			expect(equator - peru).toBeGreaterThan(5);
			const benguela = meanOf(
				months,
				cellsIn(64, [-30, -20], [5, 13]),
				[6, 7, 8],
			);
			const mozambique = meanOf(
				months,
				cellsIn(64, [-30, -20], [36, 45]),
				[6, 7, 8],
			);
			expect(mozambique - benguela).toBeGreaterThan(3);
		});

		it('marks the heart of the continents as no data, never zero', () => {
			for (const cell of [
				...cellsIn(64, [35, 43], [255, 265]),
				...cellsIn(64, [20, 28], [10, 25]),
				...cellsIn(64, [-30, -22], [128, 140]),
				...cellsIn(64, [55, 65], [90, 110]),
			]) {
				for (const values of months) {
					expect(values[cell]).toBeNaN();
				}
			}
			const marked =
				months[0]?.filter((value) => Number.isNaN(value)).length ?? 0;
			expect(marked).toBeGreaterThan(grid.cellCount * 0.15);
			expect(marked).toBeLessThan(grid.cellCount * 0.4);
		});
	});
});

describe('observedCurrentsOn', () => {
	const grid = getGrid(64);

	/** The unit vector along a fixed direction, as east and north at a point. */
	const alongX = (latitude: number, longitude: number) => {
		const phi = latitude * RADIANS_PER_DEGREE;
		const lambda = longitude * RADIANS_PER_DEGREE;
		return {
			east: -Math.sin(lambda),
			north: -Math.sin(phi) * Math.cos(lambda),
		};
	};

	it('gives twelve arrays of each component with one value for each cell', () => {
		const out = observedCurrentsOn(grid, CURRENTS);
		for (const part of [out.east, out.north]) {
			expect(part).toHaveLength(12);
			for (const values of part) {
				expect(values).toBeInstanceOf(Float32Array);
				expect(values).toHaveLength(grid.cellCount);
			}
		}
	});

	it('keeps a current that crosses a pole, where averaging eastward and northward parts would cancel it', () => {
		// The same vector in space at every point, which at the pole is a
		// current crossing it, eastward at one longitude and westward at the
		// opposite one.
		const field: ObservedCurrents = {
			east: twelve(
				(_m, row, column) => alongX(latitudeOf(row), longitudeOf(column)).east,
			),
			north: twelve(
				(_m, row, column) => alongX(latitudeOf(row), longitudeOf(column)).north,
			),
		};
		const out = observedCurrentsOn(grid, field);
		const latitudes = cellLatitudes(grid);
		let checked = 0;
		for (let cell = 0; cell < grid.cellCount; cell++) {
			const latitude = latitudes[cell] as number;
			if (Math.abs(latitude) < 80) {
				continue;
			}
			const want = alongX(latitude, cellLongitude(64, cell));
			expect(
				Math.abs(((out.east[0] as Float32Array)[cell] as number) - want.east),
			).toBeLessThan(0.02);
			expect(
				Math.abs(((out.north[0] as Float32Array)[cell] as number) - want.north),
			).toBeLessThan(0.02);
			checked++;
		}
		expect(checked).toBeGreaterThan(100);
	});

	it('does not pull a current towards zero at a coast, and marks land as no data in both components', () => {
		// A steady eastward current of 1 m/s that stops at 120° east.
		const field: ObservedCurrents = {
			east: twelve((_m, _row, column) => (column < 120 ? Number.NaN : 1)),
			north: twelve((_m, _row, column) => (column < 120 ? Number.NaN : 0)),
		};
		const out = observedCurrentsOn(grid, field);
		const coast = cellsIn(64, [-60, 60], [120.6, 121.4]);
		expect(coast.length).toBeGreaterThan(2);
		for (const cell of coast) {
			const u = (out.east[3] as Float32Array)[cell] as number;
			const v = (out.north[3] as Float32Array)[cell] as number;
			expect(Math.hypot(u, v)).toBeGreaterThan(0.99);
			expect(Math.hypot(u, v)).toBeLessThan(1.001);
			expect(u).toBeGreaterThan(0.9);
		}
		for (const cell of cellsIn(64, [-60, 60], [30, 100])) {
			expect((out.east[3] as Float32Array)[cell]).toBeNaN();
			expect((out.north[3] as Float32Array)[cell]).toBeNaN();
		}
	});

	it('takes the vector of the one point that has data, wherever a cell leans on it', () => {
		const lonely: ObservedCurrents = {
			east: twelve((_m, row, column) =>
				row === 90 && column === 200 ? 0.5 : Number.NaN,
			),
			north: twelve((_m, row, column) =>
				row === 90 && column === 200 ? -0.25 : Number.NaN,
			),
		};
		const out = observedCurrentsOn(grid, lonely);
		// The point is at -0.5° north, 200.5° east, near the equator.
		const near = cellsIn(64, [-1.2, 0.2], [199.8, 201.2]);
		expect(near.length).toBeGreaterThan(0);
		for (const cell of near) {
			expect((out.east[0] as Float32Array)[cell]).toBeCloseTo(0.5, 2);
			expect((out.north[0] as Float32Array)[cell]).toBeCloseTo(-0.25, 2);
		}
	});

	it('does not change the data', () => {
		const before = CURRENTS.east.map((values) => values.slice());
		observedCurrentsOn(grid, CURRENTS);
		expect(CURRENTS.east).toEqual(before);
	});

	it('refuses data without twelve months of the right length for each component', () => {
		expect(() =>
			observedCurrentsOn(grid, {
				east: CURRENTS.east.slice(1),
				north: CURRENTS.north,
			}),
		).toThrow(RangeError);
		expect(() =>
			observedCurrentsOn(grid, {
				east: CURRENTS.east,
				north: [...CURRENTS.north.slice(1), new Float32Array(3)],
			}),
		).toThrow(RangeError);
	});

	it('is the same each time it is asked', () => {
		expect(observedCurrentsOn(grid, CURRENTS)).toEqual(
			observedCurrentsOn(grid, CURRENTS),
		);
	});

	it('gives one value of each component for each cell on every supported grid', () => {
		for (const resolution of SUPPORTED_RESOLUTIONS) {
			const out = observedCurrentsOn(getGrid(resolution), CURRENTS);
			expect(out.east[0]).toHaveLength(getGrid(resolution).cellCount);
			expect(out.north[11]).toHaveLength(getGrid(resolution).cellCount);
		}
	}, 60_000);

	describe('on the real data', () => {
		const out = observedCurrentsOn(grid, CURRENTS);

		/** The fastest current of any month among the cells of a box. */
		const fastest = (
			latitudes: readonly [number, number],
			longitudes: readonly [number, number],
		): { speed: number; east: number; north: number } => {
			let best = { speed: 0, east: 0, north: 0 };
			for (const cell of cellsIn(64, latitudes, longitudes)) {
				for (let month = 0; month < 12; month++) {
					const u = (out.east[month] as Float32Array)[cell] as number;
					const v = (out.north[month] as Float32Array)[cell] as number;
					if (!Number.isNaN(u) && Math.hypot(u, v) > best.speed) {
						best = { speed: Math.hypot(u, v), east: u, north: v };
					}
				}
			}
			return best;
		};

		it('shows the Gulf Stream, the Kuroshio and the Agulhas Current on the cubed sphere', () => {
			const gulf = fastest([30, 40], [278, 295]);
			expect(gulf.speed).toBeGreaterThan(0.8);
			expect(gulf.east).toBeGreaterThan(0.3);
			expect(gulf.north).toBeGreaterThan(0.3);
			const kuroshio = fastest([28, 38], [130, 150]);
			expect(kuroshio.speed).toBeGreaterThan(0.7);
			expect(kuroshio.east).toBeGreaterThan(0.6);
			const agulhas = fastest([-40, -28], [20, 35]);
			expect(agulhas.speed).toBeGreaterThan(0.8);
			expect(agulhas.east).toBeLessThan(-0.4);
			expect(agulhas.north).toBeLessThan(-0.4);
		});

		it('shows the Antarctic Circumpolar Current flowing east round the Southern Ocean', () => {
			const mean = meanOf(out.east, cellsIn(64, [-58, -50], [0, 360]), YEAR);
			expect(mean).toBeGreaterThan(0.08);
		});

		it('marks the continents as no data in both components, never zero', () => {
			for (const cell of cellsIn(64, [30, 45], [255, 265])) {
				expect((out.east[0] as Float32Array)[cell]).toBeNaN();
				expect((out.north[0] as Float32Array)[cell]).toBeNaN();
			}
		});
	});
});
