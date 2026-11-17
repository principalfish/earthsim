/** The layers the page offers that colour the globe by a value per cell. */

import {
	isScalarLayer,
	type Layer,
	SCALAR_LAYER_IDS,
	type ScalarLayerId,
} from '../view';
import { PRESSURE_LAYER } from './pressure';
import type { ScalarLayerSpec, ScalarObservedLoader } from './spec';
import { TEMPERATURE_LAYER } from './temperature';

/** The description of each layer that colours the globe by a value per cell. */
export const SCALAR_LAYER_SPECS: Readonly<
	Record<ScalarLayerId, ScalarLayerSpec>
> = {
	temperature: TEMPERATURE_LAYER,
	pressure: PRESSURE_LAYER,
};

/**
 * The layers the page offers that colour the globe by a value per cell, in
 * the order the choice of layer lists them, after Terrain.
 */
export const SCALAR_LAYERS: readonly ScalarLayerSpec[] = SCALAR_LAYER_IDS.map(
	(id) => SCALAR_LAYER_SPECS[id],
);

/**
 * The description of a layer the page offers, or null for the terrain.
 *
 * @param layer - The layer.
 */
export const scalarLayerOf = (layer: Layer): ScalarLayerSpec | null =>
	isScalarLayer(layer) ? SCALAR_LAYER_SPECS[layer] : null;

/**
 * Loads a layer's observed year through the loader its description gives.
 *
 * @param layer - The layer's description.
 * @param resolution - Cells along a face edge of the world's grid.
 * @returns The loader's promise; one that rejects for a layer with no
 * comparison.
 */
export const loadLayerObserved: ScalarObservedLoader = (layer, resolution) =>
	layer.observed === null
		? Promise.reject(
				new Error(`The ${layer.id} layer has no observed year to load`),
			)
		: layer.observed.load(resolution);
