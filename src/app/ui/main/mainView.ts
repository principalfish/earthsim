/**
 * The regions laid over the globe, each the place for one kind of control
 * or read-out: the dock down the left edge, the top bar beside it, the
 * corner at the top right, the info region at the bottom right and the
 * timeline along the bottom.
 */

import { createElement } from '../fields';

/** The regions over the globe. */
export type MainView = {
	/** Down the left edge: the tiles that choose what the globe shows. */
	readonly dock: HTMLElement;
	/** Along the top, beside the dock. */
	readonly topBar: HTMLElement;
	/** In the top-right corner. */
	readonly corner: HTMLElement;
	/** In the bottom-right corner, above the timeline: the info box. */
	readonly info: HTMLElement;
	/** Along the bottom, beside the dock. */
	readonly timeline: HTMLElement;
	/**
	 * Puts every region, and what it holds, out of reach of the mouse and
	 * the keyboard, or back within it.
	 */
	readonly setInert: (inert: boolean) => void;
};

/**
 * Adds the regions to the globe's area, laid over what it holds and after
 * it, each empty.
 *
 * @remarks
 * The regions come in a fixed order, the dock, the top bar, the corner, the
 * info region and the timeline, which is the order the keyboard reaches
 * what they hold; the stylesheet places each where it belongs, whatever the
 * order, and draws the top bar and the corner above the info region, so
 * that what the info region holds, rising over the globe in an area too
 * short for it, never covers their controls. The regions take the pointer
 * only where a control sits, so the globe can be turned and sculpted
 * between them.
 *
 * @param viewport - The globe's area.
 * @returns The regions.
 */
export const createMainView = (viewport: HTMLElement): MainView => {
	const view = createElement('div', 'main-view');
	const dock = createElement('div', 'main-view__dock');
	const topBar = createElement('div', 'main-view__top-bar');
	const corner = createElement('div', 'main-view__corner');
	const info = createElement('div', 'main-view__info');
	const timeline = createElement('div', 'main-view__timeline');
	view.append(dock, topBar, corner, info, timeline);
	viewport.append(view);
	return {
		dock,
		topBar,
		corner,
		info,
		timeline,
		setInert: (inert) => {
			view.inert = inert;
		},
	};
};
