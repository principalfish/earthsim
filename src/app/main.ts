import './styles.css';
import {
	CORE_VERSION,
	generateWorld,
	normaliseSeaLevel,
	type World,
} from '../core/index';
import { createSimClient } from '../worker/client';
import { attachViewInput } from './globe/input';
import { createGlobe, type Globe } from './globe/renderer';
import { createRefreshScheduler, STATS_DEBOUNCE_MS } from './refresh';
import {
	createSculptController,
	DEFAULT_TOOL,
	rotateButtonFor,
} from './sculpt';
import { parseStartOptions } from './startOptions';
import { createStatsPanel, type StatsPanel } from './ui/statsPanel';
import { createToolPanel } from './ui/toolPanel';
import { createViewPanel } from './ui/viewPanel';
import { createUndoController, handleHistoryKey } from './undo';

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

/**
 * Starts the simulation worker and has a readout follow the statistics it
 * computes.
 *
 * @remarks
 * Whatever goes wrong with the worker costs only the statistics: the
 * readout says there are none, and everything else on the page works.
 *
 * @param readout - Where the statistics are shown.
 * @param currentWorld - The world being edited, at the time it is asked.
 * @param isStrokeActive - Whether a brush stroke is under way, during which
 * the statistics are not asked for.
 * @returns What to call whenever the terrain or the sea level has changed.
 */
const startStatistics = (
	readout: StatsPanel,
	currentWorld: () => World,
	isStrokeActive: () => boolean,
): (() => void) => {
	let worker: Worker;
	try {
		worker = new Worker(new URL('../worker/sim.worker.ts', import.meta.url), {
			type: 'module',
		});
	} catch (error) {
		console.error(error);
		readout.showUnavailable();
		return () => {};
	}
	// A worker whose script cannot be loaded says so once, perhaps before
	// anything has been asked of it, and then never answers.
	worker.addEventListener('error', readout.showUnavailable);
	const client = createSimClient(worker);
	return createRefreshScheduler({
		request: () => client.latest('terrainStats', currentWorld()),
		debounceMs: STATS_DEBOUNCE_MS,
		setTimer: (callback, delayMs) => window.setTimeout(callback, delayMs),
		clearTimer: (handle: number) => window.clearTimeout(handle),
		isBusy: isStrokeActive,
		onResult: readout.show,
		onError: (error) => {
			console.error(error);
			readout.showUnavailable();
		},
	}).refresh;
};

const globe = createGlobeOrExplain();
if (globe !== null) {
	// The world being edited. `sculpt.setWorld` replaces it, so whatever
	// reads or changes the world later goes through this variable.
	let current = generateWorld(parseStartOptions(window.location.search));
	globe.setWorld(current);
	const viewInput = attachViewInput(
		canvas,
		globe,
		rotateButtonFor(DEFAULT_TOOL),
	);
	// The history is cleared from the sculpt controller's own hook, so that
	// replacing the world through `sculpt.setWorld` can never leave the
	// strokes of the old one to be undone on the new.
	const sculpt = createSculptController(globe, current, {
		canvas,
		onStrokeEnd: (changes) => edits.commit(changes),
		onWorldChange: (next) => {
			edits.setWorld(next);
			current = next;
			refreshStatistics();
		},
	});
	const tools = createToolPanel(panel, {
		onHistory: (action) => edits.perform(action),
		onTool: (tool) => {
			// The button that turns the globe changes first, so that a
			// drag never both turns it and sculpts.
			viewInput.setRotateButton(rotateButtonFor(tool));
			sculpt.setTool(tool);
		},
		onRadius: sculpt.setRadiusKm,
		onStrength: sculpt.setStrength,
		onSmoothSetting: sculpt.setSmoothSetting,
	});
	const edits = createUndoController({
		world: current,
		globe,
		isStrokeActive: sculpt.isStrokeActive,
		onTerrainChange: () => refreshStatistics(),
		onHistoryChange: tools.setHistoryState,
	});
	window.addEventListener('keydown', (event) =>
		handleHistoryKey(event, edits.perform),
	);
	createViewPanel(panel, {
		seaLevel: current.seaLevel,
		onExaggeration: globe.setExaggeration,
		onSeaLevel: (metres) => {
			current.seaLevel = normaliseSeaLevel(metres);
			globe.setSeaLevel(current.seaLevel);
			refreshStatistics();
		},
		onGridVisible: globe.setGridVisible,
	});
	const refreshStatistics = startStatistics(
		createStatsPanel(panel),
		() => current,
		sculpt.isStrokeActive,
	);
	refreshStatistics();
}
