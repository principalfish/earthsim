/**
 * The page's preferences, remembered by the browser from one visit of the
 * page to the next: the units, as a system and an override for any
 * quantity, whether the winds are drawn as arrows or as streaks, and the
 * view settings of a {@link StoredView}: the layer, each computed layer's
 * view of its year, and whether the sunlight, the winds and the cell grid
 * are on. The month on screen and the source are not among them.
 *
 * Like which sections are open, a preference is a setting of the browser,
 * not of the world: it is kept apart from the saved world, never goes into
 * a world file, and a new, imported or restored world leaves it as it is.
 */

import {
	defaultWindStyle,
	isWindStyle,
	type WindStyle,
} from '../globe/windMotion';
import { offersSummary, SCALAR_LAYER_SPECS } from '../layers/scalar';
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
} from '../layers/view';
import type { PanelStorage } from './panelMemory';
import {
	DEFAULT_UNIT_SYSTEM,
	isUnitOf,
	isUnitSystem,
	QUANTITIES,
	type Quantity,
	type UnitChoice,
	type UnitOf,
	type UnitSystem,
} from './units';

/** What the preferences ask of the browser's storage. */
export type PreferenceStorage = PanelStorage & Pick<Storage, 'removeItem'>;

/** The name of the system of units' entry in the storage. */
export const UNIT_SYSTEM_KEY = 'earth_sim.preference.unitSystem';

/**
 * The name of the entry for a quantity's unit whatever the system, in the
 * storage, such as `earth_sim.preference.windSpeedUnitOverride`.
 *
 * @param quantity - The quantity.
 */
export const unitOverrideKey = (quantity: Quantity): string =>
	`earth_sim.preference.${quantity}UnitOverride`;

/**
 * The name of the entry the wind speed unit was once kept in, read only to
 * carry it over as the wind speed's override, and then removed.
 */
export const OLD_WIND_SPEED_UNIT_KEY = 'earth_sim.preference.windSpeedUnit';

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
	 * The units chosen: the system last chosen, or
	 * {@link DEFAULT_UNIT_SYSTEM}, metric, when there is nothing to go by,
	 * and each quantity's override last chosen, or none when there is
	 * nothing to go by; nothing to go by is no storage, storage that
	 * throws, an entry missing, or one that holds anything but a system,
	 * or a unit of the quantity.
	 *
	 * @remarks
	 * A wind speed unit kept under {@link OLD_WIND_SPEED_UNIT_KEY} is
	 * carried over: where no override of the wind speed is kept, it becomes
	 * that override, kept under its own entry, and the old entry is removed
	 * once the override is kept, so that it is carried over once at most
	 * and never over an override chosen since. An old entry that holds no
	 * unit is removed too; one whose override cannot be kept stays, to be
	 * carried over on a later visit.
	 */
	unitChoice(): UnitChoice;
	/**
	 * Remembers the system of units. Storage that is missing or will not
	 * take it is left as it is, without an error.
	 *
	 * @param system - The system chosen.
	 */
	setUnitSystem(system: UnitSystem): void;
	/**
	 * Remembers a quantity's unit whatever the system, or, for null, that
	 * it follows the system, by removing its entry. For the wind speed, null
	 * also removes the old entry under {@link OLD_WIND_SPEED_UNIT_KEY}, so
	 * that the unit it holds cannot be carried over later in place of the
	 * choice. Storage that is missing or will not take it is left as it is,
	 * without an error.
	 *
	 * @param quantity - The quantity.
	 * @param unit - Its unit, or null for none.
	 */
	setUnitOverride<Q extends Quantity>(
		quantity: Q,
		unit: UnitOf<Q> | null,
	): void;
	/**
	 * How the winds are drawn: as last chosen, or {@link defaultWindStyle}
	 * when there is nothing to go by: no storage, storage that throws, an
	 * entry missing, or one that holds anything but one of the ways. That
	 * is streaks, or arrows where the system asks for reduced motion.
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
	storage: PreferenceStorage | null | undefined,
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
 *
 * @returns Whether the entry was written: false with no storage or with
 * storage that throws.
 */
const writeEntry = (
	storage: PreferenceStorage | null | undefined,
	key: string,
	value: string,
): boolean => {
	if (!storage) {
		return false;
	}
	try {
		storage.setItem(key, value);
		return true;
	} catch {
		return false;
	}
};

