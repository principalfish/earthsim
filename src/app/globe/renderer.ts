/**
 * The globe on the page: a Three.js scene holding the globe's mesh, the
 * sun's and the winds, as arrows or as streaks, drawn only when something
 * has changed, or at every frame while the streaks move.
 *
 * The mesh's own coordinates are core coordinates. Its model matrix is the
 * rotation into the Three.js frame, so the shaders look elevation up with
 * the vertex position as it is and nothing else needs converting.
 */

import {
	BufferAttribute,
	BufferGeometry,
	Mesh,
	PerspectiveCamera,
	PlaneGeometry,
	Scene,
	Vector3,
	WebGLRenderer,
} from 'three';
import {
	DEFAULT_PLANET,
	FACE_COUNT,
	latLonToDirection,
	type Rgb,
	SUN_LONGITUDE_DEG,
	sunColour,
	sunDrawnSize,
	type Vec3,
	type World,
} from '../../core/index';
import {
	CAMERA_NEAR,
	type CameraState,
	cameraPosition,
	clampCamera,
	createCameraState,
	MAX_CAMERA_DISTANCE,
	rotateCamera,
	verticalFovDeg,
	viewRay,
	zoomCamera,
} from './camera';
import { coreToThree } from './coords';
import { createFrameScheduler } from './frameLoop';
import { buildSphereMesh, meshSegments } from './geometry';
import {
	aimSunlight,
	type CellTexture,
	createCellTexture,
	createGlobeMaterial,
	drawnSeaLevel,
	MAX_EXAGGERATION,
	MIN_EXAGGERATION,
	type PreparedLayer,
	replaceLayer,
	type SunlightStyle,
	showLayer,
	showSunlight,
	unitSunDirection,
} from './material';
import { clientToNdc, raySphere } from './picking';
import type { ColourRamp, ValueRange } from './ramp';
import { createWindStreaks } from './streaks';
import { createSunMaterial, shapeSun, sunPosition } from './sun';
import { createWindArrows, pixelsPerRadian, type WindField } from './wind';
import {
	createWindMotion,
	DEFAULT_WIND_STYLE,
	type WindStyle,
} from './windMotion';

/** The most device pixels drawn per CSS pixel, to bound the cost per frame. */
const MAX_PIXEL_RATIO = 2;

/** Opacity of the cell grid's lines when shown. */
const GRID_OPACITY = 0.3;

/** A point of the window in CSS pixels, as pointer events report it. */
export type WindowPoint = {
	/** Distance from the left of the window. */
	readonly clientX: number;
	/** Distance from the top of the window. */
	readonly clientY: number;
};

