/**
 * A reader for netCDF-3 files: the classic format (CDF-1) and the format
 * with 64-bit offsets (CDF-2), which differs from it only in the width of
 * the offsets where each variable's data begins.
 *
 * Nothing here touches a file: the whole file is handed in as bytes. What
 * the header declares is checked against the length of the file before it
 * is used, and a file that is not netCDF-3, or is cut short or damaged, is
 * refused with a reason rather than read wrongly; nothing in here throws.
 *
 * A netCDF-3 file is big-endian. It starts with `CDF` and a version byte,
 * then the number of records, then three lists: the dimensions, the global
 * attributes and the variables. Each list is a tag and a count, or eight
 * zero bytes when it is empty. A name is a length and that many bytes of
 * UTF-8, and every name, attribute value and variable's data is padded to a
 * multiple of four bytes. A variable gives its dimensions, its attributes,
 * its type, its size and where its data begins. A variable whose first
 * dimension is the record dimension, of length 0 in the header, is stored
 * one record at a time, interleaved with the other record variables; the
 * rest are stored whole.
 */

/** The types of value a netCDF-3 file can hold. */
export type NetcdfType = 'byte' | 'char' | 'short' | 'int' | 'float' | 'double';

/** The values of a variable, in the array that fits its type. */
export type NetcdfValues =
	| Int8Array<ArrayBuffer>
	| Uint8Array<ArrayBuffer>
	| Int16Array<ArrayBuffer>
	| Int32Array<ArrayBuffer>
	| Float32Array<ArrayBuffer>
	| Float64Array<ArrayBuffer>;

/** A dimension: a name and a length. */
export type NetcdfDimension = {
	readonly name: string;
	/**
	 * Its length; for the record dimension, the number of records in the
	 * file.
	 */
	readonly length: number;
	/** Whether it is the record dimension, which the file can grow along. */
	readonly isRecord: boolean;
};

/** An attribute's value: text for `char`, numbers for every other type. */
export type NetcdfAttribute =
	| { readonly type: 'char'; readonly value: string }
	| {
			readonly type: Exclude<NetcdfType, 'char'>;
			readonly value: readonly number[];
	  };

/** Attributes by name, in the order the file gives them. */
export type NetcdfAttributes = ReadonlyMap<string, NetcdfAttribute>;

/** A variable and its data, as stored. */
export type NetcdfVariable = {
	readonly name: string;
	readonly type: NetcdfType;
	/** The names of its dimensions, slowest-varying first. */
	readonly dimensions: readonly string[];
	/** The length along each of its dimensions, in the same order. */
	readonly shape: readonly number[];
	readonly attributes: NetcdfAttributes;
	/**
	 * Every value as stored, before any scale factor, offset or fill is
	 * applied, with the last dimension varying fastest.
	 */
	readonly values: NetcdfValues;
};

/** What a netCDF-3 file holds. */
export type NetcdfFile = {
	/** 1 for the classic format, 2 for the one with 64-bit offsets. */
	readonly version: 1 | 2;
	/** The number of records along the record dimension, if there is one. */
	readonly recordCount: number;
	readonly dimensions: readonly NetcdfDimension[];
	readonly attributes: NetcdfAttributes;
	readonly variables: readonly NetcdfVariable[];
};

/**
 * Why bytes could not be read as a netCDF-3 file.
 *
 * - `bad-magic`: they do not start with `CDF`.
 * - `unsupported-version`: they start with `CDF` and a version other than
 *   1 or 2, such as the 64-bit data format, version 5.
 * - `truncated`: the header, or the data it says is there, runs past the
 *   end of the bytes.
 * - `bad-header`: the header is not well formed, such as a list with an
 *   unknown tag, an unknown type, a variable that names a dimension that is
 *   not there, a record dimension that is not a variable's first, or
 *   variables whose data overlap so that together they would not fit in the
 *   file.
 */
export type NetcdfError =
	| 'bad-magic'
	| 'unsupported-version'
	| 'truncated'
	| 'bad-header';

/** What reading bytes as a netCDF-3 file gives: the file, or why not. */
export type NetcdfResult =
	| { readonly ok: true; readonly file: NetcdfFile }
	| {
			readonly ok: false;
			readonly error: NetcdfError;
			/** A sentence that says what was wrong, for a person to read. */
			readonly detail: string;
	  };

