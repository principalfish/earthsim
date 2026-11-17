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
	type MonthlyWind,
	normaliseSeaLevel,
	type Resolution,
	sunColour,
	sunDirection,
	sunDrawnSize,
	TEMPERATURE_SETTINGS,
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
import {
	type Preferences,
	storedView,
	storeView,
	type ViewPreferences,
} from './preferences';
import type {
	RefreshScheduler,
	TemperatureScheduler,
	WindsScheduler,
} from './refresh';
import { type ScalarObservedLoader, scalarLayerOf } from './scalarLayer';
import {
	DEFAULT_TOOL,
	rotateButtonFor,
	type SculptController,
	type SculptOptions,
} from './sculpt';
import { applyStartup, decideStartup, type StartupRead } from './startup';
import type { WorldStore } from './storage';
import type { ComparisonContent } from './ui/comparison';
import type { CursorReadout } from './ui/cursorReadout';
import { createDateLine } from './ui/dateLine';
import type { LayerDock, LayerDockOptions } from './ui/layerDock';
import type { LayerPanel, ShownLayer, ShownWinds } from './ui/layerPanel';
import {
	FIRST_NEW_WORLD_VALUES,
	type NewWorldDialogOptions,
	type NewWorldValues,
	newWorldValuesFor,
	type WorldSources,
	worldFromChoice,
} from './ui/newWorldDialog';
import type { PauseButtonOptions } from './ui/pauseButton';
import type { PlanetPanel, PlanetPanelOptions } from './ui/planetPanel';
import type { Timeline, TimelineOptions } from './ui/timeline';
import type { ToolPanel, ToolPanelOptions } from './ui/toolPanel';
import type { TopBar, TopBarOptions } from './ui/topBar';
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
import {
	DEFAULT_PAGE_VIEW,
	type Layer,
	type PageView,
	type StoredView,
} from './view';
import type { WindUnit } from './windUnits';

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
	| 'setWindStyle'
	| 'setPageVisible'
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

/**
 * What the page's temperature, or its winds, are computed from, and where
 * they are kept.
 */
export type PageTemperatureOptions = PageStatisticsOptions & {
	/**
	 * Where the temperature and the winds are kept, for whatever shows them
	 * to read.
	 */
	readonly store: LayerStore;
};

/**
 * What the layer panel is given: where the results are kept, the observed
 * data and whom to tell of the view and the comparison. The dock's tiles
 * and the top bar choose what is shown, and the timeline the month on
 * screen and whether the year plays.
 */
export type PageLayerOptions = {
	/**
	 * The view settings it starts on, as the preferences remember them; the
	 * month and the source start as on a first visit.
	 */
	readonly start: StoredView;
	/**
	 * Where the temperature and the winds are kept: the store their
	 * calculations write.
	 */
	readonly store: LayerStore;
	/**
	 * Called with the view settings, and whether the year is playing,
	 * whenever any of them changes.
	 */
	readonly onView: (view: PageView, playing: boolean) => void;
	/** Gives a layer's observed year on a world's grid. */
	readonly loadObserved: ScalarObservedLoader;
	/** Gives the observed winds on a world's grid. */
	readonly loadObservedWinds: ObservedLoader<MonthlyWind>;
	/**
	 * Called with what the comparison control offers, the source chosen and
	 * the line under it, for the top bar to show.
	 */
	readonly onComparison: (content: ComparisonContent) => void;
};

