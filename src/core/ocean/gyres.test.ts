import { describe, expect, it } from 'vitest';
import { cornerAreas, cornerIndex } from '../grid/corners';
import {
	cellAt,
	directionToLatLon,
	getGrid,
	latLonToDirection,
} from '../grid/grid';
import { rotationRate } from '../planet/planet';
import type { MonthlyWind } from '../wind/observedWind';
import { AIR_DENSITY_KG_M3 } from '../wind/rules';
import { createBlankWorld, PLANET_RADIUS_KM, type World } from '../world/world';
import {
	createGyreSolver,
	DEFAULT_GYRE_SETTINGS,
	type GyreResult,
	type GyreSolver,
	gyreForcing,
	SEA_WATER_DENSITY_KG_M3,
	solveGyres,
} from './gyres';

const RADIUS_M = PLANET_RADIUS_KM * 1000;
const grid = getGrid(64);
const index = cornerIndex(grid);

const latLonOf = (cell: number) =>
	directionToLatLon([
		grid.centres[3 * cell] as number,
		grid.centres[3 * cell + 1] as number,
		grid.centres[3 * cell + 2] as number,
	]);

/** A world of 64 with land where the predicate holds at a cell's centre. */
const worldOf = (
	isLand: (latitude: number, longitude: number) => boolean,
): World => {
	const world = createBlankWorld(64);
	for (let c = 0; c < grid.cellCount; c++) {
		const { latitudeDeg, longitudeDeg } = latLonOf(c);
		if (isLand(latitudeDeg, longitudeDeg)) {
			world.elevation[c] = 500;
		}
	}
	return world;
};

/** The same wind in every month, from its eastward and northward parts. */
const windsOf = (
	east: (latitude: number, longitude: number) => number,
	north: (latitude: number, longitude: number) => number = () => 0,
): MonthlyWind => {
	const e = new Float32Array(grid.cellCount);
	const n = new Float32Array(grid.cellCount);
	for (let c = 0; c < grid.cellCount; c++) {
		const { latitudeDeg, longitudeDeg } = latLonOf(c);
		e[c] = east(latitudeDeg, longitudeDeg);
		n[c] = north(latitudeDeg, longitudeDeg);
	}
	return {
		east: Array.from({ length: 12 }, () => e),
		north: Array.from({ length: 12 }, () => n),
	};
};

const near = (
	latitude: number,
	longitude: number,
	centreLatitude: number,
	centreLongitude: number,
	radius: number,
): boolean =>
	Math.hypot(
		latitude - centreLatitude,
		(longitude - centreLongitude) * Math.cos((centreLatitude * Math.PI) / 180),
	) < radius;

/** A basin from 10°N to 50°N and 60°W to 0°, with an island if asked. */
const inBasin = (latitude: number, longitude: number): boolean =>
	latitude > 10 && latitude < 50 && longitude > -60 && longitude < 0;

/** Trades in the south of the basin and westerlies in the north. */
const tradesAndWesterlies = (latitude: number): number =>
	-6 * Math.cos((Math.PI * (latitude - 10)) / 40);

type Case = {
	readonly world: World;
	readonly solver: GyreSolver;
	readonly result: GyreResult;
};

const CASES = new Map<string, Case>();

/** A world, its solver and its gyres, built once for the tests that share them. */
const solved = (
	name: string,
	isLand: (latitude: number, longitude: number) => boolean,
	winds: MonthlyWind,
	settings = DEFAULT_GYRE_SETTINGS,
): Case => {
	const held = CASES.get(name);
	if (held !== undefined) {
		return held;
	}
	const world = worldOf(isLand);
	const solver = createGyreSolver(world, settings);
	const made = { world, solver, result: solveGyres(world, winds, { solver }) };
	CASES.set(name, made);
	return made;
};

const BASIN_WINDS = windsOf(tradesAndWesterlies);

const basin = (): Case =>
	solved('basin', (lat, lon) => !inBasin(lat, lon), BASIN_WINDS);

