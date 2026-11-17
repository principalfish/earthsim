import './styles.css';
import { CORE_VERSION, createBlankWorld } from '../core/index';
import { createAppState } from './appState';
import { AUTOSAVE_DELAY_MS, createAutosave } from './autosave';
import { loadEarthData } from './earthData';
import { attachViewInput } from './globe/input';
import { MAX_DRAWN_SEA_LEVEL_M, MIN_DRAWN_SEA_LEVEL_M } from './globe/material';
import { createGlobe, type Globe } from './globe/renderer';
import { loadObservedWinds } from './observedData';
import { createPanelMemory, reachStorage } from './panelMemory';
import { createPreferences } from './preferences';
import { loadLayerObserved } from './scalarLayer';
import { createSculptController } from './sculpt';
import { exportWorldFile, importWorldFile, openWorldStore } from './storage';
import { createCursorReadout } from './ui/cursorReadout';
import { createInfoBox } from './ui/infoBox';
import { createLayerDock } from './ui/layerDock';
import { createLayerPanel } from './ui/layerPanel';
import { createMainView } from './ui/mainView';
import { openNewWorldDialog } from './ui/newWorldDialog';
import { createPanelSections } from './ui/panelSections';
import { createPauseButton } from './ui/pauseButton';
import { createPlanetPanel } from './ui/planetPanel';
import { createSettingsPanel } from './ui/settingsPanel';
import { createStatsPanel } from './ui/statsPanel';
import { createTimeline } from './ui/timeline';
import { createToolPanel } from './ui/toolPanel';
import { createTopBar } from './ui/topBar';
import { createViewPanel, SEA_LEVEL_SLIDER_STEP_M } from './ui/viewPanel';
import { createWorldPanel } from './ui/worldPanel';
import { startPage } from './wiring';
import {
	createStatisticsService,
	createTemperatureService,
	createWindsService,
} from './workerService';

/** Looks up an element the page markup is required to contain. */
const requireElement = <T extends Element>(
	selector: string,
	type: new () => T,
): T => {
	const element = document.querySelector(selector);
	if (!(element instanceof type)) {
		throw new Error(`index.html is missing the ${selector} element`);
	}
	return element;
};

/** Replaces the globe with a message saying why it cannot be shown. */
const showFailure = (canvas: HTMLCanvasElement, reason: string): void => {
	const message = document.createElement('p');
	message.className = 'viewport__message';
	message.setAttribute('role', 'alert');
	message.textContent = reason;
	canvas.replaceWith(message);
};

const canvas = requireElement('#globe', HTMLCanvasElement);
const panel = requireElement('#panel', HTMLElement);
const viewport = requireElement('.viewport', HTMLElement);

document.documentElement.dataset.coreVersion = CORE_VERSION;

// Reached once for both: the open sections and the preferences are
// settings of the browser, kept apart from the saved world.
const browserStorage = reachStorage(() => window.localStorage);
// Asked once, as the page starts: where the system asks for reduced
// motion, the winds start as arrows, which stand still, not as streaks.
const preferences = createPreferences(browserStorage, {
	reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
});

/**
 * Creates the globe, drawing the winds as the preferences say from its
 * first frame, or explains on the page why there cannot be one.
 */
const createGlobeOrExplain = (): Globe | null => {
	try {
		return createGlobe(canvas, preferences.windStyle());
	} catch (error) {
		console.error(error);
		showFailure(
			canvas,
			'The globe cannot be shown because this browser or device does not provide WebGL 2. Try a current desktop Chrome or Firefox with hardware acceleration turned on.',
		);
		return null;
	}
};

/**
 * Starts an instance of the simulation worker. Each service has one of its
 * own, so that a slow temperature or wind solve never holds up the
 * statistics or the other.
 */
const createWorker = (): Worker =>
	new Worker(new URL('../worker/sim.worker.ts', import.meta.url), {
		type: 'module',
	});

const setTimer = (callback: () => void, delayMs: number): number =>
	window.setTimeout(callback, delayMs);
const clearTimer = (handle: number): void => window.clearTimeout(handle);
const logError = (error: unknown): void => console.error(error);

