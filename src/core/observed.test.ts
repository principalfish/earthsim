import { describe, expect, it } from 'vitest';
import {
	readEarthDataFile,
	readObservedTemperatureFile,
} from '../../scripts/earth/dataFile.mjs';
import {
	cellCentre,
	directionToLatLon,
	getGrid,
	SUPPORTED_RESOLUTIONS,
} from './grid';
import { MONTHS_PER_YEAR } from './insolation';
import {
	decodeObservedTemperature,
	dequantiseTemperature,
	encodeObservedTemperature,
	OBSERVED_BASE_C,
	OBSERVED_BYTES,
	OBSERVED_COLUMNS,
	OBSERVED_MAX_C,
	OBSERVED_ROWS,
	OBSERVED_STEP_C,
	OBSERVED_VALUES_PER_MONTH,
	type ObservedTemperature,
	observedTemperature,
	observedTemperatureAt,
	quantiseTemperature,
} from './observed';

/**
 * The host's high-resolution clock. It is not part of the ES2022 library the
 * core is type-checked against.
 */
declare const performance: { now: () => number };

/** The real data, as the page loads it. */
const OBSERVED = decodeObservedTemperature(readObservedTemperatureFile());

const JANUARY = 0;
const JULY = 6;

/** The value of a month at a row and column of the data. */
const pointValue = (
	data: ObservedTemperature,
	month: number,
	row: number,
	column: number,
): number =>
	(data.months[month] as Float32Array)[
		row * OBSERVED_COLUMNS + column
	] as number;

/**
 * The share of the globe each row of the data stands for: the band of
 * latitude half a degree either side of it, cut off at the poles.
 */
const rowWeight = (row: number): number => {
	const latitude = 90 - row;
	const top = Math.min(90, latitude + 0.5);
	const bottom = Math.max(-90, latitude - 0.5);
	return (
		(Math.sin((top * Math.PI) / 180) - Math.sin((bottom * Math.PI) / 180)) / 2
	);
};

/** The mean of a month over one row of the data. */
const rowMean = (data: ObservedTemperature, month: number, row: number) => {
	let total = 0;
	for (let column = 0; column < OBSERVED_COLUMNS; column++) {
		total += pointValue(data, month, row, column);
	}
	return total / OBSERVED_COLUMNS;
};

/** The data with every month changed the same way. */
const remap = (
	data: ObservedTemperature,
	source: (row: number, column: number) => number,
): ObservedTemperature => ({
	months: data.months.map((values) => {
		const out = new Float32Array(OBSERVED_VALUES_PER_MONTH);
		for (let row = 0; row < OBSERVED_ROWS; row++) {
			for (let column = 0; column < OBSERVED_COLUMNS; column++) {
				out[row * OBSERVED_COLUMNS + column] = values[
					source(row, column)
				] as number;
			}
		}
		return out;
	}),
});

/** The data turned upside down, north for south. */
const flipped = (data: ObservedTemperature): ObservedTemperature =>
	remap(
		data,
		(row, column) => (OBSERVED_ROWS - 1 - row) * OBSERVED_COLUMNS + column,
	);

/** The data moved east by a number of degrees of longitude. */
const shifted = (
	data: ObservedTemperature,
	degrees: number,
): ObservedTemperature =>
	remap(
		data,
		(row, column) =>
			row * OBSERVED_COLUMNS +
			((column - degrees + OBSERVED_COLUMNS) % OBSERVED_COLUMNS),
	);

/**
 * Places whose temperature is well known, each with the test it must pass:
 * together they show the data is the right way up and round.
 */
const SPOTS: readonly {
	readonly name: string;
	readonly latitude: number;
	readonly longitude: number;
	readonly months: readonly number[];
	readonly holds: (celsius: number) => boolean;
}[] = [
	{
		name: 'central Sahara in July, above 30 °C',
		latitude: 23,
		longitude: 0,
		months: [JULY],
		holds: (celsius) => celsius > 30,
	},
	{
		name: 'the South Pole in July, below -45 °C',
		latitude: -90,
		longitude: 0,
		months: [JULY],
		holds: (celsius) => celsius < -45,
	},
	{
		name: 'the equatorial Pacific, 25 to 29 °C all year',
		latitude: 0,
		longitude: 180,
		months: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
		holds: (celsius) => celsius >= 25 && celsius <= 29,
	},
	{
		name: 'central Siberia in January, below -25 °C',
		latitude: 65,
		longitude: 120,
		months: [JANUARY],
		holds: (celsius) => celsius < -25,
	},
	{
		// High and narrow, so that moving the data even a few degrees east
		// or west puts low, warm ground or the sea in its place.
		name: 'the Altiplano in July, below 12 °C',
		latitude: -17,
		longitude: -68,
		months: [JULY],
		holds: (celsius) => celsius < 12,
	},
];