/** A drawing of a world as a globe, on a canvas. */
export type Globe = {
	/**
	 * Shows a world, replacing any other.
	 *
	 * @remarks
	 * The globe keeps hold of the world's elevation array without copying
	 * it and takes the sea level from the world, drawing it as
	 * {@link Globe.setSeaLevel} would. After editing the array in place,
	 * call {@link Globe.updateElevation}. A data layer shown for the world
	 * before is dropped, so the height colours show until one is set for
	 * this world, and so are the winds.
	 */
	setWorld(world: World): void;
	/**
	 * Sends the world's elevation to the GPU again after it has been edited
	 * in place.
	 *
	 * @param faces - The cube faces (0 to 5) whose cells changed; every
	 * face when omitted.
	 * @throws RangeError if a face is not a whole number from 0 to 5.
	 */
	updateElevation(faces?: readonly number[]): void;
	/**
	 * Sets the sea level the globe is drawn with.
	 *
	 * @remarks
	 * Only the drawing is limited: the world's own sea level is not the
	 * globe's to change, so a world whose sea level lies outside the drawn
	 * range is shown with the nearest level in it. The camera's nearest
	 * distance relies on the lower limit, which bounds how tall the drawn
	 * relief can stand.
	 *
	 * @param metres - Sea level in metres against the datum; brought to
	 * single precision and within {@link MIN_DRAWN_SEA_LEVEL_M} and
	 * {@link MAX_DRAWN_SEA_LEVEL_M}.
	 * @throws RangeError if `metres` is NaN.
	 */
	setSeaLevel(metres: number): void;
	/**
	 * Sets how much relief is exaggerated.
	 *
	 * @param factor - What heights above the sea and slopes are multiplied
	 * by: 1 is true scale. Kept within the range the view offers.
	 */
	setExaggeration(factor: number): void;
	/** Shows or hides the outlines of the grid's cells. */
	setGridVisible(visible: boolean): void;
	/**
	 * Colours the globe by a per-cell data field in place of the height, or
	 * goes back to the height colours.
	 *
	 * @remarks
	 * The relief is still raised and shaded, and the coastline is drawn as a
	 * thin line. With no field, the globe is drawn exactly as it is when no
	 * layer has ever been set. The globe keeps hold of the field without
	 * copying it, so it must not be changed while shown; to show other
	 * values, set the layer again.
	 *
	 * @param field - One value per cell of the world on show, in cell order,
	 * or null to show the height colours.
	 * @param range - The values the ramp is stretched over: below `min` is
	 * drawn as its first colour and above `max` as its last. Needed with a
	 * field.
	 * @param ramp - The colours to draw the field with. Needed with a field.
	 * @throws RangeError if a field is given without a range and a ramp, with
	 * a range whose ends are not finite or not in order, with a ramp the
	 * globe cannot draw, or with a length other than the world's number of
	 * cells, or before any world is shown. The layer on show is then left as
	 * it was.
	 */
	setLayer(
		field: Float32Array | null,
		range?: ValueRange,
		ramp?: ColourRamp,
	): void;
	/**
	 * Shows the wind over the globe, as arrows or as streaks as
	 * {@link Globe.setWindStyle} says, or none.
	 *
	 * @remarks
	 * The arrows or streaks lie over whatever colours the globe shows,
	 * raised onto the relief as it is drawn, and follow changes of the
	 * terrain, the sea level and the exaggeration with nothing more done.
	 * The arrows' spacing and the streaks' number follow the zoom. A new
	 * world drops them. With none shown, the globe is drawn exactly as it is
	 * without them. Streaks shown in other winds carry on from where they
	 * are; shown again after none, they start afresh. The globe keeps hold
	 * of the field without copying it, so it must not be changed while
	 * shown; to show other winds, set them again.
	 *
	 * @param field - One month's wind or a mean of the year, one value of
	 * each part per cell of the world on show; or null for none.
	 * @throws RangeError if the field does not hold one value of each part
	 * per cell of the world on show; the winds shown are then left as they
	 * were.
	 */
	setWinds(field: WindField | null): void;
	/**
	 * Draws the winds as arrows or as streaks; it starts on arrows.
	 *
	 * @remarks
	 * While streaks are drawn, the arrows are not, and while there are winds
	 * to show and the page is visible the globe is drawn at every frame, the
	 * streaks moving on at each; at any other time it is drawn only when
	 * something changes, and nothing of the streaks' runs.
	 */
	setWindStyle(style: WindStyle): void;
	/**
	 * Takes whether the page is visible, rather than in a hidden tab: while
	 * it is not, the streaks stop and the globe is not drawn at every frame.
	 * It starts visible.
	 */
	setPageVisible(visible: boolean): void;
	/**
	 * Sets where the sun stands, how large it is drawn and its colour.
	 *
	 * @remarks
	 * The sun is always drawn, hidden only by the planet in front of it. It
	 * stays in its direction as the camera moves, as a body infinitely far
	 * away would. The direction is also the one the globe is lit from while
	 * sunlight is on.
	 *
	 * @param direction - The sun's direction in core coordinates; a finite,
	 * non-zero vector, normalised here.
	 * @param sizeDeg - The diameter it is drawn at, in degrees; more than 0
	 * and less than 12.
	 * @param colour - Its tint, each channel from 0 to 1.
	 * @throws RangeError for a direction, size or colour outside those; the
	 * sun is then drawn as before.
	 */
	setSun(direction: Vec3, sizeDeg: number, colour: Rgb): void;
	/**
	 * Lights the globe by the sun, or as it is lit without. It starts lit as
	 * without the sun.
	 *
	 * @remarks
	 * Lit with the night side darkened, the side facing the sun is lit and
	 * the far side dimmed. Lit with the line, the colours are shaded as they
	 * are without the sun and the line between day and night is drawn over
	 * them. Either holds whatever the globe is coloured by, the height or a
	 * data layer.
	 *
	 * @param style - How the globe is lit.
	 */
	setSunlight(style: SunlightStyle): void;
	/**
	 * The point of the globe under a point of the window.
	 *
	 * @param clientX - Horizontal position in CSS pixels from the left of
	 * the window, as pointer events report it.
	 * @param clientY - Vertical position in CSS pixels from the top of the
	 * window.
	 * @returns The unit direction of that point in core coordinates, or
	 * null when the position is off the globe. The globe is taken as a
	 * smooth sphere: relief is ignored.
	 */
	pick(clientX: number, clientY: number): Vec3 | null;
	/**
	 * Shows the outline of a brush on the globe under the cursor, or hides
	 * it.
	 *
	 * @remarks
	 * The outline is a thin ring at the brush's radius around the point
	 * {@link Globe.pick} finds under the cursor. That point is found afresh
	 * for every frame drawn, so the ring stays under a cursor that is still
	 * while the camera moves, and nothing is drawn while the cursor is off
	 * the globe.
	 *
	 * @param cursor - Where the cursor is, or null to hide the outline.
	 * @param radius - Angular radius of the brush in radians; needed
	 * whenever a cursor is given.
	 * @throws RangeError if a cursor is given without a positive, finite
	 * radius.
	 */
	setBrush(cursor: WindowPoint | null, radius?: number): void;
	/**
	 * Turns the globe as a drag across the canvas does.
	 *
	 * @param dxPx - Cursor movement to the right, in CSS pixels.
	 * @param dyPx - Cursor movement downwards, in CSS pixels.
	 */
	rotateBy(dxPx: number, dyPx: number): void;
	/**
	 * Zooms as the wheel does.
	 *
	 * @param wheelPixels - Distance scrolled, in pixels: positive moves
	 * away from the globe.
	 */
	zoomBy(wheelPixels: number): void;
	/** Where the camera is. */
	getCamera(): CameraState;
	/** Moves the camera; the state is brought within the camera's limits. */
	setCamera(state: CameraState): void;
	/**
	 * Draws the globe at once if anything has changed since it was last
	 * drawn, rather than at the next animation frame.
	 *
	 * @remarks
	 * For changes made from within an animation frame, which would
	 * otherwise not show until the frame after. While the streaks move,
	 * nothing: the globe is drawn at every frame already, and the next draws
	 * the change.
	 */
	draw(): void;
	/**
	 * Fits the drawing to the canvas's current size on the page and draws
	 * it at once. Called automatically when the canvas is resized.
	 */
	resize(): void;
	/** Stops drawing and frees everything held on the GPU. */
	dispose(): void;
};

