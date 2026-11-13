import { describe, expect, it } from 'vitest';
import {
	findVariable,
	type NetcdfFile,
	type NetcdfVariable,
	readNetcdf3,
	unpackVariable,
} from './netcdf';
import { type BuiltFile, buildNetcdf3 } from './testing/netcdfBuilder';

/** Bytes from hexadecimal, with any spaces between them ignored. */
const hex = (text: string): Uint8Array => {
	const digits = text.replace(/\s+/g, '');
	return Uint8Array.from(digits.match(/../g) ?? [], (pair) =>
		Number.parseInt(pair, 16),
	);
};

const read = (bytes: Uint8Array): NetcdfFile => {
	const result = readNetcdf3(bytes);
	if (!result.ok) {
		throw new Error(`${result.error}: ${result.detail}`);
	}
	return result.file;
};

const variable = (file: NetcdfFile, name: string): NetcdfVariable => {
	const found = findVariable(file, name);
	if (found === undefined) {
		throw new Error(`No variable ${name}`);
	}
	return found;
};

/**
 * A small file shaped like a monthly climatology: two times of three
 * latitudes by four longitudes, packed as shorts with a scale factor and an
 * offset, with one fill value and one missing value among them.
 */
const CLIMATOLOGY: BuiltFile = {
	dimensions: { time: 2, lat: 3, lon: 4 },
	attributes: {
		title: 'A test climatology',
		spatial_resolution: { type: 'double', value: [1.5] },
	},
	variables: [
		{
			name: 'lat',
			type: 'float',
			dimensions: ['lat'],
			attributes: { units: 'degrees_north' },
			values: [90, 0, -90],
		},
		{
			name: 'lon',
			type: 'float',
			dimensions: ['lon'],
			values: [0, 90, 180, 270],
		},
		{
			name: 'air',
			type: 'short',
			dimensions: ['time', 'lat', 'lon'],
			attributes: {
				units: 'degK',
				scale_factor: { type: 'float', value: [0.01] },
				add_offset: { type: 'float', value: [273.15] },
				_FillValue: { type: 'short', value: [32_767] },
				missing_value: { type: 'short', value: [-32_000] },
			},
			values: [
				0, 100, -100, 2000, 32_767, -32_000, 1, -1, 500, 600, 700, 800, 1, 2, 3,
				4, 5, 6, 7, 8, 9, 10, 11, 12,
			],
		},
	],
};