const withIsland = (): Case =>
	solved(
		'island',
		(lat, lon) => !inBasin(lat, lon) || near(lat, lon, 30, -30, 5),
		BASIN_WINDS,
	);

const RING_WINDS = windsOf(() => 8);

const inRing = (latitude: number): boolean => latitude > -70 && latitude < -40;

/** The transport between the polar land and the land to the north, in Sv. */
const ringTransport = ({ solver, result }: Case): number => {
	const { labels } = solver.basins;
	const coastAt = (latitude: number): number =>
		labels[
			index.cellCorners[
				4 * cellAt(grid, latLonToDirection(latitude, 0))
			] as number
		] as number;
	const psi = result.streamfunction[0] as Float64Array;
	return (
		((psi[labels.indexOf(coastAt(-85))] as number) -
			(psi[labels.indexOf(coastAt(0))] as number)) /
		1e6
	);
};

/** The cells along a circle of latitude, west to east, each once. */
const cellsAlong = (latitude: number, from: number, to: number): number[] => {
	const cells: number[] = [];
	for (let longitude = from; longitude < to; longitude += 0.1) {
		const cell = cellAt(grid, latLonToDirection(latitude, longitude));
		if (cells[cells.length - 1] !== cell && !cells.includes(cell)) {
			cells.push(cell);
		}
	}
	return cells;
};

