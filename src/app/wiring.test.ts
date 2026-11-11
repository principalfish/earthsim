import { describe, expect, it } from 'vitest';
import {
	createBlankWorld,
	DEFAULT_SEA_LEVEL_M,
	generateWorld,
	normaliseSeaLevel,
	type World,
	type WorldFileResult,
} from '../core/index';
import { type AppState, createAppState } from './appState';
import { MAIN_BUTTON, SECONDARY_BUTTON } from './globe/input';
import type { SculptOptions, StrokeChanges } from './sculpt';
import { RESTORE_FAILED_MESSAGE } from './startup';
import type { LoadOutcome } from './storage';
import {
	FIRST_NEW_WORLD_VALUES,
	type NewWorldDialogOptions,
	newWorldValuesFor,
} from './ui/newWorldDialog';
import type { ToolPanelOptions } from './ui/toolPanel';
import type { ViewPanelOptions } from './ui/viewPanel';
import {
	describeWorld,
	EXPORT_FAILED_MESSAGE,
	NOT_A_WORLD_MESSAGE,
	type WorldPanelOptions,
} from './ui/worldPanel';
import type { ShortcutEvent } from './undo';
import {
	type PageAutosaveOptions,
	type PageStatisticsOptions,
	startPage,
} from './wiring';

/** A page made of stand-ins, each writing what it is asked into one log. */
type Stage = {
	readonly state: AppState;
	/** What the parts were asked to do, in order. */
	readonly log: string[];
	/** Every error the page recorded and carried on after. */
	readonly errors: unknown[];
	/** Every world handed to the store to save, as it was then. */
	readonly saved: World[];
	/** The dialogs opened so far. */
	readonly dialogs: NewWorldDialogOptions[];
	/** Resolves once the page has started. */
	readonly started: Promise<void>;
	/** Whether the stand-in for the sculpt controller is in a stroke. */
	strokeActive: boolean;
	/** Whether a modal dialog counts as open. */
	modalOpen: boolean;
	/** What exporting does; throws to stand for an export that fails. */
	exportWorld: (world: World) => void;
	/** What reading a chosen file gives. */
	importResult: WorldFileResult;
	readonly sculptOptions: Pick<SculptOptions, 'onStrokeEnd' | 'onWorldChange'>;
	readonly worldPanelOptions: WorldPanelOptions;
	readonly autosaveOptions: PageAutosaveOptions;
	readonly toolPanelOptions: ToolPanelOptions;
	readonly viewPanelOptions: ViewPanelOptions;
	readonly statisticsOptions: PageStatisticsOptions;
	/** Presses a key as the page hears it. */
	pressKey(press: Partial<ShortcutEvent>): void;
	/** Says that the page is being hidden or closed. */
	hidePage(): void;
	/** Has the storage answer the read made when the page started. */
	answerLoad(outcome: LoadOutcome): void;
	/** Has that read fail. */
	failLoad(error: unknown): void;
};

/** The levels of the page's sea-level slider. */
const SEA_LEVEL_RANGE = { minM: -6000, maxM: 6000, stepM: 10 };

const required = <T>(value: T | undefined, name: string): T => {
	if (value === undefined) {
		throw new Error(`The page never made its ${name}`);
	}
	return value;
};

