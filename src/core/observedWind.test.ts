import { describe, expect, it } from 'vitest';
import {
	readObservedPressureFile,
	readObservedTemperatureFile,
	readObservedWindFile,
} from '../../scripts/earth/dataFile.mjs';
import {
	cellCentre,
	directionToLatLon,
	getGrid,
	SUPPORTED_RESOLUTIONS,
} from './grid';
import { cellLatitudes, MONTHS_PER_YEAR } from './insolation';
import {
	OBSERVED_BYTES,
	OBSERVED_COLUMNS,
	OBSERVED_ROWS,
	OBSERVED_VALUES_PER_MONTH,
	observedTemperature,
} from './observed';
import {
	decodeObservedPressure,
	decodeObservedWind,
	dequantisePressure,
	dequantiseWind,
	encodeObservedPressure,
	encodeObservedWind,
	OBSERVED_PRESSURE_BASE_HPA,
	OBSERVED_PRESSURE_BYTES,
	OBSERVED_PRESSURE_MAX_HPA,
	OBSERVED_PRESSURE_STEP_HPA,
	OBSERVED_WIND_BYTES,
	OBSERVED_WIND_MAX_M_PER_S,
	OBSERVED_WIND_MIN_M_PER_S,
	OBSERVED_WIND_STEP_M_PER_S,
	type ObservedWind,
	observedPressure,
	observedWind,
	quantisePressure,
	quantiseWind,
} from './observedWind';

/** The real data, as the page would load it. */
const WIND = decodeObservedWind(readObservedWindFile());
const PRESSURE = decodeObservedPressure(readObservedPressureFile());

const RADIANS_PER_DEGREE = Math.PI / 180;

/** Twelve grids, each value made by a function of the month and index. */
const twelve = (
	value: (month: number, index: number) => number,
): Float32Array[] =>
	Array.from({ length: MONTHS_PER_YEAR }, (_, month) =>
		Float32Array.from({ length: OBSERVED_VALUES_PER_MONTH }, (_, index) =>
			value(month, index),
		),
	);

/** The largest difference between two sets of grids, value for value. */
const largestDifference = (
	a: readonly ArrayLike<number>[],
	b: readonly ArrayLike<number>[],
): number => {
	let largest = 0;
	a.forEach((values, month) => {
		const others = b[month] as ArrayLike<number>;
		for (let index = 0; index < values.length; index++) {
			largest = Math.max(
				largest,
				Math.abs((values[index] as number) - (others[index] as number)),
			);
		}
	});
	return largest;
};

/** The year's mean of a grid of the data at a latitude and longitude east. */
const annualMean = (
	months: readonly Float32Array[],
	latitude: number,
	longitude: number,
): number => {
	const index = (90 - latitude) * OBSERVED_COLUMNS + longitude;
	let total = 0;
	for (const values of months) {
		total += values[index] as number;
	}
	return total / months.length;
};

/** The cells of a grid within some degrees of a pole. */
const cellsNearPole = (
	resolution: number,
	pole: 1 | -1,
	degrees: number,
): number[] => {
	const latitudes = cellLatitudes(getGrid(resolution));
	const near: number[] = [];
	latitudes.forEach((latitude, cell) => {
		if (pole * latitude > 90 - degrees) {
			near.push(cell);
		}
	});
	return near;
};

/** The longitude of a cell's centre, in radians east. */
const cellLongitude = (resolution: number, cell: number): number => {
	const { centres } = getGrid(resolution);
	return Math.atan2(
		centres[3 * cell + 1] as number,
		centres[3 * cell] as number,
	);
};

describe('quantiseWind', () => {
	it('loses no more than an eighth of a metre a second across the range', () => {
		for (
			let speed = OBSERVED_WIND_MIN_M_PER_S - 0.124;
			speed <= OBSERVED_WIND_MAX_M_PER_S + 0.124;
			speed += 0.003
		) {
			const back = dequantiseWind(quantiseWind(speed));
			expect(Math.abs(back - speed)).toBeLessThanOrEqual(0.125 + 1e-9);
		}
	});

	it('gives whole numbers from -128 to 127', () => {
		expect(quantiseWind(-32)).toBe(-128);
		expect(quantiseWind(-32.125)).toBe(-128);
		expect(quantiseWind(-0.125)).toBe(0);
		expect(Object.is(quantiseWind(-0.1), 0)).toBe(true);
		expect(quantiseWind(0.125)).toBe(1);
		expect(quantiseWind(-7.3)).toBe(-29);
		expect(quantiseWind(31.75)).toBe(127);
		expect(quantiseWind(31.874)).toBe(127);
		expect(OBSERVED_WIND_STEP_M_PER_S).toBe(0.25);
		expect(OBSERVED_WIND_MIN_M_PER_S).toBe(-32);
		expect(OBSERVED_WIND_MAX_M_PER_S).toBe(31.75);
	});

	it('refuses a wind it would have to clip', () => {
		for (const speed of [-32.126, -40, 31.875, 40, Number.NaN]) {
			expect(() => quantiseWind(speed), `${speed}`).toThrow(RangeError);
		}
	});
});

