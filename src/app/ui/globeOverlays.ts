/**
 * What is laid over the globe: the temperature legend and the cursor
 * readout, along the bottom of the globe's area.
 */

import { createElement } from './fields';

/** Where each of the overlays goes. */
export type GlobeOverlays = {
	/** Where the temperature legend goes. */
	readonly legend: HTMLElement;
	/** Where the cursor readout's strip goes. */
	readonly readout: HTMLElement;
};

/**
 * Adds the row the overlays sit in to the globe's area, after what it
 * holds, with a place for each.
 *
 * @remarks
 * The legend's place comes first, whichever overlay is made first. The two
 * places draw no box of their own, so the stylesheet lays out the legend
 * and the strip themselves: the legend in the bottom-right corner and the
 * strip against the left edge, beside the legend when both fit along the
 * bottom and directly above it when they do not. Neither the row nor
 * anything in it takes the pointer, which passes through to the globe.
 *
 * @param viewport - The globe's area.
 * @returns The places for the legend and the strip.
 */
export const createGlobeOverlays = (viewport: HTMLElement): GlobeOverlays => {
	const row = createElement('div', 'globe-overlays');
	const legend = createElement('div', 'globe-overlays__place');
	const readout = createElement('div', 'globe-overlays__place');
	row.append(legend, readout);
	viewport.append(row);
	return { legend, readout };
};
