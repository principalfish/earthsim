import { describe, expect, it } from 'vitest';
import { applyDab, type DabOptions } from './brush';
import { latLonToDirection } from './grid';
import {
	createHistory,
	DEFAULT_MAX_HISTORY_BYTES,
	DEFAULT_MAX_HISTORY_STROKES,
	HISTORY_BYTES_PER_CELL,
	type History,
	type TerrainEdit,
} from './history';
import * as core from './index';
import {
	BLANK_OCEAN_ELEVATION_M,
	createBlankWorld,
	MAX_ELEVATION_M,
	MIN_ELEVATION_M,
	type World,
} from './world';

/**
 * The bit pattern of every elevation, for comparing terrain exactly: a zero
 * and a negative zero differ.
 */
const bitsOf = (world: World): Uint32Array =>
	new Uint32Array(world.elevation.slice().buffer);

/**
 * Sets cells to values as one edit.
 *
 * @returns What a history is told about it.
 */
const setCells = (
	world: World,
	values: readonly (readonly [cell: number, value: number])[],
): TerrainEdit => {
	const cells = Int32Array.from(values, ([cell]) => cell);
	const before = Float32Array.from(cells, (cell) => world.elevation[cell] ?? 0);
	for (const [cell, value] of values) {
		world.elevation[cell] = value;
	}
	return { cells, before };
};

/**
 * Lays dabs as one stroke.
 *
 * @returns Every cell a dab changed, once, with the value its first dab
 * found.
 */
const stroke = (world: World, dabs: readonly DabOptions[]): TerrainEdit => {
	const first = new Map<number, number>();
	for (const dab of dabs) {
		const { cells, before } = applyDab(world, dab);
		cells.forEach((cell, k) => {
			if (!first.has(cell)) {
				first.set(cell, before[k] as number);
			}
		});
	}
	return {
		cells: Int32Array.from(first.keys()),
		before: Float32Array.from(first.values()),
	};
};

const dabAt = (
	longitude: number,
	mode: DabOptions['mode'] = 'raise',
): DabOptions => ({
	direction: latLonToDirection(20, longitude),
	radiusKm: 900,
	strength: mode === 'smooth' ? 0.5 : 730.3,
	mode,
});

/** Commits `count` edits of one cell each, cells 0, 1, 2 and so on. */
const commitSingles = (history: History, world: World, count: number): void => {
	for (let cell = 0; cell < count; cell++) {
		history.commit(world, setCells(world, [[cell, 100 + cell]]));
	}
};

describe('createHistory', () => {
	it('starts with nothing to undo or redo', () => {
		const history = createHistory();
		expect(history.canUndo).toBe(false);
		expect(history.canRedo).toBe(false);
		expect(history.undoCount).toBe(0);
		expect(history.redoCount).toBe(0);
		expect(history.bytes).toBe(0);
	});

	it('keeps 100 strokes and 64 MiB unless told otherwise', () => {
		expect(DEFAULT_MAX_HISTORY_STROKES).toBe(100);
		expect(DEFAULT_MAX_HISTORY_BYTES).toBe(64 * 1024 * 1024);
		const world = createBlankWorld(64);
		const history = createHistory();
		commitSingles(history, world, 101);
		expect(history.undoCount).toBe(100);
	});

	it('counts a cell index and two elevations for every changed cell', () => {
		expect(HISTORY_BYTES_PER_CELL).toBe(
			Int32Array.BYTES_PER_ELEMENT + 2 * Float32Array.BYTES_PER_ELEMENT,
		);
	});

	it('rejects a number of strokes that is not a whole number of at least 1', () => {
		for (const maxStrokes of [0, -1, 1.5, Number.NaN, Infinity]) {
			expect(() => createHistory({ maxStrokes })).toThrow(RangeError);
		}
		expect(createHistory({ maxStrokes: 1 }).undoCount).toBe(0);
	});

	it('rejects a number of bytes that is not positive', () => {
		for (const maxBytes of [0, -12, Number.NaN]) {
			expect(() => createHistory({ maxBytes })).toThrow(RangeError);
		}
		expect(createHistory({ maxBytes: Infinity }).bytes).toBe(0);
	});

	it('is exported by the core', () => {
		expect(core.createHistory).toBe(createHistory);
	});
});