const createStage = (world: World = createBlankWorld(64)): Stage => {
	const log: string[] = [];
	const errors: unknown[] = [];
	const saved: World[] = [];
	const dialogs: NewWorldDialogOptions[] = [];
	const state = createAppState({ world, seaLevelRange: SEA_LEVEL_RANGE });
	let sculptOptions:
		| Pick<SculptOptions, 'onStrokeEnd' | 'onWorldChange'>
		| undefined;
	let worldPanelOptions: WorldPanelOptions | undefined;
	let autosaveOptions: PageAutosaveOptions | undefined;
	let toolPanelOptions: ToolPanelOptions | undefined;
	let viewPanelOptions: ViewPanelOptions | undefined;
	let statisticsOptions: PageStatisticsOptions | undefined;
	let keyListener: ((event: ShortcutEvent) => void) | undefined;
	let hidingListener: (() => void) | undefined;
	let answerLoad: ((outcome: LoadOutcome) => void) | undefined;
	let failLoad: ((error: unknown) => void) | undefined;

	const stage: Stage = {
		state,
		log,
		errors,
		saved,
		dialogs,
		strokeActive: false,
		modalOpen: false,
		exportWorld: () => {},
		importResult: { ok: false, error: 'bad-marker' },
		started: Promise.resolve(),
		get sculptOptions() {
			return required(sculptOptions, 'sculpt controller');
		},
		get worldPanelOptions() {
			return required(worldPanelOptions, 'world panel');
		},
		get autosaveOptions() {
			return required(autosaveOptions, 'autosave');
		},
		get toolPanelOptions() {
			return required(toolPanelOptions, 'tool panel');
		},
		get viewPanelOptions() {
			return required(viewPanelOptions, 'view panel');
		},
		get statisticsOptions() {
			return required(statisticsOptions, 'statistics');
		},
		pressKey: (press) => {
			required(
				keyListener,
				'key listener',
			)({
				key: '',
				code: '',
				ctrlKey: false,
				metaKey: false,
				shiftKey: false,
				altKey: false,
				target: null,
				preventDefault: () => {},
				...press,
			});
		},
		hidePage: () => required(hidingListener, 'page-hiding listener')(),
		answerLoad: (outcome) => required(answerLoad, 'read of the store')(outcome),
		failLoad: (error) => required(failLoad, 'read of the store')(error),
	};

	const started = startPage({
		state,
		globe: {
			setWorld: (next) => log.push(`globe.setWorld ${describeWorld(next)}`),
			setSeaLevel: (metres) => log.push(`globe.setSeaLevel ${metres}`),
			setExaggeration: (factor) => log.push(`globe.setExaggeration ${factor}`),
			setGridVisible: (visible) => log.push(`globe.setGridVisible ${visible}`),
			updateElevation: () => log.push('globe.updateElevation'),
		},
		createViewInput: (rotateButton) => {
			log.push(`createViewInput ${rotateButton}`);
			return {
				setRotateButton: (button) =>
					log.push(`viewInput.setRotateButton ${button}`),
			};
		},
		createSculpt: (_world, options) => {
			log.push('createSculpt');
			sculptOptions = options;
			const endStroke = (): void => {
				log.push('sculpt.endStroke');
				stage.strokeActive = false;
			};
			return {
				setTool: (tool) => log.push(`sculpt.setTool ${tool}`),
				setRadiusKm: (radiusKm) => log.push(`sculpt.setRadiusKm ${radiusKm}`),
				setStrength: (strength) => log.push(`sculpt.setStrength ${strength}`),
				setSmoothSetting: (setting) =>
					log.push(`sculpt.setSmoothSetting ${setting}`),
				// As the real controller does: the history hears of the new
				// world from here, and nowhere else.
				setWorld: (next) => {
					log.push('sculpt.setWorld');
					options.onWorldChange?.(next);
				},
				endStroke,
				isStrokeActive: () => stage.strokeActive,
			};
		},
		createWorldPanel: (options) => {
			log.push(`createWorldPanel ${options.description}`);
			worldPanelOptions = options;
			return {
				setDescription: (description) =>
					log.push(`worldPanel.setDescription ${description}`),
				setAutosaveState: (autosaveState) =>
					log.push(`worldPanel.setAutosaveState ${autosaveState}`),
				setMessage: (message) => log.push(`worldPanel.setMessage ${message}`),
			};
		},
		openStore: () => {
			log.push('openStore');
			return {
				load: () => {
					log.push('store.load');
					return new Promise<LoadOutcome>((resolve, reject) => {
						answerLoad = resolve;
						failLoad = reject;
					});
				},
				save: async (current) => {
					log.push('store.save');
					saved.push(current);
				},
			};
		},
		createAutosave: (options) => {
			log.push('createAutosave');
			autosaveOptions = options;
			return {
				start: () => log.push('autosave.start'),
				markChanged: () => log.push('autosave.markChanged'),
				flush: () => log.push('autosave.flush'),
			};
		},
		createToolPanel: (options) => {
			log.push('createToolPanel');
			toolPanelOptions = options;
			return {
				setHistoryState: (history) =>
					log.push(
						`toolPanel.setHistoryState ${history.canUndo} ${history.canRedo}`,
					),
			};
		},
		createViewPanel: (options) => {
			log.push(`createViewPanel ${options.seaLevel}`);
			viewPanelOptions = options;
			return {
				setSeaLevel: (metres) => log.push(`viewPanel.setSeaLevel ${metres}`),
			};
		},
		createStatistics: (options) => {
			log.push('createStatistics');
			statisticsOptions = options;
			return {
				refresh: () => log.push('statistics.refresh'),
				reset: () => log.push('statistics.reset'),
			};
		},
		openNewWorldDialog: (options) => {
			log.push(`openNewWorldDialog ${options.notice ?? 'no notice'}`);
			dialogs.push(options);
		},
		loadEarth: () => Promise.reject(new Error('The Earth is not asked for')),
		exportWorld: (current) => {
			log.push('exportWorld');
			stage.exportWorld(current);
		},
		importWorld: async () => stage.importResult,
		setInert: (inert) => log.push(`setInert ${inert}`),
		isModalOpen: () => stage.modalOpen,
		onKeyDown: (listener) => {
			keyListener = listener;
		},
		onPageHiding: (listener) => {
			hidingListener = listener;
		},
		logError: (error) => errors.push(error),
	});
	return Object.defineProperty(stage, 'started', { value: started });
};

