import { describe, expect, it } from 'vitest';
import {
	cellLatitudes,
	createBlankWorld,
	directionToLatLon,
	getGrid,
	type WindMonth,
	type World,
} from '../../src/core/index';
import {
	ARROW_MAX_UNITS,
	ARROW_MIN_UNITS,
	arrowLength,
	drawMap,
	PRESSURE_HIGH_HPA,
	PRESSURE_LOW_HPA,
	PRESSURE_MIDDLE_HPA,
	pressureColour,
} from './map';
import { decodePngDataUrl } from './testing/png';
import { allElements, parseXml, type XmlElement } from './testing/xml';

const grid = getGrid(64);
const latitudes = cellLatitudes(grid);
const longitudes = Float64Array.from({ length: grid.cellCount }, (_, cell) => {
	const { longitudeDeg } = directionToLatLon([
		grid.centres[3 * cell] as number,
		grid.centres[3 * cell + 1] as number,
		grid.centres[3 * cell + 2] as number,
	]);
	return longitudeDeg;
});

/** An ocean world with land north of 45°N between 0° and 90°E. */
const patchWorld = (): World => {
	const world = createBlankWorld(64);
	for (let cell = 0; cell < grid.cellCount; cell++) {
		const longitude = longitudes[cell] as number;
		if ((latitudes[cell] as number) > 45 && longitude > 0 && longitude < 90) {
			world.elevation[cell] = 500;
		}
	}
	return world;
};

const monthOf = (
	wind: (cell: number) => readonly [number, number],
	pressure: (cell: number) => number = () => PRESSURE_MIDDLE_HPA,
): WindMonth => ({
	east: Float32Array.from(
		{ length: grid.cellCount },
		(_, cell) => wind(cell)[0],
	),
	north: Float32Array.from(
		{ length: grid.cellCount },
		(_, cell) => wind(cell)[1],
	),
	pressure: Float32Array.from({ length: grid.cellCount }, (_, cell) =>
		pressure(cell),
	),
});

const elements = (root: XmlElement, name: string): XmlElement[] =>
	allElements(root).filter((element) => element.name === name);

/**
 * The arrows in a group of a map: each one's tail, its step from tail to
 * tip, and the lengths of its shaft and head, in drawing units.
 */
const arrowsIn = (root: XmlElement, className: string) => {
	const group = allElements(root).find(
		(element) => element.attributes.get('class') === className,
	);
	return (group?.children ?? []).map((path) => {
		const d = path.attributes.get('d') as string;
		const number = '(-?[\\d.]+)';
		const pair = `${number} ?${number}`;
		const match = new RegExp(
			`^M${pair}l${pair}m${pair}l${pair}l${pair}z$`,
		).exec(d);
		if (match === null) {
			throw new Error(`An arrow drawn as ${d}`);
		}
		const [x, y, shaftX, shaftY, sideX, sideY, tipX, tipY] = match
			.slice(1)
			.map(Number) as number[];
		const headX = (sideX as number) + (tipX as number);
		const headY = (sideY as number) + (tipY as number);
		return {
			x: x as number,
			y: y as number,
			dx: (shaftX as number) + headX,
			dy: (shaftY as number) + headY,
			shaft: Math.hypot(shaftX as number, shaftY as number),
			head: Math.hypot(headX, headY),
		};
	});
};

const arrowsOf = (root: XmlElement) => arrowsIn(root, 'arrows');

/** Every point a path's absolute and relative moves and lines pass. */
const pathPoints = (d: string): [number, number][] => {
	const points: [number, number][] = [];
	let x = 0;
	let y = 0;
	for (const [, command, args] of d.matchAll(/([MlL])([^MlL]*)/g)) {
		const numbers = (args?.match(/-?[\d.]+/g) ?? []).map(Number);
		for (let index = 0; index < numbers.length; index += 2) {
			const a = numbers[index] as number;
			const b = numbers[index + 1] as number;
			if (command === 'l') {
				x += a;
				y += b;
			} else {
				x = a;
				y = b;
			}
			points.push([x, y]);
		}
	}
	return points;
};

