import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	angleBetween,
	applyDab,
	BLANK_OCEAN_ELEVATION_M,
	cellAt,
	cellCentre,
	cellIndex,
	createBlankWorld,
	dabRadius,
	getGrid,
	latLonToDirection,
	MAX_ELEVATION_M,
	MAX_SMOOTH_AMOUNT,
	PLANET_RADIUS_KM,
	type Resolution,
	SUPPORTED_RESOLUTIONS,
	smoothPasses,
	type Vec3,
	type World,
} from '../core/index';
import { MAIN_BUTTON, SECONDARY_BUTTON } from './globe/input';
import type { Globe, WindowPoint } from './globe/renderer';
import {
	clampSetting,
	createSculptController,
	createStrokeRecord,
	DAB_SPACING,
	DEFAULT_BRUSH_RADIUS_KM,
	DEFAULT_BRUSH_STRENGTH,
	DEFAULT_SMOOTH_SETTING,
	DEFAULT_TOOL,
	dabLimit,
	dabStrength,
	FRAME_CELL_BUDGET,
	faceBits,
	facesOfBits,
	frameSeconds,
	MAX_BRUSH_RADIUS_KM,
	MAX_BRUSH_STRENGTH,
	MAX_DABS_PER_FRAME,
	MAX_FRAME_SECONDS,
	MAX_SMOOTH_RATE,
	MAX_SMOOTH_SETTING,
	MIN_BRUSH_RADIUS_KM,
	MIN_BRUSH_STRENGTH,
	MIN_DAB_LIMIT,
	MIN_SMOOTH_RATE,
	MIN_SMOOTH_SETTING,
	normaliseSmoothSetting,
	planDabs,
	rotateButtonFor,
	type SculptController,
	SMOOTH_REFERENCE_RESOLUTION,
	type StrokeChanges,
	sculptFrame,
	smoothRate,
	TOOLS,
} from './sculpt';
import {
	createFakeCanvas,
	createFakeFrames,
	type FakeCanvas,
	type FakeFrames,
} from './testing/fakeCanvas';

/**
 * Time allowed for the test that simulates whole seconds of smoothing on the
 * finest grid at several frame rates. It takes over a second, and several
 * times that under coverage instrumentation, which is too near the default
 * five seconds.
 */
const SIMULATED_SECONDS_TIMEOUT_MS = 60_000;

/** What a held smoothing brush is simulated with. */
type HeldSmoothing = {
	readonly direction: Vec3;
	readonly radiusKm: number;
	readonly smoothSetting: number;
	readonly seconds: number;
	readonly framesPerSecond: number;
};

/** Holds a smoothing brush still on a world, frame by frame. */
const holdSmoothing = (world: World, held: HeldSmoothing): void => {
	const record = createStrokeRecord(world.elevation.length);
	const frames = Math.round(held.seconds * held.framesPerSecond);
	for (let frame = 0; frame < frames; frame++) {
		sculptFrame({
			world,
			record,
			mode: 'smooth',
			radiusKm: held.radiusKm,
			strength: DEFAULT_BRUSH_STRENGTH,
			smoothSetting: held.smoothSetting,
			seconds: 1 / held.framesPerSecond,
			from: held.direction,
			to: held.direction,
		});
	}
};

/** The largest difference between two terrains, in metres. */
const farthestApart = (a: Float32Array, b: Float32Array): number => {
	let most = 0;
	for (let cell = 0; cell < a.length; cell++) {
		most = Math.max(most, Math.abs((a[cell] as number) - (b[cell] as number)));
	}
	return most;
};

describe('the tools', () => {
	it('start with the move tool, so the page opens turning the globe', () => {
		expect(DEFAULT_TOOL).toBe('move');
		expect(TOOLS).toEqual(['move', 'raise', 'lower', 'smooth']);
	});

	it('offer a radius from 100 to 3,000 km, starting at 500', () => {
		expect(MIN_BRUSH_RADIUS_KM).toBe(100);
		expect(MAX_BRUSH_RADIUS_KM).toBe(3000);
		expect(DEFAULT_BRUSH_RADIUS_KM).toBe(500);
	});

	it('offer a strength from 100 to 5,000, starting at 1,000', () => {
		expect(MIN_BRUSH_STRENGTH).toBe(100);
		expect(MAX_BRUSH_STRENGTH).toBe(5000);
		expect(DEFAULT_BRUSH_STRENGTH).toBe(1000);
	});

	it('offer a smoothing setting from 1 to 100, starting at 50', () => {
		expect(MIN_SMOOTH_SETTING).toBe(1);
		expect(MAX_SMOOTH_SETTING).toBe(100);
		expect(DEFAULT_SMOOTH_SETTING).toBe(50);
	});
});

describe('rotateButtonFor', () => {
	it('turns the globe with the main button for the move tool', () => {
		expect(rotateButtonFor('move')).toBe(MAIN_BUTTON);
	});

	it('leaves the main button to every brush', () => {
		for (const tool of TOOLS) {
			if (tool !== 'move') {
				expect(rotateButtonFor(tool)).toBe(SECONDARY_BUTTON);
			}
		}
	});
});

describe('clampSetting', () => {
	it('passes a value within the range through', () => {
		expect(clampSetting(500, 100, 3000)).toBe(500);
		expect(clampSetting(100, 100, 3000)).toBe(100);
		expect(clampSetting(3000, 100, 3000)).toBe(3000);
	});

	it('brings a value outside the range to the nearer end', () => {
		expect(clampSetting(5, 100, 3000)).toBe(100);
		expect(clampSetting(Number.NEGATIVE_INFINITY, 100, 3000)).toBe(100);
		expect(clampSetting(1e9, 100, 3000)).toBe(3000);
	});

	it('rejects NaN', () => {
		expect(() => clampSetting(Number.NaN, 100, 3000)).toThrow(RangeError);
	});
});

describe('frameSeconds', () => {
	it('is the time between two frames in seconds', () => {
		expect(frameSeconds(1016, 1000)).toBeCloseTo(0.016, 12);
	});

	it('takes a stalled frame to have lasted no longer than the limit', () => {
		expect(frameSeconds(5000, 1000)).toBe(MAX_FRAME_SECONDS);
		expect(MAX_FRAME_SECONDS).toBeGreaterThanOrEqual(0.05);
		expect(MAX_FRAME_SECONDS).toBeLessThanOrEqual(0.1);
	});

	it('is never negative', () => {
		expect(frameSeconds(1000, 1000)).toBe(0);
		expect(frameSeconds(990, 1000)).toBe(0);
	});
});

describe('normaliseSmoothSetting', () => {
	it('passes a whole setting within the range through', () => {
		for (const setting of [1, 2, 50, 99, 100]) {
			expect(normaliseSmoothSetting(setting)).toBe(setting);
		}
	});

	it('rounds a fractional setting to the nearest whole one', () => {
		expect(normaliseSmoothSetting(49.4)).toBe(49);
		expect(normaliseSmoothSetting(49.5)).toBe(50);
		expect(normaliseSmoothSetting(1.2)).toBe(1);
		expect(normaliseSmoothSetting(99.7)).toBe(100);
	});

	it('brings a setting outside the range to the nearer end', () => {
		for (const low of [0.4, 0, -5, Number.NEGATIVE_INFINITY]) {
			expect(normaliseSmoothSetting(low)).toBe(MIN_SMOOTH_SETTING);
		}
		for (const high of [100.4, 101, 5000, Number.POSITIVE_INFINITY]) {
			expect(normaliseSmoothSetting(high)).toBe(MAX_SMOOTH_SETTING);
		}
	});

	it('rejects NaN', () => {
		expect(() => normaliseSmoothSetting(Number.NaN)).toThrow(RangeError);
	});
});

