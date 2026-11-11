import { describe, expect, it } from 'vitest';
import {
	createBlankWorld,
	createHistory,
	DEFAULT_SEA_LEVEL_M,
	generateWorld,
	type History,
	normaliseSeaLevel,
	type World,
} from '../core/index';
import { createAppState } from './appState';
import {
	createUndoController,
	type HistoryState,
	type UndoController,
} from './undo';

/** An undo controller on a world, with a stub in place of the globe. */
type Stage = {
	readonly history: History;
	readonly edits: UndoController;
	/** Every state the page was told of, in order. */
	readonly states: HistoryState[];
	/** How many uploads the globe was asked for. */
	uploads: number;
};

const createStage = (world: World): Stage => {
	const history = createHistory();
	const stage: Stage = {
		history,
		states: [],
		uploads: 0,
		edits: createUndoController({
			world,
			history,
			globe: {
				updateElevation: () => {
					stage.uploads++;
				},
			},
			isStrokeActive: () => false,
			onHistoryChange: (state) => stage.states.push(state),
		}),
	};
	return stage;
};

/** Changes one cell of a world as a stroke would, and records it. */
const stroke = (world: World, edits: UndoController, cell: number): void => {
	const before = world.elevation[cell] as number;
	world.elevation[cell] = before + 500;
	edits.commit({ cells: Int32Array.of(cell), before: Float32Array.of(before) });
};

describe('createAppState', () => {
	it('starts on the world it is given, as it is', () => {
		const world = createBlankWorld(64);
		world.seaLevel = normaliseSeaLevel(250);
		const calls: World[] = [];
		const state = createAppState({
			world,
			listeners: [(next) => calls.push(next)],
		});
		expect(state.world).toBe(world);
		expect(state.world.seaLevel).toBe(250);
		expect(calls).toEqual([]);
	});
});

