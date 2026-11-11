import './styles.css';
import {
	CORE_VERSION,
	createBlankWorld,
	normaliseSeaLevel,
	type World,
} from '../core/index';
import { createSimClient } from '../worker/client';
import { createAppState } from './appState';
import { attachViewInput } from './globe/input';
import { createGlobe, type Globe } from './globe/renderer';
import { createRefreshScheduler, STATS_DEBOUNCE_MS } from './refresh';
import {
	createSculptController,
	DEFAULT_TOOL,
	rotateButtonFor,
} from './sculpt';
import {
	FIRST_NEW_WORLD_VALUES,
	type NewWorldValues,
	newWorldValuesFor,
	openNewWorldDialog,
	worldFromChoice,
} from './ui/newWorldDialog';
import { createStatsPanel, type StatsPanel } from './ui/statsPanel';
import { createToolPanel } from './ui/toolPanel';
import { createViewPanel } from './ui/viewPanel';
import { createWorldPanel, describeWorld } from './ui/worldPanel';
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
	// With no world to bring back, the page opens on a blank ocean, under
	// the dialog that starts a world.
	const state = createAppState({ world: createBlankWorld() });
	globe.setWorld(state.world);
	const viewInput = attachViewInput(
		canvas,
		globe,
		rotateButtonFor(DEFAULT_TOOL),
	);
	// The history is cleared from the sculpt controller's own hook, so that
	// replacing the world through `sculpt.setWorld` can never leave the
	// strokes of the old one to be undone on the new.
	const sculpt = createSculptController(globe, state.world, {
		canvas,
		onStrokeEnd: (changes) => edits.commit(changes),
		onWorldChange: (next) => edits.setWorld(next),
	});
	const openDialog = (values: NewWorldValues): void => {
		// A stroke is driven by animation frames, which a modal dialog
		// does not stop, so one left under way would keep sculpting
		// behind the dialog.
		sculpt.endStroke();
		openNewWorldDialog({
			values,
			createWorld: worldFromChoice,
			onWorld: state.replaceWorld,
		});
	};
	const worldPanel = createWorldPanel(panel, {
		description: describeWorld(state.world),
		onNewWorld: () => openDialog(newWorldValuesFor(state.world)),
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
		world: state.world,
		globe,
		isStrokeActive: sculpt.isStrokeActive,
		onTerrainChange: () => refreshStatistics(),
		onHistoryChange: tools.setHistoryState,
	});
	window.addEventListener('keydown', (event) => {
		// A modal dialog puts the page behind it out of reach, the terrain
		// included, whichever of the dialog's controls has the focus.
		if (document.querySelector(':modal') === null) {
			handleHistoryKey(event, edits.perform);
		}
	});
	const view = createViewPanel(panel, {
		seaLevel: state.world.seaLevel,
		onExaggeration: globe.setExaggeration,
		onSeaLevel: (metres) => {
			const { world } = state;
			world.seaLevel = normaliseSeaLevel(metres);
			globe.setSeaLevel(world.seaLevel);
			refreshStatistics();
		},
		onGridVisible: globe.setGridVisible,
	});
	const statsPanel = createStatsPanel(panel);
	const refreshStatistics = startStatistics(
		statsPanel,
		() => state.world,
		sculpt.isStrokeActive,
	);
	refreshStatistics();

	// What a new world reaches, in this order. The sculpt controller goes
	// first: it ends a stroke still under way while the globe and the
	// history are on the world the stroke was made on, and then has the
	// history forget that world. The globe takes its sea level from the
	// world, which by now is back at the default.
	state.addListener(sculpt.setWorld);
	state.addListener(globe.setWorld);
	state.addListener((world) => view.setSeaLevel(world.seaLevel));
	state.addListener((world) => worldPanel.setDescription(describeWorld(world)));
	// The figures on show are the old world's, and stay wrong until the
	// new world's arrive.
	state.addListener(statsPanel.showPending);
	state.addListener(refreshStatistics);

	openDialog(FIRST_NEW_WORLD_VALUES);
}
