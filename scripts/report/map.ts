/**
 * One flat map of a world's month, as an SVG drawing to put inline in a
 * page: the sea-level pressure as colours, the coast as a line and the
 * winds as arrows, with a key.
 *
 * The map is plate carrée: longitude across from 180° west at the left to
 * 180° east at the right, latitude up from 90° south at the bottom to 90°
 * north at the top, {@link UNITS_PER_DEGREE} units of the drawing to a
 * degree either way.
 */

import {
	cellAt,
	type Grid,
	getGrid,
	latLonToDirection,
	type WindMonth,
	type World,
} from '../../src/core/index';
import { degreesLabel, escapeText, short } from './markup';
import { pngDataUrl } from './png';

/** Units of the drawing to a degree of latitude or longitude. */
export const UNITS_PER_DEGREE = 2;

const MAP_WIDTH = 360 * UNITS_PER_DEGREE;
const MAP_HEIGHT = 180 * UNITS_PER_DEGREE;

/**
 * The embedded images' size, one pixel a degree; each is stretched to the
 * map, whatever its units.
 */
const IMAGE_COLUMNS = 360;
const IMAGE_ROWS = 180;

/** Room left of the map for the latitudes, and above it. */
const LEFT = 52;
const TOP = 10;
const RIGHT = 14;
/** Room below the map for the longitudes. */
const LABELS_BELOW = 30;
/** Room below the longitudes for the key. */
const KEY_HEIGHT = 66;

/** The size of the drawing's text, in units of the drawing. */
const FONT_SIZE = 18;

/** The pressure at the middle of the colour scale, white, in hPa. */
export const PRESSURE_MIDDLE_HPA = 1013;

/**
 * The pressure the colour scale reaches full blue at, in hPa; any lower
 * pressure is drawn in that blue. The observed monthly means on a 64 grid
 * reach 980 hPa at their lowest (around Antarctica in July), and 99% of
 * the surface lies above 984 hPa in either January or July.
 */
export const PRESSURE_LOW_HPA = 980;

/**
 * The pressure the colour scale reaches full red at, in hPa; any higher
 * pressure is drawn in that red. The observed monthly means on a 64 grid
 * reach 1,036.5 hPa at their highest (the Siberian high in January), and
 * 99% of the surface lies below 1,031 hPa in either January or July.
 */
export const PRESSURE_HIGH_HPA = 1040;

/** The colours at the low end, the middle and the high end of the scale. */
const LOW_COLOUR = [52, 112, 196] as const;
const MIDDLE_COLOUR = [247, 247, 245] as const;
const HIGH_COLOUR = [208, 62, 52] as const;

/** The spacing of the arrows' sample points, in degrees. */
export const ARROW_SPACING_DEG = 5;

/**
 * The length an arrow starts from at no speed, in units of the drawing:
 * 2°, long enough to show its shaft and head. The lightest wind drawn,
 * {@link CALM_M_PER_S}, is a hair longer.
 */
export const ARROW_MIN_UNITS = 4;

/**
 * The length of the arrow of a wind of {@link ARROW_FULL_SPEED_M_PER_S} or
 * more, in units of the drawing: 4.5°, so that arrows a
 * {@link ARROW_SPACING_DEG}° step apart never meet.
 */
export const ARROW_MAX_UNITS = 9;

/**
 * The speed whose arrow is the longest, in metres a second: about the
 * strongest monthly mean the observed Earth has over a wide area.
 */
export const ARROW_FULL_SPEED_M_PER_S = 10;

/** Below this speed, in metres a second, no arrow is drawn. */
export const CALM_M_PER_S = 0.1;

/** An arrowhead's length as a share of its arrow's. */
export const HEAD_SHARE = 0.4;

/** An arrowhead's width as a share of its own length. */
const HEAD_WIDTH_SHARE = 1;

/** The width of an arrow's line, in units of the drawing. */
const ARROW_STROKE_UNITS = 0.8;

/** The speeds of the key's reference arrows, in metres a second. */
export const REFERENCE_SPEEDS_M_PER_S = [2, 5, 10] as const;

