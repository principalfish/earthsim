import { describe, expect, it } from 'vitest';
import {
	cellAt,
	createBlankWorld,
	createHistory,
	getGrid,
	latLonToDirection,
	type Vec3,
	type World,
} from '../core/index';
import {
	createStrokeRecord,
	DEFAULT_SMOOTH_SETTING,
	type StrokeChanges,
	sculptFrame,
} from './sculpt';
import {
	createUndoController,
	type FocusedElement,
	type HistoryAction,
	type HistoryState,
	handleHistoryKey,
	historyActionForKey,
	type KeyPress,
	takesTyping,
	type UndoController,
	type UndoOptions,
} from './undo';

const press = (key: string, held: Partial<KeyPress> = {}): KeyPress => ({
	key,
	code: '',
	ctrlKey: false,
	metaKey: false,
	shiftKey: false,
	altKey: false,
	...held,
});

const ctrl = { ctrlKey: true };
const command = { metaKey: true };

const input = (type?: string): FocusedElement => ({
	tagName: 'INPUT',
	...(type === undefined ? {} : { type }),
	isContentEditable: false,
});

describe('takesTyping', () => {
	it('is false when nothing has the focus', () => {
		expect(takesTyping(null)).toBe(false);
	});

	it('is true for inputs that are typed into', () => {
		for (const type of [
			'text',
			'search',
			'url',
			'tel',
			'email',
			'password',
			'number',
			'date',
			'datetime-local',
			'month',
			'week',
			'time',
		]) {
			expect(takesTyping(input(type))).toBe(true);
		}
	});

	it('takes an input with no type as a text field', () => {
		expect(takesTyping(input())).toBe(true);
		expect(takesTyping({ tagName: 'input' })).toBe(true);
	});

	it('is false for sliders, radio buttons, checkboxes and input buttons', () => {
		for (const type of [
			'range',
			'radio',
			'checkbox',
			'button',
			'submit',
			'reset',
			'image',
			'color',
			'file',
			'hidden',
			'RANGE',
		]) {
			expect(takesTyping(input(type))).toBe(false);
		}
	});

	it('is true for a text area and a drop-down list, in either case', () => {
		for (const tagName of ['TEXTAREA', 'textarea', 'SELECT', 'select']) {
			expect(takesTyping({ tagName })).toBe(true);
		}
	});

	it('is true for anything editable in place', () => {
		expect(takesTyping({ tagName: 'DIV', isContentEditable: true })).toBe(true);
		expect(takesTyping({ tagName: 'BUTTON', isContentEditable: true })).toBe(
			true,
		);
	});

	it('is false for buttons, the canvas, the page and other elements', () => {
		for (const tagName of ['BUTTON', 'CANVAS', 'BODY', 'A', 'svg']) {
			expect(takesTyping({ tagName, isContentEditable: false })).toBe(false);
			expect(takesTyping({ tagName })).toBe(false);
		}
	});
});