describe('readNetcdf3', () => {
	it('reads a file written byte by byte from the format', () => {
		const file = read(
			hex(`
				43444601 00000000
				0000000a 00000001 00000001 78000000 00000002
				0000000c 00000001 00000001 61000000 00000002 00000002 68690000
				0000000b 00000001 00000001 76000000 00000001 00000000
				00000000 00000000 00000003 00000004 00000064
				0001 fffe
			`),
		);
		expect(file.version).toBe(1);
		expect(file.recordCount).toBe(0);
		expect(file.dimensions).toEqual([
			{ name: 'x', length: 2, isRecord: false },
		]);
		expect(file.attributes.get('a')).toEqual({ type: 'char', value: 'hi' });
		const v = variable(file, 'v');
		expect(v.type).toBe('short');
		expect(v.dimensions).toEqual(['x']);
		expect(v.shape).toEqual([2]);
		expect([...v.values]).toEqual([1, -2]);
	});

	it('reads dimensions, attributes and every variable with its data', () => {
		const file = read(buildNetcdf3(CLIMATOLOGY));
		expect(file.dimensions.map(({ name, length }) => [name, length])).toEqual([
			['time', 2],
			['lat', 3],
			['lon', 4],
		]);
		expect(file.attributes.get('title')).toEqual({
			type: 'char',
			value: 'A test climatology',
		});
		expect(file.attributes.get('spatial_resolution')).toEqual({
			type: 'double',
			value: [1.5],
		});
		expect(file.variables.map(({ name }) => name)).toEqual([
			'lat',
			'lon',
			'air',
		]);
		const lat = variable(file, 'lat');
		expect(lat.values).toBeInstanceOf(Float32Array);
		expect([...lat.values]).toEqual([90, 0, -90]);
		expect(lat.attributes.get('units')).toEqual({
			type: 'char',
			value: 'degrees_north',
		});
		const air = variable(file, 'air');
		expect(air.dimensions).toEqual(['time', 'lat', 'lon']);
		expect(air.shape).toEqual([2, 3, 4]);
		expect(air.values).toBeInstanceOf(Int16Array);
		expect([...air.values]).toEqual(
			CLIMATOLOGY.variables[2]?.values as number[],
		);
		expect(air.attributes.get('scale_factor')).toEqual({
			type: 'float',
			value: [Math.fround(0.01)],
		});
	});

	it('reads the format with 64-bit offsets the same way', () => {
		const classic = read(buildNetcdf3(CLIMATOLOGY));
		const wide = read(buildNetcdf3({ ...CLIMATOLOGY, version: 2 }));
		expect(wide.version).toBe(2);
		expect(wide.variables).toEqual(classic.variables);
	});

	it('reads record variables interleaved, padded to four bytes', () => {
		const file = read(
			buildNetcdf3({
				dimensions: { time: 0, x: 3 },
				recordCount: 3,
				variables: [
					{ name: 'fixed', type: 'int', dimensions: ['x'], values: [7, 8, 9] },
					{
						name: 'bytes',
						type: 'byte',
						dimensions: ['time', 'x'],
						values: [1, 2, 3, 4, 5, 6, 7, 8, -9],
					},
					{
						name: 'time',
						type: 'double',
						dimensions: ['time'],
						values: [0.5, 1.5, 2.5],
					},
				],
			}),
		);
		expect(file.recordCount).toBe(3);
		expect(file.dimensions[0]).toEqual({
			name: 'time',
			length: 3,
			isRecord: true,
		});
		expect(variable(file, 'bytes').shape).toEqual([3, 3]);
		expect([...variable(file, 'bytes').values]).toEqual([
			1, 2, 3, 4, 5, 6, 7, 8, -9,
		]);
		expect([...variable(file, 'time').values]).toEqual([0.5, 1.5, 2.5]);
		expect([...variable(file, 'fixed').values]).toEqual([7, 8, 9]);
	});

	it('reads the records of a lone record variable with no padding', () => {
		const file = read(
			buildNetcdf3({
				dimensions: { time: 0, x: 3 },
				recordCount: 2,
				variables: [
					{
						name: 'text',
						type: 'char',
						dimensions: ['time', 'x'],
						values: [97, 98, 99, 100, 101, 102],
					},
				],
			}),
		);
		expect([...variable(file, 'text').values]).toEqual([
			97, 98, 99, 100, 101, 102,
		]);
	});

	it('counts the records of a file streamed without their number', () => {
		const bytes = buildNetcdf3({
			dimensions: { time: 0 },
			recordCount: 4,
			variables: [
				{
					name: 'time',
					type: 'int',
					dimensions: ['time'],
					values: [1, 2, 3, 4],
				},
			],
		});
		bytes.set([0xff, 0xff, 0xff, 0xff], 4);
		const file = read(bytes);
		expect(file.recordCount).toBe(4);
		expect([...variable(file, 'time').values]).toEqual([1, 2, 3, 4]);
	});

	it('reads a file with no records yet, streamed or not', () => {
		// The second record variable starts inside the first record, which is
		// past the end of a file that has none.
		const bytes = buildNetcdf3({
			dimensions: { time: 0, x: 2 },
			recordCount: 0,
			variables: [
				{ name: 'fixed', type: 'int', dimensions: ['x'], values: [7, 8] },
				{ name: 'time', type: 'double', dimensions: ['time'], values: [] },
				{ name: 'v', type: 'short', dimensions: ['time', 'x'], values: [] },
			],
		});
		const streamed = Uint8Array.from(bytes);
		streamed.set([0xff, 0xff, 0xff, 0xff], 4);
		for (const file of [read(bytes), read(streamed)]) {
			expect(file.recordCount).toBe(0);
			expect(variable(file, 'v').shape).toEqual([0, 2]);
			expect([...variable(file, 'v').values]).toEqual([]);
			expect([...variable(file, 'time').values]).toEqual([]);
			expect([...variable(file, 'fixed').values]).toEqual([7, 8]);
		}
	});

	it('counts the records of a streamed file with very many record variables', () => {
		// Enough variables that spreading their offsets into one call would
		// overflow the stack. Each is one byte a record, padded to four.
		const count = 200_000;
		const headerBytes = 44 + 36 * count;
		const bytes = new Uint8Array(headerBytes + 4 * count);
		const view = new DataView(bytes.buffer);
		bytes.set([0x43, 0x44, 0x46, 0x01], 0);
		view.setUint32(4, 0xff_ff_ff_ff);
		view.setUint32(8, 0x0a);
		view.setUint32(12, 1);
		view.setUint32(16, 4);
		bytes.set([0x74, 0x69, 0x6d, 0x65], 20);
		view.setUint32(28, 0);
		view.setUint32(36, 0x0b);
		view.setUint32(40, count);
		for (let index = 0; index < count; index++) {
			const at = 44 + 36 * index;
			view.setUint32(at, 1);
			bytes[at + 4] = 0x76;
			view.setUint32(at + 8, 1);
			view.setUint32(at + 12, 0);
			view.setUint32(at + 24, 1);
			view.setUint32(at + 28, 4);
			view.setUint32(at + 32, headerBytes + 4 * index);
			bytes[headerBytes + 4 * index] = index % 100;
		}
		const file = read(bytes);
		expect(file.recordCount).toBe(1);
		expect(file.variables).toHaveLength(count);
		expect([...(file.variables[count - 1]?.values ?? [])]).toEqual([
			(count - 1) % 100,
		]);
	});

	it('reads a file with no dimensions, attributes or variables', () => {
		const file = read(buildNetcdf3({ dimensions: {}, variables: [] }));
		expect(file.dimensions).toEqual([]);
		expect(file.attributes.size).toBe(0);
		expect(file.variables).toEqual([]);
	});

	it('refuses a file cut short anywhere, without throwing', () => {
		const bytes = buildNetcdf3(CLIMATOLOGY);
		for (let length = 0; length < bytes.length; length++) {
			const result = readNetcdf3(bytes.subarray(0, length));
			expect(result.ok, `cut to ${length} bytes`).toBe(false);
			if (!result.ok) {
				expect(result.error, `cut to ${length} bytes`).toBe(
					length < 3 ? 'bad-magic' : 'truncated',
				);
				expect(result.detail).not.toBe('');
			}
		}
		expect(readNetcdf3(bytes).ok).toBe(true);
	});

	it('refuses a file that is not netCDF-3 by its magic number', () => {
		const bytes = buildNetcdf3(CLIMATOLOGY);
		const hdf5 = Uint8Array.from(bytes);
		hdf5.set([0x89, 0x48, 0x44, 0x46], 0);
		expect(readNetcdf3(hdf5)).toMatchObject({ ok: false, error: 'bad-magic' });
		expect(readNetcdf3(new Uint8Array(64))).toMatchObject({
			ok: false,
			error: 'bad-magic',
		});
		const cdf5 = Uint8Array.from(bytes);
		cdf5[3] = 5;
		expect(readNetcdf3(cdf5)).toMatchObject({
			ok: false,
			error: 'unsupported-version',
		});
	});

	it('refuses a header that is not well formed', () => {
		const base = buildNetcdf3({
			dimensions: { x: 2 },
			variables: [
				{ name: 'v', type: 'short', dimensions: ['x'], values: [1, 2] },
			],
		});
		const view = (bytes: Uint8Array): DataView => new DataView(bytes.buffer);
		// Byte 8 holds the tag of the list of dimensions.
		const badTag = Uint8Array.from(base);
		view(badTag).setUint32(8, 0x0b);
		expect(readNetcdf3(badTag)).toMatchObject({ error: 'bad-header' });
		// The variable's dimension id follows its name and rank.
		const variableAt = 28 + 8;
		const badDimension = Uint8Array.from(base);
		view(badDimension).setUint32(variableAt + 8 + 8 + 4, 5);
		expect(readNetcdf3(badDimension)).toMatchObject({ error: 'bad-header' });
		const badType = Uint8Array.from(base);
		view(badType).setUint32(variableAt + 8 + 8 + 4 + 4 + 8, 9);
		expect(readNetcdf3(badType)).toMatchObject({ error: 'bad-header' });
		expect(readNetcdf3(base).ok).toBe(true);
	});

	it('refuses a record dimension that is not a variable’s first', () => {
		const result = readNetcdf3(
			buildNetcdf3({
				dimensions: { x: 2, time: 0 },
				recordCount: 1,
				variables: [
					{
						name: 'v',
						type: 'short',
						dimensions: ['x', 'time'],
						values: [1, 2],
					},
				],
			}),
		);
		expect(result).toMatchObject({ ok: false, error: 'bad-header' });
	});

	it('refuses data said to lie past the end of the file', () => {
		const bytes = buildNetcdf3({
			dimensions: { x: 2 },
			variables: [
				{ name: 'v', type: 'short', dimensions: ['x'], values: [1, 2] },
			],
		});
		// The last four bytes of the header say where the data begins.
		new DataView(bytes.buffer).setUint32(bytes.length - 8, 1000);
		expect(readNetcdf3(bytes)).toMatchObject({ error: 'truncated' });
	});

	it('refuses variables whose data share bytes, before copying them', () => {
		const values = Array.from({ length: 100 }, (_, index) => index);
		const bytes = buildNetcdf3({
			dimensions: { x: 100 },
			variables: [
				{ name: 'a', type: 'double', dimensions: ['x'], values },
				{ name: 'b', type: 'double', dimensions: ['x'], values },
			],
		});
		expect(readNetcdf3(bytes).ok).toBe(true);
		// The header ends with where b's data begins; a's begins right after.
		// Each variable on its own fits in what is left of the file once b's
		// data is cut off, but the two together do not.
		const headerBytes = bytes.length - 2 * 800;
		new DataView(bytes.buffer).setUint32(headerBytes - 4, headerBytes);
		const shared = bytes.subarray(0, headerBytes + 800);
		expect(readNetcdf3(shared)).toMatchObject({
			ok: false,
			error: 'bad-header',
		});
	});

	it('refuses counts too large for the file before making room for them', () => {
		const bytes = buildNetcdf3({ dimensions: { x: 2 }, variables: [] });
		new DataView(bytes.buffer).setUint32(12, 0x7f_ff_ff_ff);
		expect(readNetcdf3(bytes)).toMatchObject({ error: 'truncated' });
		new DataView(bytes.buffer).setUint32(12, 0x8f_ff_ff_ff);
		expect(readNetcdf3(bytes)).toMatchObject({ error: 'bad-header' });
	});
});

