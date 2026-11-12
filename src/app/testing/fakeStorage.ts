/**
 * A stand-in for the browser's local storage, for the tests of what keeps
 * small settings in it: entries that hold what was written, and a record
 * of every write.
 *
 * Nothing on the page imports this module.
 */

import type { PanelStorage } from '../panelMemory';

/** The stand-in storage and what tests ask of it. */
export type FakeStorage = PanelStorage & {
	/** What each entry holds, by name. */
	readonly entries: Map<string, string>;
	/** Every write, as its name and what it wrote, in order. */
	readonly writes: (readonly [string, string])[];
};

/**
 * Makes a stand-in storage.
 *
 * @param entries - What it holds at first, by name; nothing when left out.
 */
export const createFakeStorage = (
	entries: Readonly<Record<string, string>> = {},
): FakeStorage => {
	const held = new Map(Object.entries(entries));
	const writes: (readonly [string, string])[] = [];
	return {
		entries: held,
		writes,
		getItem: (name) => held.get(name) ?? null,
		setItem: (name, value) => {
			writes.push([name, value]);
			held.set(name, value);
		},
	};
};