describe('historyActionForKey', () => {
	it('undoes on Ctrl+Z', () => {
		expect(historyActionForKey(press('z', ctrl), null)).toBe('undo');
	});

	it('uses the places of Z and Y on a layout with no Latin letters', () => {
		const at = (code: string, held: Partial<KeyPress>): Partial<KeyPress> => ({
			...held,
			code,
		});
		expect(historyActionForKey(press('я', at('KeyZ', ctrl)), null)).toBe(
			'undo',
		);
		expect(
			historyActionForKey(
				press('Я', at('KeyZ', { ...ctrl, shiftKey: true })),
				null,
			),
		).toBe('redo');
		expect(historyActionForKey(press('н', at('KeyY', ctrl)), null)).toBe(
			'redo',
		);
		expect(historyActionForKey(press('я', at('KeyZ', command)), null)).toBe(
			'undo',
		);
		// Command+Y is the browser's, wherever the letter comes from.
		expect(historyActionForKey(press('н', at('KeyY', command)), null)).toBe(
			null,
		);
		expect(historyActionForKey(press('ф', at('KeyA', ctrl)), null)).toBe(null);
		expect(
			historyActionForKey(press('я', at('KeyZ', ctrl)), input('text')),
		).toBe(null);
	});

	it('follows the letter typed where a layout moves Z and Y', () => {
		const at = (code: string): Partial<KeyPress> => ({ ...ctrl, code });
		// AZERTY: the key in the place of Z types W, and Z is where W was.
		expect(historyActionForKey(press('w', at('KeyZ')), null)).toBe(null);
		expect(historyActionForKey(press('z', at('KeyW')), null)).toBe('undo');
		// QWERTZ: Z and Y change places.
		expect(historyActionForKey(press('z', at('KeyY')), null)).toBe('undo');
		expect(historyActionForKey(press('y', at('KeyZ')), null)).toBe('redo');
	});

	it('redoes on Ctrl+Shift+Z and on Ctrl+Y', () => {
		expect(
			historyActionForKey(press('Z', { ...ctrl, shiftKey: true }), null),
		).toBe('redo');
		expect(historyActionForKey(press('y', ctrl), null)).toBe('redo');
	});

	it('takes Command as Ctrl for Z', () => {
		expect(historyActionForKey(press('z', command), null)).toBe('undo');
		expect(
			historyActionForKey(press('Z', { ...command, shiftKey: true }), null),
		).toBe('redo');
	});

	it('leaves Command+Y to the browser', () => {
		expect(historyActionForKey(press('y', command), null)).toBeNull();
	});

	it('ignores the case of the letter, as with Caps Lock on', () => {
		expect(historyActionForKey(press('Z', ctrl), null)).toBe('undo');
		expect(
			historyActionForKey(press('z', { ...ctrl, shiftKey: true }), null),
		).toBe('redo');
		expect(historyActionForKey(press('Y', ctrl), null)).toBe('redo');
	});

	it('needs Ctrl or Command', () => {
		expect(historyActionForKey(press('z'), null)).toBeNull();
		expect(historyActionForKey(press('y'), null)).toBeNull();
		expect(
			historyActionForKey(press('Z', { shiftKey: true }), null),
		).toBeNull();
	});

	it('ignores a press with both Ctrl and Command held', () => {
		const both = { ...ctrl, ...command };
		expect(historyActionForKey(press('z', both), null)).toBeNull();
		expect(historyActionForKey(press('y', both), null)).toBeNull();
	});

	it('ignores a press with Alt held, as AltGr is reported', () => {
		for (const key of ['z', 'y']) {
			for (const held of [ctrl, command]) {
				expect(
					historyActionForKey(press(key, { ...held, altKey: true }), null),
				).toBeNull();
			}
		}
		expect(
			historyActionForKey(
				press('Z', { ...ctrl, shiftKey: true, altKey: true }),
				null,
			),
		).toBeNull();
	});

	it('ignores Ctrl+Shift+Y', () => {
		expect(
			historyActionForKey(press('Y', { ...ctrl, shiftKey: true }), null),
		).toBeNull();
	});

	it('ignores other keys', () => {
		for (const key of ['a', 'x', 'Control', 'Shift', 'Meta', 'Enter', '']) {
			expect(historyActionForKey(press(key, ctrl), null)).toBeNull();
			expect(historyActionForKey(press(key, command), null)).toBeNull();
		}
	});

	it('leaves the shortcuts to a field that is typed into', () => {
		for (const focus of [
			input('text'),
			input('number'),
			{ tagName: 'TEXTAREA' },
			{ tagName: 'SELECT' },
			{ tagName: 'P', isContentEditable: true },
		]) {
			expect(historyActionForKey(press('z', ctrl), focus)).toBeNull();
			expect(historyActionForKey(press('y', ctrl), focus)).toBeNull();
			expect(
				historyActionForKey(press('Z', { ...command, shiftKey: true }), focus),
			).toBeNull();
		}
	});

	it('works with the focus on a slider, a radio button, a checkbox or a button', () => {
		for (const focus of [
			input('range'),
			input('radio'),
			input('checkbox'),
			{ tagName: 'BUTTON', type: 'button' },
			{ tagName: 'BODY' },
		]) {
			expect(historyActionForKey(press('z', ctrl), focus)).toBe('undo');
			expect(historyActionForKey(press('y', ctrl), focus)).toBe('redo');
		}
	});
});