describe('replaceWorld', () => {
	it('makes the new world the current one', () => {
		const state = createAppState({ world: createBlankWorld(64) });
		const next = createBlankWorld(128);
		state.replaceWorld(next);
		expect(state.world).toBe(next);
	});

	it('resets the sea level of the new world to the default', () => {
		const first = createBlankWorld(64);
		first.seaLevel = normaliseSeaLevel(300);
		const state = createAppState({ world: first });

		const next = generateWorld({ seed: 7, landFraction: 0.3 });
		next.seaLevel = normaliseSeaLevel(-1200);
		const seen: number[] = [];
		state.addListener((world) => seen.push(world.seaLevel));
		state.replaceWorld(next);

		expect(next.seaLevel).toBe(DEFAULT_SEA_LEVEL_M);
		expect(state.world.seaLevel).toBe(DEFAULT_SEA_LEVEL_M);
		// Already reset by the time anything is told.
		expect(seen).toEqual([DEFAULT_SEA_LEVEL_M]);
		// The world replaced is left as it was.
		expect(first.seaLevel).toBe(300);
	});

	it('tells every listener once, in the order added, with the new world', () => {
		const calls: string[] = [];
		const worlds: World[] = [];
		const listener =
			(name: string) =>
			(world: World): void => {
				calls.push(name);
				worlds.push(world);
			};
		const state = createAppState({
			world: createBlankWorld(64),
			listeners: [listener('first'), listener('second')],
		});
		state.addListener(listener('third'));

		const next = createBlankWorld(256);
		state.replaceWorld(next);
		expect(calls).toEqual(['first', 'second', 'third']);
		expect(worlds).toHaveLength(3);
		expect(worlds.every((world) => world === next)).toBe(true);
	});

	it('has already made the new world current when a listener is told', () => {
		const state = createAppState({ world: createBlankWorld(64) });
		const current: World[] = [];
		state.addListener(() => current.push(state.world));
		const next = createBlankWorld(128);
		state.replaceWorld(next);
		expect(current).toHaveLength(1);
		expect(current[0]).toBe(next);
	});

	it('does not tell a listener of a world that was current before it was added', () => {
		const state = createAppState({ world: createBlankWorld(64) });
		state.replaceWorld(createBlankWorld(128));

		const calls: World[] = [];
		state.addListener((world) => calls.push(world));
		expect(calls).toEqual([]);

		const next = createBlankWorld(64);
		state.replaceWorld(next);
		expect(calls).toHaveLength(1);
		expect(calls[0]).toBe(next);
	});

	it('leaves a listener added during the calls until the next replacement', () => {
		const state = createAppState({ world: createBlankWorld(64) });
		const late: World[] = [];
		let added = false;
		state.addListener(() => {
			if (!added) {
				added = true;
				state.addListener((world) => late.push(world));
			}
		});
		state.replaceWorld(createBlankWorld(64));
		expect(late).toEqual([]);

		const next = createBlankWorld(128);
		state.replaceWorld(next);
		expect(late).toHaveLength(1);
		expect(late[0]).toBe(next);
	});

	it('clears the history of strokes, so that undo has nothing to undo', () => {
		const first = createBlankWorld(64);
		const stage = createStage(first);
		const state = createAppState({
			world: first,
			listeners: [stage.edits.setWorld],
		});
		stroke(first, stage.edits, 10);
		stroke(first, stage.edits, 20);
		stage.edits.perform('undo');
		expect(stage.edits.state).toEqual({ canUndo: true, canRedo: true });
		const uploads = stage.uploads;
		const told = stage.states.length;

		const next = createBlankWorld(128);
		const untouched = next.elevation.slice();
		const left = first.elevation.slice();
		state.replaceWorld(next);

		expect(stage.edits.state).toEqual({ canUndo: false, canRedo: false });
		expect(stage.history.canUndo).toBe(false);
		expect(stage.history.canRedo).toBe(false);
		// The page hears of the emptied history exactly once.
		expect(stage.states.slice(told)).toEqual([
			{ canUndo: false, canRedo: false },
		]);
		expect(stage.edits.perform('undo')).toBe(false);
		expect(stage.edits.perform('redo')).toBe(false);
		expect(stage.uploads).toBe(uploads);
		expect(next.elevation).toEqual(untouched);
		expect(first.elevation).toEqual(left);

		// Strokes made from now on are recorded against the new world.
		stroke(next, stage.edits, 30);
		expect(stage.edits.perform('undo')).toBe(true);
		expect(next.elevation).toEqual(untouched);
	});

	it('clears the history when the new world is the same size', () => {
		const first = createBlankWorld(64);
		const stage = createStage(first);
		const state = createAppState({
			world: first,
			listeners: [stage.edits.setWorld],
		});
		stroke(first, stage.edits, 10);

		const next = createBlankWorld(64);
		const untouched = next.elevation.slice();
		state.replaceWorld(next);
		expect(stage.edits.state).toEqual({ canUndo: false, canRedo: false });
		expect(stage.edits.perform('undo')).toBe(false);
		expect(next.elevation).toEqual(untouched);
	});

	it('does everything again when given the world that is already current', () => {
		const world = createBlankWorld(64);
		const stage = createStage(world);
		const calls: World[] = [];
		const state = createAppState({
			world,
			listeners: [stage.edits.setWorld, (next) => calls.push(next)],
		});
		stroke(world, stage.edits, 10);
		world.seaLevel = normaliseSeaLevel(400);

		state.replaceWorld(world);
		expect(state.world).toBe(world);
		expect(world.seaLevel).toBe(DEFAULT_SEA_LEVEL_M);
		expect(stage.edits.state).toEqual({ canUndo: false, canRedo: false });
		expect(calls).toHaveLength(1);
		expect(calls[0]).toBe(world);
	});

	it('still tells the other listeners when one throws, then throws its error', () => {
		const failure = new Error('the globe is gone');
		const calls: string[] = [];
		const state = createAppState({
			world: createBlankWorld(64),
			listeners: [
				() => calls.push('before'),
				() => {
					throw failure;
				},
				() => calls.push('after'),
			],
		});
		const next = createBlankWorld(128);
		next.seaLevel = normaliseSeaLevel(90);

		let thrown: unknown;
		try {
			state.replaceWorld(next);
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toBe(failure);
		expect(calls).toEqual(['before', 'after']);
		expect(state.world).toBe(next);
		expect(next.seaLevel).toBe(DEFAULT_SEA_LEVEL_M);

		// The failure is not remembered: the next replacement runs as usual.
		calls.length = 0;
		expect(() => state.replaceWorld(createBlankWorld(64))).toThrow(failure);
		expect(calls).toEqual(['before', 'after']);
	});

	it('throws every error together when several listeners throw', () => {
		const first = new Error('first');
		const calls: string[] = [];
		const state = createAppState({
			world: createBlankWorld(64),
			listeners: [
				() => {
					throw first;
				},
				() => calls.push('between'),
				() => {
					throw 'second';
				},
			],
		});

		let thrown: unknown;
		try {
			state.replaceWorld(createBlankWorld(64));
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toBeInstanceOf(AggregateError);
		expect((thrown as AggregateError).errors).toEqual([first, 'second']);
		expect(calls).toEqual(['between']);
	});

	it('refuses to replace the world from inside a listener', () => {
		const first = createBlankWorld(64);
		const state = createAppState({ world: first });
		const other = createBlankWorld(256);
		other.seaLevel = normaliseSeaLevel(75);
		const calls: World[] = [];
		state.addListener(() => state.replaceWorld(other));
		state.addListener((world) => calls.push(world));

		const next = createBlankWorld(128);
		expect(() => state.replaceWorld(next)).toThrow(
			'cannot be replaced while a replacement is being announced',
		);
		expect(state.world).toBe(next);
		expect(calls).toHaveLength(1);
		expect(calls[0]).toBe(next);
		expect(other.seaLevel).toBe(75);

		// The refusal does not leave the state stuck announcing.
		const state2 = createAppState({ world: first });
		let reentered = false;
		state2.addListener(() => {
			if (!reentered) {
				reentered = true;
				expect(() => state2.replaceWorld(other)).toThrow();
			}
		});
		state2.replaceWorld(next);
		state2.replaceWorld(other);
		expect(state2.world).toBe(other);
	});
});
