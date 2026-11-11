import './styles.css';
import {
	CORE_VERSION,
	createBlankWorld,
	normaliseSeaLevel,
	type World,
} from '../core/index';
import { createSimClient } from '../worker/client';
import { createAppState } from './appState';
import { AUTOSAVE_DELAY_MS, createAutosave } from './autosave';
import { attachViewInput } from './globe/input';
import { MAX_DRAWN_SEA_LEVEL_M, MIN_DRAWN_SEA_LEVEL_M } from './globe/material';
import { createGlobe, type Globe } from './globe/renderer';
import { createRefreshScheduler, STATS_DEBOUNCE_MS } from './refresh';
import {
	createSculptController,
	DEFAULT_TOOL,
	rotateButtonFor,
} from './sculpt';
import { applyStartup, decideStartup, type StartupRead } from './startup';
import { exportWorldFile, importWorldFile, openWorldStore } from './storage';
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
import {
	createWorldPanel,
	describeWorld,
	EXPORT_FAILED_MESSAGE,
	runImport,
} from './ui/worldPanel';
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
	// The page starts on a blank ocean, which stays until the saved world,
	// if there is one, has been read. A world keeps its own sea level only
	// as far as the sea-level slider can show it.
	const state = createAppState({
		world: createBlankWorld(),
		seaLevelRange: { minM: MIN_DRAWN_SEA_LEVEL_M, maxM: MAX_DRAWN_SEA_LEVEL_M },
	});
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
	const openDialog = (values: NewWorldValues, notice?: string): void => {
		// A stroke is driven by animation frames, which a modal dialog
		// does not stop, so one left under way would keep sculpting
		// behind the dialog.
		sculpt.endStroke();
		openNewWorldDialog({
			values,
			createWorld: worldFromChoice,
			onWorld: state.replaceWorld,
			notice,
		});
	};
	const worldPanel = createWorldPanel(panel, {
		description: describeWorld(state.world),
		onNewWorld: () => openDialog(newWorldValuesFor(state.world)),
		onExport: () => {
			try {
				exportWorldFile(state.world);
				worldPanel.setMessage(null);
			} catch (error) {
				console.error(error);
				worldPanel.setMessage(EXPORT_FAILED_MESSAGE);
			}
		},
		// As for the dialog: the browser's file chooser does not stop a
		// stroke either.
		onImportOpen: sculpt.endStroke,
		onImport: (file) =>
			void runImport(file, {
				read: importWorldFile,
				onWorld: (world) => state.replaceWorld(world, { keepSeaLevel: true }),
				showMessage: worldPanel.setMessage,
				logError: (error) => console.error(error),
			}),
	});
	// One connection for as long as the page lasts, which reading the saved
	// world opens. A save made as the page goes then needs no connection
	// opened first, which the page would not live to see.
	const store = openWorldStore();
	let saveFailureLogged = false;
	const autosave = createAutosave({
		save: () => store.save(state.world),
		delayMs: AUTOSAVE_DELAY_MS,
		setTimer: (callback, delayMs) => window.setTimeout(callback, delayMs),
		clearTimer: (handle: number) => window.clearTimeout(handle),
		isBusy: sculpt.isStrokeActive,
		onState: worldPanel.setAutosaveState,
		onError: (error) => {
			// Once: a browser that refuses storage refuses every save.
			if (!saveFailureLogged) {
				saveFailureLogged = true;
				console.error(error);
			}
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
		world: state.world,
		globe,
		isStrokeActive: sculpt.isStrokeActive,
		onTerrainChange: () => {
			refreshStatistics();
			autosave.markChanged();
		},
		onHistoryChange: tools.setHistoryState,
	});
	/**
	 * Whether the page is still finding out what was saved before. Until it
	 * knows, the world on show is not to be changed.
	 */
	let starting = false;
	window.addEventListener('keydown', (event) => {
		if (starting) {
			return;
		}
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
			autosave.markChanged();
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
	// world, which by now is back at the default, or is the world's own
	// if the world was imported or restored.
	state.addListener(sculpt.setWorld);
	state.addListener(globe.setWorld);
	state.addListener((world) => view.setSeaLevel(world.seaLevel));
	state.addListener((world) => worldPanel.setDescription(describeWorld(world)));
	// The figures on show are the old world's, and stay wrong until the
	// new world's arrive.
	state.addListener(statsPanel.showPending);
	state.addListener(refreshStatistics);
	// What the panel said of an earlier import or export is over with.
	state.addListener(() => worldPanel.setMessage(null));
	// The autosave takes no note of this until it is started, which is
	// after the world brought back when the page opens is in place.
	state.addListener(autosave.markChanged);

	// A page being hidden or closed may never run again, so what has not
	// been saved is saved now rather than when its wait is over. A page
	// that is refreshed, left or closed says so first while it still has
	// a moment to live, which is when the save is made. By the time it is
	// hidden for good the browser may drop a save although it was handed
	// over in time, so those two only catch what the first did not: a tab
	// put in the background, and a browser that never said the first.
	window.addEventListener('beforeunload', autosave.flush);
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') {
			autosave.flush();
		}
	});
	window.addEventListener('pagehide', autosave.flush);

	/**
	 * Brings back the world that was saved, or opens the dialog that starts
	 * one: as it first opens if nothing was saved, and saying so if what
	 * was saved cannot be brought back.
	 *
	 * @remarks
	 * Until the storage has answered, the panel, the globe and the history
	 * shortcuts are out of reach and nothing is saved. A change made to the
	 * blank world meanwhile would otherwise be saved over the saved world,
	 * or be lost when that world arrives.
	 */
	const restoreOrStart = async (): Promise<void> => {
		let read: StartupRead;
		starting = true;
		panel.inert = true;
		canvas.inert = true;
		try {
			read = { kind: 'loaded', outcome: await store.load() };
		} catch (error) {
			console.error(error);
			read = { kind: 'failed' };
		} finally {
			// Before any dialog opens: it gives the focus back to the page
			// when it closes, which an inert page could not take.
			starting = false;
			panel.inert = false;
			canvas.inert = false;
		}
		if (read.kind === 'loaded' && read.outcome.kind === 'corrupt') {
			console.error(`The saved world cannot be read: ${read.outcome.reason}`);
		}
		applyStartup(decideStartup(read), {
			replaceWorld: (world) =>
				state.replaceWorld(world, { keepSeaLevel: true }),
			setAutosaveState: worldPanel.setAutosaveState,
			startAutosave: autosave.start,
			openDialog: ({ notice }) => openDialog(FIRST_NEW_WORLD_VALUES, notice),
			logError: (error) => console.error(error),
		});
	};
	void restoreOrStart();
}
