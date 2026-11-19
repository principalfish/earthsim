/**
 * Upwelling: where the winds' Ekman transport draws water up from below, on
 * synthetic coasts and an ocean planet, and the cooling it gives the sea's
 * temperature solve, with the heat it takes.
 */

import { describe, expect, it } from 'vitest';
import { directionToLatLon, getGrid, NEIGHBOUR_COUNT } from '../grid/grid';
import { toEastNorth } from '../grid/vector';
import { MONTHS_PER_YEAR } from '../planet/insolation';
import { rotationRate } from '../planet/planet';
import {
	SEA_WATER_HEAT_CAPACITY_J_M3_K,
	seaStep,
	solveTemperature,
	TEMPERATURE_MODEL,
	type TemperatureUpwelling,
} from '../temperature/temperature';
import { createBlankWorld, PLANET_RADIUS_KM, type World } from '../world/world';
import { DEFAULT_GYRE_SETTINGS, ekmanTransport, solveGyres } from './gyres';
import { MIXED_LAYER_DEPTH_M, upwelling, upwellingContrast } from './upwelling';

/** Allows for coverage instrumentation, which makes the solves slower. */
const SOLVE_TIMEOUT_MS = 120_000;

const N = 64;
const grid = getGrid(N);
const { cellCount, centres, neighbours } = grid;
const RADIUS_M = PLANET_RADIUS_KM * 1000;

const places = Array.from({ length: cellCount }, (_, cell) =>
	directionToLatLon([
		centres[3 * cell] as number,
		centres[3 * cell + 1] as number,
		centres[3 * cell + 2] as number,
	]),
);
const latitudes = Float64Array.from(places, (place) => place.latitudeDeg);
const longitudes = Float64Array.from(places, (place) => place.longitudeDeg);

/** A planet all sea, with its axis upright: no seasons, and no coast. */
const OCEAN: World = (() => {
	const world = createBlankWorld(N);
	return { ...world, planet: { ...world.planet, axialTiltDeg: 0 } };
})();

/**
 * A blank planet with one continent from 60°S to 60°N between 20°W and
 * 20°E: the sea west of it lies along an ocean's eastern coast, the sea east
 * of it along an ocean's western coast.
 */
const CONTINENT: World = (() => {
	const world = createBlankWorld(N);
	for (let cell = 0; cell < cellCount; cell++) {
		if (
			Math.abs(latitudes[cell] as number) < 60 &&
			Math.abs(longitudes[cell] as number) < 20
		) {
			world.elevation[cell] = 500;
		}
	}
	return world;
})();

const isLand = (world: World, cell: number): boolean =>
	(world.elevation[cell] as number) > world.seaLevel;

/** The sea cells beside the continent, with land on the side given. */
const coastCells = (side: 'east' | 'west'): number[] => {
	const cells: number[] = [];
	for (let cell = 0; cell < cellCount; cell++) {
		const latitude = Math.abs(latitudes[cell] as number);
		if (isLand(CONTINENT, cell) || latitude < 15 || latitude > 45) {
			continue;
		}
		const longitude = longitudes[cell] as number;
		const touches = Array.from({ length: NEIGHBOUR_COUNT }, (_, k) =>
			isLand(CONTINENT, neighbours[NEIGHBOUR_COUNT * cell + k] as number),
		).some(Boolean);
		if (touches && (side === 'east' ? longitude < 0 : longitude > 0)) {
			cells.push(cell);
		}
	}
	return cells;
};
/** The sea with land to its east: an ocean's eastern coast. */
const EASTERN_COAST = coastCells('east');
/** The sea with land to its west: an ocean's western coast. */
const WESTERN_COAST = coastCells('west');

/** Twelve months of the same wind, from a rule of each cell's latitude. */
const windsOf = (
	east: (latitude: number) => number,
	north: (latitude: number) => number,
) => {
	const eastward = Float32Array.from(latitudes, east);
	const northward = Float32Array.from(latitudes, north);
	return {
		east: Array.from({ length: MONTHS_PER_YEAR }, () => eastward),
		north: Array.from({ length: MONTHS_PER_YEAR }, () => northward),
	};
};