describe('smoothRate', () => {
	/** A world with one round hill, the same shape on every grid. */
	const createHillWorld = (
		resolution: Resolution,
		centre: Vec3,
		widthKm: number,
	): World => {
		const grid = getGrid(resolution);
		const world = createBlankWorld(resolution);
		for (let cell = 0; cell < grid.cellCount; cell++) {
			const away =
				(angleBetween(centre, cellCentre(grid, cell)) * PLANET_RADIUS_KM) /
				widthKm;
			world.elevation[cell] = 4000 * Math.exp((-away * away) / 2);
		}
		return world;
	};

	it('runs from the gentlest rate to the strongest on the finest grid', () => {
		expect(SMOOTH_REFERENCE_RESOLUTION).toBe(256);
		expect(MIN_SMOOTH_RATE).toBe(1);
		expect(MAX_SMOOTH_RATE).toBe(50);
		expect(smoothRate(MIN_SMOOTH_SETTING, 256)).toBe(MIN_SMOOTH_RATE);
		expect(smoothRate(MAX_SMOOTH_SETTING, 256)).toBeCloseTo(
			MAX_SMOOTH_RATE,
			12,
		);
	});

	it('rises by the same factor with every step of the setting', () => {
		const factor = (MAX_SMOOTH_RATE / MIN_SMOOTH_RATE) ** (1 / 99);
		expect(factor).toBeGreaterThan(1.03);
		expect(factor).toBeLessThan(1.05);
		for (let setting = 1; setting < MAX_SMOOTH_SETTING; setting++) {
			expect(
				smoothRate(setting + 1, 256) / smoothRate(setting, 256),
			).toBeCloseTo(factor, 12);
		}
	});

	it('gives the default setting a rate between the two ends', () => {
		expect(smoothRate(DEFAULT_SMOOTH_SETTING, 256)).toBeCloseTo(6.93, 2);
	});

	it('takes a setting out of range or fractional as the one it becomes', () => {
		expect(smoothRate(0, 256)).toBe(smoothRate(1, 256));
		expect(smoothRate(-40, 256)).toBe(smoothRate(1, 256));
		expect(smoothRate(1e6, 256)).toBe(smoothRate(100, 256));
		expect(smoothRate(49.6, 256)).toBe(smoothRate(50, 256));
		expect(smoothRate(50.4, 256)).toBe(smoothRate(50, 256));
	});

	it('rejects NaN', () => {
		expect(() => smoothRate(Number.NaN, 256)).toThrow(RangeError);
	});

	it('falls with the square of the cell width on coarser grids', () => {
		for (const setting of [1, 37, 100]) {
			const finest = smoothRate(setting, 256);
			expect(smoothRate(setting, 128)).toBeCloseTo(finest / 4, 12);
			expect(smoothRate(setting, 64)).toBeCloseTo(finest / 16, 12);
		}
	});

	it('softens a feature of one size about as fast on every grid', () => {
		// A hill some 400 km across under the default brush, held for a
		// second at sixty frames a second. Measured share of its height left
		// at 64, 128 and 256: 0.910, 0.899 and 0.895 at the default setting,
		// and 0.594, 0.576 and 0.569 at the strongest.
		const direction = latLonToDirection(20, 10);
		for (const [smoothSetting, least, most] of [
			[DEFAULT_SMOOTH_SETTING, 0.88, 0.93],
			[MAX_SMOOTH_SETTING, 0.55, 0.63],
		] as const) {
			const left = SUPPORTED_RESOLUTIONS.map((resolution) => {
				const world = createHillWorld(resolution, direction, 200);
				const top = cellAt(getGrid(resolution), direction);
				const built = world.elevation[top] as number;
				holdSmoothing(world, {
					direction,
					radiusKm: DEFAULT_BRUSH_RADIUS_KM,
					smoothSetting,
					seconds: 1,
					framesPerSecond: 60,
				});
				return (world.elevation[top] as number) / built;
			});
			for (const share of left) {
				expect(share).toBeGreaterThan(least);
				expect(share).toBeLessThan(most);
				expect(Math.abs(share - (left[0] as number))).toBeLessThan(0.03);
			}
		}
	});

	it('softens more the higher the setting', () => {
		const direction = latLonToDirection(20, 10);
		let previous = 1;
		for (const smoothSetting of [1, 25, 50, 75, 100]) {
			const world = createHillWorld(64, direction, 200);
			const top = cellAt(getGrid(64), direction);
			const built = world.elevation[top] as number;
			holdSmoothing(world, {
				direction,
				radiusKm: DEFAULT_BRUSH_RADIUS_KM,
				smoothSetting,
				seconds: 1,
				framesPerSecond: 60,
			});
			const left = (world.elevation[top] as number) / built;
			expect(left).toBeLessThan(previous);
			previous = left;
		}
		// The gentlest setting still does something that can be seen.
		const gentle = createHillWorld(64, direction, 200);
		const start = Float32Array.from(gentle.elevation);
		holdSmoothing(gentle, {
			direction,
			radiusKm: DEFAULT_BRUSH_RADIUS_KM,
			smoothSetting: MIN_SMOOTH_SETTING,
			seconds: 3,
			framesPerSecond: 60,
		});
		expect(farthestApart(start, gentle.elevation)).toBeGreaterThan(100);
	});
});

