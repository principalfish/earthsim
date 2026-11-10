/**
 * Sculpting brushes: raising, lowering and smoothing the terrain around a
 * point of the globe.
 *
 * A stroke is a run of dabs. One dab changes the cells whose centres lie
 * within the brush's radius of a direction, fully at the centre and fading
 * smoothly to nothing at the edge. How many dabs a stroke lays, where and
 * how strong each one is are the caller's business: {@link strokePath} gives
 * the places between two positions of the cursor.
 */

import {
	cellsWithin,
	type Grid,
	getGrid,
	NEIGHBOUR_COUNT,
	type Resolution,
	type Vec3,
} from './grid';
import {
	MAX_ELEVATION_M,
	MIN_ELEVATION_M,
	PLANET_RADIUS_KM,
	type World,
} from './world';

/** What a brush does to the terrain under it. */
export type BrushMode = 'raise' | 'lower' | 'smooth';

/** Every {@link BrushMode}. */
export const BRUSH_MODES: readonly BrushMode[] = ['raise', 'lower', 'smooth'];

/**
 * The smallest radius a dab acts over, in cell widths.
 *
 * @remarks
 * Cells are chosen by their centres, so a brush much narrower than a cell
 * would usually miss every one. No point of a cell is as far as one cell
 * width from its centre, so with this floor the cell under the brush's
 * centre is always changed.
 */
export const MIN_DAB_RADIUS_CELLS = 1;

/**
 * Separation, in radians, below which two directions are treated as the
 * same line when a path between them is laid: about 6 mm on the planet.
 */
const PARALLEL_EPSILON = 1e-9;

/**
 * The most smoothing one pass over a dab's cells does, as rate × time.
 *
 * @remarks
 * A pass moves every cell at once, by this share at most of the gap to a
 * mean taken before the pass, which follows steady smoothing only while no
 * cell moves far in one go. A dab asked for more is made in several equal
 * passes, so the terrain it leaves depends on how much smoothing was asked
 * for and hardly on how many dabs it came in.
 */
export const MAX_SMOOTH_PASS_AMOUNT = 0.2;

/**
 * The most smoothing one dab accepts, as rate × time.
 *
 * @remarks
 * A dab's cost grows with its passes, so the amount is bounded to bound the
 * cost: at most 250 passes over the cells under the brush. A caller wanting
 * more makes more dabs.
 */
export const MAX_SMOOTH_AMOUNT = 50;

/**
 * The most steps {@link strokePath} cuts an arc into. A spacing that would
 * take more is a mistake rather than a path worth laying.
 */
export const MAX_STROKE_STEPS = 100_000;

/** One application of a brush. */
export type DabOptions = {
	/** Centre of the dab; any finite, non-zero vector. */
	readonly direction: Vec3;
	/**
	 * Radius of the brush in kilometres along the surface; positive and
	 * finite. The dab acts over {@link dabRadius}, which is never narrower
	 * than the grid can show.
	 */
	readonly radiusKm: number;
	/**
	 * How much this one dab does at its centre; finite and not negative.
	 * For `raise` and `lower`, the metres added or removed. For `smooth`,
	 * a smoothing rate times the time it acts for, which has no unit.
	 */
	readonly strength: number;
	/** What the dab does. */
	readonly mode: BrushMode;
};

/**
 * What a dab changed.
 *
 * @remarks
 * The two arrays are parallel and belong to the caller. Together they are
 * enough to put the terrain back: writing `before[k]` to cell `cells[k]`
 * undoes the dab. A record of a whole stroke needs, for each cell, only the
 * `before` of the first dab that lists it.
 */
export type DabResult = {
	/**
	 * The cells whose stored elevation is no longer what it was, each once,
	 * in no particular order.
	 */
	readonly cells: Int32Array;
	/** The elevation each of those cells held before the dab, in metres. */
	readonly before: Float32Array;
};

/** A unit vector along a finite, non-zero vector, without overflow. */
const unit = (v: Vec3): Vec3 => {
	const [x, y, z] = v;
	const largest = Math.max(Math.abs(x), Math.abs(y), Math.abs(z));
	if (!(largest > 0) || !Number.isFinite(largest)) {
		throw new RangeError(
			`A direction must be a finite, non-zero vector; got (${x}, ${y}, ${z})`,
		);
	}
	const sx = x / largest;
	const sy = y / largest;
	const sz = z / largest;
	const length = Math.sqrt(sx * sx + sy * sy + sz * sz);
	return [sx / length, sy / length, sz / length];
};