/** A stage whose storage has answered that nothing was saved. */
const createStartedStage = async (world?: World): Promise<Stage> => {
	const stage = createStage(world);
	stage.answerLoad({ kind: 'empty' });
	await stage.started;
	stage.log.length = 0;
	return stage;
};

/** Lets every promise that is already settled run its reactions. */
const settle = async (): Promise<void> => {
	for (let turn = 0; turn < 10; turn++) {
		await Promise.resolve();
	}
};

/**
 * Changes a cell of the stage's world as a stroke would and ends the
 * stroke, so that the history has one stroke to undo.
 */
const makeStroke = (stage: Stage): void => {
	const { elevation } = stage.state.world;
	const changes: StrokeChanges = {
		cells: Int32Array.of(5),
		before: Float32Array.of(elevation[5] as number),
	};
	elevation[5] = 1234;
	stage.sculptOptions.onStrokeEnd?.(changes);
};

const NO_CHANGES: StrokeChanges = {
	cells: new Int32Array(0),
	before: new Float32Array(0),
};

const UNDO_KEYS = { key: 'z', code: 'KeyZ', ctrlKey: true };
const REDO_KEYS = { key: 'y', code: 'KeyY', ctrlKey: true };

describe('startPage', () => {
	it('shows the starting world and makes the parts in the order of the panel', () => {
		const world = createBlankWorld(64);
		const { log } = createStage(world);
		expect(log).toEqual([
			`globe.setWorld ${describeWorld(world)}`,
			`createViewInput ${MAIN_BUTTON}`,
			'createSculpt',
			`createWorldPanel ${describeWorld(world)}`,
			'openStore',
			'createAutosave',
			'createToolPanel',
			`createViewPanel ${DEFAULT_SEA_LEVEL_M}`,
			'createStatistics',
			'statistics.refresh',
			'setInert true',
			'store.load',
		]);
	});

	it('gives the statistics and the autosave the world of the moment', async () => {
		const stage = await createStartedStage();
		const next = generateWorld({ resolution: 64, seed: 3, landFraction: 0.3 });
		stage.state.replaceWorld(next);

		expect(stage.statisticsOptions.currentWorld()).toBe(next);
		await stage.autosaveOptions.save();
		expect(stage.saved).toEqual([next]);
	});

	it('tells the statistics and the autosave when a stroke is under way', async () => {
		const stage = await createStartedStage();
		expect(stage.statisticsOptions.isStrokeActive()).toBe(false);
		expect(stage.autosaveOptions.isBusy?.()).toBe(false);
		stage.strokeActive = true;
		expect(stage.statisticsOptions.isStrokeActive()).toBe(true);
		expect(stage.autosaveOptions.isBusy?.()).toBe(true);
	});
});