describe('undo', () => {
	it('restores the exact array a stroke found', () => {
		const world = createBlankWorld(64);
		applyDab(world, dabAt(-30));
		const start = bitsOf(world);
		const history = createHistory();

		const edit = stroke(world, [dabAt(0), dabAt(4), dabAt(8)]);
		expect(history.commit(world, edit)).toBe(true);
		expect(bitsOf(world)).not.toEqual(start);
		expect(history.canUndo).toBe(true);

		expect(history.undo(world)).not.toBeNull();
		expect(bitsOf(world)).toEqual(start);
		expect(history.canUndo).toBe(false);
		expect(history.canRedo).toBe(true);
	});

	it('does nothing when the history is empty', () => {
		const world = createBlankWorld(64);
		applyDab(world, dabAt(0));
		const start = bitsOf(world);
		const history = createHistory();
		expect(history.undo(world)).toBeNull();
		expect(history.redo(world)).toBeNull();
		expect(bitsOf(world)).toEqual(start);
		expect(history.canUndo).toBe(false);
		expect(history.canRedo).toBe(false);
	});

	it('does nothing once every stroke has been undone', () => {
		const world = createBlankWorld(64);
		const start = bitsOf(world);
		const history = createHistory();
		history.commit(world, stroke(world, [dabAt(0)]));
		history.undo(world);
		expect(history.undo(world)).toBeNull();
		expect(bitsOf(world)).toEqual(start);
		expect(history.redoCount).toBe(1);
	});

	it('takes overlapping strokes back one at a time, newest first', () => {
		const world = createBlankWorld(64);
		const history = createHistory();
		const states = [bitsOf(world)];
		for (const dabs of [
			[dabAt(0), dabAt(5)],
			[dabAt(3, 'lower'), dabAt(9, 'lower')],
			[dabAt(4, 'smooth'), dabAt(6, 'smooth')],
			[dabAt(2), dabAt(7, 'lower')],
		]) {
			const edit = stroke(world, dabs);
			expect(edit.cells.length).toBeGreaterThan(100);
			history.commit(world, edit);
			states.push(bitsOf(world));
		}
		// No stroke left the terrain as an earlier one had.
		expect(new Set(states.map((state) => state.join())).size).toBe(5);

		for (let step = 3; step >= 0; step--) {
			expect(history.undo(world)).not.toBeNull();
			expect(bitsOf(world)).toEqual(states[step]);
		}
		expect(history.canUndo).toBe(false);
		for (let step = 1; step <= 4; step++) {
			expect(history.redo(world)).not.toBeNull();
			expect(bitsOf(world)).toEqual(states[step]);
		}
		expect(history.canRedo).toBe(false);
	});

	it('puts a cell that one stroke touched many times back to its value before the stroke', () => {
		const world = createBlankWorld(64);
		applyDab(world, dabAt(0, 'lower'));
		const start = bitsOf(world);
		const history = createHistory();
		const edit = stroke(
			world,
			Array.from({ length: 12 }, (_, k) =>
				dabAt(k % 3, k % 4 ? 'raise' : 'smooth'),
			),
		);
		expect(new Set(edit.cells).size).toBe(edit.cells.length);
		history.commit(world, edit);

		history.undo(world);
		expect(bitsOf(world)).toEqual(start);
	});

	it('restores limits, zeros of either sign and values no decimal writes exactly', () => {
		const world = createBlankWorld(64);
		const awkward = [
			MIN_ELEVATION_M,
			MAX_ELEVATION_M,
			-0,
			0,
			Math.fround(0.1),
			Math.fround(-1e-38),
			1e-45,
		];
		const first = setCells(
			world,
			awkward.map((value, cell) => [cell, value]),
		);
		const history = createHistory();
		history.commit(world, first);
		const before = bitsOf(world);
		expect(Object.is(world.elevation[2], -0)).toBe(true);

		// Each awkward value is replaced by the next, so that it is written
		// back by the undo and written again by the redo.
		history.commit(
			world,
			setCells(
				world,
				awkward.map((_, cell) => [
					cell,
					awkward[(cell + 1) % awkward.length] as number,
				]),
			),
		);
		const after = bitsOf(world);
		expect(Object.is(world.elevation[2], 0)).toBe(true);
		expect(Object.is(world.elevation[1], -0)).toBe(true);

		history.undo(world);
		expect(bitsOf(world)).toEqual(before);
		history.redo(world);
		expect(bitsOf(world)).toEqual(after);
	});

	it('reports the cells it wrote', () => {
		const world = createBlankWorld(64);
		const history = createHistory();
		// One cell on each of three cube faces.
		const faceCells = 64 * 64;
		const cells = [5, faceCells + 7, 4 * faceCells + 9];
		history.commit(
			world,
			setCells(
				world,
				cells.map((cell) => [cell, 250]),
			),
		);
		history.commit(world, setCells(world, [[3 * faceCells, 10]]));

		expect(Array.from(history.undo(world) ?? [])).toEqual([3 * faceCells]);
		expect(Array.from(history.undo(world) ?? [])).toEqual(cells);
		expect(Array.from(history.redo(world) ?? [])).toEqual(cells);
		expect(Array.from(history.redo(world) ?? [])).toEqual([3 * faceCells]);
	});

	it('hands over arrays that are not the ones it keeps', () => {
		const world = createBlankWorld(64);
		const start = bitsOf(world);
		const history = createHistory();
		history.commit(world, setCells(world, [[40, 900]]));
		const changed = bitsOf(world);

		history.undo(world)?.fill(41);
		history.redo(world)?.fill(42);
		expect(bitsOf(world)).toEqual(changed);
		expect(Array.from(history.undo(world) ?? [])).toEqual([40]);
		expect(bitsOf(world)).toEqual(start);
	});
});