/** The spots whose test the data fails, with what it gives there. */
const spotFailures = (data: ObservedTemperature): string[] =>
	SPOTS.flatMap(({ name, latitude, longitude, months, holds }) =>
		months
			.map((month) => observedTemperatureAt(data, month, latitude, longitude))
			.filter((celsius) => !holds(celsius))
			.map((celsius) => `${name}: ${celsius}`),
	);

describe('decodeObservedTemperature', () => {
	it('gives twelve months of the source grid from the real file', () => {
		expect(readObservedTemperatureFile()).toHaveLength(OBSERVED_BYTES);
		expect(OBSERVED_BYTES).toBe(12 * 181 * 360);
		expect(OBSERVED.months).toHaveLength(MONTHS_PER_YEAR);
		for (const values of OBSERVED.months) {
			expect(values).toHaveLength(181 * 360);
		}
	});

	it('reads each byte as a half-degree step from -80 °C', () => {
		const bytes = new Uint8Array(OBSERVED_BYTES);
		bytes[0] = 0;
		bytes[1] = 160;
		bytes[OBSERVED_VALUES_PER_MONTH] = 255;
		bytes[OBSERVED_BYTES - 1] = 107;
		const { months } = decodeObservedTemperature(bytes);
		expect(months[0]?.[0]).toBe(-80);
		expect(months[0]?.[1]).toBe(0);
		expect(months[1]?.[0]).toBe(47.5);
		expect(months[11]?.[OBSERVED_VALUES_PER_MONTH - 1]).toBe(-26.5);
	});

	it('refuses a file of the wrong length', () => {
		for (const length of [0, OBSERVED_BYTES - 1, OBSERVED_BYTES + 1]) {
			expect(() => decodeObservedTemperature(new Uint8Array(length))).toThrow(
				RangeError,
			);
		}
		expect(() => decodeObservedTemperature(readEarthDataFile())).toThrow(
			`The observed temperature file is ${OBSERVED_BYTES} bytes long; got 786432`,
		);
	});
});

describe('the observed temperature', () => {
	it('has a global annual mean of 12 to 16 °C', () => {
		let total = 0;
		for (let month = 0; month < MONTHS_PER_YEAR; month++) {
			for (let row = 0; row < OBSERVED_ROWS; row++) {
				total += rowWeight(row) * rowMean(OBSERVED, month, row);
			}
		}
		const mean = total / MONTHS_PER_YEAR;
		expect(mean).toBeGreaterThan(12);
		expect(mean).toBeLessThan(16);
	});

	it('is warmer in July than January north of 30° N, colder south of 30° S', () => {
		for (let row = 0; row < OBSERVED_ROWS; row++) {
			const latitude = 90 - row;
			const july = rowMean(OBSERVED, JULY, row);
			const january = rowMean(OBSERVED, JANUARY, row);
			if (latitude > 30) {
				expect(july, `${latitude}°`).toBeGreaterThan(january);
			} else if (latitude < -30) {
				expect(july, `${latitude}°`).toBeLessThan(january);
			}
		}
	});

	it('is as known at well-known places', () => {
		expect(spotFailures(OBSERVED)).toEqual([]);
	});

	it('fails at those places if turned north for south or moved round', () => {
		expect(spotFailures(flipped(OBSERVED))).not.toEqual([]);
		// The spots between them catch every move of 3° or more either way.
		for (const degrees of [3, 10, 30, 90, 180, 270, 330, 350, 357]) {
			expect(
				spotFailures(shifted(OBSERVED, degrees)),
				`${degrees}°`,
			).not.toEqual([]);
		}
	});
});

describe('quantiseTemperature', () => {
	it('loses no more than a quarter of a degree across the range', () => {
		for (
			let celsius = OBSERVED_BASE_C - 0.25;
			celsius <= OBSERVED_MAX_C + 0.249;
			celsius += 0.003
		) {
			const back = dequantiseTemperature(quantiseTemperature(celsius));
			expect(Math.abs(back - celsius)).toBeLessThanOrEqual(0.25 + 1e-9);
		}
	});

	it('gives whole numbers from 0 to 255', () => {
		expect(quantiseTemperature(-80)).toBe(0);
		expect(quantiseTemperature(-80.25)).toBe(0);
		expect(quantiseTemperature(0)).toBe(160);
		expect(quantiseTemperature(0.24)).toBe(160);
		expect(quantiseTemperature(0.25)).toBe(161);
		expect(quantiseTemperature(47.5)).toBe(255);
		expect(quantiseTemperature(47.74)).toBe(255);
		expect(OBSERVED_STEP_C).toBe(0.5);
	});

	it('refuses a temperature it would have to clip', () => {
		for (const celsius of [-80.26, -90, 47.75, 60, Number.NaN]) {
			expect(() => quantiseTemperature(celsius), `${celsius}`).toThrow(
				RangeError,
			);
		}
	});
});