/** What the cursor readout reads of the page. */
export type PageReadoutOptions = PageStatisticsOptions & {
	/** What the globe shows of a computed layer, at the time it is asked. */
	readonly shownLayer: () => ShownLayer | null;
	/** What the globe shows of the winds, at the time it is asked. */
	readonly shownWinds: () => ShownWinds | null;
	/** The unit wind speeds are written in, at the time it is asked. */
	readonly windUnit: () => WindUnit;
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
	readonly createWorldPanel: (options: WorldPanelOptions) => WorldPanel;
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
	 * Lays the dock over the globe, whose tiles choose the layer and switch
	 * the winds, the sunlight and the cell grid.
	 */
	readonly createLayerDock: (
		options: LayerDockOptions,
	) => Pick<LayerDock, 'showView'>;
	/**
	 * Lays the top bar over the globe, beside the dock, whose controls
	 * choose the view of the year of the layer on screen and, on the
	 * measured Earth, where the layer and the winds come from.
	 */
	readonly createTopBar: (
		options: TopBarOptions,
	) => Pick<TopBar, 'showView' | 'showComparison'>;
	/**
	 * Lays the timeline over the globe, along the bottom beside the dock,
	 * whose slider chooses the month on screen and whose button plays the
	 * year.
	 */
	readonly createTimeline: (
		options: TimelineOptions,
	) => Pick<Timeline, 'showView'>;
	/**
	 * Lays the Pause button in the corner over the globe, which pauses the
	 * calculation of the temperature and the winds and resumes it.
	 */
	readonly createPauseButton: (options: PauseButtonOptions) => void;
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
	/** Starts whatever computes the temperature, running. */
	readonly createTemperature: (
		options: PageTemperatureOptions,
	) => Pick<
		TemperatureScheduler,
		'refresh' | 'refreshNow' | 'reset' | 'setRunning'
	>;
	/**
	 * Starts whatever computes the winds from the temperature, running, on
	 * the store the temperature writes.
	 */
	readonly createWinds: (
		options: PageTemperatureOptions,
	) => Pick<WindsScheduler, 'refresh' | 'reset' | 'setRunning'>;
	/**
	 * Adds the layer controls to the panel, which hold the view settings:
	 * what the globe is coloured by, as the dock chooses it, what of each
	 * computed layer's year it shows and where the layer and the winds come
	 * from, as the top bar chooses them, and the month on screen and whether
	 * the year plays, as the timeline chooses them, and whether the cell
	 * grid is drawn. It starts on the view settings it is given.
	 */
	readonly createLayerPanel: (
		options: PageLayerOptions,
	) => Pick<
		LayerPanel,
		| 'newWorld'
		| 'setEarth'
		| 'setLayer'
		| 'setSummary'
		| 'setSource'
		| 'setSunlight'
		| 'setWinds'
		| 'setGrid'
		| 'setMonth'
		| 'togglePlaying'
		| 'setPaused'
		| 'shown'
		| 'shownWinds'
	>;
	/**
	 * Lays the cursor readout over the globe, hidden until the pointer is
	 * over it, and has it follow the pointer.
	 */
	readonly createCursorReadout: (
		options: PageReadoutOptions,
	) => Pick<CursorReadout, 'invalidate' | 'clear'>;
	/**
	 * The page's preferences, remembered by the browser apart from the
	 * world: the unit wind speeds are written in, how the winds are drawn,
	 * and the view settings but the month and the source.
	 */
	readonly preferences: Pick<
		Preferences,
		'windSpeedUnit' | 'setWindSpeedUnit' | 'windStyle' | 'setWindStyle'
	> &
		ViewPreferences;
	/** Opens the dialog that starts a new world. */
	readonly openNewWorldDialog: (options: NewWorldDialogOptions) => void;
	/** Gives the Earth's elevation data, for a world that starts as Earth. */
	readonly loadEarth: WorldSources['loadEarth'];
	/**
	 * Gives a layer's observed year of the Earth on a world's grid, such as
	 * the temperature's, for the comparison on the measured Earth.
	 */
	readonly loadObserved: ScalarObservedLoader;
	/**
	 * Gives the Earth's observed winds on a world's grid, for the wind
	 * arrows on the measured Earth.
	 */
	readonly loadObservedWinds: ObservedLoader<MonthlyWind>;
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
	/**
	 * Has a listener called with whether the page is visible, rather than in
	 * a hidden tab: at once, and whenever that changes.
	 */
	readonly onPageVisibility: (listener: (visible: boolean) => void) => void;
	/** Records an error that the page carries on after. */
	readonly logError: (error: unknown) => void;
};

/**
 * How the globe is lit for a layer and the Sunlight setting. In Terrain
 * view the night side is darkened. On a computed layer it is lit as the
 * layer's description says: in Temperature view the colours are shaded as
 * without the sun, since a darkened colour would read as another
 * temperature, and the line between day and night is drawn instead.
 *
 * @param layer - What the globe is coloured by.
 * @param sunlight - Whether the globe is lit by the sun.
 */
