/** How the globe is lit by the sun, and from where. */

import type { Vec3 } from '../../../core/index';
import type { GlobeUniforms } from './globeMaterial';

/**
 * How the globe is lit: `'off'`, as without the sun; `'darkened'`, by the
 * sun, with the side facing away from it darkened; or `'line'`, with the
 * colours shaded as without the sun and the line between day and night
 * drawn over them.
 */
export type SunlightStyle = 'off' | 'darkened' | 'line';

/**
 * Sets how the globe is lit by the sun, or that it is lit as without it.
 *
 * @param uniforms - The globe's uniforms.
 * @param style - How the globe is lit.
 */
export const showSunlight = (
	uniforms: GlobeUniforms,
	style: SunlightStyle,
): void => {
	uniforms.uSunlight.value = style !== 'off';
	uniforms.uSunlightAsLine.value = style === 'line';
};

/**
 * The sun's direction as a unit vector.
 *
 * @param direction - Any finite, non-zero vector.
 * @returns The vector scaled to length 1.
 * @throws RangeError for a zero or non-finite vector.
 */
export const unitSunDirection = (direction: Vec3): Vec3 => {
	const length = Math.hypot(...direction);
	if (!(length > 0 && Number.isFinite(length))) {
		throw new RangeError(
			`The sun's direction must be a finite, non-zero vector; got ${direction.join(', ')}`,
		);
	}
	return [direction[0] / length, direction[1] / length, direction[2] / length];
};

/**
 * Sets the direction the sunlight comes from.
 *
 * @param uniforms - The globe's uniforms.
 * @param direction - The sun's direction in core coordinates: any finite,
 * non-zero vector; it is normalised.
 * @throws RangeError as {@link unitSunDirection} does; the direction is
 * then left as it was.
 */
export const aimSunlight = (uniforms: GlobeUniforms, direction: Vec3): void => {
	uniforms.uSunDirection.value.set(...unitSunDirection(direction));
};
