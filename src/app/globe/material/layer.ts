/** A data layer made ready for the shaders, and put on show or taken off. */

import { type ColourRamp, checkRamp, type ValueRange } from '../ramp';
import { type CellTexture, createCellTexture } from './cellTexture';
import type { GlobeUniforms } from './globeMaterial';

/** A data layer made ready for the shaders. */
export type PreparedLayer = CellTexture & {
	/** The values the ramp is stretched over. */
	readonly range: ValueRange;
	/** The ramp it is drawn with. */
	readonly ramp: ColourRamp;
};

/**
 * Checks a data layer and makes its texture.
 *
 * @param field - One value per cell, in cell order; kept, not copied.
 * @param resolution - Cells along a face edge of the world on show.
 * @param range - The values the ramp is stretched over.
 * @param ramp - The ramp to draw it with.
 * @returns The layer, ready for {@link showLayer}.
 * @throws RangeError if the range or the ramp is missing, if the range's
 * ends are not finite with `min` below `max`, if the ramp fails
 * {@link checkRamp}, or if the field does not hold one value per cell.
 */
export const prepareLayer = (
	field: Float32Array,
	resolution: number,
	range: ValueRange | undefined,
	ramp: ColourRamp | undefined,
): PreparedLayer => {
	if (range === undefined || ramp === undefined) {
		throw new RangeError('A data layer needs a range and a ramp');
	}
	if (
		!Number.isFinite(range.min) ||
		!Number.isFinite(range.max) ||
		!(range.min < range.max)
	) {
		throw new RangeError(
			`A data layer's range must run up from one finite value to another; got ${range.min} to ${range.max}`,
		);
	}
	checkRamp(ramp);
	return {
		...createCellTexture(field, resolution),
		range: { min: range.min, max: range.max },
		ramp,
	};
};

/**
 * Sets the uniforms that draw a data layer, or that draw the height
 * colours instead.
 *
 * @param uniforms - The globe's uniforms.
 * @param layer - The layer to show, or null to show none.
 */
export const showLayer = (
	uniforms: GlobeUniforms,
	layer: PreparedLayer | null,
): void => {
	if (layer === null) {
		uniforms.uLayerShown.value = false;
		uniforms.uLayer.value = null;
		return;
	}
	uniforms.uLayerShown.value = true;
	uniforms.uLayer.value = layer.texture;
	uniforms.uLayerRange.value.set(layer.range.min, layer.range.max);
	const { stops } = layer.ramp;
	uniforms.uRampCount.value = stops.length;
	uniforms.uRampAt.value.fill(0);
	uniforms.uRampColour.value.fill(0);
	stops.forEach((stop, index) => {
		uniforms.uRampAt.value[index] = stop.at;
		uniforms.uRampColour.value.set(
			[16, 8, 0].map((shift) => ((stop.colour >> shift) & 0xff) / 255),
			index * 3,
		);
	});
};

/**
 * Puts a data layer on show in place of the one shown, or shows none.
 *
 * @remarks
 * The new layer is checked and made before anything else is touched, so a
 * layer that is refused leaves the one shown as it was: still shown, its
 * texture whole. Only once the new layer is made is the old one's texture
 * disposed of, once, and the new one shown.
 *
 * @param uniforms - The globe's uniforms.
 * @param shown - The layer on show, or null for none.
 * @param resolution - Cells along a face edge of the world on show, or null
 * before any world is shown.
 * @param field - One value per cell, in cell order, kept, not copied; or
 * null to show no layer.
 * @param range - The values the ramp is stretched over. Needed with a field.
 * @param ramp - The ramp to draw it with. Needed with a field.
 * @returns The layer now on show, or null for none.
 * @throws RangeError for a field before any world is shown, and whenever
 * {@link prepareLayer} refuses the field, the range or the ramp.
 */
export const replaceLayer = (
	uniforms: GlobeUniforms,
	shown: PreparedLayer | null,
	resolution: number | null,
	field: Float32Array | null,
	range?: ValueRange,
	ramp?: ColourRamp,
): PreparedLayer | null => {
	let next: PreparedLayer | null = null;
	if (field !== null) {
		if (resolution === null) {
			throw new RangeError('A data layer needs a world to be shown first');
		}
		next = prepareLayer(field, resolution, range, ramp);
	}
	shown?.texture.dispose();
	showLayer(uniforms, next);
	return next;
};
