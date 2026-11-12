import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	cellAt,
	cellCentre,
	createBlankWorld,
	directionToLatLon,
	getGrid,
	latLonToDirection,
	type Vec3,
	type World,
} from '../../core/index';
import {
	createFakeCanvas,
	createFakeFrames,
	type FakeFrames,
} from '../testing/fakeCanvas';
import {
	byClass,
	createFakeDocument,
	type FakeDocument,
	oneByClass,
} from '../testing/fakeDocument';
import { DEFAULT_MONTH } from '../view';
import {
	createCursorReadout,
	createReadoutStrip,
	describeReadout,
	formatElevation,
	formatLatLon,
	formatTemperature,
	READOUT_OUT_OF_DATE_TEXT,
	type ReadoutText,
	readoutPartsAt,
} from './cursorReadout';
import type { ShownTemperature } from './layerPanel';

describe('formatLatLon', () => {
	it('writes each coordinate to a tenth of a degree with its letter', () => {
		expect(formatLatLon(27.94, 86.925)).toBe('27.9° N, 86.9° E');
		expect(formatLatLon(-33.86, -151.21)).toBe('33.9° S, 151.2° W');
		expect(formatLatLon(-0.06, 0.04)).toBe('0.1° S, 0.0° E');
	});

	it('writes the equator as north and the prime meridian as east, from either side', () => {
		expect(formatLatLon(0, 0)).toBe('0.0° N, 0.0° E');
		expect(formatLatLon(-0.04, -0.04)).toBe('0.0° N, 0.0° E');
		expect(formatLatLon(-0, -0)).toBe('0.0° N, 0.0° E');
	});

	it('writes the date line as east, from either side', () => {
		expect(formatLatLon(10, 180)).toBe('10.0° N, 180.0° E');
		expect(formatLatLon(10, -180)).toBe('10.0° N, 180.0° E');
		expect(formatLatLon(10, -179.96)).toBe('10.0° N, 180.0° E');
		expect(formatLatLon(10, -179.94)).toBe('10.0° N, 179.9° W');
		expect(formatLatLon(10, 179.94)).toBe('10.0° N, 179.9° E');
	});

	it('leaves the longitude out where the latitude rounds to a pole', () => {
		expect(formatLatLon(90, 0)).toBe('90.0° N');
		expect(formatLatLon(89.96, -123.4)).toBe('90.0° N');
		expect(formatLatLon(-90, 45)).toBe('90.0° S');
		expect(formatLatLon(89.94, -123.4)).toBe('89.9° N, 123.4° W');
	});
});

describe('formatElevation', () => {
	it('writes land as its height above the sea, in whole metres grouped in threes', () => {
		expect(formatElevation(1)).toBe('1 m');
		expect(formatElevation(1234.4)).toBe('1,234 m');
		expect(formatElevation(12_000)).toBe('12,000 m');
	});

	it('writes the sea as its depth below the sea level', () => {
		expect(formatElevation(-3400)).toBe('3,400 m deep');
		expect(formatElevation(-1.6)).toBe('2 m deep');
	});

	it('takes a place exactly at the sea level as sea', () => {
		expect(formatElevation(0)).toBe('0 m deep');
		expect(formatElevation(-0)).toBe('0 m deep');
		expect(formatElevation(-0.3)).toBe('0 m deep');
	});

	it('takes anything above the sea level as land, however little', () => {
		expect(formatElevation(0.3)).toBe('0 m');
	});
});