describe('a world replacement', () => {
	it('reaches every part once, in order', async () => {
		const stage = await createStartedStage();
		makeStroke(stage);
		stage.log.length = 0;

		const next = generateWorld({ resolution: 64, seed: 3, landFraction: 0.3 });
		stage.state.replaceWorld(next);

		expect(stage.log).toEqual([
			'sculpt.setWorld',
			// The history forgets the old world's strokes from the sculpt
			// controller's hook, before the globe shows the new world.
			'toolPanel.setHistoryState false false',
			`globe.setWorld ${describeWorld(next)}`,
			`viewPanel.setSeaLevel ${DEFAULT_SEA_LEVEL_M}`,
			`worldPanel.setDescription ${describeWorld(next)}`,
			'statistics.reset',
			'statistics.refresh',
			'worldPanel.setMessage null',
			'autosave.markChanged',
		]);
	});

	it('leaves nothing of the old world to undo on the new', async () => {
		const stage = await createStartedStage();
		makeStroke(stage);
		const next = createBlankWorld(64);
		stage.state.replaceWorld(next);
		stage.log.length = 0;

		stage.pressKey(UNDO_KEYS);
		expect(stage.log).toEqual([]);
		expect(next.elevation[5]).not.toBe(1234);
	});

	it('shows the sea level the world ends up with', async () => {
		const stage = await createStartedStage();
		const next = createBlankWorld(64);
		next.seaLevel = 123.4;
		stage.importResult = { ok: true, world: next };
		stage.worldPanelOptions.onImport(new Blob());
		await settle();

		expect(next.seaLevel).toBe(120);
		expect(stage.log).toContain('viewPanel.setSeaLevel 120');
	});
});

describe('the start of the page', () => {
	it('puts the page out of reach before it reads the saved world', () => {
		const { log } = createStage();
		expect(log.slice(-2)).toEqual(['setInert true', 'store.load']);
		expect(log).not.toContain('setInert false');
		expect(log).not.toContain('autosave.start');
	});

	it('brings the saved world back, within reach again, then starts saving', async () => {
		const stage = createStage();
		const world = generateWorld({ resolution: 64, seed: 9, landFraction: 0.4 });
		world.seaLevel = normaliseSeaLevel(250);
		stage.log.length = 0;
		stage.answerLoad({ kind: 'world', world });
		await stage.started;

		expect(stage.state.world).toBe(world);
		expect(world.seaLevel).toBe(250);
		expect(stage.log).toEqual([
			'setInert false',
			'sculpt.setWorld',
			'toolPanel.setHistoryState false false',
			`globe.setWorld ${describeWorld(world)}`,
			'viewPanel.setSeaLevel 250',
			`worldPanel.setDescription ${describeWorld(world)}`,
			'statistics.reset',
			'statistics.refresh',
			'worldPanel.setMessage null',
			'autosave.markChanged',
			'worldPanel.setAutosaveState saved',
			'autosave.start',
		]);
		expect(stage.dialogs).toEqual([]);
		expect(stage.errors).toEqual([]);
	});

	it('opens the dialog on its first values when nothing was saved', async () => {
		const stage = createStage();
		stage.log.length = 0;
		stage.answerLoad({ kind: 'empty' });
		await stage.started;

		expect(stage.log).toEqual([
			'setInert false',
			'autosave.start',
			'sculpt.endStroke',
			'openNewWorldDialog no notice',
		]);
		expect(stage.dialogs[0]?.values).toEqual(FIRST_NEW_WORLD_VALUES);
		expect(stage.errors).toEqual([]);
	});

	it('says so in the dialog when what was saved cannot be read', async () => {
		const stage = createStage();
		stage.log.length = 0;
		stage.answerLoad({ kind: 'corrupt', reason: 'truncated' });
		await stage.started;

		expect(stage.log).toEqual([
			'setInert false',
			'autosave.start',
			'sculpt.endStroke',
			`openNewWorldDialog ${RESTORE_FAILED_MESSAGE}`,
		]);
		expect(stage.errors).toEqual(['The saved world cannot be read: truncated']);
	});

	it('lifts the gate and says saving is unavailable when the read fails', async () => {
		const stage = createStage();
		stage.log.length = 0;
		const failure = new Error('storage is blocked');
		stage.failLoad(failure);
		await stage.started;

		expect(stage.log).toEqual([
			'setInert false',
			'worldPanel.setAutosaveState unavailable',
			'autosave.start',
			'sculpt.endStroke',
			`openNewWorldDialog ${RESTORE_FAILED_MESSAGE}`,
		]);
		expect(stage.errors).toEqual([failure]);
	});

	it('ignores the history shortcuts until the storage has answered', async () => {
		const stage = createStage();
		makeStroke(stage);
		stage.log.length = 0;
		let prevented = 0;
		const countingKeys = { ...UNDO_KEYS, preventDefault: () => prevented++ };

		stage.pressKey(countingKeys);
		expect(stage.log).toEqual([]);
		expect(prevented).toBe(0);
		expect(stage.state.world.elevation[5]).toBe(1234);

		stage.answerLoad({ kind: 'empty' });
		await stage.started;
		stage.log.length = 0;
		stage.pressKey(countingKeys);
		expect(prevented).toBe(1);
		expect(stage.state.world.elevation[5]).not.toBe(1234);
		expect(stage.log).toContain('globe.updateElevation');
	});

	it('ignores the history shortcuts until a failed read has been given up', async () => {
		const stage = createStage();
		makeStroke(stage);
		stage.pressKey(UNDO_KEYS);
		expect(stage.state.world.elevation[5]).toBe(1234);

		stage.failLoad(new Error('storage is blocked'));
		await stage.started;
		stage.pressKey(UNDO_KEYS);
		expect(stage.state.world.elevation[5]).not.toBe(1234);
	});

	it('has the shortcuts back before the start-up dialog opens', async () => {
		const stage = createStage();
		makeStroke(stage);
		stage.answerLoad({ kind: 'empty' });
		await stage.started;
		// The dialog is open by now; with no modal reported the shortcut is
		// let through, so the gate was lifted and not left to the dialog.
		expect(stage.dialogs).toHaveLength(1);
		stage.pressKey(UNDO_KEYS);
		expect(stage.state.world.elevation[5]).not.toBe(1234);
	});
});

