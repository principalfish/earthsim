/**
 * The regions laid over the globe, each the place for one kind of control
 * or read-out: the dock down the left edge, the top bar beside it, the
 * corner at the top right, the info region at the bottom right and the
 * timeline along the bottom.
 */

import { createElement } from './fields';

/** The regions over the globe, and the places in the info region. */
export type MainView = {
	/** Down the left edge: the tiles that choose what the globe shows. */
	readonly dock: HTMLElement;
	/** Along the top, beside the dock. */
	readonly topBar: HTMLElement;
	/** In the top-right corner. */
	readonly corner: HTMLElement;
	/**
	 * In the bottom-right corner: the legend, the key to the wind arrows and
	 * the cursor readout, each in its own place.
	 */
	readonly info: HTMLElement;
	/** Along the bottom, beside the dock. */
	readonly timeline: HTMLElement;
	/** Where the legend goes, in the info region. */
	readonly legend: HTMLElement;
	/** Where the key to the wind arrows goes, in the info region. */
	readonly windKey: HTMLElement;
	/** Where the cursor readout's strip goes, in the info region. */
	readonly readout: HTMLElement;
};

/**
 * Adds the regions to the globe's area, laid over what it holds and after
 * it, empty but for the info region's places.
 *
 * @remarks
 * The regions come in a fixed order, the dock, the top bar, the corner, the
 * info region and the timeline, which is the order the keyboard reaches
 * what they hold; the stylesheet places each where it belongs, whatever the
 * order. In the info region the legend's place comes first, then the key's
 * and then the strip's, whichever is filled first. The places draw no box
 * of their own, so the stylesheet lays out what they hold: the legend in
 * the bottom-right corner, the key beside it to its left, or in the corner
 * while the legend is hidden, and the strip against the region's left
 * edge, beside the dock, next to them when all fit along the bottom and
 * above them when they do not. The regions take the pointer only where a
 * control sits, so the globe can be turned and sculpted between them.
 *
 * @param viewport - The globe's area.
 * @returns The regions, and the places for the legend, the key and the
 * strip.
 */
export const createMainView = (viewport: HTMLElement): MainView => {
	const view = createElement('div', 'main-view');
	const dock = createElement('div', 'main-view__dock');
	const topBar = createElement('div', 'main-view__top-bar');
	const corner = createElement('div', 'main-view__corner');
	const info = createElement('div', 'main-view__info');
	const timeline = createElement('div', 'main-view__timeline');
	const legend = createElement('div', 'main-view__place');
	const windKey = createElement('div', 'main-view__place');
	const readout = createElement('div', 'main-view__place');
	info.append(legend, windKey, readout);
	view.append(dock, topBar, corner, info, timeline);
	viewport.append(view);
	return { dock, topBar, corner, info, timeline, legend, windKey, readout };
};
