/**
 * The view settings that choose what the globe shows. Like the camera and
 * the relief exaggeration, they belong to the page, not to the world: they
 * are not saved, and a new world keeps them.
 */

/** What the globe can be coloured by. */
export const LAYERS = ['terrain', 'temperature'] as const;

/** What the globe is coloured by: the height, or a computed layer. */
export type Layer = (typeof LAYERS)[number];

/** What the globe is coloured by when the page opens. */
export const DEFAULT_LAYER: Layer = 'terrain';

/** The name each layer goes by on the page. */
export const LAYER_LABELS: Readonly<Record<Layer, string>> = {
	terrain: 'Terrain',
	temperature: 'Temperature',
};

/**
 * The month whose temperature is shown, as an index into a result's twelve
 * months from January at 0: July.
 */
export const SHOWN_MONTH = 6;
