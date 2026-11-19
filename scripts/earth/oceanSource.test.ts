import { describe, expect, it } from 'vitest';
import { type NetcdfFile, readNetcdf3 } from './netcdf';
import {
	DRIFTER_GRID,
	drifterMonths,
	drifterStored,
	LAND_SEA_MASK_SOURCE,
	observedSeaCelsius,
	SEA_TEMPERATURE_SOURCE,
	seaTemperatureStored,
} from './oceanSource';
import type { FineGrid } from './regrid';
import {
	type BuiltAttribute,
	type BuiltVariable,
	buildNetcdf3,
} from './testing/netcdfBuilder';

const MONTHS = 12;
const ROWS = 180;
const COLUMNS = 360;

const read = (bytes: Uint8Array): NetcdfFile => {
	const result = readNetcdf3(bytes);
	if (!result.ok) {
		throw new Error(`${result.error}: ${result.detail}`);
	}
	return result.file;
};

const NORTH_FIRST = Array.from({ length: ROWS }, (_, row) => 89.5 - row);
const EAST_FROM_HALF = Array.from(
	{ length: COLUMNS },
	(_, column) => column + 0.5,
);
const MISSING = -9.969_209_968_386_869e36;

/** A temperature that says where it is: the month, row and column. */
const marker = (month: number, row: number, column: number): number =>
	month + row / 1000 + column / 1_000_000;

type SeaOptions = {
	/** How many times the file has; twelve if not given. */
	readonly months?: number;
	readonly latitudes?: readonly number[];
	readonly longitudes?: readonly number[];
	readonly times?: readonly number[];
	readonly units?: BuiltAttribute;
	readonly dimensions?: readonly string[];
	readonly edit?: (values: number[]) => void;
};

/** A file shaped as NOAA's sea-surface temperature subset is. */
const seaFile = (options: SeaOptions = {}): NetcdfFile => {
	const count = options.months ?? MONTHS;
	const values: number[] = [];
	for (let month = 0; month < count; month++) {
		for (let row = 0; row < ROWS; row++) {
			for (let column = 0; column < COLUMNS; column++) {
				values.push(marker(month, row, column));
			}
		}
	}
	options.edit?.(values);
	return read(
		buildNetcdf3({
			dimensions: { time: count, lat: ROWS, lon: COLUMNS },
			variables: [
				{
					name: 'lon',
					type: 'float',
					dimensions: ['lon'],
					values: options.longitudes ?? EAST_FROM_HALF,
				},
				{
					name: 'time',
					type: 'double',
					dimensions: ['time'],
					values:
						options.times ??
						Array.from({ length: count }, (_, month) => month * 31),
				},
				{
					name: 'lat',
					type: 'float',
					dimensions: ['lat'],
					values: options.latitudes ?? NORTH_FIRST,
				},
				{
					name: 'sst',
					type: 'float',
					dimensions: options.dimensions ?? ['time', 'lat', 'lon'],
					attributes: {
						units: options.units ?? 'degC',
						missing_value: { type: 'float', value: [MISSING] },
					},
					values,
				},
			],
		}),
	);
};

type MaskOptions = {
	readonly latitudes?: readonly number[];
	readonly longitudes?: readonly number[];
	/** How many times the mask has; one if not given. */
	readonly times?: number;
	readonly edit?: (values: number[]) => void;
};

/** A land-sea mask: land in the first hundred columns, sea elsewhere. */
const maskFile = (options: MaskOptions = {}): NetcdfFile => {
	const times = options.times ?? 1;
	const values: number[] = [];
	for (let time = 0; time < times; time++) {
		for (let row = 0; row < ROWS; row++) {
			for (let column = 0; column < COLUMNS; column++) {
				values.push(column < 100 ? 0 : 1);
			}
		}
	}
	options.edit?.(values);
	return read(
		buildNetcdf3({
			dimensions: { time: times, lat: ROWS, lon: COLUMNS },
			variables: [
				{
					name: 'lat',
					type: 'float',
					dimensions: ['lat'],
					values: options.latitudes ?? NORTH_FIRST,
				},
				{
					name: 'lon',
					type: 'float',
					dimensions: ['lon'],
					values: options.longitudes ?? EAST_FROM_HALF,
				},
				{
					name: 'mask',
					type: 'short',
					dimensions: ['time', 'lat', 'lon'],
					attributes: { missing_value: { type: 'short', value: [32_766] } },
					values,
				},
			],
		}),
	);
};

describe('the sea temperature sources', () => {
	it('name the subset NOAA cuts, as netCDF-3 of every month, and the pinned mask', () => {
		expect(SEA_TEMPERATURE_SOURCE.url).toContain('var=sst');
		expect(SEA_TEMPERATURE_SOURCE.url).toContain('temporal=all');
		expect(SEA_TEMPERATURE_SOURCE.url).toContain('accept=netcdf3');
		expect(LAND_SEA_MASK_SOURCE.bytes).toBe(133_700);
		expect(LAND_SEA_MASK_SOURCE.sha256).toMatch(/^[0-9a-f]{64}$/);
	});
});

