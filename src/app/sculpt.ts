/**
 * Sculpting with the mouse: turning the cursor's path over the globe into
 * dabs of a brush.
 *
 * While the main button is held with a brush chosen, every animation frame
 * lays dabs from where the last one landed to where the cursor is now,
 * close enough together to leave no gaps, and shares out between them what
 * the brush does in the time the frame took. How fast the terrain changes
 * therefore depends on neither the frame rate nor the speed of the cursor,
 * and a brush held still keeps working where it is.
 *
 * The arithmetic is in the pure functions at the top; the controller at the
 * bottom only joins them to pointer events and animation frames.
 */

import {
	angleBetween,
	applyDab,
	type BrushMode,
	type DabResult,
	dabRadius,
	FACE_COUNT,
	smoothPasses,
	strokePath,
	type Vec3,
	type World,
} from '../core/index';
import {
	isButtonHeld,
	MAIN_BUTTON,
	type RotateButton,
	SECONDARY_BUTTON,
} from './globe/input';
import type { Globe, WindowPoint } from './globe/renderer';

/** What the main mouse button does on the globe. */
export type Tool = 'move' | BrushMode;

/** Every {@link Tool}, in the order the page offers them. */
export const TOOLS: readonly Tool[] = ['move', 'raise', 'lower', 'smooth'];

/** The tool a page starts with: dragging turns the globe. */
export const DEFAULT_TOOL: Tool = 'move';

/** The narrowest brush offered, as a radius in kilometres. */
export const MIN_BRUSH_RADIUS_KM = 100;

/** The widest brush offered, as a radius in kilometres. */
export const MAX_BRUSH_RADIUS_KM = 3000;

/** The brush radius a page starts with, in kilometres. */
export const DEFAULT_BRUSH_RADIUS_KM = 500;

/**
 * The weakest raising or lowering brush offered, in metres per second at
 * the brush's centre.
 */
export const MIN_BRUSH_STRENGTH = 100;

/** The strongest raising or lowering brush offered, in metres per second. */
export const MAX_BRUSH_STRENGTH = 5000;

/**
 * The raising and lowering strength a page starts with, in metres per
 * second.
 */
export const DEFAULT_BRUSH_STRENGTH = 1000;

/**
 * The gentlest smoothing offered.
 *
 * @remarks
 * How hard the smoothing brush works is set apart from the strength of the
 * other brushes, as a whole number on a scale with no unit:
 * {@link smoothRate} says what a setting does.
 */
export const MIN_SMOOTH_SETTING = 1;

/** The strongest smoothing offered. */
export const MAX_SMOOTH_SETTING = 100;

/** The smoothing setting a page starts with. */
export const DEFAULT_SMOOTH_SETTING = 50;

/**
 * The smoothing rate of {@link MIN_SMOOTH_SETTING}, per second, on a grid
 * of {@link SMOOTH_REFERENCE_RESOLUTION}.
 */
export const MIN_SMOOTH_RATE = 1;

/**
 * The smoothing rate of {@link MAX_SMOOTH_SETTING}, per second, on a grid
 * of {@link SMOOTH_REFERENCE_RESOLUTION}.
 */
export const MAX_SMOOTH_RATE = 50;

/**
 * The grid, in cells along a face edge, on which the smoothing settings
 * stand for rates from {@link MIN_SMOOTH_RATE} to {@link MAX_SMOOTH_RATE}.
 */
export const SMOOTH_REFERENCE_RESOLUTION = 256;

/**
 * The longest time one frame is taken to have lasted, in seconds. A stall
 * longer than this does not come out as one outsized dab.
 */
export const MAX_FRAME_SECONDS = 0.1;

/** The distance between the dabs of a stroke, as a share of the radius. */
export const DAB_SPACING = 0.25;

/**
 * The most dabs laid in one frame. A cursor that travels farther in a frame
 * than these reach at {@link DAB_SPACING} has them spread wider instead.
 */
export const MAX_DABS_PER_FRAME = 64;

/** The fewest dabs a frame is allowed, however wide the brush. */
export const MIN_DAB_LIMIT = 2;