const TAG_DIMENSION = 0x0a;
const TAG_VARIABLE = 0x0b;
const TAG_ATTRIBUTE = 0x0c;

/** The number of records written where it is not known: a streamed file. */
const STREAMING_RECORDS = 0xff_ff_ff_ff;

/** The types by their codes in the file. */
const TYPE_CODES: Readonly<Record<number, NetcdfType>> = {
	1: 'byte',
	2: 'char',
	3: 'short',
	4: 'int',
	5: 'float',
	6: 'double',
};

/** The bytes one value of each type takes. */
const TYPE_BYTES: Readonly<Record<NetcdfType, number>> = {
	byte: 1,
	char: 1,
	short: 2,
	int: 4,
	float: 4,
	double: 8,
};

/**
 * The value written where nothing was, for a variable with no `_FillValue`
 * of its own. Bytes have none, since every byte value is commonly data.
 */
const DEFAULT_FILL: Readonly<Partial<Record<NetcdfType, number>>> = {
	short: -32_767,
	int: -2_147_483_647,
	float: Math.fround(9.969_209_968_386_869e36),
	double: 9.969_209_968_386_869e36,
};

/** A reason the bytes cannot be read, carried out of the parser. */
class NetcdfRefusal extends Error {
	constructor(
		readonly reason: NetcdfError,
		detail: string,
	) {
		super(detail);
	}
}

const roundUpToFour = (bytes: number): number => Math.ceil(bytes / 4) * 4;

const decodeText = (bytes: Uint8Array): string =>
	new TextDecoder().decode(bytes);

/** One value of a numeric type at a byte offset, big-endian. */
const readValue = (
	view: DataView,
	type: Exclude<NetcdfType, 'char'>,
	offset: number,
): number => {
	switch (type) {
		case 'byte':
			return view.getInt8(offset);
		case 'short':
			return view.getInt16(offset);
		case 'int':
			return view.getInt32(offset);
		case 'float':
			return view.getFloat32(offset);
		case 'double':
			return view.getFloat64(offset);
	}
};

/** Reads a header front to back, refusing anything past the end. */
const createHeaderReader = (bytes: Uint8Array) => {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let position = 0;

	/** Moves past `length` bytes, giving where they started. */
	const take = (length: number, what: string): number => {
		if (position + length > bytes.length) {
			throw new NetcdfRefusal(
				'truncated',
				`The file ends at byte ${bytes.length}, inside ${what}`,
			);
		}
		const start = position;
		position += length;
		return start;
	};

	/** Checks that `count` items of at least `size` bytes each could follow. */
	const assertRoom = (count: number, size: number, what: string): void => {
		if (count * size > bytes.length - position) {
			throw new NetcdfRefusal(
				'truncated',
				`The file is too short for its ${count} ${what}`,
			);
		}
	};

	const uint32 = (what: string): number => view.getUint32(take(4, what));

	/** A non-negative count, which the file stores as a signed integer. */
	const count = (what: string): number => {
		const value = uint32(what);
		if (value > 0x7f_ff_ff_ff) {
			throw new NetcdfRefusal('bad-header', `${what} is negative`);
		}
		return value;
	};

	/** An offset: four bytes in the classic format, eight with 64-bit ones. */
	const offset = (version: 1 | 2, what: string): number => {
		if (version === 1) {
			return uint32(what);
		}
		const value = view.getBigUint64(take(8, what));
		if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
			throw new NetcdfRefusal(
				'truncated',
				`${what} lies past the end of the file`,
			);
		}
		return Number(value);
	};

	const name = (what: string): string => {
		const length = count(`the length of ${what}`);
		const start = take(roundUpToFour(length), what);
		return decodeText(bytes.subarray(start, start + length));
	};

	const type = (what: string): NetcdfType => {
		const code = uint32(what);
		const found = TYPE_CODES[code];
		if (found === undefined) {
			throw new NetcdfRefusal(
				'bad-header',
				`${what} is of unknown type ${code}`,
			);
		}
		return found;
	};

	/** The length of a list, or 0 if the list is absent; checks its tag. */
	const listLength = (tag: number, what: string): number => {
		const found = uint32(`the tag of the ${what}`);
		const length = count(`the length of the ${what}`);
		if (found !== tag && !(found === 0 && length === 0)) {
			throw new NetcdfRefusal(
				'bad-header',
				`The ${what} has tag ${found}, expected ${tag}`,
			);
		}
		return length;
	};

	const attributes = (what: string): NetcdfAttributes => {
		const length = listLength(TAG_ATTRIBUTE, `attributes of ${what}`);
		// A name's length, a type and a count at the least.
		assertRoom(length, 12, `attributes of ${what}`);
		const found = new Map<string, NetcdfAttribute>();
		for (let index = 0; index < length; index++) {
			const attributeName = name(`an attribute name of ${what}`);
			const label = `attribute ${attributeName} of ${what}`;
			const attributeType = type(label);
			const values = count(`the length of ${label}`);
			const size = TYPE_BYTES[attributeType];
			assertRoom(values, size, `values of ${label}`);
			const start = take(roundUpToFour(values * size), label);
			if (attributeType === 'char') {
				// Writers often end text with a NUL that is not part of it.
				const text = decodeText(bytes.subarray(start, start + values));
				found.set(attributeName, {
					type: 'char',
					value: text.replace(/\0+$/, ''),
				});
			} else {
				const value: number[] = [];
				for (let item = 0; item < values; item++) {
					value.push(readValue(view, attributeType, start + item * size));
				}
				found.set(attributeName, { type: attributeType, value });
			}
		}
		return found;
	};

	return {
		assertRoom,
		uint32,
		count,
		offset,
		name,
		type,
		listLength,
		attributes,
	};
};

