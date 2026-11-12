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
	isMeasuredEarth,
	normaliseSeaLevel,
	type Resolution,
	sunColour,
	sunDirection,
	sunDrawnSize,
	type World,
	type WorldFileResult,
} from '../core/index';
import type { AppState } from './appState';
import type { Autosave, AutosaveOptions } from './autosave';
import type { RotateButton, ViewInput } from './globe/input';
import type { SunlightStyle } from './globe/material';
import type { Globe } from './globe/renderer';
import { createLayerStore, type LayerStore } from './layers';
import type { ObservedLoader } from './observedData';
import type { RefreshScheduler, TemperatureScheduler } from './refresh';
import {
	DEFAULT_TOOL,
	rotateButtonFor,
	type SculptController,
	type SculptOptions,
} from './sculpt';
import { applyStartup, decideStartup, type StartupRead } from './startup';
import type { WorldStore } from './storage';
import type { CursorReadout } from './ui/cursorReadout';
import { createDateLine } from './ui/dateLine';
import type { LayerPanel, ShownTemperature } from './ui/layerPanel';
import {
	FIRST_NEW_WORLD_VALUES,
	type NewWorldDialogOptions,
	type NewWorldValues,
	newWorldValuesFor,
	type WorldSources,
	worldFromChoice,
} from './ui/newWorldDialog';
import type { PlanetPanel, PlanetPanelOptions } from './ui/planetPanel';
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
import { DEFAULT_PAGE_VIEW, type Layer, type PageView } from './view';

/** What the page asks of its globe once the globe exists. */
export type PageGlobe = Pick<
	Globe,
	| 'setWorld'
	| 'setSeaLevel'
	| 'setExaggeration'
	| 'setGridVisible'
	| 'setSun'
	| 'setSunlight'
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

/** What the page's temperature is computed from, and where it is kept. */
export type PageTemperatureOptions = PageStatisticsOptions & {
	/** Where the temperature is kept, for whatever shows it to read. */
	readonly store: LayerStore;
};

/** What the Layers section shows, and what it switches on and off. */
export type PageLayerOptions = {
	/** Where the temperature is kept: the store the temperature writes. */
	readonly store: LayerStore;
	/** What calculates the temperature, told whether it is showing. */
	readonly temperature: Pick<TemperatureScheduler, 'setShowing'>;
	/** Called with the view settings whenever any of them changes. */
	readonly onView: (view: PageView) => void;
	/** Gives the observed temperature on a world's grid. */
	readonly loadObserved: ObservedLoader;
};