/**
 * About how many cells one frame's dabs may visit between them, counting a
 * cell once for every pass a smoothing dab makes over it, which bounds the
 * time a frame of sculpting can take.
 */
export const FRAME_CELL_BUDGET = 50_000;

/** Class the canvas carries while a brush is chosen. */
const BRUSH_CLASS = 'globe--brush';

/**
 * The mouse button whose drag turns the globe while a tool is chosen: the
 * main button for the move tool, and the secondary one for a brush, whose
 * strokes take the main button.
 *
 * @param tool - The chosen tool.
 */
export const rotateButtonFor = (tool: Tool): RotateButton =>
	tool === 'move' ? MAIN_BUTTON : SECONDARY_BUTTON;

/**
 * A setting brought within its range.
 *
 * @param value - The value asked for; may be infinite.
 * @param min - The least the setting can be.
 * @param max - The most the setting can be.
 * @throws RangeError if `value` is NaN.
 */
export const clampSetting = (
	value: number,
	min: number,
	max: number,
): number => {
	if (Number.isNaN(value)) {
		throw new RangeError('A brush setting must be a number; got NaN');
	}
	return Math.min(max, Math.max(min, value));
};

/**
 * The time a frame is taken to have lasted.
 *
 * @param nowMs - The time now, in milliseconds on any steady clock.
 * @param lastMs - The time of the frame before, on the same clock.
 * @returns The time between them in seconds, from 0 to
 * {@link MAX_FRAME_SECONDS}.
 */
export const frameSeconds = (nowMs: number, lastMs: number): number =>
	Math.min(MAX_FRAME_SECONDS, Math.max(0, (nowMs - lastMs) / 1000));

/**
 * A smoothing setting as the brush takes it.
 *
 * @param value - The setting asked for; may be fractional or infinite.
 * @returns The nearest whole number from {@link MIN_SMOOTH_SETTING} to
 * {@link MAX_SMOOTH_SETTING}.
 * @throws RangeError if `value` is NaN.
 */
export const normaliseSmoothSetting = (value: number): number =>
	Math.round(clampSetting(value, MIN_SMOOTH_SETTING, MAX_SMOOTH_SETTING));

/**
 * The decay rate a smoothing setting stands for on a grid, per second.
 *
 * @remarks
 * Smoothing shrinks the gap between a cell and the mean of its neighbours
 * in proportion to itself, as a hot thing cools, so that the gap fades
 * without ever quite closing. This is the rate of that decay at the brush's
 * centre. The core approximates it with equal passes, each closing a small
 * linear share of the gap.
 *
 * The settings are spaced geometrically: every step up multiplies the rate
 * by the same factor, about 4%, from {@link MIN_SMOOTH_RATE} at the
 * gentlest to {@link MAX_SMOOTH_RATE} at the strongest, so that a step
 * feels alike anywhere on the scale.
 *
 * Evening a cell out with its neighbours moves terrain one cell at a time,
 * so one rate would soften the wide cells of a coarse grid far faster on
 * the ground than the narrow cells of a fine one. The rate therefore grows
 * with the square of the resolution, which makes one setting soften a
 * feature of one size about equally fast on every world.
 *
 * @param setting - The smoothing setting, brought within its range and
 * rounded as {@link normaliseSmoothSetting} does.
 * @param resolution - Cells along a face edge of the world's grid.
 * @returns The rate per second.
 * @throws RangeError if `setting` is NaN.
 */
export const smoothRate = (setting: number, resolution: number): number => {
	const along =
		(normaliseSmoothSetting(setting) - MIN_SMOOTH_SETTING) /
		(MAX_SMOOTH_SETTING - MIN_SMOOTH_SETTING);
	return (
		MIN_SMOOTH_RATE *
		(MAX_SMOOTH_RATE / MIN_SMOOTH_RATE) ** along *
		(resolution / SMOOTH_REFERENCE_RESOLUTION) ** 2
	);
};

