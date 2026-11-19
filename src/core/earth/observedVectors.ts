/**
 * Taking a vector observed on a grid of latitude and longitude onto the
 * cells of a world, as the observed winds and the observed currents are.
 *
 * The vector is not interpolated as two separate numbers, eastward and
 * northward. Each of the four points of the data around a cell's centre has
 * its eastward and northward components made into a vector in three
 * dimensions along that point's own directions east and north, the four
 * vectors are summed with the weights given, and the sum is split into the
 * eastward and northward components along the cell centre's own directions.
 * A vector across a pole therefore keeps its strength there, where
 * averaging the eastward components of points on either side of the pole
 * would cancel them. Both sets of directions are those of
 * {@link writeEastNorthFrame}, the centres' from {@link cellFrames}.
 */

import type { Grid } from '../grid/grid';
import {
	cellFrames,
	createEastNorthFrame,
	type EastNorthFrame,
	writeEastNorthFrame,
} from '../grid/vector';

/** The grid of data and how each cell's centre falls among its points. */
export type VectorSampling = {
	/** The world's grid. */
	readonly grid: Grid;
	/** Columns in each row of the data, to turn an index into a row and column. */
	readonly columns: number;
	/** The sine of the latitude of each row of the data. */
	readonly rowSin: Float64Array;
	/** The cosine of the latitude of each row of the data, from 0 to 1. */
	readonly rowCos: Float64Array;
	/** The sine of the longitude of each column of the data. */
	readonly columnSin: Float64Array;
	/** The cosine of the longitude of each column of the data. */
	readonly columnCos: Float64Array;
	/**
	 * Writes the four points of the data around a cell's centre, north-west,
	 * north-east, south-west and south-east, as their indices in a month, and
	 * their weights, from the first place of each array.
	 */
	readonly locate: (
		cell: number,
		corners: Int32Array,
		weights: Float64Array,
	) => void;
	/**
	 * Whether a point whose components are NaN has no data. It is then left
	 * out, and the weights of the points that have data are scaled to sum
	 * to one; a cell with no weight on any of them is NaN. If false, every
	 * point is used as it is.
	 */
	readonly leaveOutNoData: boolean;
};

/**
 * Twelve months of a vector on a world's cells.
 *
 * @param sampling - Where the cells fall among the data.
 * @param east - The data's eastward components, one grid for each month.
 * @param north - The data's northward components, laid out as `east` is.
 * @returns New arrays of the components at each cell's centre, one for each
 * month, one value per cell in cell order.
 */
export const sampleVectorsOnCells = (
	sampling: VectorSampling,
	east: readonly Float32Array[],
	north: readonly Float32Array[],
): { readonly east: Float32Array[]; readonly north: Float32Array[] } => {
	const { grid, columns, rowSin, rowCos, columnSin, columnCos, locate } =
		sampling;
	const { cellCount } = grid;
	const months = east.length;
	const centres = cellFrames(grid);
	// The four points around a cell, north-west, north-east, south-west and
	// south-east: their indices in a month, their weights, and the
	// directions east and north at each.
	const corners = new Int32Array(4);
	const weights = new Float64Array(4);
	const frames = Array.from({ length: 4 }, createEastNorthFrame);
	const outEast = Array.from(
		{ length: months },
		() => new Float32Array(cellCount),
	);
	const outNorth = Array.from(
		{ length: months },
		() => new Float32Array(cellCount),
	);
	for (let cell = 0; cell < cellCount; cell++) {
		const eastX = centres.east.x[cell] as number;
		const eastY = centres.east.y[cell] as number;
		const northX = centres.north.x[cell] as number;
		const northY = centres.north.y[cell] as number;
		const northZ = centres.north.z[cell] as number;
		locate(cell, corners, weights);
		for (let corner = 0; corner < 4; corner++) {
			const index = corners[corner] as number;
			const row = Math.floor(index / columns);
			const column = index - row * columns;
			writeEastNorthFrame(
				rowSin[row] as number,
				rowCos[row] as number,
				columnSin[column] as number,
				columnCos[column] as number,
				frames[corner] as EastNorthFrame,
			);
		}

		for (let month = 0; month < months; month++) {
			const eastGrid = east[month] as Float32Array;
			const northGrid = north[month] as Float32Array;
			let x = 0;
			let y = 0;
			let z = 0;
			let weightSum = 0;
			let leftOut = false;
			for (let corner = 0; corner < 4; corner++) {
				const index = corners[corner] as number;
				const frame = frames[corner] as EastNorthFrame;
				const weight = weights[corner] as number;
				const u = weight * (eastGrid[index] as number);
				const v = weight * (northGrid[index] as number);
				if (sampling.leaveOutNoData && (Number.isNaN(u) || Number.isNaN(v))) {
					leftOut = true;
					continue;
				}
				weightSum += weight;
				x += u * frame.eastX + v * frame.northX;
				y += u * frame.eastY + v * frame.northY;
				z += v * frame.northZ;
			}
			if (leftOut) {
				if (!(weightSum > 0)) {
					(outEast[month] as Float32Array)[cell] = Number.NaN;
					(outNorth[month] as Float32Array)[cell] = Number.NaN;
					continue;
				}
				// The points that have data carry less than all the weight.
				x /= weightSum;
				y /= weightSum;
				z /= weightSum;
			}
			(outEast[month] as Float32Array)[cell] = x * eastX + y * eastY;
			(outNorth[month] as Float32Array)[cell] =
				x * northX + y * northY + z * northZ;
		}
	}
	return { east: outEast, north: outNorth };
};