/** A wind of 7 m/s toward the equator, north and south. */
const EQUATORWARD = windsOf(
	() => 0,
	(latitude) => -7 * Math.sign(latitude),
);
/** The same wind reversed, toward the poles. */
const POLEWARD = windsOf(
	() => 0,
	(latitude) => 7 * Math.sign(latitude),
);
/** Trade winds: 7 m/s westward everywhere. */
const EASTERLIES = windsOf(
	() => -7,
	() => 0,
);

const largest = (months: readonly Float32Array[], cells: number[]): number =>
	Math.max(
		...months.flatMap((month) => cells.map((cell) => month[cell] as number)),
	);

describe('upwelling on a coast', () => {
	const equatorward = upwelling(CONTINENT, EQUATORWARD);

	it('wells up along an eastern coast under an equatorward wind, the water carried offshore', () => {
		expect(EASTERN_COAST.length).toBeGreaterThan(20);
		for (const month of equatorward.velocity) {
			for (const cell of EASTERN_COAST) {
				expect(month[cell]).toBeGreaterThan(0);
			}
		}
		// About the offshore transport over a cell's width: τ / (ρ f) at the
		// coast's latitudes, over about 156 km.
		const ekman = ekmanTransport(CONTINENT, EQUATORWARD);
		for (const cell of EASTERN_COAST) {
			const offshore = Math.abs(ekman.east[0]?.[cell] as number);
			const w = equatorward.velocity[0]?.[cell] as number;
			expect(w).toBeGreaterThan((0.5 * offshore) / 156e3);
			expect(w).toBeLessThan((2 * offshore) / 156e3);
		}
	});

	it('does not well up along a western coast under the same wind, the water carried onshore', () => {
		expect(WESTERN_COAST.length).toBeGreaterThan(20);
		expect(largest(equatorward.velocity, WESTERN_COAST)).toBe(0);
		expect(largest(equatorward.rates, WESTERN_COAST)).toBe(0);
	});

	it('stops welling up along the eastern coast when the wind is reversed, and wells up along the western', () => {
		const poleward = upwelling(CONTINENT, POLEWARD);
		expect(largest(poleward.velocity, EASTERN_COAST)).toBe(0);
		expect(
			WESTERN_COAST.every(
				(cell) => (poleward.velocity[0]?.[cell] as number) > 0,
			),
		).toBe(true);
	});

	it('wells up nowhere away from the coasts by default, and never over land', () => {
		expect(DEFAULT_GYRE_SETTINGS.upwellingEquatorDeg).toBe(0);
		for (const month of equatorward.velocity) {
			for (let cell = 0; cell < cellCount; cell++) {
				if (isLand(CONTINENT, cell)) {
					expect(month[cell]).toBe(0);
					continue;
				}
				const coast = Array.from({ length: NEIGHBOUR_COUNT }, (_, k) =>
					isLand(CONTINENT, neighbours[NEIGHBOUR_COUNT * cell + k] as number),
				).some(Boolean);
				if (!coast) {
					expect(month[cell]).toBe(0);
				}
			}
		}
	});

	it('cools at ρc w (1 − r), with r the thermocline’s share at the source depth', () => {
		const contrast =
			1 -
			Math.exp(
				-(DEFAULT_GYRE_SETTINGS.upwellingSourceDepthM - MIXED_LAYER_DEPTH_M) /
					DEFAULT_GYRE_SETTINGS.thermoclineScaleM,
			);
		expect(MIXED_LAYER_DEPTH_M).toBeCloseTo(
			TEMPERATURE_MODEL.oceanHeatCapacity / SEA_WATER_HEAT_CAPACITY_J_M3_K,
			12,
		);
		expect(equatorward.contrast).toBeCloseTo(contrast, 12);
		expect(equatorward.contrast).toBeCloseTo(0.26, 2);
		expect(equatorward.deepC).toBe(DEFAULT_GYRE_SETTINGS.deepSeaC);
		for (const cell of EASTERN_COAST) {
			expect(equatorward.rates[3]?.[cell]).toBeCloseTo(
				SEA_WATER_HEAT_CAPACITY_J_M3_K *
					contrast *
					(equatorward.velocity[3]?.[cell] as number),
				4,
			);
		}
	});
});