/** What the strength of a frame's dabs is worked out from. */
export type DabStrengthOptions = {
	/** What the brush does. */
	readonly mode: BrushMode;
	/** The strength of raising and lowering, in metres per second. */
	readonly strength: number;
	/** The smoothing setting. */
	readonly smoothSetting: number;
	/** How long the frame lasted, in seconds. */
	readonly seconds: number;
	/** How many dabs the frame lays; at least 1. */
	readonly dabs: number;
	/** Cells along a face edge of the world's grid. */
	readonly resolution: number;
};

/**
 * The strength of each dab of a frame, as the core's brush takes it.
 *
 * @remarks
 * What the brush does in the frame's time is shared equally between the
 * frame's dabs, and the shares add up. For raising and lowering that is
 * metres, at the strength in metres per second. For smoothing it is the
 * {@link smoothRate} of the setting times the time, a number without a
 * unit, which the core's brush turns into how far each cell moves towards
 * its neighbours.
 *
 * @param options - The brush, the frame's time and its number of dabs.
 * @returns Metres for raising and lowering; rate times time for smoothing.
 * @throws RangeError if the brush smooths and its setting is NaN.
 */
export const dabStrength = (options: DabStrengthOptions): number => {
	const { mode, seconds, dabs } = options;
	const rate =
		mode === 'smooth'
			? smoothRate(options.smoothSetting, options.resolution)
			: options.strength;
	return (rate * seconds) / dabs;
};

/** What the number of dabs a frame may lay depends on. */
export type DabLimitOptions = {
	/** Cells along a face edge of the world's grid. */
	readonly resolution: number;
	/** Angular radius of the brush in radians. */
	readonly radius: number;
	/**
	 * How many passes over its cells one dab doing the whole frame's work
	 * would make: 1, the default, for raising and lowering, and what the
	 * core's `smoothPasses` gives for smoothing.
	 */
	readonly passes?: number;
};

/**
 * The most dabs one frame may lay with a brush.
 *
 * @remarks
 * A pass of a dab costs about as much as the cells under it, so the wider
 * the brush on the finer the grid, the fewer fit in
 * {@link FRAME_CELL_BUDGET}. Sharing a frame's smoothing between `d` dabs
 * takes fewer than `d` passes more than giving it all to one, so those
 * passes are taken from the budget first and the dabs get what is left.
 *
 * The budget does not hold the work back: the passes a frame's smoothing
 * takes are always made, and {@link MIN_DAB_LIMIT} dabs are always allowed,
 * so the widest brush at the strongest smoothing on the finest grid goes
 * over it, by an amount that grows only with the time the frame took.
 *
 * @param options - The grid, the brush and the passes its work takes.
 * @returns A whole number from {@link MIN_DAB_LIMIT} to
 * {@link MAX_DABS_PER_FRAME}.
 */
export const dabLimit = (options: DabLimitOptions): number => {
	const { resolution, radius, passes = 1 } = options;
	// A cap of angular radius r covers (1 - cos r) / 2 of the sphere.
	const share = (1 - Math.cos(Math.min(radius, Math.PI))) / 2;
	const cells = FACE_COUNT * resolution * resolution * share;
	return Math.min(
		MAX_DABS_PER_FRAME,
		Math.max(
			MIN_DAB_LIMIT,
			Math.floor(FRAME_CELL_BUDGET / cells) - (passes - 1),
		),
	);
};

/** What one frame of a stroke has to go on. */
export type DabPlanOptions = {
	/**
	 * Where the stroke's last dab landed, or null if the stroke has laid
	 * none since it began or since the cursor came back onto the globe.
	 */
	readonly from: Vec3 | null;
	/** The point of the globe under the cursor, or null when it is off it. */
	readonly to: Vec3 | null;
	/** Angular radius of the brush in radians; positive. */
	readonly radius: number;
	/** The most dabs to lay: a whole number, at least 1. */
	readonly limit: number;
};

/**
 * Where one frame of a stroke lays its dabs.
 *
 * @remarks
 * With the cursor off the globe there is nothing to dab. With nowhere to
 * come from there is one dab under the cursor. Otherwise the dabs run along
 * the great circle from the last dab, leaving it out, to the cursor,
 * {@link DAB_SPACING} of the radius apart, or wider if that would take more
 * than the limit: the stroke always reaches the cursor.
 *
 * @param options - The stroke's last dab, the cursor, the brush's radius
 * and the limit.
 * @returns The centres of the dabs in order; no more than the limit.
 */