describe('quantisePressure', () => {
	it('loses no more than a quarter of a hectopascal across the range', () => {
		for (
			let pressure = OBSERVED_PRESSURE_BASE_HPA - 0.25;
			pressure <= OBSERVED_PRESSURE_MAX_HPA + 0.249;
			pressure += 0.003
		) {
			const back = dequantisePressure(quantisePressure(pressure));
			expect(Math.abs(back - pressure)).toBeLessThanOrEqual(0.25 + 1e-9);
		}
	});

	it('gives whole numbers from 0 to 255', () => {
		expect(quantisePressure(940)).toBe(0);
		expect(quantisePressure(939.75)).toBe(0);
		expect(Object.is(quantisePressure(939.76), 0)).toBe(true);
		expect(quantisePressure(1013.25)).toBe(147);
		expect(quantisePressure(1067.5)).toBe(255);
		expect(quantisePressure(1067.74)).toBe(255);
		expect(OBSERVED_PRESSURE_STEP_HPA).toBe(0.5);
		expect(OBSERVED_PRESSURE_MAX_HPA).toBe(1067.5);
	});

	it('refuses a pressure it would have to clip', () => {
		for (const pressure of [939.74, 900, 1067.75, 1100, Number.NaN]) {
			expect(() => quantisePressure(pressure), `${pressure}`).toThrow(
				RangeError,
			);
		}
	});
});

describe('encodeObservedWind', () => {
	it('gives back the real file from what it decodes to', () => {
		expect(encodeObservedWind(WIND)).toEqual(readObservedWindFile());
	});

	it('stores winds of either sign that decode to within an eighth of a metre a second', () => {
		const wind = {
			east: twelve(
				(month, index) =>
					OBSERVED_WIND_MIN_M_PER_S + ((index * 7 + month * 13) % 6_387) / 100,
			),
			north: twelve(
				(month, index) =>
					OBSERVED_WIND_MAX_M_PER_S - ((index * 11 + month * 5) % 6_387) / 100,
			),
		};
		const decoded = decodeObservedWind(encodeObservedWind(wind));
		expect(largestDifference(wind.east, decoded.east)).toBeLessThanOrEqual(
			0.125 + 1e-6,
		);
		expect(largestDifference(wind.north, decoded.north)).toBeLessThanOrEqual(
			0.125 + 1e-6,
		);
	});

	it('stores each month’s eastward grid, then its northward, as signed bytes', () => {
		const bytes = encodeObservedWind({
			east: twelve((month, index) => (index === 0 ? -1 - month : 0)),
			north: twelve((month, index) => (index === 1 ? month / 4 : 0)),
		});
		const signed = new Int8Array(bytes.buffer);
		for (let month = 0; month < MONTHS_PER_YEAR; month++) {
			const start = 2 * month * OBSERVED_VALUES_PER_MONTH;
			expect(signed[start]).toBe(-4 - 4 * month);
			expect(signed[start + OBSERVED_VALUES_PER_MONTH + 1]).toBe(month);
		}
		expect(bytes).toHaveLength(OBSERVED_WIND_BYTES);
	});

	it('refuses grids of the wrong number or length, or out of range', () => {
		const calm = twelve(() => 0);
		expect(() =>
			encodeObservedWind({ east: calm.slice(1), north: calm }),
		).toThrow('Observed eastward wind has 12 months; got 11');
		expect(() =>
			encodeObservedWind({
				east: calm,
				north: [...calm.slice(1), new Float32Array(10)],
			}),
		).toThrow(
			'Each month of observed northward wind has 65160 values; month 11 has 10',
		);
		const gale = twelve((_, index) => (index === 5 ? 40 : 0));
		expect(() => encodeObservedWind({ east: calm, north: gale })).toThrow(
			'40 m/s is outside',
		);
		const unknown = twelve((_, index) => (index === 5 ? Number.NaN : 0));
		expect(() => encodeObservedWind({ east: unknown, north: calm })).toThrow(
			RangeError,
		);
	});
});

