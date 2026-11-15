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
import { PRESSURE_LAYER, TEMPERATURE_LAYER } from '../scalarLayer';
import {
	createFakeCanvas,
	createFakeFrames,
	type FakeFrames,
} from '../testing/fakeCanvas';
import {
	createFakeDocument,
	type FakeElement,
	oneByClass,
} from '../testing/fakeDocument';
import { MADE_UP_LAYER } from '../testing/scalarLayerFixtures';
import { WIND_UNITS, type WindUnit } from '../windUnits';
import {
	createCursorReadout,
	createReadoutBlock,
	describeReadout,
	formatElevation,
	formatLatLon,
	formatLayerValue,
	formatReadoutWind,
	READOUT_OBSERVED_WIND_TEXT,
	READOUT_OUT_OF_DATE_TEXT,
	READOUT_SEPARATOR,
	type ReadoutText,
	readoutPartsAt,
} from './cursorReadout';
import type { ShownLayer, ShownWinds } from './layerPanel';

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

describe('formatLayerValue', () => {
	it('writes the value and its unit alone, with no month or summary named', () => {
		expect(formatLayerValue(TEMPERATURE_LAYER, 18.2)).toBe('18 °C');
		expect(formatLayerValue(TEMPERATURE_LAYER, 3)).toBe('3 °C');
		expect(formatLayerValue(TEMPERATURE_LAYER, 12.3)).toBe('12 °C');
		expect(formatLayerValue(PRESSURE_LAYER, 1017.6)).toBe('1,018 hPa');
		expect(formatLayerValue(MADE_UP_LAYER, 1015)).toMatch(/hPa$/);
	});

	it('rounds to whole degrees with a true minus sign', () => {
		expect(formatLayerValue(TEMPERATURE_LAYER, -31.4)).toBe('−31 °C');
		expect(formatLayerValue(TEMPERATURE_LAYER, -0.6)).toBe('−1 °C');
		expect(formatLayerValue(TEMPERATURE_LAYER, 14.5)).toBe('15 °C');
		expect(formatLayerValue(TEMPERATURE_LAYER, -2.5)).toBe('−2 °C');
	});

	it('never writes −0', () => {
		expect(formatLayerValue(TEMPERATURE_LAYER, -0.4)).toBe('0 °C');
		expect(formatLayerValue(TEMPERATURE_LAYER, -0.5)).toBe('0 °C');
		expect(formatLayerValue(TEMPERATURE_LAYER, -0)).toBe('0 °C');
	});

	it('marks the observed temperature as observed, after the value', () => {
		expect(formatLayerValue(TEMPERATURE_LAYER, 21.2, 'observed')).toBe(
			'21 °C observed',
		);
		expect(formatLayerValue(TEMPERATURE_LAYER, -12, 'observed')).toBe(
			'−12 °C observed',
		);
		expect(formatLayerValue(TEMPERATURE_LAYER, 18, 'simulated')).toBe('18 °C');
	});

	it('signs a difference both ways, and never zero', () => {
		expect(formatLayerValue(TEMPERATURE_LAYER, 2.2, 'difference')).toBe(
			'+2 °C difference',
		);
		expect(formatLayerValue(TEMPERATURE_LAYER, -3, 'difference')).toBe(
			'−3 °C difference',
		);
		for (const value of [0, -0, 0.4, -0.4, -0.5]) {
			expect(
				formatLayerValue(TEMPERATURE_LAYER, value, 'difference'),
				`${value}`,
			).toBe('0 °C difference');
		}
		expect(formatLayerValue(PRESSURE_LAYER, -4.4, 'difference')).toBe(
			'−4 hPa difference',
		);
	});

	it('groups the digits of a hot planet in threes', () => {
		expect(formatLayerValue(TEMPERATURE_LAYER, 1234.4)).toBe('1,234 °C');
		expect(formatLayerValue(TEMPERATURE_LAYER, -1234.4)).toBe('−1,234 °C');
		expect(formatLayerValue(TEMPERATURE_LAYER, 412)).toBe('412 °C');
	});
});