describe('observedSeaCelsius', () => {
	it('lays out twelve months from the north, with land, where the mask says so, as NaN', () => {
		const months = observedSeaCelsius(seaFile(), maskFile());
		expect(months).toHaveLength(MONTHS);
		const at = (month: number, row: number, column: number): number =>
			(months[month] as Float64Array)[row * COLUMNS + column] as number;
		expect(months[0]).toHaveLength(ROWS * COLUMNS);
		expect(at(5, 20, 150)).toBeCloseTo(marker(5, 20, 150), 5);
		expect(at(11, 179, 359)).toBeCloseTo(marker(11, 179, 359), 5);
		expect(at(5, 20, 99)).toBeNaN();
		expect(at(5, 20, 0)).toBeNaN();
		expect(at(5, 20, 100)).toBeCloseTo(marker(5, 20, 100), 5);
	});

	it('gives the stored values for checking against the pinned checksum', () => {
		const stored = seaTemperatureStored(seaFile());
		expect(stored).toHaveLength(MONTHS * ROWS * COLUMNS);
		expect(stored[COLUMNS + 2]).toBeCloseTo(marker(0, 1, 2), 5);
		expect(() =>
			seaTemperatureStored(
				read(buildNetcdf3({ dimensions: {}, variables: [] })),
			),
		).toThrow('The file has no variable sst');
	});

	it('refuses a file laid out otherwise, naming what is wrong', () => {
		// Only the rows that are about the twelve times need twelve months of
		// values; the others are made with one, to keep the file small, and
		// are refused for their shape as well as for what they are about.
		const wrongs: [string, () => NetcdfFile, string][] = [
			[
				'south-first latitudes',
				() => seaFile({ latitudes: [...NORTH_FIRST].reverse(), months: 1 }),
				"temperature file's latitudes are not 89.5 to -89.5",
			],
			[
				'longitudes from 0',
				() =>
					seaFile({
						longitudes: EAST_FROM_HALF.map((longitude) => longitude - 0.5),
						months: 1,
					}),
				"temperature file's longitudes are not 0.5 to 359.5",
			],
			[
				'times out of order',
				() =>
					seaFile({
						times: Array.from({ length: MONTHS }, (_, month) => -month),
					}),
				'its times are not 12 in order',
			],
			['kelvin', () => seaFile({ units: 'K', months: 1 }), 'expected "degC"'],
			[
				'two times',
				() => seaFile({ months: 2 }),
				'its times are not 12 in order',
			],
			[
				'dimensions in another order',
				() => seaFile({ dimensions: ['time', 'lon', 'lat'], months: 1 }),
				'sst is not time, lat, lon of 12 × 180 × 360',
			],
		];
		for (const [name, make, message] of wrongs) {
			expect(() => observedSeaCelsius(make(), maskFile()), name).toThrow(
				message,
			);
		}
		const wrongMasks: [string, NetcdfFile, string][] = [
			[
				'south-first latitudes',
				maskFile({ latitudes: [...NORTH_FIRST].reverse() }),
				"The mask's latitudes are not 89.5 to -89.5",
			],
			[
				'longitudes from 0',
				maskFile({
					longitudes: EAST_FROM_HALF.map((longitude) => longitude - 0.5),
				}),
				"The mask's longitudes are not 0.5 to 359.5",
			],
			[
				'two times',
				maskFile({ times: 2 }),
				'the mask is not time, lat, lon of 1 × 180 × 360',
			],
		];
		for (const [name, mask, message] of wrongMasks) {
			expect(() => observedSeaCelsius(seaFile(), mask), name).toThrow(message);
		}
	}, 60_000);

	it('refuses a mask that holds anything but 0 and 1', () => {
		expect(() =>
			observedSeaCelsius(
				seaFile(),
				maskFile({
					edit: (values) => {
						values[5] = 2;
					},
				}),
			),
		).toThrow('The land-sea mask holds something other than 0 and 1');
		expect(() =>
			observedSeaCelsius(
				seaFile(),
				maskFile({
					edit: (values) => {
						values[5] = 32_766;
					},
				}),
			),
		).toThrow('The land-sea mask holds something other than 0 and 1');
	});

	it('refuses a sea cell that has no temperature', () => {
		const gap = seaFile({
			edit: (values) => {
				values[3 * ROWS * COLUMNS + 7 * COLUMNS + 150] = MISSING;
			},
		});
		expect(() => observedSeaCelsius(gap, maskFile())).toThrow(
			'The sea at row 7, column 150 has no temperature in month 4',
		);
	});

	it('does not mind a missing temperature on land, which is not read', () => {
		const gap = seaFile({
			edit: (values) => {
				values[7 * COLUMNS + 5] = MISSING;
			},
		});
		const months = observedSeaCelsius(gap, maskFile());
		expect((months[0] as Float64Array)[7 * COLUMNS + 5]).toBeNaN();
	});
});

