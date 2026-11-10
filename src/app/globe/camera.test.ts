import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
	directionToLatLon,
	MAX_ELEVATION_M,
	PLANET_RADIUS_KM,
	type Vec3,
} from '../../core/index';
import {
	CAMERA_NEAR,
	type CameraState,
	cameraPosition,
	clampCamera,
	createCameraState,
	DEFAULT_CAMERA_DISTANCE,
	FIELD_OF_VIEW_DEG,
	MAX_CAMERA_DISTANCE,
	MAX_CAMERA_LATITUDE,
	MIN_CAMERA_DISTANCE,
	rotateCamera,
	verticalFovDeg,
	viewRay,
	ZOOM_RATE_PER_PIXEL,
	zoomCamera,
} from './camera';
import { coreToThree, threeToCore } from './coords';
import { MAX_EXAGGERATION, MIN_DRAWN_SEA_LEVEL_M } from './material';
import { raySphere } from './picking';

const DEG = Math.PI / 180;

/** Height of the tallest relief the view can draw, in planet radii. */
const TALLEST_RELIEF =
	((MAX_ELEVATION_M - MIN_DRAWN_SEA_LEVEL_M) * MAX_EXAGGERATION) /
	(PLANET_RADIUS_KM * 1000);
const VIEWPORT = { heightPx: 900, aspect: 1.2 };

const at = (
	latitudeDeg: number,
	longitudeDeg: number,
	distance = DEFAULT_CAMERA_DISTANCE,
): CameraState => ({
	latitude: latitudeDeg * DEG,
	longitude: longitudeDeg * DEG,
	distance,
});

const normalise = (v: Vec3): Vec3 => {
	const length = Math.hypot(v[0], v[1], v[2]);
	return [v[0] / length, v[1] / length, v[2] / length];
};

describe('createCameraState', () => {
	it('starts within the limits, seeing the whole globe', () => {
		const state = createCameraState();
		expect(clampCamera(state)).toEqual(state);
		const halfFov = (FIELD_OF_VIEW_DEG / 2) * DEG;
		expect(Math.asin(1 / state.distance)).toBeLessThan(halfFov);
	});
});

describe('the camera limits', () => {
	it('keep the camera above the surface and the whole globe in view', () => {
		expect(MIN_CAMERA_DISTANCE).toBeGreaterThan(1);
		expect(MAX_CAMERA_DISTANCE).toBeGreaterThan(DEFAULT_CAMERA_DISTANCE);
		expect(DEFAULT_CAMERA_DISTANCE).toBeGreaterThan(MIN_CAMERA_DISTANCE);
		expect(MAX_CAMERA_LATITUDE).toBeLessThan(Math.PI / 2);
	});

	it('put the nearest distance just outside the tallest relief', () => {
		// 18 km of relief at 100 times exaggeration on a 6,371 km sphere.
		expect(TALLEST_RELIEF).toBeCloseTo(0.2825, 4);
		expect(MIN_CAMERA_DISTANCE).toBeGreaterThan(1 + TALLEST_RELIEF);
		expect(MIN_CAMERA_DISTANCE).toBeCloseTo(1.3025, 4);
	});

	it('keep the near plane outside the tallest relief', () => {
		// The camera looks at the centre, so the nearest point of its near
		// plane to the centre is the one straight ahead.
		expect(CAMERA_NEAR).toBeGreaterThan(0);
		expect(MIN_CAMERA_DISTANCE - CAMERA_NEAR).toBeGreaterThan(
			1 + TALLEST_RELIEF,
		);
	});
});

describe('clampCamera', () => {
	it('brings each field within its limits', () => {
		const clamped = clampCamera({
			latitude: 2,
			longitude: 3 * Math.PI + 0.25,
			distance: 100,
		});
		expect(clamped.latitude).toBe(MAX_CAMERA_LATITUDE);
		expect(clamped.longitude).toBeCloseTo(-Math.PI + 0.25, 12);
		expect(clamped.distance).toBe(MAX_CAMERA_DISTANCE);
		expect(clampCamera(at(-100, -190, 0)).latitude).toBe(-MAX_CAMERA_LATITUDE);
		expect(clampCamera(at(0, -190, 0)).longitude).toBeCloseTo(170 * DEG, 12);
		expect(clampCamera(at(0, 0, 0)).distance).toBe(MIN_CAMERA_DISTANCE);
	});
});

