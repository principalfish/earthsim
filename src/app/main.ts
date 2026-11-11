import './styles.css';
import { CORE_VERSION, createBlankWorld } from '../core/index';
import { createSimClient } from '../worker/client';
import { createAppState } from './appState';
import { AUTOSAVE_DELAY_MS, createAutosave } from './autosave';
import { loadEarthData } from './earthData';
import { attachViewInput } from './globe/input';
import { MAX_DRAWN_SEA_LEVEL_M, MIN_DRAWN_SEA_LEVEL_M } from './globe/material';
import { createGlobe, type Globe } from './globe/renderer';
import {
	createRefreshScheduler,
	type RefreshScheduler,
	STATS_DEBOUNCE_MS,
} from './refresh';
import { createSculptController } from './sculpt';
import { exportWorldFile, importWorldFile, openWorldStore } from './storage';
import { openNewWorldDialog } from './ui/newWorldDialog';
import { createStatsPanel } from './ui/statsPanel';
import { createToolPanel } from './ui/toolPanel';
import { createViewPanel, SEA_LEVEL_SLIDER_STEP_M } from './ui/viewPanel';
import { createWorldPanel } from './ui/worldPanel';
import { type PageStatisticsOptions, startPage } from './wiring';

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

/** Starts the simulation worker, or says why there cannot be one. */
const createWorkerOrExplain = (): Worker | null => {
	try {
		return new Worker(new URL('../worker/sim.worker.ts', import.meta.url), {
			type: 'module',
		});
	} catch (error) {
		console.error(error);
		return null;
	}
};

/**
 * Adds the statistics readout to the panel, starts the simulation worker
 * and has the readout follow the statistics it computes.
 *
 * @remarks
 * Whatever goes wrong with the worker costs only the statistics: the
 * readout says there are none, and everything else on the page works. A
 * worker that could not be started, or whose script could not be loaded,
 * never answers, so from then on the readout goes on saying so and
 * nothing more is asked of it.
 *
 * @param options - The world to compute them for, and whether a brush
 * stroke is under way, during which the statistics are not asked for.
 * @returns What to tell whenever the terrain or the sea level has changed,
 * and whenever the world has been replaced.
 */
const startStatistics = (options: PageStatisticsOptions): RefreshScheduler => {
	const readout = createStatsPanel(panel);
	const worker = createWorkerOrExplain();
	const client = worker === null ? null : createSimClient(worker);
	const scheduler = createRefreshScheduler({
		request: async () => {
			if (client === null) {
				throw new Error('There is no simulation worker');
			}
			return client.latest('terrainStats', options.currentWorld());
		},
		debounceMs: STATS_DEBOUNCE_MS,
		setTimer: (callback, delayMs) => window.setTimeout(callback, delayMs),
		clearTimer: (handle: number) => window.clearTimeout(handle),
		isBusy: options.isStrokeActive,
		onResult: readout.show,
		onError: (error) => {
			console.error(error);
			readout.showUnavailable();
		},
		onPending: readout.showPending,
		onUnavailable: readout.showUnavailable,
	});
	if (worker === null) {
		scheduler.markUnavailable();
	} else {
		// The worker answers every message it is sent, failures included,
		// so this event means its script could not be loaded or has
		// stopped: it says so once, perhaps before anything has been asked
		// of it, and then never answers.
		worker.addEventListener('error', () => scheduler.markUnavailable());
	}
	return scheduler;
};

const globe = createGlobeOrExplain();
if (globe !== null) {
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
		createViewInput: (rotateButton) =>
			attachViewInput(canvas, globe, rotateButton),
		createSculpt: (world, options) =>
			createSculptController(globe, world, { canvas, ...options }),
		createWorldPanel: (options) => createWorldPanel(panel, options),
		openStore: openWorldStore,
		createAutosave: (options) =>
			createAutosave({
				...options,
				delayMs: AUTOSAVE_DELAY_MS,
				setTimer: (callback, delayMs) => window.setTimeout(callback, delayMs),
				clearTimer: (handle: number) => window.clearTimeout(handle),
			}),
		createToolPanel: (options) => createToolPanel(panel, options),
		createViewPanel: (options) => createViewPanel(panel, options),
		createStatistics: startStatistics,
		openNewWorldDialog,
		loadEarth: loadEarthData,
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
		logError: (error) => console.error(error),
	});
}
