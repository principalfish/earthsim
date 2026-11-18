/**
 * A history of edits to a world's terrain, for undoing and redoing them.
 *
 * One entry is one edit, such as a stroke of a brush: the cells it changed,
 * with the elevation each held before and after. Undoing writes the
 * before-values back and redoing writes the after-values, strictly in the
 * order the edits were made. An entry is therefore only ever applied to the
 * terrain it was recorded against, and every step restores that terrain bit
 * for bit, however many edits overlapped.
 *
 * Only elevation is recorded. A world's sea level and other settings are not
 * part of its history.
 */

import type { World } from './world';

/** The most edits a history keeps unless told otherwise. */
export const DEFAULT_MAX_HISTORY_STROKES = 100;

/**
 * The most stored data a history keeps unless told otherwise, in bytes as
 * {@link HISTORY_BYTES_PER_CELL} counts them: 64 MiB.
 */
export const DEFAULT_MAX_HISTORY_BYTES = 64 * 1024 * 1024;

/**
 * What one changed cell of one edit is counted as costing, in bytes: a
 * 4-byte cell index and two 4-byte elevations, before and after.
 *
 * @remarks
 * An estimate of the data alone, which leaves out the small fixed cost of
 * each entry. It depends only on how many cells an edit changed, so the
 * total a history reports is the same on every machine.
 */
export const HISTORY_BYTES_PER_CELL = 12;

/** The limits of a history. */
export type HistoryOptions = {
	/**
	 * The most edits kept: a whole number, at least 1.
	 * {@link DEFAULT_MAX_HISTORY_STROKES} by default.
	 */
	readonly maxStrokes?: number;
	/**
	 * The most stored data kept, in bytes at {@link HISTORY_BYTES_PER_CELL}
	 * a changed cell: positive, and may be infinite.
	 * {@link DEFAULT_MAX_HISTORY_BYTES} by default.
	 */
	readonly maxBytes?: number;
};

/**
 * An edit that has just been made to a world's terrain: the cells it
 * touched and what they held before it.
 *
 * @remarks
 * The two arrays are parallel. Each cell must be listed once: a cell listed
 * twice with different values could not be put back exactly.
 */
export type TerrainEdit = {
	/** Indices of the cells the edit touched, each once, in any order. */
	readonly cells: Int32Array;
	/** The elevation each of those cells held before the edit, in metres. */
	readonly before: Float32Array;
};

/**
 * The edits made to one world, newest last, and those undone since.
 *
 * @remarks
 * A history belongs to one world at a time. Before it is used with another
 * world it must be cleared: its entries describe the old one's terrain.
 * Only a world of a different size can be told apart, and using one is
 * refused with a RangeError that changes nothing.
 */
export type History = {
	/** Whether there is an edit to undo. */
	readonly canUndo: boolean;
	/** Whether there is an undone edit to redo. */
	readonly canRedo: boolean;
	/** How many edits can be undone. */
	readonly undoCount: number;
	/** How many undone edits can be redone. */
	readonly redoCount: number;
	/**
	 * The stored data of every entry, undone ones included, in bytes at
	 * {@link HISTORY_BYTES_PER_CELL} a changed cell.
	 */
	readonly bytes: number;
	/**
	 * Records an edit that has just been made to the world.
	 *
	 * @remarks
	 * The after-values are read from the world, so this must be called
	 * after the edit and before anything else changes the terrain. The
	 * history copies what it keeps: the edit's arrays stay the caller's.
	 *
	 * An edit that left every cell it lists exactly as it was, or lists
	 * none, adds no entry and leaves the undone edits redoable. Any other
	 * edit discards the undone edits, since they no longer follow from the
	 * terrain, and then the oldest entries for as long as there are more
	 * than `maxStrokes` or their data comes to more than `maxBytes`. The
	 * newest edit is never dropped: one that is larger than `maxBytes` by
	 * itself is kept as the only entry, over the limit, so that the last
	 * thing done can always be undone.
	 *
	 * @param world - The world as the edit left it.
	 * @param edit - The cells the edit touched and their values before it.
	 * @returns Whether an entry was added.
	 * @throws RangeError if the edit's arrays differ in length, if a cell
	 * index is not a cell of the world, or if the history holds entries of
	 * a world of another size. Nothing is recorded or discarded.
	 */
	commit(world: World, edit: TerrainEdit): boolean;
	/**
	 * Takes back the newest edit, writing its before-values to the world.
	 *
	 * @param world - The world the edits were made to, as the newest left
	 * it.
	 * @returns The cells that were written, in an array of the caller's
	 * own, or null if there was nothing to undo and the world is untouched.
	 * @throws RangeError if the world is not the size of the one recorded;
	 * nothing is changed.
	 */
	undo(world: World): Int32Array | null;
	/**
	 * Makes the most recently undone edit again, writing its after-values
	 * to the world.
	 *
	 * @param world - The world the edits were made to, as the undo left it.
	 * @returns The cells that were written, in an array of the caller's
	 * own, or null if there was nothing to redo and the world is untouched.
	 * @throws RangeError if the world is not the size of the one recorded;
	 * nothing is changed.
	 */
	redo(world: World): Int32Array | null;
	/** Forgets every entry, as for a world that has been replaced. */
	clear(): void;
};