const toVector3 = (v: Vec3): Vector3 => new Vector3(v[0], v[1], v[2]);

/**
 * Starts drawing a globe on a canvas.
 *
 * @remarks
 * Nothing is drawn until a world is set. The globe then redraws itself, at
 * most once per animation frame, whenever its world, settings, camera or
 * size change, and at every frame while the streaks move.
 *
 * @param canvas - The canvas to draw on. Its size on the page is left to
 * the stylesheet; the drawing follows it.
 * @returns The globe.
 * @throws Error if the browser cannot provide a WebGL 2 context.
 */
export const createGlobe = (canvas: HTMLCanvasElement): Globe => {
	let renderer: WebGLRenderer;
	try {
		renderer = new WebGLRenderer({
			canvas,
			antialias: true,
			alpha: true,
			// The sun's glow is blended in premultiplied colour, as the page
			// composites the canvas.
			premultipliedAlpha: true,
			powerPreference: 'high-performance',
		});
	} catch (cause) {
		throw new Error('This browser could not start WebGL 2 on the page', {
			cause,
		});
	}
	renderer.setClearColor(0x000000, 0);

	const scene = new Scene();
	const camera = new PerspectiveCamera();
	camera.near = CAMERA_NEAR;
	camera.far = MAX_CAMERA_DISTANCE + 2;

	const { material, uniforms } = createGlobeMaterial();
	const mesh = new Mesh(new BufferGeometry(), material);
	mesh.matrixAutoUpdate = false;
	mesh.matrix.makeBasis(
		toVector3(coreToThree([1, 0, 0])),
		toVector3(coreToThree([0, 1, 0])),
		toVector3(coreToThree([0, 0, 1])),
	);
	mesh.matrixWorldNeedsUpdate = true;
	// Relief moves vertices outside the bounds of the flat mesh.
	mesh.frustumCulled = false;
	mesh.visible = false;
	scene.add(mesh);

	// Until the page says otherwise, the Sun of Earth's settings, over the
	// equator.
	let sunDirection: Vec3 = latLonToDirection(0, SUN_LONGITUDE_DEG);
	const sun = createSunMaterial(
		sunDrawnSize(DEFAULT_PLANET),
		sunColour(DEFAULT_PLANET),
	);
	const sunMesh = new Mesh(new PlaneGeometry(2, 2), sun.material);
	// Moved with the camera at every frame and sized in its vertex shader,
	// so its bounds say nothing and it is never culled. It is drawn after
	// the globe, as transparent objects are.
	sunMesh.frustumCulled = false;
	sunMesh.renderOrder = 1;
	scene.add(sunMesh);

	// The arrows read the globe's own relief uniforms, so they stand on the
	// relief as it is drawn whatever changes it.
	const arrows = createWindArrows(uniforms);
	arrows.mesh.matrix.copy(mesh.matrix);
	arrows.mesh.matrixWorldNeedsUpdate = true;
	scene.add(arrows.mesh);

	// So do the streaks, which are in the scene in the arrows' place while
	// they are the way the winds are drawn.
	const streaks = createWindStreaks(uniforms);
	for (const streakMesh of streaks.meshes) {
		streakMesh.matrix.copy(mesh.matrix);
		streakMesh.matrixWorldNeedsUpdate = true;
	}
	let windStyle: WindStyle = DEFAULT_WIND_STYLE;

	let cameraState = createCameraState();
	let elevation: CellTexture | null = null;
	let layer: PreparedLayer | null = null;
	let segments = 0;
	let fullUploadPending = false;
	let brushCursor: WindowPoint | null = null;
	let brushRadius = 0;
	let disposed = false;

	const aspect = (): number => {
		const { clientWidth, clientHeight } = canvas;
		return clientWidth > 0 && clientHeight > 0 ? clientWidth / clientHeight : 1;
	};

	const pick = (clientX: number, clientY: number): Vec3 | null => {
		const [x, y] = clientToNdc(
			clientX,
			clientY,
			canvas.getBoundingClientRect(),
		);
		const { origin, direction } = viewRay(cameraState, x, y, aspect());
		return raySphere(origin, direction);
	};

	const render = (): void => {
		if (disposed) {
			return;
		}
		const eye = cameraPosition(cameraState);
		camera.position.copy(toVector3(coreToThree(eye)));
		sunMesh.position.copy(
			toVector3(coreToThree(sunPosition(eye, sunDirection))),
		);
		camera.up.copy(toVector3(coreToThree([0, 0, 1])));
		camera.lookAt(0, 0, 0);
		// Hidden arrows are not laid out again for the zoom; they are once
		// they are drawn again.
		if (windStyle === 'arrows') {
			arrows.setZoom(
				pixelsPerRadian(cameraState.distance, canvas.clientHeight, aspect()),
			);
		}
		const brushCentre =
			brushCursor === null
				? null
				: pick(brushCursor.clientX, brushCursor.clientY);
		if (brushCentre === null) {
			uniforms.uBrushRadius.value = 0;
		} else {
			uniforms.uBrushCentre.value.set(...brushCentre);
			uniforms.uBrushRadius.value = brushRadius;
		}
		renderer.render(scene, camera);
		fullUploadPending = false;
	};

	// The camera as the streaks are told of it: one object and one array,
	// filled in afresh each frame, since the streaks keep nothing of them.
	const streakEye: [number, number, number] = [0, 0, 0];
	const streakView = { eye: streakEye, widthPx: 0, heightPx: 0 };

	/** Moves the streaks on by a frame's time, for the camera as it is. */
	const moveStreaks = (seconds: number): void => {
		cameraPosition(cameraState, streakEye);
		streakView.widthPx = canvas.clientWidth;
		streakView.heightPx = canvas.clientHeight;
		streaks.update(seconds, streakView);
	};

	const frames = createFrameScheduler({
		requestFrame: (callback) => requestAnimationFrame(callback),
		cancelFrame: (handle) => cancelAnimationFrame(handle),
		now: () => performance.now(),
		draw: (seconds) => {
			if (seconds !== null && !disposed) {
				moveStreaks(seconds);
			}
			render();
		},
	});
	const motion = createWindMotion(frames);

	const invalidate = (): void => frames.invalidate();

	const draw = (): void => frames.flush();

	const resize = (): void => {
		const { clientWidth, clientHeight } = canvas;
		if (disposed || clientWidth === 0 || clientHeight === 0) {
			return;
		}
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
		renderer.setSize(clientWidth, clientHeight, false);
		camera.aspect = clientWidth / clientHeight;
		camera.fov = verticalFovDeg(camera.aspect);
		camera.updateProjectionMatrix();
		arrows.setViewport(clientWidth, clientHeight);
		streaks.setViewport(clientWidth, clientHeight);
		// Resizing clears the canvas, so it is redrawn before the browser
		// paints rather than a frame later.
		frames.drawNow();
	};

	const observer = new ResizeObserver(resize);
	observer.observe(canvas);
	resize();

	// Moving the window to a screen with another scale changes the pixel
	// ratio but not the canvas's size on the page, so the observer stays
	// silent. A media query matches one ratio only, so it is made again for
	// each new ratio.
	let pixelRatioQuery: MediaQueryList;
	const onPixelRatioChange = (): void => {
		watchPixelRatio();
		resize();
	};
	const watchPixelRatio = (): void => {
		pixelRatioQuery = window.matchMedia(
			`(resolution: ${window.devicePixelRatio}dppx)`,
		);
		pixelRatioQuery.addEventListener('change', onPixelRatioChange, {
			once: true,
		});
	};
	watchPixelRatio();
	canvas.addEventListener('webglcontextrestored', invalidate);

	const setWorld = (world: World): void => {
		elevation?.texture.dispose();
		elevation = createCellTexture(world.elevation, world.resolution);
		fullUploadPending = true;
		layer?.texture.dispose();
		layer = null;
		showLayer(uniforms, null);
		uniforms.uElevation.value = elevation.texture;
		uniforms.uResolution.value = world.resolution;
		uniforms.uSeaLevel.value = drawnSeaLevel(world.seaLevel);
		arrows.setWorld(world.resolution);
		streaks.setWorld(world.resolution);
		motion.setHasWinds(false);

		const wanted = meshSegments(world.resolution);
		if (wanted !== segments) {
			const { positions, indices } = buildSphereMesh(wanted);
			mesh.geometry.dispose();
			mesh.geometry = new BufferGeometry();
			mesh.geometry.setAttribute('position', new BufferAttribute(positions, 3));
			mesh.geometry.setIndex(new BufferAttribute(indices, 1));
			segments = wanted;
		}
		mesh.visible = true;
		invalidate();
	};

	const updateElevation = (faces?: readonly number[]): void => {
		for (const face of faces ?? []) {
			if (!Number.isInteger(face) || face < 0 || face >= FACE_COUNT) {
				throw new RangeError(
					`A cube face must be a whole number from 0 to 5; got ${face}`,
				);
			}
		}
		if (elevation === null) {
			return;
		}
		// Three.js uploads a cube texture whole. Single faces are written
		// straight into the texture it created, through its own state
		// tracker so that its record of what is bound stays true.
		// `__webglTexture` is private to Three.js, as is what the renderer's
		// `properties` and `state` hold: when the handle is missing the
		// whole texture is uploaded instead, and all three must be checked
		// again whenever Three.js is upgraded.
		const handle = (
			renderer.properties.get(elevation.texture) as {
				__webglTexture?: WebGLTexture;
			}
		).__webglTexture;
		if (faces === undefined || fullUploadPending || handle === undefined) {
			elevation.texture.needsUpdate = true;
			fullUploadPending = true;
		} else {
			// The renderer only ever runs on WebGL 2.
			const gl = renderer.getContext() as WebGL2RenderingContext;
			const { state } = renderer;
			const n = elevation.resolution;
			state.bindTexture(gl.TEXTURE_CUBE_MAP, handle);
			state.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
			state.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
			state.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
			state.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
			for (const face of new Set(faces)) {
				gl.texSubImage2D(
					gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
					0,
					0,
					0,
					n,
					n,
					gl.RED,
					gl.FLOAT,
					elevation.faces[face] as Float32Array,
				);
			}
		}
		invalidate();
	};

	const setSeaLevel = (metres: number): void => {
		uniforms.uSeaLevel.value = drawnSeaLevel(metres);
		invalidate();
	};

	const setExaggeration = (factor: number): void => {
		if (Number.isNaN(factor)) {
			throw new RangeError('A relief exaggeration must be a number; got NaN');
		}
		uniforms.uExaggeration.value = Math.min(
			MAX_EXAGGERATION,
			Math.max(MIN_EXAGGERATION, factor),
		);
		invalidate();
	};

	const setGridVisible = (visible: boolean): void => {
		uniforms.uGridOpacity.value = visible ? GRID_OPACITY : 0;
		invalidate();
	};

	const setLayer = (
		field: Float32Array | null,
		range?: ValueRange,
		ramp?: ColourRamp,
	): void => {
		layer = replaceLayer(
			uniforms,
			layer,
			elevation?.resolution ?? null,
			field,
			range,
			ramp,
		);
		invalidate();
	};

	const setWinds = (field: WindField | null): void => {
		// The arrows check the field first, and throw before anything changes.
		arrows.setWinds(field);
		streaks.setWinds(field);
		motion.setHasWinds(field !== null);
		invalidate();
	};

	const setWindStyle = (style: WindStyle): void => {
		if (style === windStyle) {
			return;
		}
		windStyle = style;
		if (style === 'streaks') {
			scene.remove(arrows.mesh);
			scene.add(...streaks.meshes);
		} else {
			scene.remove(...streaks.meshes);
			scene.add(arrows.mesh);
		}
		motion.setStyle(style);
		invalidate();
	};

	const setSun = (direction: Vec3, sizeDeg: number, colour: Rgb): void => {
		// Everything is checked before anything changes.
		const unit = unitSunDirection(direction);
		shapeSun(sun.uniforms, sizeDeg, colour);
		aimSunlight(uniforms, unit);
		sunDirection = unit;
		invalidate();
	};

	const setSunlight = (style: SunlightStyle): void => {
		showSunlight(uniforms, style);
		invalidate();
	};

	const setBrush = (cursor: WindowPoint | null, radius = 0): void => {
		if (cursor === null) {
			if (brushCursor !== null) {
				brushCursor = null;
				invalidate();
			}
			return;
		}
		if (!(radius > 0) || !Number.isFinite(radius)) {
			throw new RangeError(
				`A brush radius must be a positive angle in radians; got ${radius}`,
			);
		}
		if (
			brushCursor !== null &&
			brushCursor.clientX === cursor.clientX &&
			brushCursor.clientY === cursor.clientY &&
			brushRadius === radius
		) {
			return;
		}
		// Copied, so that an event passed in is not kept alive.
		brushCursor = { clientX: cursor.clientX, clientY: cursor.clientY };
		brushRadius = radius;
		invalidate();
	};

	const setCamera = (state: CameraState): void => {
		cameraState = clampCamera(state);
		invalidate();
	};

	const rotateBy = (dxPx: number, dyPx: number): void => {
		const heightPx = canvas.clientHeight;
		if (heightPx > 0) {
			setCamera(
				rotateCamera(cameraState, dxPx, dyPx, { heightPx, aspect: aspect() }),
			);
		}
	};

	const zoomBy = (wheelPixels: number): void => {
		setCamera(zoomCamera(cameraState, wheelPixels));
	};

	const dispose = (): void => {
		disposed = true;
		frames.dispose();
		observer.disconnect();
		pixelRatioQuery.removeEventListener('change', onPixelRatioChange);
		canvas.removeEventListener('webglcontextrestored', invalidate);
		elevation?.texture.dispose();
		layer?.texture.dispose();
		mesh.geometry.dispose();
		material.dispose();
		sunMesh.geometry.dispose();
		sun.material.dispose();
		arrows.dispose();
		streaks.dispose();
		renderer.dispose();
	};

	return {
		setWorld,
		updateElevation,
		setSeaLevel,
		setExaggeration,
		setGridVisible,
		setLayer,
		setWinds,
		setWindStyle,
		setPageVisible: (visible) => motion.setPageVisible(visible),
		setSun,
		setSunlight,
		pick,
		setBrush,
		rotateBy,
		zoomBy,
		getCamera: () => cameraState,
		setCamera,
		draw,
		resize,
		dispose,
	};
};
