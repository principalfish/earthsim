import { describe, expect, it } from 'vitest';
import { cornerIndex } from '../grid/corners';
import { directionToLatLon, type Grid, getGrid } from '../grid/grid';
import { findBasins } from './basins';

const grid = getGrid(64);

/** One value per cell: 1 where the predicate holds at the cell's centre. */
const landWhere = (
	isLand: (latitude: number, longitude: number) => boolean,
): Uint8Array => {
	const land = new Uint8Array(grid.cellCount);
	for (let c = 0; c < grid.cellCount; c++) {
		const { latitudeDeg, longitudeDeg } = directionToLatLon([
			grid.centres[3 * c] as number,
			grid.centres[3 * c + 1] as number,
			grid.centres[3 * c + 2] as number,
		]);
		land[c] = isLand(latitudeDeg, longitudeDeg) ? 1 : 0;
	}
	return land;
};

/** Whether a point lies within `radius` degrees of a centre, roughly. */
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

/** The coast label of the corners of the cell nearest a point. */
const coastOfCellAt = (
	labels: Int32Array,
	at: (latitude: number, longitude: number) => boolean,
	g: Grid = grid,
): number => {
	const { cellCorners } = cornerIndex(g);
	for (let c = 0; c < g.cellCount; c++) {
		const { latitudeDeg, longitudeDeg } = directionToLatLon([
			g.centres[3 * c] as number,
			g.centres[3 * c + 1] as number,
			g.centres[3 * c + 2] as number,
		]);
		if (at(latitudeDeg, longitudeDeg)) {
			return labels[cellCorners[4 * c] as number] as number;
		}
	}
	return -1;
};

const inBasin = (latitude: number, longitude: number): boolean =>
	latitude > 10 && latitude < 50 && longitude > -60 && longitude < 0;

describe('findBasins', () => {
	it('gives the largest coast of a sea its value and makes the rest islands', () => {
		const land = landWhere(
			(lat, lon) => !inBasin(lat, lon) || near(lat, lon, 30, -30, 5),
		);
		const basins = findBasins(grid, land, { maxIslands: 8 });
		expect(basins.coasts).toHaveLength(2);
		const continent = coastOfCellAt(basins.labels, (lat) => lat > 80);
		const island = coastOfCellAt(basins.labels, (lat, lon) =>
			near(lat, lon, 30, -30, 1),
		);
		expect(basins.coasts[continent - 1]).toBe('value');
		expect(basins.coasts[island - 1]).toBe('net');
		expect(basins.land).toEqual(land);
		expect(basins.flowedOver).toEqual([]);
		expect(basins.stillCells).toBe(0);
	});

	it('holds still a lake whose only coast is an island', () => {
		const land = landWhere(
			(lat, lon) =>
				!inBasin(lat, lon) ||
				(near(lat, lon, 30, -30, 8) && !near(lat, lon, 30, -30, 3)),
		);
		const lake = landWhere((lat, lon) => near(lat, lon, 30, -30, 3));
		const lakeCells = lake.reduce((sum, value) => sum + value, 0);
		expect(lakeCells).toBeGreaterThan(0);
		const basins = findBasins(grid, land, { maxIslands: 8 });
		expect(basins.coasts).toEqual(['value', 'net']);
		expect(basins.stillCells).toBe(lakeCells);
		for (let c = 0; c < grid.cellCount; c++) {
			if (lake[c] === 1) {
				expect(basins.land[c]).toBe(1);
			}
		}
	});

	it('keeps a lake on a continent, which gives it its value', () => {
		const land = landWhere(
			(lat, lon) => !inBasin(lat, lon) && !near(lat, lon, 60, 90, 6),
		);
		const basins = findBasins(grid, land, { maxIslands: 8 });
		expect(basins.coasts).toEqual(['value']);
		expect(basins.stillCells).toBe(0);
	});

	it('flows over the islands beyond the most kept, the smallest first', () => {
		const islands = [
			[20, -45, 6],
			[40, -15, 3],
			[25, -15, 2],
		] as const;
		const land = landWhere(
			(lat, lon) =>
				!inBasin(lat, lon) ||
				islands.some(([a, b, r]) => near(lat, lon, a, b, r)),
		);
		const kept = findBasins(grid, land, { maxIslands: 1 });
		expect(kept.coasts).toEqual(['value', 'net']);
		expect(kept.flowedOver).toHaveLength(2);
		const largest = coastOfCellAt(kept.labels, (lat, lon) =>
			near(lat, lon, 20, -45, 1),
		);
		expect(kept.coasts[largest - 1]).toBe('net');
		const { cellCorners } = cornerIndex(grid);
		for (const [a, b] of islands.slice(1)) {
			const cell = landWhere((lat, lon) => near(lat, lon, a, b, 1)).indexOf(1);
			expect(kept.land[cell]).toBe(0);
			const corner = cellCorners[4 * cell] as number;
			expect(kept.labels[corner]).toBe(0);
			expect(kept.flowedOver.some((list) => list.includes(corner))).toBe(true);
		}
		const none = findBasins(grid, land, { maxIslands: 0 });
		expect(none.coasts).toEqual(['value']);
		expect(none.flowedOver).toHaveLength(3);
	});

	it('marks the corners beside which the sea can flow round the globe', () => {
		const ring = landWhere((lat) => lat < -70 || lat > -40);
		const basins = findBasins(grid, ring, { maxIslands: 8 });
		let sea = 0;
		for (let p = 0; p < basins.labels.length; p++) {
			if (basins.labels[p] === 0) {
				sea++;
				expect(basins.channel[p]).toBe(1);
			}
		}
		expect(sea).toBeGreaterThan(0);
		// Both lands reach round the globe, so their corners are marked too.
		expect(basins.channel.every((value) => value === 1)).toBe(true);
		const boxed = findBasins(
			grid,
			landWhere((lat, lon) => !inBasin(lat, lon)),
			{
				maxIslands: 8,
			},
		);
		for (let p = 0; p < boxed.labels.length; p++) {
			if (boxed.labels[p] === 0) {
				expect(boxed.channel[p]).toBe(0);
			}
		}
	});

	it('holds a planet with no land still', () => {
		const basins = findBasins(grid, new Uint8Array(grid.cellCount), {
			maxIslands: 8,
		});
		expect(basins.coasts).toEqual([]);
		expect(basins.stillCells).toBe(grid.cellCount);
		expect(basins.land.every((value) => value === 1)).toBe(true);
	});

	it('holds a planet with no sea still, with no coasts', () => {
		const basins = findBasins(grid, new Uint8Array(grid.cellCount).fill(1), {
			maxIslands: 8,
		});
		expect(basins.coasts).toEqual([]);
		expect(basins.stillCells).toBe(0);
		expect(basins.flowedOver).toEqual([]);
		expect(basins.land.every((value) => value === 1)).toBe(true);
		expect(basins.labels.every((value) => value === 0)).toBe(true);
		expect(basins.channel.every((value) => value === 0)).toBe(true);
	});

	it('refuses land of the wrong length and a count of islands that is not whole', () => {
		expect(() =>
			findBasins(grid, new Uint8Array(3), { maxIslands: 1 }),
		).toThrow(RangeError);
		const land = new Uint8Array(grid.cellCount);
		expect(() => findBasins(grid, land, { maxIslands: 1.5 })).toThrow(
			RangeError,
		);
		expect(() => findBasins(grid, land, { maxIslands: -1 })).toThrow(
			RangeError,
		);
	});
});