/** A small grid shaped like the drifters', one cell to a degree. */
const SMALL: FineGrid = {
	perDegree: 1,
	columns: 360,
	rows: 3,
	firstLongitudeDeg: -179.5,
	firstLatitudeDeg: 10.5,
};

type DrifterOptions = {
	readonly latitudes?: readonly number[];
	readonly longitudes?: readonly number[];
	readonly months?: readonly number[];
	readonly units?: BuiltAttribute;
	readonly dimensions?: readonly string[];
};

/** A file shaped as AOML's ERDDAP subset is, on {@link SMALL}. */
const drifterFile = (options: DrifterOptions = {}): NetcdfFile => {
	const values: number[] = [];
	for (let month = 0; month < MONTHS; month++) {
		for (let column = 0; column < SMALL.columns; column++) {
			for (let row = 0; row < SMALL.rows; row++) {
				values.push(
					month === 3 && column === 10
						? Number.NaN
						: month * 10_000 + column * 10 + row,
				);
			}
		}
	}
	const coordinate = (
		name: string,
		count: number,
		first: number,
	): BuiltVariable => ({
		name,
		type: 'double',
		dimensions: [name],
		values: Array.from({ length: count }, (_, index) => first + index),
	});
	return read(
		buildNetcdf3({
			dimensions: {
				ClimatologicalMonth: MONTHS,
				longitude: SMALL.columns,
				latitude: SMALL.rows,
			},
			variables: [
				{
					name: 'ClimatologicalMonth',
					type: 'int',
					dimensions: ['ClimatologicalMonth'],
					values:
						options.months ??
						Array.from({ length: MONTHS }, (_, month) => month),
				},
				options.longitudes === undefined
					? coordinate('longitude', SMALL.columns, SMALL.firstLongitudeDeg)
					: {
							name: 'longitude',
							type: 'double',
							dimensions: ['longitude'],
							values: options.longitudes,
						},
				options.latitudes === undefined
					? coordinate('latitude', SMALL.rows, SMALL.firstLatitudeDeg)
					: {
							name: 'latitude',
							type: 'double',
							dimensions: ['latitude'],
							values: options.latitudes,
						},
				{
					name: 'U',
					type: 'double',
					dimensions: options.dimensions ?? [
						'ClimatologicalMonth',
						'longitude',
						'latitude',
					],
					attributes: { units: options.units ?? 'meters per second' },
					values,
				},
			],
		}),
	);
};

describe('drifterMonths', () => {
	it('gives twelve months in the source layout, with NaN where there is no data', () => {
		const months = drifterMonths(drifterFile(), 'U', SMALL);
		expect(months).toHaveLength(MONTHS);
		expect(months[0]).toHaveLength(SMALL.columns * SMALL.rows);
		expect(months[2]?.[7 * SMALL.rows + 1]).toBe(20_071);
		expect(months[3]?.[10 * SMALL.rows + 1]).toBeNaN();
		expect(months[3]?.[11 * SMALL.rows + 1]).toBe(30_111);
	});

	it('gives the stored values for checking against the pinned checksum', () => {
		expect(drifterStored(drifterFile(), 'U')).toHaveLength(
			MONTHS * SMALL.columns * SMALL.rows,
		);
		expect(() => drifterStored(drifterFile(), 'V')).toThrow(
			'The file has no variable V',
		);
	});

	it('is on the quarter-degree grid of the drifters by default', () => {
		expect(DRIFTER_GRID).toEqual({
			perDegree: 4,
			columns: 1440,
			rows: 632,
			firstLongitudeDeg: -179.875,
			firstLatitudeDeg: -72.875,
		});
		expect(() => drifterMonths(drifterFile(), 'U')).toThrow(
			'its dimensions are not ClimatologicalMonth, longitude, latitude of 12 × 1440 × 632',
		);
	});

	it('refuses a file laid out otherwise, naming what is wrong', () => {
		const wrongs: [string, DrifterOptions, string][] = [
			[
				'dimensions in another order',
				{ dimensions: ['ClimatologicalMonth', 'latitude', 'longitude'] },
				'its dimensions are not',
			],
			[
				'months from 1',
				{ months: Array.from({ length: MONTHS }, (_, month) => month + 1) },
				'its months are not 0 to 11',
			],
			[
				'longitudes from 0',
				{
					longitudes: Array.from(
						{ length: SMALL.columns },
						(_, column) => column,
					),
				},
				'its longitudes are not 360 from -179.5° east, 1° apart',
			],
			[
				'latitudes from 10',
				{ latitudes: [10, 11, 12] },
				'its latitudes are not 3 from 10.5° north, 1° apart',
			],
			['other units', { units: 'cm/s' }, 'expected "meters per second"'],
		];
		for (const [name, options, message] of wrongs) {
			expect(
				() => drifterMonths(drifterFile(options), 'U', SMALL),
				name,
			).toThrow(message);
		}
	});
});