describe('decodeObservedWind', () => {
	it('gives twelve months of each component from the real file', () => {
		expect(readObservedWindFile()).toHaveLength(OBSERVED_WIND_BYTES);
		expect(OBSERVED_WIND_BYTES).toBe(12 * 2 * 181 * 360);
		for (const grids of [WIND.east, WIND.north]) {
			expect(grids).toHaveLength(MONTHS_PER_YEAR);
			for (const values of grids) {
				expect(values).toHaveLength(181 * 360);
			}
		}
	});

	it('reads each byte as a signed quarter step', () => {
		const bytes = new Uint8Array(OBSERVED_WIND_BYTES);
		bytes[0] = 0x80;
		bytes[1] = 0x7f;
		bytes[OBSERVED_VALUES_PER_MONTH] = 0xff;
		bytes[OBSERVED_WIND_BYTES - 1] = 6;
		const { east, north } = decodeObservedWind(bytes);
		expect(east[0]?.[0]).toBe(-32);
		expect(east[0]?.[1]).toBe(31.75);
		expect(north[0]?.[0]).toBe(-0.25);
		expect(north[11]?.[OBSERVED_VALUES_PER_MONTH - 1]).toBe(1.5);
	});

	it('reads bytes that start part of the way into their buffer', () => {
		const padded = new Uint8Array(OBSERVED_WIND_BYTES + 3);
		padded[3] = 0xfe;
		const { east } = decodeObservedWind(padded.subarray(3));
		expect(east[0]?.[0]).toBe(-0.5);
	});

	it('refuses a file of the wrong length', () => {
		for (const length of [
			0,
			OBSERVED_WIND_BYTES - 1,
			OBSERVED_WIND_BYTES + 1,
		]) {
			expect(() => decodeObservedWind(new Uint8Array(length))).toThrow(
				RangeError,
			);
		}
		expect(() => decodeObservedWind(readObservedTemperatureFile())).toThrow(
			`The observed wind file is ${OBSERVED_WIND_BYTES} bytes long; got ${OBSERVED_BYTES}`,
		);
	});
});

describe('encodeObservedPressure', () => {
	it('gives back the real file from what it decodes to', () => {
		expect(encodeObservedPressure(PRESSURE.months)).toEqual(
			readObservedPressureFile(),
		);
	});

	it('stores values that decode to within a quarter of a hectopascal', () => {
		const months = twelve(
			(month, index) =>
				OBSERVED_PRESSURE_BASE_HPA + ((index * 7 + month * 13) % 12_774) / 100,
		);
		const decoded = decodeObservedPressure(encodeObservedPressure(months));
		expect(largestDifference(months, decoded.months)).toBeLessThanOrEqual(
			0.25 + 1e-4,
		);
	});

	it('refuses months of the wrong number or length, or out of range', () => {
		const month = new Float32Array(OBSERVED_VALUES_PER_MONTH).fill(1000);
		expect(() => encodeObservedPressure([month])).toThrow(
			'Observed pressure has 12 months; got 1',
		);
		expect(() =>
			encodeObservedPressure([
				...Array.from({ length: 11 }, () => month),
				new Float32Array(10),
			]),
		).toThrow('month 11 has 10');
		for (const wrong of [900, Number.NaN]) {
			const low = Float32Array.from(month);
			low[5] = wrong;
			expect(() =>
				encodeObservedPressure(Array.from({ length: 12 }, () => low)),
			).toThrow(`${wrong} hPa is outside`);
		}
	});
});

