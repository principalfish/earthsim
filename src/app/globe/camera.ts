/**
 * The globe's camera as plain state and the maths that moves it.
 *
 * The camera orbits the centre of the planet and always looks at it with
 * north up, so it is described by the latitude and longitude it is above and
 * its distance. Latitude stops just short of the poles: north can then never
 * flip or spin, which is what a camera free to pass over a pole would do.
 *
 * Everything here is in core coordinates (+Z north, longitude 0 at +X, east
 * towards +Y), with lengths in planet radii and angles in radians unless a
 * name says degrees. Nothing here touches the page, so the functions can be
 * driven by any kind of input.
 */

import { MAX_ELEVATION_M, PLANET_RADIUS_KM, type Vec3 } from '../../core/index';
import { MAX_EXAGGERATION, MIN_DRAWN_SEA_LEVEL_M } from './material';

/** Where the camera is: above a place on the globe, at a distance. */
export type CameraState = {
	/** Latitude the camera is above, in radians, north positive. */
	readonly latitude: number;
	/** Longitude the camera is above, in radians from -π to π, east positive. */
	readonly longitude: number;
	/** Distance from the planet's centre, in planet radii. */
	readonly distance: number;
};

/** A ray in core coordinates. */
export type Ray = {
	/** Start of the ray, in planet radii from the centre. */
	readonly origin: Vec3;
	/** Direction of the ray; not normalised. */
	readonly direction: Vec3;
};

/** Nearest distance from the camera that is drawn, in planet radii. */
export const CAMERA_NEAR = 0.01;

/**
 * Height of the tallest relief the view can draw, in planet radii: the
 * highest elevation above the lowest drawn sea level, at the greatest
 * exaggeration.
 */
const MAX_RELIEF_HEIGHT =
	((MAX_ELEVATION_M - MIN_DRAWN_SEA_LEVEL_M) * MAX_EXAGGERATION) /
	(PLANET_RADIUS_KM * 1000);

/**
 * Space kept between the camera and the tallest relief, in planet radii.
 * More than {@link CAMERA_NEAR}, so the near plane never cuts into terrain.
 */
const RELIEF_CLEARANCE = 0.02;

/**
 * The closest the camera comes to the planet's centre, in planet radii:
 * about 1.30.
 *
 * @remarks
 * Land is drawn raised by its height above the sea, exaggerated. A 12 km
 * peak over a sea level of -6 km at 100 times exaggeration stands about
 * 0.28 radii above the sphere, and the camera stays just clear of that. The
 * limit follows the elevation, sea-level and exaggeration limits it is
 * worked out from.
 */
export const MIN_CAMERA_DISTANCE = 1 + MAX_RELIEF_HEIGHT + RELIEF_CLEARANCE;

/** The farthest the camera goes, in planet radii; the whole globe fits. */
export const MAX_CAMERA_DISTANCE = 5;

/** The distance the camera starts at, in planet radii. */
export const DEFAULT_CAMERA_DISTANCE = 3.8;

/** The highest latitude the camera can be above, north or south, in radians. */
export const MAX_CAMERA_LATITUDE = (88 * Math.PI) / 180;

/**
 * The camera's field of view in degrees: vertical when the view is wider
 * than tall, horizontal otherwise.
 */
export const FIELD_OF_VIEW_DEG = 35;

/**
 * How fast the wheel zooms: the height above the surface is multiplied by
 * e to this power for every pixel scrolled.
 */
export const ZOOM_RATE_PER_PIXEL = 0.0015;

/**
 * The latitude beyond which a sideways drag stops speeding up, in radians.
 *
 * @remarks
 * A turn about the polar axis moves the point under the middle of the view
 * by the cosine of its latitude, so following the cursor takes a faster
 * turn the nearer the camera is to a pole, without limit.
 */
const LONGITUDE_GAIN_LATITUDE = (75 * Math.PI) / 180;

const clamp = (value: number, low: number, high: number): number =>
	Math.min(high, Math.max(low, value));

/** A longitude brought into the range -π to π; unchanged if already there. */
const wrapLongitude = (longitude: number): number => {
	if (longitude >= -Math.PI && longitude <= Math.PI) {
		return longitude;
	}
	const turn = 2 * Math.PI;
	const wrapped = (((longitude + Math.PI) % turn) + turn) % turn;
	return wrapped - Math.PI;
};

/**
 * A camera state with every field brought within its limits.
 *
 * @param state - Any finite latitude, longitude and distance.
 */
export const clampCamera = (state: CameraState): CameraState => ({
	latitude: clamp(state.latitude, -MAX_CAMERA_LATITUDE, MAX_CAMERA_LATITUDE),
	longitude: wrapLongitude(state.longitude),
	distance: clamp(state.distance, MIN_CAMERA_DISTANCE, MAX_CAMERA_DISTANCE),
});

/**
 * The camera a new view starts with: above the equator's neighbourhood at
 * longitude 0, far enough out to see the whole globe.
 */
