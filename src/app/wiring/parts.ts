/**
 * The parts of the page that `startPage` joins: what it asks of each, and
 * what it hands each part as it makes it.
 */

import type { MonthlyWind, World, WorldFileResult } from '../../core/index';
import type { AppState } from '../editing/appState';
import type { SculptController, SculptOptions } from '../editing/sculpt';
import type { ShortcutEvent } from '../editing/undo';
import type { RotateButton, ViewInput } from '../globe/input';
import type { Globe } from '../globe/renderer';
import type { LayerStore } from '../layers/layers';
import type { ObservedLoader } from '../layers/observedData';
import type {
	RefreshScheduler,
	TemperatureScheduler,
	WindsScheduler,
} from '../layers/refresh';
import type { ScalarObservedLoader } from '../layers/scalar';
import type { PageView, StoredView } from '../layers/view';
import type { Autosave, AutosaveOptions } from '../saving/autosave';
import type { WorldStore } from '../saving/storage';
import type { Preferences, ViewPreferences } from '../settings/preferences';
import type { ResolvedUnits, UnitOf } from '../settings/units';
import type { LayerPanel, ShownLayer, ShownWinds } from '../ui/layerPanel';
import type { ComparisonContent } from '../ui/main/comparison';
import type { CursorReadout } from '../ui/main/cursorReadout';
import type { LayerDock, LayerDockOptions } from '../ui/main/layerDock';
import type { PauseButtonOptions } from '../ui/main/pauseButton';
import type { Timeline, TimelineOptions } from '../ui/main/timeline';
import type { TopBar, TopBarOptions } from '../ui/main/topBar';
import type {
	NewWorldDialogOptions,
	WorldSources,
} from '../ui/panel/newWorldDialog';
import type { PlanetPanel, PlanetPanelOptions } from '../ui/panel/planetPanel';
import type {
	SettingsPanel,
	SettingsPanelOptions,
} from '../ui/panel/settingsPanel';
import type { StatsPanel } from '../ui/panel/statsPanel';
import type { ToolPanel, ToolPanelOptions } from '../ui/panel/toolPanel';
import type { ViewPanel, ViewPanelOptions } from '../ui/panel/viewPanel';
import type { WorldPanel, WorldPanelOptions } from '../ui/panel/worldPanel';

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
 * What the page's statistics are computed from, and the unit their heights
 * and depths are written in at first.
 */
export type PageStatsOptions = PageStatisticsOptions & {
	/** The unit heights and depths are written in at first. */
	readonly heightUnit: UnitOf<'height'>;
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
	/** The unit chosen for each quantity it starts on. */
	readonly units: ResolvedUnits;
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
	/** The unit each quantity is written in, at the time it is asked. */
	readonly units: () => ResolvedUnits;
};

/** The parts of a page, for `startPage` to join. */
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
	) => Pick<ToolPanel, 'setHistoryState' | 'setUnits'>;
	/** Adds the view controls to the panel. */
	readonly createViewPanel: (
		options: ViewPanelOptions,
	) => Pick<ViewPanel, 'setSeaLevel' | 'setHeightUnit'>;
	/**
	 * Adds the settings to the panel: how the winds are drawn and the
	 * units, and gives the way to show units chosen.
	 */
	readonly createSettingsPanel: (
		options: SettingsPanelOptions,
	) => Pick<SettingsPanel, 'showUnits'>;
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
	 * the statistics, and gives the way to write its heights in another
	 * unit.
	 */
	readonly createStatistics: (
		options: PageStatsOptions,
	) => Pick<RefreshScheduler, 'refresh' | 'reset'> &
		Pick<StatsPanel, 'setHeightUnit'>;
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
		| 'setUnits'
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
	 * world: the units, how the winds are drawn, and the view settings but
	 * the month and the source.
	 */
	readonly preferences: Pick<
		Preferences,
		| 'unitChoice'
		| 'setUnitSystem'
		| 'setUnitOverride'
		| 'windStyle'
		| 'setWindStyle'
	> &
		ViewPreferences;
	/** Opens the dialog that starts a new world. */
	readonly openNewWorldDialog: (options: NewWorldDialogOptions) => void;
	/** Opens the screen that lists the models' settings. */
	readonly openModelSettings: () => void;
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
	 * Puts the panel, the globe and the controls over it out of reach of the
	 * mouse and the keyboard, or back within it.
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