/** The spacing of the map's thin lines of latitude and longitude, in degrees. */
export const GRATICULE_STEP_DEG = 30;

/** The colours of land and sea on a map with no pressure. */
const LAND_COLOUR = [226, 214, 184] as const;
const SEA_COLOUR = [204, 224, 240] as const;

/**
 * The pressures labelled on the key's colour bar, in hPa: its two ends,
 * the middle and a step either side.
 */
const PRESSURE_LABELS = [
	PRESSURE_LOW_HPA,
	1000,
	PRESSURE_MIDDLE_HPA,
	1025,
	PRESSURE_HIGH_HPA,
];

/** What a map shows. */
export type MapOptions = {
	/** What the map shows, for a reader that cannot see it. */
	readonly title: string;
	/** The world whose coast is drawn and whose cells the fields are on. */
	readonly world: World;
	/**
	 * The month's wind and pressure, one value per cell of the world's
	 * grid. Left out, the map shows the land and sea alone.
	 */
	readonly month?: WindMonth;
};

/** The colour of a pressure on the map's scale, as red, green and blue. */
export const pressureColour = (
	hectopascals: number,
): readonly [number, number, number] => {
	const above = hectopascals >= PRESSURE_MIDDLE_HPA;
	const end = above ? HIGH_COLOUR : LOW_COLOUR;
	const share = above
		? (hectopascals - PRESSURE_MIDDLE_HPA) /
			(PRESSURE_HIGH_HPA - PRESSURE_MIDDLE_HPA)
		: (PRESSURE_MIDDLE_HPA - hectopascals) /
			(PRESSURE_MIDDLE_HPA - PRESSURE_LOW_HPA);
	const t = Math.min(1, Math.max(0, share));
	const mix = (channel: 0 | 1 | 2): number =>
		Math.round(
			MIDDLE_COLOUR[channel] + t * (end[channel] - MIDDLE_COLOUR[channel]),
		);
	return [mix(0), mix(1), mix(2)];
};

/**
 * The length an arrow is drawn at for a wind, in units of the drawing:
 * {@link ARROW_MIN_UNITS} at no speed, growing in step with the speed to
 * {@link ARROW_MAX_UNITS} at {@link ARROW_FULL_SPEED_M_PER_S}, and that long
 * for any stronger wind; null below {@link CALM_M_PER_S}, where no arrow is
 * drawn.
 */
export const arrowLength = (speed: number): number | null =>
	speed < CALM_M_PER_S
		? null
		: ARROW_MIN_UNITS +
			(ARROW_MAX_UNITS - ARROW_MIN_UNITS) *
				Math.min(1, speed / ARROW_FULL_SPEED_M_PER_S);

/**
 * The path of one arrow: its shaft from the tail to the head's base, then
 * the head, a triangle {@link HEAD_SHARE} of the arrow's length, as one
 * path in relative steps.
 *
 * @param x - Where the arrow's middle lies, across.
 * @param y - Where the arrow's middle lies, down.
 * @param dx - The arrow from its tail to its tip, across.
 * @param dy - The arrow from its tail to its tip, down.
 */
const arrowPath = (x: number, y: number, dx: number, dy: number): string => {
	const length = Math.hypot(dx, dy);
	const alongX = dx / length;
	const alongY = dy / length;
	const head = HEAD_SHARE * length;
	const half = (HEAD_WIDTH_SHARE * head) / 2;
	const shaftX = dx - head * alongX;
	const shaftY = dy - head * alongY;
	// From the head's base out to one side, to the tip, to the other side.
	const sideX = -alongY * half;
	const sideY = alongX * half;
	return `M${short(x - dx / 2)} ${short(y - dy / 2)}l${short(shaftX)} ${short(shaftY)}m${short(sideX)} ${short(sideY)}l${short(head * alongX - sideX)} ${short(head * alongY - sideY)}l${short(-head * alongX - sideX)} ${short(-head * alongY - sideY)}z`.replace(
		/ -/g,
		'-',
	);
};

/**
 * The cell under each of a regular set of points, in rows from the north.
 *
 * @param columns - Points across, at equal steps of longitude from 180°
 * west, each in the middle of its step.
 * @param rows - Points down, at equal steps of latitude from 90° north,
 * each in the middle of its step.
 */