describe('arrowLength', () => {
	it('grows with speed between a floor and a cap, and is null when calm', () => {
		expect(arrowLength(0)).toBeNull();
		expect(arrowLength(0.05)).toBeNull();
		// 4 units, and half a unit more for each metre a second up to 10.
		expect(arrowLength(0.5)).toBeCloseTo(4.25, 10);
		expect(arrowLength(5)).toBeCloseTo(6.5, 10);
		expect(arrowLength(10)).toBe(ARROW_MAX_UNITS);
		expect(arrowLength(30)).toBe(ARROW_MAX_UNITS);
		expect(ARROW_MIN_UNITS).toBe(4);
		// Shorter than the 10 units between arrows, so they never meet.
		expect(ARROW_MAX_UNITS).toBe(9);
	});
});

describe('pressureColour', () => {
	it('is white at the middle, blue below and red above, held at the ends', () => {
		expect(pressureColour(PRESSURE_MIDDLE_HPA)).toEqual([247, 247, 245]);
		const low = pressureColour(PRESSURE_LOW_HPA);
		const high = pressureColour(PRESSURE_HIGH_HPA);
		expect(low[2]).toBeGreaterThan(low[0]);
		expect(high[0]).toBeGreaterThan(high[2]);
		expect(pressureColour(900)).toEqual(low);
		expect(pressureColour(1100)).toEqual(high);
	});
});