/** What the cursor readout reads of the page. */
export type PageReadoutOptions = PageStatisticsOptions & {
	/** What the globe shows of the temperature, at the time it is asked. */
	readonly shownTemperature: () => ShownTemperature | null;
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
	 * @param onCameraMove - To be called after each turn and zoom it makes.
	 */
	readonly createViewInput: (
		rotateButton: RotateButton,
		onCameraMove: () => void,
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
	/** Adds the planet controls to the panel. */
	readonly createPlanetPanel: (
		options: PlanetPanelOptions,
	) => Pick<PlanetPanel, 'setPlanet'>;
	/**
	 * Adds the statistics readout to the panel and starts whatever computes
	 * the statistics.
	 */
	readonly createStatistics: (
		options: PageStatisticsOptions,
	) => Pick<RefreshScheduler, 'refresh' | 'reset'>;
	/** Starts whatever computes the temperature, not yet showing. */
	readonly createTemperature: (
		options: PageTemperatureOptions,
	) => Pick<TemperatureScheduler, 'refresh' | 'reset' | 'setShowing'>;
	/**
	 * Adds the Layers section to the panel, which holds the view settings:
	 * what the globe is coloured by, and so whether the temperature is
	 * showing, and what of the temperature's year it shows. It starts on
	 * {@link DEFAULT_PAGE_VIEW}.
	 */
	readonly createLayerPanel: (
		options: PageLayerOptions,
	) => Pick<LayerPanel, 'newWorld' | 'setEarth' | 'setSunlight' | 'shown'>;
	/**
	 * Lays the cursor readout over the globe, hidden until the pointer is
	 * over it, and has it follow the pointer.
	 */
	readonly createCursorReadout: (
		options: PageReadoutOptions,
	) => Pick<CursorReadout, 'invalidate' | 'clear'>;
	/** Opens the dialog that starts a new world. */
	readonly openNewWorldDialog: (options: NewWorldDialogOptions) => void;
	/** Gives the Earth's elevation data, for a world that starts as Earth. */
	readonly loadEarth: WorldSources['loadEarth'];
	/**
	 * Gives the Earth's observed temperature on a world's grid, for the
	 * comparison on the measured Earth.
	 */
	readonly loadObserved: ObservedLoader;
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
 * How the globe is lit for a layer and the Sunlight setting. In Terrain
 * view the night side is darkened. In Temperature view the colours are
 * shaded as without the sun, since a darkened colour would read as another
 * temperature, and the line between day and night is drawn instead.
 *
 * @param layer - What the globe is coloured by.
 * @param sunlight - Whether the globe is lit by the sun.
 */
const sunlightStyleFor = (layer: Layer, sunlight: boolean): SunlightStyle => {
	if (!sunlight) {
		return 'off';
	}
	return layer === 'temperature' ? 'line' : 'darkened';
};

/**
 * Joins the parts of the page and starts it: on the saved world if there
 * is one, and otherwise on the dialog that starts a new world.
 *
 * @remarks
 * The parts are made in the order the panel shows them: the world
 * controls, the tools, the view controls, the planet controls, the layers
 * and then the statistics. The temperature, which has nothing of its own
 * in the panel, is made just before the layers, which switch it on and
 * off. The page opens on the height colours with the temperature not
 * showing, so nothing asks for the temperature until it is chosen.
 *
 * The date line under the world's description is written as soon as the
 * world controls are made, and follows the world's age and every change of
 * the view settings.
 *
 * The globe is given the sun, its direction, drawn size and colour for the
 * month on screen and the world's planet, once as it first shows the world
 * and once each time either changes: when the month on screen moves on, by
 * the slider or as the year plays, when the planet settings change, and
 * for each new world, once whether or not the new world moves the month
 * back to July. On a summary of the year the month stays as it was last on
 * screen, and so does the sun. The Sunlight control turns the globe's
 * sunlight on and off, and tells the layer panel, which shows the month
 * controls in Terrain view while it is on; a new world keeps it. While it
 * is on, the globe's night side is darkened when Terrain view is chosen,
 * and when Temperature view is chosen the line between day and night is
 * drawn instead, whether or not there is a temperature on the globe yet.
 * The globe is told how it is lit once for each change of that, by the
 * Sunlight control or by a change of layer.
 *
 * The cursor readout over the globe is made after the statistics, and reads
 * what the globe shows of the temperature from the layer panel. Besides
 * following the pointer, it looks again at what lies under a pointer held
 * still after each turn and zoom of the camera, each change of the terrain
 * or the sea level, each new world, each change of the view settings and
 * each change of the temperature store. Opening the New world dialog hides
 * it until the next pointer event on the canvas: a move, a press or a
 * release. Once the readout is made, the layer panel is told whether the
 * world the page opens on is the measured Earth.
 *
 * A world that replaces the one being edited reaches, in this order: the
 * sculpt controller, which ends a stroke still under way on the old world
 * and then has the history forget that world; the globe; the sea-level
 * control; the planet controls, which show the world's settings without
 * passing them on; the world's description; the statistics and then the
 * temperature, each first reset and then asked for again; the layer panel,
 * which stops the year playing, puts July back on screen and is told
 * whether the world is the measured Earth; the date line;
 * the panel's message, which is taken back; and the autosave. An edit of
 * the world, which is no new world, keeps the month on screen.
 *
 * A committed stroke, an undo, a redo and the sea-level control each ask
 * for the statistics and the temperature again, tell the layer panel
 * whether the world is still, or is again, the measured Earth, and mark
 * the world changed for the autosave. A change of the planet settings,
 * told through {@link AppState.notifyPlanetChange}, asks for the
 * temperature again, tells the layer panel the same and marks the world
 * changed; the statistics do not depend on it. Whether the world is the
 * measured Earth is worked out once for each of these, and once for each
 * new world, never during a stroke. The planet
 * controls make such a change through {@link AppState.setPlanet} at each
 * movement of a slider. A drag needs no wait of its own: the temperature
 * waits for the changes to stop, and stops a calculation a later change
 * overtakes. The planet settings are not part of the history: an undo puts
 * back the last stroke, whatever the planet controls did since.
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
	/**
	 * The world's resolution if it is the measured Earth, for the layer
	 * panel; null if it is not.
	 */
	const earthOf = (world: World): Resolution | null =>
		isMeasuredEarth(world) ? world.resolution : null;
	/** Tells the layer panel whether the world, changed, is the measured Earth. */
	const checkEarth = (): void => layerPanel.setEarth(earthOf(state.world));
	globe.setWorld(state.world);
	/** The month on screen, as the view settings last said. */
	let month = DEFAULT_PAGE_VIEW.month;
	/** How many times the sun has been placed, to place it once a world. */
	let sunPlaced = 0;
	/** Gives the globe the sun of the month on screen and the world's planet. */
	const placeSun = (): void => {
		const settings = state.world.planet;
		globe.setSun(
			sunDirection(month, settings),
			sunDrawnSize(settings),
			sunColour(settings),
		);
		sunPlaced++;
	};
	placeSun();
	/** What the globe is coloured by, as the view settings last said. */
	let layer = DEFAULT_PAGE_VIEW.layer;
	/** How the globe is lit, as it was last told; it starts unlit. */
	let sunlightStyle: SunlightStyle = 'off';
	/** Tells the globe how it is lit, if that has changed. */
	const lightGlobe = (sunlight: boolean): void => {
		const next = sunlightStyleFor(layer, sunlight);
		if (next !== sunlightStyle) {
			sunlightStyle = next;
			globe.setSunlight(next);
		}
	};
	const viewInput = parts.createViewInput(rotateButtonFor(DEFAULT_TOOL), () =>
		readout.invalidate(),
	);
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
		// behind the dialog. The readout goes too: the canvas no longer
		// hears the pointer, so it would not hear it leave.
		sculpt.endStroke();
		readout.clear();
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
	const date = createDateLine({
		years: state.world.ageYears,
		view: DEFAULT_PAGE_VIEW,
		show: worldPanel.setDate,
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
			temperature.refresh();
			checkEarth();
			autosave.markChanged();
			readout.invalidate();
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
			temperature.refresh();
			checkEarth();
			autosave.markChanged();
			readout.invalidate();
		},
		onGridVisible: globe.setGridVisible,
		onSunlight: (on) => {
			lightGlobe(on);
			layerPanel.setSunlight(on);
		},
	});
	const planet = parts.createPlanetPanel({
		planet: state.world.planet,
		onChange: state.setPlanet,
	});
	// A part that shows the temperature and fails on a change is recorded
	// here, and the edit that made the change carries on regardless.
	const layers = createLayerStore(logError);
	const temperature = parts.createTemperature({
		currentWorld: () => state.world,
		isStrokeActive: sculpt.isStrokeActive,
		store: layers,
	});
	const layerPanel = parts.createLayerPanel({
		store: layers,
		temperature,
		onView: (next) => {
			date.setView(next);
			layer = next.layer;
			lightGlobe(next.sunlight);
			if (next.month !== month) {
				month = next.month;
				placeSun();
			}
			readout.invalidate();
		},
		loadObserved: parts.loadObserved,
	});
	const statistics = parts.createStatistics({
		currentWorld: () => state.world,
		isStrokeActive: sculpt.isStrokeActive,
	});
	statistics.refresh();
	const readout = parts.createCursorReadout({
		currentWorld: () => state.world,
		isStrokeActive: sculpt.isStrokeActive,
		shownTemperature: layerPanel.shown,
	});
	// Told after the layer panel, which brings what the globe shows up to
	// date first.
	layers.addListener(() => readout.invalidate());
	// The world the page opens on reaches no listener of a new world, so
	// the layer panel is told of it here, once every part it tells is made.
	checkEarth();

	// What a new world reaches, in this order. The sculpt controller goes
	// first: it ends a stroke still under way while the globe and the
	// history are on the world the stroke was made on, and then has the
	// history forget that world. The globe takes its sea level from the
	// world, which by now is back at the default, or is the world's own
	// if the world was imported or restored.
	state.addListener(sculpt.setWorld);
	state.addListener(globe.setWorld);
	state.addListener((world) => view.setSeaLevel(world.seaLevel));
	state.addListener((world) => planet.setPlanet(world.planet));
	state.addListener((world) => worldPanel.setDescription(describeWorld(world)));
	// The figures on show are the old world's, and so are any still on
	// their way: neither is to be shown as the new world's.
	state.addListener(statistics.reset);
	state.addListener(statistics.refresh);
	// The temperature on hand is the old world's, and is not where the new
	// world's solve starts from.
	state.addListener(temperature.reset);
	state.addListener(temperature.refresh);
	// The month on screen is the view's, but a new world starts again from
	// July and from the simulated temperature, after the store has dropped
	// the old world's result so that the old result is not shown for July
	// on the way. The sun is placed for the new world's planet, by the
	// layer panel's change of month if there was one and here otherwise.
	// The date line then has the new world's age with that month.
	state.addListener((world) => {
		const placed = sunPlaced;
		layerPanel.newWorld(earthOf(world));
		if (sunPlaced === placed) {
			placeSun();
		}
	});
	state.addListener((world) => date.setYears(world.ageYears));
	state.addListener(() => readout.invalidate());
	// What the panel said of an earlier import or export is over with.
	state.addListener(() => worldPanel.setMessage(null));
	// The autosave takes no note of this until it is started, which is
	// after the world brought back when the page opens is in place.
	state.addListener(autosave.markChanged);
	// The planet settings are saved with the world, and the temperature
	// depends on them.
	state.addPlanetListener(() => {
		placeSun();
		temperature.refresh();
		checkEarth();
		autosave.markChanged();
	});

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