describe('redo', () => {
	it('reapplies an undone stroke exactly', () => {
		const world = createBlankWorld(64);
		const history = createHistory();
		history.commit(
			world,
			stroke(world, [dabAt(0), dabAt(4, 'smooth'), dabAt(8)]),
		);
		const after = bitsOf(world);

		history.undo(world);
		expect(history.redo(world)).not.toBeNull();
		expect(bitsOf(world)).toEqual(after);
		expect(history.canUndo).toBe(true);
		expect(history.canRedo).toBe(false);
		expect(history.redo(world)).toBeNull();
		expect(bitsOf(world)).toEqual(after);
	});

	it('reapplies strokes in the order they were made', () => {
		const world = createBlankWorld(64);
		const history = createHistory();
		commitSingles(history, world, 3);
		const after = bitsOf(world);
		history.undo(world);
		history.undo(world);
		expect(Array.from(history.redo(world) ?? [])).toEqual([1]);
		expect(Array.from(history.redo(world) ?? [])).toEqual([2]);
		expect(bitsOf(world)).toEqual(after);
	});
});

describe('commit', () => {
	it('discards the undone strokes when a new stroke is made', () => {
		const world = createBlankWorld(64);
		const history = createHistory();
		commitSingles(history, world, 3);
		history.undo(world);
		history.undo(world);
		expect(history.redoCount).toBe(2);

		history.commit(world, setCells(world, [[1, 555]]));
		const after = bitsOf(world);
		expect(history.canRedo).toBe(false);
		expect(history.undoCount).toBe(2);
		expect(history.bytes).toBe(2 * HISTORY_BYTES_PER_CELL);
		expect(history.redo(world)).toBeNull();
		expect(bitsOf(world)).toEqual(after);

		history.undo(world);
		expect(world.elevation[1]).toBe(BLANK_OCEAN_ELEVATION_M);
		expect(world.elevation[0]).toBe(100);
	});

	it('adds no entry for a stroke that touched no cell', () => {
		const world = createBlankWorld(64);
		const history = createHistory();
		const nothing = { cells: new Int32Array(0), before: new Float32Array(0) };
		expect(history.commit(world, nothing)).toBe(false);
		expect(history.canUndo).toBe(false);
		expect(history.bytes).toBe(0);
	});

	it('adds no entry for a stroke that left every cell exactly as it was', () => {
		const world = createBlankWorld(64);
		const history = createHistory();
		const edit = setCells(world, [
			[3, BLANK_OCEAN_ELEVATION_M],
			[9, BLANK_OCEAN_ELEVATION_M],
		]);
		expect(history.commit(world, edit)).toBe(false);
		expect(history.canUndo).toBe(false);
	});

	it('counts a zero whose sign changed as a change', () => {
		const world = createBlankWorld(64);
		const history = createHistory();
		history.commit(world, setCells(world, [[3, 0]]));
		expect(history.commit(world, setCells(world, [[3, -0]]))).toBe(true);
		history.undo(world);
		expect(Object.is(world.elevation[3], 0)).toBe(true);
	});

	it('leaves the undone strokes redoable after a stroke that changed nothing', () => {
		const world = createBlankWorld(64);
		const history = createHistory();
		commitSingles(history, world, 2);
		const after = bitsOf(world);
		history.undo(world);

		history.commit(world, {
			cells: new Int32Array(0),
			before: new Float32Array(0),
		});
		history.commit(world, setCells(world, [[7, BLANK_OCEAN_ELEVATION_M]]));
		expect(history.redoCount).toBe(1);
		history.redo(world);
		expect(bitsOf(world)).toEqual(after);
	});

	it('keeps copies, so that the arrays it was given can be reused', () => {
		const world = createBlankWorld(64);
		const start = bitsOf(world);
		const history = createHistory();
		const edit = stroke(world, [dabAt(0)]);
		history.commit(world, edit);
		const after = bitsOf(world);
		edit.cells.fill(0);
		edit.before.fill(9999);

		history.undo(world);
		expect(bitsOf(world)).toEqual(start);
		history.redo(world);
		expect(bitsOf(world)).toEqual(after);
	});

	it('reads the after-values when called, not when undone', () => {
		const world = createBlankWorld(64);
		const history = createHistory();
		history.commit(world, setCells(world, [[5, 300]]));
		history.undo(world);
		world.elevation[5] = 77;
		history.redo(world);
		expect(world.elevation[5]).toBe(300);
	});

	it('rejects arrays of different lengths, recording nothing', () => {
		const world = createBlankWorld(64);
		const history = createHistory();
		commitSingles(history, world, 2);
		history.undo(world);
		expect(() =>
			history.commit(world, {
				cells: Int32Array.of(1, 2),
				before: Float32Array.of(5),
			}),
		).toThrow(RangeError);
		expect(history.undoCount).toBe(1);
		expect(history.redoCount).toBe(1);
		expect(history.bytes).toBe(2 * HISTORY_BYTES_PER_CELL);
	});

	it('rejects a cell that is not one of the world, recording nothing', () => {
		const world = createBlankWorld(64);
		const history = createHistory();
		commitSingles(history, world, 2);
		history.undo(world);
		for (const cell of [-1, world.elevation.length]) {
			expect(() =>
				history.commit(world, {
					cells: Int32Array.of(0, cell),
					before: Float32Array.of(-50, -60),
				}),
			).toThrow(RangeError);
		}
		expect(history.undoCount).toBe(1);
		expect(history.redoCount).toBe(1);
		expect(history.bytes).toBe(2 * HISTORY_BYTES_PER_CELL);
		expect(
			history.commit(world, {
				cells: Int32Array.of(world.elevation.length - 1),
				before: Float32Array.of(12),
			}),
		).toBe(true);
	});
});