/** A unit vector at right angles to a unit vector. */
const perpendicularTo = (a: Vec3): Vec3 => {
	// Crossing with the axis the vector leans on least keeps the result
	// well away from zero length.
	const ax = Math.abs(a[0]);
	const ay = Math.abs(a[1]);
	const az = Math.abs(a[2]);
	let p: Vec3;
	if (ax <= ay && ax <= az) {
		p = [0, a[2], -a[1]];
	} else if (ay <= az) {
		p = [-a[2], 0, a[0]];
	} else {
		p = [a[1], -a[0], 0];
	}
	const length = Math.hypot(p[0], p[1], p[2]);
	return [p[0] / length, p[1] / length, p[2] / length];
};

/**
 * The angle between two directions.
 *
 * @param a - Any finite, non-zero vector.
 * @param b - Any finite, non-zero vector.
 * @returns The angle in radians, from 0 to π, accurate for directions that
 * are nearly the same or nearly opposite.
 * @throws RangeError if either vector is zero or not finite.
 */
export const angleBetween = (a: Vec3, b: Vec3): number => {
	const [ax, ay, az] = unit(a);
	const [bx, by, bz] = unit(b);
	const cx = ay * bz - az * by;
	const cy = az * bx - ax * bz;
	const cz = ax * by - ay * bx;
	return Math.atan2(Math.hypot(cx, cy, cz), ax * bx + ay * by + az * bz);
};

/**
 * How strongly a brush acts at a distance from its centre.
 *
 * @param t - Distance from the centre as a share of the radius.
 * @returns 1 at the centre, falling smoothly (with no slope at either end)
 * to exactly 0 at the radius and beyond.
 */
export const brushFalloff = (t: number): number => {
	if (t <= 0) {
		return 1;
	}
	if (t >= 1) {
		return 0;
	}
	return 1 - t * t * (3 - 2 * t);
};

/**
 * The falloff of a brush centred on the unit vector `(x, y, z)` at a cell's
 * centre, by the angle between them.
 */
const weightAt = (
	centres: Float64Array,
	cell: number,
	x: number,
	y: number,
	z: number,
	radius: number,
): number => {
	const offset = 3 * cell;
	const dx = (centres[offset] as number) - x;
	const dy = (centres[offset + 1] as number) - y;
	const dz = (centres[offset + 2] as number) - z;
	// Half the straight-line distance between two unit vectors is the sine
	// of half the angle between them.
	const chord = Math.sqrt(dx * dx + dy * dy + dz * dz);
	return brushFalloff((2 * Math.asin(Math.min(1, chord / 2))) / radius);
};

/**
 * How many passes over its cells a smoothing dab makes.
 *
 * @param amount - The dab's strength: a smoothing rate times a time, zero
 * or more.
 * @returns The fewest equal passes of no more than
 * {@link MAX_SMOOTH_PASS_AMOUNT} each; none for no smoothing.
 */
export const smoothPasses = (amount: number): number =>
	Math.ceil(amount / MAX_SMOOTH_PASS_AMOUNT);

/** What {@link smoothCells} works on. */
type SmoothOptions = {
	readonly grid: Grid;
	/** The elevation to smooth, in place. */
	readonly elevation: Float32Array;
	/** The cells under the brush; rearranged to put those changed first. */
	readonly cells: Int32Array;
	/** As long as `cells`; filled with what the changed cells held. */
	readonly before: Float32Array;
	/** The brush's centre, a unit vector. */
	readonly centre: Vec3;
	/** The brush's angular radius in radians. */
	readonly radius: number;
	/** Smoothing rate times time at the brush's centre. */
	readonly amount: number;
};

/**
 * Smooths the cells of one dab.
 *
 * @returns How many cells no longer hold what they did. Those cells are
 * moved to the front of `cells`, with what they held at the front of
 * `before`.
 */