const sampleCells = (grid: Grid, columns: number, rows: number): Int32Array => {
	const cells = new Int32Array(columns * rows);
	for (let row = 0; row < rows; row++) {
		const latitude = 90 - ((row + 0.5) * 180) / rows;
		for (let column = 0; column < columns; column++) {
			const longitude = -180 + ((column + 0.5) * 360) / columns;
			cells[row * columns + column] = cellAt(
				grid,
				latLonToDirection(latitude, longitude),
			);
		}
	}
	return cells;
};

/** {@link sampleCells} by grid and size, as "n columns rows". */
const SAMPLE_CACHE = new Map<string, Int32Array>();

/** {@link sampleCells}, built once for each grid and size and then shared. */
const cachedSampleCells = (
	grid: Grid,
	columns: number,
	rows: number,
): Int32Array => {
	const key = `${grid.n} ${columns} ${rows}`;
	let cells = SAMPLE_CACHE.get(key);
	if (cells === undefined) {
		cells = sampleCells(grid, columns, rows);
		SAMPLE_CACHE.set(key, cells);
	}
	return cells;
};

/**
 * An image of one pixel a degree, from the north-west, each pixel the
 * colour of the cell under its middle.
 */
const cellImage = (
	grid: Grid,
	colourOf: (cell: number) => readonly number[],
): string => {
	const cells = cachedSampleCells(grid, IMAGE_COLUMNS, IMAGE_ROWS);
	const pixels = new Uint8Array(3 * cells.length);
	for (let index = 0; index < cells.length; index++) {
		pixels.set(colourOf(cells[index] as number), 3 * index);
	}
	return pngDataUrl({ width: IMAGE_COLUMNS, height: IMAGE_ROWS, pixels });
};

/**
 * The coast as an SVG path: the line between land and sea, found by
 * marching squares over the land and sea at the middle of each degree.
 *
 * @remarks
 * Each square of four neighbouring points that are not all land or all sea
 * is crossed by the coast between the middles of its sides whose two ends
 * differ. Where only opposite corners are land, the coast cuts off the
 * north-west and south-east corners. The squares across 180° are drawn at
 * both edges of the map and the drawing clipped to it, so the coast runs on
 * across the edge. The pieces are joined into lines and each straight run
 * kept only by its ends. Every point lies on a multiple of half a degree.
 */