describe('describeReadout', () => {
	const place = {
		latitudeDeg: 27.94,
		longitudeDeg: 86.925,
		heightM: 8123,
		value: null,
		wind: null,
	};

	it('says the position and elevation alone with no temperature', () => {
		expect(describeReadout({ ...place, value: null })).toEqual({
			position: '27.9° N, 86.9° E',
			elevation: '8,123 m',
			value: null,
			status: null,
			wind: null,
			windStatus: null,
		});
	});

	it('adds a current temperature with nothing more', () => {
		expect(
			describeReadout({
				...place,
				value: {
					layer: TEMPERATURE_LAYER,
					value: -18.2,
					source: 'simulated',
					current: true,
				},
			}),
		).toEqual({
			position: '27.9° N, 86.9° E',
			elevation: '8,123 m',
			value: '−18 °C',
			status: null,
			wind: null,
			windStatus: null,
		});
	});

	it('names the source of the temperature, marked out of date as any other', () => {
		expect(
			describeReadout({
				...place,
				value: {
					layer: TEMPERATURE_LAYER,
					value: -12,
					source: 'difference',
					current: false,
				},
			}),
		).toEqual({
			position: '27.9° N, 86.9° E',
			elevation: '8,123 m',
			value: '−12 °C difference',
			status: READOUT_OUT_OF_DATE_TEXT,
			wind: null,
			windStatus: null,
		});
		expect(
			describeReadout({
				...place,
				value: {
					layer: TEMPERATURE_LAYER,
					value: 21,
					source: 'observed',
					current: true,
				},
			}).value,
		).toBe('21 °C observed');
	});

	it('marks a temperature that is not current out of date', () => {
		const text = describeReadout({
			...place,
			heightM: -3400,
			value: {
				layer: TEMPERATURE_LAYER,
				value: 12,
				source: 'simulated',
				current: false,
			},
		});
		expect(text).toEqual({
			position: '27.9° N, 86.9° E',
			elevation: '3,400 m deep',
			value: '12 °C',
			status: READOUT_OUT_OF_DATE_TEXT,
			wind: null,
			windStatus: null,
		});
		expect(READOUT_OUT_OF_DATE_TEXT).toBe('out of date');
	});

	/** A wind NE at 5√2 m/s, about 7 m/s. */
	const northEasterly = {
		east: -5,
		north: -5,
		current: true,
	};

	it('adds the wind, in m/s when no unit is given', () => {
		const text = describeReadout({ ...place, wind: northEasterly });
		expect(text).toEqual({
			position: '27.9° N, 86.9° E',
			elevation: '8,123 m',
			value: null,
			status: null,
			wind: '7 m/s NE',
			windStatus: null,
		});
	});

	it('marks an observed wind at the end, and a simulated one not at all', () => {
		/** A westerly of 7 m/s. */
		const westerly = { ...northEasterly, east: 7, north: 0 };
		expect(READOUT_OBSERVED_WIND_TEXT).toBe('observed');
		expect(formatReadoutWind({ ...westerly, source: 'observed' }, 'm/s')).toBe(
			'7 m/s W observed',
		);
		expect(
			formatReadoutWind(
				{ ...westerly, east: 0.2, north: 0.1, source: 'observed' },
				'm/s',
			),
		).toBe('calm observed');
		expect(formatReadoutWind({ ...westerly, source: 'observed' }, 'km/h')).toBe(
			'25 km/h W observed',
		);
		expect(formatReadoutWind({ ...westerly, source: 'simulated' }, 'm/s')).toBe(
			'7 m/s W',
		);
		expect(formatReadoutWind(westerly, 'm/s')).toBe('7 m/s W');
		expect(
			describeReadout({ ...place, wind: { ...westerly, source: 'observed' } })
				.wind,
		).toBe('7 m/s W observed');
	});

	it('writes the wind in the unit given', () => {
		expect(
			describeReadout({ ...place, wind: northEasterly }, 'km/h').wind,
		).toBe('25 km/h NE');
		expect(describeReadout({ ...place, wind: northEasterly }, 'mph').wind).toBe(
			'16 mph NE',
		);
	});

	it.each([
		[true, true, null, null],
		[true, false, null, READOUT_OUT_OF_DATE_TEXT],
		[false, true, READOUT_OUT_OF_DATE_TEXT, null],
		[false, false, READOUT_OUT_OF_DATE_TEXT, READOUT_OUT_OF_DATE_TEXT],
	])(
		'marks the temperature (current %s) and the wind (current %s) out of date each on its own',
		(temperatureCurrent, windCurrent, status, windStatus) => {
			const text = describeReadout({
				...place,
				value: {
					layer: TEMPERATURE_LAYER,
					value: 18,
					source: 'simulated',
					current: temperatureCurrent,
				},
				wind: { ...northEasterly, current: windCurrent },
			});
			expect(text).toMatchObject({
				value: '18 °C',
				status,
				wind: '7 m/s NE',
				windStatus,
			});
		},
	);

	it('reads a calm wind as calm in every unit, from below 0.5 m/s, with no direction', () => {
		for (const unit of WIND_UNITS) {
			const calm = { ...northEasterly, east: 0.49, north: 0 };
			expect(describeReadout({ ...place, wind: calm }, unit).wind, unit).toBe(
				'calm',
			);
			const light = { ...northEasterly, east: 0.5, north: 0 };
			expect(
				describeReadout({ ...place, wind: light }, unit).wind,
				unit,
			).toMatch(/ W$/);
		}
	});
});

