/**
 * The page's preferences, remembered by the browser from one visit of the
 * page to the next: the unit wind speeds are written in, whether the
 * winds are drawn as arrows or as streaks, and the view settings of a
 * {@link StoredView}: the layer, each computed layer's view of its year,
 * and whether the sunlight, the winds and the cell grid are on. The month
 * on screen and the source are not among them.
 *
 * Like which sections are open, a preference is a setting of the browser,
 * not of the world: it is kept apart from the saved world, never goes into
 * a world file, and a new, imported or restored world leaves it as it is.
 */

import {
	DEFAULT_WIND_STYLE,
	isWindStyle,
	type WindStyle,
} from './globe/windMotion';
import type { PanelStorage } from './panelMemory';
import { offersSummary, SCALAR_LAYER_SPECS } from './scalarLayer';
import {
	DEFAULT_LAYER,
	DEFAULT_SUMMARY,
	isLayer,
	isSummary,
	type Layer,
	SCALAR_LAYER_IDS,
	type ScalarLayerId,
	type StoredView,
	type Summary,
} from './view';
import { DEFAULT_WIND_UNIT, isWindUnit, type WindUnit } from './windUnits';

/** The name of the wind speed unit's entry in the storage. */
export const WIND_SPEED_UNIT_KEY = 'earth_sim.preference.windSpeedUnit';

/** The name of the entry for how the winds are drawn, in the storage. */
export const WIND_STYLE_KEY = 'earth_sim.preference.windStyle';

/** The name of the layer's entry in the storage. */
export const LAYER_KEY = 'earth_sim.preference.layer';

/**
 * The name of the entry for a computed layer's view of its year in the
 * storage, such as `earth_sim.preference.temperatureSummary`.
 *
 * @param layer - The layer.
 */
export const summaryKey = (layer: ScalarLayerId): string =>
	`earth_sim.preference.${layer}Summary`;

/** The name of the entry for whether the globe is lit by the sun. */
export const SUNLIGHT_KEY = 'earth_sim.preference.sunlight';

/** The name of the entry for whether the winds are shown. */
export const WINDS_KEY = 'earth_sim.preference.winds';

/** The name of the entry for whether the cell grid is drawn. */
export const GRID_KEY = 'earth_sim.preference.grid';

/** What the entry of a toggle that is on holds. */
export const ON_ENTRY = 'true';

/** What the entry of a toggle that is off holds. */
export const OFF_ENTRY = 'false';

/** The preferences, as the browser remembers them. */
export type Preferences = {
	/**
	 * The unit wind speeds are written in: the one last chosen, or
	 * {@link DEFAULT_WIND_UNIT} when there is nothing to go by: no storage,
	 * storage that throws, an entry missing, or one that holds anything but
	 * one of the units.
	 */
	windSpeedUnit(): WindUnit;
	/**
	 * Remembers the unit wind speeds are written in. Storage that is missing
	 * or will not take it is left as it is, without an error.
	 *
	 * @param unit - The unit chosen.
	 */
	setWindSpeedUnit(unit: WindUnit): void;
	/**
	 * How the winds are drawn: as last chosen, or {@link DEFAULT_WIND_STYLE},
	 * arrows, when there is nothing to go by: no storage, storage that
	 * throws, an entry missing, or one that holds anything but one of the
	 * ways.
	 */
	windStyle(): WindStyle;
	/**
	 * Remembers how the winds are drawn. Storage that is missing or will not
	 * take it is left as it is, without an error.
	 *
	 * @param style - The way chosen.
	 */
	setWindStyle(style: WindStyle): void;
	/**
	 * What the globe is coloured by: as last chosen, or
	 * {@link DEFAULT_LAYER}, Terrain, when there is nothing to go by: no
	 * storage, storage that throws, an entry missing, or one that holds
	 * anything but one of the layers.
	 */
	layer(): Layer;
	/**
	 * Remembers what the globe is coloured by. Storage that is missing or
	 * will not take it is left as it is, without an error.
	 *
	 * @param layer - The layer chosen.
	 */
	setLayer(layer: Layer): void;
	/**
	 * What of its year a computed layer shows: as last chosen for that
	 * layer, or {@link DEFAULT_SUMMARY}, the Month view, when there is
	 * nothing to go by: no storage, storage that throws, an entry missing,
	 * or one that holds anything but a view of the year the layer offers.
	 *
	 * @param layer - The layer.
	 */
	summary(layer: ScalarLayerId): Summary;
	/**
	 * Remembers what of its year a computed layer shows, apart from every
	 * other layer's. Storage that is missing or will not take it is left as
	 * it is, without an error.
	 *
	 * @param layer - The layer.
	 * @param summary - The view of its year chosen.
	 */
	setSummary(layer: ScalarLayerId, summary: Summary): void;
	/**
	 * Whether the globe is lit by the sun: as last chosen, or off when
	 * there is nothing to go by: no storage, storage that throws, an entry
	 * missing, or one that holds anything but {@link ON_ENTRY} or
	 * {@link OFF_ENTRY}.
	 */
	sunlight(): boolean;
	/**
	 * Remembers whether the globe is lit by the sun. Storage that is
	 * missing or will not take it is left as it is, without an error.
	 *
	 * @param on - Whether it is.
	 */
	setSunlight(on: boolean): void;
	/** Whether the winds are shown, read as {@link Preferences.sunlight} is. */
	winds(): boolean;
	/**
	 * Remembers whether the winds are shown, as
	 * {@link Preferences.setSunlight} does the sunlight.
	 *
	 * @param on - Whether they are.
	 */
	setWinds(on: boolean): void;
	/** Whether the cell grid is drawn, read as {@link Preferences.sunlight} is. */
	grid(): boolean;
	/**
	 * Remembers whether the cell grid is drawn, as
	 * {@link Preferences.setSunlight} does the sunlight.
	 *
	 * @param on - Whether it is.
	 */
	setGrid(on: boolean): void;
};