describe('the history shortcuts', () => {
	it('undo and redo, each reaching the statistics and the autosave', async () => {
		const stage = await createStartedStage();
		makeStroke(stage);
		stage.log.length = 0;

		stage.pressKey(UNDO_KEYS);
		expect(stage.log).toEqual([
			'globe.updateElevation',
			'toolPanel.setHistoryState false true',
			'statistics.refresh',
			'autosave.markChanged',
		]);
		expect(stage.state.world.elevation[5]).not.toBe(1234);

		stage.log.length = 0;
		stage.pressKey(REDO_KEYS);
		expect(stage.log).toEqual([
			'globe.updateElevation',
			'toolPanel.setHistoryState true false',
			'statistics.refresh',
			'autosave.markChanged',
		]);
		expect(stage.state.world.elevation[5]).toBe(1234);
	});

	it('do nothing while a modal dialog is open', async () => {
		const stage = await createStartedStage();
		makeStroke(stage);
		stage.log.length = 0;
		let prevented = 0;

		stage.modalOpen = true;
		stage.pressKey({ ...UNDO_KEYS, preventDefault: () => prevented++ });
		expect(stage.log).toEqual([]);
		expect(prevented).toBe(0);
		expect(stage.state.world.elevation[5]).toBe(1234);

		stage.modalOpen = false;
		stage.pressKey({ ...UNDO_KEYS, preventDefault: () => prevented++ });
		expect(prevented).toBe(1);
		expect(stage.state.world.elevation[5]).not.toBe(1234);
	});

	it('are refused while a stroke is under way', async () => {
		const stage = await createStartedStage();
		makeStroke(stage);
		stage.log.length = 0;
		stage.strokeActive = true;
		stage.pressKey(UNDO_KEYS);
		expect(stage.log).toEqual([]);
		expect(stage.state.world.elevation[5]).toBe(1234);
	});

	it('leave any other key alone', async () => {
		const stage = await createStartedStage();
		makeStroke(stage);
		stage.log.length = 0;
		stage.pressKey({ key: 'z', code: 'KeyZ' });
		stage.pressKey({ key: 'a', code: 'KeyA', ctrlKey: true });
		expect(stage.log).toEqual([]);
	});
});