describe('upwelling on the cube’s seams', () => {
	/** The face of the cube a cell lies on. */
	const faceOf = (cell: number): number => Math.floor(cell / (N * N));

	it('wells up along an eastern coast that runs along a seam of the cube, as along one within a face', () => {
		// A continent from 45°E to 85°E: the sea west of it lies on one face
		// and its coast across the seam at 45°E on the next.
		const world = createBlankWorld(N);
		for (let cell = 0; cell < cellCount; cell++) {
			const longitude = longitudes[cell] as number;
			if (
				Math.abs(latitudes[cell] as number) < 60 &&
				longitude >= 45 &&
				longitude < 85
			) {
				world.elevation[cell] = 500;
			}
		}
		const seamCoast: number[] = [];
		for (let cell = 0; cell < cellCount; cell++) {
			const latitude = Math.abs(latitudes[cell] as number);
			if (isLand(world, cell) || latitude < 15 || latitude > 45) {
				continue;
			}
			for (let k = 0; k < NEIGHBOUR_COUNT; k++) {
				const other = neighbours[NEIGHBOUR_COUNT * cell + k] as number;
				if (
					isLand(world, other) &&
					faceOf(other) !== faceOf(cell) &&
					(longitudes[cell] as number) < 45
				) {
					seamCoast.push(cell);
					break;
				}
			}
		}
		expect(seamCoast.length).toBeGreaterThan(20);
		const upwelled = upwelling(world, EQUATORWARD);
		const ekman = ekmanTransport(world, EQUATORWARD);
		for (const cell of seamCoast) {
			const offshore = Math.abs(ekman.east[0]?.[cell] as number);
			const w = upwelled.velocity[0]?.[cell] as number;
			expect(w).toBeGreaterThan((0.5 * offshore) / 156e3);
			expect(w).toBeLessThan((2 * offshore) / 156e3);
		}
	});

	it('wells up nowhere, the seams included, under an Ekman transport that spreads out of no cell, with every sea cell open', () => {
		// The winds whose Ekman transport, τ × ẑ / (ρ f) with f floored as
		// the gyres floor it, is a solid body's turning, 1 m²/s at most,
		// about each of three axes.
		const twiceOmega = 2 * rotationRate(OCEAN.planet);
		const floor =
			twiceOmega *
			Math.sin((DEFAULT_GYRE_SETTINGS.equatorFloorDeg * Math.PI) / 180);
		const drag = 1.2 * DEFAULT_GYRE_SETTINGS.dragCoefficient;
		const open = {
			settings: { ...DEFAULT_GYRE_SETTINGS, upwellingEquatorDeg: 90 },
		};
		// What a coast's transport of 1 m²/s gives over a cell's width.
		const coastal = 1 / (RADIUS_M * grid.cellWidth);
		for (const axis of [
			[0, 0, 1],
			[1, 0, 0],
			[0.6, 0.3, 0.74],
		]) {
			const [a, b, c] = axis.map((value) => value / Math.hypot(...axis)) as [
				number,
				number,
				number,
			];
			const turning = {
				x: new Float64Array(cellCount),
				y: new Float64Array(cellCount),
				z: new Float64Array(cellCount),
			};
			for (let cell = 0; cell < cellCount; cell++) {
				const x = centres[3 * cell] as number;
				const y = centres[3 * cell + 1] as number;
				const z = centres[3 * cell + 2] as number;
				turning.x[cell] = b * z - c * y;
				turning.y[cell] = c * x - a * z;
				turning.z[cell] = a * y - b * x;
			}
			const transport = toEastNorth(grid, turning);
			const east = new Float32Array(cellCount);
			const north = new Float32Array(cellCount);
			for (let cell = 0; cell < cellCount; cell++) {
				const f = twiceOmega * (centres[3 * cell + 2] as number);
				const floored = f > 0 ? Math.max(f, floor) : Math.min(f, -floor);
				const stressEast = -1025 * floored * (transport.north[cell] as number);
				const stressNorth = 1025 * floored * (transport.east[cell] as number);
				const stress = Math.hypot(stressEast, stressNorth);
				if (stress > 0) {
					const speed = Math.sqrt(stress / drag);
					east[cell] = stressEast / (drag * speed);
					north[cell] = stressNorth / (drag * speed);
				}
			}
			const winds = {
				east: Array.from({ length: MONTHS_PER_YEAR }, () => east),
				north: Array.from({ length: MONTHS_PER_YEAR }, () => north),
			};
			const ekman = ekmanTransport(OCEAN, winds);
			expect(
				Math.max(...(ekman.east[0] as Float32Array).map(Math.abs)),
			).toBeGreaterThan(0.5);
			const upwelled = upwelling(OCEAN, winds, open);
			for (let cell = 0; cell < cellCount; cell++) {
				expect(upwelled.velocity[0]?.[cell] as number).toBeLessThan(
					1e-4 * coastal,
				);
			}
		}
	});
});