describe('formatTemperature', () => {
	it('names the month for the Month view', () => {
		expect(formatTemperature(18.2, 'month', 6)).toBe('July 18 °C');
		expect(formatTemperature(3, 'month', 0)).toBe('January 3 °C');
	});

	it('names each summary', () => {
		expect(formatTemperature(14, 'annualMean', 6)).toBe('Annual average 14 °C');
		expect(formatTemperature(27, 'warmest', 6)).toBe('Warmest month 27 °C');
		expect(formatTemperature(-31, 'coldest', 6)).toBe('Coldest month −31 °C');
	});

	it('names the seasonal range as a range, not a temperature', () => {
		expect(formatTemperature(12.3, 'range', 6)).toBe('Seasonal range 12 °C');
	});

	it('rounds to whole degrees with a true minus sign', () => {
		expect(formatTemperature(-31.4, 'month', 6)).toBe('July −31 °C');
		expect(formatTemperature(-0.6, 'month', 6)).toBe('July −1 °C');
		expect(formatTemperature(14.5, 'month', 6)).toBe('July 15 °C');
		expect(formatTemperature(-2.5, 'month', 6)).toBe('July −2 °C');
	});

	it('never writes −0', () => {
		expect(formatTemperature(-0.4, 'month', 6)).toBe('July 0 °C');
		expect(formatTemperature(-0.5, 'month', 6)).toBe('July 0 °C');
		expect(formatTemperature(-0, 'month', 6)).toBe('July 0 °C');
	});

	it('groups the digits of a hot planet in threes', () => {
		expect(formatTemperature(1234.4, 'annualMean', 6)).toBe(
			'Annual average 1,234 °C',
		);
		expect(formatTemperature(-1234.4, 'coldest', 6)).toBe(
			'Coldest month −1,234 °C',
		);
		expect(formatTemperature(412, 'warmest', 6)).toBe('Warmest month 412 °C');
	});
});

describe('describeReadout', () => {
	const place = {
		latitudeDeg: 27.94,
		longitudeDeg: 86.925,
		heightM: 8123,
	};

	it('says the position and elevation alone with no temperature', () => {
		expect(describeReadout({ ...place, temperature: null })).toEqual({
			position: '27.9° N, 86.9° E',
			elevation: '8,123 m',
			temperature: null,
			status: null,
		});
	});

	it('adds a current temperature with nothing more', () => {
		expect(
			describeReadout({
				...place,
				temperature: { value: -18.2, view: 'month', month: 6, current: true },
			}),
		).toEqual({
			position: '27.9° N, 86.9° E',
			elevation: '8,123 m',
			temperature: 'July −18 °C',
			status: null,
		});
	});

	it('marks a temperature that is not current out of date', () => {
		const text = describeReadout({
			...place,
			heightM: -3400,
			temperature: { value: 12, view: 'range', month: 6, current: false },
		});
		expect(text).toEqual({
			position: '27.9° N, 86.9° E',
			elevation: '3,400 m deep',
			temperature: 'Seasonal range 12 °C',
			status: READOUT_OUT_OF_DATE_TEXT,
		});
		expect(READOUT_OUT_OF_DATE_TEXT).toBe('out of date');
	});
});

/** The direction of a latitude and longitude, and its cell on the 64 grid. */
const placeAt = (latitudeDeg: number, longitudeDeg: number) => {
	const direction = latLonToDirection(latitudeDeg, longitudeDeg);
	const cell = cellAt(getGrid(64), direction);
	return { direction, cell };
};

/** The position of a direction as the readout writes it. */
const positionOf = (direction: Vec3): string => {
	const { latitudeDeg, longitudeDeg } = directionToLatLon(direction);
	return formatLatLon(latitudeDeg, longitudeDeg);
};

/** The position the readout writes for the land of `overLand`. */
const LAND_POSITION = '27.9° N, 86.9° E';

/** What the globe shows of the temperature, current, for the Month view. */
const shownOf = (
	field: Float32Array,
	values: Partial<ShownTemperature> = {},
): ShownTemperature => ({
	field,
	view: 'month',
	month: DEFAULT_MONTH,
	current: true,
	...values,
});

