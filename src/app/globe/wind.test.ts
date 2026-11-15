import { describe, expect, it } from 'vitest';
import {
	cellFrames,
	type Grid,
	getGrid,
	SUPPORTED_RESOLUTIONS,
} from '../../core/index';
import {
	CAMERA_NEAR,
	createCameraState,
	MAX_CAMERA_DISTANCE,
	MIN_CAMERA_DISTANCE,
	viewRay,
} from './camera';
import { createGlobeMaterial } from './material';
import { raySphere } from './picking';
import {
	ARROW_CAP_SPEED,
	ARROW_MAX_LENGTH_PX,
	ARROW_MIN_LENGTH_PX,
	ARROW_SPACING_SHARE,
	ARROW_SPACINGS_DEG,
	type ArrowBuffers,
	arrowOutline,
	arrowPatches,
	arrowSamples,
	arrowShape,
	arrowSpacingFor,
	CALM_SPEED,
	createWindArrowMaterial,
	createWindArrows,
	HEAD_MAX_SHARE,
	patchesFor,
	patchWinds,
	pixelsPerRadian,
	type WindField,
	writeArrows,
} from './wind';

const RADIANS_PER_DEGREE = Math.PI / 180;

/** The angle between two unit vectors held in arrays. */
const angleBetween = (
	a: ArrayLike<number>,
	aAt: number,
	b: ArrayLike<number>,
	bAt: number,
): number => {
	const ax = a[aAt] as number;
	const ay = a[aAt + 1] as number;
	const az = a[aAt + 2] as number;
	const bx = b[bAt] as number;
	const by = b[bAt + 1] as number;
	const bz = b[bAt + 2] as number;
	return Math.atan2(
		Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx),
		ax * bx + ay * by + az * bz,
	);
};

/** The point of a lattice nearest a direction, found by trying them all. */
const nearestOf = (samples: Float64Array, point: ArrayLike<number>): number => {
	let best = 0;
	let bestAngle = Number.POSITIVE_INFINITY;
	for (let i = 0; i < samples.length / 3; i++) {
		const angle = angleBetween(samples, 3 * i, point, 0);
		if (angle < bestAngle) {
			bestAngle = angle;
			best = i;
		}
	}
	return best;
};

/** A wind given by its eastward and northward parts at every cell. */
const uniformWind = (grid: Grid, east: number, north: number): WindField => ({
	east: new Float32Array(grid.cellCount).fill(east),
	north: new Float32Array(grid.cellCount).fill(north),
});

/** The wind that is one fixed vector everywhere, flattened onto the sphere. */
const fixedVectorWind = (
	grid: Grid,
	vector: readonly [number, number, number],
): WindField => {
	const { east, north } = cellFrames(grid);
	const field = uniformWind(grid, 0, 0);
	const [x, y, z] = vector;
	for (let cell = 0; cell < grid.cellCount; cell++) {
		(field.east as Float32Array)[cell] =
			x * (east.x[cell] as number) + y * (east.y[cell] as number);
		(field.north as Float32Array)[cell] =
			x * (north.x[cell] as number) +
			y * (north.y[cell] as number) +
			z * (north.z[cell] as number);
	}
	return field;
};

