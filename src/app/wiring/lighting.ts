/** How the globe is lit for what it shows and the Sunlight setting. */

import type { SunlightStyle } from '../globe/material';
import { scalarLayerOf } from '../layers/scalar';
import type { Layer } from '../layers/view';

/**
 * How the globe is lit for a layer and the Sunlight setting. In Terrain
 * view the night side is darkened. On a computed layer it is lit as the
 * layer's description says: in Temperature view the colours are shaded as
 * without the sun, since a darkened colour would read as another
 * temperature, and the line between day and night is drawn instead.
 *
 * @param layer - What the globe is coloured by.
 * @param sunlight - Whether the globe is lit by the sun.
 */
export const sunlightStyleFor = (
	layer: Layer,
	sunlight: boolean,
): SunlightStyle => {
	if (!sunlight) {
		return 'off';
	}
	return scalarLayerOf(layer)?.sunlightStyle ?? 'darkened';
};
