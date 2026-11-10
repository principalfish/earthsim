/**
 * Finding the point of the globe under a point of the screen.
 *
 * Picking is analytic: a ray from the eye through the screen point is
 * intersected with the unit sphere. Relief is not taken into account, so
 * over raised terrain seen at a slant the picked point lies slightly beyond
 * the one drawn under the cursor.
 */

import type { Vec3 } from '../../core/index';

/** A rectangle on the screen in CSS pixels, as an element's bounds give it. */
export type ScreenRect = {
	/** Distance of the left edge from the left of the window. */
	readonly left: number;
	/** Distance of the top edge from the top of the window. */
	readonly top: number;
	/** Width of the rectangle; positive. */
	readonly width: number;
	/** Height of the rectangle; positive. */
	readonly height: number;
};

/**
 * Where a ray first meets a sphere centred on the origin.
 *
 * @param origin - Start of the ray, in any frame and unit.
 * @param direction - Direction of the ray in the same frame; any finite,
 * non-zero length.
 * @param radius - Radius of the sphere in the origin's unit; 1 by default.
 * @returns The nearer of the two points where the ray crosses the sphere,
 * or, when the ray starts inside the sphere, the point where it leaves.
 * Null when the ray misses the sphere, when the sphere lies wholly behind
 * the start of the ray, or when the direction is zero.
 */
export const raySphere = (
	origin: Vec3,
	direction: Vec3,
	radius = 1,
): Vec3 | null => {
	const [ox, oy, oz] = origin;
	const length = Math.hypot(direction[0], direction[1], direction[2]);
	if (!(length > 0) || !Number.isFinite(length)) {
		return null;
	}
	const dx = direction[0] / length;
	const dy = direction[1] / length;
	const dz = direction[2] / length;
	// Distances t along the unit ray solve t² + 2bt + c = 0.
	const b = ox * dx + oy * dy + oz * dz;
	const c = ox * ox + oy * oy + oz * oz - radius * radius;
	const discriminant = b * b - c;
	if (discriminant < 0) {
		return null;
	}
	const root = Math.sqrt(discriminant);
	const near = -b - root;
	const far = -b + root;
	const t = near >= 0 ? near : far;
	if (t < 0) {
		return null;
	}
	return [ox + t * dx, oy + t * dy, oz + t * dz];
};

/**
 * A window position as normalised device coordinates of a rectangle.
 *
 * @param clientX - Horizontal position in CSS pixels from the left of the
 * window, as pointer events report it.
 * @param clientY - Vertical position in CSS pixels from the top of the
 * window.
 * @param rect - The bounds of the drawing surface in the same pixels.
 * @returns `[x, y]`, each -1 to 1 across the rectangle, with x growing to
 * the right and y growing upwards.
 */
export const clientToNdc = (
	clientX: number,
	clientY: number,
	rect: ScreenRect,
): readonly [number, number] => [
	((clientX - rect.left) / rect.width) * 2 - 1,
	1 - ((clientY - rect.top) / rect.height) * 2,
];