describe('dabStrength', () => {
	const frame = {
		mode: 'raise',
		strength: 1000,
		smoothSetting: MAX_SMOOTH_SETTING,
		seconds: 0.016,
		dabs: 1,
		resolution: 256,
	} as const;

	it('never asks a dab for more smoothing than the core accepts', () => {
		// The strongest setting on the finest grid over the longest frame,
		// all in one dab.
		const most = dabStrength({
			...frame,
			mode: 'smooth',
			smoothSetting: MAX_SMOOTH_SETTING,
			seconds: MAX_FRAME_SECONDS,
			dabs: 1,
			resolution: 256,
		});
		expect(most).toBeCloseTo(MAX_SMOOTH_RATE * MAX_FRAME_SECONDS, 12);
		expect(most).toBeLessThanOrEqual(MAX_SMOOTH_AMOUNT / 2);
	});

	it('gives raising and lowering their metres for the frame', () => {
		expect(dabStrength(frame)).toBeCloseTo(16, 12);
		expect(
			dabStrength({ ...frame, mode: 'lower', strength: 5000, seconds: 0.1 }),
		).toBeCloseTo(500, 12);
	});

	it('raises and lowers alike on every grid and at every smoothing setting', () => {
		for (const resolution of SUPPORTED_RESOLUTIONS) {
			for (const smoothSetting of [1, 50, 100]) {
				expect(
					dabStrength({ ...frame, resolution, smoothSetting }),
				).toBeCloseTo(16, 12);
			}
		}
	});

	it('shares the frame between its dabs', () => {
		expect(dabStrength({ ...frame, dabs: 4 })).toBeCloseTo(4, 12);
		expect(dabStrength({ ...frame, mode: 'smooth', dabs: 4 })).toBeCloseTo(
			0.2,
			12,
		);
	});

	it('adds up to the same height whatever the frame rate', () => {
		for (const frames of [10, 30, 60, 144]) {
			let total = 0;
			for (let k = 0; k < frames; k++) {
				total += dabStrength({ ...frame, seconds: 1 / frames });
			}
			expect(total).toBeCloseTo(1000, 9);
		}
	});

	it('does nothing in no time', () => {
		for (const mode of ['raise', 'lower', 'smooth'] as const) {
			expect(dabStrength({ ...frame, mode, seconds: 0, dabs: 3 })).toBe(0);
		}
	});

	it('gives smoothing the rate of its setting times the time', () => {
		expect(dabStrength({ ...frame, mode: 'smooth' })).toBeCloseTo(0.8, 12);
		expect(
			dabStrength({ ...frame, mode: 'smooth', resolution: 64 }),
		).toBeCloseTo(0.05, 12);
		expect(
			dabStrength({ ...frame, mode: 'smooth', smoothSetting: 1, seconds: 0.5 }),
		).toBeCloseTo(0.5, 12);
	});

	it('smooths alike whatever the strength of raising and lowering', () => {
		const smooth = { ...frame, mode: 'smooth' } as const;
		expect(dabStrength({ ...smooth, strength: 100 })).toBe(
			dabStrength({ ...smooth, strength: 5000 }),
		);
	});

	it('adds up to the same smoothing whatever the frames and their dabs', () => {
		const rate = smoothRate(DEFAULT_SMOOTH_SETTING, 256);
		for (const frames of [10, 30, 60, 144]) {
			for (const dabs of [1, 2, 7]) {
				const each = dabStrength({
					...frame,
					mode: 'smooth',
					smoothSetting: DEFAULT_SMOOTH_SETTING,
					seconds: 1 / frames,
					dabs,
				});
				expect(each * dabs * frames).toBeCloseTo(rate, 9);
			}
		}
	});

	it('rejects a smoothing setting that is NaN', () => {
		expect(() =>
			dabStrength({ ...frame, mode: 'smooth', smoothSetting: Number.NaN }),
		).toThrow(RangeError);
	});
});

describe('dabLimit', () => {
	/** How many cells a brush really covers on a grid. */
	const cellsUnder = (resolution: Resolution, radiusKm: number): number =>
		applyDab(createBlankWorld(resolution), {
			direction: latLonToDirection(5, 5),
			radiusKm,
			strength: 1,
			mode: 'raise',
		}).cells.length;

	it('allows the most dabs for a brush of few cells', () => {
		for (const [resolution, radiusKm] of [
			[64, 100],
			[256, 100],
			[64, 1500],
		] as const) {
			const radius = dabRadius(resolution, radiusKm);
			expect(dabLimit({ resolution, radius })).toBe(MAX_DABS_PER_FRAME);
		}
	});

	it('allows fewer the more cells the brush covers', () => {
		const widest = dabLimit({ resolution: 256, radius: dabRadius(256, 3000) });
		const wide = dabLimit({ resolution: 256, radius: dabRadius(256, 1500) });
		expect(widest).toBe(MIN_DAB_LIMIT);
		expect(wide).toBeGreaterThan(widest);
		expect(wide).toBeLessThan(MAX_DABS_PER_FRAME);
	});

	it('keeps a frame of dabs within the budget of cells', () => {
		for (const resolution of SUPPORTED_RESOLUTIONS) {
			for (const radiusKm of [100, 500, 1500, 2500]) {
				const radius = dabRadius(resolution, radiusKm);
				const limit = dabLimit({ resolution, radius });
				expect(Number.isInteger(limit)).toBe(true);
				expect(limit).toBeGreaterThanOrEqual(MIN_DAB_LIMIT);
				expect(limit).toBeLessThanOrEqual(MAX_DABS_PER_FRAME);
				expect(limit * cellsUnder(resolution, radiusKm)).toBeLessThanOrEqual(
					FRAME_CELL_BUDGET * 1.05,
				);
			}
		}
	});

	it('still allows a few dabs for a brush covering the whole globe', () => {
		expect(dabLimit({ resolution: 256, radius: Math.PI })).toBe(MIN_DAB_LIMIT);
		expect(dabLimit({ resolution: 256, radius: 10 })).toBe(MIN_DAB_LIMIT);
	});

	it('allows fewer the more passes the smoothing of a frame takes', () => {
		const brush = { resolution: 256, radius: dabRadius(256, 1500) };
		const plain = dabLimit(brush);
		expect(dabLimit({ ...brush, passes: 1 })).toBe(plain);
		expect(dabLimit({ ...brush, passes: 3 })).toBe(plain - 2);
		expect(dabLimit({ ...brush, passes: 100 })).toBe(MIN_DAB_LIMIT);
	});

	it('keeps a frame of smoothing within the budget of cells and passes', () => {
		let checked = 0;
		for (const resolution of SUPPORTED_RESOLUTIONS) {
			for (const radiusKm of [100, 500, 1500]) {
				const cells = cellsUnder(resolution, radiusKm);
				for (const amount of [0.05, 0.5, 1.3, 5]) {
					const limit = dabLimit({
						resolution,
						radius: dabRadius(resolution, radiusKm),
						passes: smoothPasses(amount),
					});
					// At the fewest dabs the passes are made whatever they cost.
					if (limit === MIN_DAB_LIMIT) {
						continue;
					}
					for (let dabs = 1; dabs <= limit; dabs++) {
						const passes = dabs * smoothPasses(amount / dabs);
						expect(passes * cells).toBeLessThanOrEqual(
							FRAME_CELL_BUDGET * 1.05,
						);
						checked++;
					}
				}
			}
		}
		expect(checked).toBeGreaterThan(500);
	});
});

describe('planDabs', () => {
	const radius = 500 / PLANET_RADIUS_KM;
	const from = latLonToDirection(0, 0);
	const limit = MAX_DABS_PER_FRAME;

	it('lays nothing while the cursor is off the globe', () => {
		expect(planDabs({ from, to: null, radius, limit })).toEqual([]);
		expect(planDabs({ from: null, to: null, radius, limit })).toEqual([]);
	});

	it('lays one dab under the cursor when there is nowhere to come from', () => {
		const to = latLonToDirection(30, 40);
		expect(planDabs({ from: null, to, radius, limit })).toEqual([to]);
	});

	it('keeps dabbing under a cursor that is still', () => {
		expect(planDabs({ from, to: from, radius, limit })).toEqual([from]);
	});

	it('lays one dab at the cursor for a short move', () => {
		const to = latLonToDirection(0, 0.5);
		const dabs = planDabs({ from, to, radius, limit });
		expect(dabs.length).toBe(1);
		expect(angleBetween(dabs[0] as Vec3, to)).toBeLessThan(1e-12);
	});

	it('fills a fast move with dabs a share of the radius apart', () => {
		const to = latLonToDirection(0, 25);
		const dabs = planDabs({ from, to, radius, limit });
		const travelled = angleBetween(from, to);
		expect(dabs.length).toBe(Math.ceil(travelled / (radius * DAB_SPACING)));
		let previous = from;
		for (const dab of dabs) {
			const gap = angleBetween(previous, dab);
			expect(gap).toBeLessThanOrEqual(radius * DAB_SPACING * (1 + 1e-9));
			expect(gap).toBeCloseTo(travelled / dabs.length, 12);
			previous = dab;
		}
		expect(angleBetween(previous, to)).toBeLessThan(1e-12);
	});

	it('spreads the dabs wider rather than lay more than the limit', () => {
		const narrow = 100 / PLANET_RADIUS_KM;
		for (const longitude of [60, 120, 179.999]) {
			const to = latLonToDirection(0, longitude);
			for (const few of [1, 4, MAX_DABS_PER_FRAME]) {
				const dabs = planDabs({ from, to, radius: narrow, limit: few });
				expect(dabs.length).toBe(few);
				expect(angleBetween(dabs.at(-1) as Vec3, to)).toBeLessThan(1e-12);
			}
		}
	});

	it('leaves no gap between the dabs of an ordinary fast drag', () => {
		// A fifth of the way round the globe in one frame, with the
		// narrowest brush on the finest grid.
		const narrow = dabRadius(256, MIN_BRUSH_RADIUS_KM);
		const to = latLonToDirection(0, 14);
		const dabs = planDabs({
			from,
			to,
			radius: narrow,
			limit: dabLimit({ resolution: 256, radius: narrow }),
		});
		let previous = from;
		for (const dab of dabs) {
			expect(angleBetween(previous, dab)).toBeLessThan(narrow / 2);
			previous = dab;
		}
	});
});