describe('unpackVariable', () => {
	it('applies the scale factor and offset, with missing values as NaN', () => {
		const air = variable(read(buildNetcdf3(CLIMATOLOGY)), 'air');
		const values = unpackVariable(air);
		const scale = Math.fround(0.01);
		const offset = Math.fround(273.15);
		expect(values[0]).toBe(offset);
		expect(values[1]).toBe(100 * scale + offset);
		expect(values[2]).toBe(-100 * scale + offset);
		expect(values[3]).toBeCloseTo(293.15, 4);
		expect(values[4]).toBeNaN();
		expect(values[5]).toBeNaN();
		expect(values[6]).toBeCloseTo(273.16, 4);
		expect(values).toHaveLength(24);
		expect(values.filter(Number.isNaN)).toHaveLength(2);
	});

	it('leaves values with no packing as they are', () => {
		const lat = variable(read(buildNetcdf3(CLIMATOLOGY)), 'lat');
		expect([...unpackVariable(lat)]).toEqual([90, 0, -90]);
	});

	it('takes the default fill of the type when the variable names none', () => {
		const fill = 9.969_209_968_386_869e36;
		const file = read(
			buildNetcdf3({
				dimensions: { x: 3 },
				variables: [
					{ name: 'f', type: 'float', dimensions: ['x'], values: [1, fill, 2] },
					{
						name: 'd',
						type: 'double',
						dimensions: ['x'],
						values: [1, fill, 2],
					},
					{ name: 'b', type: 'byte', dimensions: ['x'], values: [1, -127, 2] },
				],
			}),
		);
		expect([...unpackVariable(variable(file, 'f'))]).toEqual([
			1,
			Number.NaN,
			2,
		]);
		expect([...unpackVariable(variable(file, 'd'))]).toEqual([
			1,
			Number.NaN,
			2,
		]);
		expect([...unpackVariable(variable(file, 'b'))]).toEqual([1, -127, 2]);
	});
});
