import { describe, expect, it } from 'vitest';
import {
	createBlankWorld,
	createHistory,
	DEFAULT_PLANET,
	DEFAULT_SEA_LEVEL_M,
	generateWorld,
	type History,
	MAX_ELEVATION_M,
	MIN_ELEVATION_M,
	normaliseSeaLevel,
	PLANET_LIMITS,
	type PlanetSettings,
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

describe('replaceWorld keeping the settings', () => {
	/** The range of a sea-level control narrower than the elevations. */
	const RANGE = { minM: -6000, maxM: 6000 };

	it('keeps the sea level the world comes with', () => {
		const state = createAppState({
			world: createBlankWorld(64),
			seaLevelRange: RANGE,
		});
		const seen: number[] = [];
		state.addListener((world) => seen.push(world.seaLevel));
		for (const metres of [0, 250, -1200, 6000, -6000, 0.1]) {
			const next = generateWorld({ seed: 7, landFraction: 0.3 });
			next.seaLevel = normaliseSeaLevel(metres);
			state.replaceWorld(next, { keepSettings: true });
			expect(state.world).toBe(next);
			expect(next.seaLevel).toBe(normaliseSeaLevel(metres));
			// Already settled by the time anything is told.
			expect(seen.at(-1)).toBe(normaliseSeaLevel(metres));
		}
	});

	it('brings a sea level outside the range to its nearer end', () => {
		const state = createAppState({
			world: createBlankWorld(64),
			seaLevelRange: RANGE,
		});
		const kept = (metres: number): number => {
			const next = createBlankWorld(64);
			next.seaLevel = metres;
			state.replaceWorld(next, { keepSettings: true });
			return state.world.seaLevel;
		};
		expect(kept(6000.5)).toBe(6000);
		expect(kept(MAX_ELEVATION_M)).toBe(6000);
		expect(kept(Infinity)).toBe(6000);
		expect(kept(-6010)).toBe(-6000);
		expect(kept(MIN_ELEVATION_M)).toBe(-6000);
		expect(kept(-Infinity)).toBe(-6000);
	});

	it('stores the kept sea level in single precision', () => {
		const state = createAppState({
			world: createBlankWorld(64),
			seaLevelRange: RANGE,
		});
		const next = createBlankWorld(64);
		next.seaLevel = 123.456789;
		state.replaceWorld(next, { keepSettings: true });
		expect(next.seaLevel).toBe(Math.fround(123.456789));
	});

	it('keeps any sea level within the elevation limits when given no range', () => {
		const state = createAppState({ world: createBlankWorld(64) });
		const kept = (metres: number): number => {
			const next = createBlankWorld(64);
			next.seaLevel = metres;
			state.replaceWorld(next, { keepSettings: true });
			return state.world.seaLevel;
		};
		expect(kept(9000)).toBe(9000);
		expect(kept(-11_000)).toBe(-11_000);
		expect(kept(20_000)).toBe(MAX_ELEVATION_M);
		expect(kept(-20_000)).toBe(MIN_ELEVATION_M);
	});

	it('resets the sea level unless asked to keep it', () => {
		const state = createAppState({
			world: createBlankWorld(64),
			seaLevelRange: RANGE,
		});
		for (const options of [undefined, {}, { keepSettings: false }]) {
			const next = createBlankWorld(64);
			next.seaLevel = normaliseSeaLevel(300);
			state.replaceWorld(next, options);
			expect(next.seaLevel).toBe(DEFAULT_SEA_LEVEL_M);
		}
	});

	it('clears the history and tells every listener, as any replacement does', () => {
		const first = createBlankWorld(64);
		const stage = createStage(first);
		const calls: World[] = [];
		const state = createAppState({
			world: first,
			listeners: [stage.edits.setWorld, (world) => calls.push(world)],
			seaLevelRange: RANGE,
		});
		stroke(first, stage.edits, 10);

		const next = createBlankWorld(128);
		next.seaLevel = normaliseSeaLevel(450);
		state.replaceWorld(next, { keepSettings: true });
		expect(stage.edits.state).toEqual({ canUndo: false, canRedo: false });
		expect(calls).toEqual([next]);
		expect(next.seaLevel).toBe(450);
	});

	it('refuses a sea level that is not a number, changing nothing', () => {
		const first = createBlankWorld(64);
		const calls: World[] = [];
		const state = createAppState({
			world: first,
			listeners: [(world) => calls.push(world)],
			seaLevelRange: RANGE,
		});
		const next = createBlankWorld(128);
		next.seaLevel = Number.NaN;
		expect(() => state.replaceWorld(next, { keepSettings: true })).toThrow(
			RangeError,
		);
		expect(state.world).toBe(first);
		expect(next.seaLevel).toBeNaN();
		expect(calls).toEqual([]);
	});

	it('refuses a range whose lowest level is not at or below its highest', () => {
		const world = createBlankWorld(64);
		for (const seaLevelRange of [
			{ minM: 1, maxM: 0 },
			{ minM: Number.NaN, maxM: 0 },
			{ minM: 0, maxM: Number.NaN },
		]) {
			expect(() => createAppState({ world, seaLevelRange })).toThrow(
				RangeError,
			);
		}
		expect(() =>
			createAppState({ world, seaLevelRange: { minM: 0, maxM: 0 } }),
		).not.toThrow();
	});
});

describe('replaceWorld and the planet and date', () => {
	/** Settings unlike Earth's in every way. */
	const ALIEN: PlanetSettings = {
		axialTiltDeg: 60,
		starBrightness: 2.5,
		starMass: 0.8,
		orbitDistanceAu: 1.5,
		greenhouseStrength: 0.5,
		dayLengthHours: 10,
	};

	/** A world as if read from a file: with settings and a date of its own. */
	const loadedWorld = (): World => {
		const world = createBlankWorld(64);
		world.planet = { ...ALIEN };
		world.ageYears = 12_000;
		return world;
	};

	it('keeps the planet and date of a world read from a file or storage', () => {
		const state = createAppState({ world: createBlankWorld(64) });
		const seen: World[] = [];
		state.addListener((world) => seen.push({ ...world }));
		const next = loadedWorld();
		state.replaceWorld(next, { keepSettings: true });
		expect(state.world.planet).toEqual(ALIEN);
		expect(state.world.ageYears).toBe(12_000);
		// Already settled by the time anything is told.
		expect(seen[0]?.planet).toEqual(ALIEN);
		expect(seen[0]?.ageYears).toBe(12_000);
	});

	it('gives a new world Earth’s settings and year zero', () => {
		const state = createAppState({ world: loadedWorld() });
		for (const options of [undefined, {}, { keepSettings: false }]) {
			const next = loadedWorld();
			state.replaceWorld(next, options);
			expect(next.planet).toEqual(DEFAULT_PLANET);
			expect(next.planet).not.toBe(DEFAULT_PLANET);
			expect(next.ageYears).toBe(0);
		}
	});

	it('keeps nothing of the planet and date of the world it replaces', () => {
		const first = loadedWorld();
		const state = createAppState({ world: first });
		const next = createBlankWorld(64);
		state.replaceWorld(next, { keepSettings: true });
		expect(state.world.planet).toEqual(DEFAULT_PLANET);
		expect(state.world.ageYears).toBe(0);
		expect(first.planet).toEqual(ALIEN);
	});

	it('brings a kept setting beyond its limits to the limit', () => {
		const state = createAppState({ world: createBlankWorld(64) });
		const next = createBlankWorld(64);
		next.planet = { ...ALIEN, starMass: 50, axialTiltDeg: -5 };
		state.replaceWorld(next, { keepSettings: true });
		expect(next.planet).toEqual({
			...ALIEN,
			starMass: PLANET_LIMITS.starMass.max,
			axialTiltDeg: PLANET_LIMITS.axialTiltDeg.min,
		});
	});

	it('refuses a kept setting that is not a number, changing nothing', () => {
		const first = createBlankWorld(64);
		const calls: World[] = [];
		const state = createAppState({
			world: first,
			listeners: [(world) => calls.push(world)],
		});
		const next = loadedWorld();
		next.seaLevel = normaliseSeaLevel(250);
		next.planet = { ...ALIEN, starBrightness: Number.NaN };
		expect(() => state.replaceWorld(next, { keepSettings: true })).toThrow(
			RangeError,
		);
		expect(state.world).toBe(first);
		expect(next.seaLevel).toBe(250);
		expect(next.planet.starBrightness).toBeNaN();
		expect(next.ageYears).toBe(12_000);
		expect(calls).toEqual([]);
	});

	it('refuses a kept date that is negative or not finite, changing nothing', () => {
		const first = createBlankWorld(64);
		const state = createAppState({ world: first });
		for (const ageYears of [-1, Number.NaN, Infinity]) {
			const next = loadedWorld();
			next.seaLevel = normaliseSeaLevel(250);
			next.ageYears = ageYears;
			expect(
				() => state.replaceWorld(next, { keepSettings: true }),
				String(ageYears),
			).toThrow(RangeError);
			expect(state.world).toBe(first);
			expect(next.seaLevel).toBe(250);
			expect(next.planet).toEqual(ALIEN);
			expect(next.ageYears).toBe(ageYears);
		}
	});

	it('resets a new world’s settings even when they are not valid', () => {
		const state = createAppState({ world: createBlankWorld(64) });
		const next = createBlankWorld(64);
		next.planet = { ...ALIEN, starMass: Number.NaN };
		next.ageYears = -1;
		state.replaceWorld(next);
		expect(next.planet).toEqual(DEFAULT_PLANET);
		expect(next.ageYears).toBe(0);
	});
});

describe('replaceWorld keeping the sea level on a control with a step', () => {
	/** The levels of a sea-level slider: every 10 m from −6,000 to 6,000. */
	const STEPPED = { minM: -6000, maxM: 6000, stepM: 10 };

	const createKeeper = (
		seaLevelRange = STEPPED,
	): ((metres: number) => number) => {
		const state = createAppState({
			world: createBlankWorld(64),
			seaLevelRange,
		});
		return (metres) => {
			const next = createBlankWorld(64);
			next.seaLevel = metres;
			state.replaceWorld(next, { keepSettings: true });
			expect(next.seaLevel).toBe(state.world.seaLevel);
			return state.world.seaLevel;
		};
	};

	it('rounds the sea level to the nearest level the control has', () => {
		const kept = createKeeper();
		expect(kept(123.4)).toBe(120);
		expect(kept(126)).toBe(130);
		expect(kept(-123.4)).toBe(-120);
		expect(kept(-126)).toBe(-130);
		expect(kept(4.9)).toBe(0);
	});

	it('rounds a sea level halfway between two levels to the higher', () => {
		const kept = createKeeper();
		expect(kept(125)).toBe(130);
		expect(kept(5)).toBe(10);
		expect(kept(-125)).toBe(-120);
		expect(kept(-5)).toBe(0);
	});

	it('leaves a sea level that is already one of the levels as it is', () => {
		const kept = createKeeper();
		for (const metres of [0, 10, -10, 120, 1250, -3330, 6000, -6000]) {
			expect(kept(metres)).toBe(metres);
		}
	});

	it('brings a sea level outside the range to its nearer end', () => {
		const kept = createKeeper();
		expect(kept(-6004)).toBe(-6000);
		expect(kept(-6010)).toBe(-6000);
		expect(kept(MIN_ELEVATION_M)).toBe(-6000);
		expect(kept(-Infinity)).toBe(-6000);
		expect(kept(6004)).toBe(6000);
		expect(kept(MAX_ELEVATION_M)).toBe(6000);
		expect(kept(Infinity)).toBe(6000);
	});

	it('counts the levels from the lowest of the range', () => {
		const kept = createKeeper({ minM: -5, maxM: 100, stepM: 10 });
		expect(kept(0)).toBe(5);
		expect(kept(-1)).toBe(-5);
		expect(kept(52)).toBe(55);
		// The highest level is the end of the range, on a step or not.
		expect(kept(99)).toBe(95);
		expect(kept(104)).toBe(100);
	});

	it('tells the listeners the rounded level', () => {
		const state = createAppState({
			world: createBlankWorld(64),
			seaLevelRange: STEPPED,
		});
		const seen: number[] = [];
		state.addListener((world) => seen.push(world.seaLevel));
		const next = createBlankWorld(64);
		next.seaLevel = 123.4;
		state.replaceWorld(next, { keepSettings: true });
		expect(seen).toEqual([120]);
	});

	it('still resets the sea level of a new world to the default', () => {
		const state = createAppState({
			world: createBlankWorld(64),
			seaLevelRange: STEPPED,
		});
		const next = createBlankWorld(64);
		next.seaLevel = normaliseSeaLevel(123.4);
		state.replaceWorld(next);
		expect(next.seaLevel).toBe(DEFAULT_SEA_LEVEL_M);
	});

	it('refuses a sea level that is not a number, changing nothing', () => {
		const first = createBlankWorld(64);
		const state = createAppState({ world: first, seaLevelRange: STEPPED });
		const next = createBlankWorld(64);
		next.seaLevel = Number.NaN;
		expect(() => state.replaceWorld(next, { keepSettings: true })).toThrow(
			RangeError,
		);
		expect(state.world).toBe(first);
	});

	it('refuses a step that is not a positive finite number', () => {
		const world = createBlankWorld(64);
		for (const stepM of [0, -10, Number.NaN, Infinity]) {
			expect(() =>
				createAppState({
					world,
					seaLevelRange: { minM: -6000, maxM: 6000, stepM },
				}),
			).toThrow(RangeError);
		}
	});
});

describe('setPlanet', () => {
	const DIM: PlanetSettings = {
		axialTiltDeg: 0,
		starBrightness: 0.5,
		starMass: 2,
		orbitDistanceAu: 1.5,
		greenhouseStrength: 0.25,
		dayLengthHours: 30,
	};

	it('gives the world being edited a copy of the settings, then tells the planet listeners once', () => {
		const world = createBlankWorld(64);
		const replaced: World[] = [];
		const state = createAppState({
			world,
			listeners: [(next) => replaced.push(next)],
		});
		const told: PlanetSettings[] = [];
		state.addPlanetListener((next) => told.push({ ...next.planet }));

		const settings = { ...DIM };
		state.setPlanet(settings);
		expect(world.planet).toEqual(DIM);
		expect(world.planet).not.toBe(settings);
		expect(told).toEqual([DIM]);
		expect(replaced).toEqual([]);
	});

	it('sets the world of the moment', () => {
		const state = createAppState({ world: createBlankWorld(64) });
		const next = createBlankWorld(64);
		state.replaceWorld(next);
		state.setPlanet(DIM);
		expect(next.planet).toEqual(DIM);
	});

	it('brings each setting within its limits', () => {
		const state = createAppState({ world: createBlankWorld(64) });
		state.setPlanet({ ...DIM, starMass: 50, axialTiltDeg: -5 });
		expect(state.world.planet).toEqual({
			...DIM,
			starMass: PLANET_LIMITS.starMass.max,
			axialTiltDeg: PLANET_LIMITS.axialTiltDeg.min,
		});
	});

	it('tells nobody of settings that change nothing, before or after normalising', () => {
		const state = createAppState({ world: createBlankWorld(64) });
		let told = 0;
		state.addPlanetListener(() => {
			told += 1;
		});
		state.setPlanet({ ...DEFAULT_PLANET });
		state.setPlanet(DIM);
		state.setPlanet({ ...DIM });
		state.setPlanet({ ...DIM, starMass: 2, orbitDistanceAu: 1.5 });
		expect(told).toBe(1);

		state.setPlanet({ ...DIM, greenhouseStrength: 3 });
		state.setPlanet({ ...DIM, greenhouseStrength: 7 });
		expect(told).toBe(2);
	});

	it('tells the planet listeners, in order, with the world being edited', () => {
		const first = createBlankWorld(64);
		const state = createAppState({ world: first });
		const calls: [string, World][] = [];
		state.addPlanetListener((world) => calls.push(['one', world]));
		state.addPlanetListener((world) => calls.push(['two', world]));

		state.setPlanet(DIM);
		expect(calls).toEqual([
			['one', first],
			['two', first],
		]);

		const next = createBlankWorld(64);
		state.replaceWorld(next);
		calls.length = 0;
		state.setPlanet(DIM);
		expect(calls.map(([, world]) => world)).toEqual([next, next]);
		expect(calls[0]?.[1]).toBe(next);
	});

	it('tells the planet listeners of no replacement, and the others of no planet change', () => {
		const replaced: World[] = [];
		const planets: World[] = [];
		const state = createAppState({
			world: createBlankWorld(64),
			listeners: [(world) => replaced.push(world)],
		});
		state.addPlanetListener((world) => planets.push(world));

		state.setPlanet(DIM);
		expect(replaced).toEqual([]);
		state.replaceWorld(createBlankWorld(64));
		expect(planets).toHaveLength(1);
		expect(replaced).toHaveLength(1);
	});

	it('calls every planet listener, then throws what they threw, keeping the settings', () => {
		const failure = new Error('no');
		const calls: string[] = [];
		const state = createAppState({ world: createBlankWorld(64) });
		state.addPlanetListener(() => {
			throw failure;
		});
		state.addPlanetListener(() => calls.push('after'));
		expect(() => state.setPlanet(DIM)).toThrow(failure);
		expect(calls).toEqual(['after']);
		expect(state.world.planet).toEqual(DIM);

		state.addPlanetListener(() => {
			throw 'again';
		});
		let thrown: unknown;
		try {
			state.setPlanet({ ...DIM, axialTiltDeg: 10 });
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toBeInstanceOf(AggregateError);
		expect((thrown as AggregateError).errors).toEqual([failure, 'again']);
		expect((thrown as AggregateError).message).toBe(
			'Several parts of the page failed to take the new planet settings',
		);
	});

	it('refuses a setting that is not a number, changing nothing', () => {
		const state = createAppState({ world: createBlankWorld(64) });
		let told = 0;
		state.addPlanetListener(() => {
			told += 1;
		});
		expect(() =>
			state.setPlanet({ ...DIM, starBrightness: Number.NaN }),
		).toThrow(RangeError);
		expect(state.world.planet).toEqual(DEFAULT_PLANET);
		expect(told).toBe(0);
	});
});