const smoothCells = (options: SmoothOptions): number => {
	const { grid, elevation, cells, before, radius, amount } = options;
	const [x, y, z] = options.centre;
	const { centres, areas, neighbours } = grid;
	const passes = smoothPasses(amount);
	const each = passes > 0 ? amount / passes : 0;
	const shares = new Float64Array(cells.length);
	const next = new Float32Array(cells.length);
	for (let k = 0; k < cells.length; k++) {
		const cell = cells[k] as number;
		// The share of its gap a cell closes in each pass: never more
		// than the most a pass does, so no cell moves past its mean.
		shares[k] = weightAt(centres, cell, x, y, z, radius) * each;
		before[k] = elevation[cell] as number;
	}

	for (let pass = 0; pass < passes; pass++) {
		// Every new value is worked out before any is stored, so that no
		// cell reads a neighbour this pass has already smoothed.
		let moved = false;
		for (let k = 0; k < cells.length; k++) {
			const cell = cells[k] as number;
			const first = NEIGHBOUR_COUNT * cell;
			let total = 0;
			let area = 0;
			for (let side = 0; side < NEIGHBOUR_COUNT; side++) {
				const neighbour = neighbours[first + side] as number;
				const a = areas[neighbour] as number;
				total += a * (elevation[neighbour] as number);
				area += a;
			}
			const old = elevation[cell] as number;
			const value = old + (shares[k] as number) * (total / area - old);
			next[k] = Math.min(MAX_ELEVATION_M, Math.max(MIN_ELEVATION_M, value));
			moved ||= next[k] !== old;
		}
		// A pass that changes nothing would be repeated exactly by every
		// pass after it.
		if (!moved) {
			break;
		}
		for (let k = 0; k < cells.length; k++) {
			elevation[cells[k] as number] = next[k] as number;
		}
	}

	let count = 0;
	for (let k = 0; k < cells.length; k++) {
		const cell = cells[k] as number;
		const old = before[k] as number;
		if (elevation[cell] !== old) {
			cells[count] = cell;
			before[count] = old;
			count++;
		}
	}
	return count;
};

/**
 * The angular radius a dab acts over on a grid.
 *
 * @remarks
 * This is the radius the brush was asked for, unless that is narrower than
 * {@link MIN_DAB_RADIUS_CELLS} cells: the coarser the grid, the wider the
 * narrowest brush it can show.
 *
 * @param resolution - Cells along a face edge of the world's grid.
 * @param radiusKm - Radius of the brush in kilometres along the surface.
 * @returns The radius in radians.
 * @throws RangeError if the resolution is not supported or the radius is
 * not a positive, finite number.
 */
export const dabRadius = (resolution: Resolution, radiusKm: number): number => {
	if (!(radiusKm > 0) || !Number.isFinite(radiusKm)) {
		throw new RangeError(
			`A brush radius must be a positive number of kilometres; got ${radiusKm}`,
		);
	}
	return Math.max(
		radiusKm / PLANET_RADIUS_KM,
		MIN_DAB_RADIUS_CELLS * getGrid(resolution).cellWidth,
	);
};

/**
 * Applies one dab of a brush to a world's elevation, in place.
 *
 * @remarks
 * Every cell whose centre is nearer the dab's centre than
 * {@link dabRadius} is changed by the dab's strength times
 * {@link brushFalloff} of its distance, measured along the surface. Cells at
 * the radius or beyond are untouched.
 *
 * Smoothing moves each cell towards the mean of its four edge neighbours,
 * weighted by their areas. It is done in {@link smoothPasses} equal passes,
 * the dab's strength shared between them. In a pass a cell closes the share
 * of the gap to its mean that is the pass's part of the strength times
 * {@link brushFalloff} there. Every mean of a pass is taken from the
 * terrain as that pass found it, including neighbours outside the brush, so
 * the result does not depend on the order the cells are visited in and is
 * the same from every face meeting at a cube edge or corner. That share is
 * never more than {@link MAX_SMOOTH_PASS_AMOUNT}, so a cell never moves
 * past its mean and smoothing cannot overshoot at any strength a dab
 * accepts: no cell leaves the range of the heights that the cells under the
 * brush and their neighbours started with.
 *
 * Results are kept within {@link MIN_ELEVATION_M} and
 * {@link MAX_ELEVATION_M}. A cell already at a limit, or one whose change is
 * too small for single precision to hold, stays as it was and is not
 * reported.
 *
 * The cost follows the number of cells under the brush, times the passes
 * for smoothing, not the size of the grid, and nothing is allocated per
 * cell. A smoothing dab makes at most the passes of
 * {@link MAX_SMOOTH_AMOUNT}, and stops early once one changes nothing.
 *
 * @param world - The world to edit. Its elevation must be `6 * n * n` long
 * and hold finite values.
 * @param options - Where the dab lands, how wide and strong it is and what
 * it does.
 * @returns The cells that changed and what each held before.
 * @throws RangeError if the direction is zero or not finite, the radius is
 * not positive and finite, the strength is negative or not finite, a
 * smoothing strength is above {@link MAX_SMOOTH_AMOUNT}, the mode is not a
 * {@link BrushMode}, the world's resolution is not supported, or
 * its elevation array is not `6 * n * n` long. Nothing is changed when it
 * throws.
 */
