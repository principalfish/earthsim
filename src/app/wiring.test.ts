import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readEarthDataFile } from '../../scripts/earth/dataFile.mjs';
import {
	type ClimateProgress,
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
	type SimRequest,
	serializeWorld,
	sunColour,
	sunDirection,
	sunDrawnSize,
	type Vec3,
	type World,
	type WorldFileResult,
} from '../core/index';
import { climatePassOf } from '../core/testing/climateFixtures';
import { temperatureOf } from '../core/testing/temperatureFixtures';
import { windResultOf } from '../core/testing/windFixtures';
import {
	createFakeWorker,
	type FakeWorker,
} from '../worker/testing/fakeWorker';
import { type AppState, createAppState } from './editing/appState';
import type { SculptOptions, StrokeChanges } from './editing/sculpt';
import type { ShortcutEvent } from './editing/undo';
import { MAIN_BUTTON, SECONDARY_BUTTON } from './globe/input';
import { PLAYBACK_STEP_MS } from './layers/playback';
import { CLIMATE_DEBOUNCE_MS } from './layers/refresh';
import { TEMPERATURE_LAYER } from './layers/scalar';
import {
	DEFAULT_MONTH,
	DEFAULT_PAGE_VIEW,
	type PageView,
	type StoredView,
} from './layers/view';
import {
	createClimateService,
	createStatisticsService,
} from './layers/workerService';
import { RESTORE_FAILED_MESSAGE } from './saving/startup';
import type { LoadOutcome } from './saving/storage';
import { createPanelMemory, panelMemoryKey } from './settings/panelMemory';
import {
	createPreferences,
	GRID_KEY,
	LAYER_KEY,
	OFF_ENTRY,
	OLD_WIND_SPEED_UNIT_KEY,
	ON_ENTRY,
	type PreferenceStorage,
	SUNLIGHT_KEY,
	summaryKey,
	UNIT_SYSTEM_KEY,
	unitOverrideKey,
	WIND_STYLE_KEY,
	WINDS_KEY,
} from './settings/preferences';
import {
	DEFAULT_UNIT_CHOICE,
	SYSTEM_UNITS,
	type UnitChoice,
} from './settings/units';
import { answerWinds, arriveClimate } from './testing/climateStore';
import {
	byClass,
	createFakeDocument,
	type FakeDocument,
	type FakeElement,
} from './testing/fakeDocument';
import { createFakeStorage, type FakeStorage } from './testing/fakeStorage';
import { createFakeTimers } from './testing/fakeTimers';
import { settle } from './testing/settle';
import {
	createLayerPanel,
	type ShownLayer,
	type ShownWinds,
} from './ui/layerPanel';
import type { ComparisonContent } from './ui/main/comparison';
import { describeReadout } from './ui/main/cursorReadout';
import { CALCULATING_CLIMATE_TEXT } from './ui/main/infoBox';
import { createLayerDock, type LayerDockOptions } from './ui/main/layerDock';
import type { LegendContent } from './ui/main/legend';
import type { PauseButtonOptions } from './ui/main/pauseButton';
import type { TimelineOptions } from './ui/main/timeline';
import { createTopBar, type TopBarOptions } from './ui/main/topBar';
import {
	FIRST_NEW_WORLD_VALUES,
	type NewWorldDialogOptions,
	newWorldValuesFor,
} from './ui/panel/newWorldDialog';
import { createPanelSections, PANEL_SECTIONS } from './ui/panel/panelSections';
import type { PlanetPanelOptions } from './ui/panel/planetPanel';
import type { SettingsPanelOptions } from './ui/panel/settingsPanel';
import type { ToolPanelOptions } from './ui/panel/toolPanel';
import type { ViewPanelOptions } from './ui/panel/viewPanel';
import {
	describeWorld,
	EXPORT_FAILED_MESSAGE,
	NOT_A_WORLD_MESSAGE,
	type WorldPanelOptions,
} from './ui/panel/worldPanel';
import {
	type PageAutosaveOptions,
	type PageClimateOptions,
	type PageLayerOptions,
	type PageParts,
	type PageReadoutOptions,
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
	readonly settingsPanelOptions: SettingsPanelOptions;
	/** Every choice of units the stand-in for the settings was shown. */
	readonly settingsUnits: UnitChoice[];
	readonly dockOptions: LayerDockOptions;
	/** Every view the stand-in for the dock was told to show, in order. */
	readonly dockViews: PageView[];
	readonly topBarOptions: TopBarOptions;
	/** Every view the stand-in for the top bar was told to show, in order. */
	readonly topBarViews: PageView[];
	/** What the stand-in for the top bar's comparison was told, in order. */
	readonly comparisons: ComparisonContent[];
	readonly timelineOptions: TimelineOptions;
	/**
	 * Every view the stand-in for the timeline was told to show, with
	 * whether the year was playing, in order.
	 */
	readonly timelineViews: {
		readonly view: PageView;
		readonly playing: boolean;
	}[];
	readonly planetPanelOptions: PlanetPanelOptions;
	readonly statisticsOptions: PageStatisticsOptions;
	readonly climateOptions: PageClimateOptions;
	readonly layerOptions: PageLayerOptions;
	readonly pauseOptions: PauseButtonOptions;
	readonly readoutOptions: PageReadoutOptions;
	/** What the stand-in for the cursor readout was asked to do, in order. */
	readonly readoutCalls: string[];
	/** What the stand-in for the layer panel says the globe shows. */
	shownTemperature: ShownLayer | null;
	/** What the stand-in for the layer panel says the globe shows of the winds. */
	shownWinds: ShownWinds | null;
	/** The storage the page's preferences are kept in. */
	readonly preferenceStorage: FakeStorage;
	/** Every sun the globe was given, in order. */
	readonly suns: Sun[];
	/** Every way the globe was told to draw the winds, in order. */
	readonly globeWindStyles: string[];
	/**
	 * The ways the globe had been told to draw the winds when it was first
	 * given a world, before which it draws nothing.
	 */
	readonly globeWindStylesBeforeWorld: readonly string[];
	/** Everything the globe was told of whether the page is visible, in order. */
	readonly globeVisibility: boolean[];
	/** Says that the page has become visible, or hidden. */
	setPageVisible(visible: boolean): void;
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
	Pick<PageParts, 'createStatistics' | 'createClimate' | 'createLayerPanel'>
> & {
	/** What the storage of the page's preferences holds at first. */
	readonly preferenceEntries?: Readonly<Record<string, string>>;
	/**
	 * Whether the storage of the page's preferences throws on every read and
	 * every write.
	 */
	readonly preferencesRefused?: boolean;
	/** Whether the system asks for reduced motion. */
	readonly reducedMotion?: boolean;
};

/** Storage that throws on every read and every write. */
const REFUSING_STORAGE: PreferenceStorage = {
	getItem: () => {
		throw new Error('Storage is blocked');
	},
	setItem: () => {
		throw new Error('Storage is blocked');
	},
	removeItem: () => {
		throw new Error('Storage is blocked');
	},
};

const createStage = (
	world: World = createBlankWorld(64),
	own: StageParts = {},
): Stage => {
	const log: string[] = [];
	const errors: unknown[] = [];
	const saved: World[] = [];
	const dialogs: NewWorldDialogOptions[] = [];
	const suns: Sun[] = [];
	const globeWindStyles: string[] = [];
	const globeVisibility: boolean[] = [];
	const state = createAppState({ world, seaLevelRange: SEA_LEVEL_RANGE });
	let sculptOptions:
		| Pick<SculptOptions, 'onStrokeEnd' | 'onWorldChange'>
		| undefined;
	let worldPanelOptions: WorldPanelOptions | undefined;
	let autosaveOptions: PageAutosaveOptions | undefined;
	let toolPanelOptions: ToolPanelOptions | undefined;
	let viewPanelOptions: ViewPanelOptions | undefined;
	let settingsPanelOptions: SettingsPanelOptions | undefined;
	const settingsUnits: UnitChoice[] = [];
	let globeWindStylesBeforeWorld: string[] | undefined;
	let dockOptions: LayerDockOptions | undefined;
	const dockViews: PageView[] = [];
	let topBarOptions: TopBarOptions | undefined;
	const topBarViews: PageView[] = [];
	const comparisons: ComparisonContent[] = [];
	let timelineOptions: TimelineOptions | undefined;
	const timelineViews: {
		readonly view: PageView;
		readonly playing: boolean;
	}[] = [];
	let planetPanelOptions: PlanetPanelOptions | undefined;
	let statisticsOptions: PageStatisticsOptions | undefined;
	let climateOptions: PageClimateOptions | undefined;
	let layerOptions: PageLayerOptions | undefined;
	let pauseOptions: PauseButtonOptions | undefined;
	let readoutOptions: PageReadoutOptions | undefined;
	let onCameraMove: (() => void) | undefined;
	const readoutCalls: string[] = [];
	const preferenceStorage = createFakeStorage(own.preferenceEntries);
	let keyListener: ((event: ShortcutEvent) => void) | undefined;
	let hidingListener: (() => void) | undefined;
	let visibilityListener: ((visible: boolean) => void) | undefined;
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
		get settingsPanelOptions() {
			return required(settingsPanelOptions, 'settings panel');
		},
		settingsUnits,
		get globeWindStylesBeforeWorld() {
			return required(globeWindStylesBeforeWorld, 'world on the globe');
		},
		get dockOptions() {
			return required(dockOptions, 'dock');
		},
		dockViews,
		get topBarOptions() {
			return required(topBarOptions, 'top bar');
		},
		topBarViews,
		comparisons,
		get timelineOptions() {
			return required(timelineOptions, 'timeline');
		},
		timelineViews,
		get planetPanelOptions() {
			return required(planetPanelOptions, 'planet panel');
		},
		get statisticsOptions() {
			return required(statisticsOptions, 'statistics');
		},
		get climateOptions() {
			return required(climateOptions, 'climate');
		},
		get layerOptions() {
			return required(layerOptions, 'layer panel');
		},
		get pauseOptions() {
			return required(pauseOptions, 'Pause button');
		},
		get readoutOptions() {
			return required(readoutOptions, 'cursor readout');
		},
		readoutCalls,
		shownTemperature: null,
		shownWinds: null,
		preferenceStorage,
		suns,
		globeWindStyles,
		globeVisibility,
		setPageVisible: (visible) =>
			required(visibilityListener, 'page-visibility listener')(visible),
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
			setWorld: (next) => {
				globeWindStylesBeforeWorld ??= [...globeWindStyles];
				log.push(`globe.setWorld ${describeWorld(next)}`);
			},
			setSeaLevel: (metres) => log.push(`globe.setSeaLevel ${metres}`),
			setExaggeration: (factor) => log.push(`globe.setExaggeration ${factor}`),
			setGridVisible: (visible) => log.push(`globe.setGridVisible ${visible}`),
			setSun: (direction, sizeDeg, colour) => {
				log.push('globe.setSun');
				suns.push({ direction, sizeDeg, colour });
			},
			setSunlight: (style) => log.push(`globe.setSunlight ${style}`),
			updateElevation: () => log.push('globe.updateElevation'),
			// Recorded apart from the log, which the other tests read whole.
			setWindStyle: (style) => globeWindStyles.push(style),
			setPageVisible: (visible) => globeVisibility.push(visible),
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
				setUnits: (units) =>
					log.push(`toolPanel.setUnits ${units.height} ${units.distance}`),
			};
		},
		createViewPanel: (options) => {
			log.push(`createViewPanel ${options.seaLevel}`);
			viewPanelOptions = options;
			return {
				setSeaLevel: (metres) => log.push(`viewPanel.setSeaLevel ${metres}`),
				setHeightUnit: (unit) => log.push(`viewPanel.setHeightUnit ${unit}`),
			};
		},
		createSettingsPanel: (options) => {
			log.push('createSettingsPanel');
			settingsPanelOptions = options;
			return { showUnits: (choice) => settingsUnits.push(choice) };
		},
		createLayerDock: (options) => {
			log.push('createLayerDock');
			dockOptions = options;
			return { showView: (view) => dockViews.push(view) };
		},
		createTopBar: (options) => {
			log.push('createTopBar');
			topBarOptions = options;
			return {
				showView: (view) => topBarViews.push(view),
				// Recorded apart from the log, which the other tests read whole.
				showComparison: (content) => comparisons.push(content),
			};
		},
		createTimeline: (options) => {
			log.push('createTimeline');
			timelineOptions = options;
			return {
				showView: (view, playing) => timelineViews.push({ view, playing }),
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
				setHeightUnit: (unit) => log.push(`statistics.setHeightUnit ${unit}`),
			};
		},
		createClimate: (options) => {
			log.push('createClimate');
			climateOptions = options;
			if (own.createClimate !== undefined) {
				return own.createClimate(options);
			}
			return {
				refresh: () => log.push('climate.refresh'),
				refreshNow: () => log.push('climate.refreshNow'),
				reset: () => log.push('climate.reset'),
				setRunning: (running) => log.push(`climate.setRunning ${running}`),
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
				setLayer: (layer) => log.push(`layerPanel.setLayer ${layer}`),
				setSummary: (layer, summary) =>
					log.push(`layerPanel.setSummary ${layer} ${summary}`),
				setSource: (source) => log.push(`layerPanel.setSource ${source}`),
				setSunlight: (on) => log.push(`layerPanel.setSunlight ${on}`),
				setWinds: (on) => log.push(`layerPanel.setWinds ${on}`),
				setGrid: (on) => log.push(`layerPanel.setGrid ${on}`),
				setMonth: (month) => log.push(`layerPanel.setMonth ${month}`),
				togglePlaying: () => log.push('layerPanel.togglePlaying'),
				setPaused: (paused) => log.push(`layerPanel.setPaused ${paused}`),
				setUnits: (units) =>
					log.push(`layerPanel.setUnits ${JSON.stringify(units)}`),
				shown: () => stage.shownTemperature,
				shownWinds: () => stage.shownWinds,
			};
		},
		createPauseButton: (options) => {
			log.push('createPauseButton');
			pauseOptions = options;
		},
		createCursorReadout: (options) => {
			log.push('createCursorReadout');
			readoutOptions = options;
			return {
				invalidate: () => readoutCalls.push('invalidate'),
				clear: () => readoutCalls.push('clear'),
			};
		},
		preferences: createPreferences(
			own.preferencesRefused === true ? REFUSING_STORAGE : preferenceStorage,
			{ reducedMotion: own.reducedMotion },
		),
		openNewWorldDialog: (options) => {
			log.push(`openNewWorldDialog ${options.notice ?? 'no notice'}`);
			dialogs.push(options);
		},
		openModelSettings: () => log.push('openModelSettings'),
		loadEarth: () => Promise.reject(new Error('The Earth is not asked for')),
		loadObserved: () =>
			Promise.reject(new Error('The observed temperature is not asked for')),
		loadObservedWinds: () =>
			Promise.reject(new Error('The observed winds are not asked for')),
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
		onPageVisibility: (listener) => {
			visibilityListener = listener;
			listener(true);
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
			'globe.setGridVisible false',
			`createViewInput ${MAIN_BUTTON}`,
			'createSculpt',
			`createWorldPanel ${describeWorld(world)}`,
			'worldPanel.setDate Year 0',
			'openStore',
			'createAutosave',
			'createToolPanel',
			`createViewPanel ${DEFAULT_SEA_LEVEL_M}`,
			'createSettingsPanel',
			'createLayerDock',
			'createTopBar',
			'createTimeline',
			`createPlanetPanel ${EARTH}`,
			'createClimate',
			'createLayerPanel',
			'createPauseButton',
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

	it('gives the layer panel the store the climate writes, and tells the climate nothing of what is shown', async () => {
		const stage = await createStartedStage();
		expect(stage.layerOptions.store).toBe(stage.climateOptions.store);
		stage.dockOptions.onLayer('temperature');
		stage.dockOptions.onWinds(true);
		stage.dockOptions.onLayer('pressure');
		stage.dockOptions.onWinds(false);
		stage.dockOptions.onLayer('terrain');
		expect(stage.log).toEqual([
			'layerPanel.setLayer temperature',
			'layerPanel.setWinds true',
			'layerPanel.setLayer pressure',
			'layerPanel.setWinds false',
			'layerPanel.setLayer terrain',
		]);
	});

	it('stops the climate on Pause, and runs it again on its release, telling the layer panel each time', async () => {
		const stage = await createStartedStage();
		stage.pauseOptions.onPause(true);
		stage.pauseOptions.onPause(false);
		expect(stage.log).toEqual([
			'climate.setRunning false',
			'layerPanel.setPaused true',
			'climate.setRunning true',
			'layerPanel.setPaused false',
		]);
	});

	it('gives the climate the world of the moment, the stroke and an empty store, for the temperature and the winds alike', async () => {
		const stage = await createStartedStage();
		const { climateOptions } = stage;
		expect(climateOptions.store.temperature.status).toBe('empty');
		expect(climateOptions.store.winds.status).toBe('empty');
		const next = generateWorld({ resolution: 64, seed: 3, landFraction: 0.3 });
		stage.state.replaceWorld(next);
		expect(climateOptions.currentWorld()).toBe(next);
		expect(climateOptions.isStrokeActive()).toBe(false);
		stage.strokeActive = true;
		expect(climateOptions.isStrokeActive()).toBe(true);
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
			'climate.reset',
			'layerPanel.newWorld null',
			'globe.setSun',
			'worldPanel.setMessage null',
			'autosave.markChanged',
			// Asked for last, and at once, once every part is on the new
			// world.
			'climate.refreshNow',
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
			'climate.reset',
			'layerPanel.newWorld null',
			'globe.setSun',
			'worldPanel.setDate 2.4 million years',
			'worldPanel.setMessage null',
			'autosave.markChanged',
			'climate.refreshNow',
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
			'climate.refreshNow',
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
			'climate.refreshNow',
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
			'climate.refreshNow',
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
			'climate.refresh',
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
			'climate.refresh',
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
			'climate.refresh',
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
			'climate.refresh',
			'layerPanel.setEarth null',
			'autosave.markChanged',
			'globe.updateElevation',
			'toolPanel.setHistoryState true false',
			'statistics.refresh',
			'climate.refresh',
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
			'climate.refresh',
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

	it('the exaggeration reaches only the globe, and the dock’s Grid tile the globe and then the layer panel', async () => {
		const stage = await createStartedStage();
		stage.viewPanelOptions.onExaggeration(40);
		stage.dockOptions.onGrid(true);
		stage.dockOptions.onGrid(false);
		expect(stage.log).toEqual([
			'globe.setExaggeration 40',
			'globe.setGridVisible true',
			'layerPanel.setGrid true',
			'globe.setGridVisible false',
			'layerPanel.setGrid false',
		]);
	});

	it('the dock starts on the page’s starting view, with the grid hidden', async () => {
		const stage = await createStartedStage();
		expect(stage.dockOptions.view).toEqual(DEFAULT_PAGE_VIEW);
		expect(stage.dockOptions.view.grid).toBe(false);
	});

	it('the layer chosen on the dock reaches the layer panel alone', async () => {
		const stage = await createStartedStage();
		stage.dockOptions.onLayer('pressure');
		stage.dockOptions.onLayer('terrain');
		expect(stage.log).toEqual([
			'layerPanel.setLayer pressure',
			'layerPanel.setLayer terrain',
		]);
	});

	it('the dock’s Winds and Sunlight tiles reach the layer panel, and the sunlight the globe', async () => {
		const stage = await createStartedStage();
		stage.dockOptions.onWinds(true);
		stage.dockOptions.onSunlight(true);
		stage.dockOptions.onWinds(false);
		stage.dockOptions.onSunlight(false);
		expect(stage.log).toEqual([
			'layerPanel.setWinds true',
			'globe.setSunlight darkened',
			'layerPanel.setSunlight true',
			'layerPanel.setWinds false',
			'globe.setSunlight off',
			'layerPanel.setSunlight false',
		]);
	});

	it('the dock is shown each view the layer panel tells of', async () => {
		const stage = await createStartedStage();
		const view: PageView = { ...DEFAULT_PAGE_VIEW, layer: 'pressure' };
		stage.layerOptions.onView(view, false);
		expect(stage.dockViews).toEqual([view]);
	});

	it('the top bar starts on the page’s starting view', async () => {
		const stage = await createStartedStage();
		expect(stage.topBarOptions.view).toEqual(DEFAULT_PAGE_VIEW);
		expect(stage.topBarOptions.layers).toBeUndefined();
	});

	it('the view of the year and the source chosen on the top bar reach the layer panel alone', async () => {
		const stage = await createStartedStage();
		stage.topBarOptions.onSummary('pressure', 'annualMean');
		stage.topBarOptions.onSource('observed');
		expect(stage.log).toEqual([
			'layerPanel.setSummary pressure annualMean',
			'layerPanel.setSource observed',
		]);
	});

	it('the top bar is shown each view and each comparison the layer panel tells of', async () => {
		const stage = await createStartedStage();
		const view: PageView = { ...DEFAULT_PAGE_VIEW, layer: 'temperature' };
		stage.layerOptions.onView(view, false);
		expect(stage.topBarViews).toEqual([view]);
		const content: ComparisonContent = {
			offered: ['simulated', 'observed'],
			source: 'observed',
			message: null,
		};
		stage.layerOptions.onComparison(content);
		expect(stage.comparisons).toEqual([content]);
	});

	it('the timeline starts on the page’s starting view', async () => {
		const stage = await createStartedStage();
		expect(stage.timelineOptions.view).toEqual(DEFAULT_PAGE_VIEW);
	});

	it('the month and Play chosen on the timeline reach the layer panel alone', async () => {
		const stage = await createStartedStage();
		stage.timelineOptions.onMonth(2);
		stage.timelineOptions.onPlay();
		expect(stage.log).toEqual([
			'layerPanel.setMonth 2',
			'layerPanel.togglePlaying',
		]);
	});

	it('the timeline is shown each view the layer panel tells of, with whether the year is playing', async () => {
		const stage = await createStartedStage();
		const view: PageView = { ...DEFAULT_PAGE_VIEW, layer: 'temperature' };
		stage.layerOptions.onView(view, false);
		stage.layerOptions.onView({ ...view, month: 7 }, true);
		expect(stage.timelineViews).toEqual([
			{ view, playing: false },
			{ view: { ...view, month: 7 }, playing: true },
		]);
	});
});

describe('a change of the planet settings', () => {
	it('reaches the temperature and the autosave, once each, and not the statistics', async () => {
		const stage = await createStartedStage();
		stage.state.setPlanet({ ...stage.state.world.planet, axialTiltDeg: 0 });
		expect(stage.log).toEqual([
			'globe.setSun',
			'climate.refresh',
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

	it('set the world of the moment, then reach the climate and the autosave once each, and not the statistics', async () => {
		const stage = await createStartedStage();
		const next = createBlankWorld(64);
		stage.state.replaceWorld(next);
		stage.log.length = 0;

		stage.planetPanelOptions.onChange(TILTED);
		expect(next.planet).toEqual(TILTED);
		expect(stage.log).toEqual([
			'globe.setSun',
			'climate.refresh',
			'layerPanel.setEarth null',
			'autosave.markChanged',
		]);
	});

	it('send a change of the day length alone to the climate, as any other, since the winds and through them the temperature depend on it', async () => {
		const stage = await createStartedStage();
		stage.planetPanelOptions.onChange({
			...DEFAULT_PLANET,
			dayLengthHours: 30,
		});
		expect(stage.log).toEqual([
			'globe.setSun',
			'climate.refresh',
			'layerPanel.setEarth null',
			'autosave.markChanged',
		]);
	});

	it('send each change of several settings, the day length among them, to the climate once', async () => {
		const stage = await createStartedStage();
		stage.planetPanelOptions.onChange({ ...TILTED, dayLengthHours: 30 });
		stage.planetPanelOptions.onChange({ ...TILTED, dayLengthHours: 30 });
		stage.planetPanelOptions.onChange({ ...TILTED, dayLengthHours: 20 });
		expect(stage.log).toEqual([
			'globe.setSun',
			'climate.refresh',
			'layerPanel.setEarth null',
			'autosave.markChanged',
			'globe.setSun',
			'climate.refresh',
			'layerPanel.setEarth null',
			'autosave.markChanged',
		]);
	});

	it('put the day back to 24 hours with Earth’s settings, asking for the climate again', async () => {
		const stage = await createStartedStage();
		stage.planetPanelOptions.onChange({
			...DEFAULT_PLANET,
			dayLengthHours: 30,
		});
		stage.log.length = 0;

		stage.planetPanelOptions.onChange({ ...DEFAULT_PLANET });
		expect(stage.state.world.planet).toEqual(DEFAULT_PLANET);
		expect(stage.state.world.planet.dayLengthHours).toBe(24);
		expect(stage.log).toContain('climate.refresh');
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
			'climate.refresh',
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
		// Asked for once, as for any new world, and not again for its planet.
		expect(
			stage.log.filter((entry) => entry.startsWith('climate.refresh')),
		).toEqual(['climate.refreshNow']);
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

describe('the Model settings button', () => {
	it('ends a stroke, clears the readout, then opens the screen', async () => {
		const stage = await createStartedStage();
		stage.strokeActive = true;
		stage.readoutCalls.length = 0;
		stage.settingsPanelOptions.onModelSettings();

		expect(stage.log).toEqual(['sculpt.endStroke', 'openModelSettings']);
		expect(stage.readoutCalls).toEqual(['clear']);
		expect(stage.strokeActive).toBe(false);
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
 * A started stage whose climate runs on the real service, on fake workers
 * and timers, with the statistics on stand-ins as elsewhere, on the
 * terrain. The storage has answered that nothing was saved, unless a saved
 * world is given, which it brings back instead.
 *
 * @param options - The layer panel to make in place of the stand-in, the
 * world the storage holds, and whether the climate can have a worker (true
 * when left out).
 */
const createWorkerStage = async (
	options: {
		readonly createLayerPanel?: PageParts['createLayerPanel'];
		readonly saved?: World;
		readonly worker?: boolean;
	} = {},
) => {
	const timers = createFakeTimers();
	const workers: FakeWorker[] = [];
	const logged: unknown[] = [];
	const stage = createStage(undefined, {
		createClimate: (climateOptions) =>
			createClimateService({
				...climateOptions,
				createWorker: () => {
					if (options.worker === false) {
						return null;
					}
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
	stage.answerLoad(
		options.saved === undefined
			? { kind: 'empty' }
			: { kind: 'world', world: options.saved },
	);
	await stage.started;
	stage.log.length = 0;
	/** Moves past the wait, and lets what follows run. */
	const wait = async (): Promise<void> => {
		timers.advance(CLIMATE_DEBOUNCE_MS);
		await settle();
	};
	/** Every request posted to any worker so far. */
	const posted = () =>
		workers.flatMap((worker) => worker.posted) as SimRequest<'climate'>[];
	/**
	 * Tells the newest request on the newest worker of a pass, of the
	 * world's cells, as the worker does when the pass finishes.
	 *
	 * @returns The pass told.
	 */
	const tellPass = (
		pass: number,
		passOptions: { last?: boolean; settled?: boolean } = {},
	): ClimateProgress => {
		const request = required(posted().at(-1), 'climate request');
		const climatePass = climatePassOf(
			pass,
			passOptions,
			stage.state.world.elevation.length,
		);
		(workers.at(-1) as FakeWorker).respond({
			id: request.id,
			kind: 'climate',
			climatePass,
		});
		return climatePass;
	};
	/**
	 * Answers the newest request on the newest worker: its last pass, then
	 * the summary, and lets what follows run.
	 *
	 * @returns The last pass.
	 */
	const answer = async (
		passes = 1,
		{ settled = true }: { settled?: boolean } = {},
	): Promise<ClimateProgress> => {
		const request = required(posted().at(-1), 'climate request');
		const last = tellPass(passes, { last: true, settled });
		(workers.at(-1) as FakeWorker).respond({
			id: request.id,
			kind: 'climate',
			ok: true,
			result: { dayLengthHours: 24, passes, settled, changeC: 0 },
		});
		await settle();
		return last;
	};
	return { stage, timers, workers, logged, wait, posted, tellPass, answer };
};

/** A page whose climate runs on its worker. */
type WorkerPage = Awaited<ReturnType<typeof createWorkerStage>>;

describe('the climate, on its worker', () => {
	it('is asked for the blank world the page stays on, once the storage has answered that nothing was saved, with the terrain on screen', async () => {
		const page = await createWorkerStage();
		expect(page.workers).toHaveLength(1);
		expect(page.posted()).toHaveLength(1);
		expect(page.posted()[0]).toMatchObject({
			kind: 'climate',
			world: page.stage.state.world,
		});
		const { store } = page.stage.climateOptions;
		expect(store.temperature.status).toBe('calculating');
		expect(store.winds.status).toBe('calculating');
		await page.wait();
		expect(page.posted()).toHaveLength(1);
	});

	it('is asked for the world the page brings back as it starts, once and at once, with the terrain on screen', async () => {
		const saved = generateWorld({ resolution: 64, seed: 9, landFraction: 0.4 });
		const page = await createWorkerStage({ saved });
		expect(page.stage.state.world).toBe(saved);
		expect(page.posted()).toHaveLength(1);
		const [request] = page.posted();
		expect(request?.world).toEqual(saved);
		expect(request?.start).toBeUndefined();
		await page.wait();
		await page.wait();
		expect(page.posted()).toHaveLength(1);
	});

	it('is asked for after an edit made with the terrain on screen, once the wait is over', async () => {
		const page = await createWorkerStage();
		makeStroke(page.stage);
		page.stage.viewPanelOptions.onSeaLevel(-500);
		page.timers.advance(CLIMATE_DEBOUNCE_MS - 1);
		await settle();
		expect(page.posted()).toHaveLength(1);
		await page.wait();
		expect(page.posted()).toHaveLength(2);
		expect(page.posted()[1]).toMatchObject({
			kind: 'climate',
			world: page.stage.state.world,
		});
	});

	it('reaches the globe through the real layer panel after its first pass and as each later pass refines it, the winds with the temperature, asking nothing more', async () => {
		const shown: (Float32Array | null)[] = [];
		const winds: (ArrayLike<number> | undefined)[] = [];
		const calculations: (string | null)[] = [];
		const page = await createWorkerStage({
			createLayerPanel: (options) =>
				createLayerPanel({
					...options,
					globe: {
						setLayer: (field) => shown.push(field),
						setWinds: (field) => winds.push(field?.east),
					},
					setTimer: () => 0,
					clearTimer: () => {},
					reportError: () => {},
					createControls: () => {
						return {
							showLegend: () => {},
							showWindKey: () => {},
							showCalculation: (content) => calculations.push(content.status),
						};
					},
				}),
		});
		await page.wait();
		expect(page.posted()).toHaveLength(1);
		expect(calculations.at(-1)).toBe(CALCULATING_CLIMATE_TEXT);

		page.stage.dockOptions.onLayer('temperature');
		page.stage.dockOptions.onWinds(true);
		await page.wait();
		expect(page.posted()).toHaveLength(1);
		const first = page.tellPass(1);
		expect(shown).toEqual([first.temperature.months[6]]);
		expect(winds.at(-1)).toBe(first.winds.east[6]);
		expect(calculations.at(-1)).toBe('Refining climate (pass 2)');

		const last = await page.answer(2);
		expect(shown.at(-1)).toBe(last.temperature.months[6]);
		expect(winds.at(-1)).toBe(last.winds.east[6]);
		expect(calculations.at(-1)).toBeNull();
		expect(page.posted()).toHaveLength(1);
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
			'a change of the day length',
			nothing,
			(stage: Stage) =>
				stage.state.setPlanet({
					...stage.state.world.planet,
					dayLengthHours: 30,
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

	it('starts again for a stroke made during the loop, its worker ended, the new loop carried on from the last settled climate', async () => {
		const page = await createWorkerStage();
		const settled = await page.answer(2);
		page.stage.viewPanelOptions.onSeaLevel(-500);
		await page.wait();
		const looping = page.workers.at(-1) as FakeWorker;
		page.tellPass(1);
		expect(page.posted()).toHaveLength(2);

		makeStroke(page.stage);
		await page.wait();
		expect(looping.terminations).toBe(1);
		expect(page.posted()).toHaveLength(3);
		const newest = page.posted().at(-1);
		expect(newest?.world.elevation[5]).toBe(1234);
		expect(newest?.start?.temperature.months).toEqual(
			settled.temperature.months,
		);
		const { store } = page.stage.climateOptions;
		expect(store.temperature.pass).toBe(1);
		const last = await page.answer(1);
		expect(store.temperature).toMatchObject({
			status: 'current',
			result: last.temperature,
		});
	});

	it('marks the store empty, then calculating at once, when the world is replaced', async () => {
		const page = await createWorkerStage();
		await page.wait();
		await page.answer(1);
		const { store } = page.stage.climateOptions;
		expect(store.temperature.status).toBe('current');
		expect(store.winds.status).toBe('current');
		const statuses: string[] = [];
		store.addListener((layer) => statuses.push(layer.status));

		// Told apart from the world it replaces.
		const next = createBlankWorld(64);
		next.elevation[0] = 4321;
		const before = page.posted().length;
		page.stage.state.replaceWorld(next);
		// With no wait: the new world never reads as not calculated once
		// the page has taken it in.
		expect(store.temperature).toMatchObject({
			status: 'calculating',
			result: null,
		});
		expect(store.winds).toEqual({ status: 'calculating', result: null });
		expect(statuses).toEqual(['empty', 'calculating']);
		expect(page.posted()).toHaveLength(before + 1);
		await page.wait();
		expect(page.posted()).toHaveLength(before + 1);
		const newest = page.posted().at(-1);
		expect(newest?.world).toEqual(next);
		expect(newest?.world.elevation[0]).toBe(4321);
		expect(newest?.start).toBeUndefined();
	});

	it('ends with one current climate, the last world’s, when the world is replaced twice in a row', async () => {
		const page = await createWorkerStage();
		await page.wait();
		const { store } = page.stage.climateOptions;
		const before = page.posted().length;

		page.stage.state.replaceWorld(createBlankWorld(64));
		const last = createBlankWorld(64);
		last.elevation[0] = 4321;
		page.stage.state.replaceWorld(last);
		expect(page.posted()).toHaveLength(before + 2);
		expect(page.posted().at(-1)?.world.elevation[0]).toBe(4321);

		const answered = await page.answer(2);
		expect(store.temperature).toMatchObject({
			status: 'current',
			result: answered.temperature,
		});
		await page.wait();
		expect(page.posted()).toHaveLength(before + 2);
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

	it('keeps the winds with the day length they were worked out for, and the next climate takes in a new one', async () => {
		const page = await createWorkerStage();
		await page.answer(1);
		const { store } = page.stage.climateOptions;
		page.stage.planetPanelOptions.onChange({
			...DEFAULT_PLANET,
			dayLengthHours: 30,
		});
		expect(store.temperature.status).toBe('outOfDate');
		expect(store.winds.status).toBe('outOfDate');
		await page.wait();
		expect(page.posted().at(-1)?.world.planet.dayLengthHours).toBe(30);
		await page.answer(1);
		expect(store.winds).toMatchObject({
			status: 'current',
			result: { dayLengthHours: 30 },
		});
		expect(store.temperature.status).toBe('current');
	});

	it('with no worker, leaves the temperature and the winds unavailable and the rest of the page working', async () => {
		const page = await createWorkerStage({ worker: false });
		const { store } = page.stage.climateOptions;
		expect(store.temperature.status).toBe('unavailable');
		expect(store.winds.status).toBe('unavailable');
		makeStroke(page.stage);
		await page.wait();
		expect(page.stage.log).toContain('statistics.refresh');
		expect(page.stage.errors).toEqual([]);
	});
});

describe('the climate, paused', () => {
	it('asks nothing for edits made while paused, and once for all of them, at once, when released', async () => {
		const page = await createWorkerStage();
		await page.answer(1);
		const { store } = page.stage.climateOptions;
		page.stage.pauseOptions.onPause(true);
		makeStroke(page.stage);
		page.stage.viewPanelOptions.onSeaLevel(-500);
		page.stage.planetPanelOptions.onChange({
			...DEFAULT_PLANET,
			dayLengthHours: 30,
		});
		await page.wait();
		await page.wait();
		expect(page.posted()).toHaveLength(1);
		expect(store.temperature.status).toBe('outOfDate');
		expect(store.winds.status).toBe('outOfDate');

		page.stage.pauseOptions.onPause(false);
		expect(page.posted()).toHaveLength(2);
		const request = page.posted()[1];
		expect(request?.world.elevation[5]).toBe(1234);
		expect(request?.world.seaLevel).toBe(page.stage.state.world.seaLevel);
		expect(request?.world.planet.dayLengthHours).toBe(30);
		await page.wait();
		await page.wait();
		expect(page.posted()).toHaveLength(2);
	});

	it('asks nothing when released with nothing changed', async () => {
		const page = await createWorkerStage();
		await page.answer(1);
		page.stage.pauseOptions.onPause(true);
		page.stage.pauseOptions.onPause(false);
		await page.wait();
		expect(page.posted()).toHaveLength(1);
		expect(page.stage.climateOptions.store.temperature.status).toBe('current');
	});

	it('cancels a request waiting to be made, and leaves a loop whose pass under way is its last to finish, keeping its answer', async () => {
		const page = await createWorkerStage();
		const { store } = page.stage.climateOptions;
		page.stage.pauseOptions.onPause(true);
		await page.answer(1);
		expect(store.temperature.status).toBe('current');

		page.stage.pauseOptions.onPause(false);
		makeStroke(page.stage);
		page.stage.pauseOptions.onPause(true);
		await page.wait();
		expect(page.posted()).toHaveLength(1);
		expect(page.workers[0]?.terminations).toBe(0);
	});

	it('mid-loop, lets the pass under way finish and show, then stops, and on release carries on from it on a fresh worker', async () => {
		const page = await createWorkerStage();
		const { store } = page.stage.climateOptions;
		page.tellPass(1);
		page.stage.pauseOptions.onPause(true);
		const looping = page.workers.at(-1) as FakeWorker;
		expect(store.temperature.status).toBe('calculating');
		expect(looping.terminations).toBe(0);

		const reached = page.tellPass(2);
		expect(looping.terminations).toBe(1);
		expect(store.temperature).toMatchObject({
			status: 'outOfDate',
			result: reached.temperature,
		});
		expect(store.winds.status).toBe('outOfDate');
		expect(store.winds.result?.winds).toBe(reached.winds);
		await page.wait();
		expect(page.posted()).toHaveLength(1);
		expect(page.logged).toEqual([]);

		page.stage.pauseOptions.onPause(false);
		expect(page.posted()).toHaveLength(2);
		expect(page.workers).toHaveLength(2);
		const resumed = page.posted().at(-1);
		expect(resumed?.start?.temperature.months).toEqual(
			reached.temperature.months,
		);
		expect(resumed?.start?.winds.east).toEqual(reached.winds.east);
		expect(store.temperature.status).toBe('calculating');
		await page.answer(1);
		expect(store.temperature.status).toBe('current');
	});

	it('leaves a new world unsolved, its store empty, until released', async () => {
		const page = await createWorkerStage();
		const { store } = page.stage.climateOptions;
		page.stage.pauseOptions.onPause(true);
		page.stage.state.replaceWorld(createBlankWorld(64));
		await page.wait();
		expect(store.temperature).toEqual({
			status: 'empty',
			result: null,
			progress: null,
			pass: null,
		});
		expect(store.winds).toEqual({ status: 'empty', result: null });
		expect(page.posted()).toHaveLength(1);

		page.stage.pauseOptions.onPause(false);
		expect(page.posted()).toHaveLength(2);
		expect(store.temperature.status).toBe('calculating');
	});

	it('ends the old world’s loop at once for a new world made while paused', async () => {
		const page: WorkerPage = await createWorkerStage();
		const looping = page.workers.at(-1) as FakeWorker;
		page.stage.pauseOptions.onPause(true);
		page.stage.state.replaceWorld(createBlankWorld(64));
		expect(looping.terminations).toBe(1);
		expect(page.posted()).toHaveLength(1);
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
		expect(stage.readoutOptions.shownLayer()).toBeNull();
		const shown: ShownLayer = {
			layer: TEMPERATURE_LAYER,
			summary: 'month',
			field: new Float32Array(next.elevation.length),
			source: 'simulated',
			current: true,
		};
		stage.shownTemperature = shown;
		expect(stage.readoutOptions.shownLayer()).toBe(shown);
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
		stage.layerOptions.onView(
			{
				layer: 'temperature',
				summaries: { temperature: 'month', pressure: 'month' },
				source: 'simulated',
				month: 3,
				sunlight: false,
				winds: false,
				grid: false,
			},
			false,
		);
		expect(stage.readoutCalls).toEqual(['invalidate']);
		arriveClimate(stage.layerOptions.store, temperatureOf(1), true);
		expect(stage.readoutCalls).toEqual([
			'invalidate',
			'invalidate',
			'invalidate',
		]);
	});

	it('does not look again for a change of the planet alone, which changes nothing on screen', async () => {
		const stage = await createStartedStage();
		stage.state.setPlanet({ ...stage.state.world.planet, axialTiltDeg: 0 });
		expect(stage.log).toContain('climate.refresh');
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
		const stage = await createStartedStage(undefined, {
			createLayerPanel: (options) =>
				createLayerPanel({
					...options,
					globe: { setLayer: () => {}, setWinds: () => {} },
					setTimer: () => 0,
					clearTimer: () => {},
					reportError: () => {},
					createControls: () => {
						return {
							showLegend: () => {},
							showWindKey: () => {},
							showCalculation: () => {},
						};
					},
				}),
		});
		stage.dockOptions.onLayer('temperature');
		expect(stage.readoutOptions.shownLayer()).toBeNull();
		const result = temperatureOf(1, stage.state.world.elevation.length);
		arriveClimate(stage.layerOptions.store, result, true);
		expect(stage.readoutOptions.shownLayer()).toEqual({
			layer: TEMPERATURE_LAYER,
			summary: 'month',
			field: result.months[DEFAULT_MONTH],
			source: 'simulated',
			current: true,
		});
		stage.layerOptions.store.markOutOfDate();
		expect(stage.readoutOptions.shownLayer()?.current).toBe(false);
	});
});

describe('the date line', () => {
	it('follows the view settings the layer panel tells of', async () => {
		const stage = await createStartedStage();
		stage.layerOptions.onView(
			{
				layer: 'temperature',
				summaries: { temperature: 'month', pressure: 'month' },
				source: 'simulated',
				month: 6,
				sunlight: false,
				winds: false,
				grid: false,
			},
			false,
		);
		stage.layerOptions.onView(
			{
				layer: 'temperature',
				summaries: { temperature: 'month', pressure: 'month' },
				source: 'simulated',
				month: 7,
				sunlight: false,
				winds: false,
				grid: false,
			},
			false,
		);
		stage.layerOptions.onView(
			{
				layer: 'temperature',
				summaries: { temperature: 'annualMean', pressure: 'month' },
				source: 'simulated',
				month: 7,
				sunlight: false,
				winds: false,
				grid: false,
			},
			false,
		);
		stage.layerOptions.onView(
			{
				layer: 'terrain',
				summaries: { temperature: 'annualMean', pressure: 'month' },
				source: 'simulated',
				month: 7,
				sunlight: false,
				winds: false,
				grid: false,
			},
			false,
		);
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
		const timers = createFakeTimers();
		const page = await createWorkerStage({
			createLayerPanel: (options) =>
				createLayerPanel({
					...options,
					globe: { setLayer: () => {}, setWinds: () => {} },
					setTimer: timers.setTimer,
					clearTimer: timers.clearTimer,
					reportError: () => {},
					createControls: () => ({
						showLegend: () => {},
						showWindKey: () => {},
						showCalculation: () => {},
					}),
				}),
		});
		page.stage.dockOptions.onLayer('temperature');
		/** The views the timeline was shown, in order. */
		const views = () => page.stage.timelineViews.map(({ view }) => view);
		return { page, timeline: page.stage.timelineOptions, views, timers };
	};

	it('is kept through an edit of the terrain', async () => {
		const { page, timeline, views } = await createMonthStage();
		timeline.onMonth(2);
		expect(page.stage.log).toContain('worldPanel.setDate Year 0 · March');
		page.stage.log.length = 0;
		makeStroke(page.stage);
		await page.wait();
		expect(views().at(-1)?.month).toBe(2);
		expect(
			page.stage.log.filter((line) => line.startsWith('worldPanel.setDate')),
		).toEqual([]);
	});

	it('goes back to July for a new world, which the date line says', async () => {
		const { page, timeline, views } = await createMonthStage();
		page.stage.topBarOptions.onSummary('temperature', 'warmest');
		page.stage.topBarOptions.onSummary('temperature', 'month');
		timeline.onMonth(2);
		page.stage.log.length = 0;
		page.stage.state.replaceWorld(createBlankWorld(64));
		expect(views().at(-1)).toEqual({
			layer: 'temperature',
			summaries: { temperature: 'month', pressure: 'month' },
			source: 'simulated',
			month: DEFAULT_MONTH,
			sunlight: false,
			winds: false,
			grid: false,
		});
		expect(page.stage.log).toContain('worldPanel.setDate Year 0 · July');
	});

	it('stops the year playing for a new world', async () => {
		const { page, timeline, timers } = await createMonthStage();
		timeline.onPlay();
		timers.advance(PLAYBACK_STEP_MS);
		expect(page.stage.log).toContain('worldPanel.setDate Year 0 · August');
		expect(page.stage.timelineViews.at(-1)?.playing).toBe(true);
		page.stage.state.replaceWorld(createBlankWorld(64));
		expect(timers.pending()).toBe(0);
		expect(page.stage.timelineViews.at(-1)?.playing).toBe(false);
	});
});

/** A started page with the real layer panel, on the terrain. */
const createSunStage = async (world?: World) => {
	const timers = createFakeTimers();
	const stage = await createStartedStage(world, {
		createLayerPanel: (options) =>
			createLayerPanel({
				...options,
				globe: { setLayer: () => {}, setWinds: () => {} },
				setTimer: timers.setTimer,
				clearTimer: timers.clearTimer,
				reportError: () => {},
				createControls: () => ({
					showLegend: () => {},
					showWindKey: () => {},
					showCalculation: () => {},
				}),
			}),
	});
	return {
		stage,
		timeline: stage.timelineOptions,
		/** The views the timeline was shown, in order. */
		views: () => stage.timelineViews.map(({ view }) => view),
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
			summaries: { temperature: 'month', pressure: 'month' },
			source: 'simulated',
			month: 3,
			sunlight: false,
			winds: false,
			grid: false,
		};
		stage.layerOptions.onView(view, false);
		stage.layerOptions.onView(
			{
				...view,
				summaries: { temperature: 'annualMean', pressure: 'month' },
			},
			false,
		);
		stage.layerOptions.onView(
			{ ...view, layer: 'terrain', sunlight: true },
			false,
		);
		stage.layerOptions.onView({ ...view, month: 4 }, false);
		expect(stage.suns).toEqual([sunOf(3, planet), sunOf(4, planet)]);
	});

	it('follows the slider and the year playing through the real layer panel', async () => {
		const { stage, timeline, timers } = await createSunStage();
		const { planet } = stage.state.world;
		stage.dockOptions.onSunlight(true);
		timeline.onMonth(2);
		expect(stage.suns).toEqual([sunOf(2, planet)]);
		timeline.onPlay();
		timers.advance(PLAYBACK_STEP_MS);
		expect(stage.suns).toEqual([sunOf(2, planet), sunOf(3, planet)]);
		expect(stage.log).toContain('worldPanel.setDate Year 0 · April');
	});

	it('follows a change of the planet settings, once, in the month on screen', async () => {
		const { stage, timeline } = await createSunStage();
		stage.dockOptions.onSunlight(true);
		timeline.onMonth(9);
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
		const { stage, timeline } = await createSunStage();
		stage.dockOptions.onLayer('temperature');
		timeline.onMonth(1);
		stage.topBarOptions.onSummary('temperature', 'coldest');
		stage.dockOptions.onLayer('terrain');
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
		const { stage, timeline } = await createSunStage();
		stage.dockOptions.onSunlight(true);
		timeline.onMonth(0);
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

	it.each([
		[
			'Sunlight',
			(stage: Stage, on: boolean) => stage.dockOptions.onSunlight(on),
		],
		['Winds', (stage: Stage, on: boolean) => stage.dockOptions.onWinds(on)],
	])(
		'are not opened, closed or written to storage when %s is ticked or cleared',
		async (_name, tick) => {
			const { storage, states } = createSections();
			const before = states();
			const stage = await createStartedStage();
			tick(stage, true);
			expect(states()).toEqual(before);
			tick(stage, false);
			expect(states()).toEqual(before);
			expect(storage.writes).toEqual([]);
		},
	);

	it('are not opened, closed or written to storage by a restored world, a new world and an import', async () => {
		const { storage, states } = createSections({
			[panelMemoryKey('world')]: 'closed',
			[panelMemoryKey('planet')]: 'open',
			[panelMemoryKey('statistics')]: 'open',
		});
		const before = states();
		const stage = createStage();
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
		expect(storage.writes).toEqual([]);
	});
});

describe('the Winds tile', () => {
	it('tells the layer panel, and nothing of the globe or the sunlight', async () => {
		const stage = await createStartedStage();
		stage.dockOptions.onWinds(true);
		stage.dockOptions.onWinds(false);
		expect(stage.log).toEqual([
			'layerPanel.setWinds true',
			'layerPanel.setWinds false',
		]);
	});

	it('asks nothing of the winds or the temperature for being turned on and off, or for Pressure being chosen, through the real layer panel', async () => {
		const { stage } = await createSunStage();
		const before = stage.log.length;
		stage.dockOptions.onWinds(true);
		stage.dockOptions.onWinds(false);
		stage.dockOptions.onLayer('pressure');
		stage.dockOptions.onLayer('terrain');
		expect(
			stage.log
				.slice(before)
				.filter(
					(line) =>
						line.startsWith('winds.') || line.startsWith('temperature.'),
				),
		).toEqual([]);
	});

	it('shows the timeline in Terrain view while it is on, through the real layer panel', async () => {
		const { stage, views } = await createSunStage();
		const before = stage.log.length;
		stage.dockOptions.onWinds(true);
		expect(views().at(-1)).toEqual({ ...DEFAULT_PAGE_VIEW, winds: true });
		expect(stage.log.slice(before)).toContain(
			'worldPanel.setDate Year 0 · July',
		);
		stage.dockOptions.onWinds(false);
		expect(views().at(-1)).toEqual(DEFAULT_PAGE_VIEW);
	});
});

/**
 * A started page with the real layer panel, on the terrain.
 *
 * @param preferenceEntries - What the preferences' storage holds at first.
 * @param reducedMotion - Whether the system asks for reduced motion.
 */
const createWindUnitStage = async (
	preferenceEntries?: Readonly<Record<string, string>>,
	reducedMotion?: boolean,
) => {
	const stage = await createStartedStage(undefined, {
		preferenceEntries,
		reducedMotion,
		createLayerPanel: (options) =>
			createLayerPanel({
				...options,
				globe: { setLayer: () => {}, setWinds: () => {} },
				setTimer: () => 0,
				clearTimer: () => {},
				reportError: () => {},
				createControls: () => ({
					showLegend: () => {},
					showWindKey: () => {},
					showCalculation: () => {},
				}),
			}),
	});
	/** Has winds of the world's grid arrive in the store, current. */
	const arriveWinds = (value: number): void => {
		const cells = stage.state.world.elevation.length;
		answerWinds(
			stage.layerOptions.store,
			{
				winds: windResultOf(value, cells),
				temperature: temperatureOf(1, cells),
				dayLengthHours: 24,
			},
			true,
		);
	};
	return {
		stage,
		arriveWinds,
	};
};

describe('the units', () => {
	/** A wind from the north-east of about 7 m/s, at a place on the equator. */
	const NORTH_EASTERLY = {
		latitudeDeg: 0,
		longitudeDeg: 0,
		heightM: 10,
		value: null,
		wind: { east: -5, north: -5, current: true },
	} as const;

	/** The wind the readout writes, in the unit it is given at the time. */
	const readoutWind = (stage: Stage): string | null =>
		describeReadout(NORTH_EASTERLY, stage.readoutOptions.units()).wind;

	it('starts on metric with nothing stored, in the settings, the layer panel and the readout', async () => {
		const { stage } = await createWindUnitStage();
		expect(stage.settingsPanelOptions.units).toEqual(DEFAULT_UNIT_CHOICE);
		expect(stage.layerOptions.units).toEqual(SYSTEM_UNITS.metric);
		expect(stage.readoutOptions.units().windSpeed).toBe('m/s');
		expect(readoutWind(stage)).toBe('7 m/s NE');
		expect(stage.settingsUnits).toEqual([]);
	});

	it('starts on the stored system and overrides, in the settings and the readout', async () => {
		const { stage } = await createWindUnitStage({
			[UNIT_SYSTEM_KEY]: 'imperial',
			[unitOverrideKey('temperature')]: 'K',
		});
		expect(stage.settingsPanelOptions.units).toEqual({
			system: 'imperial',
			overrides: { temperature: 'K' },
		});
		expect(readoutWind(stage)).toBe('16 mph NE');
		expect(stage.preferenceStorage.writes).toEqual([]);
	});

	it('starts on metric when the storage holds something else', async () => {
		const { stage } = await createWindUnitStage({
			[UNIT_SYSTEM_KEY]: 'imperial-ish',
			[unitOverrideKey('windSpeed')]: 'kn',
		});
		expect(stage.settingsPanelOptions.units).toEqual(DEFAULT_UNIT_CHOICE);
		expect(stage.readoutOptions.units().windSpeed).toBe('m/s');
	});

	it('starts on metric where the storage throws', async () => {
		const stage = await createStartedStage(undefined, {
			preferencesRefused: true,
		});
		expect(stage.settingsPanelOptions.units).toEqual(DEFAULT_UNIT_CHOICE);
		expect(stage.readoutOptions.units().windSpeed).toBe('m/s');
	});

	it('carries a stored m/s over as the wind speed’s override, which choosing Imperial clears', async () => {
		const { stage } = await createWindUnitStage({
			[OLD_WIND_SPEED_UNIT_KEY]: 'm/s',
		});
		expect(stage.settingsPanelOptions.units).toEqual({
			system: 'metric',
			overrides: { windSpeed: 'm/s' },
		});
		expect(stage.preferenceStorage.entries).toEqual(
			new Map([[unitOverrideKey('windSpeed'), 'm/s']]),
		);
		stage.settingsPanelOptions.onUnitSystem('imperial');
		expect(readoutWind(stage)).toBe('16 mph NE');
		expect(stage.readoutCalls).toEqual(['invalidate']);
		expect(stage.preferenceStorage.entries).toEqual(
			new Map([[UNIT_SYSTEM_KEY, 'imperial']]),
		);
	});

	it('carries a stored mph over as the wind speed’s override', async () => {
		const { stage } = await createWindUnitStage({
			[OLD_WIND_SPEED_UNIT_KEY]: 'mph',
		});
		expect(readoutWind(stage)).toBe('16 mph NE');
		expect(stage.preferenceStorage.removals).toEqual([OLD_WIND_SPEED_UNIT_KEY]);
	});

	it('writes the wind in mph at once on switching to Imperial, and stores the system', async () => {
		const { stage } = await createWindUnitStage();
		stage.settingsPanelOptions.onUnitSystem('imperial');
		expect(stage.readoutCalls).toEqual(['invalidate']);
		expect(readoutWind(stage)).toBe('16 mph NE');
		expect(stage.preferenceStorage.writes).toEqual([
			[UNIT_SYSTEM_KEY, 'imperial'],
		]);
		expect(stage.settingsUnits).toEqual([
			{ system: 'imperial', overrides: {} },
		]);
	});

	it.each(['metric', 'imperial'] as const)(
		'writes the wind in knots once they are chosen, under %s',
		async (system) => {
			const { stage } = await createWindUnitStage({
				[UNIT_SYSTEM_KEY]: system,
			});
			stage.settingsPanelOptions.onUnitOverride('windSpeed', 'knots');
			expect(stage.readoutCalls).toEqual(['invalidate']);
			expect(readoutWind(stage)).toBe('14 knots NE');
			expect(stage.preferenceStorage.writes).toEqual([
				[unitOverrideKey('windSpeed'), 'knots'],
			]);
			stage.settingsPanelOptions.onUnitSystem(
				system === 'metric' ? 'imperial' : 'metric',
			);
			expect(readoutWind(stage)).toBe(
				system === 'metric' ? '16 mph NE' : '7 m/s NE',
			);
			expect(
				stage.preferenceStorage.entries.has(unitOverrideKey('windSpeed')),
			).toBe(false);
		},
	);

	it('clears every override at once on a click of the system already chosen, telling each part once', async () => {
		const stage = await createStartedStage(undefined, {
			preferenceEntries: {
				[UNIT_SYSTEM_KEY]: 'imperial',
				[unitOverrideKey('pressure')]: 'hPa',
				[unitOverrideKey('height')]: 'm',
			},
		});
		stage.settingsPanelOptions.onUnitSystem('imperial');
		expect(stage.readoutOptions.units()).toEqual(SYSTEM_UNITS.imperial);
		expect(stage.settingsUnits).toEqual([
			{ system: 'imperial', overrides: {} },
		]);
		expect(stage.log).toEqual([
			`layerPanel.setUnits ${JSON.stringify(SYSTEM_UNITS.imperial)}`,
			'statistics.setHeightUnit ft',
			'viewPanel.setHeightUnit ft',
			'toolPanel.setUnits ft mi',
		]);
		expect(stage.readoutCalls).toEqual(['invalidate']);
		expect(stage.preferenceStorage.entries).toEqual(
			new Map([[UNIT_SYSTEM_KEY, 'imperial']]),
		);
		stage.settingsPanelOptions.onUnitOverride('distance', 'km');
		expect(stage.readoutOptions.units().distance).toBe('km');
		expect(
			stage.preferenceStorage.entries.get(unitOverrideKey('distance')),
		).toBe('km');
	});

	it('goes back to the system’s unit when As the system is chosen', async () => {
		const { stage } = await createWindUnitStage({
			[UNIT_SYSTEM_KEY]: 'imperial',
			[unitOverrideKey('windSpeed')]: 'km/h',
		});
		expect(readoutWind(stage)).toBe('25 km/h NE');
		stage.settingsPanelOptions.onUnitOverride('windSpeed', null);
		expect(readoutWind(stage)).toBe('16 mph NE');
		expect(stage.preferenceStorage.removals).toEqual([
			unitOverrideKey('windSpeed'),
			OLD_WIND_SPEED_UNIT_KEY,
		]);
		expect(stage.settingsUnits).toEqual([
			{ system: 'imperial', overrides: {} },
		]);
	});

	it('stores the other quantities’ overrides, and tells the layer panel, the statistics, the view panel and the tool panel of each', async () => {
		const stage = await createStartedStage();
		expect(stage.layerOptions.units).toEqual(SYSTEM_UNITS.metric);
		expect(stage.statisticsOptions).toMatchObject({ heightUnit: 'm' });
		stage.settingsPanelOptions.onUnitOverride('temperature', '°F');
		stage.settingsPanelOptions.onUnitOverride('height', 'ft');
		expect(stage.preferenceStorage.writes).toEqual([
			[unitOverrideKey('temperature'), '°F'],
			[unitOverrideKey('height'), 'ft'],
		]);
		expect(stage.readoutOptions.units()).toEqual({
			...SYSTEM_UNITS.metric,
			temperature: '°F',
			height: 'ft',
		});
		const fahrenheit = { ...SYSTEM_UNITS.metric, temperature: '°F' };
		expect(stage.log).toEqual([
			`layerPanel.setUnits ${JSON.stringify(fahrenheit)}`,
			'statistics.setHeightUnit m',
			'viewPanel.setHeightUnit m',
			'toolPanel.setUnits m km',
			`layerPanel.setUnits ${JSON.stringify({ ...fahrenheit, height: 'ft' })}`,
			'statistics.setHeightUnit ft',
			'viewPanel.setHeightUnit ft',
			'toolPanel.setUnits ft km',
		]);
		expect(stage.readoutCalls).toEqual(['invalidate', 'invalidate']);
	});

	it('starts the layer panel, the statistics, the view and tool panels and the New world dialog in the stored units', async () => {
		const stage = await createStartedStage(undefined, {
			preferenceEntries: {
				[UNIT_SYSTEM_KEY]: 'imperial',
				[unitOverrideKey('pressure')]: 'hPa',
			},
		});
		expect(stage.layerOptions.units).toEqual({
			...SYSTEM_UNITS.imperial,
			pressure: 'hPa',
		});
		expect(stage.statisticsOptions).toMatchObject({ heightUnit: 'ft' });
		expect(stage.readoutOptions.units()).toEqual(stage.layerOptions.units);
		expect(stage.viewPanelOptions.heightUnit).toBe('ft');
		expect(stage.toolPanelOptions.units).toMatchObject({
			height: 'ft',
			distance: 'mi',
		});
		stage.worldPanelOptions.onNewWorld();
		expect(stage.dialogs.at(-1)?.distanceUnit).toBe('mi');
	});

	it('opens the New world dialog in the unit of distances chosen at the time', async () => {
		const stage = await createStartedStage();
		stage.worldPanelOptions.onNewWorld();
		expect(stage.dialogs.at(-1)?.distanceUnit).toBe('km');
		stage.settingsPanelOptions.onUnitOverride('distance', 'mi');
		stage.worldPanelOptions.onNewWorld();
		expect(stage.dialogs.at(-1)?.distanceUnit).toBe('mi');
	});

	it('tells the settings, the layer panel, the statistics, the view and tool panels and the readout of a change, and nothing of none', async () => {
		const stage = await createStartedStage();
		stage.settingsPanelOptions.onUnitSystem('metric');
		stage.settingsPanelOptions.onUnitOverride('pressure', null);
		expect(stage.readoutCalls).toEqual([]);
		expect(stage.settingsUnits).toEqual([]);
		expect(stage.log).toEqual([]);
		stage.settingsPanelOptions.onUnitOverride('pressure', 'inHg');
		expect(stage.log).toEqual([
			`layerPanel.setUnits ${JSON.stringify({ ...SYSTEM_UNITS.metric, pressure: 'inHg' })}`,
			'statistics.setHeightUnit m',
			'viewPanel.setHeightUnit m',
			'toolPanel.setUnits m km',
		]);
		expect(stage.readoutCalls).toEqual(['invalidate']);
		expect(stage.settingsUnits).toEqual([
			{ system: 'metric', overrides: { pressure: 'inHg' } },
		]);
	});

	it('writes nothing to the world, and marks nothing for saving', async () => {
		const stage = await createStartedStage();
		const before = serializeWorld(stage.state.world);
		stage.settingsPanelOptions.onUnitSystem('imperial');
		stage.settingsPanelOptions.onUnitOverride('windSpeed', 'km/h');
		expect(serializeWorld(stage.state.world)).toEqual(before);
		expect(stage.log).not.toContain('autosave.markChanged');
		expect(stage.saved).toEqual([]);
		expect(JSON.stringify(stage.state.world)).not.toContain('km/h');
	});

	it('is kept through a new world', async () => {
		const { stage } = await createWindUnitStage();
		stage.settingsPanelOptions.onUnitSystem('imperial');
		stage.state.replaceWorld(createBlankWorld(64));
		expect(stage.readoutOptions.units().windSpeed).toBe('mph');
		expect(stage.preferenceStorage.writes).toHaveLength(1);
	});

	it('writes the legend of the real layer panel, the statistics and the readout in new units at once, with no new calculation', async () => {
		const legends: (LegendContent | null)[] = [];
		const stage = await createStartedStage(undefined, {
			createLayerPanel: (options) =>
				createLayerPanel({
					...options,
					globe: { setLayer: () => {}, setWinds: () => {} },
					setTimer: () => 0,
					clearTimer: () => {},
					reportError: () => {},
					createControls: () => ({
						showLegend: (content) => legends.push(content),
						showWindKey: () => {},
						showCalculation: () => {},
					}),
				}),
		});
		stage.dockOptions.onLayer('temperature');
		const cells = stage.state.world.elevation.length;
		arriveClimate(stage.layerOptions.store, temperatureOf(1, cells), true);
		expect(legends.at(-1)?.scale?.caption).toBe('Air temperature in July, °C');
		stage.log.length = 0;
		stage.settingsPanelOptions.onUnitSystem('imperial');
		expect(legends.at(-1)?.scale?.caption).toBe('Air temperature in July, °F');
		expect(legends.at(-1)?.scale?.ticks.map((tick) => tick.label)).toEqual([
			'30',
			'31',
			'32',
			'33',
			'34',
		]);
		expect(stage.log).toEqual([
			'statistics.setHeightUnit ft',
			'viewPanel.setHeightUnit ft',
			'toolPanel.setUnits ft mi',
		]);
		expect(stage.readoutCalls.at(-1)).toBe('invalidate');
		expect(
			describeReadout(
				{
					latitudeDeg: 0,
					longitudeDeg: 0,
					heightM: -3400,
					value: null,
					wind: null,
				},
				stage.readoutOptions.units(),
			).elevation,
		).toBe('11,155 ft deep');
	});
});

describe('how the winds are drawn', () => {
	it('starts on streaks with nothing stored, in the globe and the settings, and tells the layer panel nothing of it', async () => {
		const { stage } = await createWindUnitStage();
		expect(stage.globeWindStyles).toEqual(['streaks']);
		expect(stage.settingsPanelOptions.windStyle).toBe('streaks');
		expect('windStyle' in stage.layerOptions).toBe(false);
	});

	it('starts on arrows with nothing stored where the system asks for reduced motion', async () => {
		const { stage } = await createWindUnitStage(undefined, true);
		expect(stage.globeWindStyles).toEqual(['arrows']);
		expect(stage.settingsPanelOptions.windStyle).toBe('arrows');
		expect(stage.preferenceStorage.writes).toEqual([]);
	});

	it.each([
		['arrows', false],
		['streaks', true],
	] as const)(
		'starts on the stored way, %s, with reduced motion %s, in the globe and the settings, with Winds still off',
		async (style, reducedMotion) => {
			const { stage } = await createWindUnitStage(
				{ [WIND_STYLE_KEY]: style },
				reducedMotion,
			);
			expect(stage.globeWindStyles).toEqual([style]);
			expect(stage.settingsPanelOptions.windStyle).toBe(style);
			expect(stage.preferenceStorage.writes).toEqual([]);
			expect(stage.dockOptions.view.winds).toBe(false);
			expect(stage.timelineOptions.view.winds).toBe(false);
		},
	);

	it('starts on streaks when the storage holds something else', async () => {
		const { stage } = await createWindUnitStage({
			[WIND_STYLE_KEY]: 'lines',
		});
		expect(stage.globeWindStyles).toEqual(['streaks']);
		expect(stage.settingsPanelOptions.windStyle).toBe('streaks');
	});

	it.each([
		[undefined, false, 'streaks'],
		[undefined, true, 'arrows'],
		['arrows', false, 'arrows'],
		['streaks', true, 'streaks'],
	] as const)(
		'tells the globe before it is given a world: stored %s, reduced motion %s, %s',
		(stored, reducedMotion, style) => {
			const stage = createStage(undefined, {
				preferenceEntries:
					stored === undefined ? {} : { [WIND_STYLE_KEY]: stored },
				reducedMotion,
			});
			expect(stage.globeWindStylesBeforeWorld).toEqual([style]);
			expect(stage.log[0]).toMatch(/^globe\.setWorld /);
		},
	);

	it('stores a way chosen, and gives it to the globe at once', async () => {
		const { stage } = await createWindUnitStage();
		stage.settingsPanelOptions.onWindStyle('arrows');
		expect(stage.preferenceStorage.writes).toEqual([
			[WIND_STYLE_KEY, 'arrows'],
		]);
		expect(stage.globeWindStyles).toEqual(['streaks', 'arrows']);
		stage.settingsPanelOptions.onWindStyle('streaks');
		expect(stage.preferenceStorage.writes).toEqual([
			[WIND_STYLE_KEY, 'arrows'],
			[WIND_STYLE_KEY, 'streaks'],
		]);
		expect(stage.globeWindStyles).toEqual(['streaks', 'arrows', 'streaks']);
	});

	it('tells nothing else of the way: not the layer panel, nor the readout', async () => {
		const stage = await createStartedStage();
		stage.settingsPanelOptions.onWindStyle('arrows');
		expect(stage.log).toEqual([]);
		expect(stage.readoutCalls).toEqual([]);
	});

	it('writes nothing to the world, marks nothing for saving, and is kept through a new world', async () => {
		const { stage } = await createWindUnitStage();
		const before = serializeWorld(stage.state.world);
		stage.settingsPanelOptions.onWindStyle('arrows');
		expect(serializeWorld(stage.state.world)).toEqual(before);
		expect(stage.log).not.toContain('autosave.markChanged');
		stage.state.replaceWorld(createBlankWorld(64));
		expect(stage.globeWindStyles).toEqual(['streaks', 'arrows']);
		expect(stage.preferenceStorage.writes).toHaveLength(1);
	});
});

/** What the preferences' storage holds for a view left on Temperature. */
const STORED_ENTRIES: Readonly<Record<string, string>> = {
	[LAYER_KEY]: 'temperature',
	[summaryKey('temperature')]: 'annualMean',
	[summaryKey('pressure')]: 'month',
	[SUNLIGHT_KEY]: ON_ENTRY,
	[WINDS_KEY]: ON_ENTRY,
	[GRID_KEY]: ON_ENTRY,
};

/** The view settings {@link STORED_ENTRIES} hold. */
const STORED: StoredView = {
	layer: 'temperature',
	summaries: { temperature: 'annualMean', pressure: 'month' },
	sunlight: true,
	winds: true,
	grid: true,
};

/** The names of the entries the view settings are kept in. */
const VIEW_KEYS = [
	LAYER_KEY,
	summaryKey('temperature'),
	summaryKey('pressure'),
	SUNLIGHT_KEY,
	WINDS_KEY,
	GRID_KEY,
];

/**
 * A page, not yet started, with the real layer panel, whose globe's fields
 * are recorded.
 */
const createStoredViewStage = (own: StageParts = {}) => {
	const shown: (Float32Array | null)[] = [];
	const stage = createStage(undefined, {
		...own,
		createLayerPanel: (options) =>
			createLayerPanel({
				...options,
				globe: { setLayer: (field) => shown.push(field), setWinds: () => {} },
				setTimer: () => 0,
				clearTimer: () => {},
				reportError: () => {},
				createControls: () => ({
					showLegend: () => {},
					showWindKey: () => {},
					showCalculation: () => {},
				}),
			}),
	});
	return { stage, shown };
};

describe('the view the browser remembers', () => {
	it('starts every part on the stored view, with July and Simulated, before it shows anything', () => {
		const { stage } = createStoredViewStage({
			preferenceEntries: STORED_ENTRIES,
		});
		const view: PageView = {
			...STORED,
			month: DEFAULT_MONTH,
			source: 'simulated',
		};
		expect(stage.dockOptions.view).toEqual(view);
		expect(stage.topBarOptions.view).toEqual(view);
		expect(stage.timelineOptions.view).toEqual(view);
		expect(stage.layerOptions.start).toEqual(STORED);
		// The globe is lit and gridded before any part that shows the view
		// is made.
		expect(stage.log.slice(0, 5)).toEqual([
			`globe.setWorld ${describeWorld(stage.state.world)}`,
			'globe.setSun',
			`globe.setSunlight ${TEMPERATURE_LAYER.sunlightStyle}`,
			'globe.setGridVisible true',
			`createViewInput ${MAIN_BUTTON}`,
		]);
		expect(stage.preferenceStorage.writes).toEqual([]);
	});

	it('has the dock and the top bar show the stored view as they are made', () => {
		const fake = createFakeDocument();
		vi.stubGlobal('document', fake.document);
		try {
			const { stage } = createStoredViewStage({
				preferenceEntries: STORED_ENTRIES,
			});
			const dock = createLayerDock(stage.dockOptions)
				.element as unknown as FakeElement;
			const tiles = byClass(dock, 'layer-tile');
			expect(tiles.map((tile) => tile.getAttribute('aria-checked'))).toEqual([
				'false',
				'true',
				'false',
				null,
				null,
				null,
			]);
			expect(tiles.map((tile) => tile.getAttribute('aria-pressed'))).toEqual([
				null,
				null,
				null,
				'true',
				'true',
				'true',
			]);
			const bar = createTopBar(stage.topBarOptions)
				.element as unknown as FakeElement;
			const show = byClass(bar, 'field__select').find(
				(each) => each.id === TEMPERATURE_LAYER.summaryControlId,
			);
			expect(show?.value).toBe('annualMean');
			expect(bar.hidden).toBe(false);
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it('shows the stored layer on the globe as the first result arrives, with nothing chosen', async () => {
		const { stage, shown } = createStoredViewStage({
			preferenceEntries: STORED_ENTRIES,
		});
		stage.answerLoad({ kind: 'empty' });
		await stage.started;
		expect(shown).toEqual([]);
		arriveClimate(
			stage.layerOptions.store,
			temperatureOf(1, stage.state.world.elevation.length),
			true,
		);
		expect(shown).toHaveLength(1);
	});

	it('starts on the default view, telling the globe the grid is hidden, with nothing stored', () => {
		const { stage } = createStoredViewStage();
		expect(stage.dockOptions.view).toEqual(DEFAULT_PAGE_VIEW);
		expect(stage.layerOptions.start).toEqual({
			layer: 'terrain',
			summaries: { temperature: 'month', pressure: 'month' },
			sunlight: false,
			winds: false,
			grid: false,
		});
		expect(stage.log).toContain('globe.setGridVisible false');
		expect(stage.log.some((line) => line.startsWith('globe.setSunlight'))).toBe(
			false,
		);
	});

	it('starts on the defaults, with no error, from storage that throws, and carries on past it', async () => {
		const { stage } = createStoredViewStage({ preferencesRefused: true });
		stage.answerLoad({ kind: 'empty' });
		await stage.started;
		expect(stage.dockOptions.view).toEqual(DEFAULT_PAGE_VIEW);
		expect(() => {
			stage.dockOptions.onLayer('pressure');
			stage.dockOptions.onGrid(true);
		}).not.toThrow();
		expect(stage.errors).toEqual([]);
	});

	it('stores each change of the layer, a view of the year and the toggles, once each', async () => {
		const { stage } = createStoredViewStage();
		stage.answerLoad({ kind: 'empty' });
		await stage.started;
		stage.dockOptions.onLayer('temperature');
		stage.topBarOptions.onSummary('temperature', 'coldest');
		stage.dockOptions.onLayer('pressure');
		stage.topBarOptions.onSummary('pressure', 'annualMean');
		stage.dockOptions.onLayer('temperature');
		stage.dockOptions.onSunlight(true);
		stage.dockOptions.onWinds(true);
		stage.dockOptions.onGrid(true);
		stage.dockOptions.onGrid(false);
		expect(stage.preferenceStorage.writes).toEqual([
			[LAYER_KEY, 'temperature'],
			[summaryKey('temperature'), 'coldest'],
			[LAYER_KEY, 'pressure'],
			[summaryKey('pressure'), 'annualMean'],
			[LAYER_KEY, 'temperature'],
			[SUNLIGHT_KEY, ON_ENTRY],
			[WINDS_KEY, ON_ENTRY],
			[GRID_KEY, ON_ENTRY],
			[GRID_KEY, OFF_ENTRY],
		]);
		// Temperature's own view of its year is back with it.
		expect(stage.topBarViews.at(-1)?.summaries).toEqual({
			temperature: 'coldest',
			pressure: 'annualMean',
		});
	});

	it('never writes the month or the source, nor anything for a new world', async () => {
		const { stage } = createStoredViewStage({
			preferenceEntries: STORED_ENTRIES,
		});
		stage.answerLoad({ kind: 'empty' });
		await stage.started;
		stage.topBarOptions.onSummary('temperature', 'month');
		stage.preferenceStorage.writes.length = 0;
		stage.timelineOptions.onMonth(2);
		stage.timelineOptions.onPlay();
		stage.timelineOptions.onPlay();
		stage.topBarOptions.onSource('observed');
		stage.state.replaceWorld(createBlankWorld(64));
		expect(stage.preferenceStorage.writes).toEqual([]);
		expect(stage.timelineViews.at(-1)?.view).toEqual({
			...STORED,
			summaries: { temperature: 'month', pressure: 'month' },
			month: DEFAULT_MONTH,
			source: 'simulated',
		});
		expect(
			[...stage.preferenceStorage.entries.keys()].every((key) =>
				VIEW_KEYS.includes(key),
			),
		).toBe(true);
	});
});

describe('the page’s visibility', () => {
	it('tells the globe whether the page is visible as it starts, and at each change', async () => {
		const stage = await createStartedStage();
		expect(stage.globeVisibility).toEqual([true]);
		stage.setPageVisible(false);
		expect(stage.globeVisibility).toEqual([true, false]);
		stage.setPageVisible(true);
		expect(stage.globeVisibility).toEqual([true, false, true]);
	});

	it('tells nothing else of it', async () => {
		const stage = await createStartedStage();
		stage.setPageVisible(false);
		stage.setPageVisible(true);
		expect(stage.log).toEqual([]);
		expect(stage.readoutCalls).toEqual([]);
		expect(stage.saved).toEqual([]);
	});
});

describe('the cursor readout, of the winds', () => {
	it('reads no winds while Winds is off, and the winds the arrows are drawn from while it is on', async () => {
		const { stage, arriveWinds } = await createWindUnitStage();
		arriveWinds(3);
		expect(stage.readoutOptions.shownWinds()).toBeNull();
		stage.dockOptions.onWinds(true);
		const shown = stage.readoutOptions.shownWinds();
		expect(shown?.field.east).toBe(
			stage.layerOptions.store.winds.result?.winds.east[DEFAULT_MONTH],
		);
		expect(shown?.current).toBe(true);
		stage.layerOptions.store.markOutOfDate();
		expect(stage.readoutOptions.shownWinds()?.current).toBe(false);
	});

	it.each([true, false])('looks again when Winds is turned %s', async (on) => {
		const { stage, arriveWinds } = await createWindUnitStage();
		arriveWinds(3);
		if (!on) {
			stage.dockOptions.onWinds(true);
		}
		stage.readoutCalls.length = 0;
		stage.dockOptions.onWinds(on);
		expect(stage.readoutCalls).toContain('invalidate');
		expect(stage.readoutOptions.shownWinds() !== null).toBe(on);
	});

	it('looks again when new winds arrive', async () => {
		const { stage, arriveWinds } = await createWindUnitStage();
		stage.dockOptions.onWinds(true);
		stage.readoutCalls.length = 0;
		arriveWinds(4);
		expect(stage.readoutCalls).toContain('invalidate');
		expect(stage.readoutOptions.shownWinds()?.field.east[0]).toBe(4);
	});

	it('looks again when the month changes', async () => {
		const { stage, arriveWinds } = await createWindUnitStage();
		stage.dockOptions.onWinds(true);
		arriveWinds(4);
		stage.readoutCalls.length = 0;
		stage.timelineOptions.onMonth(2);
		expect(stage.readoutCalls).toContain('invalidate');
		expect(stage.readoutOptions.shownWinds()?.field.east).toBe(
			stage.layerOptions.store.winds.result?.winds.east[2],
		);
	});

	it('looks again when the view changes, to the year’s mean winds and back', async () => {
		const { stage, arriveWinds } = await createWindUnitStage();
		stage.dockOptions.onWinds(true);
		arriveWinds(4);
		stage.dockOptions.onLayer('temperature');
		stage.readoutCalls.length = 0;
		const month = stage.readoutOptions.shownWinds()?.field;
		stage.topBarOptions.onSummary('temperature', 'annualMean');
		expect(stage.readoutCalls).toContain('invalidate');
		expect(stage.readoutOptions.shownWinds()?.field).not.toBe(month);
		stage.readoutCalls.length = 0;
		stage.dockOptions.onLayer('terrain');
		expect(stage.readoutCalls).toContain('invalidate');
		expect(stage.readoutOptions.shownWinds()?.field.east).toBe(month?.east);
	});
});

describe('the Sunlight control', () => {
	/** The calls that tell the globe how it is lit, in a log. */
	const sunlightCalls = (log: readonly string[]) =>
		log.filter((line) => line.startsWith('globe.setSunlight'));

	it('turns the globe’s sunlight on and off, once each, and tells the layer panel', async () => {
		const stage = await createStartedStage();
		stage.dockOptions.onSunlight(true);
		stage.dockOptions.onSunlight(false);
		expect(stage.log).toEqual([
			'globe.setSunlight darkened',
			'layerPanel.setSunlight true',
			'globe.setSunlight off',
			'layerPanel.setSunlight false',
		]);
	});

	it('draws the line in Temperature view before there is any temperature on the globe', async () => {
		const { stage } = await createSunStage();
		stage.dockOptions.onLayer('temperature');
		stage.log.length = 0;
		stage.dockOptions.onSunlight(true);
		expect(stage.readoutOptions.shownLayer()).toBeNull();
		expect(sunlightCalls(stage.log)).toEqual(['globe.setSunlight line']);
	});

	it('draws the line in Pressure view, as in Temperature view', async () => {
		const { stage } = await createSunStage();
		stage.dockOptions.onLayer('pressure');
		stage.log.length = 0;
		stage.dockOptions.onSunlight(true);
		stage.dockOptions.onLayer('temperature');
		stage.dockOptions.onLayer('pressure');
		expect(sunlightCalls(stage.log)).toEqual(['globe.setSunlight line']);
	});

	it('darkens the night side in Terrain view', async () => {
		const { stage } = await createSunStage();
		stage.dockOptions.onSunlight(true);
		expect(sunlightCalls(stage.log)).toEqual(['globe.setSunlight darkened']);
	});

	it('tells the globe again, once, at each change of layer while it is on, and not while it is off', async () => {
		const { stage } = await createSunStage();
		stage.dockOptions.onLayer('temperature');
		stage.dockOptions.onLayer('terrain');
		expect(sunlightCalls(stage.log)).toEqual([]);
		stage.dockOptions.onSunlight(true);
		stage.dockOptions.onLayer('temperature');
		stage.dockOptions.onLayer('terrain');
		stage.dockOptions.onLayer('temperature');
		stage.dockOptions.onSunlight(false);
		expect(sunlightCalls(stage.log)).toEqual([
			'globe.setSunlight darkened',
			'globe.setSunlight line',
			'globe.setSunlight darkened',
			'globe.setSunlight line',
			'globe.setSunlight off',
		]);
	});

	it('is kept for a new world, by the globe and the layer panel', async () => {
		const stage = await createStartedStage(undefined, {
			createLayerPanel: (options) =>
				createLayerPanel({
					...options,
					globe: { setLayer: () => {}, setWinds: () => {} },
					setTimer: () => 0,
					clearTimer: () => {},
					reportError: () => {},
					createControls: () => ({
						showLegend: () => {},
						showWindKey: () => {},
						showCalculation: () => {},
					}),
				}),
		});
		stage.dockOptions.onSunlight(true);
		stage.timelineOptions.onMonth(2);
		stage.log.length = 0;
		stage.timelineViews.length = 0;
		stage.state.replaceWorld(createBlankWorld(64));
		expect(stage.log.filter((line) => line.includes('Sunlight'))).toEqual([]);
		expect(stage.timelineViews).toEqual([
			{
				view: { ...DEFAULT_PAGE_VIEW, month: DEFAULT_MONTH, sunlight: true },
				playing: false,
			},
		]);
		expect(stage.log).toContain('worldPanel.setDate Year 0 · July');
	});
});

describe('the climate, with a part showing it that fails', () => {
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
			await page.answer(1);
			// The store reaches whatever shows the climate through the part
			// that computes it, as here.
			const { store } = page.stage.climateOptions;
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
		const climateLog: unknown[] = [];
		const workers: FakeWorker[] = [];
		const make = (): FakeWorker => {
			const worker = failing();
			workers.push(worker);
			return worker;
		};
		const stage = await createStartedStage(undefined, {
			createStatistics: (options) => ({
				...createStatisticsService({
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
				setHeightUnit: () => {},
			}),
			createClimate: (options) =>
				createClimateService({
					...options,
					createWorker: make,
					setTimer: timers.setTimer,
					clearTimer: timers.clearTimer,
					logError: (error) => climateLog.push(error),
				}),
		});
		await settle();
		expect(workers).toHaveLength(2);
		expect(readout).toContain('showUnavailable');
		const { store } = stage.climateOptions;
		expect(store.temperature.status).toBe('unavailable');
		expect(store.winds.status).toBe('unavailable');

		// The page goes on: a stroke and its undo still work.
		makeStroke(stage);
		stage.pressKey(UNDO_KEYS);
		expect(stage.state.world.elevation[5]).not.toBe(1234);
		timers.advance(CLIMATE_DEBOUNCE_MS * 2);
		await settle();
		expect(workers.flatMap((worker) => worker.posted)).toEqual([]);
		expect(store.temperature.status).toBe('unavailable');
		expect(store.winds.status).toBe('unavailable');
		expect(stage.errors).toEqual([]);
		expect(climateLog).toEqual([]);
	});
});

describe('the comparison on the measured Earth', () => {
	const EARTH_DATA = decodeEarth(readEarthDataFile());
	/** A new Earth world at 64 cells per face edge. */
	const freshEarth = (): World => earthWorld(EARTH_DATA, 64);

	/** A page on a world, with the real layer panel, in Temperature view. */
	const createComparisonStage = async (world: World = freshEarth()) => {
		/** Twelve months of zeros on a world's grid. */
		const zeros = (resolution: number) =>
			Array.from(
				{ length: 12 },
				() => new Float32Array(6 * resolution * resolution),
			);
		const stage = await createStartedStage(world, {
			createLayerPanel: (options) =>
				createLayerPanel({
					...options,
					loadObserved: async (_layer, resolution) => zeros(resolution),
					loadObservedWinds: async (resolution) => ({
						east: zeros(resolution),
						north: zeros(resolution),
					}),
					globe: { setLayer: () => {}, setWinds: () => {} },
					setTimer: () => 0,
					clearTimer: () => {},
					reportError: () => {},
					createControls: () => ({
						showLegend: () => {},
						showWindKey: () => {},
						showCalculation: () => {},
					}),
				}),
		});
		stage.dockOptions.onLayer('temperature');
		/** Has a current result for the world on show arrive. */
		const arrive = (): void => {
			const { store } = stage.layerOptions;
			arriveClimate(
				store,
				temperatureOf(1, stage.state.world.elevation.length),
				true,
			);
		};
		arrive();
		/** Has a current winds result for the world on show arrive. */
		const arriveWinds = (): void => {
			const { store } = stage.layerOptions;
			const cells = stage.state.world.elevation.length;
			answerWinds(
				store,
				{
					winds: {
						east: zeros(64),
						north: zeros(64),
						pressure: Array.from({ length: 12 }, () =>
							new Float32Array(cells).fill(1013),
						),
					},
					temperature: temperatureOf(1, cells),
					dayLengthHours: 24,
				},
				true,
			);
		};
		return {
			stage,
			arrive,
			arriveWinds,
			/** Whether the comparison control is offered, as last told. */
			offered: (): boolean =>
				(stage.comparisons.at(-1)?.offered.length ?? 0) > 0,
			/** What the comparison control offers, as last told. */
			choices: () => stage.comparisons.at(-1)?.offered,
			source: () => stage.comparisons.at(-1)?.source,
			shownSource: () => stage.readoutOptions.shownLayer()?.source,
			shownWindsSource: () => stage.readoutOptions.shownWinds()?.source,
		};
	};

	/** A page on the measured Earth showing the observed temperature. */
	const createObservingStage = async () => {
		const page = await createComparisonStage();
		page.stage.topBarOptions.onSource('observed');
		await settle();
		expect(page.shownSource()).toBe('observed');
		return page;
	};

	it('is offered for the Earth the page opens on, in Temperature view, and not on Terrain with the winds off', async () => {
		const page = await createComparisonStage();
		expect(page.choices()).toEqual(['simulated', 'observed', 'difference']);
		expect(page.source()).toBe('simulated');
		page.stage.dockOptions.onLayer('terrain');
		expect(page.offered()).toBe(false);
		page.stage.dockOptions.onLayer('temperature');
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

	it('offers all three on Pressure and Simulated or Observed for the winds on Terrain, on the measured Earth only; a stroke removes it, everything back on Simulated, and its undo offers it again on Simulated', async () => {
		const page = await createComparisonStage();
		page.stage.dockOptions.onWinds(true);
		page.arriveWinds();
		page.stage.dockOptions.onLayer('pressure');
		expect(page.choices()).toEqual(['simulated', 'observed', 'difference']);
		page.stage.dockOptions.onLayer('terrain');
		expect(page.choices()).toEqual(['simulated', 'observed']);
		page.stage.topBarOptions.onSource('observed');
		await settle();
		expect(page.source()).toBe('observed');
		expect(page.shownWindsSource()).toBe('observed');
		makeStroke(page.stage);
		expect(page.offered()).toBe(false);
		expect(page.source()).toBe('simulated');
		expect(page.shownWindsSource()).toBe('simulated');
		page.stage.pressKey(UNDO_KEYS);
		expect(page.choices()).toEqual(['simulated', 'observed']);
		expect(page.source()).toBe('simulated');
		page.stage.planetPanelOptions.onChange({
			...DEFAULT_PLANET,
			dayLengthHours: 30,
		});
		expect(page.offered()).toBe(false);
		page.stage.state.replaceWorld(createBlankWorld(64));
		expect(page.offered()).toBe(false);
		page.stage.state.replaceWorld(freshEarth());
		expect(page.choices()).toEqual(['simulated', 'observed']);
		expect(page.source()).toBe('simulated');
	});

	it('shows the observed temperature and the observed winds together on Observed, and goes back to Simulated for both after a stroke', async () => {
		const page = await createComparisonStage();
		page.stage.dockOptions.onWinds(true);
		page.arriveWinds();
		page.stage.topBarOptions.onSource('observed');
		await settle();
		expect(page.shownSource()).toBe('observed');
		expect(page.shownWindsSource()).toBe('observed');
		page.stage.topBarOptions.onSource('difference');
		expect(page.shownSource()).toBe('difference');
		expect(page.shownWindsSource()).toBe('simulated');
		makeStroke(page.stage);
		expect(page.offered()).toBe(false);
		expect(page.shownSource()).toBe('simulated');
		expect(page.shownWindsSource()).toBe('simulated');
		page.stage.pressKey(UNDO_KEYS);
		expect(page.offered()).toBe(true);
		expect(page.source()).toBe('simulated');
	});

	it('offers no comparison off the measured Earth, for the winds either', async () => {
		const page = await createComparisonStage(createBlankWorld(64));
		page.stage.dockOptions.onWinds(true);
		page.stage.dockOptions.onLayer('terrain');
		expect(page.offered()).toBe(false);
		page.stage.topBarOptions.onSource('observed');
		expect(page.offered()).toBe(false);
		expect(page.source()).toBe('simulated');
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

	it.each([3, 23.9, 24.1, 30, 720])(
		'goes for a day of %s hours, and comes back at 24',
		async (dayLengthHours) => {
			const page = await createObservingStage();
			page.stage.planetPanelOptions.onChange({
				...DEFAULT_PLANET,
				dayLengthHours,
			});
			expect(page.offered()).toBe(false);
			expect(page.shownSource()).toBe('simulated');
			page.stage.planetPanelOptions.onChange({
				...DEFAULT_PLANET,
				dayLengthHours: 24,
			});
			expect(page.offered()).toBe(true);
			expect(page.source()).toBe('simulated');
		},
	);

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
