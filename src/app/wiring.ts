/**
 * Joining the parts of the page to one another: which part hears of what,
 * in which order, and what the page does while it finds out what was saved
 * before.
 *
 * Nothing here touches the DOM, the globe's renderer, a worker or the
 * browser's storage. Each of those is handed in, already made or as a
 * function that makes it, so the joining can be run with stand-ins.
 */

import {
	normaliseSeaLevel,
	type World,
	type WorldFileResult,
} from '../core/index';
import type { AppState } from './appState';
import type { Autosave, AutosaveOptions } from './autosave';
import type { RotateButton, ViewInput } from './globe/input';
import type { Globe } from './globe/renderer';
import type { RefreshScheduler } from './refresh';
import {
	DEFAULT_TOOL,
	rotateButtonFor,
	type SculptController,
	type SculptOptions,
} from './sculpt';
import { applyStartup, decideStartup, type StartupRead } from './startup';
import type { WorldStore } from './storage';
import {
	FIRST_NEW_WORLD_VALUES,
	type NewWorldDialogOptions,
	type NewWorldValues,
	newWorldValuesFor,
	type WorldSources,
	worldFromChoice,
} from './ui/newWorldDialog';
import type { ToolPanel, ToolPanelOptions } from './ui/toolPanel';
import type { ViewPanel, ViewPanelOptions } from './ui/viewPanel';
import {
	describeWorld,
	EXPORT_FAILED_MESSAGE,
	runImport,
	type WorldPanel,
	type WorldPanelOptions,
} from './ui/worldPanel';
import {
	createUndoController,
	handleHistoryKey,
	type ShortcutEvent,
} from './undo';

/** What the page asks of its globe once the globe exists. */
export type PageGlobe = Pick<
	Globe,
	| 'setWorld'
	| 'setSeaLevel'
	| 'setExaggeration'
	| 'setGridVisible'
	| 'updateElevation'
>;

/** What the page's autosave is made from; the timing is the maker's. */
export type PageAutosaveOptions = Pick<
	AutosaveOptions<never>,
	'save' | 'isBusy' | 'onState' | 'onError'
>;

/** What the page's statistics are computed from. */
export type PageStatisticsOptions = {
	/** The world being edited, at the time it is asked. */
	readonly currentWorld: () => World;
	/** Whether a brush stroke is under way. */
	readonly isStrokeActive: () => boolean;
};

/** The parts of a page, for {@link startPage} to join. */
export type PageParts = {
	/** The world being edited, on the world the page opens on. */
	readonly state: AppState;
	/** The globe, not yet showing any world. */
	readonly globe: PageGlobe;
	/**
	 * Attaches the mouse's control of the view.
	 *
	 * @param rotateButton - The button whose drag turns the globe at first.
	 */
	readonly createViewInput: (
		rotateButton: RotateButton,
	) => Pick<ViewInput, 'setRotateButton'>;
	/**
	 * Attaches the sculpting tools to the globe.
	 *
	 * @param world - The world to sculpt at first.
	 * @param options - Whom to tell of strokes and of a new world.
	 */
	readonly createSculpt: (
		world: World,
		options: Pick<SculptOptions, 'onStrokeEnd' | 'onWorldChange'>,
	) => Omit<SculptController, 'dispose'>;
	/** Adds the world controls to the panel. */
	readonly createWorldPanel: (
		options: WorldPanelOptions,
	) => Omit<WorldPanel, 'element'>;
	/** Gives the slot the saved world is kept in, without reading it yet. */
	readonly openStore: () => Pick<WorldStore, 'load' | 'save'>;
	/** Makes the autosave, not yet started. */
	readonly createAutosave: (options: PageAutosaveOptions) => Autosave;
	/** Adds the tool controls to the panel. */
	readonly createToolPanel: (
		options: ToolPanelOptions,
	) => Pick<ToolPanel, 'setHistoryState'>;
	/** Adds the view controls to the panel. */
	readonly createViewPanel: (
		options: ViewPanelOptions,
	) => Pick<ViewPanel, 'setSeaLevel'>;
	/**
	 * Adds the statistics readout to the panel and starts whatever computes
	 * the statistics.
	 */
	readonly createStatistics: (
		options: PageStatisticsOptions,
	) => Pick<RefreshScheduler, 'refresh' | 'reset'>;
	/** Opens the dialog that starts a new world. */
	readonly openNewWorldDialog: (options: NewWorldDialogOptions) => void;
	/** Gives the Earth's elevation data, for a world that starts as Earth. */
	readonly loadEarth: WorldSources['loadEarth'];
	/** Offers a world to the user as a file; may throw. */
	readonly exportWorld: (world: World) => void;
	/** Reads a file as a world, trusting nothing about it. */
	readonly importWorld: (file: Blob) => Promise<WorldFileResult>;
	/**
	 * Puts the panel and the globe out of reach of the mouse and the
	 * keyboard, or back within it.
	 */
	readonly setInert: (inert: boolean) => void;
	/** Whether a modal dialog is open, with the page behind it out of reach. */
	readonly isModalOpen: () => boolean;
	/** Has a listener hear of every key pressed anywhere on the page. */
	readonly onKeyDown: (listener: (event: ShortcutEvent) => void) => void;
	/**
	 * Has a listener called whenever the page is being hidden or closed and
	 * may never run again.
	 */
	readonly onPageHiding: (listener: () => void) => void;
	/** Records an error that the page carries on after. */
	readonly logError: (error: unknown) => void;
};