describe('decodeObservedPressure', () => {
	it('gives twelve months of the source grid from the real file', () => {
		expect(readObservedPressureFile()).toHaveLength(OBSERVED_PRESSURE_BYTES);
		expect(OBSERVED_PRESSURE_BYTES).toBe(12 * 181 * 360);
		expect(PRESSURE.months).toHaveLength(MONTHS_PER_YEAR);
		for (const values of PRESSURE.months) {
			expect(values).toHaveLength(181 * 360);
		}
	});

	it('reads each byte as a half step from 940 hPa', () => {
		const bytes = new Uint8Array(OBSERVED_PRESSURE_BYTES);
		bytes[1] = 147;
		bytes[OBSERVED_VALUES_PER_MONTH] = 255;
		const { months } = decodeObservedPressure(bytes);
		expect(months[0]?.[0]).toBe(940);
		expect(months[0]?.[1]).toBe(1013.5);
		expect(months[1]?.[0]).toBe(1067.5);
	});

	it('refuses a file of the wrong length', () => {
		for (const length of [
			0,
			OBSERVED_PRESSURE_BYTES - 1,
			OBSERVED_PRESSURE_BYTES + 1,
		]) {
			expect(() => decodeObservedPressure(new Uint8Array(length))).toThrow(
				RangeError,
			);
		}
		expect(() => decodeObservedPressure(readObservedWindFile())).toThrow(
			`The observed pressure file is ${OBSERVED_PRESSURE_BYTES} bytes long; got ${OBSERVED_WIND_BYTES}`,
		);
	});
});

describe('the observed winds and pressure', () => {
	it('have easterly trade winds at 15° N and 15° S in the Atlantic and the Pacific', () => {
		for (const [name, latitude, longitude] of [
			['North Atlantic', 15, 320],
			['South Atlantic', -15, 340],
			['North Pacific', 15, 210],
			['South Pacific', -15, 240],
		] as const) {
			expect(annualMean(WIND.east, latitude, longitude), name).toBeLessThan(-3);
			// The trades blow towards the equator from either side.
			expect(
				Math.sign(latitude) * annualMean(WIND.north, latitude, longitude),
				name,
			).toBeLessThan(0);
		}
	});

	it('have westerlies at 45° S', () => {
		let total = 0;
		for (let longitude = 0; longitude < OBSERVED_COLUMNS; longitude++) {
			total += annualMean(WIND.east, -45, longitude);
		}
		expect(total / OBSERVED_COLUMNS).toBeGreaterThan(3);
	});

	it('have a pressure between 950 and 1060 hPa everywhere', () => {
		let low = Number.POSITIVE_INFINITY;
		let high = Number.NEGATIVE_INFINITY;
		for (const values of PRESSURE.months) {
			for (const hectopascals of values) {
				low = Math.min(low, hectopascals);
				high = Math.max(high, hectopascals);
			}
		}
		expect(low).toBeGreaterThan(950);
		expect(high).toBeLessThan(1060);
	});
});

