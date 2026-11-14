import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readEarthDataFile } from '../../scripts/earth/dataFile.mjs';
import {
	createBlankWorld,
	DEFAULT_PLANET,
	DEFAULT_SEA_LEVEL_M,
	decodeEarth,
	deserializeWorld,
	earthWorld,
	generateWorld,
	normaliseSeaLevel,
	PLANET_SETTINGS,
	type PlanetSettings,
	type Rgb,
	type SimKind,
	type SimRequest,
	serializeWorld,
	sunColour,
	sunDirection,
	sunDrawnSize,
	type Vec3,
	type World,
	type WorldFileResult,
} from '../core/index';
import { temperatureOf } from '../core/testing/temperatureFixtures';
import { windResultOf } from '../core/testing/windFixtures';
import {
	createFakeWorker,
	type FakeWorker,
} from '../worker/testing/fakeWorker';
import { type AppState, createAppState } from './appState';
import { MAIN_BUTTON, SECONDARY_BUTTON } from './globe/input';
import { createPanelMemory, panelMemoryKey } from './panelMemory';
import { PLAYBACK_STEP_MS } from './playback';
import { TEMPERATURE_DEBOUNCE_MS } from './refresh';
import type { SculptOptions, StrokeChanges } from './sculpt';
import { RESTORE_FAILED_MESSAGE } from './startup';
import type { LoadOutcome } from './storage';
import { createFakeDocument, type FakeDocument } from './testing/fakeDocument';
import { createFakeStorage } from './testing/fakeStorage';
import { createFakeTimers } from './testing/fakeTimers';
import { settle } from './testing/settle';
import type { ComparisonContent } from './ui/comparison';
import {
	createLayerPanel,
	type LayerControlsOptions,
	type ShownTemperature,
} from './ui/layerPanel';
import {
	FIRST_NEW_WORLD_VALUES,
	type NewWorldDialogOptions,
	newWorldValuesFor,
} from './ui/newWorldDialog';
import { createPanelSections, PANEL_SECTIONS } from './ui/panelSections';
import type { PlanetPanelOptions } from './ui/planetPanel';
import type { ToolPanelOptions } from './ui/toolPanel';
import type { ViewPanelOptions } from './ui/viewPanel';
import {
	describeWorld,
	EXPORT_FAILED_MESSAGE,
	NOT_A_WORLD_MESSAGE,
	type WorldPanelOptions,
} from './ui/worldPanel';
import type { ShortcutEvent } from './undo';
import { DEFAULT_MONTH, DEFAULT_PAGE_VIEW, type PageView } from './view';
import {
	type PageAutosaveOptions,
	type PageLayerOptions,
	type PageParts,
	type PageReadoutOptions,
	type PageStatisticsOptions,
	type PageTemperatureOptions,
	startPage,
} from './wiring';
import {
	createStatisticsService,
	createTemperatureService,
	createWindsService,
} from './workerService';

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
	readonly planetPanelOptions: PlanetPanelOptions;
	readonly statisticsOptions: PageStatisticsOptions;
	readonly temperatureOptions: PageTemperatureOptions;
	readonly windsOptions: PageTemperatureOptions;
	readonly layerOptions: PageLayerOptions;
	readonly readoutOptions: PageReadoutOptions;
	/** What the stand-in for the cursor readout was asked to do, in order. */
	readonly readoutCalls: string[];
	/** What the stand-in for the Layers section was asked to do, in order. */
	readonly sectionCalls: string[];
	/** What the stand-in for the layer panel says the globe shows. */
	shownTemperature: ShownTemperature | null;
	/** Every sun the globe was given, in order. */
	readonly suns: Sun[];
	/** Turns or zooms the camera, as the view's input says it does. */
	moveCamera(): void;
	/** Presses a key as the page hears it. */
	pressKey(press: Partial<ShortcutEvent>): void;
	/** Says that the page is being hidden or closed. */
	hidePage(): void;
	/** Has the storage answer the read made when the page started. */
	answerLoad(outcome: LoadOutcome): void;
	/** Has that read fail. */
	failLoad(error: unknown): void;
};

/** A sun as the globe was given it. */
type Sun = {
	readonly direction: Vec3;
	readonly sizeDeg: number;
	readonly colour: Rgb;
};

/** The sun of a month and a planet, as the page is to give it. */
const sunOf = (month: number, planet: PlanetSettings): Sun => ({
	direction: sunDirection(month, planet),
	sizeDeg: sunDrawnSize(planet),
	colour: sunColour(planet),
});

/** A planet's settings as the stand-ins write them in the log. */
const describePlanet = (planet: PlanetSettings): string =>
	PLANET_SETTINGS.map((name) => planet[name]).join(' ');

/** Earth's settings as the stand-ins write them in the log. */
const EARTH = describePlanet(DEFAULT_PLANET);

/** The levels of the page's sea-level slider. */
const SEA_LEVEL_RANGE = { minM: -6000, maxM: 6000, stepM: 10 };

const required = <T>(value: T | undefined, name: string): T => {
	if (value === undefined) {
		throw new Error(`The page never made its ${name}`);
	}
	return value;
};

/** The parts a test may make itself, in place of the stage's stand-ins. */
type StageParts = Partial<
	Pick<
		PageParts,
		| 'createStatistics'
		| 'createTemperature'
		| 'createWinds'
		| 'createLayerPanel'
		| 'layersSection'
	>
>;