describe('what changes the terrain or the sea level', () => {
	it('a stroke that changed something reaches the history, the statistics and the autosave', async () => {
		const stage = await createStartedStage();
		makeStroke(stage);
		expect(stage.log).toEqual([
			'toolPanel.setHistoryState true false',
			'statistics.refresh',
			'autosave.markChanged',
		]);
	});

	it('a stroke that changed nothing reaches neither', async () => {
		const stage = await createStartedStage();
		stage.sculptOptions.onStrokeEnd?.(NO_CHANGES);
		expect(stage.log).toEqual(['toolPanel.setHistoryState false false']);
	});

	it('the undo and redo buttons do as the shortcuts do', async () => {
		const stage = await createStartedStage();
		makeStroke(stage);
		stage.log.length = 0;

		stage.toolPanelOptions.onHistory('undo');
		stage.toolPanelOptions.onHistory('redo');
		expect(stage.log).toEqual([
			'globe.updateElevation',
			'toolPanel.setHistoryState false true',
			'statistics.refresh',
			'autosave.markChanged',
			'globe.updateElevation',
			'toolPanel.setHistoryState true false',
			'statistics.refresh',
			'autosave.markChanged',
		]);
	});

	it('an undo with nothing to undo reaches neither', async () => {
		const stage = await createStartedStage();
		stage.toolPanelOptions.onHistory('undo');
		expect(stage.log).toEqual([]);
	});

	it('the sea-level slider sets the world and the globe, then both', async () => {
		const stage = await createStartedStage();
		stage.viewPanelOptions.onSeaLevel(-340);
		expect(stage.state.world.seaLevel).toBe(-340);
		expect(stage.log).toEqual([
			'globe.setSeaLevel -340',
			'statistics.refresh',
			'autosave.markChanged',
		]);
	});

	it('the sea level set is that of the world of the moment', async () => {
		const stage = await createStartedStage();
		const next = createBlankWorld(64);
		stage.state.replaceWorld(next);
		stage.viewPanelOptions.onSeaLevel(70);
		expect(next.seaLevel).toBe(70);
	});

	it('the other view controls reach only the globe', async () => {
		const stage = await createStartedStage();
		stage.viewPanelOptions.onExaggeration(40);
		stage.viewPanelOptions.onGridVisible(true);
		expect(stage.log).toEqual([
			'globe.setExaggeration 40',
			'globe.setGridVisible true',
		]);
	});
});

describe('the tool controls', () => {
	it('change the button that turns the globe before the tool', async () => {
		const stage = await createStartedStage();
		stage.toolPanelOptions.onTool('raise');
		stage.toolPanelOptions.onTool('move');
		expect(stage.log).toEqual([
			`viewInput.setRotateButton ${SECONDARY_BUTTON}`,
			'sculpt.setTool raise',
			`viewInput.setRotateButton ${MAIN_BUTTON}`,
			'sculpt.setTool move',
		]);
	});

	it('pass the brush settings to the sculpt controller', async () => {
		const stage = await createStartedStage();
		stage.toolPanelOptions.onRadius(800);
		stage.toolPanelOptions.onStrength(2000);
		stage.toolPanelOptions.onSmoothSetting(70);
		expect(stage.log).toEqual([
			'sculpt.setRadiusKm 800',
			'sculpt.setStrength 2000',
			'sculpt.setSmoothSetting 70',
		]);
	});
});