describe('faceBits and facesOfBits', () => {
	it('find the faces some cells lie on', () => {
		const grid = getGrid(64);
		const cells = Int32Array.of(
			cellIndex(grid, 4, 0, 0),
			cellIndex(grid, 1, 63, 63),
			cellIndex(grid, 4, 63, 63),
			cellIndex(grid, 1, 0, 0),
		);
		expect(facesOfBits(faceBits(cells, 64))).toEqual([1, 4]);
	});

	it('find no face for no cells', () => {
		expect(faceBits(new Int32Array(0), 64)).toBe(0);
		expect(facesOfBits(0)).toEqual([]);
	});

	it('find every face, in order', () => {
		for (const resolution of SUPPORTED_RESOLUTIONS) {
			const grid = getGrid(resolution);
			const cells = Int32Array.from([5, 3, 0, 2, 4, 1], (face) =>
				cellIndex(grid, face, resolution - 1, 0),
			);
			expect(facesOfBits(faceBits(cells, resolution))).toEqual([
				0, 1, 2, 3, 4, 5,
			]);
		}
	});

	it('join the faces of several dabs', () => {
		const grid = getGrid(64);
		const one = faceBits(Int32Array.of(cellIndex(grid, 0, 1, 1)), 64);
		const other = faceBits(Int32Array.of(cellIndex(grid, 5, 1, 1)), 64);
		expect(facesOfBits(one | other)).toEqual([0, 5]);
	});

	it('find the three faces a dab on a cube corner changes', () => {
		const world = createBlankWorld(128);
		const { cells } = applyDab(world, {
			direction: [1, 1, 1],
			radiusKm: 500,
			strength: 10,
			mode: 'raise',
		});
		expect(facesOfBits(faceBits(cells, 128))).toEqual([0, 2, 4]);
	});
});

describe('createStrokeRecord', () => {
	const dab = (
		cells: number[],
		before: number[],
	): { cells: Int32Array; before: Float32Array } => ({
		cells: Int32Array.from(cells),
		before: Float32Array.from(before),
	});

	it('is empty for a stroke of no dabs', () => {
		const changes = createStrokeRecord(100).finish();
		expect(changes.cells.length).toBe(0);
		expect(changes.before.length).toBe(0);
	});

	it('keeps each cell once, with the value its first dab found', () => {
		const record = createStrokeRecord(100);
		record.add(dab([4, 9, 2], [-4000, -3990, 15]));
		record.add(dab([9, 7, 4], [-3000, 120, -3500]));
		const changes = record.finish();
		expect(Array.from(changes.cells)).toEqual([4, 9, 2, 7]);
		expect(Array.from(changes.before)).toEqual([-4000, -3990, 15, 120]);
	});

	it('starts each stroke empty', () => {
		const record = createStrokeRecord(100);
		record.add(dab([4, 9], [1, 2]));
		const first = record.finish();
		record.add(dab([9, 5], [30, 40]));
		const second = record.finish();
		expect(Array.from(second.cells)).toEqual([9, 5]);
		expect(Array.from(second.before)).toEqual([30, 40]);
		// What an earlier stroke handed over is not written to again.
		expect(Array.from(first.cells)).toEqual([4, 9]);
		expect(Array.from(first.before)).toEqual([1, 2]);
		expect(record.finish().cells.length).toBe(0);
	});

	it('puts the terrain back as it was before a stroke of real dabs', () => {
		const world = createBlankWorld(64);
		const start = Float32Array.from(world.elevation);
		const record = createStrokeRecord(world.elevation.length);
		for (const [longitude, mode] of [
			[0, 'raise'],
			[4, 'raise'],
			[8, 'smooth'],
			[4, 'lower'],
			[44, 'raise'],
		] as const) {
			record.add(
				applyDab(world, {
					direction: latLonToDirection(40, 40 + longitude),
					radiusKm: 900,
					strength: mode === 'smooth' ? 0.5 : 700,
					mode,
				}),
			);
		}
		const { cells, before } = record.finish();
		expect(new Set(cells).size).toBe(cells.length);
		expect(cells.length).toBeGreaterThan(100);
		for (let k = 0; k < cells.length; k++) {
			world.elevation[cells[k] as number] = before[k] as number;
		}
		expect(world.elevation).toEqual(start);
	});
});