describe('formatReadoutWind', () => {
	const wind = (east: number, north: number) => ({
		east,
		north,
		current: true,
	});

	it('gives the speed and the point of the compass the wind blows from', () => {
		expect(formatReadoutWind(wind(7, 0), 'm/s')).toBe('7 m/s W');
		expect(formatReadoutWind(wind(0, -10), 'km/h')).toBe('36 km/h N');
		expect(formatReadoutWind(wind(0, 10), 'mph')).toBe('22 mph S');
		expect(formatReadoutWind(wind(-30, 0), 'm/s')).toBe('30 m/s E');
	});

	it.each([
		['N', 0, -10],
		['NE', -7, -7],
		['E', -10, 0],
		['SE', -7, 7],
		['S', 0, 10],
		['SW', 7, 7],
		['W', 10, 0],
		['NW', 7, -7],
	] as const)(
		'writes a wind from the %s as that point',
		(point, east, north) => {
			expect(formatReadoutWind(wind(east, north), 'm/s')).toBe(
				`10 m/s ${point}`,
			);
		},
	);
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
	values: Partial<ShownLayer> = {},
): ShownLayer => ({
	layer: TEMPERATURE_LAYER,
	field,
	source: 'simulated',
	current: true,
	...values,
});

/** What the globe shows of the winds, current, of a month. */
const windsOf = (
	field: ShownWinds['field'],
	values: Partial<ShownWinds> = {},
): ShownWinds => ({ field, current: true, ...values });

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
		expect(parts.value).toBeNull();
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

	it('takes the value of the field at that cell alone, with where it comes from', () => {
		const world = createBlankWorld(64);
		const { direction, cell } = placeAt(-20, 140);
		const field = new Float32Array(world.elevation.length).fill(99);
		field[cell] = -12.5;
		expect(
			readoutPartsAt(world, direction, shownOf(field, { current: false }))
				.value,
		).toEqual({
			layer: TEMPERATURE_LAYER,
			value: -12.5,
			source: 'simulated',
			current: false,
		});
		expect(
			readoutPartsAt(world, direction, shownOf(field, { source: 'observed' }))
				.value?.source,
		).toBe('observed');
	});

	it('takes the wind of that cell alone, uncapped, with what the winds are', () => {
		const world = createBlankWorld(64);
		const { direction, cell } = placeAt(-20, 140);
		const east = new Float32Array(world.elevation.length).fill(1);
		const north = new Float32Array(world.elevation.length).fill(1);
		east[cell] = 25;
		north[cell] = -3;
		const parts = readoutPartsAt(
			world,
			direction,
			null,
			windsOf({ east, north }, { current: false }),
		);
		expect(parts.value).toBeNull();
		expect(parts.wind).toEqual({
			east: 25,
			north: -3,
			current: false,
		});
	});

	it('says where the wind comes from, as the winds shown say', () => {
		const world = createBlankWorld(64);
		const { direction } = placeAt(-20, 140);
		const cells = world.elevation.length;
		const field = {
			east: new Float32Array(cells).fill(7),
			north: new Float32Array(cells),
		};
		const observed = readoutPartsAt(
			world,
			direction,
			null,
			windsOf(field, { source: 'observed' }),
		);
		expect(observed.wind?.source).toBe('observed');
		expect(describeReadout(observed).wind).toBe('7 m/s W observed');
		expect(
			readoutPartsAt(
				world,
				direction,
				null,
				windsOf(field, { source: 'simulated' }),
			).wind?.source,
		).toBe('simulated');
	});

	it('gives no wind with no winds shown, as with Winds off', () => {
		const world = createBlankWorld(64);
		const { direction } = placeAt(-20, 140);
		expect(readoutPartsAt(world, direction, null).wind).toBeNull();
		expect(readoutPartsAt(world, direction, null, null).wind).toBeNull();
	});

	it('gives no wind for winds of another grid, or no value', () => {
		const world = createBlankWorld(64);
		const { direction, cell } = placeAt(-20, 140);
		const cells = world.elevation.length;
		const full = () => new Float32Array(cells).fill(3);
		for (const field of [
			{ east: new Float32Array(12), north: full() },
			{ east: full(), north: new Float32Array(12) },
			{ east: new Float32Array(cells + 1), north: new Float32Array(cells + 1) },
		]) {
			expect(
				readoutPartsAt(world, direction, null, windsOf(field)).wind,
			).toBeNull();
		}
		for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
			const east = full();
			east[cell] = bad;
			expect(
				readoutPartsAt(world, direction, null, windsOf({ east, north: full() }))
					.wind,
			).toBeNull();
			const north = full();
			north[cell] = bad;
			expect(
				readoutPartsAt(world, direction, null, windsOf({ east: full(), north }))
					.wind,
			).toBeNull();
		}
	});

	it('gives no temperature for a field of another grid, or no value', () => {
		const world = createBlankWorld(64);
		const { direction, cell } = placeAt(-20, 140);
		expect(
			readoutPartsAt(world, direction, shownOf(new Float32Array(12))).value,
		).toBeNull();
		const field = new Float32Array(world.elevation.length);
		field[cell] = Number.NaN;
		expect(readoutPartsAt(world, direction, shownOf(field)).value).toBeNull();
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
	shownTemperature: ShownLayer | null;
	shownWinds: ShownWinds | null;
	windUnit: WindUnit;
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
		shownWinds: null,
		windUnit: 'm/s',
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
		shownLayer: () => page.shownTemperature,
		shownWinds: () => page.shownWinds,
		windUnit: () => page.windUnit,
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

describe('the readout of the pressure', () => {
	it('writes the pressure in whole hPa, with no month or summary named', () => {
		expect(formatLayerValue(PRESSURE_LAYER, 1018.4)).toBe('1,018 hPa');
		expect(formatLayerValue(PRESSURE_LAYER, 1012.6)).toBe('1,013 hPa');
		expect(formatLayerValue(PRESSURE_LAYER, 996.2)).toBe('996 hPa');
	});

	it('reads the pressure on screen at the place', () => {
		const world = createBlankWorld(64);
		const { direction, cell } = placeAt(40, -100);
		const field = new Float32Array(world.elevation.length).fill(1013);
		field[cell] = 1018.3;
		const parts = readoutPartsAt(world, direction, {
			layer: PRESSURE_LAYER,
			field,
			source: 'simulated',
			current: true,
		});
		expect(describeReadout(parts)).toMatchObject({
			value: '1,018 hPa',
			status: null,
		});
		const annual = readoutPartsAt(world, direction, {
			layer: PRESSURE_LAYER,
			field,
			source: 'simulated',
			current: true,
		});
		expect(describeReadout(annual).value).toBe('1,018 hPa');
	});
});

describe('the readout of another layer', () => {
	it('writes its value as the layer does, in its unit, with no view named', () => {
		expect(formatLayerValue(MADE_UP_LAYER, 1018.4)).toBe('1,018 hPa');
		expect(formatLayerValue(MADE_UP_LAYER, 3.2, 'difference')).toBe(
			'+3 hPa difference',
		);
	});

	it('reads the layer’s field at the place and writes it so, out of date as any other', () => {
		const world = createBlankWorld(64);
		const { direction, cell } = placeAt(-20, 140);
		const field = new Float32Array(world.elevation.length).fill(1000);
		field[cell] = 1021.2;
		const parts = readoutPartsAt(world, direction, {
			layer: MADE_UP_LAYER,
			field,
			source: 'simulated',
			current: false,
		});
		expect(parts.value?.layer).toBe(MADE_UP_LAYER);
		expect(describeReadout(parts)).toMatchObject({
			value: '1,021 hPa',
			status: READOUT_OUT_OF_DATE_TEXT,
		});
	});
});

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
				value: null,
				status: null,
				wind: null,
				windStatus: null,
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
			value: '−18 °C',
			status: null,
			wind: null,
			windStatus: null,
		});

		stage.shownTemperature = shownOf(field, { current: false });
		stage.readout.invalidate();
		frames.runFrame(16);
		expect(stage.last()).toMatchObject({
			value: '−18 °C',
			status: READOUT_OUT_OF_DATE_TEXT,
			wind: null,
			windStatus: null,
		});
	});

	/** Winds NE everywhere, at 5√2 m/s. */
	const northEasterlies = (stage: ReturnType<typeof createStage>) => {
		const cells = stage.world.elevation.length;
		return windsOf({
			east: new Float32Array(cells).fill(-5),
			north: new Float32Array(cells).fill(-5),
		});
	};

	it('adds the wind under the temperature while the globe shows winds, each with its own mark', () => {
		const { stage, cell } = overLand();
		const field = new Float32Array(stage.world.elevation.length);
		field[cell] = -18.4;
		stage.shownTemperature = shownOf(field);
		stage.shownWinds = northEasterlies(stage);
		stage.readout.invalidate();
		frames.runFrame(16);
		expect(stage.last()).toMatchObject({
			value: '−18 °C',
			status: null,
			wind: '7 m/s NE',
			windStatus: null,
		});

		stage.shownWinds = { ...northEasterlies(stage), current: false };
		stage.readout.invalidate();
		frames.runFrame(16);
		expect(stage.last()).toMatchObject({
			value: '−18 °C',
			status: null,
			wind: '7 m/s NE',
			windStatus: READOUT_OUT_OF_DATE_TEXT,
		});
	});

	it('shows the wind in Terrain view too, with no temperature', () => {
		const { stage } = overLand();
		stage.shownWinds = northEasterlies(stage);
		stage.readout.invalidate();
		frames.runFrame(16);
		expect(stage.last()).toMatchObject({
			elevation: '1,234 m',
			value: null,
			wind: '7 m/s NE',
		});
	});

	it('looks again after invalidate() when the unit changes, and writes the wind in it', () => {
		const { stage } = overLand();
		stage.shownWinds = northEasterlies(stage);
		stage.readout.invalidate();
		frames.runFrame(16);
		stage.windUnit = 'km/h';
		stage.readout.invalidate();
		frames.runFrame(16);
		expect(stage.last()?.wind).toBe('25 km/h NE');
		stage.windUnit = 'mph';
		stage.readout.invalidate();
		frames.runFrame(16);
		expect(stage.last()?.wind).toBe('16 mph NE');
	});

	it('looks again after invalidate() when the winds on screen go, as when Winds is turned off', () => {
		const { stage } = overLand();
		stage.shownWinds = northEasterlies(stage);
		stage.readout.invalidate();
		frames.runFrame(16);
		expect(stage.last()?.wind).not.toBeNull();
		stage.shownWinds = null;
		stage.readout.invalidate();
		frames.runFrame(16);
		expect(stage.last()).toMatchObject({ wind: null, windStatus: null });
	});

	it('looks again after invalidate() when other winds are on screen, of a new result or the year’s mean', () => {
		const { stage } = overLand();
		stage.shownWinds = northEasterlies(stage);
		stage.readout.invalidate();
		frames.runFrame(16);
		const cells = stage.world.elevation.length;
		stage.shownWinds = windsOf({
			east: new Float32Array(cells).fill(10),
			north: new Float32Array(cells),
		});
		stage.readout.invalidate();
		frames.runFrame(16);
		expect(stage.last()?.wind).toBe('10 m/s W');
	});

	it('has no temperature while the globe shows none, as before a result', () => {
		const { stage } = overLand();
		stage.shownTemperature = null;
		stage.readout.invalidate();
		frames.runFrame(16);
		// Nothing changed, so nothing more was shown.
		expect(stage.shows).toHaveLength(1);
		expect(stage.last()?.value).toBeNull();
	});

	it('looks again after invalidate() when the result on screen changes', () => {
		const { stage } = overLand();
		const length = stage.world.elevation.length;
		const first: ShownLayer = shownOf(new Float32Array(length).fill(1));
		stage.shownTemperature = first;
		stage.readout.invalidate();
		frames.runFrame(16);
		expect(stage.last()?.value).toBe('1 °C');

		const next: ShownLayer = {
			...first,
			field: new Float32Array(length).fill(5),
		};
		stage.shownTemperature = next;
		stage.readout.invalidate();
		frames.runFrame(16);
		expect(stage.last()?.value).toBe('5 °C');
	});

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
		expect(stage.last()?.value).toBeNull();
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