describe('drawMap', () => {
	// An east wind of 5 m/s everywhere but north of 60°N, where it is calm;
	// 980 hPa in the north and 1,040 in the south.
	const month = monthOf(
		(cell) => ((latitudes[cell] as number) > 60 ? [0, 0] : [5, 0]),
		(cell) => ((latitudes[cell] as number) > 0 ? 980 : 1040),
	);
	const svg = drawMap({
		title: 'A test map: a < b & "c"',
		world: patchWorld(),
		month,
	});
	const root = parseXml(svg);

	it('is well-formed SVG with its title', () => {
		expect(root.name).toBe('svg');
		expect(root.attributes.get('xmlns')).toBe('http://www.w3.org/2000/svg');
		expect(elements(root, 'title')[0]?.text).toBe('A test map: a < b & "c"');
	});

	it('draws one arrow at each sample point that is not calm', () => {
		const arrows = arrowsOf(root);
		// 72 by 36 points every 5°; the 6 rows north of 60°N are calm.
		expect(arrows).toHaveLength(72 * 36 - 6 * 72);
		for (const { x, y, dx, dy } of arrows) {
			// The 5 m/s east wind is 6.5 units long, pointing right, with a
			// head two fifths of that.
			expect(dx).toBeCloseTo(6.5, 1);
			expect(dy).toBeCloseTo(0, 5);
			// No arrow north of 60°N: the northernmost row left is 57.5°N,
			// 65 units down.
			expect(y).toBeGreaterThanOrEqual(65);
			expect(x).toBeGreaterThan(0);
		}
	});

	it('points a north-east wind left and down', () => {
		// A wind from the north-east blows towards the south-west.
		const arrows = arrowsOf(
			parseXml(
				drawMap({
					title: 'North-east wind',
					world: patchWorld(),
					month: monthOf(() => [-3, -3]),
				}),
			),
		);
		expect(arrows).toHaveLength(72 * 36);
		for (const { dx, dy } of arrows) {
			expect(dx).toBeLessThan(0);
			expect(dy).toBeGreaterThan(0);
			expect(Math.hypot(dx, dy)).toBeCloseTo(4 + 0.5 * Math.hypot(3, 3), 1);
		}
	});

	it('gives every arrow a shaft and a head two fifths of its length', () => {
		const lightest = arrowsOf(
			parseXml(
				drawMap({
					title: 'Light wind',
					world: patchWorld(),
					month: monthOf(() => [0.2, 0]),
				}),
			),
		);
		const strongest = arrowsOf(
			parseXml(
				drawMap({
					title: 'Strong wind',
					world: patchWorld(),
					month: monthOf(() => [30, 0]),
				}),
			),
		);
		for (const { dx, shaft, head } of [...lightest, ...strongest]) {
			expect(head / dx).toBeCloseTo(0.4, 1);
			expect(shaft).toBeGreaterThan(head);
		}
		// Neighbours 10 units apart in a row of the strongest wind leave a
		// gap of a unit between one tip and the next tail.
		const [first, second] = strongest;
		expect(
			(second?.x as number) - ((first?.x as number) + (first?.dx as number)),
		).toBeCloseTo(1, 1);
	});

	it('draws the coast around the land, north up and east to the right', () => {
		const coast = elements(root, 'path').find(
			(path) => path.attributes.get('class') === 'coast',
		);
		const points = pathPoints(coast?.attributes.get('d') as string);
		expect(points.length).toBeGreaterThan(10);
		// The land is from 0° to 90°E, 360 to 540 units across, and north of
		// 45°N, above 90 units down; the coast lies within a degree of it.
		for (const [x, y] of points) {
			expect(x).toBeGreaterThanOrEqual(358);
			expect(x).toBeLessThanOrEqual(542);
			expect(y).toBeGreaterThanOrEqual(0);
			expect(y).toBeLessThanOrEqual(92);
		}
	});

	it('shows the pressure as an image of one pixel a degree, north up', () => {
		const image = elements(root, 'image').find(
			(element) => element.attributes.get('class') === 'pressure',
		);
		const decoded = decodePngDataUrl(image?.attributes.get('href') as string);
		expect(decoded.width).toBe(360);
		expect(decoded.height).toBe(180);
		const pixel = (row: number, column: number) => [
			...decoded.pixels.subarray(
				3 * (row * 360 + column),
				3 * (row * 360 + column) + 3,
			),
		];
		expect(pixel(0, 0)).toEqual([...pressureColour(980)]);
		expect(pixel(10, 200)).toEqual([...pressureColour(980)]);
		expect(pixel(179, 359)).toEqual([...pressureColour(1040)]);
	});

	it('has a key: the colour bar with its pressures and reference arrows', () => {
		const texts = elements(root, 'text').map(({ text }) => text);
		for (const label of [
			'980',
			'1000',
			'1013',
			'1025',
			'1040',
			'2 m/s',
			'5 m/s',
			'10 m/s',
		]) {
			expect(texts).toContain(label);
		}
		expect(texts).toContain('Sea-level pressure, hPa');
		// The reference arrows are drawn at the map's own scale.
		const reference = arrowsIn(root, 'key-arrows');
		expect(reference.map(({ dx }) => dx)).toEqual(
			[2, 5, 10].map((speed) =>
				expect.closeTo(arrowLength(speed) as number, 1),
			),
		);
	});

	it('shows land and sea in two colours under the coast when there is no month', () => {
		const coastOnly = parseXml(
			drawMap({ title: 'Coast only', world: patchWorld() }),
		);
		const images = elements(coastOnly, 'image');
		expect(images.map((image) => image.attributes.get('class'))).toEqual([
			'land-sea',
		]);
		const decoded = decodePngDataUrl(
			images[0]?.attributes.get('href') as string,
		);
		const pixel = (row: number, column: number) => [
			...decoded.pixels.subarray(
				3 * (row * 360 + column),
				3 * (row * 360 + column) + 3,
			),
		];
		// 89.5°N 179.5°W is sea; 69.5°N 45.5°E is land.
		expect(pixel(20, 225)).not.toEqual(pixel(0, 0));
		expect(pixel(179, 0)).toEqual(pixel(0, 0));
		expect(arrowsOf(coastOnly)).toHaveLength(0);
		expect(
			elements(coastOnly, 'path').filter(
				(path) => path.attributes.get('class') === 'coast',
			),
		).toHaveLength(1);

		const ocean = parseXml(
			drawMap({
				title: 'Ocean',
				world: createBlankWorld(64),
			}),
		);
		expect(
			elements(ocean, 'path').filter(
				(path) => path.attributes.get('class') === 'coast',
			),
		).toHaveLength(0);
	});

	it('takes each arrow and pixel from the cell under its own point', () => {
		// East of 0° a 5 m/s east wind, with a 3 m/s north wind added south
		// of the equator; west of 0° calm. The pressure is 1,040 hPa only in
		// the north-east quarter, between 90°E and 180°.
		const latitude = (cell: number) => latitudes[cell] as number;
		const longitude = (cell: number) => longitudes[cell] as number;
		const quartered = parseXml(
			drawMap({
				title: 'Quartered',
				world: patchWorld(),
				month: monthOf(
					(cell) =>
						longitude(cell) > 0 ? [5, latitude(cell) < 0 ? 3 : 0] : [0, 0],
					(cell) =>
						latitude(cell) > 0 && longitude(cell) > 90
							? PRESSURE_HIGH_HPA
							: PRESSURE_MIDDLE_HPA,
				),
			}),
		);
		// Away from the poles, where a cell's longitude can stray from the
		// point's, every arrow lies east of 0° (360 units across).
		const middles = arrowsOf(quartered).map(({ x, y, dx, dy }) => ({
			x: x + dx / 2,
			y: y + dy / 2,
			dx,
			dy,
		}));
		const near = (x: number, y: number) =>
			middles.find(
				(arrow) => Math.abs(arrow.x - x) < 0.2 && Math.abs(arrow.y - y) < 0.2,
			);
		for (const arrow of middles.filter(({ y }) => y > 60 && y < 300)) {
			expect(arrow.x).toBeGreaterThan(360);
		}
		// 22.5°E, 37.5°S: east and north, so right and up.
		const south = near((180 + 22.5) * 2, (90 + 37.5) * 2);
		expect(south?.dx).toBeGreaterThan(0);
		expect(south?.dy).toBeLessThan(0);
		// 22.5°E, 37.5°N: east only.
		expect(near((180 + 22.5) * 2, (90 - 37.5) * 2)?.dy).toBeCloseTo(0, 5);
		// 22.5°W, 37.5°N: calm, so no arrow.
		expect(near((180 - 22.5) * 2, (90 - 37.5) * 2)).toBeUndefined();

		const image = elements(quartered, 'image').find(
			(element) => element.attributes.get('class') === 'pressure',
		);
		const decoded = decodePngDataUrl(image?.attributes.get('href') as string);
		const pixel = (row: number, column: number) => [
			...decoded.pixels.subarray(
				3 * (row * 360 + column),
				3 * (row * 360 + column) + 3,
			),
		];
		const high = [...pressureColour(PRESSURE_HIGH_HPA)];
		const middle = [...pressureColour(PRESSURE_MIDDLE_HPA)];
		// Row 30 is 59.5°N and row 150 is 60.5°S; column 315 is 135.5°E,
		// column 45 is 134.5°W and column 225 is 45.5°E.
		expect(pixel(30, 315)).toEqual(high);
		expect(pixel(30, 45)).toEqual(middle);
		expect(pixel(30, 225)).toEqual(middle);
		expect(pixel(150, 315)).toEqual(middle);
	});

	it('runs the coast on across 180°', () => {
		// Land between 20°S and 20°N, within 20° of 180°.
		const world = createBlankWorld(64);
		for (let cell = 0; cell < grid.cellCount; cell++) {
			if (
				Math.abs(latitudes[cell] as number) < 20 &&
				Math.abs(longitudes[cell] as number) > 160
			) {
				world.elevation[cell] = 500;
			}
		}
		const coast = elements(
			parseXml(drawMap({ title: 'Across 180°', world })),
			'path',
		).find((path) => path.attributes.get('class') === 'coast');
		const points = pathPoints(coast?.attributes.get('d') as string);
		// The coast reaches both edges, 0 and 720 units across, ...
		expect(points.some(([x]) => x <= 0)).toBe(true);
		expect(points.some(([x]) => x >= 720)).toBe(true);
		for (const [x, y] of points) {
			expect(x <= 42 || x >= 678).toBe(true);
			// ... but only along the land's northern and southern shores,
			// 140 and 220 units down: there is no coast down the edge.
			if (x <= 1 || x >= 719) {
				expect(Math.min(Math.abs(y - 140), Math.abs(y - 220))).toBeLessThan(4);
			}
		}
	});

	it('refuses a field of the wrong length', () => {
		expect(() =>
			drawMap({
				title: 'Short',
				world: patchWorld(),
				month: { ...month, north: new Float32Array(5) },
			}),
		).toThrow(/north field must hold/);
	});
});
