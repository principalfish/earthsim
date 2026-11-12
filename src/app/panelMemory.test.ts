import { describe, expect, it } from 'vitest';
import {
	CLOSED_ENTRY,
	createPanelMemory,
	OPEN_ENTRY,
	type PanelStorage,
	panelMemoryKey,
	reachStorage,
} from './panelMemory';
import { createFakeStorage } from './testing/fakeStorage';

/** Storage that throws on every read and every write. */
const refusingStorage: PanelStorage = {
	getItem: () => {
		throw new Error('Storage is blocked');
	},
	setItem: () => {
		throw new Error('Storage is blocked');
	},
};

describe('panelMemoryKey', () => {
	it('names one entry for each section', () => {
		expect(panelMemoryKey('world')).toBe('earth_sim.panel.world');
		expect(panelMemoryKey('tools')).toBe('earth_sim.panel.tools');
	});
});

describe('createPanelMemory', () => {
	it('remembers each section as open or closed in an entry of its own', () => {
		const storage = createFakeStorage();
		const memory = createPanelMemory(storage);
		memory.setOpen('layers', true);
		memory.setOpen('world', false);
		expect(storage.entries).toEqual(
			new Map([
				[panelMemoryKey('layers'), OPEN_ENTRY],
				[panelMemoryKey('world'), CLOSED_ENTRY],
			]),
		);
		expect(memory.isOpen('layers', false)).toBe(true);
		expect(memory.isOpen('world', true)).toBe(false);
		expect(memory.isOpen('view', true)).toBe(true);
		expect(memory.isOpen('view', false)).toBe(false);

		memory.setOpen('layers', false);
		expect(memory.isOpen('layers', true)).toBe(false);
		expect(memory.isOpen('world', true)).toBe(false);
	});

	it('reads what an earlier visit wrote', () => {
		const first = createFakeStorage();
		createPanelMemory(first).setOpen('planet', true);
		const again = createPanelMemory(
			createFakeStorage(Object.fromEntries(first.entries)),
		);
		expect(again.isOpen('planet', false)).toBe(true);
	});

	it('gives the fallback for a missing entry', () => {
		const memory = createPanelMemory(createFakeStorage());
		expect(memory.isOpen('tools', false)).toBe(false);
		expect(memory.isOpen('tools', true)).toBe(true);
	});

	it('gives the fallback for an entry it cannot read', () => {
		const memory = createPanelMemory(
			createFakeStorage({
				[panelMemoryKey('tools')]: 'yes',
				[panelMemoryKey('view')]: '',
				[panelMemoryKey('planet')]: 'OPEN',
			}),
		);
		for (const id of ['tools', 'view', 'planet']) {
			expect(memory.isOpen(id, false)).toBe(false);
			expect(memory.isOpen(id, true)).toBe(true);
		}
	});

	it('gives the fallback, and no error, from storage that throws on reading', () => {
		const memory = createPanelMemory(refusingStorage);
		expect(memory.isOpen('world', true)).toBe(true);
		expect(memory.isOpen('layers', false)).toBe(false);
	});

	it('carries on, without an error, past storage that throws on writing', () => {
		const storage = createFakeStorage();
		const memory = createPanelMemory({
			getItem: storage.getItem,
			setItem: refusingStorage.setItem,
		});
		expect(() => memory.setOpen('layers', true)).not.toThrow();
		expect(memory.isOpen('layers', false)).toBe(false);
		expect(() =>
			createPanelMemory(refusingStorage).setOpen('world', false),
		).not.toThrow();
	});

	it('gives the fallback, and no error, with no storage at all', () => {
		for (const storage of [null, undefined]) {
			const memory = createPanelMemory(storage);
			expect(() => memory.setOpen('layers', true)).not.toThrow();
			expect(memory.isOpen('layers', false)).toBe(false);
			expect(memory.isOpen('world', true)).toBe(true);
		}
	});
});

describe('reachStorage', () => {
	it('gives the storage reached', () => {
		const storage = createFakeStorage();
		expect(reachStorage(() => storage)).toBe(storage);
	});

	it('gives null where there is no storage', () => {
		expect(reachStorage(() => null)).toBeNull();
		expect(reachStorage(() => undefined)).toBeNull();
	});

	it('gives null, and no error, where reaching the storage throws', () => {
		expect(
			reachStorage(() => {
				throw new Error('The operation is insecure');
			}),
		).toBeNull();
	});
});
