import './styles.css';
import { CORE_VERSION, createBlankWorld } from '../core/index';
import { createAppState } from './appState';
import { AUTOSAVE_DELAY_MS, createAutosave } from './autosave';
import { loadEarthData } from './earthData';
import { attachViewInput } from './globe/input';
import { MAX_DRAWN_SEA_LEVEL_M, MIN_DRAWN_SEA_LEVEL_M } from './globe/material';
import { createGlobe, type Globe } from './globe/renderer';
import { loadObservedTemperature } from './observedData';
import { createPanelMemory, reachStorage } from './panelMemory';
import { createSculptController } from './sculpt';
import { exportWorldFile, importWorldFile, openWorldStore } from './storage';
import { createCursorReadout, createReadoutStrip } from './ui/cursorReadout';
import { createGlobeOverlays } from './ui/globeOverlays';
import { createLayerControls, createLayerPanel } from './ui/layerPanel';
import { openNewWorldDialog } from './ui/newWorldDialog';
import { createPanelSections } from './ui/panelSections';
import { createPlanetPanel } from './ui/planetPanel';
import { createStatsPanel } from './ui/statsPanel';
import { createToolPanel } from './ui/toolPanel';
import { createViewPanel, SEA_LEVEL_SLIDER_STEP_M } from './ui/viewPanel';
import { createWorldPanel } from './ui/worldPanel';
import { startPage } from './wiring';
import {
	createStatisticsService,
	createTemperatureService,
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

/** Creates the globe, or explains on the page why there cannot be one. */
const createGlobeOrExplain = (): Globe | null => {
	try {
		return createGlobe(canvas);
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
 * own, so that a slow temperature solve never holds up the statistics.
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
		createPanelMemory(reachStorage(() => window.localStorage)),
	);
	const overlays = createGlobeOverlays(viewport);
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
		createPlanetPanel: (options) =>
			createPlanetPanel(sections.planet.body, options),
		createStatistics: (options) =>
			createStatisticsService({
				...options,
				createWorker,
				readout: createStatsPanel(sections.statistics.body),
				setTimer,
				clearTimer,
				logError,
			}),
		createTemperature: (options) =>
			createTemperatureService({
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
				createControls: (controls) =>
					createLayerControls(sections.layers.body, overlays.legend, controls),
			}),
		createCursorReadout: (options) =>
			createCursorReadout({
				...options,
				canvas,
				globe,
				show: createReadoutStrip(overlays.readout).show,
			}),
		layersSection: sections.layers,
		openNewWorldDialog,
		loadEarth: loadEarthData,
		loadObserved: loadObservedTemperature,
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
		logError,
	});
}