export const planDabs = (options: DabPlanOptions): Vec3[] => {
	const { from, to, radius, limit } = options;
	if (to === null) {
		return [];
	}
	if (from === null) {
		return [to];
	}
	// Half a step of slack keeps rounding from adding a dab over the limit.
	const widest = angleBetween(from, to) / (limit - 0.5);
	return strokePath(from, to, Math.max(radius * DAB_SPACING, widest));
};

/**
 * The cube faces some cells lie on, as bits: bit `f` is set when a cell of
 * face `f` is among them.
 *
 * @param cells - Cell indices of a grid.
 * @param resolution - Cells along a face edge of that grid.
 */
export const faceBits = (cells: Int32Array, resolution: number): number => {
	const faceCells = resolution * resolution;
	const every = (1 << FACE_COUNT) - 1;
	let bits = 0;
	for (let k = 0; k < cells.length && bits !== every; k++) {
		bits |= 1 << Math.floor((cells[k] as number) / faceCells);
	}
	return bits;
};

/**
 * The cube faces named by bits from {@link faceBits}.
 *
 * @param bits - Bit `f` set for face `f`.
 * @returns The face indices in increasing order.
 */
export const facesOfBits = (bits: number): number[] => {
	const faces: number[] = [];
	for (let face = 0; face < FACE_COUNT; face++) {
		if ((bits & (1 << face)) !== 0) {
			faces.push(face);
		}
	}
	return faces;
};

/**
 * What a whole stroke changed.
 *
 * @remarks
 * The two arrays are parallel and belong to whoever receives them. Writing
 * `before[k]` to cell `cells[k]` for every `k` puts the terrain back as it
 * was when the stroke began.
 */
export type StrokeChanges = {
	/**
	 * Every cell at least one dab of the stroke changed, each once, in the
	 * order the stroke first reached them.
	 */
	readonly cells: Int32Array;
	/** The elevation each of those cells held before the stroke, in metres. */
	readonly before: Float32Array;
};

/** Gathers what the dabs of one stroke at a time change. */
export type StrokeRecord = {
	/** Adds what one dab changed. */
	add(dab: DabResult): void;
	/**
	 * Ends the stroke.
	 *
	 * @returns What the dabs added since the last call changed between
	 * them; the record is then empty, ready for the next stroke.
	 */
	finish(): StrokeChanges;
};

/**
 * Creates a record of the cells strokes change on one grid.
 *
 * @remarks
 * A cell changed by several dabs is kept once, with the value the first of
 * them found. Adding a dab costs only its own cells, and the working memory
 * is allocated here once rather than per stroke.
 *
 * @param cellCount - The number of cells of the world being sculpted.
 */
export const createStrokeRecord = (cellCount: number): StrokeRecord => {
	const seen = new Uint8Array(cellCount);
	const cells = new Int32Array(cellCount);
	const before = new Float32Array(cellCount);
	let count = 0;
	return {
		add: (dab) => {
			for (let k = 0; k < dab.cells.length; k++) {
				const cell = dab.cells[k] as number;
				if (seen[cell] === 0) {
					seen[cell] = 1;
					cells[count] = cell;
					before[count] = dab.before[k] as number;
					count++;
				}
			}
		},
		finish: () => {
			const changes = {
				cells: cells.slice(0, count),
				before: before.slice(0, count),
			};
			for (let k = 0; k < count; k++) {
				seen[cells[k] as number] = 0;
			}
			count = 0;
			return changes;
		},
	};
};