describe('handleHistoryKey', () => {
	const send = (
		key: KeyPress,
		target: unknown,
	): { prevented: number; performed: HistoryAction[] } => {
		const seen = { prevented: 0, performed: [] as HistoryAction[] };
		handleHistoryKey(
			{
				...key,
				target,
				preventDefault: () => {
					seen.prevented++;
				},
			},
			(action) => seen.performed.push(action),
		);
		return seen;
	};

	it('performs the step and prevents the browser acting on the keys', () => {
		expect(send(press('z', ctrl), { tagName: 'BODY' })).toEqual({
			prevented: 1,
			performed: ['undo'],
		});
		expect(send(press('y', ctrl), input('range'))).toEqual({
			prevented: 1,
			performed: ['redo'],
		});
	});

	it('leaves any other press alone', () => {
		expect(send(press('z'), { tagName: 'BODY' })).toEqual({
			prevented: 0,
			performed: [],
		});
		expect(send(press('s', ctrl), { tagName: 'BODY' })).toEqual({
			prevented: 0,
			performed: [],
		});
	});

	it('leaves a press in a text field alone', () => {
		expect(send(press('z', ctrl), input('text'))).toEqual({
			prevented: 0,
			performed: [],
		});
	});

	it('takes a target that is not an element as no focus at all', () => {
		for (const target of [null, undefined, 'INPUT', {}, { tagName: 7 }]) {
			expect(send(press('z', ctrl), target)).toEqual({
				prevented: 1,
				performed: ['undo'],
			});
		}
	});
});