const createStage = (
	world: World = createBlankWorld(64),
	own: StageParts = {},
): Stage => {
	const log: string[] = [];
	const errors: unknown[] = [];
	const saved: World[] = [];
	const dialogs: NewWorldDialogOptions[] = [];
	const suns: Sun[] = [];
	const state = createAppState({ world, seaLevelRange: SEA_LEVEL_RANGE });
	let sculptOptions:
		| Pick<SculptOptions, 'onStrokeEnd' | 'onWorldChange'>
		| undefined;
	let worldPanelOptions: WorldPanelOptions | undefined;
	let autosaveOptions: PageAutosaveOptions | undefined;
	let toolPanelOptions: ToolPanelOptions | undefined;
	let viewPanelOptions: ViewPanelOptions | undefined;
	let planetPanelOptions: PlanetPanelOptions | undefined;
	let statisticsOptions: PageStatisticsOptions | undefined;
	let temperatureOptions: PageTemperatureOptions | undefined;
	let windsOptions: PageTemperatureOptions | undefined;
	let layerOptions: PageLayerOptions | undefined;
	let readoutOptions: PageReadoutOptions | undefined;
	let onCameraMove: (() => void) | undefined;
	const readoutCalls: string[] = [];
	const sectionCalls: string[] = [];
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
		get planetPanelOptions() {
			return required(planetPanelOptions, 'planet panel');
		},
		get statisticsOptions() {
			return required(statisticsOptions, 'statistics');
		},
		get temperatureOptions() {
			return required(temperatureOptions, 'temperature');
		},
		get windsOptions() {
			return required(windsOptions, 'winds');
		},
		get layerOptions() {
			return required(layerOptions, 'layer panel');
		},
		get readoutOptions() {
			return required(readoutOptions, 'cursor readout');
		},
		readoutCalls,
		sectionCalls,
		shownTemperature: null,
		suns,
		moveCamera: () => required(onCameraMove, 'view input')(),
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
			setSun: (direction, sizeDeg, colour) => {
				log.push('globe.setSun');
				suns.push({ direction, sizeDeg, colour });
			},
			setSunlight: (style) => log.push(`globe.setSunlight ${style}`),
			updateElevation: () => log.push('globe.updateElevation'),
		},
		createViewInput: (rotateButton, onMove) => {
			log.push(`createViewInput ${rotateButton}`);
			onCameraMove = onMove;
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
				setDate: (date) => log.push(`worldPanel.setDate ${date}`),
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
		createPlanetPanel: (options) => {
			log.push(`createPlanetPanel ${describePlanet(options.planet)}`);
			planetPanelOptions = options;
			return {
				setPlanet: (planet) =>
					log.push(`planetPanel.setPlanet ${describePlanet(planet)}`),
			};
		},
		createStatistics: (options) => {
			log.push('createStatistics');
			statisticsOptions = options;
			if (own.createStatistics !== undefined) {
				return own.createStatistics(options);
			}
			return {
				refresh: () => log.push('statistics.refresh'),
				reset: () => log.push('statistics.reset'),
			};
		},
		createTemperature: (options) => {
			log.push('createTemperature');
			temperatureOptions = options;
			if (own.createTemperature !== undefined) {
				return own.createTemperature(options);
			}
			return {
				refresh: () => log.push('temperature.refresh'),
				reset: () => log.push('temperature.reset'),
				setShowing: (showing) => log.push(`temperature.setShowing ${showing}`),
			};
		},
		createWinds: (options) => {
			log.push('createWinds');
			windsOptions = options;
			if (own.createWinds !== undefined) {
				return own.createWinds(options);
			}
			return {
				refresh: () => log.push('winds.refresh'),
				reset: () => log.push('winds.reset'),
				setShowing: (showing) => log.push(`winds.setShowing ${showing}`),
			};
		},
		createLayerPanel: (options) => {
			log.push('createLayerPanel');
			layerOptions = options;
			if (own.createLayerPanel !== undefined) {
				return own.createLayerPanel(options);
			}
			return {
				newWorld: (earth) => log.push(`layerPanel.newWorld ${earth}`),
				setEarth: (earth) => log.push(`layerPanel.setEarth ${earth}`),
				setSunlight: (on) => log.push(`layerPanel.setSunlight ${on}`),
				shown: () => stage.shownTemperature,
			};
		},
		createCursorReadout: (options) => {
			log.push('createCursorReadout');
			readoutOptions = options;
			return {
				invalidate: () => readoutCalls.push('invalidate'),
				clear: () => readoutCalls.push('clear'),
			};
		},
		layersSection: own.layersSection ?? {
			setOpen: (open) => sectionCalls.push(`layersSection.setOpen ${open}`),
		},
		openNewWorldDialog: (options) => {
			log.push(`openNewWorldDialog ${options.notice ?? 'no notice'}`);
			dialogs.push(options);
		},
		loadEarth: () => Promise.reject(new Error('The Earth is not asked for')),
		loadObserved: () =>
			Promise.reject(new Error('The observed temperature is not asked for')),
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
const createStartedStage = async (
	world?: World,
	own?: StageParts,
): Promise<Stage> => {
	const stage = createStage(world, own);
	stage.answerLoad({ kind: 'empty' });
	await stage.started;
	stage.log.length = 0;
	stage.readoutCalls.length = 0;
	stage.sectionCalls.length = 0;
	stage.suns.length = 0;
	return stage;
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
	it('shows the starting world and makes the parts in order', () => {
		const world = createBlankWorld(64);
		const { log } = createStage(world);
		expect(log).toEqual([
			`globe.setWorld ${describeWorld(world)}`,
			'globe.setSun',
			`createViewInput ${MAIN_BUTTON}`,
			'createSculpt',
			`createWorldPanel ${describeWorld(world)}`,
			'worldPanel.setDate Year 0',
			'openStore',
			'createAutosave',
			'createToolPanel',
			`createViewPanel ${DEFAULT_SEA_LEVEL_M}`,
			`createPlanetPanel ${EARTH}`,
			'createTemperature',
			'createWinds',
			'createLayerPanel',
			'createStatistics',
			'statistics.refresh',
			'createCursorReadout',
			'layerPanel.setEarth null',
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

	it('gives the layer panel the store the temperature writes, and the temperature', async () => {
		const stage = await createStartedStage();
		expect(stage.layerOptions.store).toBe(stage.temperatureOptions.store);
		stage.layerOptions.temperature.setShowing(true);
		stage.layerOptions.temperature.setShowing(false);
		expect(stage.log).toEqual([
			'temperature.setShowing true',
			'temperature.setShowing false',
		]);
	});

	it('gives the winds the world of the moment, the stroke and the store the temperature writes', async () => {
		const stage = await createStartedStage();
		const { windsOptions } = stage;
		expect(windsOptions.store).toBe(stage.temperatureOptions.store);
		expect(windsOptions.store.winds.status).toBe('empty');
		const next = generateWorld({ resolution: 64, seed: 3, landFraction: 0.3 });
		stage.state.replaceWorld(next);
		expect(windsOptions.currentWorld()).toBe(next);
		expect(windsOptions.isStrokeActive()).toBe(false);
		stage.strokeActive = true;
		expect(windsOptions.isStrokeActive()).toBe(true);
	});

	it('needs the temperature while the Temperature layer is chosen or the winds are showing', async () => {
		const stage = await createStartedStage();
		const { temperature, winds } = stage.layerOptions;
		winds.setShowing(true);
		temperature.setShowing(true);
		winds.setShowing(false);
		temperature.setShowing(false);
		winds.setShowing(true);
		winds.setShowing(false);
		expect(stage.log).toEqual([
			'winds.setShowing true',
			'temperature.setShowing true',
			'temperature.setShowing true',
			'winds.setShowing false',
			'temperature.setShowing true',
			'temperature.setShowing false',
			'winds.setShowing true',
			'temperature.setShowing true',
			'winds.setShowing false',
			'temperature.setShowing false',
		]);
	});

	it('gives the temperature the world of the moment, the stroke and an empty store', async () => {
		const stage = await createStartedStage();
		const { temperatureOptions } = stage;
		expect(temperatureOptions.store.temperature.status).toBe('empty');
		const next = generateWorld({ resolution: 64, seed: 3, landFraction: 0.3 });
		stage.state.replaceWorld(next);
		expect(temperatureOptions.currentWorld()).toBe(next);
		expect(temperatureOptions.isStrokeActive()).toBe(false);
		stage.strokeActive = true;
		expect(temperatureOptions.isStrokeActive()).toBe(true);
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
			`planetPanel.setPlanet ${EARTH}`,
			`worldPanel.setDescription ${describeWorld(next)}`,
			'statistics.reset',
			'statistics.refresh',
			'temperature.reset',
			'temperature.refresh',
			'winds.reset',
			'layerPanel.newWorld null',
			'globe.setSun',
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
		world.planet = { ...DEFAULT_PLANET, axialTiltDeg: 45, starMass: 2 };
		world.ageYears = 2_400_000;
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
			'planetPanel.setPlanet 45 1 2 1 1 24',
			`worldPanel.setDescription ${describeWorld(world)}`,
			'statistics.reset',
			'statistics.refresh',
			'temperature.reset',
			'temperature.refresh',
			'winds.reset',
			'layerPanel.newWorld null',
			'globe.setSun',
			'worldPanel.setDate 2.4 million years',
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
	it('undo and redo, each reaching the statistics, the temperature and the autosave', async () => {
		const stage = await createStartedStage();
		makeStroke(stage);
		stage.log.length = 0;

		stage.pressKey(UNDO_KEYS);
		expect(stage.log).toEqual([
			'globe.updateElevation',
			'toolPanel.setHistoryState false true',
			'statistics.refresh',
			'temperature.refresh',
			'layerPanel.setEarth null',
			'autosave.markChanged',
		]);
		expect(stage.state.world.elevation[5]).not.toBe(1234);

		stage.log.length = 0;
		stage.pressKey(REDO_KEYS);
		expect(stage.log).toEqual([
			'globe.updateElevation',
			'toolPanel.setHistoryState true false',
			'statistics.refresh',
			'temperature.refresh',
			'layerPanel.setEarth null',
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
	it('a stroke that changed something reaches the history, the statistics, the temperature and the autosave', async () => {
		const stage = await createStartedStage();
		makeStroke(stage);
		expect(stage.log).toEqual([
			'toolPanel.setHistoryState true false',
			'statistics.refresh',
			'temperature.refresh',
			'layerPanel.setEarth null',
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
			'temperature.refresh',
			'layerPanel.setEarth null',
			'autosave.markChanged',
			'globe.updateElevation',
			'toolPanel.setHistoryState true false',
			'statistics.refresh',
			'temperature.refresh',
			'layerPanel.setEarth null',
			'autosave.markChanged',
		]);
	});

	it('an undo with nothing to undo reaches neither', async () => {
		const stage = await createStartedStage();
		stage.toolPanelOptions.onHistory('undo');
		expect(stage.log).toEqual([]);
	});

	it('the sea-level slider sets the world and the globe, then the statistics, the temperature and the autosave', async () => {
		const stage = await createStartedStage();
		stage.viewPanelOptions.onSeaLevel(-340);
		expect(stage.state.world.seaLevel).toBe(-340);
		expect(stage.log).toEqual([
			'globe.setSeaLevel -340',
			'statistics.refresh',
			'temperature.refresh',
			'layerPanel.setEarth null',
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

describe('a change of the planet settings', () => {
	it('reaches the temperature and the autosave, once each, and not the statistics', async () => {
		const stage = await createStartedStage();
		stage.state.setPlanet({ ...stage.state.world.planet, axialTiltDeg: 0 });
		expect(stage.log).toEqual([
			'globe.setSun',
			'temperature.refresh',
			'layerPanel.setEarth null',
			'autosave.markChanged',
		]);
	});
});

describe('the planet controls', () => {
	const TILTED: PlanetSettings = { ...DEFAULT_PLANET, axialTiltDeg: 0 };

	it('start on the settings of the world the page opens on', async () => {
		const stage = await createStartedStage();
		expect(stage.planetPanelOptions.planet).toEqual(DEFAULT_PLANET);
	});

	it('set the world of the moment, then reach the temperature and the autosave once each, and not the statistics', async () => {
		const stage = await createStartedStage();
		const next = createBlankWorld(64);
		stage.state.replaceWorld(next);
		stage.log.length = 0;

		stage.planetPanelOptions.onChange(TILTED);
		expect(next.planet).toEqual(TILTED);
		expect(stage.log).toEqual([
			'globe.setSun',
			'temperature.refresh',
			'layerPanel.setEarth null',
			'autosave.markChanged',
		]);
	});

	it('send a change of the day length alone to the winds, and never to the temperature', async () => {
		const stage = await createStartedStage();
		stage.planetPanelOptions.onChange({
			...DEFAULT_PLANET,
			dayLengthHours: 30,
		});
		expect(stage.log).toEqual([
			'globe.setSun',
			'winds.refresh',
			'layerPanel.setEarth null',
			'autosave.markChanged',
		]);
	});

	it('send a change of several settings that includes another to the temperature alone', async () => {
		const stage = await createStartedStage();
		stage.planetPanelOptions.onChange({ ...TILTED, dayLengthHours: 30 });
		stage.planetPanelOptions.onChange({ ...TILTED, dayLengthHours: 30 });
		stage.planetPanelOptions.onChange({ ...TILTED, dayLengthHours: 20 });
		expect(stage.log).toEqual([
			'globe.setSun',
			'temperature.refresh',
			'layerPanel.setEarth null',
			'autosave.markChanged',
			'globe.setSun',
			'winds.refresh',
			'layerPanel.setEarth null',
			'autosave.markChanged',
		]);
	});

	it('tell a change of the day length alone from the settings of the world of the moment', async () => {
		const stage = await createStartedStage();
		const world = generateWorld({ resolution: 64, seed: 2, landFraction: 0.2 });
		world.planet = { ...TILTED, dayLengthHours: 30 };
		stage.state.replaceWorld(world, { keepSettings: true });
		stage.log.length = 0;

		stage.planetPanelOptions.onChange({ ...TILTED, dayLengthHours: 24 });
		expect(stage.log).toContain('winds.refresh');
		expect(stage.log).not.toContain('temperature.refresh');
	});

	it('reach nothing with the settings the world already has', async () => {
		const stage = await createStartedStage();
		stage.planetPanelOptions.onChange({ ...DEFAULT_PLANET });
		expect(stage.log).toEqual([]);
	});

	it('are not undone: an undo puts back the last stroke and leaves the planet', async () => {
		const stage = await createStartedStage();
		const before = stage.state.world.elevation[5];
		makeStroke(stage);
		stage.planetPanelOptions.onChange(TILTED);
		stage.log.length = 0;

		stage.pressKey(UNDO_KEYS);
		expect(stage.state.world.elevation[5]).toBe(before);
		expect(stage.state.world.planet).toEqual(TILTED);
		expect(stage.log).toEqual([
			'globe.updateElevation',
			'toolPanel.setHistoryState false true',
			'statistics.refresh',
			'temperature.refresh',
			'layerPanel.setEarth null',
			'autosave.markChanged',
		]);

		stage.pressKey(UNDO_KEYS);
		expect(stage.state.world.planet).toEqual(TILTED);
	});

	it('show the settings of a world imported, without passing them on again', async () => {
		const stage = await createStartedStage();
		const world = generateWorld({ resolution: 64, seed: 2, landFraction: 0.2 });
		world.planet = { ...DEFAULT_PLANET, orbitDistanceAu: 2, starMass: 0.5 };
		stage.importResult = { ok: true, world };
		stage.worldPanelOptions.onImport(new Blob());
		await settle();

		expect(stage.log).toContain('planetPanel.setPlanet 23.44 1 0.5 2 1 24');
		expect(
			stage.log.filter((entry) => entry === 'autosave.markChanged'),
		).toHaveLength(1);
		expect(
			stage.log.filter((entry) => entry === 'temperature.refresh'),
		).toHaveLength(1);
	});

	it('show Earth’s settings for a new world', async () => {
		const stage = await createStartedStage();
		stage.planetPanelOptions.onChange(TILTED);
		stage.worldPanelOptions.onNewWorld();
		const dialog = required(stage.dialogs[1], 'dialog');
		const made = await dialog.createWorld({ kind: 'blank', resolution: 64 });
		made.planet = { ...TILTED };
		stage.log.length = 0;
		dialog.onWorld(made);

		expect(made.planet).toEqual(DEFAULT_PLANET);
		expect(stage.log).toContain(`planetPanel.setPlanet ${EARTH}`);
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

/**
 * A started stage whose temperature runs on the real service, on fake
 * workers and timers, with the statistics on stand-ins as elsewhere.
 *
 * @param options - Whether the temperature is chosen in the Layers section
 * once the page has started, as most cases need (true when left out), and
 * the layer panel to make in place of the stand-in.
 */
const createWorkerStage = async (
	options: {
		readonly showing?: boolean;
		readonly createLayerPanel?: PageParts['createLayerPanel'];
	} = {},
) => {
	const timers = createFakeTimers();
	const workers: FakeWorker[] = [];
	const logged: unknown[] = [];
	const stage = await createStartedStage(undefined, {
		createTemperature: (temperatureOptions) =>
			createTemperatureService({
				...temperatureOptions,
				createWorker: () => {
					const worker = createFakeWorker();
					workers.push(worker);
					return worker;
				},
				setTimer: timers.setTimer,
				clearTimer: timers.clearTimer,
				logError: (error) => logged.push(error),
			}),
		createLayerPanel: options.createLayerPanel,
	});
	if (options.showing ?? true) {
		stage.layerOptions.temperature.setShowing(true);
	}
	/** Moves past the wait, and lets what follows run. */
	const wait = async (): Promise<void> => {
		timers.advance(TEMPERATURE_DEBOUNCE_MS);
		await settle();
	};
	/** Every request posted to any worker so far. */
	const posted = () => workers.flatMap((worker) => worker.posted);
	return { stage, timers, workers, logged, wait, posted };
};

describe('the temperature, on its worker', () => {
	it('is not asked for while the page shows the terrain, as it opens', async () => {
		const page = await createWorkerStage({ showing: false });
		makeStroke(page.stage);
		page.stage.viewPanelOptions.onSeaLevel(-500);
		await page.wait();
		await page.wait();
		expect(page.workers).toHaveLength(1);
		expect(page.posted()).toEqual([]);
		expect(page.stage.temperatureOptions.store.temperature.status).toBe(
			'empty',
		);
	});

	it('is asked for once when the temperature is chosen', async () => {
		const page = await createWorkerStage({ showing: false });
		makeStroke(page.stage);
		await page.wait();
		page.stage.layerOptions.temperature.setShowing(true);
		await page.wait();
		await page.wait();
		expect(page.posted()).toHaveLength(1);
		expect(page.posted()[0]).toMatchObject({
			kind: 'temperature',
			world: page.stage.state.world,
		});
		expect(page.stage.temperatureOptions.store.temperature.status).toBe(
			'calculating',
		);
	});

	it('reaches the globe through the real layer panel once chosen there', async () => {
		const shown: (Float32Array | null)[] = [];
		let choose: ((layer: 'terrain' | 'temperature') => void) | undefined;
		const page = await createWorkerStage({
			showing: false,
			createLayerPanel: (options) =>
				createLayerPanel({
					...options,
					globe: { setLayer: (field) => shown.push(field) },
					setTimer: () => 0,
					clearTimer: () => {},
					reportError: () => {},
					createControls: (controls) => {
						choose = controls.onLayer;
						return {
							showLegend: () => {},
							showView: () => {},
							showComparison: () => {},
						};
					},
				}),
		});
		await page.wait();
		expect(page.posted()).toEqual([]);

		required(choose, 'layer controls')('temperature');
		await page.wait();
		expect(page.posted()).toHaveLength(1);
		const result = temperatureOf(1, page.stage.state.world.elevation.length);
		(page.workers.at(-1) as FakeWorker).respond({
			id: 1,
			kind: 'temperature',
			ok: true,
			result,
		});
		await settle();
		expect(shown).toEqual([result.months[6]]);
		expect(shown[0]).toBe(result.months[6]);
	});

	/** Makes nothing ready beyond the stroke every case starts with. */
	const nothing = (): void => {};

	it.each([
		[
			'a committed stroke',
			nothing,
			(stage: Stage) => {
				const { elevation } = stage.state.world;
				const before = Float32Array.of(elevation[7] as number);
				elevation[7] = 999;
				stage.sculptOptions.onStrokeEnd?.({ cells: Int32Array.of(7), before });
			},
		],
		['an undo', nothing, (stage: Stage) => stage.pressKey(UNDO_KEYS)],
		[
			'a redo',
			(stage: Stage) => stage.pressKey(UNDO_KEYS),
			(stage: Stage) => stage.pressKey(REDO_KEYS),
		],
		[
			'the undo button',
			nothing,
			(stage: Stage) => stage.toolPanelOptions.onHistory('undo'),
		],
		[
			'the sea-level slider',
			nothing,
			(stage: Stage) => stage.viewPanelOptions.onSeaLevel(-500),
		],
		[
			'a change of the planet',
			nothing,
			(stage: Stage) =>
				stage.state.setPlanet({
					...stage.state.world.planet,
					axialTiltDeg: 0,
				}),
		],
		[
			'a drag of a planet slider',
			nothing,
			(stage: Stage) => {
				for (const axialTiltDeg of [20, 15, 10, 5, 0]) {
					stage.planetPanelOptions.onChange({
						...stage.state.world.planet,
						axialTiltDeg,
					});
				}
			},
		],
		[
			'putting Earth’s planet settings back',
			(stage: Stage) =>
				stage.planetPanelOptions.onChange({
					...DEFAULT_PLANET,
					starBrightness: 0.5,
					greenhouseStrength: 2,
				}),
			(stage: Stage) =>
				stage.planetPanelOptions.onChange({ ...DEFAULT_PLANET }),
		],
		[
			'a world replacement',
			nothing,
			(stage: Stage) => stage.state.replaceWorld(createBlankWorld(64)),
		],
	])('is asked for exactly once more after %s', async (_, prepare, trigger) => {
		const page = await createWorkerStage();
		await page.wait();
		// Something to undo, for the triggers that need it, each change with
		// its own request in turn.
		makeStroke(page.stage);
		await page.wait();
		prepare(page.stage);
		await page.wait();
		const before = page.posted().length;

		trigger(page.stage);
		await page.wait();
		await page.wait();
		expect(page.posted().length - before).toBe(1);
	});

	it('marks the store empty, then calculating, when the world is replaced', async () => {
		const page = await createWorkerStage();
		await page.wait();
		const worker = page.workers.at(-1) as FakeWorker;
		worker.respond({
			id: 1,
			kind: 'temperature',
			ok: true,
			result: temperatureOf(1),
		});
		await settle();
		const { store } = page.stage.temperatureOptions;
		expect(store.temperature.status).toBe('current');
		const statuses: string[] = [];
		store.addListener((layer) => statuses.push(layer.status));

		// Told apart from the world it replaces.
		const next = createBlankWorld(64);
		next.elevation[0] = 4321;
		page.stage.state.replaceWorld(next);
		expect(store.temperature).toMatchObject({ status: 'empty', result: null });
		await page.wait();
		expect(statuses).toEqual(['empty', 'calculating']);
		const newest = page.posted().at(-1) as SimRequest<'temperature'>;
		expect(newest.world).toEqual(next);
		expect(newest.world.elevation[0]).toBe(4321);
		expect(newest.start).toBeUndefined();
	});

	it('waits out a stroke under way and is asked for once after it', async () => {
		const page = await createWorkerStage();
		await page.wait();
		page.stage.strokeActive = true;
		page.stage.viewPanelOptions.onSeaLevel(100);
		await page.wait();
		await page.wait();
		expect(page.posted()).toHaveLength(1);

		page.stage.strokeActive = false;
		await page.wait();
		expect(page.posted()).toHaveLength(2);
	});
});

/**
 * A started stage whose temperature and winds run on the real services,
 * each on fake workers of its own, with fake timers, and the statistics on
 * stand-ins as elsewhere. Neither is showing.
 *
 * @param options - Whether the winds can have a worker (true when left
 * out).
 */
const createWindyStage = async (
	options: { readonly windsWorker?: boolean } = {},
) => {
	const timers = createFakeTimers();
	const temperatureWorkers: FakeWorker[] = [];
	const windWorkers: FakeWorker[] = [];
	/** The kind of every request posted to any worker, in order. */
	const kinds: string[] = [];
	const logged: unknown[] = [];
	const starting = (workers: FakeWorker[]) => (): FakeWorker => {
		const worker = createFakeWorker();
		const post = worker.postMessage;
		worker.postMessage = (message) => {
			kinds.push(message.kind);
			post(message);
		};
		workers.push(worker);
		return worker;
	};
	const services = {
		setTimer: timers.setTimer,
		clearTimer: timers.clearTimer,
		logError: (error: unknown) => logged.push(error),
	};
	const stage = await createStartedStage(undefined, {
		createTemperature: (temperatureOptions) =>
			createTemperatureService({
				...temperatureOptions,
				...services,
				createWorker: starting(temperatureWorkers),
			}),
		createWinds: (windsOptions) =>
			createWindsService({
				...windsOptions,
				...services,
				createWorker:
					options.windsWorker === false ? () => null : starting(windWorkers),
			}),
	});
	const { store } = stage.temperatureOptions;
	/** Answers the newest request on the newest of the workers. */
	const answer = async (
		workers: readonly FakeWorker[],
		kind: SimKind,
		result: unknown,
	): Promise<void> => {
		const worker = required(workers.at(-1), `${kind} worker`);
		const request = required(worker.posted.at(-1), `${kind} request`);
		worker.respond({ id: request.id, kind, ok: true, result });
		await settle();
	};
	return {
		stage,
		store,
		kinds,
		logged,
		temperatureWorkers,
		windWorkers,
		/** Moves past the wait, and lets what follows run. */
		wait: async (): Promise<void> => {
			timers.advance(TEMPERATURE_DEBOUNCE_MS);
			await settle();
		},
		/** Answers the newest temperature request with a made-up result. */
		answerTemperature: (yearsRun: number) =>
			answer(
				temperatureWorkers,
				'temperature',
				temperatureOf(yearsRun, stage.state.world.elevation.length),
			),
		/** Answers the newest winds request with made-up winds. */
		answerWinds: (value: number) =>
			answer(windWorkers, 'winds', windResultOf(value)),
		/** The newest winds request. */
		lastWinds: () =>
			required(
				windWorkers.flatMap((worker) => worker.posted).at(-1),
				'winds request',
			) as SimRequest<'winds'>,
	};
};

describe('the winds, on their worker', () => {
	it('with the winds switched on, a stroke leads to one temperature request and then one winds request, and the store ends holding winds for the edited world', async () => {
		const page = await createWindyStage();
		const { store } = page;
		page.stage.layerOptions.winds.setShowing(true);
		// With no temperature yet, the temperature is asked for first, and
		// its result asks for the winds at once.
		await page.wait();
		expect(page.kinds).toEqual(['temperature']);
		await page.answerTemperature(1);
		expect(page.kinds).toEqual(['temperature', 'winds']);
		await page.answerWinds(1);
		expect(store.winds.status).toBe('current');

		makeStroke(page.stage);
		expect(store.winds.status).toBe('outOfDate');
		await page.wait();
		await page.wait();
		expect(page.kinds).toEqual(['temperature', 'winds', 'temperature']);
		await page.answerTemperature(2);
		await page.wait();
		expect(page.kinds).toEqual([
			'temperature',
			'winds',
			'temperature',
			'winds',
		]);
		const temperature = required(
			store.temperature.result ?? undefined,
			'temperature',
		);
		const request = page.lastWinds();
		expect(request.world.elevation[5]).toBe(1234);
		expect(request.world).toEqual(page.stage.state.world);
		expect(request.temperatures).toEqual(temperature.months);

		await page.answerWinds(2);
		expect(store.winds).toEqual({
			status: 'current',
			result: { winds: windResultOf(2), temperature, dayLengthHours: 24 },
		});
		await page.wait();
		expect(page.kinds).toHaveLength(4);
		expect(page.logged).toEqual([]);
	});

	it('with the winds off, never asks for them, whatever changes', async () => {
		const page = await createWindyStage();
		page.stage.layerOptions.temperature.setShowing(true);
		await page.wait();
		await page.answerTemperature(1);
		const changes: ((stage: Stage) => void)[] = [
			makeStroke,
			(stage) => stage.pressKey(UNDO_KEYS),
			(stage) => stage.viewPanelOptions.onSeaLevel(-500),
			(stage) =>
				stage.planetPanelOptions.onChange({
					...stage.state.world.planet,
					axialTiltDeg: 10,
				}),
			(stage) =>
				stage.planetPanelOptions.onChange({
					...stage.state.world.planet,
					dayLengthHours: 30,
				}),
			(stage) => stage.state.replaceWorld(createBlankWorld(64)),
		];
		for (const change of changes) {
			change(page.stage);
			await page.wait();
			await page.wait();
			await page.answerTemperature(2);
		}
		expect(page.windWorkers.flatMap((worker) => worker.posted)).toEqual([]);
		expect(page.kinds.every((kind) => kind === 'temperature')).toBe(true);
		expect(page.store.winds.status).toBe('empty');
	});

	it('asks for the winds and not the temperature for a change of the day length, and for the temperature and then the winds for another setting', async () => {
		const page = await createWindyStage();
		page.stage.layerOptions.winds.setShowing(true);
		await page.wait();
		await page.answerTemperature(1);
		await page.answerWinds(1);
		page.kinds.length = 0;

		page.stage.planetPanelOptions.onChange({
			...DEFAULT_PLANET,
			dayLengthHours: 30,
		});
		expect(page.store.winds.status).toBe('outOfDate');
		expect(page.store.temperature.status).toBe('current');
		await page.wait();
		await page.wait();
		expect(page.kinds).toEqual(['winds']);
		expect(page.lastWinds().world.planet.dayLengthHours).toBe(30);
		await page.answerWinds(2);
		expect(page.store.winds).toMatchObject({
			status: 'current',
			result: { dayLengthHours: 30 },
		});

		page.stage.planetPanelOptions.onChange({
			...DEFAULT_PLANET,
			dayLengthHours: 30,
			axialTiltDeg: 10,
		});
		expect(page.store.winds.status).toBe('outOfDate');
		await page.wait();
		expect(page.kinds).toEqual(['winds', 'temperature']);
		await page.answerTemperature(2);
		expect(page.kinds).toEqual(['winds', 'temperature', 'winds']);
	});

	it('clears the winds for a new world, whose temperature then asks for its winds', async () => {
		const page = await createWindyStage();
		page.stage.layerOptions.winds.setShowing(true);
		await page.wait();
		await page.answerTemperature(1);

		const next = createBlankWorld(64);
		next.elevation[0] = 4321;
		page.stage.state.replaceWorld(next);
		expect(page.store.winds).toEqual({ status: 'empty', result: null });
		// The old world's winds, answered late, are not kept.
		await page.answerWinds(1);
		expect(page.store.winds).toEqual({ status: 'empty', result: null });

		await page.wait();
		await page.answerTemperature(2);
		expect(page.lastWinds().world).toEqual(next);
		await page.answerWinds(2);
		expect(page.store.winds.status).toBe('current');
	});

	it('with no worker for the winds, leaves them unavailable and the rest of the page working', async () => {
		const page = await createWindyStage({ windsWorker: false });
		expect(page.store.winds.status).toBe('unavailable');
		page.stage.layerOptions.winds.setShowing(true);
		await page.wait();
		await page.answerTemperature(1);
		expect(page.store.temperature.status).toBe('current');

		makeStroke(page.stage);
		await page.wait();
		await page.wait();
		await page.answerTemperature(2);
		expect(page.store.temperature.status).toBe('current');
		expect(page.store.winds.status).toBe('unavailable');
		expect(page.kinds).toEqual(['temperature', 'temperature']);
		expect(page.stage.log).toContain('statistics.refresh');
		expect(page.stage.errors).toEqual([]);
	});
});

describe('the cursor readout', () => {
	it('reads the world of the moment, the stroke, and what the layer panel says the globe shows', async () => {
		const stage = await createStartedStage();
		const next = generateWorld({ resolution: 64, seed: 3, landFraction: 0.3 });
		stage.state.replaceWorld(next);
		expect(stage.readoutOptions.currentWorld()).toBe(next);
		expect(stage.readoutOptions.isStrokeActive()).toBe(false);
		stage.strokeActive = true;
		expect(stage.readoutOptions.isStrokeActive()).toBe(true);
		expect(stage.readoutOptions.shownTemperature()).toBeNull();
		const shown: ShownTemperature = {
			field: new Float32Array(next.elevation.length),
			view: 'warmest',
			month: 6,
			source: 'simulated',
			current: true,
		};
		stage.shownTemperature = shown;
		expect(stage.readoutOptions.shownTemperature()).toBe(shown);
	});

	it('looks again after each turn and zoom of the camera', async () => {
		const stage = await createStartedStage();
		stage.moveCamera();
		stage.moveCamera();
		expect(stage.readoutCalls).toEqual(['invalidate', 'invalidate']);
	});

	it.each([
		['a committed stroke', (stage: Stage) => makeStroke(stage)],
		[
			'an undo and a redo',
			(stage: Stage) => {
				makeStroke(stage);
				stage.readoutCalls.length = 0;
				stage.pressKey(UNDO_KEYS);
				stage.pressKey(REDO_KEYS);
			},
		],
		[
			'the sea-level slider',
			(stage: Stage) => stage.viewPanelOptions.onSeaLevel(-500),
		],
		[
			'a new world',
			(stage: Stage) => stage.state.replaceWorld(createBlankWorld(64)),
		],
	])('looks again after %s', async (_name, act) => {
		const stage = await createStartedStage();
		act(stage);
		expect(stage.readoutCalls.length).toBeGreaterThan(0);
		expect(stage.readoutCalls.every((call) => call === 'invalidate')).toBe(
			true,
		);
	});

	it('looks again at each change of the view settings and of the temperature store', async () => {
		const stage = await createStartedStage();
		stage.layerOptions.onView({
			layer: 'temperature',
			temperatureView: 'month',
			source: 'simulated',
			month: 3,
			sunlight: false,
		});
		expect(stage.readoutCalls).toEqual(['invalidate']);
		stage.layerOptions.store.markCalculating();
		stage.layerOptions.store.setResult(temperatureOf(1), true);
		expect(stage.readoutCalls).toEqual([
			'invalidate',
			'invalidate',
			'invalidate',
		]);
	});

	it('does not look again for a change of the planet alone, which changes nothing on screen', async () => {
		const stage = await createStartedStage();
		stage.state.setPlanet({ ...stage.state.world.planet, axialTiltDeg: 0 });
		expect(stage.log).toContain('temperature.refresh');
		expect(stage.readoutCalls).toEqual([]);
	});

	it('is cleared when the New world dialog opens, as the stroke ends', async () => {
		const stage = await createStartedStage();
		stage.worldPanelOptions.onNewWorld();
		expect(stage.readoutCalls).toEqual(['clear']);
		expect(stage.log.slice(0, 2)).toEqual([
			'sculpt.endStroke',
			'openNewWorldDialog no notice',
		]);
	});

	it('reads what the globe shows from the real layer panel', async () => {
		let choose: ((layer: 'terrain' | 'temperature') => void) | undefined;
		const stage = await createStartedStage(undefined, {
			createLayerPanel: (options) =>
				createLayerPanel({
					...options,
					globe: { setLayer: () => {} },
					setTimer: () => 0,
					clearTimer: () => {},
					reportError: () => {},
					createControls: (controls) => {
						choose = controls.onLayer;
						return {
							showLegend: () => {},
							showView: () => {},
							showComparison: () => {},
						};
					},
				}),
		});
		required(choose, 'layer controls')('temperature');
		expect(stage.readoutOptions.shownTemperature()).toBeNull();
		const result = temperatureOf(1, stage.state.world.elevation.length);
		stage.layerOptions.store.markCalculating();
		stage.layerOptions.store.setResult(result, true);
		expect(stage.readoutOptions.shownTemperature()).toEqual({
			field: result.months[DEFAULT_MONTH],
			view: 'month',
			month: DEFAULT_MONTH,
			source: 'simulated',
			current: true,
		});
		stage.layerOptions.store.markOutOfDate();
		expect(stage.readoutOptions.shownTemperature()?.current).toBe(false);
	});
});

describe('the date line', () => {
	it('follows the view settings the layer panel tells of', async () => {
		const stage = await createStartedStage();
		stage.layerOptions.onView({
			layer: 'temperature',
			temperatureView: 'month',
			source: 'simulated',
			month: 6,
			sunlight: false,
		});
		stage.layerOptions.onView({
			layer: 'temperature',
			temperatureView: 'month',
			source: 'simulated',
			month: 7,
			sunlight: false,
		});
		stage.layerOptions.onView({
			layer: 'temperature',
			temperatureView: 'annualMean',
			source: 'simulated',
			month: 7,
			sunlight: false,
		});
		stage.layerOptions.onView({
			layer: 'terrain',
			temperatureView: 'annualMean',
			source: 'simulated',
			month: 7,
			sunlight: false,
		});
		expect(stage.log).toEqual([
			'worldPanel.setDate Year 0 · July',
			'worldPanel.setDate Year 0 · August',
			'globe.setSun',
			'worldPanel.setDate Year 0 · Annual average',
			'worldPanel.setDate Year 0',
		]);
	});

	it('follows the age of a world imported, and of a new one', async () => {
		const stage = await createStartedStage();
		const imported = createBlankWorld(64);
		imported.ageYears = 12_345;
		stage.importResult = { ok: true, world: imported };
		stage.worldPanelOptions.onImport(new Blob());
		await settle();
		expect(stage.log).toContain('worldPanel.setDate 12,345 years');
		stage.log.length = 0;

		stage.state.replaceWorld(createBlankWorld(64));
		expect(stage.log).toContain('worldPanel.setDate Year 0');
	});
});

describe('the month on screen', () => {
	/** A page with the real layer panel, in Temperature view on a result. */
	const createMonthStage = async () => {
		let controls: LayerControlsOptions | undefined;
		const views: PageView[] = [];
		const timers = createFakeTimers();
		const page = await createWorkerStage({
			showing: false,
			createLayerPanel: (options) =>
				createLayerPanel({
					...options,
					globe: { setLayer: () => {} },
					setTimer: timers.setTimer,
					clearTimer: timers.clearTimer,
					reportError: () => {},
					createControls: (made) => {
						controls = made;
						return {
							showLegend: () => {},
							showView: (view) => views.push(view),
							showComparison: () => {},
						};
					},
				}),
		});
		const chosen = required(controls, 'layer controls');
		chosen.onLayer('temperature');
		return { page, controls: chosen, views, timers };
	};

	it('is kept through an edit of the terrain', async () => {
		const { page, controls, views } = await createMonthStage();
		controls.onMonth(2);
		expect(page.stage.log).toContain('worldPanel.setDate Year 0 · March');
		page.stage.log.length = 0;
		makeStroke(page.stage);
		await page.wait();
		expect(views.at(-1)?.month).toBe(2);
		expect(
			page.stage.log.filter((line) => line.startsWith('worldPanel.setDate')),
		).toEqual([]);
	});

	it('goes back to July for a new world, which the date line says', async () => {
		const { page, controls, views } = await createMonthStage();
		controls.onTemperatureView('warmest');
		controls.onTemperatureView('month');
		controls.onMonth(2);
		page.stage.log.length = 0;
		page.stage.state.replaceWorld(createBlankWorld(64));
		expect(views.at(-1)).toEqual({
			layer: 'temperature',
			temperatureView: 'month',
			source: 'simulated',
			month: DEFAULT_MONTH,
			sunlight: false,
		});
		expect(page.stage.log).toContain('worldPanel.setDate Year 0 · July');
	});

	it('stops the year playing for a new world', async () => {
		const { page, controls, timers } = await createMonthStage();
		controls.onPlay();
		timers.advance(PLAYBACK_STEP_MS);
		expect(page.stage.log).toContain('worldPanel.setDate Year 0 · August');
		page.stage.state.replaceWorld(createBlankWorld(64));
		expect(timers.pending()).toBe(0);
	});
});

/** A started page with the real layer panel, on the terrain. */
const createSunStage = async (world?: World) => {
	let controls: LayerControlsOptions | undefined;
	const views: PageView[] = [];
	const timers = createFakeTimers();
	const stage = await createStartedStage(world, {
		createLayerPanel: (options) =>
			createLayerPanel({
				...options,
				globe: { setLayer: () => {} },
				setTimer: timers.setTimer,
				clearTimer: timers.clearTimer,
				reportError: () => {},
				createControls: (made) => {
					controls = made;
					return {
						showLegend: () => {},
						showView: (view) => views.push(view),
						showComparison: () => {},
					};
				},
			}),
	});
	return {
		stage,
		controls: required(controls, 'layer controls'),
		views,
		timers,
	};
};

describe('the sun', () => {
	/** The sun calls in a log. */
	const sunCalls = (log: readonly string[]) =>
		log.filter((line) => line === 'globe.setSun');

	it('is placed once as the page shows its first world, for July', () => {
		const world = createBlankWorld(64);
		world.planet = { ...DEFAULT_PLANET, axialTiltDeg: 40 };
		const stage = createStage(world);
		expect(stage.suns).toEqual([sunOf(DEFAULT_MONTH, world.planet)]);
		expect(stage.log.slice(0, 2)).toEqual([
			`globe.setWorld ${describeWorld(world)}`,
			'globe.setSun',
		]);
	});

	it('follows each change of the month on screen, once each, and nothing else of the view', async () => {
		const stage = await createStartedStage();
		const { planet } = stage.state.world;
		const view: PageView = {
			layer: 'temperature',
			temperatureView: 'month',
			source: 'simulated',
			month: 3,
			sunlight: false,
		};
		stage.layerOptions.onView(view);
		stage.layerOptions.onView({ ...view, temperatureView: 'annualMean' });
		stage.layerOptions.onView({ ...view, layer: 'terrain', sunlight: true });
		stage.layerOptions.onView({ ...view, month: 4 });
		expect(stage.suns).toEqual([sunOf(3, planet), sunOf(4, planet)]);
	});

	it('follows the slider and the year playing through the real layer panel', async () => {
		const { stage, controls, timers } = await createSunStage();
		const { planet } = stage.state.world;
		stage.viewPanelOptions.onSunlight(true);
		controls.onMonth(2);
		expect(stage.suns).toEqual([sunOf(2, planet)]);
		controls.onPlay();
		timers.advance(PLAYBACK_STEP_MS);
		expect(stage.suns).toEqual([sunOf(2, planet), sunOf(3, planet)]);
		expect(stage.log).toContain('worldPanel.setDate Year 0 · April');
	});

	it('follows a change of the planet settings, once, in the month on screen', async () => {
		const { stage, controls } = await createSunStage();
		stage.viewPanelOptions.onSunlight(true);
		controls.onMonth(9);
		stage.suns.length = 0;
		stage.log.length = 0;
		const planet: PlanetSettings = {
			...DEFAULT_PLANET,
			starMass: 0.5,
			starBrightness: 0.2,
			orbitDistanceAu: 0.4,
		};
		stage.planetPanelOptions.onChange(planet);
		expect(stage.suns).toEqual([sunOf(9, planet)]);
		expect(sunCalls(stage.log)).toHaveLength(1);
	});

	it('stays in the month last on screen while a summary is shown', async () => {
		const { stage, controls } = await createSunStage();
		controls.onLayer('temperature');
		controls.onMonth(1);
		controls.onTemperatureView('coldest');
		controls.onLayer('terrain');
		stage.suns.length = 0;
		const planet: PlanetSettings = { ...DEFAULT_PLANET, axialTiltDeg: 60 };
		stage.planetPanelOptions.onChange(planet);
		expect(stage.suns).toEqual([sunOf(1, planet)]);
	});

	it('is placed once for a new world, for its planet', async () => {
		const stage = await createStartedStage();
		const next = createBlankWorld(64);
		next.planet = { ...DEFAULT_PLANET, starMass: 3 };
		stage.importResult = { ok: true, world: next };
		stage.worldPanelOptions.onImport(new Blob());
		await settle();
		expect(stage.suns).toEqual([sunOf(DEFAULT_MONTH, next.planet)]);
		expect(sunCalls(stage.log)).toHaveLength(1);
	});

	it('is placed once for a new world that puts July back on screen', async () => {
		const { stage, controls } = await createSunStage();
		stage.viewPanelOptions.onSunlight(true);
		controls.onMonth(0);
		stage.suns.length = 0;
		stage.log.length = 0;
		const next = createBlankWorld(64);
		next.planet = { ...DEFAULT_PLANET, starBrightness: 4 };
		stage.importResult = { ok: true, world: next };
		stage.worldPanelOptions.onImport(new Blob());
		await settle();
		expect(stage.suns).toEqual([sunOf(DEFAULT_MONTH, next.planet)]);
		expect(sunCalls(stage.log)).toHaveLength(1);
	});
});

describe('the panel’s sections', () => {
	let fake: FakeDocument;
	beforeEach(() => {
		fake = createFakeDocument();
		vi.stubGlobal('document', fake.document);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	/**
	 * The real sections in a panel of their own, on a storage that holds
	 * these entries at first.
	 */
	const createSections = (entries: Readonly<Record<string, string>> = {}) => {
		const storage = createFakeStorage(entries);
		const panel = fake.createElement('aside');
		const sections = createPanelSections(
			panel as unknown as HTMLElement,
			createPanelMemory(storage),
		);
		/** Whether each section is open, in the panel's order. */
		const states = () =>
			PANEL_SECTIONS.map(({ key }) => [key, sections[key].isOpen()]);
		return { storage, sections, states };
	};

	it('are not asked to open or close anything as the page starts', async () => {
		const stage = createStage();
		expect(stage.sectionCalls).toEqual([]);
		stage.answerLoad({ kind: 'empty' });
		await stage.started;
		expect(stage.sectionCalls).toEqual([]);
	});

	it('have the Layers section opened when Sunlight is ticked, and nothing when it is cleared', async () => {
		const stage = await createStartedStage();
		stage.viewPanelOptions.onSunlight(false);
		expect(stage.sectionCalls).toEqual([]);
		stage.viewPanelOptions.onSunlight(true);
		stage.viewPanelOptions.onSunlight(false);
		expect(stage.sectionCalls).toEqual(['layersSection.setOpen true']);
	});

	it('open a closed Layers section when Sunlight is ticked, and remember it as a click would', async () => {
		const { storage, sections, states } = createSections();
		const stage = await createStartedStage(undefined, {
			layersSection: sections.layers,
		});
		stage.viewPanelOptions.onSunlight(true);
		expect(sections.layers.isOpen()).toBe(true);
		expect(sections.layers.body.hidden).toBe(false);
		expect(storage.writes).toEqual([[panelMemoryKey('layers'), 'open']]);

		stage.viewPanelOptions.onSunlight(false);
		expect(states()).toEqual([
			['world', true],
			['layers', true],
			['view', false],
			['planet', false],
			['tools', false],
			['statistics', false],
		]);
		expect(storage.writes).toHaveLength(1);
	});

	it('leave an open Layers section alone when Sunlight is ticked', async () => {
		const { storage, sections } = createSections({
			[panelMemoryKey('layers')]: 'open',
		});
		const stage = await createStartedStage(undefined, {
			layersSection: sections.layers,
		});
		stage.viewPanelOptions.onSunlight(true);
		expect(sections.layers.isOpen()).toBe(true);
		expect(storage.writes).toEqual([]);
	});

	it('are not opened, closed or written to storage by a restored world, a new world and an import', async () => {
		const { storage, sections, states } = createSections({
			[panelMemoryKey('world')]: 'closed',
			[panelMemoryKey('planet')]: 'open',
			[panelMemoryKey('statistics')]: 'open',
		});
		const before = states();
		const stage = createStage(undefined, { layersSection: sections.layers });
		stage.answerLoad({
			kind: 'world',
			world: generateWorld({ resolution: 64, seed: 9, landFraction: 0.4 }),
		});
		await stage.started;
		expect(states()).toEqual(before);

		stage.state.replaceWorld(createBlankWorld(64));
		expect(states()).toEqual(before);

		stage.importResult = { ok: true, world: createBlankWorld(64) };
		stage.worldPanelOptions.onImport(new Blob());
		await settle();
		expect(states()).toEqual(before);
		expect(stage.sectionCalls).toEqual([]);
		expect(storage.writes).toEqual([]);
	});
});

describe('the Sunlight control', () => {
	/** The calls that tell the globe how it is lit, in a log. */
	const sunlightCalls = (log: readonly string[]) =>
		log.filter((line) => line.startsWith('globe.setSunlight'));

	it('turns the globe’s sunlight on and off, once each, and tells the layer panel', async () => {
		const stage = await createStartedStage();
		stage.viewPanelOptions.onSunlight(true);
		stage.viewPanelOptions.onSunlight(false);
		expect(stage.log).toEqual([
			'globe.setSunlight darkened',
			'layerPanel.setSunlight true',
			'globe.setSunlight off',
			'layerPanel.setSunlight false',
		]);
	});

	it('draws the line in Temperature view before there is any temperature on the globe', async () => {
		const { stage, controls } = await createSunStage();
		controls.onLayer('temperature');
		stage.log.length = 0;
		stage.viewPanelOptions.onSunlight(true);
		expect(stage.readoutOptions.shownTemperature()).toBeNull();
		expect(sunlightCalls(stage.log)).toEqual(['globe.setSunlight line']);
	});

	it('darkens the night side in Terrain view', async () => {
		const { stage } = await createSunStage();
		stage.viewPanelOptions.onSunlight(true);
		expect(sunlightCalls(stage.log)).toEqual(['globe.setSunlight darkened']);
	});

	it('tells the globe again, once, at each change of layer while it is on, and not while it is off', async () => {
		const { stage, controls } = await createSunStage();
		controls.onLayer('temperature');
		controls.onLayer('terrain');
		expect(sunlightCalls(stage.log)).toEqual([]);
		stage.viewPanelOptions.onSunlight(true);
		controls.onLayer('temperature');
		controls.onLayer('terrain');
		controls.onLayer('temperature');
		stage.viewPanelOptions.onSunlight(false);
		expect(sunlightCalls(stage.log)).toEqual([
			'globe.setSunlight darkened',
			'globe.setSunlight line',
			'globe.setSunlight darkened',
			'globe.setSunlight line',
			'globe.setSunlight off',
		]);
	});

	it('is kept for a new world, by the globe and the layer panel', async () => {
		let controls: LayerControlsOptions | undefined;
		const views: PageView[] = [];
		const stage = await createStartedStage(undefined, {
			createLayerPanel: (options) =>
				createLayerPanel({
					...options,
					globe: { setLayer: () => {} },
					setTimer: () => 0,
					clearTimer: () => {},
					reportError: () => {},
					createControls: (made) => {
						controls = made;
						return {
							showLegend: () => {},
							showView: (view) => views.push(view),
							showComparison: () => {},
						};
					},
				}),
		});
		stage.viewPanelOptions.onSunlight(true);
		required(controls, 'layer controls').onMonth(2);
		stage.log.length = 0;
		views.length = 0;
		stage.state.replaceWorld(createBlankWorld(64));
		expect(stage.log.filter((line) => line.includes('Sunlight'))).toEqual([]);
		expect(views).toEqual([
			{ ...DEFAULT_PAGE_VIEW, month: DEFAULT_MONTH, sunlight: true },
		]);
		expect(stage.log).toContain('worldPanel.setDate Year 0 · July');
	});
});

describe('the temperature, with a part showing it that fails', () => {
	it.each([
		['a committed stroke', makeStroke],
		[
			'the sea-level slider',
			(stage: Stage) => stage.viewPanelOptions.onSeaLevel(-500),
		],
	])(
		'is still asked for, and the world still marked changed, after %s, with the error recorded',
		async (_, change) => {
			const page = await createWorkerStage();
			await page.wait();
			const worker = page.workers.at(-1) as FakeWorker;
			worker.respond({
				id: 1,
				kind: 'temperature',
				ok: true,
				result: temperatureOf(1),
			});
			await settle();
			// The store reaches whatever shows the temperature through the
			// part that computes it, as here.
			const { store } = page.stage.temperatureOptions;
			expect(store.temperature.status).toBe('current');
			const failure = new Error('could not draw');
			store.addListener((layer) => {
				if (layer.status === 'outOfDate') {
					throw failure;
				}
			});
			page.stage.log.length = 0;
			const before = page.posted().length;

			change(page.stage);
			expect(page.stage.log).toContain('autosave.markChanged');
			expect(page.stage.errors).toEqual([failure]);
			await page.wait();
			await page.wait();
			expect(page.posted().length - before).toBe(1);
		},
	);
});

describe('a worker that fails to load', () => {
	it('leaves every service unavailable and the page working', async () => {
		const failing = (): FakeWorker => {
			const worker = createFakeWorker();
			// A script that fails to load says so once, soon after it starts.
			queueMicrotask(() => worker.emit('error', { message: 'not found' }));
			return worker;
		};
		const readout: string[] = [];
		const timers = createFakeTimers();
		const temperatureLog: unknown[] = [];
		const workers: FakeWorker[] = [];
		const make = (): FakeWorker => {
			const worker = failing();
			workers.push(worker);
			return worker;
		};
		const stage = await createStartedStage(undefined, {
			createStatistics: (options) =>
				createStatisticsService({
					...options,
					createWorker: make,
					readout: {
						show: () => readout.push('show'),
						showPending: () => readout.push('showPending'),
						showUnavailable: () => readout.push('showUnavailable'),
					},
					setTimer: timers.setTimer,
					clearTimer: timers.clearTimer,
					logError: () => {},
				}),
			createTemperature: (options) =>
				createTemperatureService({
					...options,
					createWorker: make,
					setTimer: timers.setTimer,
					clearTimer: timers.clearTimer,
					logError: (error) => temperatureLog.push(error),
				}),
			createWinds: (options) =>
				createWindsService({
					...options,
					createWorker: make,
					setTimer: timers.setTimer,
					clearTimer: timers.clearTimer,
					logError: (error) => temperatureLog.push(error),
				}),
		});
		await settle();
		expect(workers).toHaveLength(3);
		expect(readout).toContain('showUnavailable');
		const { store } = stage.temperatureOptions;
		expect(store.temperature.status).toBe('unavailable');
		expect(store.winds.status).toBe('unavailable');
		stage.layerOptions.winds.setShowing(true);

		// The page goes on: a stroke and its undo still work.
		makeStroke(stage);
		stage.pressKey(UNDO_KEYS);
		expect(stage.state.world.elevation[5]).not.toBe(1234);
		timers.advance(TEMPERATURE_DEBOUNCE_MS * 2);
		await settle();
		expect(workers.flatMap((worker) => worker.posted)).toEqual([]);
		expect(store.temperature.status).toBe('unavailable');
		expect(store.winds.status).toBe('unavailable');
		expect(stage.errors).toEqual([]);
		expect(temperatureLog).toEqual([]);
	});
});

describe('the comparison on the measured Earth', () => {
	const EARTH_DATA = decodeEarth(readEarthDataFile());
	/** A new Earth world at 64 cells per face edge. */
	const freshEarth = (): World => earthWorld(EARTH_DATA, 64);

	/** A page on a world, with the real layer panel, in Temperature view. */
	const createComparisonStage = async (world: World = freshEarth()) => {
		let controls: LayerControlsOptions | undefined;
		const comparisons: ComparisonContent[] = [];
		const stage = await createStartedStage(world, {
			createLayerPanel: (options) =>
				createLayerPanel({
					...options,
					loadObserved: async (resolution) =>
						Array.from(
							{ length: 12 },
							() => new Float32Array(6 * resolution * resolution),
						),
					globe: { setLayer: () => {} },
					setTimer: () => 0,
					clearTimer: () => {},
					reportError: () => {},
					createControls: (made) => {
						controls = made;
						return {
							showLegend: () => {},
							showView: () => {},
							showComparison: (content) => comparisons.push(content),
						};
					},
				}),
		});
		const chosen = required(controls, 'layer controls');
		chosen.onLayer('temperature');
		/** Has a current result for the world on show arrive. */
		const arrive = (): void => {
			const { store } = stage.layerOptions;
			store.markCalculating();
			store.setResult(
				temperatureOf(1, stage.state.world.elevation.length),
				true,
			);
		};
		arrive();
		return {
			stage,
			controls: chosen,
			arrive,
			offered: (): boolean => comparisons.at(-1)?.offered ?? false,
			source: () => comparisons.at(-1)?.source,
			shownSource: () => stage.readoutOptions.shownTemperature()?.source,
		};
	};

	/** A page on the measured Earth showing the observed temperature. */
	const createObservingStage = async () => {
		const page = await createComparisonStage();
		page.controls.onSource('observed');
		await settle();
		expect(page.shownSource()).toBe('observed');
		return page;
	};

	it('is offered for the Earth the page opens on, in Temperature view only', async () => {
		const page = await createComparisonStage();
		expect(page.offered()).toBe(true);
		expect(page.source()).toBe('simulated');
		page.controls.onLayer('terrain');
		expect(page.offered()).toBe(false);
		page.controls.onLayer('temperature');
		expect(page.offered()).toBe(true);
	});

	it.each([
		[
			'a generated world',
			() => generateWorld({ resolution: 64, seed: 3, landFraction: 0.3 }),
		],
		['a blank world', () => createBlankWorld(64)],
	])('is not offered for %s', async (_, make) => {
		const page = await createComparisonStage(make());
		expect(page.offered()).toBe(false);
		page.stage.state.replaceWorld(make());
		expect(page.offered()).toBe(false);
	});

	it('goes, with the view back on Simulated, after a stroke, and comes back on Simulated after its undo', async () => {
		const page = await createObservingStage();
		makeStroke(page.stage);
		expect(page.offered()).toBe(false);
		expect(page.source()).toBe('simulated');
		expect(page.shownSource()).toBe('simulated');
		page.stage.pressKey(UNDO_KEYS);
		expect(page.offered()).toBe(true);
		expect(page.source()).toBe('simulated');
		page.stage.pressKey(REDO_KEYS);
		expect(page.offered()).toBe(false);
	});

	it('goes after a change of sea level, and comes back with the sea level set back', async () => {
		const page = await createObservingStage();
		page.stage.viewPanelOptions.onSeaLevel(-500);
		expect(page.offered()).toBe(false);
		expect(page.shownSource()).toBe('simulated');
		page.stage.viewPanelOptions.onSeaLevel(0);
		expect(page.offered()).toBe(true);
		expect(page.source()).toBe('simulated');
	});

	it('goes after a change of a planet setting, and comes back with Reset to Earth', async () => {
		const page = await createObservingStage();
		page.stage.planetPanelOptions.onChange({
			...DEFAULT_PLANET,
			axialTiltDeg: 30,
		});
		expect(page.offered()).toBe(false);
		expect(page.shownSource()).toBe('simulated');
		page.stage.planetPanelOptions.onChange(DEFAULT_PLANET);
		expect(page.offered()).toBe(true);
		expect(page.source()).toBe('simulated');
	});

	it('goes for a new world that is not the measured Earth, and comes for one that is', async () => {
		const page = await createObservingStage();
		page.stage.state.replaceWorld(createBlankWorld(64));
		expect(page.offered()).toBe(false);
		page.stage.state.replaceWorld(freshEarth());
		expect(page.offered()).toBe(true);
		expect(page.source()).toBe('simulated');
	});

	it('is offered for an Earth world brought back or imported that still matches, and not for one that does not', async () => {
		const page = await createComparisonStage(createBlankWorld(64));
		const readBack = (world: World): World => {
			const read = deserializeWorld(serializeWorld(world));
			if (!read.ok) {
				throw new Error('The world could not be read back');
			}
			return read.world;
		};
		page.stage.state.replaceWorld(readBack(freshEarth()), {
			keepSettings: true,
		});
		expect(page.offered()).toBe(true);

		const edited = freshEarth();
		edited.seaLevel = 10;
		page.stage.importResult = { ok: true, world: readBack(edited) };
		page.stage.worldPanelOptions.onImport(new Blob());
		await settle();
		expect(page.stage.state.world.seaLevel).toBe(10);
		expect(page.offered()).toBe(false);

		page.stage.importResult = { ok: true, world: readBack(freshEarth()) };
		page.stage.worldPanelOptions.onImport(new Blob());
		await settle();
		expect(page.offered()).toBe(true);
	});
});