const globe = createGlobeOrExplain();
if (globe !== null) {
	const sections = createPanelSections(
		panel,
		createPanelMemory(browserStorage),
	);
	const mainView = createMainView(viewport);
	// Made first, since the layer panel and the cursor readout both show
	// what they have in it.
	const infoBox = createInfoBox();
	mainView.info.append(infoBox.element);
	void startPage({
		// The page starts on a blank ocean, which stays until the saved
		// world, if there is one, has been read. A world keeps its own sea
		// level only as far as the sea-level slider can show it.
		state: createAppState({
			world: createBlankWorld(),
			seaLevelRange: {
				minM: MIN_DRAWN_SEA_LEVEL_M,
				maxM: MAX_DRAWN_SEA_LEVEL_M,
				stepM: SEA_LEVEL_SLIDER_STEP_M,
			},
		}),
		globe,
		createViewInput: (rotateButton, onCameraMove) =>
			attachViewInput(canvas, globe, rotateButton, onCameraMove),
		createSculpt: (world, options) =>
			createSculptController(globe, world, { canvas, ...options }),
		createWorldPanel: (options) =>
			createWorldPanel(sections.world.body, options),
		openStore: openWorldStore,
		createAutosave: (options) =>
			createAutosave({
				...options,
				delayMs: AUTOSAVE_DELAY_MS,
				setTimer,
				clearTimer,
			}),
		createToolPanel: (options) => createToolPanel(sections.tools, options),
		createViewPanel: (options) => createViewPanel(sections.view.body, options),
		createSettingsPanel: (options) =>
			createSettingsPanel(sections.settings.body, options),
		createLayerDock: (options) => {
			const dock = createLayerDock(options);
			mainView.dock.append(dock.element);
			return dock;
		},
		createTopBar: (options) => {
			const bar = createTopBar(options);
			mainView.topBar.append(bar.element);
			return bar;
		},
		createTimeline: (options) => {
			const timeline = createTimeline(options);
			mainView.timeline.append(timeline.element);
			return timeline;
		},
		createPauseButton: (options) => {
			mainView.corner.append(createPauseButton(options).element);
		},
		createPlanetPanel: (options) =>
			createPlanetPanel(sections.planet.body, options),
		createStatistics: (options) => {
			const readout = createStatsPanel(
				sections.statistics.body,
				options.heightUnit,
			);
			return {
				...createStatisticsService({
					...options,
					createWorker,
					readout,
					setTimer,
					clearTimer,
					logError,
				}),
				setHeightUnit: readout.setHeightUnit,
			};
		},
		createTemperature: (options) =>
			createTemperatureService({
				...options,
				createWorker,
				setTimer,
				clearTimer,
				logError,
			}),
		createWinds: (options) =>
			createWindsService({
				...options,
				createWorker,
				setTimer,
				clearTimer,
				logError,
			}),
		createLayerPanel: (options) =>
			createLayerPanel({
				...options,
				globe,
				setTimer,
				clearTimer,
				reportError: logError,
				createControls: () => infoBox,
			}),
		createCursorReadout: (options) =>
			createCursorReadout({
				...options,
				canvas,
				globe,
				show: infoBox.showReadout,
			}),
		preferences,
		openNewWorldDialog,
		loadEarth: loadEarthData,
		loadObserved: loadLayerObserved,
		loadObservedWinds,
		exportWorld: (world) => exportWorldFile(world),
		importWorld: importWorldFile,
		setInert: (inert) => {
			panel.inert = inert;
			canvas.inert = inert;
		},
		isModalOpen: () => document.querySelector(':modal') !== null,
		onKeyDown: (listener) => window.addEventListener('keydown', listener),
		// A page that is refreshed, left or closed says so first while it
		// still has a moment to live, which is when the save is made. By
		// the time it is hidden for good the browser may drop a save
		// although it was handed over in time, so those two only catch what
		// the first did not: a tab put in the background, and a browser
		// that never said the first.
		onPageHiding: (listener) => {
			window.addEventListener('beforeunload', listener);
			document.addEventListener('visibilitychange', () => {
				if (document.visibilityState === 'hidden') {
					listener();
				}
			});
			window.addEventListener('pagehide', listener);
		},
		onPageVisibility: (listener) => {
			const tell = (): void => listener(document.visibilityState !== 'hidden');
			tell();
			document.addEventListener('visibilitychange', tell);
		},
		logError,
	});
}
