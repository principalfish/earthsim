import { describe, expect, it } from 'vitest';
import { createBlankWorld, type World } from '../core/index';
import {
	applyStartup,
	decideStartup,
	RESTORE_FAILED_MESSAGE,
	type StartupPlan,
	type StartupSteps,
} from './startup';

/** Steps that write down what they are asked to do, in order. */
type Recorder = {
	readonly steps: StartupSteps;
	/** Every step taken so far, with what it was given. */
	readonly calls: unknown[][];
};

const createRecorder = (overrides: Partial<StartupSteps> = {}): Recorder => {
	const calls: unknown[][] = [];
	return {
		calls,
		steps: {
			replaceWorld: (world) => calls.push(['replaceWorld', world]),
			setAutosaveState: (state) => calls.push(['setAutosaveState', state]),
			startAutosave: () => calls.push(['startAutosave']),
			openDialog: (dialog) => calls.push(['openDialog', dialog]),
			logError: (error) => calls.push(['logError', error]),
			...overrides,
		},
	};
};

describe('RESTORE_FAILED_MESSAGE', () => {
	it('says the saved world could not be brought back', () => {
		expect(RESTORE_FAILED_MESSAGE).toBe(
			'The saved world could not be restored.',
		);
	});
});

describe('decideStartup', () => {
	it('brings a saved world back, with no dialog, and says it is saved', () => {
		const world = createBlankWorld();
		const plan = decideStartup({
			kind: 'loaded',
			outcome: { kind: 'world', world },
		});
		expect(plan).toEqual({
			restore: world,
			dialog: null,
			autosaveState: 'saved',
		});
		expect(plan.restore).toBe(world);
	});

	it('opens the dialog as it first opens when nothing is saved', () => {
		expect(
			decideStartup({ kind: 'loaded', outcome: { kind: 'empty' } }),
		).toEqual({ restore: null, dialog: {}, autosaveState: null });
	});

	it('opens the dialog with the notice when what is saved cannot be read', () => {
		expect(
			decideStartup({
				kind: 'loaded',
				outcome: { kind: 'corrupt', reason: 'not-bytes' },
			}),
		).toEqual({
			restore: null,
			dialog: { notice: RESTORE_FAILED_MESSAGE },
			autosaveState: null,
		});
	});

	it('opens the dialog with the notice and says saving is unavailable when the storage cannot be read', () => {
		expect(decideStartup({ kind: 'failed' })).toEqual({
			restore: null,
			dialog: { notice: RESTORE_FAILED_MESSAGE },
			autosaveState: 'unavailable',
		});
	});
});

describe('applyStartup', () => {
	it('puts a saved world in place before it starts autosave, and opens no dialog', () => {
		const world = createBlankWorld();
		const { steps, calls } = createRecorder();
		applyStartup(
			{ restore: world, dialog: null, autosaveState: 'saved' },
			steps,
		);
		expect(calls).toEqual([
			['replaceWorld', world],
			['setAutosaveState', 'saved'],
			['startAutosave'],
		]);
		expect(calls[0]?.[1]).toBe(world);
	});

	it('starts autosave and then opens the dialog when nothing is saved', () => {
		const { steps, calls } = createRecorder();
		applyStartup({ restore: null, dialog: {}, autosaveState: null }, steps);
		expect(calls).toEqual([['startAutosave'], ['openDialog', {}]]);
	});

	it('starts autosave and then opens the dialog with its notice', () => {
		const { steps, calls } = createRecorder();
		applyStartup(
			{
				restore: null,
				dialog: { notice: RESTORE_FAILED_MESSAGE },
				autosaveState: null,
			},
			steps,
		);
		expect(calls).toEqual([
			['startAutosave'],
			['openDialog', { notice: RESTORE_FAILED_MESSAGE }],
		]);
	});

	it('says saving is unavailable before it starts autosave and opens the dialog', () => {
		const { steps, calls } = createRecorder();
		applyStartup(
			{
				restore: null,
				dialog: { notice: RESTORE_FAILED_MESSAGE },
				autosaveState: 'unavailable',
			},
			steps,
		);
		expect(calls).toEqual([
			['setAutosaveState', 'unavailable'],
			['startAutosave'],
			['openDialog', { notice: RESTORE_FAILED_MESSAGE }],
		]);
	});

	it('carries out every plan that is decided, in the same order', () => {
		const world = createBlankWorld();
		const plans: StartupPlan[] = [
			decideStartup({ kind: 'loaded', outcome: { kind: 'world', world } }),
			decideStartup({ kind: 'loaded', outcome: { kind: 'empty' } }),
			decideStartup({
				kind: 'loaded',
				outcome: { kind: 'corrupt', reason: 'not-bytes' },
			}),
			decideStartup({ kind: 'failed' }),
		];
		const order = [
			'replaceWorld',
			'setAutosaveState',
			'startAutosave',
			'openDialog',
		];
		for (const plan of plans) {
			const { steps, calls } = createRecorder();
			applyStartup(plan, steps);
			const names = calls.map(([name]) => name);
			expect(names).toEqual(order.filter((name) => names.includes(name)));
			expect(names.filter((name) => name === 'startAutosave')).toHaveLength(1);
		}
	});

	it('logs a saved world that the page fails to take, and goes on as if it had', () => {
		const world = createBlankWorld();
		const failure = new Error('the globe refused the world');
		const replaced: World[] = [];
		const { steps, calls } = createRecorder({
			replaceWorld: (given) => {
				replaced.push(given);
				throw failure;
			},
		});
		expect(() =>
			applyStartup(
				{ restore: world, dialog: null, autosaveState: 'saved' },
				steps,
			),
		).not.toThrow();
		expect(replaced).toEqual([world]);
		expect(calls).toEqual([
			['logError', failure],
			['setAutosaveState', 'saved'],
			['startAutosave'],
		]);
	});
});