describe('readoutPartsAt', () => {
	it('gives the direction’s own position and its cell’s height from the sea level', () => {
		const world = createBlankWorld(64);
		world.seaLevel = 120;
		const { direction, cell } = placeAt(27.94, 86.925);
		world.elevation[cell] = 8123;
		const parts = readoutPartsAt(world, direction, null);
		expect(parts.latitudeDeg).toBeCloseTo(27.94, 9);
		expect(parts.longitudeDeg).toBeCloseTo(86.925, 9);
		expect(parts.heightM).toBe(8003);
		expect(parts.temperature).toBeNull();
		// Not the centre of the cell, which lies elsewhere in it.
		const centre = directionToLatLon(cellCentre(getGrid(64), cell));
		expect(Math.abs(centre.latitudeDeg - 27.94)).toBeGreaterThan(0.05);
	});

	it('reaches the pole, which no cell’s centre does', () => {
		const world = createBlankWorld(64);
		const parts = readoutPartsAt(world, [0, 0, 1], null);
		expect(parts.latitudeDeg).toBe(90);
		expect(formatLatLon(parts.latitudeDeg, parts.longitudeDeg)).toBe('90.0° N');
	});

	it('takes the value of the field at that cell alone, with what the field is', () => {
		const world = createBlankWorld(64);
		const { direction, cell } = placeAt(-20, 140);
		const field = new Float32Array(world.elevation.length).fill(99);
		field[cell] = -12.5;
		expect(
			readoutPartsAt(
				world,
				direction,
				shownOf(field, { view: 'coldest', current: false }),
			).temperature,
		).toEqual({
			value: -12.5,
			view: 'coldest',
			month: DEFAULT_MONTH,
			current: false,
		});
	});

	it('gives no temperature for a field of another grid, or no value', () => {
		const world = createBlankWorld(64);
		const { direction, cell } = placeAt(-20, 140);
		expect(
			readoutPartsAt(world, direction, shownOf(new Float32Array(12)))
				.temperature,
		).toBeNull();
		const field = new Float32Array(world.elevation.length);
		field[cell] = Number.NaN;
		expect(
			readoutPartsAt(world, direction, shownOf(field)).temperature,
		).toBeNull();
	});
});

/** A point of the canvas off the globe, over the background. */
const BACKGROUND_X = 700;

/**
 * Stands in for `ResizeObserver`: an observer is called only when a test
 * says that what it observes has changed size.
 */
