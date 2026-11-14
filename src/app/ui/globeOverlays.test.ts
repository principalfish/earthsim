import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createFakeDocument,
	type FakeDocument,
	type FakeElement,
	oneByClass,
} from '../testing/fakeDocument';
import { createGlobeOverlays } from './globeOverlays';

describe('createGlobeOverlays', () => {
	let fake: FakeDocument;
	beforeEach(() => {
		fake = createFakeDocument();
		vi.stubGlobal('document', fake.document);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('adds one row to the globe’s area, after what it holds, with the legend’s place, then the wind key’s, then the strip’s', () => {
		const viewport = fake.createElement('main');
		const canvas = fake.createElement('canvas');
		viewport.append(canvas);
		const overlays = createGlobeOverlays(viewport as unknown as HTMLElement);
		const row = oneByClass(viewport, 'globe-overlays');
		expect(viewport.children).toEqual([canvas, row]);
		const legend = overlays.legend as unknown as FakeElement;
		const windKey = overlays.windKey as unknown as FakeElement;
		const readout = overlays.readout as unknown as FakeElement;
		expect(row.children).toEqual([legend, windKey, readout]);
		for (const place of [legend, windKey, readout]) {
			expect(place.className).toBe('globe-overlays__place');
			expect(place.children).toEqual([]);
		}
	});
});