describe('zoomCamera', () => {
	it('moves towards the globe when scrolling up and away when down', () => {
		const state = createCameraState();
		expect(zoomCamera(state, -100).distance).toBeLessThan(state.distance);
		expect(zoomCamera(state, 100).distance).toBeGreaterThan(state.distance);
	});

	it('multiplies the height above the surface', () => {
		const zoomed = zoomCamera(at(0, 0, 3), 100);
		expect(zoomed.distance - 1).toBeCloseTo(
			2 * Math.exp(100 * ZOOM_RATE_PER_PIXEL),
			12,
		);
		const there = zoomCamera(zoomCamera(at(0, 0, 3), 250), -250);
		expect(there.distance).toBeCloseTo(3, 12);
	});

	it('is clamped to the nearest distance', () => {
		expect(zoomCamera(createCameraState(), -1e6).distance).toBe(
			MIN_CAMERA_DISTANCE,
		);
		expect(zoomCamera(at(0, 0, MIN_CAMERA_DISTANCE), -100).distance).toBe(
			MIN_CAMERA_DISTANCE,
		);
	});

	it('is clamped to the farthest distance', () => {
		expect(zoomCamera(createCameraState(), 1e6).distance).toBe(
			MAX_CAMERA_DISTANCE,
		);
		expect(zoomCamera(at(0, 0, MAX_CAMERA_DISTANCE), 100).distance).toBe(
			MAX_CAMERA_DISTANCE,
		);
	});

	it('leaves where the camera is above alone', () => {
		const zoomed = zoomCamera(at(20, 30), 100);
		expect(zoomed.latitude).toBe(20 * DEG);
		expect(zoomed.longitude).toBe(30 * DEG);
	});
});

describe('rotateCamera', () => {
	it('brings the west into view when dragging right', () => {
		const turned = rotateCamera(at(0, 10), 50, 0, VIEWPORT);
		expect(turned.longitude).toBeLessThan(10 * DEG);
		expect(turned.latitude).toBe(0);
	});

	it('brings the north into view when dragging down', () => {
		const turned = rotateCamera(at(0, 10), 0, 50, VIEWPORT);
		expect(turned.latitude).toBeGreaterThan(0);
		expect(turned.longitude).toBeCloseTo(10 * DEG, 12);
	});

	it('moves the surface under the middle of the view with the cursor', () => {
		// The point under the middle of the view before the drag should end
		// up under the cursor, 40 pixels right of the middle.
		const before = at(0, 0, 2);
		const dragged = rotateCamera(before, 40, 0, VIEWPORT);
		const ndcX = (40 / (VIEWPORT.heightPx * VIEWPORT.aspect)) * 2;
		const { origin, direction } = viewRay(dragged, ndcX, 0, VIEWPORT.aspect);
		const hit = raySphere(origin, direction) as Vec3;
		const { latitudeDeg, longitudeDeg } = directionToLatLon(hit);
		expect(latitudeDeg).toBeCloseTo(0, 6);
		expect(Math.abs(longitudeDeg)).toBeLessThan(0.02);
	});

	it('turns less per pixel the closer the camera is', () => {
		const far = rotateCamera(at(0, 0, 4), 10, 0, VIEWPORT);
		const near = rotateCamera(at(0, 0, 1.5), 10, 0, VIEWPORT);
		expect(Math.abs(near.longitude)).toBeLessThan(Math.abs(far.longitude));
		expect(far.longitude / near.longitude).toBeCloseTo(3 / 0.5, 9);
	});

	it('turns faster about the axis at high latitude, up to a limit', () => {
		const equator = rotateCamera(at(0, 0), 10, 0, VIEWPORT).longitude;
		const high = rotateCamera(at(60, 0), 10, 0, VIEWPORT).longitude;
		const higher = rotateCamera(at(80, 0), 10, 0, VIEWPORT).longitude;
		const highest = rotateCamera(at(87, 0), 10, 0, VIEWPORT).longitude;
		expect(high / equator).toBeCloseTo(2, 9);
		expect(higher).toBeCloseTo(highest, 12);
	});

	it('stops short of the poles', () => {
		const north = rotateCamera(at(80, 0), 0, 1e5, VIEWPORT);
		const south = rotateCamera(at(-80, 0), 0, -1e5, VIEWPORT);
		expect(north.latitude).toBe(MAX_CAMERA_LATITUDE);
		expect(south.latitude).toBe(-MAX_CAMERA_LATITUDE);
	});

	it('wraps the longitude', () => {
		const turned = rotateCamera(at(0, -179.9), 400, 0, VIEWPORT);
		expect(turned.longitude).toBeGreaterThan(0);
		expect(turned.longitude).toBeLessThanOrEqual(Math.PI);
	});

	it('leaves the distance alone', () => {
		expect(rotateCamera(at(0, 0, 2.5), 30, -20, VIEWPORT).distance).toBe(2.5);
	});
});

