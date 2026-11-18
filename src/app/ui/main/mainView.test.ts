import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createFakeDocument,
	type FakeDocument,
	type FakeElement,
	oneByClass,
} from '../../testing/fakeDocument';
import { createMainView } from './mainView';

describe('createMainView', () => {
	let fake: FakeDocument;
	beforeEach(() => {
		fake = createFakeDocument();
		vi.stubGlobal('document', fake.document);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const make = () => {
		const viewport = fake.createElement('main');
		const canvas = fake.createElement('canvas');
		viewport.append(canvas);
		const view = createMainView(viewport as unknown as HTMLElement);
		const as = (element: HTMLElement): FakeElement =>
			element as unknown as FakeElement;
		return { viewport, canvas, view, as };
	};

	it('adds one layer of regions to the globe’s area, after what it holds: the dock, the top bar, the corner, the info region and the timeline', () => {
		const { viewport, canvas, view, as } = make();
		const layer = oneByClass(viewport, 'main-view');
		expect(viewport.children).toEqual([canvas, layer]);
		expect(layer.children).toEqual([
			as(view.dock),
			as(view.topBar),
			as(view.corner),
			as(view.info),
			as(view.timeline),
		]);
		expect(layer.children.map((region) => region.className)).toEqual([
			'main-view__dock',
			'main-view__top-bar',
			'main-view__corner',
			'main-view__info',
			'main-view__timeline',
		]);
	});

	it('leaves every region empty', () => {
		const { view, as } = make();
		for (const region of [
			view.dock,
			view.topBar,
			view.corner,
			view.info,
			view.timeline,
		]) {
			expect(as(region).children).toEqual([]);
		}
	});

	it('puts the layer of regions out of reach, and back within it', () => {
		const { viewport, view } = make();
		const layer = oneByClass(viewport, 'main-view');
		expect(layer.inert).toBe(false);
		view.setInert(true);
		expect(layer.inert).toBe(true);
		view.setInert(false);
		expect(layer.inert).toBe(false);
	});
});
