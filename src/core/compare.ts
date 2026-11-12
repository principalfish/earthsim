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

/**
 * Area-weighted error figures of twelve monthly fields against twelve
 * others, month by month and for the annual mean.
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
	let totalArea = 0;
	for (let cell = 0; cell < cellCount; cell++) {
		totalArea += areas[cell] as number;
	}
	const annualDifference = new Float64Array(cellCount);
	const months: FieldDifference[] = [];
	for (let month = 0; month < MONTHS_PER_YEAR; month++) {
		const first = a[month] as ArrayLike<number>;
		const second = b[month] as ArrayLike<number>;
		let sum = 0;
		let squares = 0;
		for (let cell = 0; cell < cellCount; cell++) {
			const difference = (first[cell] as number) - (second[cell] as number);
			const area = areas[cell] as number;
			sum += area * difference;
			squares += area * difference * difference;
			annualDifference[cell] =
				(annualDifference[cell] as number) + difference / MONTHS_PER_YEAR;
		}
		months.push({
			meanDifference: sum / totalArea,
			rmsDifference: Math.sqrt(squares / totalArea),
		});
	}
	let sum = 0;
	let squares = 0;
	for (let cell = 0; cell < cellCount; cell++) {
		const difference = annualDifference[cell] as number;
		const area = areas[cell] as number;
		sum += area * difference;
		squares += area * difference * difference;
	}
	return {
		months,
		annual: {
			meanDifference: sum / totalArea,
			rmsDifference: Math.sqrt(squares / totalArea),
		},
	};
};
