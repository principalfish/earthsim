/**
 * What is laid over the globe: the temperature legend, the key to the wind
 * arrows and the cursor readout, along the bottom of the globe's area.
 */

import { createElement } from './fields';

/** Where each of the overlays goes. */
export type GlobeOverlays = {
	/** Where the temperature legend goes. */
	readonly legend: HTMLElement;
	/** Where the key to the wind arrows goes. */
	readonly windKey: HTMLElement;
	/** Where the cursor readout's strip goes. */
	readonly readout: HTMLElement;
};

/**
 * Adds the row the overlays sit in to the globe's area, after what it
 * holds, with a place for each.
 *
 * @remarks
 * The legend's place comes first, then the key's and then the strip's,
 * whichever overlay is made first. The places draw no box of their own, so
 * the stylesheet lays out what they hold: the legend in the bottom-right
 * corner, the key beside it to its left, or in the corner while the legend
 * is hidden, and the strip against the left edge, beside them when all fit
 * along the bottom and above them when they do not. Neither the row nor
 * anything in it takes the pointer, which passes through to the globe.
 *
 * @param viewport - The globe's area.
 * @returns The places for the legend, the key and the strip.
 */
export const createGlobeOverlays = (viewport: HTMLElement): GlobeOverlays => {
	const row = createElement('div', 'globe-overlays');
	const legend = createElement('div', 'globe-overlays__place');
	const windKey = createElement('div', 'globe-overlays__place');
	const readout = createElement('div', 'globe-overlays__place');
	row.append(legend, windKey, readout);
	viewport.append(row);
	return { legend, windKey, readout };
};