describe('upwelling at the equator, with a band of 5°', () => {
	/** The settings with the equator's band at the floor's width, 5°. */
	const BAND = {
		settings: { ...DEFAULT_GYRE_SETTINGS, upwellingEquatorDeg: 5 },
	};

	it('wells up within the band of the equator under the trades, and not beyond it', () => {
		const trades = upwelling(OCEAN, EASTERLIES, BAND);
		const near: number[] = [];
		for (let cell = 0; cell < cellCount; cell++) {
			const latitude = Math.abs(latitudes[cell] as number);
			const w = trades.velocity[0]?.[cell] as number;
			if (latitude >= 5) {
				expect(w).toBe(0);
			} else if (latitude < 1) {
				near.push(w);
			}
		}
		// Beside the equator the transport, τ / (ρ f) at the floor of 5°, turns
		// poleward on both sides and leaves over about a cell's width, less
		// near the cube's edges, where the cells are smaller.
		const push = 1.2 * DEFAULT_GYRE_SETTINGS.dragCoefficient * 49;
		const floorF = 2 * 7.2921e-5 * Math.sin((5 * Math.PI) / 180);
		const leaving = push / (1025 * floorF) / 156e3;
		expect(near.length).toBeGreaterThan(100);
		for (const w of near) {
			expect(w).toBeGreaterThan(0.7 * leaving);
			expect(w).toBeLessThan(1.6 * leaving);
		}
	});

	it('does not well up beside the equator under westerlies, which draw the water together there, nor anywhere with no band, the default', () => {
		const westerlies = upwelling(
			OCEAN,
			windsOf(
				() => 7,
				() => 0,
			),
			BAND,
		);
		const trades = upwelling(OCEAN, EASTERLIES, BAND);
		const total = (months: readonly Float32Array[]): number =>
			months[0]?.reduce(
				(sum, w, cell) => sum + w * (grid.areas[cell] as number),
				0,
			) ?? 0;
		for (let cell = 0; cell < cellCount; cell++) {
			if (Math.abs(latitudes[cell] as number) < 1) {
				expect(westerlies.velocity[0]?.[cell]).toBe(0);
			}
		}
		// What wells up is almost all at the band's edge, where the
		// transport, held within the band, falls as 1 / f beyond it: about a
		// fifth of what the trades draw apart, spread over the cells either
		// side of the kink by the edges' four-cell values.
		expect(total(westerlies.velocity)).toBeLessThan(
			0.25 * total(trades.velocity),
		);
		const noBand = upwelling(OCEAN, EASTERLIES);
		expect(noBand.velocity.every((month) => month.every((w) => w === 0))).toBe(
			true,
		);
	});
});