describe('createUndoController', () => {
	type Stage = {
		readonly world: World;
		readonly edits: UndoController;
		/** The faces of every upload the globe was asked for, in order. */
		readonly uploads: (readonly number[] | undefined)[];
		/** Every state the page was told of, in order. */
		readonly states: HistoryState[];
		/** How many times the page was told the terrain changed. */
		terrainChanges: number;
		/** Whether a stroke is said to be under way. */
		stroking: boolean;
		/** Makes a stroke of one frame between two points and commits it. */
		stroke(from: Vec3, to: Vec3, mode?: 'raise' | 'lower' | 'smooth'): void;
	};

	const createStage = (options: Partial<UndoOptions> = {}): Stage => {
		const world = createBlankWorld(64);
		const record = createStrokeRecord(world.elevation.length);
		const stage: Stage = {
			world,
			uploads: [],
			states: [],
			terrainChanges: 0,
			stroking: false,
			edits: createUndoController({
				world,
				globe: { updateElevation: (faces) => stage.uploads.push(faces) },
				isStrokeActive: () => stage.stroking,
				onTerrainChange: () => {
					stage.terrainChanges++;
				},
				onHistoryChange: (state) => stage.states.push(state),
				...options,
			}),
			stroke: (from, to, mode = 'raise') => {
				sculptFrame({
					world,
					record,
					mode,
					radiusKm: 700,
					strength: 3000,
					smoothSetting: DEFAULT_SMOOTH_SETTING,
					seconds: 0.1,
					from,
					to,
				});
				stage.edits.commit(record.finish());
			},
		};
		return stage;
	};

	const bitsOf = (world: World): Uint32Array =>
		new Uint32Array(world.elevation.slice().buffer);

	const nothing: StrokeChanges = {
		cells: new Int32Array(0),
		before: new Float32Array(0),
	};

	it('starts with nothing to undo or redo', () => {
		const { edits, states } = createStage();
		expect(edits.state).toEqual({ canUndo: false, canRedo: false });
		expect(states).toEqual([]);
	});

	it('undoes any run of strokes back to the start and redoes it exactly', () => {
		const stage = createStage();
		const { world, edits } = stage;
		const snapshots = [bitsOf(world)];
		stage.stroke(latLonToDirection(0, 0), latLonToDirection(0, 30));
		snapshots.push(bitsOf(world));
		stage.stroke(
			latLonToDirection(10, 10),
			latLonToDirection(-10, 20),
			'lower',
		);
		snapshots.push(bitsOf(world));
		stage.stroke(latLonToDirection(0, 5), latLonToDirection(0, 25), 'smooth');
		snapshots.push(bitsOf(world));
		stage.stroke(latLonToDirection(5, 15), latLonToDirection(5, 15));
		snapshots.push(bitsOf(world));
		expect(new Set(snapshots.map((bits) => bits.join())).size).toBe(5);

		for (let step = 3; step >= 0; step--) {
			expect(edits.perform('undo')).toBe(true);
			expect(bitsOf(world)).toEqual(snapshots[step]);
		}
		expect(edits.perform('undo')).toBe(false);
		expect(bitsOf(world)).toEqual(snapshots[0]);
		for (let step = 1; step <= 4; step++) {
			expect(edits.perform('redo')).toBe(true);
			expect(bitsOf(world)).toEqual(snapshots[step]);
		}
		expect(edits.perform('redo')).toBe(false);
	});

	it('has the globe upload the faces a step changed, and only those', () => {
		const stage = createStage();
		const { world, edits, uploads } = stage;
		// Along the equator from the face under longitude 0 to the next.
		stage.stroke(latLonToDirection(0, 20), latLonToDirection(0, 70));
		const grid = getGrid(world.resolution);
		const faceCells = world.resolution ** 2;
		const faces = [20, 70].map((longitude) =>
			Math.floor(cellAt(grid, latLonToDirection(0, longitude)) / faceCells),
		);
		expect(new Set(faces).size).toBe(2);
		expect(uploads).toEqual([]);

		edits.perform('undo');
		expect(uploads).toEqual([[...faces].sort()]);
		edits.perform('redo');
		expect(uploads).toEqual([[...faces].sort(), [...faces].sort()]);
	});

	it('uploads all three faces that meet at a corner of the cube', () => {
		const stage = createStage();
		const corner: Vec3 = [1, 1, 1];
		stage.stroke(corner, corner);
		stage.edits.perform('undo');
		expect(stage.uploads.length).toBe(1);
		expect(stage.uploads[0]?.length).toBe(3);
	});

	it('uploads nothing when there is nothing to undo or redo', () => {
		const { edits, uploads } = createStage();
		expect(edits.perform('undo')).toBe(false);
		expect(edits.perform('redo')).toBe(false);
		expect(uploads).toEqual([]);
	});

	it('refuses to step while a stroke is being made', () => {
		const stage = createStage();
		const { world, edits } = stage;
		stage.stroke(latLonToDirection(0, 0), latLonToDirection(0, 30));
		stage.stroke(latLonToDirection(0, 0), latLonToDirection(0, 30));
		edits.perform('undo');
		const held = bitsOf(world);
		const told = stage.states.length;
		const changes = stage.terrainChanges;

		stage.stroking = true;
		expect(edits.perform('undo')).toBe(false);
		expect(edits.perform('redo')).toBe(false);
		expect(bitsOf(world)).toEqual(held);
		expect(stage.uploads.length).toBe(1);
		expect(stage.states.length).toBe(told);
		expect(stage.terrainChanges).toBe(changes);
		expect(edits.state).toEqual({ canUndo: true, canRedo: true });

		stage.stroking = false;
		expect(edits.perform('undo')).toBe(true);
		expect(edits.state).toEqual({ canUndo: false, canRedo: true });
	});

	it('tells the page what can be undone and redone after every step', () => {
		const stage = createStage();
		const { edits, states } = stage;
		stage.stroke(latLonToDirection(0, 0), latLonToDirection(0, 30));
		stage.stroke(latLonToDirection(0, 0), latLonToDirection(0, 30));
		edits.perform('undo');
		edits.perform('undo');
		edits.perform('redo');
		stage.stroke(latLonToDirection(0, 0), latLonToDirection(0, 30));
		expect(states).toEqual([
			{ canUndo: true, canRedo: false },
			{ canUndo: true, canRedo: false },
			{ canUndo: true, canRedo: true },
			{ canUndo: false, canRedo: true },
			{ canUndo: true, canRedo: true },
			{ canUndo: true, canRedo: false },
		]);
		expect(edits.state).toEqual(states[states.length - 1]);
	});

	it('says the terrain changed after a stroke, an undo and a redo', () => {
		const stage = createStage();
		stage.stroke(latLonToDirection(0, 0), latLonToDirection(0, 30));
		expect(stage.terrainChanges).toBe(1);
		stage.edits.perform('undo');
		expect(stage.terrainChanges).toBe(2);
		stage.edits.perform('redo');
		expect(stage.terrainChanges).toBe(3);
		stage.edits.perform('redo');
		expect(stage.terrainChanges).toBe(3);
	});

	it('records nothing for a stroke that changed nothing', () => {
		const stage = createStage();
		stage.stroke(latLonToDirection(0, 0), latLonToDirection(0, 30));
		stage.edits.perform('undo');
		stage.edits.commit(nothing);
		expect(stage.terrainChanges).toBe(2);
		expect(stage.edits.state).toEqual({ canUndo: false, canRedo: true });
	});

	it('forgets every stroke when the world is replaced', () => {
		const stage = createStage();
		const { world, edits } = stage;
		stage.stroke(latLonToDirection(0, 0), latLonToDirection(0, 30));
		stage.stroke(latLonToDirection(0, 0), latLonToDirection(0, 30));
		edits.perform('undo');
		const left = bitsOf(world);
		const changes = stage.terrainChanges;

		const next = createBlankWorld(128);
		edits.setWorld(next);
		expect(edits.state).toEqual({ canUndo: false, canRedo: false });
		expect(stage.states[stage.states.length - 1]).toEqual({
			canUndo: false,
			canRedo: false,
		});
		expect(stage.terrainChanges).toBe(changes);
		expect(edits.perform('undo')).toBe(false);
		expect(edits.perform('redo')).toBe(false);
		expect(bitsOf(world)).toEqual(left);

		// Strokes on the new world are recorded against it.
		const cell = next.elevation.length - 1;
		const before = next.elevation[cell] as number;
		next.elevation[cell] = 123;
		edits.commit({
			cells: Int32Array.of(cell),
			before: Float32Array.of(before),
		});
		expect(edits.perform('undo')).toBe(true);
		expect(next.elevation[cell]).toBe(before);
		expect(stage.uploads[stage.uploads.length - 1]).toEqual([5]);
	});

	it('works without callbacks and keeps strokes in the history it is given', () => {
		const world = createBlankWorld(64);
		const history = createHistory({ maxStrokes: 1 });
		const edits = createUndoController({
			world,
			globe: { updateElevation: () => {} },
			history,
			isStrokeActive: () => false,
		});
		for (const cell of [3, 4]) {
			const before = world.elevation[cell] as number;
			world.elevation[cell] = 50;
			edits.commit({
				cells: Int32Array.of(cell),
				before: Float32Array.of(before),
			});
		}
		expect(history.undoCount).toBe(1);
		expect(edits.perform('undo')).toBe(true);
		expect(edits.perform('undo')).toBe(false);
		expect(edits.perform('redo')).toBe(true);
		edits.setWorld(createBlankWorld(64));
		expect(history.redoCount).toBe(0);
		expect(history.undoCount).toBe(0);
	});
});
