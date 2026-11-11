/**
 * Writes small netCDF-3 files for the tests, by the format's own layout
 * rather than with the reader's code, so that the reader is checked against
 * something it did not make.
 */

import type { NetcdfType } from '../netcdf';

/** An attribute to write: text is written as `char`. */
export type BuiltAttribute =
	| string
	| {
			readonly type: Exclude<NetcdfType, 'char'>;
			readonly value: readonly number[];
	  };

export type BuiltVariable = {
	readonly name: string;
	readonly type: NetcdfType;
	/** Names of declared dimensions, slowest-varying first. */
	readonly dimensions: readonly string[];
	readonly attributes?: Readonly<Record<string, BuiltAttribute>>;
	/** Every value, last dimension fastest, records one after another. */
	readonly values: readonly number[];
};

export type BuiltFile = {
	/** 1 for the classic format, 2 for 64-bit offsets; 1 if not given. */
	readonly version?: 1 | 2;
	/** Dimensions by name; a length of 0 makes the record dimension. */
	readonly dimensions: Readonly<Record<string, number>>;
	/** Records in the file, for a file with a record dimension. */
	readonly recordCount?: number;
	readonly attributes?: Readonly<Record<string, BuiltAttribute>>;
	readonly variables: readonly BuiltVariable[];
};

const TYPE_CODE: Readonly<Record<NetcdfType, number>> = {
	byte: 1,
	char: 2,
	short: 3,
	int: 4,
	float: 5,
	double: 6,
};

const TYPE_SIZE: Readonly<Record<NetcdfType, number>> = {
	byte: 1,
	char: 1,
	short: 2,
	int: 4,
	float: 4,
	double: 8,
};

const padded = (bytes: number): number => Math.ceil(bytes / 4) * 4;

/** Bytes appended to as the file is written. */
const createWriter = () => {
	const parts: number[] = [];
	const scratch = new DataView(new ArrayBuffer(8));
	const push = (count: number): void => {
		for (let index = 0; index < count; index++) {
			parts.push(scratch.getUint8(index));
		}
	};
	const pad = (): void => {
		while (parts.length % 4 !== 0) {
			parts.push(0);
		}
	};
	const value = (type: NetcdfType, number: number): void => {
		switch (type) {
			case 'byte':
				scratch.setInt8(0, number);
				break;
			case 'char':
				scratch.setUint8(0, number);
				break;
			case 'short':
				scratch.setInt16(0, number);
				break;
			case 'int':
				scratch.setInt32(0, number);
				break;
			case 'float':
				scratch.setFloat32(0, number);
				break;
			case 'double':
				scratch.setFloat64(0, number);
				break;
		}
		push(TYPE_SIZE[type]);
	};
	const uint32 = (number: number): void => {
		scratch.setUint32(0, number);
		push(4);
	};
	const uint64 = (number: number): void => {
		scratch.setBigUint64(0, BigInt(number));
		push(8);
	};
	const text = (string: string): void => {
		const codes = [...string].map((character) => character.charCodeAt(0));
		uint32(codes.length);
		parts.push(...codes);
		pad();
	};
	return {
		parts,
		pad,
		value,
		uint32,
		uint64,
		text,
		length: () => parts.length,
	};
};

type Writer = ReturnType<typeof createWriter>;

const writeAttributes = (
	writer: Writer,
	attributes: Readonly<Record<string, BuiltAttribute>> | undefined,
): void => {
	const entries = Object.entries(attributes ?? {});
	if (entries.length === 0) {
		writer.uint32(0);
		writer.uint32(0);
		return;
	}
	writer.uint32(0x0c);
	writer.uint32(entries.length);
	for (const [name, attribute] of entries) {
		writer.text(name);
		if (typeof attribute === 'string') {
			writer.uint32(TYPE_CODE.char);
			writer.text(attribute);
		} else {
			writer.uint32(TYPE_CODE[attribute.type]);
			writer.uint32(attribute.value.length);
			for (const number of attribute.value) {
				writer.value(attribute.type, number);
			}
			writer.pad();
		}
	}
};

/**
 * The bytes of a netCDF-3 file holding what is given.
 *
 * @remarks
 * Fixed variables are stored first, in the order given, each padded to
 * four bytes; then the records, each holding every record variable in the
 * order given, padded the same way unless there is only one.
 */
export const buildNetcdf3 = (file: BuiltFile): Uint8Array<ArrayBuffer> => {
	const version = file.version ?? 1;
	const names = Object.keys(file.dimensions);
	const recordName = names.find((name) => file.dimensions[name] === 0);
	const isRecord = (variable: BuiltVariable): boolean =>
		recordName !== undefined && variable.dimensions[0] === recordName;
	const slabBytes = (variable: BuiltVariable): number =>
		variable.dimensions
			.slice(isRecord(variable) ? 1 : 0)
			.reduce((product, name) => product * (file.dimensions[name] ?? 0), 1) *
		TYPE_SIZE[variable.type];
	const recordVariables = file.variables.filter(isRecord);
	const writeHeader = (begins: readonly number[]): Writer => {
		const writer = createWriter();
		writer.parts.push(0x43, 0x44, 0x46, version);
		writer.uint32(file.recordCount ?? 0);
		if (names.length === 0) {
			writer.uint32(0);
			writer.uint32(0);
		} else {
			writer.uint32(0x0a);
			writer.uint32(names.length);
			for (const name of names) {
				writer.text(name);
				writer.uint32(file.dimensions[name] as number);
			}
		}
		writeAttributes(writer, file.attributes);
		if (file.variables.length === 0) {
			writer.uint32(0);
			writer.uint32(0);
		} else {
			writer.uint32(0x0b);
			writer.uint32(file.variables.length);
			file.variables.forEach((variable, index) => {
				writer.text(variable.name);
				writer.uint32(variable.dimensions.length);
				for (const name of variable.dimensions) {
					writer.uint32(names.indexOf(name));
				}
				writeAttributes(writer, variable.attributes);
				writer.uint32(TYPE_CODE[variable.type]);
				writer.uint32(padded(slabBytes(variable)));
				const begin = begins[index] ?? 0;
				if (version === 1) {
					writer.uint32(begin);
				} else {
					writer.uint64(begin);
				}
			});
		}
		return writer;
	};

	const headerBytes = writeHeader([]).length();
	const begins: number[] = [];
	let next = headerBytes;
	for (const variable of file.variables) {
		if (!isRecord(variable)) {
			begins[file.variables.indexOf(variable)] = next;
			next += padded(slabBytes(variable));
		}
	}
	for (const variable of recordVariables) {
		begins[file.variables.indexOf(variable)] = next;
		next +=
			recordVariables.length === 1
				? slabBytes(variable)
				: padded(slabBytes(variable));
	}

	const writer = writeHeader(begins);
	for (const variable of file.variables.filter((v) => !isRecord(v))) {
		for (const number of variable.values) {
			writer.value(variable.type, number);
		}
		writer.pad();
	}
	for (let record = 0; record < (file.recordCount ?? 0); record++) {
		for (const variable of recordVariables) {
			const perRecord = slabBytes(variable) / TYPE_SIZE[variable.type];
			for (const number of variable.values.slice(
				record * perRecord,
				(record + 1) * perRecord,
			)) {
				writer.value(variable.type, number);
			}
			if (recordVariables.length > 1) {
				writer.pad();
			}
		}
	}
	return Uint8Array.from(writer.parts);
};