describe('upwellingContrast and the settings', () => {
	it('is 0 for water from within the mixed layer, and nearer 1 the deeper it comes from', () => {
		const settings = DEFAULT_GYRE_SETTINGS;
		expect(upwellingContrast(settings, 150)).toBe(0);
		expect(upwellingContrast(settings, 200)).toBe(0);
		expect(
			upwellingContrast({ ...settings, upwellingSourceDepthM: 1e4 }),
		).toBeCloseTo(1, 10);
		expect(upwellingContrast(settings, 60)).toBeCloseTo(1 - Math.exp(-0.3), 12);
	});

	it('refuses settings out of range', () => {
		const settings = DEFAULT_GYRE_SETTINGS;
		for (const bad of [
			{ upwellingEquatorDeg: -1 },
			{ upwellingEquatorDeg: 91 },
			{ deepSeaC: Number.NaN },
			{ upwellingSourceDepthM: 0 },
			{ thermoclineScaleM: -300 },
			{ thermoclineScaleM: Number.POSITIVE_INFINITY },
		]) {
			expect(() => upwellingContrast({ ...settings, ...bad })).toThrow(
				RangeError,
			);
		}
		expect(() => upwellingContrast(settings, 0)).toThrow(/mixedLayerDepthM/);
		expect(() => upwelling(OCEAN, { east: [], north: [] })).toThrow(RangeError);
	});
});

describe('ekmanTransport', () => {
	it('is the Ekman transport the gyres return beside them', () => {
		const gyres = solveGyres(CONTINENT, EQUATORWARD);
		const ekman = ekmanTransport(CONTINENT, EQUATORWARD);
		expect(ekman.east).toEqual(gyres.ekmanEast);
		expect(ekman.north).toEqual(gyres.ekmanNorth);
		expect(Array.from(ekman.driven)).toEqual(
			Array.from({ length: cellCount }, (_, cell) =>
				isLand(CONTINENT, cell) ? 0 : 1,
			),
		);
	});
});

describe('seaStep with upwelling', () => {
	const step = {
		sea: 295,
		earlier: 295.2,
		sunlight: 40,
		exchange: 20,
		opening: 0,
		brightening: 0,
		storage: 2.5e8 / 86400,
	};

	it('closes the sea’s balance with the heat the water welling up takes', () => {
		const deepK = 277.15;
		const upwelled = 8;
		const air = 293;
		const { base, gain } = seaStep({ ...step, upwelling: upwelled, deepK });
		const next = base + gain * air;
		const stored =
			(step.storage * (3 * next - 4 * step.sea + step.earlier)) / 2;
		expect(stored).toBeCloseTo(
			step.sunlight - step.exchange * (next - air) - upwelled * (next - deepK),
			9,
		);
		const without = seaStep(step);
		expect(base + gain * air).toBeLessThan(without.base + without.gain * air);
	});

	it('takes the deep sea’s temperature whenever it is given a rate', () => {
		// @ts-expect-error: a rate with no deep temperature to cool toward.
		seaStep({ ...step, upwelling: 8 });
		// @ts-expect-error: a deep temperature with no rate.
		seaStep({ ...step, deepK: 277.15 });
		expect(seaStep({ ...step, upwelling: 8, deepK: 277.15 }).base).toBeLessThan(
			seaStep(step).base,
		);
	});

	it('is the step without upwelling, bit for bit, at a rate of 0', () => {
		expect(seaStep({ ...step, upwelling: 0, deepK: 277.15 })).toEqual(
			seaStep(step),
		);
	});
});