describe('arrowSamples', () => {
	it.each(ARROW_SPACINGS_DEG)(
		'gives unit vectors, about 4π / s² of them, at %s°',
		(spacing) => {
			const samples = arrowSamples(spacing);
			const count = samples.length / 3;
			const expected = (4 * Math.PI) / (spacing * RADIANS_PER_DEGREE) ** 2;
			expect(Math.abs(count - expected)).toBeLessThan(1);
			for (let i = 0; i < count; i++) {
				expect(
					Math.hypot(
						samples[3 * i] as number,
						samples[3 * i + 1] as number,
						samples[3 * i + 2] as number,
					),
				).toBeCloseTo(1, 12);
			}
		},
	);

	it.each(ARROW_SPACINGS_DEG)(
		'puts no two points closer than 0.85 of the spacing, at %s°',
		(spacing) => {
			const samples = arrowSamples(spacing);
			const count = samples.length / 3;
			const limit = 0.85 * spacing * RADIANS_PER_DEGREE;
			// Points are in order of z, so only those close in z can be close.
			const zLimit = limit;
			let closest = Number.POSITIVE_INFINITY;
			for (let i = 0; i < count; i++) {
				for (let j = i + 1; j < count; j++) {
					if (
						(samples[3 * i + 2] as number) - (samples[3 * j + 2] as number) >
						zLimit
					) {
						break;
					}
					closest = Math.min(
						closest,
						angleBetween(samples, 3 * i, samples, 3 * j),
					);
				}
			}
			expect(closest).toBeGreaterThan(limit);
		},
	);

	it.each(ARROW_SPACINGS_DEG)(
		'leaves no cell centre of the 64 grid, near the poles and cube edges included, farther than 0.8 of the spacing from a point, at %s°',
		(spacing) => {
			const grid = getGrid(64);
			const { owner, samples } = arrowPatches(grid, spacing);
			const limit = 0.8 * spacing * RADIANS_PER_DEGREE;
			let farthest = 0;
			for (let cell = 0; cell < grid.cellCount; cell++) {
				farthest = Math.max(
					farthest,
					angleBetween(
						grid.centres,
						3 * cell,
						samples,
						3 * (owner[cell] as number),
					),
				);
			}
			expect(farthest).toBeLessThan(limit);
		},
	);

	it('refuses a spacing that is not a positive number', () => {
		for (const spacing of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(() => arrowSamples(spacing)).toThrow(RangeError);
		}
	});
});

describe('arrowPatches', () => {
	it.each(SUPPORTED_RESOLUTIONS.slice(0, 2))(
		'gives every cell of the %s grid to the point nearest its centre',
		(resolution) => {
			const grid = getGrid(resolution);
			for (const spacing of [ARROW_SPACINGS_DEG[0], 2]) {
				const { owner, samples, area } = arrowPatches(grid, spacing);
				// Cells near the poles, along the cube's edges and at its
				// corners, and a spread of others, checked against every point.
				const n = grid.n;
				const cells = new Set<number>();
				for (let face = 0; face < 6; face++) {
					for (let k = 0; k < n; k += 3) {
						cells.add((face * n + 0) * n + k);
						cells.add((face * n + k) * n + (n - 1));
						cells.add((face * n + (n >> 1)) * n + k);
					}
				}
				for (let cell = 0; cell < grid.cellCount; cell++) {
					if (Math.abs(grid.centres[3 * cell + 2] as number) > 0.995) {
						cells.add(cell);
					}
				}
				for (const cell of cells) {
					const best = nearestOf(samples, grid.centres.subarray(3 * cell));
					expect(
						angleBetween(
							samples,
							3 * (owner[cell] as number),
							grid.centres,
							3 * cell,
						),
					).toBeCloseTo(
						angleBetween(samples, 3 * best, grid.centres, 3 * cell),
						12,
					);
				}
				const total = area.reduce((sum, a) => sum + a, 0);
				expect(total).toBeCloseTo(4 * Math.PI, 9);
			}
		},
	);

	it('throws for a cell with no point within reach, rather than lose its area', () => {
		const real = getGrid(64);
		// One centre moved to the middle of the sphere, far from every point.
		const centres = Float64Array.from(real.centres);
		centres.fill(0, 300, 303);
		const doctored: Grid = { ...real, centres };
		expect(() => arrowPatches(doctored, 8)).toThrow(/Cell 100 has no arrow/);
	});

	it('gives every point a patch of about the same area, none empty', () => {
		const grid = getGrid(128);
		for (const spacing of ARROW_SPACINGS_DEG) {
			const { area, count } = arrowPatches(grid, spacing);
			const mean = (4 * Math.PI) / count;
			for (const a of area) {
				expect(a).toBeGreaterThan(0.5 * mean);
				expect(a).toBeLessThan(1.6 * mean);
			}
		}
	});

	it('is worked out once for each grid and spacing, and kept', () => {
		expect(patchesFor(64, 4)).toBe(patchesFor(64, 4));
		expect(patchesFor(64, 4)).not.toBe(patchesFor(128, 4));
		expect(patchesFor(64, 4)).not.toBe(patchesFor(64, 8));
	});
});