const coastPath = (world: World, grid: Grid): string => {
	const cells = cachedSampleCells(grid, IMAGE_COLUMNS, IMAGE_ROWS);
	const land = new Uint8Array(cells.length);
	for (let index = 0; index < cells.length; index++) {
		land[index] =
			(world.elevation[cells[index] as number] as number) > world.seaLevel
				? 1
				: 0;
	}
	const isLand = (row: number, column: number): number =>
		land[
			row * IMAGE_COLUMNS + ((column + IMAGE_COLUMNS) % IMAGE_COLUMNS)
		] as number;
	// The drawing's units from one sample point to the next, and half that.
	const step = (360 / IMAGE_COLUMNS) * UNITS_PER_DEGREE;
	const half = step / 2;

	// Each piece of coast joins two points, kept as "x y" keys.
	const pieces: [string, string][] = [];
	for (let row = 0; row < IMAGE_ROWS - 1; row++) {
		for (let column = -1; column < IMAGE_COLUMNS; column++) {
			const northWest = isLand(row, column);
			const northEast = isLand(row, column + 1);
			const southEast = isLand(row + 1, column + 1);
			const southWest = isLand(row + 1, column);
			if (
				northWest === northEast &&
				northEast === southEast &&
				southEast === southWest
			) {
				continue;
			}
			// The north-west point, in the middle of its degree.
			const x = step * (column + 0.5);
			const y = step * (row + 0.5);
			const point = (across: number, down: number): string =>
				`${short(x + across)} ${short(y + down)}`;
			const top = point(half, 0);
			const right = point(step, half);
			const bottom = point(half, step);
			const left = point(0, half);
			const crossings: string[] = [];
			if (northWest !== northEast) {
				crossings.push(top);
			}
			if (northEast !== southEast) {
				crossings.push(right);
			}
			if (southEast !== southWest) {
				crossings.push(bottom);
			}
			if (southWest !== northWest) {
				crossings.push(left);
			}
			if (crossings.length === 2) {
				pieces.push([crossings[0] as string, crossings[1] as string]);
			} else {
				pieces.push([top, left], [bottom, right]);
			}
		}
	}

	const ends = new Map<string, number[]>();
	for (const [index, piece] of pieces.entries()) {
		for (const point of piece) {
			const list = ends.get(point);
			if (list === undefined) {
				ends.set(point, [index]);
			} else {
				list.push(index);
			}
		}
	}
	const used = new Uint8Array(pieces.length);
	/** Walks on from a point along unused pieces; gives the points passed. */
	const walk = (from: string): string[] => {
		const points: string[] = [];
		let point = from;
		for (;;) {
			const next = (ends.get(point) ?? []).find((index) => used[index] === 0);
			if (next === undefined) {
				return points;
			}
			used[next] = 1;
			const [a, b] = pieces[next] as [string, string];
			point = a === point ? b : a;
			points.push(point);
		}
	};
	const lines: string[] = [];
	// Open lines first, from an end that only one piece reaches, so that no
	// line starts in its middle; closed loops after.
	const starts = [
		...[...ends].filter(([, list]) => list.length === 1).map(([key]) => key),
		...ends.keys(),
	];
	for (const start of starts) {
		const points = [start, ...walk(start)];
		if (points.length < 2) {
			continue;
		}
		const xy = points.map((key) => key.split(' ').map(Number));
		let command = `M${xy[0]?.[0]} ${xy[0]?.[1]}`;
		let stepX = 0;
		let stepY = 0;
		let runX = 0;
		let runY = 0;
		const steps: string[] = [];
		for (let index = 1; index < xy.length; index++) {
			const dx = (xy[index]?.[0] as number) - (xy[index - 1]?.[0] as number);
			const dy = (xy[index]?.[1] as number) - (xy[index - 1]?.[1] as number);
			if (index > 1 && dx === stepX && dy === stepY) {
				runX += dx;
				runY += dy;
				continue;
			}
			if (index > 1) {
				steps.push(`${short(runX)} ${short(runY)}`);
			}
			stepX = dx;
			stepY = dy;
			runX = dx;
			runY = dy;
		}
		steps.push(`${short(runX)} ${short(runY)}`);
		command += `l${steps.join(' ')}`;
		lines.push(command.replace(/ -/g, '-'));
	}
	return lines.join('');
};

/** The latitudes and longitudes of the thin lines, short of the edges. */
const graticuleLines = (extent: number): number[] => {
	const lines: number[] = [];
	for (
		let value = -extent + GRATICULE_STEP_DEG;
		value < extent;
		value += GRATICULE_STEP_DEG
	) {
		lines.push(value);
	}
	return lines;
};

/** Thin lines every {@link GRATICULE_STEP_DEG}. */
const graticule = (): string => {
	const lines: string[] = [];
	for (const latitude of graticuleLines(90)) {
		const y = (90 - latitude) * UNITS_PER_DEGREE;
		lines.push(`M0 ${y}h${MAP_WIDTH}`);
	}
	for (const longitude of graticuleLines(180)) {
		const x = (longitude + 180) * UNITS_PER_DEGREE;
		lines.push(`M${x} 0v${MAP_HEIGHT}`);
	}
	return `<path d="${lines.join('')}" fill="none" stroke="#000" stroke-opacity=".22" stroke-width=".8"/>`;
};