describe('solveTemperature with upwelling', {
	timeout: SOLVE_TIMEOUT_MS,
}, () => {
	/** The default model solved to 0.05 K: quicker than the default. */
	const COARSE = { ...TEMPERATURE_MODEL, solverToleranceK: 0.05 };
	const YEARS = { model: COARSE, maxYears: 2 };
	/** A rate of 10 W/m²/K between 10°S and 10°N, and none beyond. */
	const BAND = Float32Array.from(latitudes, (latitude) =>
		Math.abs(latitude) < 10 ? 10 : 0,
	);
	const banded = (deepC: number): TemperatureUpwelling => ({
		rates: Array.from({ length: MONTHS_PER_YEAR }, () => BAND),
		deepC,
	});
	let plainResult: ReturnType<typeof solveTemperature> | undefined;
	const plain = () => {
		plainResult ??= solveTemperature(OCEAN, YEARS);
		return plainResult;
	};

	it('takes the heat it reports: the rate times the sea’s excess over the deep sea, over the year and the planet', () => {
		const cooled = solveTemperature(OCEAN, {
			...YEARS,
			upwelling: banded(4),
		});
		let integral = 0;
		for (let month = 0; month < MONTHS_PER_YEAR; month++) {
			const sea = cooled.seaMonths[month] as Float32Array;
			for (let cell = 0; cell < cellCount; cell++) {
				integral +=
					((grid.areas[cell] as number) *
						RADIUS_M ** 2 *
						(BAND[cell] as number) *
						Math.max(0, (sea[cell] as number) - 4)) /
					MONTHS_PER_YEAR;
			}
		}
		expect(cooled.upwellingW).toBeGreaterThan(1e14);
		expect(Math.abs(cooled.upwellingW - integral) / integral).toBeLessThan(
			0.01,
		);
		expect(plain().upwellingW).toBe(0);
		// The band's sea is cooled, by more than the sea beyond it.
		const change = (cell: number): number =>
			(cooled.seaMonths[0]?.[cell] as number) -
			(plain().seaMonths[0]?.[cell] as number);
		const equator = latitudes.findIndex((latitude) => Math.abs(latitude) < 1);
		const beyond = latitudes.findIndex(
			(latitude) => Math.abs(latitude - 45) < 1,
		);
		expect(change(equator)).toBeLessThan(-2);
		expect(change(equator)).toBeLessThan(change(beyond) - 1);
	});

	it('cools a sea no warmer than the water below not at all, the solve then the one without upwelling, bit for bit', () => {
		const warmBelow = solveTemperature(OCEAN, {
			...YEARS,
			upwelling: banded(60),
		});
		expect(warmBelow.months).toEqual(plain().months);
		expect(warmBelow.seaMonths).toEqual(plain().seaMonths);
		expect(warmBelow.state).toEqual(plain().state);
		expect(warmBelow.upwellingW).toBe(0);
		const none = solveTemperature(OCEAN, {
			...YEARS,
			upwelling: {
				rates: Array.from(
					{ length: MONTHS_PER_YEAR },
					() => new Float32Array(cellCount),
				),
				deepC: 4,
			},
		});
		expect(none.seaMonths).toEqual(plain().seaMonths);
		expect(none.state).toEqual(plain().state);
	});

	it('refuses upwelling that is not twelve months of finite rates, none negative, one a cell', () => {
		const good = banded(4);
		const bad: TemperatureUpwelling[] = [
			{ ...good, deepC: Number.NaN },
			{ ...good, rates: undefined as never },
			{ ...good, rates: good.rates.slice(1) },
			{ ...good, rates: [...good.rates.slice(1), new Float32Array(3)] },
			{
				...good,
				rates: [...good.rates.slice(1), new Float32Array(cellCount).fill(-1)],
			},
			{
				...good,
				rates: [
					...good.rates.slice(1),
					new Float32Array(cellCount).fill(Number.NaN),
				],
			},
		];
		for (const upwelled of bad) {
			expect(() =>
				solveTemperature(OCEAN, { ...YEARS, upwelling: upwelled }),
			).toThrow(RangeError);
		}
	});
});