describe('the cap on strokes', () => {
	it('drops the oldest stroke', () => {
		const world = createBlankWorld(64);
		const history = createHistory({ maxStrokes: 3 });
		commitSingles(history, world, 3);
		expect(history.undoCount).toBe(3);
		expect(history.bytes).toBe(3 * HISTORY_BYTES_PER_CELL);

		history.commit(world, setCells(world, [[3, 103]]));
		expect(history.undoCount).toBe(3);
		expect(history.bytes).toBe(3 * HISTORY_BYTES_PER_CELL);

		expect(Array.from(history.undo(world) ?? [])).toEqual([3]);
		expect(Array.from(history.undo(world) ?? [])).toEqual([2]);
		expect(Array.from(history.undo(world) ?? [])).toEqual([1]);
		expect(history.undo(world)).toBeNull();
		// The stroke that was dropped stays made.
		expect(world.elevation[0]).toBe(100);
		expect(world.elevation[1]).toBe(BLANK_OCEAN_ELEVATION_M);
	});

	it('of one keeps only the newest stroke', () => {
		const world = createBlankWorld(64);
		const history = createHistory({ maxStrokes: 1 });
		commitSingles(history, world, 5);
		expect(history.undoCount).toBe(1);
		expect(Array.from(history.undo(world) ?? [])).toEqual([4]);
	});

	it('is not exceeded by undoing and redoing', () => {
		const world = createBlankWorld(64);
		const history = createHistory({ maxStrokes: 2 });
		commitSingles(history, world, 4);
		history.undo(world);
		history.undo(world);
		history.redo(world);
		history.redo(world);
		expect(history.undoCount).toBe(2);
		expect(history.redoCount).toBe(0);
		expect(history.bytes).toBe(2 * HISTORY_BYTES_PER_CELL);
	});
});