describe('createReadoutBlock', () => {
	beforeEach(() => {
		vi.stubGlobal('document', createFakeDocument().document);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const make = () => {
		const block = createReadoutBlock();
		const element = block.element as unknown as FakeElement;
		const part = (name: string) =>
			oneByClass(element, `cursor-readout__${name}`);
		/** A line as drawn: its parts shown, a value and its mark a space apart. */
		const lineOf = (line: FakeElement): string =>
			line.children
				.filter((piece) => !piece.hidden)
				.map((piece) =>
					piece.children.length === 0
						? piece.textContent
						: piece.children
								.filter((bit) => !bit.hidden)
								.map((bit) => bit.textContent)
								.join(' '),
				)
				.join('');
		/** The lines shown, as drawn. */
		const lines = (): string[] =>
			element.children
				.filter((line) => !line.hidden)
				.map((line) => lineOf(line));
		return { block, element, part, lines };
	};

	/** The text of a place on land, with nothing more to say. */
	const placeOnly: ReadoutText = {
		position: '1.7° N, 49.1° E',
		elevation: '4,628 m deep',
		value: null,
		status: null,
		wind: null,
		windStatus: null,
	};

	it('makes a block of two lines, hidden, and hidden from assistive technology', () => {
		const { element, part } = make();
		expect(element.hidden).toBe(true);
		expect(element.getAttribute('aria-hidden')).toBe('true');
		expect(element.getAttribute('aria-live')).toBeNull();
		expect(element.children.map((child) => child.className)).toEqual([
			'cursor-readout__place',
			'cursor-readout__values',
		]);
		expect(part('place').children.map((child) => child.className)).toEqual([
			'cursor-readout__position',
			'cursor-readout__separator',
			'cursor-readout__elevation',
		]);
		expect(part('values').children.map((child) => child.className)).toEqual([
			'cursor-readout__layer-value',
			'cursor-readout__separator',
			'cursor-readout__wind',
		]);
		expect(
			part('layer-value').children.map((child) => child.className),
		).toEqual(['cursor-readout__value', 'cursor-readout__status']);
		expect(part('wind').children.map((child) => child.className)).toEqual([
			'cursor-readout__wind-value',
			'cursor-readout__wind-status',
		]);
		expect(READOUT_SEPARATOR).toBe(' · ');
	});

	it('writes the place on one line and the layer’s value and the wind on another, each joined by a middle dot', () => {
		const { block, element, lines } = make();
		block.show({ ...placeOnly, value: '28 °C', wind: '15 mph S' });
		expect(element.hidden).toBe(false);
		expect(lines()).toEqual([
			'1.7° N, 49.1° E · 4,628 m deep',
			'28 °C · 15 mph S',
		]);
	});

	it('holds the place alone, with no second line, when there is neither value nor wind', () => {
		const { block, part, lines } = make();
		block.show({ ...placeOnly, elevation: '8,123 m' });
		expect(lines()).toEqual(['1.7° N, 49.1° E · 8,123 m']);
		expect(part('values').hidden).toBe(true);
	});

	it('holds the wind alone on the second line on Terrain with Winds on, and the value alone with Winds off', () => {
		const { block, part, lines } = make();
		block.show({ ...placeOnly, wind: '7 m/s NE' });
		expect(lines()).toEqual(['1.7° N, 49.1° E · 4,628 m deep', '7 m/s NE']);
		expect(part('layer-value').hidden).toBe(true);
		block.show({ ...placeOnly, value: '1,018 hPa' });
		expect(lines()).toEqual(['1.7° N, 49.1° E · 4,628 m deep', '1,018 hPa']);
		expect(part('wind').hidden).toBe(true);
	});

	it('puts each mark after its own value: out of date after either, observed after the wind', () => {
		const { block, part, lines } = make();
		block.show({
			...placeOnly,
			value: '28 °C',
			status: READOUT_OUT_OF_DATE_TEXT,
			wind: '15 mph S observed',
		});
		expect(lines()[1]).toBe('28 °C out of date · 15 mph S observed');
		block.show({
			...placeOnly,
			value: '+2 °C difference',
			wind: 'calm',
			windStatus: READOUT_OUT_OF_DATE_TEXT,
		});
		expect(lines()[1]).toBe('+2 °C difference · calm out of date');
		expect(part('status').hidden).toBe(true);
		expect(part('status').textContent).toBe('');
		expect(part('wind-status').textContent).toBe('out of date');
	});

	it('hides for nothing to show', () => {
		const { block, element } = make();
		block.show({ ...placeOnly, value: '28 °C' });
		block.show(null);
		expect(element.hidden).toBe(true);
	});
});
