/**
 * The page's preferences, remembered by the browser from one visit of the
 * page to the next: for now, the unit wind speeds are written in.
 *
 * Like which sections are open, a preference is a setting of the browser,
 * not of the world: it is kept apart from the saved world, never goes into
 * a world file, and a new, imported or restored world leaves it as it is.
 */

import type { PanelStorage } from './panelMemory';
import { DEFAULT_WIND_UNIT, isWindUnit, type WindUnit } from './windUnits';

/** The name of the wind speed unit's entry in the storage. */
export const WIND_SPEED_UNIT_KEY = 'earth_sim.preference.windSpeedUnit';

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
		let entry: string | null;
		try {
			entry = storage?.getItem(WIND_SPEED_UNIT_KEY) ?? null;
		} catch {
			return DEFAULT_WIND_UNIT;
		}
		return isWindUnit(entry) ? entry : DEFAULT_WIND_UNIT;
	},
	setWindSpeedUnit: (unit) => {
		try {
			storage?.setItem(WIND_SPEED_UNIT_KEY, unit);
		} catch {
			// Not remembered: the unit is as chosen for this visit only.
		}
	},
});