describe('solveGyres', () => {
	it('carries nothing net out of any cell and nothing across a coast', () => {
		const { world, result } = withIsland();
		const land = (c: number): boolean =>
			(world.elevation[c] as number) > world.seaLevel;
		for (const flows of [result.flows[0], result.flows[11]] as Float64Array[]) {
			let largest = 0;
			for (const flow of flows) {
				largest = Math.max(largest, Math.abs(flow));
			}
			expect(largest).toBeGreaterThan(0);
			let worstNet = 0;
			let acrossCoast = 0;
			for (let c = 0; c < grid.cellCount; c++) {
				let net = 0;
				for (let k = 0; k < 4; k++) {
					const flow = flows[4 * c + k] as number;
					net += flow;
					if (
						(land(c) || land(grid.neighbours[4 * c + k] as number)) &&
						flow !== 0
					) {
						acrossCoast++;
					}
				}
				worstNet = Math.max(worstNet, Math.abs(net));
			}
			expect(acrossCoast).toBe(0);
			expect(worstNet).toBeLessThanOrEqual(1e-12 * largest);
		}
		let landCurrents = 0;
		for (let c = 0; c < grid.cellCount; c++) {
			if (
				land(c) &&
				(result.east[0]?.[c] !== 0 || result.north[0]?.[c] !== 0)
			) {
				landCurrents++;
			}
		}
		expect(landCurrents).toBe(0);
	});

	it('drives one clockwise gyre under trades and westerlies, its strong current on the western side', () => {
		const { solver, result } = basin();
		const psi = result.streamfunction[0] as Float64Array;
		let highest = 0;
		let lowest = 0;
		for (let p = 0; p < psi.length; p++) {
			if (solver.basins.labels[p] === 0) {
				highest = Math.max(highest, psi[p] as number);
				lowest = Math.min(lowest, psi[p] as number);
			}
		}
		// Clockwise: ψ is highest in the middle, a few sverdrups.
		expect(highest).toBeGreaterThan(2e6);
		expect(lowest).toBeGreaterThan(-0.01 * highest);
		const along = cellsAlong(30, -60, 0).filter(
			(c) => solver.basins.land[c] === 0,
		);
		const north = along.map((c) => result.north[0]?.[c] as number);
		const peak = north.indexOf(Math.max(...north));
		expect(peak).toBeLessThan(3);
		const eastern = north.slice(Math.floor(north.length / 2));
		const easternMean =
			eastern.reduce((sum, value) => sum + value, 0) / eastern.length;
		expect(easternMean).toBeLessThan(0);
		expect(north[peak]).toBeGreaterThan(10 * Math.abs(easternMean));
		expect(Math.max(...eastern)).toBeLessThan(0.1 * (north[peak] as number));
	});

	it('reverses the gyre when the wind reverses', () => {
		const { world, solver, result } = basin();
		const reversed = solveGyres(
			world,
			windsOf((lat) => -tradesAndWesterlies(lat)),
			{ solver },
		);
		const flows = result.flows[0] as Float64Array;
		const back = reversed.flows[0] as Float64Array;
		let largest = 0;
		let worst = 0;
		for (let entry = 0; entry < flows.length; entry++) {
			largest = Math.max(largest, Math.abs(flows[entry] as number));
			worst = Math.max(
				worst,
				Math.abs((flows[entry] as number) + (back[entry] as number)),
			);
		}
		expect(largest).toBeGreaterThan(0);
		expect(worst).toBeLessThan(1e-3 * largest);
	});

	it("finds an island's value from the wind's circulation round it", () => {
		const { solver, result } = withIsland();
		const { labels, coasts } = solver.basins;
		const island = coasts.indexOf('net') + 1;
		expect(island).toBeGreaterThan(0);
		const psi = result.streamfunction[0] as Float64Array;
		const value = psi[labels.indexOf(island)] as number;
		let highest = Number.NEGATIVE_INFINITY;
		let lowest = Number.POSITIVE_INFINITY;
		for (let p = 0; p < psi.length; p++) {
			if (labels[p] === 0) {
				highest = Math.max(highest, psi[p] as number);
				lowest = Math.min(lowest, psi[p] as number);
			}
		}
		expect(value).toBeGreaterThan(lowest + 0.05 * (highest - lowest));
		expect(value).toBeLessThan(highest - 0.05 * (highest - lowest));
		// The equation summed over the island's corners meets the wind's
		// circulation round it.
		const forcing = gyreForcing(
			grid,
			BASIN_WINDS.east[0] as Float32Array,
			BASIN_WINDS.north[0] as Float32Array,
		);
		const applied = solver.corners.apply(psi);
		const areas = cornerAreas(grid);
		let net = 0;
		let wind = 0;
		let scale = 0;
		for (let p = 0; p < psi.length; p++) {
			if (labels[p] === island) {
				net += (areas[p] as number) * (applied[p] as number);
				wind += (areas[p] as number) * (forcing[p] as number);
				scale += Math.abs((areas[p] as number) * (applied[p] as number));
			}
		}
		expect(Math.abs(net - wind)).toBeLessThan(1e-3 * scale);
	});

	it("carries the circumpolar current round a channel, held back by the channel's friction", () => {
		const ring = (lat: number, _lon: number) => !inRing(lat);
		const plain = solved('ring', ring, RING_WINDS);
		const transport = ringTransport(plain);
		// Friction balances the wind's push at every latitude of the channel:
		// the transport is τ / (ρ r) across the channel's 30°.
		const stress =
			AIR_DENSITY_KG_M3 * DEFAULT_GYRE_SETTINGS.dragCoefficient * 64;
		const expected =
			((stress /
				(SEA_WATER_DENSITY_KG_M3 * DEFAULT_GYRE_SETTINGS.channelFrictionPerS)) *
				((30 * Math.PI) / 180) *
				RADIUS_M) /
			1e6;
		expect(transport).toBeGreaterThan(0.95 * expected);
		expect(transport).toBeLessThan(1.05 * expected);
		const eastward = cellsAlong(-55, -180, 180).map(
			(c) => plain.result.east[0]?.[c] as number,
		);
		expect(Math.min(...eastward)).toBeGreaterThan(0);
		// The gyres' friction does not reach the channel; its own does.
		const lowFriction = solved('ring, low friction', ring, RING_WINDS, {
			...DEFAULT_GYRE_SETTINGS,
			frictionPerS: DEFAULT_GYRE_SETTINGS.frictionPerS / 4,
		});
		expect(ringTransport(lowFriction)).toBeCloseTo(transport, 3);
		const freeChannel = solved('ring, free channel', ring, RING_WINDS, {
			...DEFAULT_GYRE_SETTINGS,
			channelFrictionPerS: DEFAULT_GYRE_SETTINGS.channelFrictionPerS / 2,
		});
		expect(ringTransport(freeChannel)).toBeGreaterThan(1.5 * transport);
	}, 10_000);

	it('floors the Coriolis parameter near the equator in the Ekman transport', () => {
		const { world, result } = solved(
			'continent',
			(lat, lon) => near(lat, lon, 45, 90, 20),
			windsOf(() => 5),
		);
		const stress =
			AIR_DENSITY_KG_M3 * DEFAULT_GYRE_SETTINGS.dragCoefficient * 25;
		const omega = rotationRate(world.planet);
		const floor =
			2 *
			omega *
			Math.sin((DEFAULT_GYRE_SETTINGS.equatorFloorDeg * Math.PI) / 180);
		const north = result.ekmanNorth[0] as Float32Array;
		const east = result.ekmanEast[0] as Float32Array;
		const at = (latitude: number) =>
			cellAt(grid, latLonToDirection(latitude, -120));
		const limit = stress / (SEA_WATER_DENSITY_KG_M3 * floor);
		// To the right of an eastward wind in the north, to the left in the
		// south, and capped within the floor.
		expect(north[at(2)]).toBeCloseTo(-limit, 3);
		expect(north[at(-2)]).toBeCloseTo(limit, 3);
		const f30 =
			2 * omega * Math.sin(latLonOf(at(30)).latitudeDeg * (Math.PI / 180));
		expect(north[at(30)]).toBeCloseTo(
			-stress / (SEA_WATER_DENSITY_KG_M3 * f30),
			3,
		);
		for (let c = 0; c < grid.cellCount; c++) {
			expect(Number.isFinite(north[c])).toBe(true);
			expect(Math.abs(north[c] as number)).toBeLessThanOrEqual(
				limit * (1 + 1e-6),
			);
			expect(east[c]).toBeCloseTo(0, 9);
		}
		expect(north[cellAt(grid, latLonToDirection(45, 90))]).toBe(0);
	});

	it('flows over the small islands beyond the most kept, round each', () => {
		const { world, solver, result } = solved(
			'island flowed over',
			(lat, lon) => !inBasin(lat, lon) || near(lat, lon, 30, -30, 5),
			BASIN_WINDS,
			{ ...DEFAULT_GYRE_SETTINGS, maxIslands: 0 },
		);
		expect(solver.basins.coasts).toEqual(['value']);
		expect(solver.basins.flowedOver).toHaveLength(1);
		const psi = result.streamfunction[0] as Float64Array;
		const island = solver.basins.flowedOver[0] as Int32Array;
		expect(new Set(Array.from(island, (p) => psi[p])).size).toBe(1);
		const flows = result.flows[0] as Float64Array;
		let acrossCoast = 0;
		for (let c = 0; c < grid.cellCount; c++) {
			if ((world.elevation[c] as number) > world.seaLevel) {
				for (let k = 0; k < 4; k++) {
					if (flows[4 * c + k] !== 0) {
						acrossCoast++;
					}
				}
			}
		}
		expect(acrossCoast).toBe(0);
	});

	it('holds a planet with no land still, while its wind still drives an Ekman transport', () => {
		const world = createBlankWorld(64);
		const result = solveGyres(
			world,
			windsOf(() => 5),
		);
		expect(result.flows[3]?.every((flow) => flow === 0)).toBe(true);
		expect(result.east[3]?.every((value) => value === 0)).toBe(true);
		expect(result.ekmanNorth[3]?.some((value) => value !== 0)).toBe(true);
		expect(result.iterations).toEqual(new Array(12).fill(0));
	});

	it('holds a planet with no sea still, without a current or an Ekman transport', () => {
		const world = worldOf(() => true);
		const result = solveGyres(
			world,
			windsOf(() => 5),
		);
		for (const month of [0, 6]) {
			expect(result.flows[month]?.every((flow) => flow === 0)).toBe(true);
			expect(result.east[month]?.every((value) => value === 0)).toBe(true);
			expect(result.north[month]?.every((value) => value === 0)).toBe(true);
			expect(result.ekmanEast[month]?.every((value) => value === 0)).toBe(true);
			expect(result.ekmanNorth[month]?.every((value) => value === 0)).toBe(
				true,
			);
		}
		expect(result.iterations).toEqual(new Array(12).fill(0));
	});

	it('holds a lake within an island still, without an Ekman transport', () => {
		const { world, solver, result } = solved(
			'lake on an island',
			(lat, lon) =>
				!inBasin(lat, lon) ||
				(near(lat, lon, 30, -30, 8) && !near(lat, lon, 30, -30, 3)),
			windsOf(() => 5),
		);
		expect(solver.basins.stillCells).toBeGreaterThan(0);
		const north = result.ekmanNorth[0] as Float32Array;
		const east = result.ekmanEast[0] as Float32Array;
		let lake = 0;
		let drivenSea = 0;
		for (let c = 0; c < grid.cellCount; c++) {
			const sea = (world.elevation[c] as number) <= world.seaLevel;
			if (sea && solver.basins.land[c] === 1) {
				lake++;
				expect(north[c]).toBe(0);
				expect(east[c]).toBe(0);
				expect(result.east[0]?.[c]).toBe(0);
				expect(result.north[0]?.[c]).toBe(0);
			} else if (sea && north[c] !== 0) {
				drivenSea++;
			}
		}
		expect(lake).toBe(solver.basins.stillCells);
		expect(drivenSea).toBeGreaterThan(0);
	});

	it('starts each month from the guess given', () => {
		const { world, solver, result } = basin();
		const again = solveGyres(world, BASIN_WINDS, {
			solver,
			guess: result.streamfunction,
		});
		expect(again.iterations).toEqual(new Array(12).fill(0));
		// Each month after the first starts from the month before's answer.
		expect(result.iterations.slice(1)).toEqual(new Array(11).fill(0));
	});

	it('solves with the solver for the land, settings and rotation given, built when they change', () => {
		const { world, result } = basin();
		// With no solver given, each answer is the one a solver built for that
		// world and those settings gives, whatever was solved before it.
		const kept = solveGyres(world, BASIN_WINDS);
		expect(kept.flows[0]).toEqual(result.flows[0]);
		expect(solveGyres(world, BASIN_WINDS).flows[0]).toEqual(kept.flows[0]);
		const lowDrag = {
			...DEFAULT_GYRE_SETTINGS,
			dragCoefficient: DEFAULT_GYRE_SETTINGS.dragCoefficient / 2,
		};
		const dragged = solveGyres(world, BASIN_WINDS, { settings: lowDrag });
		expect(dragged.flows[0]).not.toEqual(kept.flows[0]);
		expect(dragged.flows[0]).toEqual(
			solveGyres(world, BASIN_WINDS, {
				solver: createGyreSolver(world, lowDrag),
			}).flows[0],
		);
		const island = withIsland();
		const otherLand = solveGyres(island.world, BASIN_WINDS);
		expect(otherLand.flows[0]).toEqual(island.result.flows[0]);
		expect(otherLand.flows[0]).not.toEqual(kept.flows[0]);
		const fast = { ...world, planet: { ...world.planet, dayLengthHours: 6 } };
		const spun = solveGyres(fast, BASIN_WINDS);
		expect(spun.flows[0]).not.toEqual(kept.flows[0]);
		expect(spun.flows[0]).toEqual(
			solveGyres(fast, BASIN_WINDS, { solver: createGyreSolver(fast) })
				.flows[0],
		);
		expect(solveGyres(world, BASIN_WINDS).flows[0]).toEqual(kept.flows[0]);
	}, 30_000);

	it('throws when a month does not converge', () => {
		const { world } = basin();
		const solver = createGyreSolver(world, {
			...DEFAULT_GYRE_SETTINGS,
			gyreTolerance: 1e-300,
		});
		expect(() => solveGyres(world, BASIN_WINDS, { solver })).toThrow(
			/did not converge/,
		);
	}, 30_000);

	it('refuses winds of the wrong length, a setting out of range, and a solver for other land or rotation', () => {
		const { world, solver } = basin();
		expect(() =>
			solveGyres(
				world,
				{ east: BASIN_WINDS.east.slice(1), north: BASIN_WINDS.north },
				{
					solver,
				},
			),
		).toThrow(RangeError);
		const bad = new Float32Array(grid.cellCount);
		bad[5] = Number.NaN;
		expect(() =>
			solveGyres(
				world,
				{ east: BASIN_WINDS.east.map(() => bad), north: BASIN_WINDS.north },
				{ solver },
			),
		).toThrow(/finite/);
		expect(() =>
			solveGyres(world, BASIN_WINDS, {
				solver,
				guess: [new Float64Array(3)],
			}),
		).toThrow(RangeError);
		expect(() =>
			createGyreSolver(world, { ...DEFAULT_GYRE_SETTINGS, frictionPerS: 0 }),
		).toThrow(RangeError);
		expect(() =>
			createGyreSolver(world, { ...DEFAULT_GYRE_SETTINGS, equatorFloorDeg: 0 }),
		).toThrow(RangeError);
		expect(() =>
			createGyreSolver(world, {
				...DEFAULT_GYRE_SETTINGS,
				dragCoefficient: -1,
			}),
		).toThrow(RangeError);
		expect(() =>
			createGyreSolver(world, { ...DEFAULT_GYRE_SETTINGS, maxIslands: 0.5 }),
		).toThrow(RangeError);
		const other = worldOf((lat) => lat > 0);
		expect(() => solveGyres(other, BASIN_WINDS, { solver })).toThrow(
			/another grid or another land/,
		);
		expect(() =>
			solveGyres(
				{ ...world, elevation: world.elevation.slice(1) },
				BASIN_WINDS,
				{ solver },
			),
		).toThrow(/another grid or another land/);
		const fast = { ...world, planet: { ...world.planet, dayLengthHours: 6 } };
		expect(() => solveGyres(fast, BASIN_WINDS, { solver })).toThrow(
			/rotation rate/,
		);
	});
});

