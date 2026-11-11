import { describe, expect, it } from 'vitest';
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
import {
	clampSetting,
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
	SMOOTH_REFERENCE_RESOLUTION,
	sculptFrame,
	smoothRate,
	TOOLS,
} from './sculpt';

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