/** The arrows of a month's wind, one at each sample point that is not calm. */
const arrows = (grid: Grid, month: WindMonth): string[] => {
	const columns = 360 / ARROW_SPACING_DEG;
	const rows = 180 / ARROW_SPACING_DEG;
	const cells = cachedSampleCells(grid, columns, rows);
	const paths: string[] = [];
	for (let row = 0; row < rows; row++) {
		for (let column = 0; column < columns; column++) {
			const cell = cells[row * columns + column] as number;
			const east = month.east[cell] as number;
			const north = month.north[cell] as number;
			const speed = Math.hypot(east, north);
			const length = arrowLength(speed);
			if (length === null) {
				continue;
			}
			// East is to the right and north is up, so the drawing's y runs
			// against the northward wind.
			paths.push(
				`<path d="${arrowPath(
					(column + 0.5) * ARROW_SPACING_DEG * UNITS_PER_DEGREE,
					(row + 0.5) * ARROW_SPACING_DEG * UNITS_PER_DEGREE,
					(east / speed) * length,
					(-north / speed) * length,
				)}"/>`,
			);
		}
	}
	return paths;
};

/** How every arrow is drawn: one dark line, its head filled. */
const ARROW_STYLE = `fill="#111" stroke="#111" stroke-width="${ARROW_STROKE_UNITS}" stroke-linejoin="round"`;

/** The key below the map: the pressure's colour bar and reference arrows. */
const key = (top: number): string => {
	const barWidth = 360;
	const barTop = top + 24;
	const barHeight = 12;
	const span = PRESSURE_HIGH_HPA - PRESSURE_LOW_HPA;
	const ramp = new Uint8Array(3 * span);
	for (let step = 0; step < span; step++) {
		ramp.set(pressureColour(PRESSURE_LOW_HPA + step + 0.5), 3 * step);
	}
	const xOf = (hectopascals: number): number =>
		LEFT + ((hectopascals - PRESSURE_LOW_HPA) / span) * barWidth;
	const parts = [
		`<text x="${LEFT}" y="${top + 16}">Sea-level pressure, hPa</text>`,
		`<image href="${pngDataUrl({ width: span, height: 1, pixels: ramp })}" x="${LEFT}" y="${barTop}" width="${barWidth}" height="${barHeight}" preserveAspectRatio="none"/>`,
		`<rect x="${LEFT}" y="${barTop}" width="${barWidth}" height="${barHeight}" fill="none" stroke="currentColor" stroke-width=".8"/>`,
	];
	for (const label of PRESSURE_LABELS) {
		const x = short(xOf(label));
		parts.push(
			`<path d="M${x} ${barTop + barHeight}v4" stroke="currentColor"/>`,
			`<text x="${x}" y="${barTop + barHeight + 21}" text-anchor="middle">${label}</text>`,
		);
	}
	// The reference arrows, at the map's own scale, lie on a patch of the
	// map's middle colour, so that they read as they do on the map on a
	// dark page too.
	const arrowX = LEFT + barWidth + 60;
	const slot = 96;
	const middle = `rgb(${MIDDLE_COLOUR.join(',')})`;
	parts.push(
		`<text x="${arrowX}" y="${top + 16}">Wind 10 m above the surface</text>`,
		`<rect x="${arrowX}" y="${barTop - 3}" width="${slot * REFERENCE_SPEEDS_M_PER_S.length}" height="${barHeight + 8}" fill="${middle}" stroke="currentColor" stroke-width=".8"/>`,
	);
	const arrowsInKey: string[] = [];
	for (const [index, speed] of REFERENCE_SPEEDS_M_PER_S.entries()) {
		const length = arrowLength(speed) as number;
		const x = arrowX + index * slot + 8;
		arrowsInKey.push(
			`<path d="${arrowPath(x + length / 2, barTop + barHeight / 2, length, 0)}"/>`,
		);
		parts.push(
			`<text x="${x + ARROW_MAX_UNITS + 8}" y="${barTop + barHeight / 2 + 6}" fill="#111">${speed} m/s</text>`,
		);
	}
	parts.push(
		`<g class="key-arrows" ${ARROW_STYLE}>${arrowsInKey.join('')}</g>`,
	);
	return parts.join('');
};

