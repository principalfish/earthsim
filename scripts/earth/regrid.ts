/**
 * Taking surface currents from a fine grid onto the one-degree cells of the
 * observed ocean files, by averaging.
 */

import {
	OCEAN_COLUMNS,
	OCEAN_ROWS,
	OCEAN_VALUES_PER_MONTH,
} from '../../src/core/index';

/**
 * A grid of values at the centres of equal cells that tile whole degrees:
 * `perDegree` cells to each degree along each axis, covering every
 * longitude, from the south.
 */
export type FineGrid = {
	/** Cells to each degree along each axis; a whole number. */
	readonly perDegree: number;
	/** Columns of longitude: 360 times `perDegree`. */
	readonly columns: number;
	/** Rows of latitude, counted northward from the first. */
	readonly rows: number;
	/** The longitude of the first column's centre, in degrees east. */
	readonly firstLongitudeDeg: number;
	/** The latitude of the first row's centre, in degrees north. */
	readonly firstLatitudeDeg: number;
};

/** Twelve months of the east and north components of a current. */
export type MonthlyComponents<T> = {
	readonly east: readonly T[];
	readonly north: readonly T[];
};

/** Whether a number is a whole number, to within rounding. */
const isWhole = (value: number): boolean =>
	Math.abs(value - Math.round(value)) < 1e-9;

/**
 * For each of a fine grid's columns or rows, the one-degree cell it falls
 * in, or -1 if it falls in none.
 *
 * @param count - How many there are.
 * @param firstDeg - The first one's centre, in degrees.
 * @param perDegree - How many to a degree.
 * @param cellOf - The cell of the degree whose lower edge is given.
 */
const cellsOfAxis = (
	count: number,
	firstDeg: number,
	perDegree: number,
	cellOf: (lowerDegree: number) => number,
): Int32Array => {
	const cells = new Int32Array(count);
	for (let index = 0; index < count; index++) {
		// A fine cell's lower edge, which lies inside the degree it is in.
		cells[index] = cellOf(
			Math.floor(firstDeg - 0.5 / perDegree + index / perDegree + 1e-9),
		);
	}
	return cells;
};

/**
 * Averages currents on a fine grid into the one-degree cells of the observed
 * ocean files, month by month.
 *
 * @remarks
 * A one-degree cell takes the mean of the fine cells whose centres lie
 * inside it, counting only those that have both components: a cell with a
 * coast or a gap in it is the mean of the sea around it, and a cell with
 * none is NaN in both components. The cells are the observed ocean grid's:
 * row `r` is the degree of latitude centred on `89.5 − r`, column `c` the
 * degree centred on `c + 0.5` east, western longitudes wrapping to 180° to
 * 360° east, so that the fine cells either side of the date line fall in the
 * cells centred on 179.5 and 180.5. Fine cells north of 90° or south of −90°
 * are left out. The sums are made in a
 * fixed order, so the result is the same each time.
 *
 * Each month of the input is laid out column by column from the west, each
 * column row by row from the south, which is how the source files lay out a
 * grid of longitude and latitude: the value at column `i`, row `j` is at
 * index `i × rows + j`.
 *
 * @param fine - The components on the fine grid, twelve months each, with
 * NaN where there is no data.
 * @param grid - The fine grid's shape. Its cells must fall exactly four to
 * a side, or `perDegree` to a side, in whole-degree cells.
 * @returns The mean of each component, twelve new arrays each, laid out row
 * by row from the north, then column by column from 0° east, NaN where a
 * cell has no data.
 * @throws RangeError if the grid does not tile whole degrees, or a month is
 * not `columns × rows` long.
 */
export const regridCurrents = (
	fine: MonthlyComponents<ArrayLike<number>>,
	grid: FineGrid,
): MonthlyComponents<Float64Array> => {
	const { perDegree, columns, rows } = grid;
	if (
		!Number.isInteger(perDegree) ||
		perDegree < 1 ||
		columns !== 360 * perDegree ||
		!isWhole(grid.firstLongitudeDeg - 0.5 / perDegree) ||
		!isWhole(grid.firstLatitudeDeg - 0.5 / perDegree)
	) {
		throw new RangeError(
			`A fine grid of ${columns} columns by ${rows} rows, ${perDegree} to a degree, from ${grid.firstLongitudeDeg}°, ${grid.firstLatitudeDeg}°, does not tile whole degrees`,
		);
	}
	for (const [name, months] of [
		['eastward', fine.east],
		['northward', fine.north],
	] as const) {
		if (months.length !== fine.east.length) {
			throw new RangeError(
				`The ${name} component has ${months.length} months, the eastward ${fine.east.length}`,
			);
		}
		for (const values of months) {
			if (values.length !== columns * rows) {
				throw new RangeError(
					`A month of the ${name} component has ${values.length} values, expected ${columns} × ${rows}`,
				);
			}
		}
	}
	const columnCell = cellsOfAxis(
		columns,
		grid.firstLongitudeDeg,
		perDegree,
		(degree) => ((degree % 360) + 360) % 360,
	);
	const rowCell = cellsOfAxis(
		rows,
		grid.firstLatitudeDeg,
		perDegree,
		(degree) => {
			// The cell centred on 89.5 − r spans r from 89 − r to 90 − r.
			const row = 89 - degree;
			return row >= 0 && row < OCEAN_ROWS ? row : -1;
		},
	);
	const east: Float64Array[] = [];
	const north: Float64Array[] = [];
	const sumEast = new Float64Array(OCEAN_VALUES_PER_MONTH);
	const sumNorth = new Float64Array(OCEAN_VALUES_PER_MONTH);
	const counts = new Int32Array(OCEAN_VALUES_PER_MONTH);
	fine.east.forEach((eastMonth, month) => {
		const northMonth = fine.north[month] as ArrayLike<number>;
		sumEast.fill(0);
		sumNorth.fill(0);
		counts.fill(0);
		for (let column = 0; column < columns; column++) {
			const cellColumn = columnCell[column] as number;
			for (let row = 0; row < rows; row++) {
				const cellRow = rowCell[row] as number;
				if (cellRow < 0) {
					continue;
				}
				const u = eastMonth[column * rows + row] as number;
				const v = northMonth[column * rows + row] as number;
				if (Number.isNaN(u) || Number.isNaN(v)) {
					continue;
				}
				const cell = cellRow * OCEAN_COLUMNS + cellColumn;
				sumEast[cell] = (sumEast[cell] as number) + u;
				sumNorth[cell] = (sumNorth[cell] as number) + v;
				counts[cell] = (counts[cell] as number) + 1;
			}
		}
		const meanEast = new Float64Array(OCEAN_VALUES_PER_MONTH);
		const meanNorth = new Float64Array(OCEAN_VALUES_PER_MONTH);
		for (let cell = 0; cell < OCEAN_VALUES_PER_MONTH; cell++) {
			const count = counts[cell] as number;
			meanEast[cell] =
				count > 0 ? (sumEast[cell] as number) / count : Number.NaN;
			meanNorth[cell] =
				count > 0 ? (sumNorth[cell] as number) / count : Number.NaN;
		}
		east.push(meanEast);
		north.push(meanNorth);
	});
	return { east, north };
};