/** What one frame of a stroke works on. */
export type SculptFrameOptions = {
	/** The world to sculpt, in place. */
	readonly world: World;
	/** The record of the stroke, which the frame's changes are added to. */
	readonly record: StrokeRecord;
	/** What the brush does. */
	readonly mode: BrushMode;
	/** Radius of the brush in kilometres along the surface. */
	readonly radiusKm: number;
	/** The strength of raising and lowering, in metres per second. */
	readonly strength: number;
	/** The smoothing setting. */
	readonly smoothSetting: number;
	/** How long the frame lasted, in seconds. */
	readonly seconds: number;
	/**
	 * Where the stroke's last dab landed, or null if the stroke has laid
	 * none since it began or since the cursor came back onto the globe.
	 */
	readonly from: Vec3 | null;
	/** The point of the globe under the cursor, or null when it is off it. */
	readonly to: Vec3 | null;
};

/** What one frame of a stroke did. */
export type SculptFrameResult = {
	/**
	 * Where the next frame's dabs come from: the point under the cursor, or
	 * null when it was off the globe.
	 */
	readonly lastDab: Vec3 | null;
	/** The cube faces with a cell that changed, in increasing order. */
	readonly faces: number[];
};

/**
 * Lays the dabs of one frame of a stroke.
 *
 * @remarks
 * The dabs run from the stroke's last dab to the cursor as
 * {@link planDabs} places them, with what the brush does in the frame's
 * time shared between them by {@link dabStrength}. With the cursor off the
 * globe nothing is changed.
 *
 * @param options - The world, the stroke's record, the brush, the frame's
 * time and where the stroke was and is.
 * @returns Where the stroke now is and the faces it changed.
 */
export const sculptFrame = (options: SculptFrameOptions): SculptFrameResult => {
	const { world, record, mode, radiusKm, to } = options;
	const { resolution } = world;
	const radius = dabRadius(resolution, radiusKm);
	const frame = {
		mode,
		strength: options.strength,
		smoothSetting: options.smoothSetting,
		seconds: options.seconds,
		resolution,
	};
	const dabs = planDabs({
		from: options.from,
		to,
		radius,
		limit: dabLimit({
			resolution,
			radius,
			passes:
				mode === 'smooth'
					? smoothPasses(dabStrength({ ...frame, dabs: 1 }))
					: 1,
		}),
	});
	let changed = 0;
	if (dabs.length > 0) {
		const each = dabStrength({ ...frame, dabs: dabs.length });
		for (const direction of dabs) {
			const dab = applyDab(world, {
				direction,
				radiusKm,
				strength: each,
				mode,
			});
			if (dab.cells.length > 0) {
				changed |= faceBits(dab.cells, resolution);
				record.add(dab);
			}
		}
	}
	return { lastDab: to, faces: facesOfBits(changed) };
};

/** What a sculpt controller starts with and whom it tells about strokes. */
export type SculptOptions = {
	/** The canvas the globe is drawn on, where strokes are made. */
	readonly canvas: HTMLCanvasElement;
	/** The tool chosen at first; {@link DEFAULT_TOOL} by default. */
	readonly tool?: Tool;
	/** The brush radius at first, in kilometres. */
	readonly radiusKm?: number;
	/** The raising and lowering strength at first, in metres per second. */
	readonly strength?: number;
	/** The smoothing setting at first. */
	readonly smoothSetting?: number;
	/** Called when a stroke begins, before it changes anything. */
	readonly onStrokeStart?: () => void;
	/**
	 * Called when a stroke ends, once for every call of `onStrokeStart`,
	 * with what it changed: nothing at all for a stroke that never touched
	 * the globe.
	 */
	readonly onStrokeEnd?: (changes: StrokeChanges) => void;
};