describe('patchWinds', () => {
	const grid = getGrid(64);

	/** Each arrow's wind for a field, at a spacing. */
	const windsOf = (field: WindField, spacing: number) => {
		const patches = patchesFor(64, spacing);
		const out = new Float64Array(3 * patches.count);
		patchWinds(grid, patches, field, out);
		return { patches, out };
	};

	it.each([
		['eastward', 6, 0],
		['northward', 0, 6],
		['north-eastward', 4, -3],
	])(
		'points every arrow with a uniform %s wind, at its own east and north',
		(_name, east, north) => {
			for (const spacing of [8, 2]) {
				const { patches, out } = windsOf(
					uniformWind(grid, east, north),
					spacing,
				);
				const speed = Math.hypot(east, north);
				for (let i = 0; i < patches.count; i++) {
					const [x, y, z] = [
						patches.samples[3 * i] as number,
						patches.samples[3 * i + 1] as number,
						patches.samples[3 * i + 2] as number,
					];
					// Near the poles east and north turn too fast across the
					// coarsest patches for their mean to keep its parts; the
					// next case covers the poles.
					if (Math.abs(z) > Math.sin(70 * RADIANS_PER_DEGREE)) {
						continue;
					}
					const across = Math.hypot(x, y);
					const eastDir = [-y / across, x / across, 0];
					const northDir = [(-z * x) / across, (-z * y) / across, across];
					const expected = [0, 1, 2].map(
						(k) =>
							east * (eastDir[k] as number) + north * (northDir[k] as number),
					);
					const got = [
						out[3 * i] as number,
						out[3 * i + 1] as number,
						out[3 * i + 2] as number,
					] as const;
					expect(angleBetween(got, 0, expected, 0)).toBeLessThan(
						3 * RADIANS_PER_DEGREE,
					);
					const length = Math.hypot(...got);
					expect(Math.abs(length - speed) / speed).toBeLessThan(0.03);
					// Flat on the sphere at the arrow's point.
					expect(got[0] * x + got[1] * y + got[2] * z).toBeCloseTo(0, 9);
				}
			}
		},
	);

	it('points arrows over a pole along the wind there, east and north turning right round across the patches', () => {
		const vector = [3, 4, 0] as const;
		for (const spacing of ARROW_SPACINGS_DEG) {
			const { patches, out } = windsOf(fixedVectorWind(grid, vector), spacing);
			let checked = 0;
			for (let i = 0; i < patches.count; i++) {
				const z = patches.samples[3 * i + 2] as number;
				if (Math.abs(z) < Math.cos(2 * spacing * RADIANS_PER_DEGREE)) {
					continue;
				}
				checked++;
				const [x, y] = [
					patches.samples[3 * i] as number,
					patches.samples[3 * i + 1] as number,
				];
				const up = vector[0] * x + vector[1] * y;
				const expected = [vector[0] - up * x, vector[1] - up * y, -up * z];
				const got = [out[3 * i], out[3 * i + 1], out[3 * i + 2]] as number[];
				expect(angleBetween(got, 0, expected, 0)).toBeLessThan(
					2 * RADIANS_PER_DEGREE,
				);
				expect(Math.hypot(...got)).toBeCloseTo(Math.hypot(...expected), 1);
			}
			expect(checked).toBeGreaterThan(1);
		}
	});

	it('averages the cells of a patch by area, as vectors', () => {
		const patches = patchesFor(64, 8);
		const field = uniformWind(grid, 0, 0);
		// One cell of the first patch blows east; the mean is that wind
		// times the cell's share of the patch's area.
		const cell = patches.owner.indexOf(0);
		(field.east as Float32Array)[cell] = 10;
		const out = new Float64Array(3 * patches.count);
		patchWinds(grid, patches, field, out);
		const share = (grid.areas[cell] as number) / (patches.area[0] as number);
		expect(
			Math.hypot(out[0] as number, out[1] as number, out[2] as number),
		).toBeCloseTo(10 * share, 2);
		expect(Math.hypot(...out.subarray(3, 3 * patches.count))).toBe(0);
	});

	it('refuses a field without one value of each part per cell', () => {
		const patches = patchesFor(64, 8);
		const out = new Float64Array(3 * patches.count);
		expect(() =>
			patchWinds(grid, patches, { east: [1], north: [1] }, out),
		).toThrow(RangeError);
	});
});