describe('observedWind', () => {
	it('gives an eastward wind everywhere from a uniform eastward one, the poles too', () => {
		const resolution = 64;
		const fields = observedWind(
			{ east: twelve(() => 10), north: twelve(() => 0) },
			resolution,
		);
		let eastError = 0;
		let northError = 0;
		for (let month = 0; month < MONTHS_PER_YEAR; month++) {
			const east = fields.east[month] as Float32Array;
			const north = fields.north[month] as Float32Array;
			expect(east).toHaveLength(getGrid(resolution).cellCount);
			for (let cell = 0; cell < east.length; cell++) {
				eastError = Math.max(eastError, Math.abs((east[cell] as number) - 10));
				northError = Math.max(northError, Math.abs(north[cell] as number));
			}
		}
		expect(eastError).toBeLessThan(1e-3);
		expect(northError).toBeLessThan(1e-3);
		for (const pole of [1, -1] as const) {
			const near = cellsNearPole(resolution, pole, 1.5);
			expect(near.length, `${pole}`).toBeGreaterThan(0);
			for (const cell of near) {
				expect(fields.east[0]?.[cell]).toBeCloseTo(10, 3);
				expect(fields.north[0]?.[cell]).toBeCloseTo(0, 3);
			}
		}
	});

	it('keeps the strength of a wind blowing straight over either pole', () => {
		const resolution = 64;
		const speed = 10;
		// One direction in space, towards latitude 0°, longitude 0°: it lies
		// along the ground at both poles, crossing each from one side to the
		// other. Each point of the data has it in its own east and north.
		const across: ObservedWind = {
			east: twelve((_, index) => {
				const column = index % OBSERVED_COLUMNS;
				return -speed * Math.sin(column * RADIANS_PER_DEGREE);
			}),
			north: twelve((_, index) => {
				const row = Math.floor(index / OBSERVED_COLUMNS);
				const column = index % OBSERVED_COLUMNS;
				return (
					-speed *
					Math.sin((90 - row) * RADIANS_PER_DEGREE) *
					Math.cos(column * RADIANS_PER_DEGREE)
				);
			}),
		};
		const fields = observedWind(across, resolution);
		const latitudes = cellLatitudes(getGrid(resolution));
		for (const pole of [1, -1] as const) {
			const near = cellsNearPole(resolution, pole, 1.5);
			expect(near.length, `${pole}`).toBeGreaterThan(0);
			for (const cell of near) {
				const latitude = (latitudes[cell] as number) * RADIANS_PER_DEGREE;
				const longitude = cellLongitude(resolution, cell);
				const east = fields.east[3]?.[cell] as number;
				const north = fields.north[3]?.[cell] as number;
				expect(Math.hypot(east, north), `cell ${cell}`).toBeGreaterThan(
					0.995 * speed,
				);
				expect(Math.hypot(east, north), `cell ${cell}`).toBeLessThan(
					1.001 * speed,
				);
				expect(east).toBeCloseTo(-speed * Math.sin(longitude), 2);
				expect(north).toBeCloseTo(
					-speed * Math.sin(latitude) * Math.cos(longitude),
					2,
				);
			}
		}
	});

	it('blends the four points around a cell by how near each is, as vectors', () => {
		const resolution = 64;
		const grid = getGrid(resolution);
		// Fields that change along rows and columns alike, and by month.
		const eastAt = (month: number, row: number, column: number): number =>
			Math.fround(
				(row - 90) / 9 +
					4 * Math.sin((3 * column + month) * RADIANS_PER_DEGREE),
			);
		const northAt = (month: number, row: number, column: number): number =>
			Math.fround(
				3 * Math.cos((2 * row + month) * RADIANS_PER_DEGREE) + column / 60 - 3,
			);
		const fields = observedWind(
			{
				east: twelve((month, index) =>
					eastAt(
						month,
						Math.floor(index / OBSERVED_COLUMNS),
						index % OBSERVED_COLUMNS,
					),
				),
				north: twelve((month, index) =>
					northAt(
						month,
						Math.floor(index / OBSERVED_COLUMNS),
						index % OBSERVED_COLUMNS,
					),
				),
			},
			resolution,
		);
		/** The directions east and north at a place, as x, y, z. */
		const frame = (latitudeDeg: number, longitudeDeg: number) => {
			const latitude = latitudeDeg * RADIANS_PER_DEGREE;
			const longitude = longitudeDeg * RADIANS_PER_DEGREE;
			return {
				east: [-Math.sin(longitude), Math.cos(longitude), 0],
				north: [
					-Math.sin(latitude) * Math.cos(longitude),
					-Math.sin(latitude) * Math.sin(longitude),
					Math.cos(latitude),
				],
			};
		};
		const dot = (a: readonly number[], b: readonly number[]): number =>
			(a[0] as number) * (b[0] as number) +
			(a[1] as number) * (b[1] as number) +
			(a[2] as number) * (b[2] as number);
		/** Where a place falls between rows and columns of the data. */
		const fractions = (latitudeDeg: number, longitudeDeg: number) => {
			const down = 90 - latitudeDeg;
			const row = Math.min(Math.floor(down), OBSERVED_ROWS - 2);
			const across = ((longitudeDeg % 360) + 360) % 360;
			const column = Math.floor(across);
			return { row, column, south: down - row, east: across - column };
		};
		/** The wind at a place, blended in three dimensions from the data. */
		const expected = (
			month: number,
			latitudeDeg: number,
			longitudeDeg: number,
		) => {
			const { row, column, south, east } = fractions(latitudeDeg, longitudeDeg);
			const next = (column + 1) % OBSERVED_COLUMNS;
			const vector = [0, 0, 0];
			for (const [pointRow, pointColumn, weight] of [
				[row, column, (1 - east) * (1 - south)],
				[row, next, east * (1 - south)],
				[row + 1, column, (1 - east) * south],
				[row + 1, next, east * south],
			] as const) {
				const point = frame(90 - pointRow, pointColumn);
				const u = eastAt(month, pointRow, pointColumn);
				const v = northAt(month, pointRow, pointColumn);
				for (let axis = 0; axis < 3; axis++) {
					vector[axis] =
						(vector[axis] as number) +
						weight *
							(u * (point.east[axis] as number) +
								v * (point.north[axis] as number));
				}
			}
			const centre = frame(latitudeDeg, longitudeDeg);
			return {
				east: dot(vector, centre.east),
				north: dot(vector, centre.north),
			};
		};

		const lopsided: number[] = [];
		const nearPoles: number[] = [];
		for (let cell = 0; cell < grid.cellCount; cell++) {
			const { latitudeDeg, longitudeDeg } = directionToLatLon(
				cellCentre(grid, cell),
			);
			const { south, east } = fractions(latitudeDeg, longitudeDeg);
			const quarter =
				(Math.abs(east - 0.25) < 0.08 && Math.abs(south - 0.75) < 0.08) ||
				(Math.abs(east - 0.75) < 0.08 && Math.abs(south - 0.25) < 0.08);
			if (quarter && Math.abs(latitudeDeg) < 80) {
				lopsided.push(cell);
			}
			if (Math.abs(latitudeDeg) > 88.5 && Math.abs(east - 0.5) > 0.15) {
				nearPoles.push(cell);
			}
		}
		expect(lopsided.length).toBeGreaterThan(100);
		expect(nearPoles.length).toBeGreaterThan(1);
		for (const cell of [...lopsided, ...nearPoles]) {
			const { latitudeDeg, longitudeDeg } = directionToLatLon(
				cellCentre(grid, cell),
			);
			for (const month of [0, 7]) {
				const want = expected(month, latitudeDeg, longitudeDeg);
				expect(fields.east[month]?.[cell], `cell ${cell}`).toBeCloseTo(
					want.east,
					4,
				);
				expect(fields.north[month]?.[cell], `cell ${cell}`).toBeCloseTo(
					want.north,
					4,
				);
			}
		}
	});

	it('gives finite winds the file could hold everywhere, at every resolution', () => {
		for (const resolution of SUPPORTED_RESOLUTIONS) {
			const fields = observedWind(WIND, resolution);
			for (const grids of [fields.east, fields.north]) {
				expect(grids).toHaveLength(MONTHS_PER_YEAR);
				for (const field of grids) {
					expect(field).toHaveLength(getGrid(resolution).cellCount);
					expect(
						field.every(
							(speed) =>
								speed >= OBSERVED_WIND_MIN_M_PER_S &&
								speed <= OBSERVED_WIND_MAX_M_PER_S,
						),
					).toBe(true);
				}
			}
		}
	}, 60_000);

	it('refuses an unsupported resolution or data of the wrong shape', () => {
		expect(() => observedWind(WIND, 100)).toThrow(RangeError);
		expect(() =>
			observedWind({ east: WIND.east, north: WIND.north.slice(1) }, 64),
		).toThrow(RangeError);
		expect(() =>
			observedWind(
				{
					east: [...WIND.east.slice(1), new Float32Array(3)],
					north: WIND.north,
				},
				64,
			),
		).toThrow(RangeError);
	});
});