describe('the cap on bytes', () => {
	/** An edit of `count` cells starting at `first`. */
	const wide = (world: World, first: number, count: number): TerrainEdit =>
		setCells(
			world,
			Array.from({ length: count }, (_, k) => [first + k, 2000 + first]),
		);

	it('adds up every entry at 12 bytes a cell, undone ones included', () => {
		const world = createBlankWorld(64);
		const history = createHistory();
		history.commit(world, wide(world, 0, 5));
		history.commit(world, wide(world, 10, 7));
		expect(history.bytes).toBe(12 * 12);
		history.undo(world);
		expect(history.bytes).toBe(12 * 12);
		history.clear();
		expect(history.bytes).toBe(0);
	});

	it('drops the oldest strokes until the rest fit', () => {
		const world = createBlankWorld(64);
		const history = createHistory({ maxBytes: 10 * HISTORY_BYTES_PER_CELL });
		history.commit(world, wide(world, 0, 4));
		history.commit(world, wide(world, 10, 4));
		expect(history.undoCount).toBe(2);
		// Ten cells exactly are within the limit.
		history.commit(world, wide(world, 20, 2));
		expect(history.undoCount).toBe(3);
		expect(history.bytes).toBe(10 * HISTORY_BYTES_PER_CELL);

		history.commit(world, wide(world, 30, 1));
		expect(history.undoCount).toBe(3);
		expect(history.bytes).toBe(7 * HISTORY_BYTES_PER_CELL);
		history.undo(world);
		history.undo(world);
		expect(Array.from(history.undo(world) ?? [])).toEqual([10, 11, 12, 13]);
		expect(history.undo(world)).toBeNull();
		expect(world.elevation[0]).toBe(2000);
	});

	it('lets one large stroke push out several small ones', () => {
		const world = createBlankWorld(64);
		const history = createHistory({ maxBytes: 10 * HISTORY_BYTES_PER_CELL });
		commitSingles(history, world, 6);
		expect(history.undoCount).toBe(6);

		history.commit(world, wide(world, 50, 8));
		expect(history.undoCount).toBe(3);
		expect(history.bytes).toBe(10 * HISTORY_BYTES_PER_CELL);
		expect(history.undo(world)?.length).toBe(8);
		expect(Array.from(history.undo(world) ?? [])).toEqual([5]);
		expect(Array.from(history.undo(world) ?? [])).toEqual([4]);
		expect(history.undo(world)).toBeNull();
	});

	it('keeps a stroke larger than the whole cap as the only entry', () => {
		const world = createBlankWorld(64);
		const history = createHistory({ maxBytes: 10 * HISTORY_BYTES_PER_CELL });
		commitSingles(history, world, 4);
		const before = bitsOf(world);

		history.commit(world, wide(world, 50, 11));
		const after = bitsOf(world);
		expect(history.undoCount).toBe(1);
		expect(history.bytes).toBe(11 * HISTORY_BYTES_PER_CELL);
		expect(history.undo(world)?.length).toBe(11);
		expect(bitsOf(world)).toEqual(before);
		expect(history.undo(world)).toBeNull();
		history.redo(world);
		expect(bitsOf(world)).toEqual(after);

		// The next stroke pushes the oversized one out like any other.
		history.commit(world, wide(world, 100, 1));
		expect(history.undoCount).toBe(1);
		expect(history.bytes).toBe(HISTORY_BYTES_PER_CELL);
	});

	it('applies together with the cap on strokes', () => {
		const world = createBlankWorld(64);
		const history = createHistory({
			maxStrokes: 2,
			maxBytes: 10 * HISTORY_BYTES_PER_CELL,
		});
		commitSingles(history, world, 3);
		expect(history.undoCount).toBe(2);
		history.commit(world, wide(world, 50, 10));
		expect(history.undoCount).toBe(1);
	});
});