/** An empty array for `count` values of a type. */
const arrayFor = (type: NetcdfType, count: number): NetcdfValues => {
	switch (type) {
		case 'byte':
			return new Int8Array(count);
		case 'char':
			return new Uint8Array(count);
		case 'short':
			return new Int16Array(count);
		case 'int':
			return new Int32Array(count);
		case 'float':
			return new Float32Array(count);
		case 'double':
			return new Float64Array(count);
	}
};

/** Copies `count` values of a type from a byte offset into `out` at `at`. */
const copyValues = (
	view: DataView,
	type: NetcdfType,
	offset: number,
	count: number,
	out: NetcdfValues,
	at: number,
): void => {
	if (type === 'char') {
		for (let index = 0; index < count; index++) {
			out[at + index] = view.getUint8(offset + index);
		}
		return;
	}
	const size = TYPE_BYTES[type];
	for (let index = 0; index < count; index++) {
		out[at + index] = readValue(view, type, offset + index * size);
	}
};

/** A variable as the header gives it, before its data is read. */
type DeclaredVariable = {
	readonly name: string;
	readonly type: NetcdfType;
	readonly dimensionIds: readonly number[];
	readonly attributes: NetcdfAttributes;
	readonly begin: number;
};

const parse = (bytes: Uint8Array): NetcdfFile => {
	if (
		bytes.length < 3 ||
		bytes[0] !== 0x43 ||
		bytes[1] !== 0x44 ||
		bytes[2] !== 0x46
	) {
		throw new NetcdfRefusal('bad-magic', 'The file does not start with "CDF"');
	}
	if (bytes.length < 4) {
		throw new NetcdfRefusal('truncated', 'The file ends before its version');
	}
	const versionByte = bytes[3] as number;
	if (versionByte !== 1 && versionByte !== 2) {
		throw new NetcdfRefusal(
			'unsupported-version',
			`The file is netCDF version ${versionByte}; only versions 1 and 2 (netCDF-3) are read`,
		);
	}
	const version: 1 | 2 = versionByte;
	const reader = createHeaderReader(bytes);
	reader.uint32('the magic number');
	const declaredRecords = reader.uint32('the number of records');

	const dimensionCount = reader.listLength(TAG_DIMENSION, 'list of dimensions');
	// A name's length and a dimension's length at the least.
	reader.assertRoom(dimensionCount, 8, 'dimensions');
	const declaredDimensions: { name: string; length: number }[] = [];
	for (let index = 0; index < dimensionCount; index++) {
		const name = reader.name('a dimension name');
		declaredDimensions.push({
			name,
			length: reader.count(`the length of dimension ${name}`),
		});
	}
	const recordDimensions = declaredDimensions.filter(
		({ length }) => length === 0,
	);
	if (recordDimensions.length > 1) {
		throw new NetcdfRefusal(
			'bad-header',
			`The file has ${recordDimensions.length} record dimensions; netCDF-3 allows one`,
		);
	}
	const recordId = declaredDimensions.findIndex(({ length }) => length === 0);

	const attributes = reader.attributes('the file');

	const variableCount = reader.listLength(TAG_VARIABLE, 'list of variables');
	// A name's length, a count of dimensions, an empty attribute list, a
	// type, a size and an offset at the least.
	reader.assertRoom(variableCount, 28, 'variables');
	const declared: DeclaredVariable[] = [];
	for (let index = 0; index < variableCount; index++) {
		const name = reader.name('a variable name');
		const label = `variable ${name}`;
		const rank = reader.count(`the number of dimensions of ${label}`);
		reader.assertRoom(rank, 4, `dimensions of ${label}`);
		const dimensionIds: number[] = [];
		for (let axis = 0; axis < rank; axis++) {
			const id = reader.count(`a dimension of ${label}`);
			if (id >= declaredDimensions.length) {
				throw new NetcdfRefusal(
					'bad-header',
					`${label} names dimension ${id}, and the file has ${declaredDimensions.length}`,
				);
			}
			if (id === recordId && axis > 0) {
				throw new NetcdfRefusal(
					'bad-header',
					`${label} has the record dimension other than first`,
				);
			}
			dimensionIds.push(id);
		}
		const variableAttributes = reader.attributes(label);
		const type = reader.type(label);
		// The size is worked out from the shape instead: writers are known to
		// get it wrong for very large variables.
		reader.uint32(`the size of ${label}`);
		const begin = reader.offset(version, `the start of ${label}`);
		declared.push({
			name,
			type,
			dimensionIds,
			attributes: variableAttributes,
			begin,
		});
	}

	const isRecordVariable = (variable: DeclaredVariable): boolean =>
		recordId >= 0 && variable.dimensionIds[0] === recordId;
	/** Values in one record of a variable, or in all of a fixed one. */
	const valuesPerSlab = (variable: DeclaredVariable): number =>
		variable.dimensionIds
			.slice(isRecordVariable(variable) ? 1 : 0)
			.reduce(
				(product, id) => product * (declaredDimensions[id]?.length ?? 0),
				1,
			);
	const slabBytes = (variable: DeclaredVariable): number =>
		valuesPerSlab(variable) * TYPE_BYTES[variable.type];

	const recordVariables = declared.filter(isRecordVariable);
	// Records are padded to four bytes, unless there is only one record
	// variable, whose records then follow each other with no padding.
	const recordBytes =
		recordVariables.length === 1
			? slabBytes(recordVariables[0] as DeclaredVariable)
			: recordVariables.reduce(
					(total, variable) => total + roundUpToFour(slabBytes(variable)),
					0,
				);
	let recordCount = declaredRecords;
	if (declaredRecords === STREAMING_RECORDS) {
		// A loop, not a spread into Math.min, which overflows the stack for a
		// header that declares very many record variables.
		let firstBegin = Number.POSITIVE_INFINITY;
		for (const { begin } of recordVariables) {
			firstBegin = Math.min(firstBegin, begin);
		}
		recordCount =
			recordVariables.length === 0 || recordBytes === 0
				? 0
				: Math.max(0, Math.floor((bytes.length - firstBegin) / recordBytes));
	}

	const dimensions: NetcdfDimension[] = declaredDimensions.map(
		({ name, length }, id) => ({
			name,
			length: id === recordId ? recordCount : length,
			isRecord: id === recordId,
		}),
	);

	/** The number of slabs of a variable: its records, or 1 if it is fixed. */
	const slabsOf = (variable: DeclaredVariable): number =>
		isRecordVariable(variable) ? recordCount : 1;
	let dataBytes = 0;
	for (const variable of declared) {
		const slabs = slabsOf(variable);
		if (slabs === 0) {
			// A record variable in a file with no records has no data, and its
			// start, inside the first record, may lie past the end of the file.
			continue;
		}
		const bytesPerSlab = slabBytes(variable);
		const last = variable.begin + (slabs - 1) * recordBytes + bytesPerSlab;
		if (last > bytes.length) {
			throw new NetcdfRefusal(
				'truncated',
				`The data of variable ${variable.name} runs to byte ${last}, past the end of the file at ${bytes.length}`,
			);
		}
		dataBytes += slabs * bytesPerSlab;
	}
	// In a well-formed file no two variables' data share a byte, so their
	// sizes, without padding, add up to no more than the file. Checking this
	// before any array is made keeps variables declared over the same bytes
	// from each being copied out in full, to many times the file's size.
	if (dataBytes > bytes.length) {
		throw new NetcdfRefusal(
			'bad-header',
			`The variables' data come to ${dataBytes} bytes, more than the file's ${bytes.length}, so some of it overlaps`,
		);
	}

	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const variables = declared.map((variable): NetcdfVariable => {
		const slab = valuesPerSlab(variable);
		const slabs = slabsOf(variable);
		const values = arrayFor(variable.type, slab * slabs);
		for (let index = 0; index < slabs; index++) {
			copyValues(
				view,
				variable.type,
				variable.begin + index * recordBytes,
				slab,
				values,
				index * slab,
			);
		}
		return {
			name: variable.name,
			type: variable.type,
			dimensions: variable.dimensionIds.map(
				(id) => (dimensions[id] as NetcdfDimension).name,
			),
			shape: variable.dimensionIds.map(
				(id) => (dimensions[id] as NetcdfDimension).length,
			),
			attributes: variable.attributes,
			values,
		};
	});

	return { version, recordCount, dimensions, attributes, variables };
};

