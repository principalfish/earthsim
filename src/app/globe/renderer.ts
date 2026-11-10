/**
 * The globe on the page: a Three.js scene holding one mesh, drawn only when
 * something has changed.
 *
 * The mesh's own coordinates are core coordinates. Its model matrix is the
 * rotation into the Three.js frame, so the shaders look elevation up with
 * the vertex position as it is and nothing else needs converting.
 */

import {
	BufferAttribute,
	BufferGeometry,
	CubeTexture,
	DataTexture,
	FloatType,
	Mesh,
	NearestFilter,
	PerspectiveCamera,
	RedFormat,
	Scene,
	Vector3,
	WebGLRenderer,
} from 'three';
import { FACE_COUNT, type Vec3, type World } from '../../core/index';
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
import { buildSphereMesh, meshSegments } from './geometry';
import {
	createGlobeMaterial,
	drawnSeaLevel,
	MAX_EXAGGERATION,
	MIN_EXAGGERATION,
} from './material';
import { clientToNdc, raySphere } from './picking';

/** The most device pixels drawn per CSS pixel, to bound the cost per frame. */
const MAX_PIXEL_RATIO = 2;

/** Opacity of the cell grid's lines when shown. */
const GRID_OPACITY = 0.3;

/** A drawing of a world as a globe, on a canvas. */
export type Globe = {
	/**
	 * Shows a world, replacing any other.
	 *
	 * @remarks
	 * The globe keeps hold of the world's elevation array without copying
	 * it and takes the sea level from the world, drawing it as
	 * {@link Globe.setSeaLevel} would. After editing the array in place,
	 * call {@link Globe.updateElevation}.
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
	 * Fits the drawing to the canvas's current size on the page and draws
	 * it at once. Called automatically when the canvas is resized.
	 */
	resize(): void;
	/** Stops drawing and frees everything held on the GPU. */
	dispose(): void;
};

/** The elevation texture of one world and the views it uploads from. */
type ElevationTexture = {
	readonly texture: CubeTexture;
	readonly resolution: number;
	/** Each face's cells: a view into the world's array, not a copy. */
	readonly faces: readonly Float32Array[];
};

const toVector3 = (v: Vec3): Vector3 => new Vector3(v[0], v[1], v[2]);

const createElevationTexture = (world: World): ElevationTexture => {
	const n = world.resolution;
	const faces: Float32Array[] = [];
	for (let face = 0; face < FACE_COUNT; face++) {
		faces.push(world.elevation.subarray(face * n * n, (face + 1) * n * n));
	}
	// The grid lays its faces out as a cube map in core coordinates, so the
	// faces go in as they are, in order and unflipped: cell (face, i, j) is
	// texel (i, j) of that face.
	const texture = new CubeTexture(
		faces.map((data) => new DataTexture(data, n, n, RedFormat, FloatType)),
	);
	texture.format = RedFormat;
	texture.type = FloatType;
	// Linear filtering of float textures is an optional extension, and its
	// blend weights are too coarse for a cell magnified over many pixels.
	texture.magFilter = NearestFilter;
	texture.minFilter = NearestFilter;
	texture.generateMipmaps = false;
	texture.flipY = false;
	texture.needsUpdate = true;
	return { texture, resolution: n, faces };
};

/**
 * Starts drawing a globe on a canvas.
 *
 * @remarks
 * Nothing is drawn until a world is set. The globe then redraws itself, at
 * most once per animation frame, whenever its world, settings, camera or
 * size change.
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

	let cameraState = createCameraState();
	let elevation: ElevationTexture | null = null;
	let segments = 0;
	let fullUploadPending = false;
	let frame = 0;
	let disposed = false;

	const aspect = (): number => {
		const { clientWidth, clientHeight } = canvas;
		return clientWidth > 0 && clientHeight > 0 ? clientWidth / clientHeight : 1;
	};

	const render = (): void => {
		frame = 0;
		if (disposed) {
			return;
		}
		camera.position.copy(toVector3(coreToThree(cameraPosition(cameraState))));
		camera.up.copy(toVector3(coreToThree([0, 0, 1])));
		camera.lookAt(0, 0, 0);
		renderer.render(scene, camera);
		fullUploadPending = false;
	};

	const invalidate = (): void => {
		if (frame === 0 && !disposed) {
			frame = requestAnimationFrame(render);
		}
	};

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
		// Resizing clears the canvas, so it is redrawn before the browser
		// paints rather than a frame later.
		if (frame !== 0) {
			cancelAnimationFrame(frame);
		}
		render();
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
		elevation = createElevationTexture(world);
		fullUploadPending = true;
		uniforms.uElevation.value = elevation.texture;
		uniforms.uResolution.value = world.resolution;
		uniforms.uSeaLevel.value = drawnSeaLevel(world.seaLevel);

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

	const pick = (clientX: number, clientY: number): Vec3 | null => {
		const [x, y] = clientToNdc(
			clientX,
			clientY,
			canvas.getBoundingClientRect(),
		);
		const { origin, direction } = viewRay(cameraState, x, y, aspect());
		return raySphere(origin, direction);
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
		if (frame !== 0) {
			cancelAnimationFrame(frame);
		}
		observer.disconnect();
		pixelRatioQuery.removeEventListener('change', onPixelRatioChange);
		canvas.removeEventListener('webglcontextrestored', invalidate);
		elevation?.texture.dispose();
		mesh.geometry.dispose();
		material.dispose();
		renderer.dispose();
	};

	return {
		setWorld,
		updateElevation,
		setSeaLevel,
		setExaggeration,
		setGridVisible,
		pick,
		rotateBy,
		zoomBy,
		getCamera: () => cameraState,
		setCamera,
		resize,
		dispose,
	};
};
