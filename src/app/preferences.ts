/**
 * The page's preferences, remembered by the browser from one visit of the
 * page to the next: the unit wind speeds are written in, and whether the
 * winds are drawn as arrows or as streaks.
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
import { DEFAULT_WIND_UNIT, isWindUnit, type WindUnit } from './windUnits';

/** The name of the wind speed unit's entry in the storage. */
export const WIND_SPEED_UNIT_KEY = 'earth_sim.preference.windSpeedUnit';

/** The name of the entry for how the winds are drawn, in the storage. */
export const WIND_STYLE_KEY = 'earth_sim.preference.windStyle';

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
});