describe('encodeObservedTemperature', () => {
	it('gives back the real file from what it decodes to', () => {
		expect(encodeObservedTemperature(OBSERVED.months)).toEqual(
			readObservedTemperatureFile(),
		);
	});

	it('stores values that decode to within a quarter of a degree', () => {
		const months = Array.from({ length: MONTHS_PER_YEAR }, (_, month) =>
			Float64Array.from(
				{ length: OBSERVED_VALUES_PER_MONTH },
				(_, index) => -60 + ((index * 7 + month * 13) % 10_000) / 100,
			),
		);
		const decoded = decodeObservedTemperature(
			encodeObservedTemperature(months),
		);
		months.forEach((values, month) => {
			const back = decoded.months[month] as Float32Array;
			let largest = 0;
			values.forEach((celsius, index) => {
				largest = Math.max(
					largest,
					Math.abs((back[index] as number) - celsius),
				);
			});
			expect(largest).toBeLessThanOrEqual(0.25 + 1e-6);
		});
	});

	it('refuses months of the wrong number or length, or out of range', () => {
		const month = new Float32Array(OBSERVED_VALUES_PER_MONTH);
		expect(() => encodeObservedTemperature([month])).toThrow(RangeError);
		expect(() =>
			encodeObservedTemperature([
				...Array.from({ length: 11 }, () => month),
				new Float32Array(10),
			]),
		).toThrow('month 11 has 10');
		const hot = Float32Array.from(month);
		hot[5] = 50;
		expect(() =>
			encodeObservedTemperature(Array.from({ length: 12 }, () => hot)),
		).toThrow('50 °C is outside');
	});
});

describe('observedTemperatureAt', () => {
	it('gives the value at a point of the data', () => {
		expect(observedTemperatureAt(OBSERVED, JULY, 23, 8)).toBe(
			pointValue(OBSERVED, JULY, 90 - 23, 8),
		);
		expect(observedTemperatureAt(OBSERVED, JANUARY, -45, -90)).toBe(
			pointValue(OBSERVED, JANUARY, 90 + 45, 270),
		);
	});

	it('interpolates between the four points around a place', () => {
		const nw = pointValue(OBSERVED, 3, 40, 10);
		const ne = pointValue(OBSERVED, 3, 40, 11);
		const sw = pointValue(OBSERVED, 3, 41, 10);
		const se = pointValue(OBSERVED, 3, 41, 11);
		const north = nw + 0.25 * (ne - nw);
		const south = sw + 0.25 * (se - sw);
		expect(observedTemperatureAt(OBSERVED, 3, 49.4, 10.25)).toBeCloseTo(
			north + 0.6 * (south - north),
			4,
		);
	});

	it('wraps across the prime meridian and the date line', () => {
		const west = pointValue(OBSERVED, JULY, 30, 359);
		const east = pointValue(OBSERVED, JULY, 30, 0);
		expect(observedTemperatureAt(OBSERVED, JULY, 60, -0.5)).toBeCloseTo(
			(west + east) / 2,
			4,
		);
		expect(observedTemperatureAt(OBSERVED, JULY, 60, 359.5)).toBeCloseTo(
			(west + east) / 2,
			4,
		);
		expect(observedTemperatureAt(OBSERVED, JULY, 60, -1e-15)).toBeCloseTo(
			east,
			4,
		);
		for (const longitude of [-180, 180, 540, -540]) {
			expect(observedTemperatureAt(OBSERVED, JULY, 10, longitude)).toBe(
				pointValue(OBSERVED, JULY, 80, 180),
			);
		}
		const across = [179.99, -179.99].map((longitude) =>
			observedTemperatureAt(OBSERVED, JULY, 10, longitude),
		);
		expect(
			Math.abs((across[0] as number) - (across[1] as number)),
		).toBeLessThan(0.1);
	});

	it('uses the pole rows at the poles and makes up nothing beyond them', () => {
		for (const month of [JANUARY, JULY]) {
			for (const [latitude, row] of [
				[90, 0],
				[-90, 180],
			] as const) {
				for (const longitude of [0, 45.5, -120, 180]) {
					const value = observedTemperatureAt(
						OBSERVED,
						month,
						latitude,
						longitude,
					);
					expect(Number.isFinite(value)).toBe(true);
					let low = Number.POSITIVE_INFINITY;
					let high = Number.NEGATIVE_INFINITY;
					for (let column = 0; column < OBSERVED_COLUMNS; column++) {
						low = Math.min(low, pointValue(OBSERVED, month, row, column));
						high = Math.max(high, pointValue(OBSERVED, month, row, column));
					}
					expect(value).toBeGreaterThanOrEqual(low - 1e-4);
					expect(value).toBeLessThanOrEqual(high + 1e-4);
				}
			}
		}
	});

	it('refuses a month, latitude or longitude that is not a place in the year', () => {
		for (const month of [-1, 12, 1.5, Number.NaN]) {
			expect(() => observedTemperatureAt(OBSERVED, month, 0, 0)).toThrow(
				RangeError,
			);
		}
		for (const latitude of [-90.01, 90.01, Number.NaN]) {
			expect(() => observedTemperatureAt(OBSERVED, 0, latitude, 0)).toThrow(
				RangeError,
			);
		}
		for (const longitude of [Number.POSITIVE_INFINITY, Number.NaN]) {
			expect(() => observedTemperatureAt(OBSERVED, 0, 0, longitude)).toThrow(
				RangeError,
			);
		}
		expect(() =>
			observedTemperatureAt({ months: OBSERVED.months.slice(1) }, 0, 0, 0),
		).toThrow(RangeError);
	});
});