describe('sculptFrame', () => {
	const brush = {
		mode: 'raise',
		radiusKm: 500,
		strength: 1000,
		smoothSetting: DEFAULT_SMOOTH_SETTING,
		seconds: 0.1,
	} as const;

	const createStage = (): {
		world: World;
		record: ReturnType<typeof createStrokeRecord>;
	} => {
		const world = createBlankWorld(64);
		return { world, record: createStrokeRecord(world.elevation.length) };
	};

	it('leaves an unbroken raised path along a drag and ends at the cursor', () => {
		const { world, record } = createStage();
		const grid = getGrid(64);
		const from = latLonToDirection(0, 0);
		const to = latLonToDirection(0, 40);
		const frame = sculptFrame({ ...brush, world, record, from, to });
		expect(frame.lastDab).toBe(to);
		for (let longitude = 0; longitude <= 40; longitude += 0.5) {
			const cell = cellAt(grid, latLonToDirection(0, longitude));
			expect(world.elevation[cell]).toBeGreaterThan(
				BLANK_OCEAN_ELEVATION_M + 1,
			);
		}
		// The frame's 100 m are shared between its dabs, not given to each.
		const top = cellAt(grid, latLonToDirection(0, 20));
		expect(world.elevation[top]).toBeLessThan(BLANK_OCEAN_ELEVATION_M + 100);
		// Away from the path nothing moved.
		for (const [latitude, longitude] of [
			[0, 60],
			[30, 20],
			[0, -20],
		] as const) {
			const cell = cellAt(grid, latLonToDirection(latitude, longitude));
			expect(world.elevation[cell]).toBe(BLANK_OCEAN_ELEVATION_M);
		}
	});

	it('does nothing while the cursor is off the globe, then starts afresh', () => {
		const { world, record } = createStage();
		const start = Float32Array.from(world.elevation);
		const off = sculptFrame({
			...brush,
			world,
			record,
			from: latLonToDirection(0, 0),
			to: null,
		});
		expect(off.faces).toEqual([]);
		expect(off.lastDab).toBeNull();
		expect(world.elevation).toEqual(start);
		expect(record.finish().cells.length).toBe(0);

		// Back on the globe far from where it left: one dab under the
		// cursor and no line across to it.
		const to = latLonToDirection(0, 90);
		const back = sculptFrame({
			...brush,
			world,
			record,
			from: off.lastDab,
			to,
		});
		expect(back.lastDab).toBe(to);
		const alone = createBlankWorld(64);
		applyDab(alone, {
			direction: to,
			radiusKm: brush.radiusKm,
			strength: brush.strength * brush.seconds,
			mode: 'raise',
		});
		expect(world.elevation).toEqual(alone.elevation);
	});

	it('reports the three faces a raise on a cube corner changes', () => {
		const { world, record } = createStage();
		const frame = sculptFrame({
			...brush,
			world,
			record,
			from: null,
			to: [1, 1, 1],
		});
		expect(frame.faces).toEqual([0, 2, 4]);
	});

	it('reports nothing for a dab that changes nothing', () => {
		const { world, record } = createStage();
		world.elevation.fill(MAX_ELEVATION_M);
		const to = latLonToDirection(10, 10);
		const frame = sculptFrame({ ...brush, world, record, from: to, to });
		expect(frame.faces).toEqual([]);
		expect(frame.lastDab).toBe(to);
		const changes = record.finish();
		expect(changes.cells.length).toBe(0);
		expect(changes.before.length).toBe(0);
	});

	it('records enough to put the terrain back as it was', () => {
		for (const mode of ['raise', 'lower', 'smooth'] as const) {
			const { world, record } = createStage();
			applyDab(world, {
				direction: latLonToDirection(5, 10),
				radiusKm: 400,
				strength: 3000,
				mode: 'raise',
			});
			const start = Float32Array.from(world.elevation);
			const frame = sculptFrame({
				...brush,
				mode,
				world,
				record,
				from: latLonToDirection(0, 0),
				to: latLonToDirection(10, 25),
			});
			expect(frame.faces.length).toBeGreaterThan(0);
			expect(world.elevation).not.toEqual(start);
			const { cells, before } = record.finish();
			expect(cells.length).toBeGreaterThan(0);
			for (let k = 0; k < cells.length; k++) {
				world.elevation[cells[k] as number] = before[k] as number;
			}
			expect(world.elevation).toEqual(start);
		}
	});

	it('keeps the first value of a cell that two frames change', () => {
		const { world, record } = createStage();
		const start = Float32Array.from(world.elevation);
		const to = latLonToDirection(-20, 70);
		const first = sculptFrame({ ...brush, world, record, from: null, to });
		const between = Float32Array.from(world.elevation);
		sculptFrame({ ...brush, world, record, from: first.lastDab, to });
		const { cells, before } = record.finish();
		expect(cells.length).toBeGreaterThan(10);
		expect(new Set(cells).size).toBe(cells.length);
		for (let k = 0; k < cells.length; k++) {
			const cell = cells[k] as number;
			expect(before[k]).toBe(start[cell]);
			// The second frame did change these cells again.
			expect(world.elevation[cell]).not.toBe(between[cell]);
		}
	});

	it('smooths by the setting and raises by the strength, each alone', () => {
		const to = latLonToDirection(5, 10);
		const terrainAfter = (
			mode: 'raise' | 'smooth',
			strength: number,
			smoothSetting: number,
		): Float32Array => {
			const { world, record } = createStage();
			applyDab(world, {
				direction: to,
				radiusKm: 400,
				strength: 3000,
				mode: 'raise',
			});
			sculptFrame({
				...brush,
				mode,
				strength,
				smoothSetting,
				world,
				record,
				from: to,
				to,
			});
			return world.elevation;
		};
		expect(terrainAfter('smooth', 100, 50)).toEqual(
			terrainAfter('smooth', 5000, 50),
		);
		expect(terrainAfter('smooth', 1000, 50)).not.toEqual(
			terrainAfter('smooth', 1000, 60),
		);
		expect(terrainAfter('raise', 1000, 1)).toEqual(
			terrainAfter('raise', 1000, 100),
		);
		expect(terrainAfter('raise', 1000, 50)).not.toEqual(
			terrainAfter('raise', 1100, 50),
		);
	});

	it(
		'smooths as much in a second whatever the frame rate',
		() => {
			// The terrains left by 30, 60 and 144 frames a second, compared by
			// the largest difference between any two as a share of the largest
			// change the smoothing made. Measured at the default setting and
			// the strongest: 0.13% and 0.58% at 64 cells, 0.07% and 0.01% at 256.
			const direction = latLonToDirection(20, 10);
			for (const [resolution, radiusKm, smoothSetting] of [
				[64, 3000, DEFAULT_SMOOTH_SETTING],
				[64, 3000, MAX_SMOOTH_SETTING],
				[256, 1500, DEFAULT_SMOOTH_SETTING],
				[256, 1500, MAX_SMOOTH_SETTING],
			] as const) {
				const tolerance = 0.01;
				const create = (): World => {
					const world = createBlankWorld(resolution);
					applyDab(world, {
						direction,
						radiusKm: 600,
						strength: 4000,
						mode: 'raise',
					});
					return world;
				};
				const start = create().elevation;
				const [slow, usual, fast] = [30, 60, 144].map((framesPerSecond) => {
					const world = create();
					holdSmoothing(world, {
						direction,
						radiusKm,
						smoothSetting,
						seconds: 1,
						framesPerSecond,
					});
					return world.elevation;
				}) as [Float32Array, Float32Array, Float32Array];
				const done = farthestApart(start, usual);
				expect(done).toBeGreaterThan(200);
				expect(farthestApart(slow, usual)).toBeLessThan(tolerance * done);
				expect(farthestApart(usual, fast)).toBeLessThan(tolerance * done);
				expect(farthestApart(slow, fast)).toBeLessThan(tolerance * done);
			}
		},
		SIMULATED_SECONDS_TIMEOUT_MS,
	);
});