describe('arrowShape', () => {
	it('draws nothing for a calm, or for a speed that is not a number', () => {
		expect(arrowShape(0)).toBeNull();
		expect(arrowShape(CALM_SPEED - 0.01)).toBeNull();
		expect(arrowShape(Number.NaN)).toBeNull();
		expect(arrowShape(CALM_SPEED)?.length).toBe(ARROW_MIN_LENGTH_PX);
	});

	it('grows longer and heavier with the speed up to the cap, and no further', () => {
		let previous = arrowShape(CALM_SPEED);
		for (let speed = 1; speed <= ARROW_CAP_SPEED; speed += 1) {
			const shape = arrowShape(speed);
			expect(shape?.length).toBeGreaterThan(previous?.length ?? 0);
			expect(shape?.shaftHalfWidth).toBeGreaterThan(
				previous?.shaftHalfWidth ?? 0,
			);
			previous = shape;
		}
		const capped = arrowShape(ARROW_CAP_SPEED);
		expect(capped?.length).toBe(ARROW_MAX_LENGTH_PX);
		expect(arrowShape(3 * ARROW_CAP_SPEED)).toEqual(capped);
		expect(arrowShape(Number.POSITIVE_INFINITY)).toEqual(capped);
	});

	it('keeps the head to its share of the arrow, wider than the shaft', () => {
		for (const speed of [CALM_SPEED, 3, ARROW_CAP_SPEED]) {
			const shape = arrowShape(speed);
			if (shape === null) {
				throw new Error('No arrow');
			}
			expect(shape.headLength).toBeLessThanOrEqual(
				HEAD_MAX_SHARE * shape.length,
			);
			expect(shape.headHalfWidth).toBeGreaterThan(shape.shaftHalfWidth);
		}
	});

	it('has an outline from the tail to the tip, as wide as its head', () => {
		const shape = arrowShape(ARROW_CAP_SPEED);
		if (shape === null) {
			throw new Error('No arrow');
		}
		const outline = arrowOutline(shape);
		expect(outline).toHaveLength(7);
		expect(Math.min(...outline.map(([x]) => x))).toBe(0);
		expect(Math.max(...outline.map(([x]) => x))).toBe(shape.length);
		expect(Math.max(...outline.map(([, y]) => y))).toBe(shape.headHalfWidth);
	});
});

describe('writeArrows', () => {
	const grid = getGrid(64);
	const buffersFor = (count: number): ArrowBuffers => ({
		anchor: new Float32Array(3 * count),
		wind: new Float32Array(3 * count),
		shape: new Float32Array(2 * count),
	});

	it('writes nothing where the wind is calm', () => {
		const patches = patchesFor(64, 4);
		const winds = new Float64Array(3 * patches.count);
		patchWinds(grid, patches, uniformWind(grid, 0.2, 0.2), winds);
		expect(writeArrows(patches, winds, buffersFor(patches.count))).toBe(0);
	});

	it('writes each windy arrow’s point, its unit direction and its shape, the calm ones left out', () => {
		const patches = patchesFor(64, 8);
		// The northern hemisphere's cells blow east at 7 m/s; the rest are
		// calm.
		const field = uniformWind(grid, 0, 0);
		for (let cell = 0; cell < grid.cellCount; cell++) {
			if ((grid.centres[3 * cell + 2] as number) > 0) {
				(field.east as Float32Array)[cell] = 7;
			}
		}
		const winds = new Float64Array(3 * patches.count);
		patchWinds(grid, patches, field, winds);
		const out = buffersFor(patches.count);
		const drawn = writeArrows(patches, winds, out);
		let windy = 0;
		for (let i = 0; i < patches.count; i++) {
			const speed = Math.hypot(
				winds[3 * i] as number,
				winds[3 * i + 1] as number,
				winds[3 * i + 2] as number,
			);
			if (speed >= CALM_SPEED) {
				const at = 3 * windy;
				expect(out.anchor[at]).toBeCloseTo(patches.samples[3 * i] as number, 6);
				expect(out.anchor[at + 2]).toBeCloseTo(
					patches.samples[3 * i + 2] as number,
					6,
				);
				expect(
					Math.hypot(
						out.wind[at] as number,
						out.wind[at + 1] as number,
						out.wind[at + 2] as number,
					),
				).toBeCloseTo(1, 6);
				expect(out.shape[2 * windy]).toBeCloseTo(
					arrowShape(speed)?.length ?? 0,
					4,
				);
				windy++;
			}
		}
		expect(drawn).toBe(windy);
		expect(drawn).toBeGreaterThan(patches.count / 3);
		expect(drawn).toBeLessThan((2 * patches.count) / 3);
	});
});