export const applyDab = (world: World, options: DabOptions): DabResult => {
	const { strength, mode } = options;
	if (!BRUSH_MODES.includes(mode)) {
		throw new RangeError(
			`A brush mode must be one of ${BRUSH_MODES.join(', ')}; got ${String(mode)}`,
		);
	}
	if (!(strength >= 0) || !Number.isFinite(strength)) {
		throw new RangeError(
			`A brush strength must be a finite number, zero or more; got ${strength}`,
		);
	}
	if (mode === 'smooth' && strength > MAX_SMOOTH_AMOUNT) {
		throw new RangeError(
			`A smoothing strength must be no more than ${MAX_SMOOTH_AMOUNT}; got ${strength}`,
		);
	}
	const [x, y, z] = unit(options.direction);
	const radius = dabRadius(world.resolution, options.radiusKm);
	const grid = getGrid(world.resolution);
	const { elevation } = world;
	if (elevation.length !== grid.cellCount) {
		throw new RangeError(
			`A world of resolution ${world.resolution} has ${grid.cellCount} cells; its elevation holds ${elevation.length}`,
		);
	}

	// The selection is this call's own array, so the changed cells are
	// gathered at its front as the loops go: a write never overtakes a read.
	const cells = cellsWithin(grid, [x, y, z], radius);
	const before = new Float32Array(cells.length);
	let count = 0;
	if (mode === 'smooth') {
		count = smoothCells({
			grid,
			elevation,
			cells,
			before,
			centre: [x, y, z],
			radius,
			amount: strength,
		});
	} else {
		const { centres } = grid;
		const signed = mode === 'lower' ? -strength : strength;
		for (let k = 0; k < cells.length; k++) {
			const cell = cells[k] as number;
			const old = elevation[cell] as number;
			const moved = old + signed * weightAt(centres, cell, x, y, z, radius);
			const next = Math.fround(
				Math.min(MAX_ELEVATION_M, Math.max(MIN_ELEVATION_M, moved)),
			);
			if (next !== old) {
				elevation[cell] = next;
				cells[count] = cell;
				before[count] = old;
				count++;
			}
		}
	}
	return {
		cells: cells.subarray(0, count),
		before: before.subarray(0, count),
	};
};

/**
 * The places to dab between two positions of a brush: unit directions
 * along the shorter great-circle arc from one to the other.
 *
 * @remarks
 * The arc is cut into the fewest equal steps no longer than the spacing.
 * The start is left out, since the dab before this path landed there, and
 * the end is always included: two positions that coincide give the end
 * alone, so a brush held still keeps dabbing where it is.
 *
 * Opposite positions have no shortest arc; one is chosen, the same every
 * time for the same start.
 *
 * @param from - Where the last dab landed; any finite, non-zero vector.
 * @param to - Where the brush is now; any finite, non-zero vector.
 * @param spacing - The greatest angle between one dab and the next, in
 * radians; positive.
 * @returns At least one direction, the last being `to` at unit length.
 * @throws RangeError if either position is zero or not finite, the spacing
 * is not positive, or it is so small that the arc would take more than
 * {@link MAX_STROKE_STEPS} steps.
 */
export const strokePath = (from: Vec3, to: Vec3, spacing: number): Vec3[] => {
	if (!(spacing > 0)) {
		throw new RangeError(
			`The spacing of dabs must be a positive angle in radians; got ${spacing}`,
		);
	}
	const a = unit(from);
	const b = unit(to);
	const cos = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
	// The part of the end at right angles to the start points along the arc.
	const px = b[0] - cos * a[0];
	const py = b[1] - cos * a[1];
	const pz = b[2] - cos * a[2];
	const sin = Math.hypot(px, py, pz);
	const angle = Math.atan2(sin, cos);
	const steps = Math.max(1, Math.ceil(angle / spacing));
	if (!(steps <= MAX_STROKE_STEPS)) {
		throw new RangeError(
			`A path of dabs takes at most ${MAX_STROKE_STEPS} steps; a spacing of ${spacing} radians over ${angle} would take ${steps}`,
		);
	}
	if (steps === 1) {
		return [b];
	}
	// Positions that are all but the same or opposite give no usable
	// direction of travel; any will do, since the arc is then a point or
	// one of the equally short ways round.
	const e: Vec3 =
		sin > PARALLEL_EPSILON
			? [px / sin, py / sin, pz / sin]
			: perpendicularTo(a);
	const path: Vec3[] = [];
	for (let step = 1; step < steps; step++) {
		const along = (angle * step) / steps;
		const c = Math.cos(along);
		const s = Math.sin(along);
		path.push([c * a[0] + s * e[0], c * a[1] + s * e[1], c * a[2] + s * e[2]]);
	}
	path.push(b);
	return path;
};