describe('observedTemperature', () => {
	it('gives each cell the value interpolated at its centre', () => {
		const resolution = 64;
		const grid = getGrid(resolution);
		const fields = observedTemperature(OBSERVED, resolution);
		expect(fields).toHaveLength(MONTHS_PER_YEAR);
		for (let cell = 0; cell < grid.cellCount; cell += 37) {
			const { latitudeDeg, longitudeDeg } = directionToLatLon(
				cellCentre(grid, cell),
			);
			for (const month of [JANUARY, 4, JULY, 11]) {
				expect(fields[month]?.[cell], `cell ${cell}`).toBeCloseTo(
					observedTemperatureAt(OBSERVED, month, latitudeDeg, longitudeDeg),
					4,
				);
			}
		}
	});

	it('gives finite values everywhere, at every resolution', () => {
		for (const resolution of SUPPORTED_RESOLUTIONS) {
			const fields = observedTemperature(OBSERVED, resolution);
			for (const field of fields) {
				expect(field).toHaveLength(getGrid(resolution).cellCount);
				expect(
					field.every(
						(celsius) =>
							celsius >= OBSERVED_BASE_C && celsius <= OBSERVED_MAX_C,
					),
				).toBe(true);
			}
		}
	});

	it('keeps the global mean of the data on a world’s cells', () => {
		const grid = getGrid(128);
		const fields = observedTemperature(OBSERVED, 128);
		let onCells = 0;
		let onPoints = 0;
		for (let month = 0; month < MONTHS_PER_YEAR; month++) {
			const field = fields[month] as Float32Array;
			for (let cell = 0; cell < grid.cellCount; cell++) {
				onCells += (grid.areas[cell] as number) * (field[cell] as number);
			}
			for (let row = 0; row < OBSERVED_ROWS; row++) {
				onPoints += rowWeight(row) * rowMean(OBSERVED, month, row);
			}
		}
		const cellMean = onCells / (4 * Math.PI) / MONTHS_PER_YEAR;
		expect(cellMean).toBeCloseTo(onPoints / MONTHS_PER_YEAR, 0);
	});

	it('takes all twelve months onto the finest grid well within a second', () => {
		// The grid itself is built on first use, which is not regridding.
		getGrid(256);
		const started = performance.now();
		const fields = observedTemperature(OBSERVED, 256);
		const elapsed = performance.now() - started;
		expect(fields).toHaveLength(MONTHS_PER_YEAR);
		// About 100 ms uninstrumented; the bound leaves room for coverage.
		expect(elapsed).toBeLessThan(1000);
	});

	it('refuses an unsupported resolution or data of the wrong shape', () => {
		expect(() => observedTemperature(OBSERVED, 100)).toThrow(RangeError);
		expect(() =>
			observedTemperature(
				{ months: [...OBSERVED.months.slice(1), new Float32Array(3)] },
				64,
			),
		).toThrow(RangeError);
	});
});