describe('createSculptController', () => {
	/** The class the canvas carries while a brush is chosen. */
	const BRUSH = 'globe--brush';

	/** The main button's bit among the buttons held. */
	const MAIN_HELD = 1;

	/** The time between two frames of the tests, in milliseconds. */
	const FRAME_MS = 16;

	/**
	 * Where the stand-in globe ends: a point of the window further right
	 * than this is over the canvas but off the globe.
	 */
	const GLOBE_EDGE_PX = 400;

	/** The direction under a point of the window: a degree every 10 pixels. */
	const directionAt = (clientX: number): Vec3 =>
		latLonToDirection(0, clientX / 10);

	/** A sculpt controller on a stand-in canvas and globe. */
	type Stage = {
		readonly fake: FakeCanvas;
		readonly frames: FakeFrames;
		readonly world: World;
		readonly controller: SculptController;
		/** What the controller told the page, in order. */
		readonly events: string[];
		/** What each stroke that ended was said to have changed. */
		readonly strokes: StrokeChanges[];
		/** The faces of each upload the globe was asked for. */
		readonly uploads: (readonly number[])[];
		/** Every brush outline the globe was asked to show; null hides it. */
		readonly brushes: ({ cursor: WindowPoint; radius: number } | null)[];
		/**
		 * How many times the globe was asked what lies under the cursor,
		 * and how many times to draw at once.
		 */
		readonly counts: { picks: number; draws: number };
		/** Whether a stroke was under way each time one was said to end. */
		readonly activeAtEnd: boolean[];
		/** Presses the main button at a point of the canvas. */
		press(clientX: number, pointerId?: number): void;
		/** Moves the pointer with the main button held. */
		drag(clientX: number, pointerId?: number): void;
		/** Whether the cell under a point of the window was raised. */
		raisedAt(clientX: number, world?: World): boolean;
	};

	let frames: FakeFrames;

	beforeEach(() => {
		frames = createFakeFrames();
		vi.stubGlobal('requestAnimationFrame', frames.request);
		vi.stubGlobal('cancelAnimationFrame', frames.cancel);
		vi.stubGlobal('performance', { now: frames.now });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const createStage = (world: World = createBlankWorld(64)): Stage => {
		const fake = createFakeCanvas(800, 600);
		const events: string[] = [];
		const strokes: StrokeChanges[] = [];
		const activeAtEnd: boolean[] = [];
		const uploads: (readonly number[])[] = [];
		const brushes: Stage['brushes'] = [];
		const counts = { picks: 0, draws: 0 };
		// The controller shows the brush while it is being made, so what
		// the globe records is ready before it.
		const controller: SculptController = createSculptController(
			{
				pick: (clientX: number) => {
					counts.picks++;
					return clientX > GLOBE_EDGE_PX ? null : directionAt(clientX);
				},
				updateElevation: (faces: readonly number[] = []) => {
					uploads.push(faces);
				},
				setBrush: (cursor: WindowPoint | null, radius = 0) => {
					brushes.push(cursor === null ? null : { cursor, radius });
				},
				draw: () => {
					counts.draws++;
				},
			} as unknown as Globe,
			world,
			{
				canvas: fake.canvas,
				onStrokeStart: () => events.push('start'),
				onStrokeEnd: (changes) => {
					events.push('end');
					strokes.push(changes);
					activeAtEnd.push(controller.isStrokeActive());
				},
				onWorldChange: (next) => events.push(`world ${next.resolution}`),
			},
		);
		return {
			fake,
			frames,
			world,
			controller,
			events,
			strokes,
			uploads,
			brushes,
			counts,
			activeAtEnd,
			press: (clientX, pointerId = 1) => {
				fake.dispatch('pointerdown', {
					pointerId,
					button: MAIN_BUTTON,
					buttons: MAIN_HELD,
					clientX,
					clientY: 100,
				});
			},
			drag: (clientX, pointerId = 1) => {
				fake.dispatch('pointermove', {
					pointerId,
					buttons: MAIN_HELD,
					clientX,
					clientY: 100,
				});
			},
			raisedAt: (clientX, where = world) =>
				(where.elevation[
					cellAt(getGrid(where.resolution), directionAt(clientX))
				] as number) > BLANK_OCEAN_ELEVATION_M,
		};
	};

	/** A stage with the raise brush chosen and nothing yet recorded. */
	const createRaisingStage = (world?: World): Stage => {
		const stage = createStage(world);
		stage.controller.setTool('raise');
		stage.brushes.length = 0;
		return stage;
	};

	/** The ways a stroke can end, each from a stroke with one frame run. */
	const ENDINGS: readonly (readonly [string, (stage: Stage) => void])[] = [
		[
			'the button being let go',
			(stage) =>
				stage.fake.dispatch('pointerup', { pointerId: 1, clientX: 100 }),
		],
		[
			'the pointer being cancelled',
			(stage) => stage.fake.dispatch('pointercancel', { pointerId: 1 }),
		],
		['the canvas losing the pointer', (stage) => stage.fake.loseCapture(1)],
		['endStroke', (stage) => stage.controller.endStroke()],
		['a change of tool', (stage) => stage.controller.setTool('lower')],
		['dispose', (stage) => stage.controller.dispose()],
	];

	it.each(ENDINGS)(
		'starts and ends a stroke once, ended by %s',
		(_name, end) => {
			const stage = createRaisingStage();
			stage.press(100);
			expect(stage.events).toEqual(['start']);
			expect(stage.controller.isStrokeActive()).toBe(true);
			expect(stage.fake.captured.has(1)).toBe(true);
			frames.runFrame(FRAME_MS);

			end(stage);
			expect(stage.events).toEqual(['start', 'end']);
			expect(stage.controller.isStrokeActive()).toBe(false);
			expect(stage.activeAtEnd).toEqual([false]);
			expect(stage.fake.captured.size).toBe(0);
			expect(frames.pending()).toBe(0);
			expect(stage.strokes[0]?.cells.length).toBeGreaterThan(0);

			// Whatever the browser or the page says of the pointer afterwards
			// ends nothing a second time.
			stage.fake.dispatch('pointerup', { pointerId: 1, clientX: 100 });
			stage.fake.dispatch('pointercancel', { pointerId: 1 });
			stage.fake.loseCapture(1);
			stage.controller.endStroke();
			frames.runFrame(FRAME_MS);
			expect(stage.events).toEqual(['start', 'end']);
		},
	);

	it('starts no stroke with the move tool', () => {
		const stage = createStage();
		stage.press(100);
		frames.runFrame(FRAME_MS);
		stage.fake.dispatch('pointerup', { pointerId: 1, clientX: 100 });

		expect(stage.events).toEqual([]);
		expect(stage.controller.isStrokeActive()).toBe(false);
		expect(stage.fake.captured.size).toBe(0);
		expect(frames.pending()).toBe(0);
		expect(stage.uploads).toEqual([]);
		expect(stage.raisedAt(100)).toBe(false);
	});

	it('starts no stroke with a button other than the main one', () => {
		const stage = createRaisingStage();
		stage.fake.dispatch('pointerdown', {
			pointerId: 1,
			button: SECONDARY_BUTTON,
			buttons: 2,
			clientX: 100,
		});
		frames.runFrame(FRAME_MS);

		expect(stage.events).toEqual([]);
		expect(stage.fake.captured.size).toBe(0);
		expect(frames.pending()).toBe(0);
		expect(stage.raisedAt(100)).toBe(false);
	});

	it('keeps to the pointer that began the stroke', () => {
		const stage = createRaisingStage();
		stage.press(100);
		stage.press(300, 2);
		expect(stage.events).toEqual(['start']);
		expect([...stage.fake.captured]).toEqual([1]);

		stage.fake.dispatch('pointerup', { pointerId: 2, clientX: 300 });
		stage.fake.dispatch('pointercancel', { pointerId: 2 });
		stage.fake.loseCapture(2);
		// Another pointer with no button held is not the stroke's button
		// being let go.
		stage.fake.dispatch('pointermove', { pointerId: 2, buttons: 0 });
		expect(stage.events).toEqual(['start']);
		expect(stage.controller.isStrokeActive()).toBe(true);
	});

	it('edits the world under the cursor each frame and has the globe show it', () => {
		const stage = createRaisingStage();
		stage.press(100);
		expect(stage.raisedAt(100)).toBe(false);

		frames.runFrame(FRAME_MS);
		expect(stage.raisedAt(100)).toBe(true);
		// The equator at 10° east lies on one face, away from its edges.
		expect(stage.uploads).toHaveLength(1);
		expect(stage.uploads[0]).toHaveLength(1);
		expect(stage.counts.draws).toBe(1);
		expect(frames.pending()).toBe(1);

		const cell = cellAt(getGrid(64), directionAt(100));
		const afterOne = stage.world.elevation[cell] as number;
		frames.runFrame(FRAME_MS);
		expect(stage.world.elevation[cell]).toBeGreaterThan(afterOne);
		expect(stage.uploads).toHaveLength(2);
		expect(stage.counts.draws).toBe(2);
	});

	it('uploads every face a dab on a cube corner changes', () => {
		const stage = createRaisingStage();
		const corner: Vec3 = [1, 1, 1].map((part) => part / Math.sqrt(3)) as [
			number,
			number,
			number,
		];
		const globe = {
			pick: () => corner,
			updateElevation: (faces: readonly number[] = []) => {
				stage.uploads.push(faces);
			},
			setBrush: () => {},
			draw: () => {},
		} as unknown as Globe;
		const events: string[] = [];
		const controller = createSculptController(globe, stage.world, {
			canvas: stage.fake.canvas,
			tool: 'raise',
			onStrokeEnd: () => events.push('end'),
		});
		// Both controllers hear the press; only the second one's globe
		// picks the corner.
		stage.press(100);
		stage.uploads.length = 0;
		frames.runFrame(FRAME_MS);

		const corners = stage.uploads.filter((faces) => faces.length === 3);
		expect(corners).toHaveLength(1);
		controller.dispose();
		expect(events).toEqual(['end']);
	});

	it('leaves a mark for a click shorter than a frame', () => {
		const stage = createRaisingStage();
		stage.press(100);
		frames.advance(5);
		stage.fake.dispatch('pointerup', { pointerId: 1, clientX: 100 });

		expect(stage.raisedAt(100)).toBe(true);
		expect(stage.uploads).toHaveLength(1);
		expect(stage.strokes[0]?.cells.length).toBeGreaterThan(0);
	});

	it('reports what the stroke changed, with the values from before it', () => {
		const stage = createRaisingStage();
		stage.press(100);
		frames.runFrame(FRAME_MS);
		stage.drag(140);
		frames.runFrame(FRAME_MS);
		stage.fake.dispatch('pointerup', { pointerId: 1, clientX: 140 });

		const { cells, before } = stage.strokes[0] as StrokeChanges;
		expect(new Set(cells).size).toBe(cells.length);
		for (let k = 0; k < cells.length; k++) {
			expect(before[k]).toBe(BLANK_OCEAN_ELEVATION_M);
			expect(stage.world.elevation[cells[k] as number]).toBeGreaterThan(
				BLANK_OCEAN_ELEVATION_M,
			);
		}
		const raised = stage.world.elevation.filter(
			(metres) => metres > BLANK_OCEAN_ELEVATION_M,
		);
		expect(raised.length).toBe(cells.length);
	});

	it('reports nothing changed for a stroke that never touched the globe', () => {
		const stage = createRaisingStage();
		stage.press(GLOBE_EDGE_PX + 100);
		frames.runFrame(FRAME_MS);
		stage.fake.dispatch('pointerup', {
			pointerId: 1,
			clientX: GLOBE_EDGE_PX + 100,
		});

		expect(stage.events).toEqual(['start', 'end']);
		expect(stage.strokes[0]?.cells.length).toBe(0);
		expect(stage.uploads).toEqual([]);
	});

	it('pauses while the cursor is off the globe and starts afresh when it is back', () => {
		const stage = createRaisingStage();
		stage.press(100);
		frames.runFrame(FRAME_MS);

		stage.drag(GLOBE_EDGE_PX + 100);
		const paused = Float32Array.from(stage.world.elevation);
		const uploads = stage.uploads.length;
		for (let frame = 0; frame < 3; frame++) {
			frames.runFrame(FRAME_MS);
		}
		expect(stage.world.elevation).toEqual(paused);
		expect(stage.uploads).toHaveLength(uploads);
		expect(stage.controller.isStrokeActive()).toBe(true);
		expect(stage.events).toEqual(['start']);
		expect(frames.pending()).toBe(1);

		stage.drag(300);
		frames.runFrame(FRAME_MS);
		expect(stage.raisedAt(300)).toBe(true);
		// No line is drawn across from where the cursor left the globe.
		expect(stage.raisedAt(200)).toBe(false);
		expect(stage.events).toEqual(['start']);

		stage.fake.dispatch('pointerup', { pointerId: 1, clientX: 300 });
		expect(stage.events).toEqual(['start', 'end']);
	});

	it('pauses while a captured pointer is outside the canvas, without asking the globe', () => {
		const stage = createRaisingStage();
		stage.press(100);
		frames.runFrame(FRAME_MS);

		// Outside the canvas, at a point of the window the globe would pick.
		stage.fake.dispatch('pointermove', {
			pointerId: 1,
			buttons: MAIN_HELD,
			clientX: 300,
			clientY: 100,
			offsetX: 300,
			offsetY: -1,
		});
		expect(stage.brushes.at(-1)).toBeNull();
		const picks = stage.counts.picks;
		const paused = Float32Array.from(stage.world.elevation);
		frames.runFrame(FRAME_MS);
		frames.runFrame(FRAME_MS);
		expect(stage.counts.picks).toBe(picks);
		expect(stage.world.elevation).toEqual(paused);
		expect(stage.controller.isStrokeActive()).toBe(true);

		stage.drag(300);
		frames.runFrame(FRAME_MS);
		expect(stage.raisedAt(300)).toBe(true);
		expect(stage.raisedAt(200)).toBe(false);
		expect(stage.events).toEqual(['start']);
	});

	it('takes the cursor to be over the canvas only within its edges', () => {
		const stage = createRaisingStage();
		const shownAt = (offsetX: number, offsetY: number): boolean => {
			stage.fake.dispatch('pointermove', {
				clientX: 50,
				clientY: 50,
				offsetX,
				offsetY,
			});
			return stage.brushes.at(-1) !== null;
		};
		expect(shownAt(0, 0)).toBe(true);
		expect(shownAt(799, 599)).toBe(true);
		expect(shownAt(-1, 0)).toBe(false);
		expect(shownAt(0, -1)).toBe(false);
		expect(shownAt(800, 0)).toBe(false);
		expect(shownAt(0, 600)).toBe(false);
	});

	it('ends the stroke, with a last dab, at a move that no longer reports the main button', () => {
		const stage = createRaisingStage();
		stage.press(100);
		frames.runFrame(FRAME_MS);
		frames.advance(FRAME_MS);

		// The secondary button was pressed too, and then the main one let go.
		stage.fake.dispatch('pointermove', {
			pointerId: 1,
			buttons: 3,
			clientX: 100,
			clientY: 100,
		});
		expect(stage.events).toEqual(['start']);
		const uploads = stage.uploads.length;
		stage.fake.dispatch('pointermove', {
			pointerId: 1,
			buttons: 2,
			clientX: 100,
			clientY: 100,
		});

		expect(stage.events).toEqual(['start', 'end']);
		expect(stage.uploads).toHaveLength(uploads + 1);
		expect(stage.controller.isStrokeActive()).toBe(false);
		expect(stage.fake.captured.size).toBe(0);
		expect(frames.pending()).toBe(0);
	});

	it('stops sculpting once the stroke has ended', () => {
		const stage = createRaisingStage();
		stage.press(100);
		frames.runFrame(FRAME_MS);
		stage.fake.dispatch('pointerup', { pointerId: 1, clientX: 100 });
		const ended = Float32Array.from(stage.world.elevation);

		stage.fake.dispatch('pointermove', { pointerId: 1, clientX: 200 });
		frames.runFrame(FRAME_MS);
		expect(stage.world.elevation).toEqual(ended);
	});

	it('ends a stroke on the old world before it says the world has changed', () => {
		const stage = createRaisingStage();
		stage.press(100);
		frames.runFrame(FRAME_MS);
		const next = createBlankWorld(128);

		stage.controller.setWorld(next);
		expect(stage.events).toEqual(['start', 'end', 'world 128']);
		expect(stage.activeAtEnd).toEqual([false]);
		expect(frames.pending()).toBe(0);
		expect(stage.fake.captured.size).toBe(0);

		// What the stroke changed is told of the world it was made on.
		const { cells, before } = stage.strokes[0] as StrokeChanges;
		expect(cells.length).toBeGreaterThan(0);
		for (let k = 0; k < cells.length; k++) {
			expect(cells[k]).toBeLessThan(stage.world.elevation.length);
			expect(before[k]).toBe(BLANK_OCEAN_ELEVATION_M);
			expect(stage.world.elevation[cells[k] as number]).toBeGreaterThan(
				BLANK_OCEAN_ELEVATION_M,
			);
		}
		expect(
			next.elevation.every((metres) => metres === BLANK_OCEAN_ELEVATION_M),
		).toBe(true);
	});

	it('sculpts the new world from then on, and shows the brush at its size', () => {
		const stage = createRaisingStage();
		stage.fake.dispatch('pointermove', { clientX: 100, clientY: 100 });
		const next = createBlankWorld(128);
		stage.controller.setWorld(next);
		expect(stage.events).toEqual(['world 128']);
		expect(stage.brushes.at(-1)).toEqual({
			cursor: { clientX: 100, clientY: 100 },
			radius: dabRadius(128, DEFAULT_BRUSH_RADIUS_KM),
		});

		const before = Float32Array.from(stage.world.elevation);
		stage.press(300);
		frames.runFrame(FRAME_MS);
		stage.fake.dispatch('pointerup', { pointerId: 1, clientX: 300 });

		expect(stage.raisedAt(300, next)).toBe(true);
		expect(stage.world.elevation).toEqual(before);
		const { cells } = stage.strokes[0] as StrokeChanges;
		expect(cells.length).toBeGreaterThan(0);
		for (const cell of cells) {
			expect(next.elevation[cell]).toBeGreaterThan(BLANK_OCEAN_ELEVATION_M);
		}
	});

	it('shows the outline of a brush under the cursor, and none for the move tool', () => {
		const stage = createStage();
		expect(stage.fake.classes.has(BRUSH)).toBe(false);
		stage.fake.dispatch('pointermove', { clientX: 120, clientY: 80 });
		expect(stage.brushes.at(-1)).toBeNull();

		stage.controller.setTool('smooth');
		expect(stage.fake.classes.has(BRUSH)).toBe(true);
		expect(stage.brushes.at(-1)).toEqual({
			cursor: { clientX: 120, clientY: 80 },
			radius: dabRadius(64, DEFAULT_BRUSH_RADIUS_KM),
		});

		stage.controller.setRadiusKm(2000);
		expect(stage.brushes.at(-1)).toEqual({
			cursor: { clientX: 120, clientY: 80 },
			radius: dabRadius(64, 2000),
		});

		stage.fake.dispatch('pointerleave');
		expect(stage.brushes.at(-1)).toBeNull();

		stage.fake.dispatch('pointermove', { clientX: 10, clientY: 20 });
		stage.controller.setTool('move');
		expect(stage.fake.classes.has(BRUSH)).toBe(false);
		expect(stage.brushes.at(-1)).toBeNull();
	});

	it('starts with the tool and the settings it is given', () => {
		const fake = createFakeCanvas();
		const world = createBlankWorld(64);
		const brushes: number[] = [];
		const controller = createSculptController(
			{
				pick: (clientX: number) => directionAt(clientX),
				updateElevation: () => {},
				setBrush: (cursor: WindowPoint | null, radius = 0) => {
					if (cursor !== null) {
						brushes.push(radius);
					}
				},
				draw: () => {},
			} as unknown as Globe,
			world,
			{ canvas: fake.canvas, tool: 'raise', radiusKm: 1500, strength: 4000 },
		);
		expect(fake.classes.has(BRUSH)).toBe(true);
		fake.dispatch('pointermove', { clientX: 100, clientY: 100 });
		expect(brushes).toEqual([dabRadius(64, 1500)]);

		fake.dispatch('pointerdown', {
			pointerId: 1,
			buttons: MAIN_HELD,
			clientX: 100,
			clientY: 100,
		});
		frames.runFrame(FRAME_MS);
		controller.endStroke();
		const cell = cellAt(getGrid(64), directionAt(100));
		// 4,000 m/s for 16 ms is 64 m at the brush's centre, which the
		// cell's own centre lies close to; the default strength gives 16 m.
		const raised = (world.elevation[cell] as number) - BLANK_OCEAN_ELEVATION_M;
		expect(raised).toBeGreaterThan(50);
		expect(raised).toBeLessThanOrEqual(64);
	});

	it('works at the strength it is set to', () => {
		const raisedBy = (strength: number): number => {
			const stage = createRaisingStage();
			stage.controller.setStrength(strength);
			stage.press(100);
			frames.runFrame(FRAME_MS);
			stage.controller.endStroke();
			const cell = cellAt(getGrid(64), directionAt(100));
			return (stage.world.elevation[cell] as number) - BLANK_OCEAN_ELEVATION_M;
		};
		const weak = raisedBy(500);
		expect(weak).toBeGreaterThan(0);
		expect(raisedBy(2000)).toBeCloseTo(weak * 4, 3);
	});

	it('smooths at the setting it is set to', () => {
		const smoothedBy = (setting: number): number => {
			const world = createBlankWorld(64);
			const cell = cellAt(getGrid(64), directionAt(100));
			world.elevation[cell] = 3000;
			const stage = createStage(world);
			stage.controller.setTool('smooth');
			stage.controller.setSmoothSetting(setting);
			stage.press(100);
			frames.runFrame(FRAME_MS);
			stage.controller.endStroke();
			return 3000 - (world.elevation[cell] as number);
		};
		const gentle = smoothedBy(MIN_SMOOTH_SETTING);
		expect(gentle).toBeGreaterThan(0);
		expect(smoothedBy(MAX_SMOOTH_SETTING)).toBeGreaterThan(gentle);
	});

	it('stops listening to the canvas and hides the brush when disposed', () => {
		const stage = createRaisingStage();
		stage.fake.dispatch('pointermove', { clientX: 100, clientY: 100 });
		stage.controller.dispose();
		expect(stage.fake.classes.has(BRUSH)).toBe(false);
		expect(stage.brushes.at(-1)).toBeNull();
		const shown = stage.brushes.length;

		stage.fake.dispatch('pointermove', { clientX: 150, clientY: 100 });
		stage.fake.dispatch('pointerleave');
		stage.press(100);
		frames.runFrame(FRAME_MS);
		stage.fake.dispatch('pointerup', { pointerId: 1, clientX: 100 });
		stage.fake.dispatch('pointercancel', { pointerId: 1 });
		stage.fake.loseCapture(1);

		expect(stage.events).toEqual([]);
		expect(stage.brushes).toHaveLength(shown);
		expect(stage.fake.captured.size).toBe(0);
		expect(frames.pending()).toBe(0);
		expect(stage.raisedAt(100)).toBe(false);
	});
});