/** The sculpting tools of one globe. */
export type SculptController = {
	/** Chooses the tool. A stroke under way ends first. */
	setTool(tool: Tool): void;
	/**
	 * Sets the brush's radius.
	 *
	 * @param radiusKm - Kilometres along the surface; kept within
	 * {@link MIN_BRUSH_RADIUS_KM} and {@link MAX_BRUSH_RADIUS_KM}.
	 * @throws RangeError if `radiusKm` is NaN.
	 */
	setRadiusKm(radiusKm: number): void;
	/**
	 * Sets how fast the raise and lower brushes work. The smooth brush has
	 * a setting of its own, which this leaves alone.
	 *
	 * @param strength - Metres per second at the brush's centre; kept
	 * within {@link MIN_BRUSH_STRENGTH} and {@link MAX_BRUSH_STRENGTH}.
	 * @throws RangeError if `strength` is NaN.
	 */
	setStrength(strength: number): void;
	/**
	 * Sets how hard the smooth brush works. The raise and lower brushes
	 * keep their strength.
	 *
	 * @param setting - Kept within {@link MIN_SMOOTH_SETTING} and
	 * {@link MAX_SMOOTH_SETTING} and rounded to a whole number. What it
	 * does follows the resolution of the world being sculpted.
	 * @throws RangeError if `setting` is NaN.
	 */
	setSmoothSetting(setting: number): void;
	/**
	 * Sculpts another world from now on. A stroke under way ends first, on
	 * the world it began on. The globe must be given the same world.
	 */
	setWorld(world: World): void;
	/** Ends any stroke, hides the brush and stops listening to the canvas. */
	dispose(): void;
};

/** A stroke under way. */
type Stroke = {
	readonly pointerId: number;
	/** Where the last dab landed; null when the next has nowhere to come from. */
	lastDab: Vec3 | null;
	/** When the last frame of the stroke ran, in milliseconds. */
	lastMs: number;
	/** The animation frame asked for, to cancel when the stroke ends. */
	frame: number;
};

/**
 * Lets the mouse sculpt a world on its globe.
 *
 * @remarks
 * With a brush chosen, a drag with the main button is a stroke: it edits
 * the world's elevation in place and has the globe upload the cube faces
 * that changed, once per frame. Moving the cursor off the globe pauses the
 * stroke without ending it; coming back starts afresh under the cursor
 * rather than drawing a line across from where it left. With the move tool
 * chosen the controller does nothing and shows nothing.
 *
 * The brush's outline follows the cursor whenever a brush is chosen. Its
 * radius is the one dabs really act over, which on a coarse grid is wider
 * than a narrow brush asks for.
 *
 * Which button turns the globe is not decided here: whoever changes the
 * tool should give the view's input {@link rotateButtonFor} that tool, so
 * that no drag both sculpts and turns.
 *
 * @param globe - The globe the world is shown on.
 * @param world - The world to sculpt; the one the globe shows.
 * @param options - The canvas, the starting settings and the callbacks.
 * @returns The controller.
 */