describe('the world controls', () => {
	it('end a stroke, then open the dialog on the values of the world', async () => {
		const world = generateWorld({
			resolution: 64,
			seed: 11,
			landFraction: 0.5,
		});
		const stage = await createStartedStage(world);
		stage.strokeActive = true;
		stage.worldPanelOptions.onNewWorld();

		expect(stage.log).toEqual([
			'sculpt.endStroke',
			'openNewWorldDialog no notice',
		]);
		expect(stage.dialogs).toHaveLength(2);
		expect(stage.dialogs[1]?.values).toEqual(newWorldValuesFor(world));
	});

	it('make the world the dialog gives the one being edited, at the default sea level', async () => {
		const stage = await createStartedStage();
		stage.worldPanelOptions.onNewWorld();
		const dialog = required(stage.dialogs[1], 'dialog');

		const made = await dialog.createWorld({ kind: 'blank', resolution: 128 });
		made.seaLevel = normaliseSeaLevel(500);
		dialog.onWorld(made);

		expect(stage.state.world).toBe(made);
		expect(made.resolution).toBe(128);
		expect(made.seaLevel).toBe(DEFAULT_SEA_LEVEL_M);
	});

	it('ask the page for the Earth data when the dialog chooses the Earth', async () => {
		const stage = await createStartedStage();
		stage.worldPanelOptions.onNewWorld();
		const dialog = required(stage.dialogs[1], 'dialog');
		await expect(
			dialog.createWorld({ kind: 'earth', resolution: 64 }),
		).rejects.toThrow('The Earth is not asked for');
	});

	it('export the world of the moment and take back what the panel said', async () => {
		const stage = await createStartedStage();
		const exported: World[] = [];
		stage.exportWorld = (world) => exported.push(world);
		stage.worldPanelOptions.onExport();

		expect(exported).toEqual([stage.state.world]);
		expect(stage.log).toEqual(['exportWorld', 'worldPanel.setMessage null']);
		expect(stage.errors).toEqual([]);
	});

	it('say so when the export fails', async () => {
		const stage = await createStartedStage();
		const failure = new Error('no downloads');
		stage.exportWorld = () => {
			throw failure;
		};
		stage.worldPanelOptions.onExport();

		expect(stage.log).toEqual([
			'exportWorld',
			`worldPanel.setMessage ${EXPORT_FAILED_MESSAGE}`,
		]);
		expect(stage.errors).toEqual([failure]);
	});

	it('end a stroke when the file chooser opens', async () => {
		const stage = await createStartedStage();
		stage.strokeActive = true;
		stage.worldPanelOptions.onImportOpen();
		expect(stage.log).toEqual(['sculpt.endStroke']);
		expect(stage.strokeActive).toBe(false);
	});

	it('import a world with the sea level it comes with', async () => {
		const stage = await createStartedStage();
		const world = generateWorld({ resolution: 64, seed: 2, landFraction: 0.2 });
		world.seaLevel = normaliseSeaLevel(-450);
		stage.importResult = { ok: true, world };
		stage.worldPanelOptions.onImport(new Blob());
		await settle();

		expect(stage.state.world).toBe(world);
		expect(world.seaLevel).toBe(-450);
		expect(stage.log).toContain('statistics.reset');
		expect(stage.log).toContain('autosave.markChanged');
	});

	it('say why a file was not imported, and keep the world', async () => {
		const stage = await createStartedStage();
		const before = stage.state.world;
		stage.worldPanelOptions.onImport(new Blob());
		await settle();

		expect(stage.state.world).toBe(before);
		expect(stage.log).toEqual([`worldPanel.setMessage ${NOT_A_WORLD_MESSAGE}`]);
	});
});

describe('saving', () => {
	it('shows how each save went', async () => {
		const stage = await createStartedStage();
		stage.autosaveOptions.onState('saved');
		stage.autosaveOptions.onState('unavailable');
		expect(stage.log).toEqual([
			'worldPanel.setAutosaveState saved',
			'worldPanel.setAutosaveState unavailable',
		]);
	});

	it('records only the first save that fails', async () => {
		const stage = await createStartedStage();
		const first = new Error('quota');
		stage.autosaveOptions.onError?.(first);
		stage.autosaveOptions.onError?.(new Error('quota again'));
		expect(stage.errors).toEqual([first]);
	});

	it('saves what is unsaved when the page is being hidden', async () => {
		const stage = await createStartedStage();
		stage.hidePage();
		expect(stage.log).toEqual(['autosave.flush']);
	});
});