export const createCameraState = (): CameraState => ({
	latitude: (15 * Math.PI) / 180,
	longitude: 0,
	distance: DEFAULT_CAMERA_DISTANCE,
});

/**
 * The vertical field of view for a view of a given shape.
 *
 * @remarks
 * A view taller than it is wide gets a larger vertical angle, so that the
 * globe still fits across the width.
 *
 * @param aspect - Width of the view divided by its height; positive.
 * @returns The vertical field of view in degrees.
 */
export const verticalFovDeg = (aspect: number): number => {
	if (aspect >= 1) {
		return FIELD_OF_VIEW_DEG;
	}
	const half = Math.tan((FIELD_OF_VIEW_DEG * Math.PI) / 360) / aspect;
	return (Math.atan(half) * 360) / Math.PI;
};

/**
 * The camera after a wheel movement.
 *
 * @remarks
 * Zooming multiplies the height above the surface rather than the distance
 * from the centre, so each step feels the same far out and close in.
 *
 * @param state - The camera before.
 * @param wheelPixels - Distance scrolled, in pixels: positive moves away
 * from the globe, negative towards it.
 * @returns The camera with its distance changed and kept within
 * {@link MIN_CAMERA_DISTANCE} and {@link MAX_CAMERA_DISTANCE}.
 */
export const zoomCamera = (
	state: CameraState,
	wheelPixels: number,
): CameraState => {
	const height =
		(state.distance - 1) * Math.exp(ZOOM_RATE_PER_PIXEL * wheelPixels);
	return clampCamera({ ...state, distance: 1 + height });
};

/** What a drag is measured against. */
export type DragViewport = {
	/** Height of the view in CSS pixels; positive. */
	readonly heightPx: number;
	/** Width of the view divided by its height; positive. */
	readonly aspect: number;
};

/**
 * The camera after a drag across the view.
 *
 * @remarks
 * The turn is scaled so that the surface in the middle of the view moves as
 * far as the cursor does, at any zoom: dragging right brings the west into
 * view, dragging down brings the north. Latitude stops at
 * {@link MAX_CAMERA_LATITUDE}.
 *
 * @param state - The camera before.
 * @param dxPx - Cursor movement to the right, in CSS pixels.
 * @param dyPx - Cursor movement downwards, in CSS pixels.
 * @param viewport - The size and shape of the view.
 * @returns The camera above its new latitude and longitude.
 */
export const rotateCamera = (
	state: CameraState,
	dxPx: number,
	dyPx: number,
	viewport: DragViewport,
): CameraState => {
	const halfFov = (verticalFovDeg(viewport.aspect) * Math.PI) / 360;
	// Angle the planet turns through to move its nearest point one pixel.
	const radiansPerPixel =
		(2 * Math.tan(halfFov) * (state.distance - 1)) / viewport.heightPx;
	const longitudeGain =
		1 / Math.cos(Math.min(Math.abs(state.latitude), LONGITUDE_GAIN_LATITUDE));
	return clampCamera({
		latitude: state.latitude + dyPx * radiansPerPixel,
		longitude: state.longitude - dxPx * radiansPerPixel * longitudeGain,
		distance: state.distance,
	});
};

/**
 * Where the camera is.
 *
 * @param state - The camera.
 * @returns Its position in core coordinates, in planet radii from the
 * centre.
 */
export const cameraPosition = (state: CameraState): Vec3 => {
	const { latitude, longitude, distance } = state;
	const ring = distance * Math.cos(latitude);
	return [
		ring * Math.cos(longitude),
		ring * Math.sin(longitude),
		distance * Math.sin(latitude),
	];
};

/**
 * The ray from the camera through a point of the view.
 *
 * @param state - The camera.
 * @param ndcX - Horizontal position in the view, -1 at the left edge to 1
 * at the right.
 * @param ndcY - Vertical position in the view, -1 at the bottom edge to 1
 * at the top.
 * @param aspect - Width of the view divided by its height; positive.
 * @returns The ray in core coordinates.
 */
export const viewRay = (
	state: CameraState,
	ndcX: number,
	ndcY: number,
	aspect: number,
): Ray => {
	const sinLat = Math.sin(state.latitude);
	const cosLat = Math.cos(state.latitude);
	const sinLon = Math.sin(state.longitude);
	const cosLon = Math.cos(state.longitude);
	const halfHeight = Math.tan((verticalFovDeg(aspect) * Math.PI) / 360);
	// The view looks at the centre with east to its right and north up.
	const right = ndcX * halfHeight * aspect;
	const up = ndcY * halfHeight;
	return {
		origin: cameraPosition(state),
		direction: [
			-cosLat * cosLon - right * sinLon - up * sinLat * cosLon,
			-cosLat * sinLon + right * cosLon - up * sinLat * sinLon,
			-sinLat + up * cosLat,
		],
	};
};