/**
 * Joins the parts of the page and starts it: on the saved world if there
 * is one, and otherwise on the dialog that starts a new world.
 *
 * @remarks
 * The parts are made in the order the panel shows them: the world
 * controls, the tools, the view controls and then the statistics.
 *
 * A world that replaces the one being edited reaches, in this order: the
 * sculpt controller, which ends a stroke still under way on the old world
 * and then has the history forget that world; the globe; the sea-level
 * control; the world's description; the statistics, which are first reset
 * and then asked for again; the panel's message, which is taken back; and
 * the autosave.
 *
 * Until the storage has answered, the panel, the globe and the history
 * shortcuts are out of reach and nothing is saved. A change made to the
 * blank world meanwhile would otherwise be saved over the saved world, or
 * be lost when that world arrives.
 *
 * @param parts - The parts to join.
 * @returns A promise that resolves once the page has started: the saved
 * world is in place or the dialog is open. Everything up to asking the
 * storage for the saved world is done before this returns.
 */
export const startPage = (parts: PageParts): Promise<void> => {
	const { state, globe, logError } = parts;
	globe.setWorld(state.world);
	const viewInput = parts.createViewInput(rotateButtonFor(DEFAULT_TOOL));
	// The history is cleared from the sculpt controller's own hook, so that
	// replacing the world through `sculpt.setWorld` can never leave the
	// strokes of the old one to be undone on the new.
	const sculpt = parts.createSculpt(state.world, {
		onStrokeEnd: (changes) => edits.commit(changes),
		onWorldChange: (next) => edits.setWorld(next),
	});
	const openDialog = (values: NewWorldValues, notice?: string): void => {
		// A stroke is driven by animation frames, which a modal dialog
		// does not stop, so one left under way would keep sculpting
		// behind the dialog.
		sculpt.endStroke();
		parts.openNewWorldDialog({
			values,
			createWorld: (choice) =>
				worldFromChoice(choice, { loadEarth: parts.loadEarth }),
			onWorld: state.replaceWorld,
			notice,
		});
	};
	const worldPanel = parts.createWorldPanel({
		description: describeWorld(state.world),
		onNewWorld: () => openDialog(newWorldValuesFor(state.world)),
		onExport: () => {
			try {
				parts.exportWorld(state.world);
				worldPanel.setMessage(null);
			} catch (error) {
				logError(error);
				worldPanel.setMessage(EXPORT_FAILED_MESSAGE);
			}
		},
		// As for the dialog: the browser's file chooser does not stop a
		// stroke either.
		onImportOpen: sculpt.endStroke,
		onImport: (file) =>
			void runImport(file, {
				read: parts.importWorld,
				onWorld: (world) => state.replaceWorld(world, { keepSettings: true }),
				showMessage: worldPanel.setMessage,
				logError,
			}),
	});
	// One connection for as long as the page lasts, which reading the saved
	// world opens. A save made as the page goes then needs no connection
	// opened first, which the page would not live to see.
	const store = parts.openStore();
	let saveFailureLogged = false;
	const autosave = parts.createAutosave({
		save: () => store.save(state.world),
		isBusy: sculpt.isStrokeActive,
		onState: worldPanel.setAutosaveState,
		onError: (error) => {
			// Once: a browser that refuses storage refuses every save.
			if (!saveFailureLogged) {
				saveFailureLogged = true;
				logError(error);
			}
		},
	});
	const tools = parts.createToolPanel({
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
			statistics.refresh();
			autosave.markChanged();
		},
		onHistoryChange: tools.setHistoryState,
	});
	/**
	 * Whether the page is still finding out what was saved before. Until it
	 * knows, the world on show is not to be changed.
	 */
	let starting = false;
	parts.onKeyDown((event) => {
		if (starting) {
			return;
		}
		// A modal dialog puts the page behind it out of reach, the terrain
		// included, whichever of the dialog's controls has the focus.
		if (!parts.isModalOpen()) {
			handleHistoryKey(event, edits.perform);
		}
	});
	const view = parts.createViewPanel({
		seaLevel: state.world.seaLevel,
		onExaggeration: globe.setExaggeration,
		onSeaLevel: (metres) => {
			const { world } = state;
			world.seaLevel = normaliseSeaLevel(metres);
			globe.setSeaLevel(world.seaLevel);
			statistics.refresh();
			autosave.markChanged();
		},
		onGridVisible: globe.setGridVisible,
	});
	const statistics = parts.createStatistics({
		currentWorld: () => state.world,
		isStrokeActive: sculpt.isStrokeActive,
	});
	statistics.refresh();

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
	// The figures on show are the old world's, and so are any still on
	// their way: neither is to be shown as the new world's.
	state.addListener(statistics.reset);
	state.addListener(statistics.refresh);
	// What the panel said of an earlier import or export is over with.
	state.addListener(() => worldPanel.setMessage(null));
	// The autosave takes no note of this until it is started, which is
	// after the world brought back when the page opens is in place.
	state.addListener(autosave.markChanged);

	// A page being hidden or closed may never run again, so what has not
	// been saved is saved now rather than when its wait is over.
	parts.onPageHiding(autosave.flush);

	/**
	 * Brings back the world that was saved, or opens the dialog that starts
	 * one: as it first opens if nothing was saved, and saying so if what
	 * was saved cannot be brought back.
	 */
	const restoreOrStart = async (): Promise<void> => {
		let read: StartupRead;
		starting = true;
		parts.setInert(true);
		try {
			read = { kind: 'loaded', outcome: await store.load() };
		} catch (error) {
			logError(error);
			read = { kind: 'failed' };
		} finally {
			// Before any dialog opens: it gives the focus back to the page
			// when it closes, which an inert page could not take.
			starting = false;
			parts.setInert(false);
		}
		if (read.kind === 'loaded' && read.outcome.kind === 'corrupt') {
			logError(`The saved world cannot be read: ${read.outcome.reason}`);
		}
		applyStartup(decideStartup(read), {
			replaceWorld: (world) =>
				state.replaceWorld(world, { keepSettings: true }),
			setAutosaveState: worldPanel.setAutosaveState,
			startAutosave: autosave.start,
			openDialog: ({ notice }) => openDialog(FIRST_NEW_WORLD_VALUES, notice),
			logError,
		});
	};
	return restoreOrStart();
};