const sunlightStyleFor = (layer: Layer, sunlight: boolean): SunlightStyle => {
	if (!sunlight) {
		return 'off';
	}
	return scalarLayerOf(layer)?.sunlightStyle ?? 'darkened';
};

/**
 * Joins the parts of the page and starts it: on the saved world if there
 * is one, and otherwise on the dialog that starts a new world.
 *
 * @remarks
 * The panel's sections are in place before the page starts, in the order
 * the panel shows them, so the parts that fill them can be made in an
 * order of their own: the world controls, the tools, the view controls,
 * the dock, the top bar and the timeline over the globe, the planet
 * controls, the layers and then the statistics. The dock, the top bar and
 * the timeline are shown each change of the view settings the layer panel
 * reports, the timeline with whether the year is playing. The dock's Grid
 * tile goes straight to the globe, and tells the layer panel, which holds
 * it with the rest of the view settings. The dock and the layer panel are
 * given no list of layers, so both offer every layer in `SCALAR_LAYERS`.
 * The temperature and then the winds, which have nothing of their own in
 * the panel, are made just before the layers.
 *
 * The temperature and the winds are worked out whatever is on screen:
 * the temperature after every change of the world, and the winds from
 * each current temperature, so the page opens on whatever layer it was
 * left on with both being worked out. The dock's Winds tile tells the
 * layer panel, which shows the winds on the globe, and offers the month in
 * Terrain view, while it is on; a new world keeps it.
 *
 * The Pause button, made after the layers, stops both: pressed, the
 * temperature and then the winds are told to stop running, so a request
 * waiting to be made is cancelled and a solve under way is left to
 * finish, and the layer panel is told, for the info box to say so;
 * released, the temperature and then the winds run again, each catching up
 * at once with the changes made meanwhile, and the layer panel is told.
 * The page always opens with it released.
 *
 * The date line under the world's description is written as soon as the
 * world controls are made, and follows the world's age and every change of
 * the view settings.
 *
 * The globe is given the sun, its direction, drawn size and colour for the
 * month on screen and the world's planet, once as it first shows the world
 * and once each time either changes: when the month on screen moves on, by
 * the timeline or as the year plays, when the planet settings change, and
 * for each new world, once whether or not the new world moves the month
 * back to July. On a summary of the year the month stays as it was last on
 * screen, and so does the sun. The dock's Sunlight tile turns the globe's
 * sunlight on and off, and tells the layer panel, which offers the month in
 * Terrain view while it is on; a new world keeps it. While it
 * is on, the globe's night side is darkened when Terrain view is chosen,
 * and when Temperature view is chosen the line between day and night is
 * drawn instead, whether or not there is a temperature on the globe yet.
 * The globe is told how it is lit once for each change of that, by the
 * Sunlight tile or by a change of layer. Nothing the page does opens or
 * closes a section of the side panel: switching the sunlight or the winds
 * on or off, and a new, imported or restored world, leave every section as
 * it is.
 *
 * The cursor readout over the globe is made after the statistics, and reads
 * what the globe shows of the temperature and of the winds from the layer
 * panel. Besides following the pointer, it looks again at what lies under
 * a pointer held still after each turn and zoom of the camera, each change
 * of the terrain or the sea level, each new world, each change of the view
 * settings, the Winds tile's included, each change of the store of the
 * temperature and the winds, and each change of the wind speed unit.
 * Opening the New world dialog hides the readout until the next pointer
 * event on the canvas: a move, a press or a release. Once the readout is
 * made, the layer panel is told whether the world the page opens on is the
 * measured Earth.
 *
 * The unit wind speeds are written in is a preference of the browser, not
 * part of the world: it is read once, as the page starts, and the view
 * controls and the readout start in it. A unit chosen in the view controls
 * is remembered by the preferences, and reaches the readout at once. It is
 * never saved with the world.
 *
 * So is how the winds are drawn, as arrows or as streaks: read once as the
 * page starts, the globe is told it before the view controls are made, and
 * the view controls start in it. A way chosen in the view controls is
 * remembered by the preferences, and reaches the globe at once. Winds itself
 * starts as the view settings remember it. The globe is also told whether
 * the page is visible, as the page starts and at each change, so that
 * streaks move only while it is.
 *
 * The view controls' choice of where the wind arrows come from goes to the
 * layer panel, which decides when it is offered, on the measured Earth, and
 * tells the view controls so, with the source it has, each time it shows
 * the view settings; its change of the arrows reaches the readout as any
 * change of the view settings does.
 *
 * A world that replaces the one being edited reaches, in this order: the
 * sculpt controller, which ends a stroke still under way on the old world
 * and then has the history forget that world; the globe; the sea-level
 * control; the planet controls, which show the world's settings without
 * passing them on; the world's description; the statistics, reset and
 * then asked for again; the temperature and then the winds, each reset;
 * the layer panel, which stops the year playing, puts July back on screen
 * and is told whether the world is the measured Earth; the date line; the
 * panel's message, which is taken back; the autosave; and last the
 * temperature again, asked for at once unless paused, with no wait, once
 * every part before it is on the new world. The winds are asked for again
 * by the temperature's next result. An edit of the world, which is no new
 * world, keeps the month on screen.
 *
 * A committed stroke, an undo, a redo and the sea-level control each ask
 * for the statistics and the temperature again, tell the layer panel
 * whether the world is still, or is again, the measured Earth, and mark
 * the world changed for the autosave; the winds follow from the
 * temperature's next result. A change of the planet settings, which
 * {@link AppState.setPlanet} tells the planet listeners of, asks for the
 * temperature again, tells the layer panel the same and marks the world
 * changed; the statistics do not depend on it. A change of the day length
 * alone, which the temperature does not depend on, asks for the winds
 * again instead and never for the temperature; a change of several
 * settings that includes any other goes to the temperature. Whether the
 * world is the measured Earth is worked out once for each of these, and
 * once for each new world, never during a stroke. The planet
 * controls make such a change through {@link AppState.setPlanet} at each
 * movement of a slider. A drag needs no wait of its own: the temperature
 * waits for the changes to stop, and stops a calculation a later change
 * overtakes. The planet settings are not part of the history: an undo puts
 * back the last stroke, whatever the planet controls did since.
 *
 * The view settings but the month and the source are preferences of the
 * browser too: read once, as the page starts and before any part that
 * shows them is made, so that the dock, the top bar, the timeline, the
 * date line and the layer panel all start on them, and the globe is told
 * how it is lit and whether the cell grid is drawn before anything else
 * is made. Each change of them the layer panel reports is remembered by
 * the preferences, one entry for each setting that changed; the month and
 * the source are never written. A new world keeps them.
 *
 * Until the storage has answered, the panel, the globe and the history
 * shortcuts are out of reach and nothing is saved. A change made to the
 * blank world meanwhile would otherwise be saved over the saved world, or
 * be lost when that world arrives. Nor is the temperature asked for until
 * then: the world brought back is asked for as any new world is, and the
 * blank world, when the page stays on it, once the storage has answered.
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
	/** The view settings the browser remembers, as last read or written. */
	let stored = storedView(parts.preferences);
	/**
	 * The view settings the page starts on: those the browser remembers,
	 * with the month and the source of a first visit.
	 */
	const startView: PageView = {
		...DEFAULT_PAGE_VIEW,
		...stored,
	};
	/** The month on screen, as the view settings last said. */
	let month = startView.month;
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
	let layer = startView.layer;
	/** How the globe is lit, as it was last told; the globe starts unlit. */
	let sunlightStyle: SunlightStyle = 'off';
	/** Tells the globe how it is lit, if that has changed. */
	const lightGlobe = (sunlight: boolean): void => {
		const next = sunlightStyleFor(layer, sunlight);
		if (next !== sunlightStyle) {
			sunlightStyle = next;
			globe.setSunlight(next);
		}
	};
	lightGlobe(startView.sunlight);
	globe.setGridVisible(startView.grid);
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
		view: startView,
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
	/** The unit wind speeds are written in, as last chosen. */
	let windUnit = parts.preferences.windSpeedUnit();
	/** How the winds are drawn as the page starts, as last chosen. */
	const windStyle = parts.preferences.windStyle();
	globe.setWindStyle(windStyle);
	const view = parts.createViewPanel({
		seaLevel: state.world.seaLevel,
		windUnit,
		windStyle,
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
		onWindStyle: (style) => {
			parts.preferences.setWindStyle(style);
			globe.setWindStyle(style);
		},
		onWindUnit: (unit) => {
			windUnit = unit;
			parts.preferences.setWindSpeedUnit(unit);
			readout.invalidate();
		},
	});
	const dock = parts.createLayerDock({
		view: startView,
		onLayer: (next) => layerPanel.setLayer(next),
		onWinds: (on) => layerPanel.setWinds(on),
		onSunlight: (on) => {
			lightGlobe(on);
			layerPanel.setSunlight(on);
		},
		onGrid: (on) => {
			globe.setGridVisible(on);
			layerPanel.setGrid(on);
		},
	});
	const topBar = parts.createTopBar({
		view: startView,
		onSummary: (id, summary) => layerPanel.setSummary(id, summary),
		onSource: (source) => layerPanel.setSource(source),
	});
	const timeline = parts.createTimeline({
		view: startView,
		onMonth: (next) => layerPanel.setMonth(next),
		onPlay: () => layerPanel.togglePlaying(),
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
	const winds = parts.createWinds({
		currentWorld: () => state.world,
		isStrokeActive: sculpt.isStrokeActive,
		store: layers,
	});
	const layerPanel = parts.createLayerPanel({
		start: stored,
		store: layers,
		onView: (next, playing) => {
			storeView(parts.preferences, stored, next);
			stored = next;
			dock.showView(next);
			topBar.showView(next);
			timeline.showView(next, playing);
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
		loadObservedWinds: parts.loadObservedWinds,
		onComparison: topBar.showComparison,
	});
	parts.createPauseButton({
		onPause: (paused) => {
			temperature.setRunning(!paused);
			winds.setRunning(!paused);
			layerPanel.setPaused(paused);
		},
	});
	const statistics = parts.createStatistics({
		currentWorld: () => state.world,
		isStrokeActive: sculpt.isStrokeActive,
	});
	statistics.refresh();
	const readout = parts.createCursorReadout({
		currentWorld: () => state.world,
		isStrokeActive: sculpt.isStrokeActive,
		shownLayer: layerPanel.shown,
		shownWinds: layerPanel.shownWinds,
		windUnit: () => windUnit,
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
	// world's solve starts from. It is asked for again below, last.
	state.addListener(temperature.reset);
	// So are the winds on hand and any on their way; the new world's
	// temperature asks for its winds when it comes.
	state.addListener(winds.reset);
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
	// The new world's temperature is asked for last, once every part above
	// is on the new world, and at once: a new world is whole when it
	// arrives, with no run of changes to wait out, and a wait would leave
	// the layers reading as not calculated until it ended.
	state.addListener(temperature.refreshNow);
	/**
	 * The planet settings as the planet listener last saw them, to tell a
	 * change of the day length alone from one the temperature depends on.
	 */
	let planetSeen = { ...state.world.planet };
	state.addListener((world) => {
		planetSeen = { ...world.planet };
	});
	// The planet settings are saved with the world, and the temperature
	// depends on all of them but the day length, which the winds alone read.
	// A change the temperature depends on reaches the winds through the
	// temperature's next result.
	state.addPlanetListener((world) => {
		placeSun();
		const forTemperature = TEMPERATURE_SETTINGS.some(
			(name) => world.planet[name] !== planetSeen[name],
		);
		planetSeen = { ...world.planet };
		if (forTemperature) {
			temperature.refresh();
		} else {
			winds.refresh();
		}
		checkEarth();
		autosave.markChanged();
	});

	// A page being hidden or closed may never run again, so what has not
	// been saved is saved now rather than when its wait is over.
	parts.onPageHiding(autosave.flush);
	// Streaks move only on a page that can be seen.
	parts.onPageVisibility(globe.setPageVisible);

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
		const blank = state.world;
		applyStartup(decideStartup(read), {
			replaceWorld: (world) =>
				state.replaceWorld(world, { keepSettings: true }),
			setAutosaveState: worldPanel.setAutosaveState,
			startAutosave: autosave.start,
			openDialog: ({ notice }) => openDialog(FIRST_NEW_WORLD_VALUES, notice),
			logError,
		});
		// A world brought back has been asked for as a new world is; the
		// blank one the page stays on otherwise is asked for here, as any
		// other world is.
		if (state.world === blank) {
			temperature.refreshNow();
		}
	};
	return restoreOrStart();
};
