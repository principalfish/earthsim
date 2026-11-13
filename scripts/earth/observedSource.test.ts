import { describe, expect, it } from 'vitest';
import { readNetcdf3 } from './netcdf';
import {
	OBSERVED_SOURCE,
	OBSERVED_VARIABLE,
	observedCelsius,
	rowsFromNorth,
} from './observedSource';
import {
	type BuiltAttribute,
	type BuiltVariable,
	buildNetcdf3,
} from './testing/netcdfBuilder';

const MONTHS = 12;
const ROWS = 181;
const COLUMNS = 360;

/** A temperature that says where it is: the month, latitude and longitude. */
const marker = (month: number, latitude: number, longitude: number): number =>
	month + latitude / 10 + longitude / 1000;

const SOUTH_FIRST = Array.from({ length: ROWS }, (_, row) => row - 90);

type Options = {
	readonly latitudes?: readonly number[];
	readonly longitudes?: readonly number[];
	readonly times?: readonly number[];
	/** The variable's units; `null` leaves the attribute out. */
	readonly units?: BuiltAttribute | null;
	readonly dimensions?: readonly string[];
	/** Changes the stored values after they are made. */
	readonly edit?: (values: number[]) => void;
};

/** A source file shaped as NOAA's is, with {@link marker} temperatures. */
const sourceFile = (options: Options = {}) => {
	const latitudes = options.latitudes ?? SOUTH_FIRST;
	const longitudes =
		options.longitudes ??
		Array.from({ length: COLUMNS }, (_, column) => column);
	const kelvin = options.units === 'degC' ? 0 : 273.15;
	const values: number[] = [];
	for (let month = 0; month < MONTHS; month++) {
		for (const latitude of latitudes) {
			for (const longitude of longitudes) {
				values.push(marker(month, latitude, longitude) + kelvin);
			}
		}
	}
	options.edit?.(values);
	const variables: BuiltVariable[] = [
		{ name: 'lat', type: 'float', dimensions: ['lat'], values: latitudes },
		{ name: 'lon', type: 'float', dimensions: ['lon'], values: longitudes },
		{
			name: 'time',
			type: 'double',
			dimensions: ['time'],
			values:
				options.times ??
				Array.from({ length: MONTHS }, (_, month) => month * 744),
		},
		{
			name: OBSERVED_VARIABLE,
			type: 'float',
			dimensions: options.dimensions ?? ['time', 'lat', 'lon'],
			attributes: {
				...(options.units === null ? {} : { units: options.units ?? 'degK' }),
				missing_value: { type: 'float', value: [-9.969_21e36] },
			},
			values,
		},
	];
	const result = readNetcdf3(
		buildNetcdf3({
			dimensions: { lon: longitudes.length, lat: latitudes.length, time: 12 },
			variables,
		}),
	);
	if (!result.ok) {
		throw new Error(result.detail);
	}
	return result.file;
};

const FILE = sourceFile();

describe('the source', () => {
	it('is NOAA’s 2 m air temperature climatology, pinned', () => {
		expect(OBSERVED_SOURCE).toEqual({
			url: 'https://downloads.psl.noaa.gov/Datasets/20thC_ReanV3/Derived/Monthlies/2mSI-MO/air.2m.mon.ltm.nc',
			name: 'air.2m.mon.ltm.nc',
			bytes: 4_699_840,
			sha256:
				'38ae70640e246a1e90c1a0bca5a7032bdb20a8431a107f30fd1823409b3a57db',
		});
		expect(OBSERVED_SOURCE.url.endsWith(`/${OBSERVED_SOURCE.name}`)).toBe(true);
	});
});

describe('rowsFromNorth', () => {
	it('finds each latitude from the north in either order', () => {
		const fromSouth = rowsFromNorth(SOUTH_FIRST);
		expect(fromSouth?.[0]).toBe(180);
		expect(fromSouth?.[180]).toBe(0);
		const fromNorth = rowsFromNorth([...SOUTH_FIRST].reverse());
		expect(fromNorth).toEqual(Array.from({ length: ROWS }, (_, row) => row));
	});

	it('refuses latitudes that are not each whole degree once', () => {
		expect(rowsFromNorth(SOUTH_FIRST.slice(1))).toBeNull();
		expect(rowsFromNorth(SOUTH_FIRST.map((latitude) => latitude + 0.5))).toBe(
			null,
		);
		expect(rowsFromNorth([...SOUTH_FIRST.slice(1), -89])).toBeNull();
	});
});

describe('observedCelsius', () => {
	it('gives Celsius from the north, each row from 0° east', () => {
		const months = observedCelsius(FILE);
		expect(months).toHaveLength(MONTHS);
		for (const [month, row, column] of [
			[0, 0, 0],
			[0, 180, 359],
			[6, 90, 180],
			[11, 23, 7],
		] as const) {
			expect(months[month]?.[row * COLUMNS + column]).toBeCloseTo(
				marker(month, 90 - row, column),
				3,
			);
		}
	});

	it('reads a file whose rows run from the north the same way', () => {
		const north = observedCelsius(
			sourceFile({ latitudes: [...SOUTH_FIRST].reverse() }),
		);
		expect(north).toEqual(observedCelsius(FILE));
	});

	it('takes values already in Celsius as they are', () => {
		const months = observedCelsius(sourceFile({ units: 'degC' }));
		expect(months[3]?.[10 * COLUMNS + 20]).toBeCloseTo(marker(3, 80, 20), 4);
	});

	it('names everything about the layout that is not as expected', () => {
		expect(() =>
			observedCelsius(
				sourceFile({
					latitudes: SOUTH_FIRST.map((latitude) => latitude * 0.5),
					longitudes: Array.from(
						{ length: COLUMNS },
						(_, column) => column - 180,
					),
					times: Array.from({ length: MONTHS }, (_, month) => -month),
					units: 'degF',
				}),
			),
		).toThrow(
			'Variable air is not laid out as expected: its latitudes are not each whole degree from -90 to 90 once; its longitudes are not 0 to 359 in order; its times are not 12 in order; its units are "degF", expected kelvin or degrees Celsius',
		);
	});

	it('refuses dimensions in another order', () => {
		expect(() =>
			observedCelsius(sourceFile({ dimensions: ['time', 'lon', 'lat'] })),
		).toThrow(
			'its dimensions are time 12, lon 360, lat 181, expected time, lat, lon of 12 × 181 × 360',
		);
	});

	it('refuses units given as a number, or none', () => {
		expect(() =>
			observedCelsius(sourceFile({ units: { type: 'float', value: [1] } })),
		).toThrow('its units are [1]');
		expect(() => observedCelsius(sourceFile({ units: null }))).toThrow(
			'its units are missing',
		);
	});

	it('refuses a missing value rather than storing it', () => {
		expect(() =>
			observedCelsius(
				sourceFile({
					edit: (values) => {
						values[COLUMNS * ROWS * 2 + 5] = -9.969_21e36;
					},
				}),
			),
		).toThrow('The value for month 3 at -90°, 5° is missing');
	});

	it('refuses a file without the variable', () => {
		expect(() =>
			observedCelsius({ ...FILE, variables: FILE.variables.slice(0, 3) }),
		).toThrow('The file has no variable air');
	});
});