describe('gyreForcing', () => {
	it("is the curl of a zonal wind's stress over the water's density", () => {
		const wind = (lat: number) => 8 * Math.sin((2 * lat * Math.PI) / 180);
		const winds = windsOf(wind);
		const forcing = gyreForcing(
			grid,
			winds.east[0] as Float32Array,
			winds.north[0] as Float32Array,
		);
		const drag = AIR_DENSITY_KG_M3 * DEFAULT_GYRE_SETTINGS.dragCoefficient;
		const stressCos = (phi: number): number => {
			const u = wind((phi * 180) / Math.PI);
			return drag * Math.abs(u) * u * Math.cos(phi);
		};
		let checked = 0;
		for (let p = 0; p < index.cornerCount; p += 97) {
			const z = index.directions[3 * p + 2] as number;
			const phi = Math.asin(z);
			if (Math.abs(phi) > (60 * Math.PI) / 180 || Math.abs(phi) < 0.1) {
				continue;
			}
			const h = 1e-4;
			// curl τ = −(1 / (R cos φ)) ∂(τ_x cos φ)/∂φ for a zonal stress.
			const exact =
				-(stressCos(phi + h) - stressCos(phi - h)) /
				(2 * h * RADIUS_M * Math.cos(phi) * SEA_WATER_DENSITY_KG_M3);
			const scale = (drag * 64) / (RADIUS_M * SEA_WATER_DENSITY_KG_M3);
			expect(Math.abs((forcing[p] as number) - exact)).toBeLessThan(
				0.03 * scale,
			);
			checked++;
		}
		expect(checked).toBeGreaterThan(100);
	});

	it('refuses a wind of the wrong length', () => {
		expect(() =>
			gyreForcing(grid, new Float32Array(2), new Float32Array(grid.cellCount)),
		).toThrow(RangeError);
	});
});
