/**
 * Error figures between two sets of monthly fields on the same grid, such
 * as a simulated temperature and the observed one.
 *
 * Cells differ in area, so every figure weights a cell by its exact area.
 */

import type { Grid } from './grid';
import { MONTHS_PER_YEAR } from './insolation';

/** How far one field is from another over the whole globe. */
export type FieldDifference = {
	/**
	 * The area-weighted mean of the first field less the second: positive
	 * where the first is higher on the whole.
	 */
	readonly meanDifference: number;
	/** The area-weighted root-mean-square of the first less the second. */
	readonly rmsDifference: number;
};

/** The error figures of twelve monthly fields against twelve others. */
export type FieldComparison = {
	/** One per month, January to December. */
	readonly months: readonly FieldDifference[];
	/**
	 * The annual mean of the first (the mean of its twelve months, cell by
	 * cell) against the annual mean of the second.
	 */
	readonly annual: FieldDifference;
};

/** The sum of a grid's cell areas, in the order of its cells. */
const totalAreaOf = (areas: ArrayLike<number>, cellCount: number): number => {
	let total = 0;
	for (let cell = 0; cell < cellCount; cell++) {
		total += areas[cell] as number;
	}
	return total;
};

/**
 * The area-weighted mean and root-mean-square of a difference, given cell
 * by cell.
 */
const figuresOf = (
	areas: ArrayLike<number>,
	cellCount: number,
	totalArea: number,
	differenceAt: (cell: number) => number,
): FieldDifference => {
	let sum = 0;
	let squares = 0;
	for (let cell = 0; cell < cellCount; cell++) {
		const difference = differenceAt(cell);
		const area = areas[cell] as number;
		sum += area * difference;
		squares += area * difference * difference;
	}
	return {
		meanDifference: sum / totalArea,
		rmsDifference: Math.sqrt(squares / totalArea),
	};
};

/**
 * One field less another, cell by cell, such as a simulated temperature
 * less the observed one.
 *
 * @param a - The field to subtract from. Not changed.
 * @param b - The field to subtract, in the same units and cell order. Not
 * changed.
 * @returns A new array: `a[cell] - b[cell]` in each cell, in single
 * precision.
 * @throws RangeError if the two are not the same length.
 */
export const differenceField = (
	a: ArrayLike<number>,
	b: ArrayLike<number>,
): Float32Array => {
	if (a.length !== b.length) {
		throw new RangeError(
			`Only fields of the same length can be subtracted; got ${a.length} and ${b.length}`,
		);
	}
	const difference = new Float32Array(a.length);
	for (let cell = 0; cell < a.length; cell++) {
		difference[cell] = (a[cell] as number) - (b[cell] as number);
	}
	return difference;
};

/**
 * Area-weighted error figures of one field against another, such as a
 * month or a summary of the year.
 *
 * @param a - One value per cell of `grid`. Not changed.
 * @param b - The field to compare `a` with, in the same units and cell
 * order. Not changed.
 * @param grid - The grid both are on.
 * @returns New figures, in the fields' units: the mean and the
 * root-mean-square of `a` less `b`, each cell weighted by its area, worked
 * out in double precision.
 * @throws RangeError if either does not hold one value per cell.
 */
export const compareField = (
	a: ArrayLike<number>,
	b: ArrayLike<number>,
	grid: Grid,
): FieldDifference => {
	const { cellCount, areas } = grid;
	if (a.length !== cellCount || b.length !== cellCount) {
		throw new RangeError(`Comparing needs two fields of ${cellCount} values`);
	}
	return figuresOf(
		areas,
		cellCount,
		totalAreaOf(areas, cellCount),
		(cell) => (a[cell] as number) - (b[cell] as number),
	);
};

/**
 * Area-weighted error figures of twelve monthly fields against twelve
 * others, month by month and for the annual mean.
 *
 * @remarks
 * Each month's figures are those {@link compareField} gives for it. The
 * annual mean's are of the mean of the twelve monthly differences, cell by
 * cell, in double precision.
 *
 * @param a - Twelve fields, one value per cell of `grid`. Not changed.
 * @param b - Twelve fields to compare `a` with, in the same units and cell
 * order. Not changed.
 * @param grid - The grid both are on.
 * @returns New figures, in the fields' units.
 * @throws RangeError if either does not hold twelve fields of one value per
 * cell.
 */
export const compareFields = (
	a: readonly ArrayLike<number>[],
	b: readonly ArrayLike<number>[],
	grid: Grid,
): FieldComparison => {
	const { cellCount, areas } = grid;
	for (const fields of [a, b]) {
		if (
			fields.length !== MONTHS_PER_YEAR ||
			fields.some((field) => field.length !== cellCount)
		) {
			throw new RangeError(
				`Comparing needs ${MONTHS_PER_YEAR} fields of ${cellCount} values each`,
			);
		}
	}
	const totalArea = totalAreaOf(areas, cellCount);
	const annualDifference = new Float64Array(cellCount);
	const months: FieldDifference[] = [];
	for (let month = 0; month < MONTHS_PER_YEAR; month++) {
		const first = a[month] as ArrayLike<number>;
		const second = b[month] as ArrayLike<number>;
		months.push(compareField(first, second, grid));
		for (let cell = 0; cell < cellCount; cell++) {
			const difference = (first[cell] as number) - (second[cell] as number);
			annualDifference[cell] =
				(annualDifference[cell] as number) + difference / MONTHS_PER_YEAR;
		}
	}
	return {
		months,
		annual: figuresOf(
			areas,
			cellCount,
			totalArea,
			(cell) => annualDifference[cell] as number,
		),
	};
};