/**
 * Removes an entry of the storage, doing nothing with no storage, and
 * nothing more with storage that throws.
 */
const removeEntry = (
	storage: PreferenceStorage | null | undefined,
	key: string,
): void => {
	try {
		storage?.removeItem(key);
	} catch {
		// Left as it is.
	}
};

/** Reads a toggle's entry: on for {@link ON_ENTRY} alone. */
const readToggle = (
	storage: PreferenceStorage | null | undefined,
	key: string,
): boolean => readEntry(storage, key) === ON_ENTRY;

/** Writes a toggle's entry. */
const writeToggle = (
	storage: PreferenceStorage | null | undefined,
	key: string,
	on: boolean,
): void => {
	writeEntry(storage, key, on ? ON_ENTRY : OFF_ENTRY);
};

/**
 * A quantity's override as its entry holds it, or undefined for none or
 * one that is not a unit of the quantity.
 */
const readOverride = <Q extends Quantity>(
	storage: PreferenceStorage | null | undefined,
	quantity: Q,
): UnitOf<Q> | undefined => {
	const entry = readEntry(storage, unitOverrideKey(quantity));
	return isUnitOf(quantity, entry) ? entry : undefined;
};

/**
 * Carries a wind speed unit kept under {@link OLD_WIND_SPEED_UNIT_KEY}
 * over as the wind speed's override where none is kept, and removes the
 * old entry. Where the override cannot be written, the old entry stays,
 * to be carried over on a later visit, and its unit still applies for
 * this one.
 *
 * @returns The wind speed's override, as kept or as carried over, or
 * undefined for none.
 */
const carryOverWindSpeedUnit = (
	storage: PreferenceStorage | null | undefined,
): UnitOf<'windSpeed'> | undefined => {
	const kept = readOverride(storage, 'windSpeed');
	const old = readEntry(storage, OLD_WIND_SPEED_UNIT_KEY);
	if (old === null) {
		return kept;
	}
	const carried = kept ?? (isUnitOf('windSpeed', old) ? old : undefined);
	const written =
		kept !== undefined ||
		carried === undefined ||
		writeEntry(storage, unitOverrideKey('windSpeed'), carried);
	if (written) {
		removeEntry(storage, OLD_WIND_SPEED_UNIT_KEY);
	}
	return carried;
};

/**
 * The units chosen, as {@link Preferences.unitChoice} reads them.
 */
const readUnitChoice = (
	storage: PreferenceStorage | null | undefined,
): UnitChoice => {
	const system = readEntry(storage, UNIT_SYSTEM_KEY);
	const overrides: Partial<Record<Quantity, string>> = {};
	for (const quantity of QUANTITIES) {
		const unit =
			quantity === 'windSpeed'
				? carryOverWindSpeedUnit(storage)
				: readOverride(storage, quantity);
		if (unit !== undefined) {
			overrides[quantity] = unit;
		}
	}
	return {
		system: isUnitSystem(system) ? system : DEFAULT_UNIT_SYSTEM,
		overrides: overrides as UnitChoice['overrides'],
	};
};

/** What the system asks of the page, which some preferences start from. */
export type PreferenceSystem = {
	/** Whether the system asks for reduced motion; false when left out. */
	readonly reducedMotion?: boolean;
};

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
 * @param system - What the system asks of the page: whether it asks for
 * reduced motion, as `prefers-reduced-motion: reduce` says; it does not
 * when this is left out.
 */
export const createPreferences = (
	storage: PreferenceStorage | null | undefined,
	system: PreferenceSystem = {},
): Preferences => ({
	unitChoice: () => readUnitChoice(storage),
	setUnitSystem: (units) => writeEntry(storage, UNIT_SYSTEM_KEY, units),
	setUnitOverride: (quantity, unit) => {
		if (unit === null) {
			removeEntry(storage, unitOverrideKey(quantity));
			// Where the old entry outlived a visit whose storage would not
			// keep its override, it must not come back over this choice.
			if (quantity === 'windSpeed') {
				removeEntry(storage, OLD_WIND_SPEED_UNIT_KEY);
			}
		} else {
			writeEntry(storage, unitOverrideKey(quantity), unit);
		}
	},
	windStyle: () => {
		const entry = readEntry(storage, WIND_STYLE_KEY);
		return isWindStyle(entry)
			? entry
			: defaultWindStyle(system.reducedMotion === true);
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
