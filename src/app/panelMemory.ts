/**
 * Which sections of the side panel are open, remembered by the browser
 * from one visit of the page to the next.
 *
 * It is a setting of the browser, not of the world: it is kept apart from
 * the saved world, never goes into a world file, and a new, imported or
 * restored world leaves it as it is.
 */

/** What the memory asks of the browser's storage. */
export type PanelStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Which sections are open, as the browser remembers it. */
export type PanelMemory = {
	/**
	 * Whether a section was left open.
	 *
	 * @param id - The section's name in the memory, such as `world`.
	 * @param fallback - What to give when there is nothing to go by: no
	 * storage, an entry missing or unreadable, or storage that throws.
	 */
	isOpen(id: string, fallback: boolean): boolean;
	/**
	 * Remembers whether a section is open. Storage that is missing or will
	 * not take it is left as it is, without an error.
	 *
	 * @param id - The section's name in the memory, such as `world`.
	 * @param open - Whether it is open.
	 */
	setOpen(id: string, open: boolean): void;
};

/** What every section's entry in the storage is named with, before its id. */
export const PANEL_MEMORY_PREFIX = 'earth_sim.panel.';

/** What the entry of an open section holds. */
export const OPEN_ENTRY = 'open';

/** What the entry of a closed section holds. */
export const CLOSED_ENTRY = 'closed';

/**
 * The name of a section's entry in the storage, such as
 * `earth_sim.panel.world`.
 *
 * @param id - The section's name in the memory.
 */
export const panelMemoryKey = (id: string): string =>
	`${PANEL_MEMORY_PREFIX}${id}`;

/**
 * The browser's storage, or null where reaching it throws, as it does where
 * the browser blocks storage for the page.
 *
 * @param get - Reaches the storage, such as `() => window.localStorage`.
 */
export const reachStorage = (
	get: () => PanelStorage | null | undefined,
): PanelStorage | null => {
	try {
		return get() ?? null;
	} catch {
		return null;
	}
};

/**
 * Makes the memory of which sections are open, kept in the browser's
 * storage as one small entry per section.
 *
 * @remarks
 * Nothing about the storage ever stops the page: with no storage at all,
 * storage that throws on reading or on writing, or an entry that holds
 * anything but {@link OPEN_ENTRY} or {@link CLOSED_ENTRY}, each section is
 * as on a first visit.
 *
 * @param storage - The storage, or null or undefined for none.
 */
export const createPanelMemory = (
	storage: PanelStorage | null | undefined,
): PanelMemory => ({
	isOpen: (id, fallback) => {
		let entry: string | null;
		try {
			entry = storage?.getItem(panelMemoryKey(id)) ?? null;
		} catch {
			return fallback;
		}
		if (entry === OPEN_ENTRY) {
			return true;
		}
		return entry === CLOSED_ENTRY ? false : fallback;
	},
	setOpen: (id, open) => {
		try {
			storage?.setItem(panelMemoryKey(id), open ? OPEN_ENTRY : CLOSED_ENTRY);
		} catch {
			// Not remembered: the section is as it is for this visit only.
		}
	},
});
