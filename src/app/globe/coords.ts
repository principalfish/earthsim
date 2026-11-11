/**
 * The one place where core coordinates meet Three.js coordinates.
 *
 * Core directions have +Z at the north pole, longitude 0 at +X and east
 * towards +Y. Three.js scenes are Y-up. The conversion is the rotation that
 * cycles the axes: core `(x, y, z)` is Three.js `(y, z, x)`. Seen by a camera
 * on the Three.js +Z axis with +Y up, longitude 0 on the equator is in the
 * middle of the globe, north is up and east is to the right.
 *
 * Both frames are right-handed and the conversion is a proper rotation, so
 * nothing is mirrored.
 */

import type { Vec3 } from '../../core/index';

/**
 * A core-frame vector expressed in the Three.js frame.
 *
 * @param v - A point or direction in core coordinates.
 * @returns The same point in Three.js coordinates; its length is unchanged.
 */
export const coreToThree = (v: Vec3): Vec3 => [v[1], v[2], v[0]];

/**
 * A Three.js-frame vector expressed in the core frame: the inverse of
 * {@link coreToThree}.
 *
 * @param v - A point or direction in Three.js coordinates.
 * @returns The same point in core coordinates; its length is unchanged.
 */
export const threeToCore = (v: Vec3): Vec3 => [v[2], v[0], v[1]];