export const createSculptController = (
	globe: Globe,
	world: World,
	options: SculptOptions,
): SculptController => {
	const { canvas } = options;
	const listeners = new AbortController();
	const { signal } = listeners;

	let current = world;
	let record = createStrokeRecord(world.elevation.length);
	let tool: Tool = DEFAULT_TOOL;
	let radiusKm = clampSetting(
		options.radiusKm ?? DEFAULT_BRUSH_RADIUS_KM,
		MIN_BRUSH_RADIUS_KM,
		MAX_BRUSH_RADIUS_KM,
	);
	let strength = clampSetting(
		options.strength ?? DEFAULT_BRUSH_STRENGTH,
		MIN_BRUSH_STRENGTH,
		MAX_BRUSH_STRENGTH,
	);
	let smoothSetting = normaliseSmoothSetting(
		options.smoothSetting ?? DEFAULT_SMOOTH_SETTING,
	);
	/** Where the cursor was last seen over the canvas; null once it leaves. */
	let cursor: WindowPoint | null = null;
	let stroke: Stroke | null = null;

	const showBrush = (): void => {
		if (tool === 'move' || cursor === null) {
			globe.setBrush(null);
		} else {
			globe.setBrush(cursor, dabRadius(current.resolution, radiusKm));
		}
	};

	/** Lays the dabs for the time since the stroke's last frame. */
	const step = (active: Stroke, mode: BrushMode): void => {
		const now = performance.now();
		const seconds = frameSeconds(now, active.lastMs);
		active.lastMs = now;
		const { lastDab, faces } = sculptFrame({
			world: current,
			record,
			mode,
			radiusKm,
			strength,
			smoothSetting,
			seconds,
			from: active.lastDab,
			to: cursor === null ? null : globe.pick(cursor.clientX, cursor.clientY),
		});
		active.lastDab = lastDab;
		if (faces.length > 0) {
			globe.updateElevation(faces);
		}
	};

	const tick = (): void => {
		if (stroke === null || tool === 'move') {
			return;
		}
		stroke.frame = requestAnimationFrame(tick);
		step(stroke, tool);
		// Left to itself the globe would draw these dabs a frame late.
		globe.draw();
	};

	const endStroke = (): void => {
		if (stroke === null) {
			return;
		}
		const { pointerId, frame } = stroke;
		stroke = null;
		cancelAnimationFrame(frame);
		if (canvas.hasPointerCapture(pointerId)) {
			canvas.releasePointerCapture(pointerId);
		}
		options.onStrokeEnd?.(record.finish());
	};

	const track = (event: PointerEvent): void => {
		// A captured pointer keeps reporting from outside the canvas, where
		// a globe zoomed past the canvas's edges could still be picked.
		const inside =
			event.offsetX >= 0 &&
			event.offsetY >= 0 &&
			event.offsetX < canvas.clientWidth &&
			event.offsetY < canvas.clientHeight;
		cursor = inside ? { clientX: event.clientX, clientY: event.clientY } : null;
		showBrush();
	};

	canvas.addEventListener(
		'pointerdown',
		(event) => {
			track(event);
			if (tool === 'move' || event.button !== MAIN_BUTTON || stroke !== null) {
				return;
			}
			// Captured so that the stroke carries on, paused, while the
			// cursor is outside the canvas, and ends wherever the button
			// is let go.
			canvas.setPointerCapture(event.pointerId);
			options.onStrokeStart?.();
			stroke = {
				pointerId: event.pointerId,
				lastDab: null,
				lastMs: performance.now(),
				frame: requestAnimationFrame(tick),
			};
		},
		{ signal },
	);
	/** Ends the stroke as letting go of the button does. */
	const release = (active: Stroke, event: PointerEvent): void => {
		track(event);
		// The time since the last frame still counts, so that even a
		// click shorter than a frame leaves its mark.
		if (tool !== 'move') {
			step(active, tool);
		}
		endStroke();
	};

	canvas.addEventListener(
		'pointermove',
		(event) => {
			// Letting go of the stroke's button while another is held is
			// reported as a move, not as the pointer going up.
			if (
				stroke !== null &&
				event.pointerId === stroke.pointerId &&
				!isButtonHeld(event.buttons, MAIN_BUTTON)
			) {
				release(stroke, event);
				return;
			}
			track(event);
		},
		{ signal },
	);
	canvas.addEventListener(
		'pointerleave',
		() => {
			cursor = null;
			showBrush();
		},
		{ signal },
	);
	canvas.addEventListener(
		'pointerup',
		(event) => {
			if (stroke !== null && event.pointerId === stroke.pointerId) {
				release(stroke, event);
			}
		},
		{ signal },
	);
	const abandon = (event: PointerEvent): void => {
		if (stroke !== null && event.pointerId === stroke.pointerId) {
			endStroke();
		}
	};
	canvas.addEventListener('pointercancel', abandon, { signal });
	canvas.addEventListener('lostpointercapture', abandon, { signal });

	const setTool = (next: Tool): void => {
		endStroke();
		tool = next;
		canvas.classList.toggle(BRUSH_CLASS, next !== 'move');
		showBrush();
	};
	setTool(options.tool ?? DEFAULT_TOOL);

	return {
		setTool,
		setRadiusKm: (value) => {
			radiusKm = clampSetting(value, MIN_BRUSH_RADIUS_KM, MAX_BRUSH_RADIUS_KM);
			showBrush();
		},
		setStrength: (value) => {
			strength = clampSetting(value, MIN_BRUSH_STRENGTH, MAX_BRUSH_STRENGTH);
		},
		setSmoothSetting: (value) => {
			smoothSetting = normaliseSmoothSetting(value);
		},
		setWorld: (next) => {
			endStroke();
			current = next;
			record = createStrokeRecord(next.elevation.length);
			showBrush();
		},
		dispose: () => {
			endStroke();
			listeners.abort();
			canvas.classList.remove(BRUSH_CLASS);
			globe.setBrush(null);
		},
	};
};