describe('clear', () => {
	it('forgets the strokes made and the strokes undone', () => {
		const world = createBlankWorld(64);
		const history = createHistory();
		commitSingles(history, world, 3);
		history.undo(world);
		const kept = bitsOf(world);

		history.clear();
		expect(history.canUndo).toBe(false);
		expect(history.canRedo).toBe(false);
		expect(history.undoCount).toBe(0);
		expect(history.redoCount).toBe(0);
		expect(history.bytes).toBe(0);
		expect(history.undo(world)).toBeNull();
		expect(history.redo(world)).toBeNull();
		expect(bitsOf(world)).toEqual(kept);
	});

	it('makes the history ready for a world of another size', () => {
		const small = createBlankWorld(64);
		const large = createBlankWorld(128);
		const history = createHistory();
		commitSingles(history, small, 2);
		history.clear();

		const cell = large.elevation.length - 1;
		expect(history.commit(large, setCells(large, [[cell, 40]]))).toBe(true);
		expect(Array.from(history.undo(large) ?? [])).toEqual([cell]);
		expect(large.elevation[cell]).toBe(BLANK_OCEAN_ELEVATION_M);
	});
});

describe('a world of another size', () => {
	it('is refused by undo and redo, which change nothing', () => {
		const small = createBlankWorld(64);
		const large = createBlankWorld(128);
		const history = createHistory();
		commitSingles(history, small, 2);
		history.undo(small);
		const untouched = bitsOf(large);

		expect(() => history.undo(large)).toThrow(RangeError);
		expect(() => history.redo(large)).toThrow(RangeError);
		expect(bitsOf(large)).toEqual(untouched);
		expect(history.undoCount).toBe(1);
		expect(history.redoCount).toBe(1);
		expect(Array.from(history.redo(small) ?? [])).toEqual([1]);
	});

	it('is refused by commit while the history holds entries, done or undone', () => {
		const small = createBlankWorld(64);
		const large = createBlankWorld(128);
		const history = createHistory();
		commitSingles(history, small, 1);
		expect(() => history.commit(large, setCells(large, [[0, 5]]))).toThrow(
			RangeError,
		);
		history.undo(small);
		expect(() => history.commit(large, setCells(large, [[1, 5]]))).toThrow(
			RangeError,
		);
		expect(history.undoCount).toBe(0);
		expect(history.redoCount).toBe(1);
	});
});