/**
 * Reads the bytes of a netCDF-3 file: its dimensions, its attributes and
 * every variable with its data.
 *
 * @param bytes - The whole file. It is not changed and not kept: the values
 * are copied out of it.
 * @returns The file, or why it could not be read. Nothing is thrown for any
 * bytes whatever.
 */
export const readNetcdf3 = (bytes: Uint8Array): NetcdfResult => {
	try {
		return { ok: true, file: parse(bytes) };
	} catch (error) {
		if (error instanceof NetcdfRefusal) {
			return { ok: false, error: error.reason, detail: error.message };
		}
		throw error;
	}
};

/** The variable of a file with a name, or undefined if there is none. */
export const findVariable = (
	file: NetcdfFile,
	name: string,
): NetcdfVariable | undefined =>
	file.variables.find((variable) => variable.name === name);

/** The numbers of a numeric attribute, or undefined if it is not one. */
const numbersOf = (
	attributes: NetcdfAttributes,
	name: string,
): readonly number[] | undefined => {
	const attribute = attributes.get(name);
	return attribute === undefined || attribute.type === 'char'
		? undefined
		: attribute.value;
};

/**
 * A variable's values as the quantity they stand for: missing values as NaN,
 * and the rest multiplied by its `scale_factor` and then added to its
 * `add_offset`, as the CF conventions read them.
 *
 * @remarks
 * A value is missing if it equals the variable's `_FillValue`, or the
 * default fill of its type where it names none (bytes have no default), or
 * any of its `missing_value`s. These are compared with the values as
 * stored, before scaling.
 *
 * @param variable - A variable of a numeric type.
 * @returns A new array, as long as the variable's values.
 */
export const unpackVariable = (variable: NetcdfVariable): Float64Array => {
	const { attributes, values, type } = variable;
	const scale = numbersOf(attributes, 'scale_factor')?.[0] ?? 1;
	const offset = numbersOf(attributes, 'add_offset')?.[0] ?? 0;
	const fill = numbersOf(attributes, '_FillValue')?.[0] ?? DEFAULT_FILL[type];
	const missing = new Set(numbersOf(attributes, 'missing_value') ?? []);
	if (fill !== undefined) {
		missing.add(fill);
	}
	const out = new Float64Array(values.length);
	for (let index = 0; index < values.length; index++) {
		const stored = values[index] as number;
		out[index] =
			missing.has(stored) || Number.isNaN(stored)
				? Number.NaN
				: stored * scale + offset;
	}
	return out;
};