/**
 * Reads an entry of the storage, or null for none, for no storage and for
 * storage that throws.
 */
const readEntry = (
	storage: PanelStorage | null | undefined,
	key: string,
): string | null => {
	try {
		return storage?.getItem(key) ?? null;
	} catch {
		return null;
	}
};

/**
 * Writes an entry of the storage, doing nothing with no storage, and
 * nothing more with storage that throws: the choice then lasts for this
 * visit only.
 */
const writeEntry = (
	storage: PanelStorage | null | undefined,
	key: string,
	value: string,
): void => {
	try {
		storage?.setItem(key, value);
	} catch {
		// Not remembered.
	}
};

/** Reads a toggle's entry: on for {@link ON_ENTRY} alone. */
const readToggle = (
	storage: PanelStorage | null | undefined,
	key: string,
): boolean => readEntry(storage, key) === ON_ENTRY;

/** Writes a toggle's entry. */
const writeToggle = (
	storage: PanelStorage | null | undefined,
	key: string,
	on: boolean,
): void => writeEntry(storage, key, on ? ON_ENTRY : OFF_ENTRY);

/**
 * Makes the preferences, kept in the browser's storage as one small entry
 * each.
 *
 * @remarks
 * Nothing about the storage ever stops the page: with no storage at all,
 * storage that throws on reading or on writing, or an entry it cannot
 * read, each preference is as on a first visit.
 *
 * @param storage - The storage, as the panel memory's `reachStorage`
 * reaches it, or null or undefined for none.
 */
export const createPreferences = (
	storage: PanelStorage | null | undefined,
): Preferences => ({
	windSpeedUnit: () => {
		const entry = readEntry(storage, WIND_SPEED_UNIT_KEY);
		return isWindUnit(entry) ? entry : DEFAULT_WIND_UNIT;
	},
	setWindSpeedUnit: (unit) => writeEntry(storage, WIND_SPEED_UNIT_KEY, unit),
	windStyle: () => {
		const entry = readEntry(storage, WIND_STYLE_KEY);
		return isWindStyle(entry) ? entry : DEFAULT_WIND_STYLE;
	},
	setWindStyle: (style) => writeEntry(storage, WIND_STYLE_KEY, style),
	layer: () => {
		const entry = readEntry(storage, LAYER_KEY);
		return isLayer(entry) ? entry : DEFAULT_LAYER;
	},
	setLayer: (layer) => writeEntry(storage, LAYER_KEY, layer),
	summary: (layer) => {
		const entry = readEntry(storage, summaryKey(layer));
		return isSummary(entry) && offersSummary(SCALAR_LAYER_SPECS[layer], entry)
			? entry
			: DEFAULT_SUMMARY;
	},
	setSummary: (layer, summary) =>
		writeEntry(storage, summaryKey(layer), summary),
	sunlight: () => readToggle(storage, SUNLIGHT_KEY),
	setSunlight: (on) => writeToggle(storage, SUNLIGHT_KEY, on),
	winds: () => readToggle(storage, WINDS_KEY),
	setWinds: (on) => writeToggle(storage, WINDS_KEY, on),
	grid: () => readToggle(storage, GRID_KEY),
	setGrid: (on) => writeToggle(storage, GRID_KEY, on),
});

/** What of the preferences holds the view settings the browser remembers. */
export type ViewPreferences = Pick<
	Preferences,
	| 'layer'
	| 'setLayer'
	| 'summary'
	| 'setSummary'
	| 'sunlight'
	| 'setSunlight'
	| 'winds'
	| 'setWinds'
	| 'grid'
	| 'setGrid'
>;

/**
 * The view settings the browser remembers, each read as its preference
 * reads it.
 *
 * @param preferences - The preferences.
 */
export const storedView = (preferences: ViewPreferences): StoredView => ({
	layer: preferences.layer(),
	summaries: Object.fromEntries(
		SCALAR_LAYER_IDS.map((id) => [id, preferences.summary(id)]),
	) as Record<ScalarLayerId, Summary>,
	sunlight: preferences.sunlight(),
	winds: preferences.winds(),
	grid: preferences.grid(),
});

/**
 * Remembers each view setting of the browser's that differs between two
 * views, and writes nothing of the rest: nothing at all when only the
 * month or the source differs.
 *
 * @param preferences - The preferences.
 * @param before - The view settings as they were.
 * @param after - The view settings as they are now.
 */
export const storeView = (
	preferences: ViewPreferences,
	before: StoredView,
	after: StoredView,
): void => {
	if (after.layer !== before.layer) {
		preferences.setLayer(after.layer);
	}
	for (const id of SCALAR_LAYER_IDS) {
		if (after.summaries[id] !== before.summaries[id]) {
			preferences.setSummary(id, after.summaries[id]);
		}
	}
	if (after.sunlight !== before.sunlight) {
		preferences.setSunlight(after.sunlight);
	}
	if (after.winds !== before.winds) {
		preferences.setWinds(after.winds);
	}
	if (after.grid !== before.grid) {
		preferences.setGrid(after.grid);
	}
};