describe('observedPressure', () => {
	it('takes the same numbers onto the cells as the temperature does', () => {
		const months = twelve(
			(month, index) =>
				1000 +
				10 * Math.sin(index / 97 + month) +
				(Math.floor(index / OBSERVED_COLUMNS) - OBSERVED_ROWS / 2) / 10,
		);
		for (const resolution of [64, 128]) {
			expect(observedPressure({ months }, resolution)).toEqual(
				observedTemperature({ months }, resolution),
			);
		}
	});

	it('gives finite values within the data everywhere, at every resolution', () => {
		for (const resolution of SUPPORTED_RESOLUTIONS) {
			const fields = observedPressure(PRESSURE, resolution);
			expect(fields).toHaveLength(MONTHS_PER_YEAR);
			for (const field of fields) {
				expect(field).toHaveLength(getGrid(resolution).cellCount);
				expect(
					field.every(
						(hectopascals) => hectopascals > 950 && hectopascals < 1060,
					),
				).toBe(true);
			}
		}
	});

	it('refuses an unsupported resolution or data of the wrong shape', () => {
		expect(() => observedPressure(PRESSURE, 100)).toThrow(RangeError);
		expect(() =>
			observedPressure(
				{ months: [...PRESSURE.months.slice(1), new Float32Array(3)] },
				64,
			),
		).toThrow(RangeError);
	});
});