/**
 * One map of a world's month as an SVG drawing.
 *
 * @remarks
 * Under everything lies the pressure, as an embedded PNG of one pixel a
 * degree, each pixel the colour of the cell under its middle: white at
 * {@link PRESSURE_MIDDLE_HPA}, blue below it down to
 * {@link PRESSURE_LOW_HPA}, red above it up to {@link PRESSURE_HIGH_HPA},
 * on the same scale on every map so that maps can be compared. Over it lie
 * thin lines every 30° of latitude and longitude, the coast (the line
 * between cells above the world's sea level and those at or below it), and
 * an arrow for the wind of the cell under each point of a
 * {@link ARROW_SPACING_DEG}° grid offset by half a step from the edges,
 * centred on the point, pointing the way the wind blows, with a length
 * from {@link arrowLength} and a head {@link HEAD_SHARE} of that. A map
 * with no month shows the land in a pale sand and the sea in a pale blue
 * under the coast, and has no key.
 *
 * Text uses the page's own colour, so the key reads on a light or a dark
 * page; the map's own colours are fixed.
 *
 * @param options - What to draw. Not changed.
 * @returns An `<svg>` element, well-formed XML, with a `<title>`.
 * @throws RangeError if a field of the month does not hold one value per
 * cell of the world's grid.
 */
export const drawMap = (options: MapOptions): string => {
	const { title, world, month } = options;
	const grid = getGrid(world.resolution);
	if (month !== undefined) {
		for (const part of ['east', 'north', 'pressure'] as const) {
			if (month[part].length !== grid.cellCount) {
				throw new RangeError(
					`A map's ${part} field must hold ${grid.cellCount} values; got ${month[part].length}`,
				);
			}
		}
	}
	const width = LEFT + MAP_WIDTH + RIGHT;
	const height =
		TOP + MAP_HEIGHT + LABELS_BELOW + (month === undefined ? 0 : KEY_HEIGHT);

	const inner: string[] = [];
	if (month === undefined) {
		const colourOf = (cell: number): readonly number[] =>
			(world.elevation[cell] as number) > world.seaLevel
				? LAND_COLOUR
				: SEA_COLOUR;
		inner.push(
			`<image class="land-sea" href="${cellImage(grid, colourOf)}" width="${MAP_WIDTH}" height="${MAP_HEIGHT}" preserveAspectRatio="none"/>`,
		);
	} else {
		const { pressure } = month;
		inner.push(
			`<image class="pressure" href="${cellImage(grid, (cell) => pressureColour(pressure[cell] as number))}" width="${MAP_WIDTH}" height="${MAP_HEIGHT}" preserveAspectRatio="none"/>`,
		);
	}
	inner.push(graticule());
	const coast = coastPath(world, grid);
	if (coast !== '') {
		inner.push(
			`<path class="coast" d="${coast}" fill="none" stroke="#222" stroke-width="1.3" stroke-linejoin="round"/>`,
		);
	}
	if (month !== undefined) {
		inner.push(
			`<g class="arrows" ${ARROW_STYLE}>${arrows(grid, month).join('')}</g>`,
		);
	}

	const labels: string[] = [];
	for (const latitude of graticuleLines(90)) {
		labels.push(
			`<text x="${LEFT - 6}" y="${TOP + (90 - latitude) * UNITS_PER_DEGREE + 6}" text-anchor="end">${degreesLabel(latitude, 'N', 'S')}</text>`,
		);
	}
	// Every other line of longitude, so that the labels do not crowd.
	for (const longitude of graticuleLines(180).filter(
		(_, index) => index % 2 === 1,
	)) {
		labels.push(
			`<text x="${LEFT + (longitude + 180) * UNITS_PER_DEGREE}" y="${TOP + MAP_HEIGHT + 21}" text-anchor="middle">${degreesLabel(longitude, 'E', 'W')}</text>`,
		);
	}

	return [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" font-family="system-ui, sans-serif" font-size="${FONT_SIZE}" fill="currentColor">`,
		`<title>${escapeText(title)}</title>`,
		`<svg x="${LEFT}" y="${TOP}" width="${MAP_WIDTH}" height="${MAP_HEIGHT}" viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}">${inner.join('')}</svg>`,
		`<rect x="${LEFT}" y="${TOP}" width="${MAP_WIDTH}" height="${MAP_HEIGHT}" fill="none" stroke="currentColor" stroke-width=".8"/>`,
		labels.join(''),
		month === undefined ? '' : key(TOP + MAP_HEIGHT + LABELS_BELOW),
		'</svg>',
	].join('');
};