const createFakeResizeObservers = () => {
	/** The targets each observer observes, by its callback. */
	const observers = new Map<() => void, Set<unknown>>();
	class FakeResizeObserver {
		readonly #callback: () => void;
		constructor(callback: () => void) {
			this.#callback = callback;
			observers.set(callback, new Set());
		}
		observe(target: unknown): void {
			observers.get(this.#callback)?.add(target);
		}
		unobserve(target: unknown): void {
			observers.get(this.#callback)?.delete(target);
		}
		disconnect(): void {
			observers.get(this.#callback)?.clear();
		}
	}
	return {
		FakeResizeObserver,
		/** Calls each observer that observes the target, as a resize does. */
		resize: (target: unknown): void => {
			for (const [callback, targets] of observers) {
				if (targets.has(target)) {
					callback();
				}
			}
		},
		/** How many observers observe the target. */
		observing: (target: unknown): number => {
			const all = [...observers.values()];
			return all.filter((targets) => targets.has(target)).length;
		},
	};
};

/** What the stand-ins for the page hold, which a test may change. */
type Page = {
	world: World;
	strokeActive: boolean;
	shownTemperature: ShownTemperature | null;
	/** How many times the globe was asked for the point under the pointer. */
	picks: number;
};

/** The readout on a stand-in canvas and globe, with fake frames. */
const createStage = (world: World = createBlankWorld(64)) => {
	const fake = createFakeCanvas(800, 600);
	const shows: (ReadoutText | null)[] = [];
	/** The direction the globe finds under each point, by its x. */
	const directions = new Map<number, Vec3>();
	const page: Page = {
		world,
		strokeActive: false,
		shownTemperature: null,
		picks: 0,
	};
	const readout = createCursorReadout({
		canvas: fake.canvas,
		globe: {
			pick: (clientX: number) => {
				page.picks++;
				return directions.get(clientX) ?? null;
			},
		},
		currentWorld: () => page.world,
		isStrokeActive: () => page.strokeActive,
		shownTemperature: () => page.shownTemperature,
		show: (text) => shows.push(text),
	});
	return Object.assign(page, {
		fake,
		shows,
		directions,
		readout,
		/** Moves the pointer over the canvas to a point. */
		move: (clientX: number, fields: { offsetX?: number } = {}) => {
			fake.dispatch('pointermove', { clientX, clientY: 300, ...fields });
		},
		last: () => shows.at(-1),
	});
};

describe('createCursorReadout', () => {
	let frames: FakeFrames;
	let resizes: ReturnType<typeof createFakeResizeObservers>;

	beforeEach(() => {
		frames = createFakeFrames();
		resizes = createFakeResizeObservers();
		vi.stubGlobal('requestAnimationFrame', frames.request);
		vi.stubGlobal('cancelAnimationFrame', frames.cancel);
		vi.stubGlobal('ResizeObserver', resizes.FakeResizeObserver);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	/** A stage with the pointer over a cell of land 1,234 m high. */
	const overLand = () => {
		const stage = createStage();
		const { direction, cell } = placeAt(27.94, 86.925);
		stage.world.elevation[cell] = 1234;
		stage.directions.set(100, direction);
		stage.move(100);
		frames.runFrame(16);
		return { stage, cell };
	};

	it('shows nothing until the pointer is over the globe, and asks no frame', () => {
		const stage = createStage();
		expect(stage.shows).toEqual([]);
		expect(frames.pending()).toBe(0);
	});

	it('shows the position and elevation alone in Terrain view', () => {
		const { stage } = overLand();
		expect(stage.shows).toEqual([
			{
				position: LAND_POSITION,
				elevation: '1,234 m',
				temperature: null,
				status: null,
			},
		]);
		expect(frames.pending()).toBe(0);
	});

	it('looks once a frame, however many moves arrive in it', () => {
		const stage = createStage();
		const first = placeAt(10, 10);
		const second = placeAt(-40, -70);
		stage.directions.set(100, first.direction);
		stage.directions.set(101, second.direction);
		for (let k = 0; k < 20; k++) {
			stage.move(k % 2 === 0 ? 100 : 101);
		}
		expect(frames.pending()).toBe(1);
		expect(stage.picks).toBe(0);
		frames.runFrame(16);
		expect(stage.picks).toBe(1);
		expect(stage.shows).toHaveLength(1);
		expect(stage.last()?.position).toBe(positionOf(second.direction));
		expect(stage.last()?.position).toBe('40.0° S, 70.0° W');
	});

	it('says how deep the sea is, from the sea level', () => {
		const stage = createStage();
		const { direction, cell } = placeAt(0, -160);
		stage.world.elevation[cell] = -3000;
		stage.world.seaLevel = 400;
		stage.directions.set(100, direction);
		stage.move(100);
		frames.runFrame(16);
		expect(stage.last()?.elevation).toBe('3,400 m deep');
	});

	it('adds the temperature on screen in Temperature view, marked once out of date', () => {
		const { stage, cell } = overLand();
		const field = new Float32Array(stage.world.elevation.length);
		field[cell] = -18.4;
		stage.shownTemperature = shownOf(field);
		stage.readout.invalidate();
		frames.runFrame(16);
		expect(stage.last()).toMatchObject({
			temperature: 'July −18 °C',
			status: null,
		});

		stage.shownTemperature = shownOf(field, { current: false });
		stage.readout.invalidate();
		frames.runFrame(16);
		expect(stage.last()).toMatchObject({
			temperature: 'July −18 °C',
			status: READOUT_OUT_OF_DATE_TEXT,
		});
	});

	it('has no temperature while the globe shows none, as before a result', () => {
		const { stage } = overLand();
		stage.shownTemperature = null;
		stage.readout.invalidate();
		frames.runFrame(16);
		// Nothing changed, so nothing more was shown.
		expect(stage.shows).toHaveLength(1);
		expect(stage.last()?.temperature).toBeNull();
	});

	it.each([
		[
			'the month',
			(shown: ShownTemperature, field: Float32Array) => ({
				...shown,
				month: 0,
				field,
			}),
			'January 5 °C',
		],
		[
			'the view',
			(shown: ShownTemperature, field: Float32Array) => ({
				...shown,
				view: 'annualMean' as const,
				field,
			}),
			'Annual average 5 °C',
		],
		[
			'the result',
			(shown: ShownTemperature, field: Float32Array) => ({ ...shown, field }),
			'July 5 °C',
		],
	])(
		'looks again after invalidate() when %s on screen changes',
		(_name, change, text) => {
			const { stage } = overLand();
			const length = stage.world.elevation.length;
			stage.shownTemperature = shownOf(new Float32Array(length).fill(1));
			stage.readout.invalidate();
			frames.runFrame(16);
			expect(stage.last()?.temperature).toBe('July 1 °C');

			stage.shownTemperature = change(
				stage.shownTemperature,
				new Float32Array(length).fill(5),
			);
			stage.readout.invalidate();
			frames.runFrame(16);
			expect(stage.last()?.temperature).toBe(text);
		},
	);

	it('looks again after invalidate() when the temperature on screen is gone', () => {
		const { stage } = overLand();
		stage.shownTemperature = shownOf(
			new Float32Array(stage.world.elevation.length).fill(1),
		);
		stage.readout.invalidate();
		frames.runFrame(16);
		stage.shownTemperature = null;
		stage.readout.invalidate();
		frames.runFrame(16);
		expect(stage.last()?.temperature).toBeNull();
	});

	it('looks again after invalidate() when the globe finds another place under the pointer', () => {
		const { stage } = overLand();
		const { direction, cell } = placeAt(-60, 20);
		stage.world.elevation[cell] = 10;
		stage.directions.set(100, direction);
		stage.readout.invalidate();
		frames.runFrame(16);
		expect(stage.last()).toMatchObject({
			position: '60.0° S, 20.0° E',
			elevation: '10 m',
		});
	});

	it('looks again after invalidate() when the world under the pointer is another', () => {
		const { stage } = overLand();
		stage.world = createBlankWorld(64);
		stage.readout.invalidate();
		frames.runFrame(16);
		expect(stage.last()).toMatchObject({
			position: LAND_POSITION,
			elevation: '4,000 m deep',
		});
	});

	it('follows the terrain under a still pointer every frame of a stroke, and stops after', () => {
		const { stage, cell } = overLand();
		stage.strokeActive = true;
		stage.fake.dispatch('pointerdown', {
			clientX: 100,
			clientY: 300,
			buttons: 1,
		});
		frames.runFrame(16);
		for (const height of [1300, 1400, 1500]) {
			stage.world.elevation[cell] = height;
			const picks = stage.picks;
			frames.runFrame(16);
			expect(stage.picks).toBe(picks + 1);
			expect(stage.last()?.elevation).toBe(
				`${height.toLocaleString('en-GB')} m`,
			);
		}
		stage.strokeActive = false;
		stage.world.elevation[cell] = 1600;
		frames.runFrame(16);
		expect(stage.last()?.elevation).toBe('1,600 m');
		expect(frames.pending()).toBe(0);
	});

	it('looks no more during a stroke while the pointer is over the background', () => {
		const { stage } = overLand();
		stage.strokeActive = true;
		stage.move(BACKGROUND_X);
		frames.runFrame(16);
		expect(stage.last()).toBeNull();
		expect(frames.pending()).toBe(0);
	});

	it('looks again when the canvas changes size under a still pointer', () => {
		const { stage } = overLand();
		const { direction } = placeAt(-60, 20);
		stage.directions.set(100, direction);
		resizes.resize(stage.fake.canvas);
		expect(frames.pending()).toBe(1);
		frames.runFrame(16);
		expect(stage.picks).toBe(2);
		expect(stage.last()?.position).toBe('60.0° S, 20.0° E');
	});

	it('looks not at all when the canvas changes size with the pointer off it', () => {
		const { stage } = overLand();
		stage.fake.dispatch('pointerleave');
		frames.runFrame(16);
		resizes.resize(stage.fake.canvas);
		expect(frames.pending()).toBe(0);
		expect(stage.picks).toBe(1);
	});

	it('hides when the pointer goes up outside the canvas, and shows when it goes up over the globe', () => {
		const { stage } = overLand();
		stage.fake.dispatch('pointerup', {
			clientX: 100,
			clientY: 300,
			offsetX: -5,
		});
		frames.runFrame(16);
		expect(stage.last()).toBeNull();
		stage.fake.dispatch('pointerup', { clientX: 100, clientY: 300 });
		frames.runFrame(16);
		expect(stage.last()?.elevation).toBe('1,234 m');
	});

	it('hands the text on only when it changes', () => {
		const { stage } = overLand();
		stage.move(100);
		frames.runFrame(16);
		stage.readout.invalidate();
		frames.runFrame(16);
		expect(stage.shows).toHaveLength(1);
	});

	it('hides when the pointer leaves the canvas', () => {
		const { stage } = overLand();
		stage.fake.dispatch('pointerleave');
		frames.runFrame(16);
		expect(stage.last()).toBeNull();
		// A still pointer off the canvas has nothing under it.
		stage.readout.invalidate();
		frames.runFrame(16);
		expect(stage.shows).toEqual([expect.anything(), null]);
	});

	it('hides over the background around the globe', () => {
		const { stage } = overLand();
		stage.move(BACKGROUND_X);
		frames.runFrame(16);
		expect(stage.last()).toBeNull();
	});

	it('hides while a captured pointer is outside the canvas', () => {
		const { stage } = overLand();
		stage.move(100, { offsetX: -5 });
		frames.runFrame(16);
		expect(stage.last()).toBeNull();
	});

	it('hides at once when cleared, until the pointer moves again', () => {
		const { stage } = overLand();
		stage.move(100);
		stage.readout.clear();
		expect(stage.last()).toBeNull();
		expect(frames.pending()).toBe(0);
		stage.readout.invalidate();
		frames.runFrame(16);
		expect(stage.shows).toHaveLength(2);
		stage.move(100);
		frames.runFrame(16);
		expect(stage.last()?.elevation).toBe('1,234 m');
	});

	it('stops listening to the canvas once disposed', () => {
		const { stage } = overLand();
		stage.readout.dispose();
		expect(stage.last()).toBeNull();
		stage.move(100);
		stage.readout.invalidate();
		expect(frames.pending()).toBe(0);
	});

	it('stops following the canvas’s size once disposed', () => {
		const { stage } = overLand();
		expect(resizes.observing(stage.fake.canvas)).toBe(1);
		stage.readout.dispose();
		expect(resizes.observing(stage.fake.canvas)).toBe(0);
		resizes.resize(stage.fake.canvas);
		expect(frames.pending()).toBe(0);
		expect(stage.picks).toBe(1);
	});
});

describe('createReadoutStrip', () => {
	let fake: FakeDocument;
	beforeEach(() => {
		fake = createFakeDocument();
		vi.stubGlobal('document', fake.document);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const make = () => {
		const viewport = fake.createElement('main');
		const strip = createReadoutStrip(viewport as unknown as HTMLElement);
		const element = oneByClass(viewport, 'cursor-readout');
		const part = (name: string) =>
			oneByClass(element, `cursor-readout__${name}`);
		return { strip, element, part };
	};

	it('adds a strip to the globe’s area, hidden, and hidden from assistive technology', () => {
		const { element } = make();
		expect(element.hidden).toBe(true);
		expect(element.getAttribute('aria-hidden')).toBe('true');
		expect(element.getAttribute('aria-live')).toBeNull();
		expect(element.children.map((child) => child.className)).toEqual([
			'cursor-readout__position',
			'cursor-readout__elevation',
			'cursor-readout__temperature',
		]);
		expect(
			oneByClass(element, 'cursor-readout__temperature').children.map(
				(child) => child.className,
			),
		).toEqual(['cursor-readout__value', 'cursor-readout__status']);
	});

	it('shows each part of the text, hiding the parts with nothing to say', () => {
		const { strip, element, part } = make();
		strip.show({
			position: '27.9° N, 86.9° E',
			elevation: '8,123 m',
			temperature: null,
			status: null,
		});
		expect(element.hidden).toBe(false);
		expect(part('position').textContent).toBe('27.9° N, 86.9° E');
		expect(part('elevation').textContent).toBe('8,123 m');
		expect(part('temperature').hidden).toBe(true);
		expect(part('status').hidden).toBe(true);

		strip.show({
			position: '27.9° N, 86.9° E',
			elevation: '8,123 m',
			temperature: 'July −18 °C',
			status: 'out of date',
		});
		expect(part('temperature').hidden).toBe(false);
		expect(part('value').textContent).toBe('July −18 °C');
		expect(part('status').textContent).toBe('out of date');
		expect(byClass(element, 'cursor-readout__status')[0]?.hidden).toBe(false);

		strip.show(null);
		expect(element.hidden).toBe(true);
	});

	it('hides the mark of a temperature out of date once it is current', () => {
		const { strip, part } = make();
		strip.show({
			position: '27.9° N, 86.9° E',
			elevation: '8,123 m',
			temperature: 'July −18 °C',
			status: 'out of date',
		});
		strip.show({
			position: '27.9° N, 86.9° E',
			elevation: '8,123 m',
			temperature: 'July −18 °C',
			status: null,
		});
		expect(part('temperature').hidden).toBe(false);
		expect(part('value').textContent).toBe('July −18 °C');
		expect(part('status').hidden).toBe(true);
		expect(part('status').textContent).toBe('');
	});
});