describe('arrowSpacingFor', () => {
	it('steps finer as the camera comes closer, from the coarsest far out to the finest close in', () => {
		const heightPx = 900;
		let previous: number = ARROW_SPACINGS_DEG[0];
		const seen = new Set<number>();
		for (
			let distance = MAX_CAMERA_DISTANCE;
			distance >= MIN_CAMERA_DISTANCE;
			distance -= 0.01
		) {
			const spacing = arrowSpacingFor(pixelsPerRadian(distance, heightPx, 1.2));
			expect(spacing).toBeLessThanOrEqual(previous);
			previous = spacing;
			seen.add(spacing);
		}
		expect([...seen]).toEqual([...ARROW_SPACINGS_DEG]);
	});

	it('keeps the longest arrow within its share of the spacing on the screen, and shorter than the closest neighbours there, at every zoom of a globe at least 560 pixels tall', () => {
		for (const heightPx of [560, 900, 1600]) {
			for (
				let distance = MIN_CAMERA_DISTANCE;
				distance <= MAX_CAMERA_DISTANCE;
				distance += 0.01
			) {
				const pixels = pixelsPerRadian(distance, heightPx, 1.5);
				const spacing = arrowSpacingFor(pixels);
				const onScreen = spacing * RADIANS_PER_DEGREE * pixels;
				if (spacing !== ARROW_SPACINGS_DEG[0]) {
					expect(ARROW_MAX_LENGTH_PX).toBeLessThanOrEqual(
						ARROW_SPACING_SHARE * onScreen,
					);
				}
				expect(ARROW_MAX_LENGTH_PX).toBeLessThan(0.85 * onScreen);
			}
		}
	});
});

describe('pixelsPerRadian', () => {
	it('is how far on the screen the surface nearest the camera moves for an angle', () => {
		const camera = { ...createCameraState(), latitude: 0, longitude: 0 };
		for (const distance of [MIN_CAMERA_DISTANCE, 2, MAX_CAMERA_DISTANCE]) {
			const heightPx = 800;
			const aspect = 1.4;
			const pixels = pixelsPerRadian(distance, heightPx, aspect);
			// Ten pixels up from the middle of the view, as a share of half
			// the height.
			const ndcY = 10 / (heightPx / 2);
			const { origin, direction } = viewRay(
				{ ...camera, distance },
				0,
				ndcY,
				aspect,
			);
			const hit = raySphere(origin, direction);
			if (hit === null) {
				throw new Error('The ray missed the globe');
			}
			const angle = Math.atan2(hit[2], hit[0]);
			expect(angle * pixels).toBeCloseTo(10, 1);
		}
		expect(CAMERA_NEAR).toBeLessThan(MIN_CAMERA_DISTANCE - 1);
	});
});

describe('createWindArrowMaterial', () => {
	const { uniforms: globe } = createGlobeMaterial();
	const { material, uniforms } = createWindArrowMaterial(globe);

	it('reads the globe’s own relief uniforms, not copies of them', () => {
		expect(uniforms.uElevation).toBe(globe.uElevation);
		expect(uniforms.uResolution).toBe(globe.uResolution);
		expect(uniforms.uSeaLevel).toBe(globe.uSeaLevel);
		expect(uniforms.uExaggeration).toBe(globe.uExaggeration);
	});

	it('raises each arrow by the globe’s relief rule, with a clearance, in its vertex shader', () => {
		expect(material.vertexShader).toContain('vec3 raisedSurface(vec3 d)');
		expect(material.vertexShader).toContain(
			'raisedSurface(aAnchor) + CLEARANCE * aAnchor',
		);
		expect(material.vertexShader).toContain('uniform float uExaggeration;');
		expect(material.vertexShader).toContain('uniform float uSeaLevel;');
	});

	it('hides the far side by its own test, fading arrows out as the surface turns away', () => {
		expect(material.vertexShader).toContain(
			'vOpacity = smoothstep(FADE_FROM, FADE_TO, facing);',
		);
		expect(material.depthTest).toBe(false);
		expect(material.depthWrite).toBe(false);
		expect(material.transparent).toBe(true);
	});

	it('draws the arrows dark with a light edge', () => {
		expect(material.fragmentShader).toContain('const vec3 FILL = vec3(0.0706');
		expect(material.fragmentShader).toContain('const vec3 EDGE = vec3(0.9608');
		expect(material.fragmentShader).toContain(
			'mix(FILL, EDGE, smoothstep(-soft, soft, d))',
		);
	});
});