describe('cameraPosition', () => {
	it('is above the latitude and longitude at the distance', () => {
		const position = cameraPosition(at(35, -120, 2.5));
		expect(Math.hypot(...position)).toBeCloseTo(2.5, 12);
		const { latitudeDeg, longitudeDeg } = directionToLatLon(position);
		expect(latitudeDeg).toBeCloseTo(35, 9);
		expect(longitudeDeg).toBeCloseTo(-120, 9);
	});

	it('is on +X above the equator at longitude 0', () => {
		const [x, y, z] = cameraPosition(at(0, 0, 3));
		expect(x).toBeCloseTo(3, 12);
		expect(y).toBeCloseTo(0, 12);
		expect(z).toBeCloseTo(0, 12);
	});
});

describe('verticalFovDeg', () => {
	it('is the field of view for a view wider than tall', () => {
		expect(verticalFovDeg(1)).toBe(FIELD_OF_VIEW_DEG);
		expect(verticalFovDeg(1.8)).toBe(FIELD_OF_VIEW_DEG);
	});

	it('widens for a view taller than wide to keep the same width', () => {
		const vertical = verticalFovDeg(0.5);
		expect(vertical).toBeGreaterThan(FIELD_OF_VIEW_DEG);
		const horizontal = 2 * Math.atan(0.5 * Math.tan((vertical / 2) * DEG));
		expect(horizontal / DEG).toBeCloseTo(FIELD_OF_VIEW_DEG, 9);
	});
});

describe('viewRay', () => {
	it('starts at the camera', () => {
		const state = at(20, 50, 3);
		expect(viewRay(state, 0.3, -0.2, 1.5).origin).toEqual(
			cameraPosition(state),
		);
	});

	it('points at the place the camera is above through the middle', () => {
		const state = at(20, 50, 3);
		const { origin, direction } = viewRay(state, 0, 0, 1.5);
		const hit = raySphere(origin, direction) as Vec3;
		const { latitudeDeg, longitudeDeg } = directionToLatLon(hit);
		expect(latitudeDeg).toBeCloseTo(20, 9);
		expect(longitudeDeg).toBeCloseTo(50, 9);
	});

	it('has east to the right and north up', () => {
		const state = at(0, 0, 3);
		const right = viewRay(state, 0.2, 0, 1.5);
		const up = viewRay(state, 0, 0.2, 1.5);
		const east = directionToLatLon(
			raySphere(right.origin, right.direction) as Vec3,
		);
		const north = directionToLatLon(raySphere(up.origin, up.direction) as Vec3);
		expect(east.longitudeDeg).toBeGreaterThan(0);
		expect(east.latitudeDeg).toBeCloseTo(0, 9);
		expect(north.latitudeDeg).toBeGreaterThan(0);
		expect(north.longitudeDeg).toBeCloseTo(0, 9);
	});

	it('misses the globe at the corner of a distant view', () => {
		const { origin, direction } = viewRay(at(10, 10, 4), 1, 1, 1.5);
		expect(raySphere(origin, direction)).toBeNull();
	});

	it.each([
		{ aspect: 1.6, x: 0.35, y: -0.6 },
		{ aspect: 1.6, x: -0.9, y: 0.8 },
		{ aspect: 0.6, x: 0.5, y: 0.25 },
	])(
		'agrees with a Three.js camera placed the same way: %o',
		({ aspect, x, y }) => {
			const state = at(-40, 130, 2.2);
			const camera = new PerspectiveCamera(
				verticalFovDeg(aspect),
				aspect,
				0.01,
				10,
			);
			camera.position.set(...coreToThree(cameraPosition(state)));
			camera.up.set(...coreToThree([0, 0, 1]));
			camera.lookAt(0, 0, 0);
			camera.updateMatrixWorld();
			const through = new Vector3(x, y, 0.5).unproject(camera);
			const expected = normalise(
				threeToCore([
					through.x - camera.position.x,
					through.y - camera.position.y,
					through.z - camera.position.z,
				]),
			);
			const actual = normalise(viewRay(state, x, y, aspect).direction);
			for (let axis = 0; axis < 3; axis++) {
				expect(actual[axis]).toBeCloseTo(expected[axis] as number, 6);
			}
		},
	);
});