/** One recorded edit. The three arrays are parallel and the history's own. */
type Entry = {
	readonly cells: Int32Array;
	readonly before: Float32Array;
	readonly after: Float32Array;
};

const entryBytes = (entry: Entry): number =>
	entry.cells.length * HISTORY_BYTES_PER_CELL;

const writeValues = (
	world: World,
	cells: Int32Array,
	values: Float32Array,
): void => {
	const { elevation } = world;
	for (let k = 0; k < cells.length; k++) {
		elevation[cells[k] as number] = values[k] as number;
	}
};

/**
 * Creates an empty history.
 *
 * @param options - The limits; the defaults when left out.
 * @returns The history.
 * @throws RangeError if `maxStrokes` is not a whole number of at least 1,
 * or `maxBytes` is not a positive number.
 */
export const createHistory = (options: HistoryOptions = {}): History => {
	const {
		maxStrokes = DEFAULT_MAX_HISTORY_STROKES,
		maxBytes = DEFAULT_MAX_HISTORY_BYTES,
	} = options;
	if (!Number.isInteger(maxStrokes) || maxStrokes < 1) {
		throw new RangeError(
			`A history must keep a whole number of strokes, at least 1; got ${maxStrokes}`,
		);
	}
	if (!(maxBytes > 0)) {
		throw new RangeError(
			`A history must keep a positive number of bytes; got ${maxBytes}`,
		);
	}

	/** Edits that can be undone, oldest first. */
	const done: Entry[] = [];
	/** Edits that were undone, the first undone first. */
	const undone: Entry[] = [];
	let bytes = 0;
	/** The length of the elevation array the entries were recorded on. */
	let cellCount = 0;

	const requireSameWorld = (world: World): void => {
		if (world.elevation.length !== cellCount) {
			throw new RangeError(
				`The history holds edits of a world of ${cellCount} cells, not of one of ${world.elevation.length}: clear it before using it with another world`,
			);
		}
	};

	return {
		get canUndo(): boolean {
			return done.length > 0;
		},
		get canRedo(): boolean {
			return undone.length > 0;
		},
		get undoCount(): number {
			return done.length;
		},
		get redoCount(): number {
			return undone.length;
		},
		get bytes(): number {
			return bytes;
		},
		commit: (world, edit) => {
			const { elevation } = world;
			if (edit.cells.length !== edit.before.length) {
				throw new RangeError(
					`An edit must give one earlier value for every cell; got ${edit.cells.length} cells and ${edit.before.length} values`,
				);
			}
			if (done.length + undone.length > 0) {
				requireSameWorld(world);
			}
			const cells = edit.cells.slice();
			const before = edit.before.slice();
			const after = new Float32Array(cells.length);
			let changed = false;
			for (let k = 0; k < cells.length; k++) {
				const cell = cells[k] as number;
				if (cell < 0 || cell >= elevation.length) {
					throw new RangeError(
						`An edit must list cells from 0 to ${elevation.length - 1}; got ${cell}`,
					);
				}
				const value = elevation[cell] as number;
				after[k] = value;
				// Compared as Object.is does, so that a zero whose sign
				// changed counts as changed.
				changed ||= !Object.is(value, before[k]);
			}
			if (!changed) {
				return false;
			}

			for (const entry of undone) {
				bytes -= entryBytes(entry);
			}
			undone.length = 0;
			const added = { cells, before, after };
			done.push(added);
			bytes += entryBytes(added);
			cellCount = elevation.length;
			while (
				done.length > maxStrokes ||
				(bytes > maxBytes && done.length > 1)
			) {
				bytes -= entryBytes(done.shift() as Entry);
			}
			return true;
		},
		undo: (world) => {
			const entry = done[done.length - 1];
			if (entry === undefined) {
				return null;
			}
			requireSameWorld(world);
			writeValues(world, entry.cells, entry.before);
			done.pop();
			undone.push(entry);
			return entry.cells.slice();
		},
		redo: (world) => {
			const entry = undone[undone.length - 1];
			if (entry === undefined) {
				return null;
			}
			requireSameWorld(world);
			writeValues(world, entry.cells, entry.after);
			undone.pop();
			done.push(entry);
			return entry.cells.slice();
		},
		clear: () => {
			done.length = 0;
			undone.length = 0;
			bytes = 0;
		},
	};
};