describe('createWindArrows', () => {
	const grid = getGrid(64);
	const make = () => createWindArrows(createGlobeMaterial().uniforms);
	/** The zoom at which a spacing is picked. */
	const zoomFor = (spacing: number): number =>
		ARROW_MAX_LENGTH_PX / (ARROW_SPACING_SHARE * spacing * RADIANS_PER_DEGREE) +
		1;

	it('shows nothing until a world and its winds are set', () => {
		const arrows = make();
		expect(arrows.mesh.visible).toBe(false);
		arrows.setWorld(64);
		expect(arrows.mesh.visible).toBe(false);
	});

	it('draws one instance for each arrow that is not calm, all in one mesh', () => {
		const arrows = make();
		arrows.setWorld(64);
		arrows.setWinds(uniformWind(grid, 5, 0));
		expect(arrows.mesh.visible).toBe(true);
		const { geometry } = arrows.mesh as unknown as {
			geometry: { instanceCount: number };
		};
		expect(geometry.instanceCount).toBe(
			patchesFor(64, ARROW_SPACINGS_DEG[0]).count,
		);
		arrows.setWinds(uniformWind(grid, 0, 0));
		expect(arrows.mesh.visible).toBe(false);
		expect(geometry.instanceCount).toBe(0);
	});

	it('updates the arrows for a new field, as for a new month or result', () => {
		const arrows = make();
		arrows.setWorld(64);
		const { geometry } = arrows.mesh as unknown as {
			geometry: {
				getAttribute(name: string): { array: Float32Array; version: number };
			};
		};
		arrows.setWinds(uniformWind(grid, 5, 0));
		const before = Float32Array.from(geometry.getAttribute('aWind').array);
		const version = geometry.getAttribute('aWind').version;
		arrows.setWinds(uniformWind(grid, 0, 5));
		expect(geometry.getAttribute('aWind').version).toBeGreaterThan(version);
		expect(geometry.getAttribute('aWind').array).not.toEqual(before);
	});

	it('lays out more arrows as the zoom brings a finer spacing', () => {
		const arrows = make();
		arrows.setWorld(64);
		arrows.setWinds(uniformWind(grid, 5, 0));
		const { geometry } = arrows.mesh as unknown as {
			geometry: { instanceCount: number };
		};
		const counts = ARROW_SPACINGS_DEG.map((spacing) => {
			arrows.setZoom(zoomFor(spacing));
			return geometry.instanceCount;
		});
		expect(counts).toEqual(
			ARROW_SPACINGS_DEG.map((spacing) => patchesFor(64, spacing).count),
		);
	});

	it('removes the arrows for no winds and for a new world', () => {
		const arrows = make();
		arrows.setWorld(64);
		arrows.setWinds(uniformWind(grid, 5, 0));
		arrows.setWinds(null);
		expect(arrows.mesh.visible).toBe(false);
		arrows.setWinds(uniformWind(grid, 5, 0));
		arrows.setWorld(128);
		expect(arrows.mesh.visible).toBe(false);
	});

	it('refuses winds of the wrong length, or before a world, keeping those shown', () => {
		const arrows = make();
		expect(() => arrows.setWinds(uniformWind(grid, 5, 0))).toThrow(RangeError);
		arrows.setWorld(64);
		arrows.setWinds(uniformWind(grid, 5, 0));
		expect(() => arrows.setWinds(uniformWind(getGrid(128), 5, 0))).toThrow(
			RangeError,
		);
		expect(arrows.mesh.visible).toBe(true);
	});
});
