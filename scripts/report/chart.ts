/**
 * A small line chart of a quantity by latitude, as an SVG drawing to put
 * inline in a page: the wind report's zonal means.
 */

import { degreesLabel, escapeText, figure, short } from './markup';

/** One line of a chart. */
export type ChartSeries = {
	/** What the line is, for the legend. */
	readonly label: string;
	/**
	 * One value for each of the chart's latitudes; null where there is
	 * none, which leaves a gap in the line.
	 */
	readonly values: readonly (number | null)[];
	/** A CSS colour; `currentColor` follows the page's text. */
	readonly colour: string;
	/** Whether the line is dashed, to tell it apart without colour. */
	readonly dashed?: boolean;
};

/** What a chart shows. */
export type ChartOptions = {
	/** What the chart shows, for a reader that cannot see it. */
	readonly title: string;
	/** The latitudes of the values, in degrees, from the south. */
	readonly latitudes: readonly number[];
	/** The quantity and its units, for the vertical axis. */
	readonly quantity: string;
	/**
	 * The lines, in the order of the legend. The legend is one row above
	 * the plot: two series fit when their labels come to no more than 48
	 * characters together; longer labels run past the right edge.
	 */
	readonly series: readonly ChartSeries[];
};

const WIDTH = 560;
const HEIGHT = 300;
const LEFT = 52;
const RIGHT = 14;
const TOP = 40;
const BOTTOM = 44;
const FONT_SIZE = 14;

/** A legend entry's line and the space after it, in units of the drawing. */
const LEGEND_LINE = 30;
/**
 * The width allowed for each character of a legend's label: a little more
 * than the average at {@link FONT_SIZE}, so that entries do not overlap.
 */
const LEGEND_CHARACTER = 8;
/** The space between one legend entry and the next. */
const LEGEND_GAP = 24;

/** A step for the vertical axis's labels: 1, 2 or 5 times a power of ten. */
const niceStep = (span: number): number => {
	const rough = span / 6;
	const power = 10 ** Math.floor(Math.log10(rough));
	for (const multiple of [1, 2, 5, 10]) {
		if (multiple * power >= rough) {
			return multiple * power;
		}
	}
	return 10 * power;
};

/**
 * A line chart of values by latitude, south at the left.
 *
 * @remarks
 * The vertical axis runs over whole steps of 1, 2 or 5 times a power of
 * ten that take in every value and zero, which is drawn as a stronger
 * line. With no values at all it runs from -1 to 1.
 *
 * @param options - What to draw. Not changed.
 * @returns An `<svg>` element, well-formed XML, with a `<title>`.
 * @throws RangeError if a series does not hold one value per latitude.
 */
export const drawZonalChart = (options: ChartOptions): string => {
	const { title, latitudes, quantity, series } = options;
	for (const line of series) {
		if (line.values.length !== latitudes.length) {
			throw new RangeError(
				`The series ${line.label} needs ${latitudes.length} values; got ${line.values.length}`,
			);
		}
	}
	const values = series.flatMap((line) =>
		line.values.filter((value): value is number => value !== null),
	);
	const low = Math.min(0, ...values);
	const high = Math.max(0, ...values);
	const step = niceStep(high > low ? high - low : 2);
	const bottom = values.length === 0 ? -1 : Math.floor(low / step) * step;
	const top =
		values.length === 0
			? 1
			: Math.max(bottom + step, Math.ceil(high / step) * step);

	const plotWidth = WIDTH - LEFT - RIGHT;
	const plotHeight = HEIGHT - TOP - BOTTOM;
	const xOf = (latitude: number): number =>
		LEFT + ((latitude + 90) / 180) * plotWidth;
	const yOf = (value: number): number =>
		TOP + ((top - value) / (top - bottom)) * plotHeight;

	const parts: string[] = [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" font-family="system-ui, sans-serif" font-size="${FONT_SIZE}" fill="currentColor">`,
		`<title>${escapeText(title)}</title>`,
	];
	const grid: string[] = [];
	for (let latitude = -90; latitude <= 90; latitude += 30) {
		const x = short(xOf(latitude));
		grid.push(`M${x} ${TOP}v${plotHeight}`);
		const label = degreesLabel(latitude, 'N', 'S');
		parts.push(
			`<text x="${x}" y="${HEIGHT - BOTTOM + 18}" text-anchor="middle">${label}</text>`,
		);
	}
	// As many decimal places as the step needs: none for 1, 2 or 5, one
	// for 0.1, 0.2 or 0.5, and so on.
	const digits = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
	const count = Math.round((top - bottom) / step);
	for (let index = 0; index <= count; index++) {
		const value = bottom + index * step;
		const y = short(yOf(value));
		if (Math.abs(value) > step / 1000) {
			grid.push(`M${LEFT} ${y}h${plotWidth}`);
		}
		parts.push(
			`<text x="${LEFT - 6}" y="${short(yOf(value) + 5)}" text-anchor="end">${figure(value, digits)}</text>`,
		);
	}
	parts.push(
		`<path d="${grid.join('')}" fill="none" stroke="currentColor" stroke-opacity=".2"/>`,
		`<path d="M${LEFT} ${short(yOf(0))}h${plotWidth}" stroke="currentColor" stroke-opacity=".6"/>`,
		`<rect x="${LEFT}" y="${TOP}" width="${plotWidth}" height="${plotHeight}" fill="none" stroke="currentColor" stroke-opacity=".6"/>`,
		`<text x="${LEFT + plotWidth / 2}" y="${HEIGHT - 6}" text-anchor="middle">Latitude</text>`,
	);

	let legendX = LEFT;
	for (const line of series) {
		const dash = line.dashed === true ? ' stroke-dasharray="6 4"' : '';
		const segments: string[] = [];
		let drawing = false;
		for (const [index, value] of line.values.entries()) {
			if (value === null) {
				drawing = false;
				continue;
			}
			const point = `${short(xOf(latitudes[index] as number))} ${short(yOf(value))}`;
			segments.push(drawing ? `L${point}` : `M${point}`);
			drawing = true;
		}
		parts.push(
			`<path d="${segments.join('')}" fill="none" stroke="${escapeText(line.colour)}" stroke-width="2"${dash}/>`,
			`<path d="M${legendX} ${TOP - 14}h24" stroke="${escapeText(line.colour)}" stroke-width="2"${dash}/>`,
			`<text x="${legendX + LEGEND_LINE}" y="${TOP - 9}">${escapeText(line.label)}</text>`,
		);
		legendX += LEGEND_LINE + LEGEND_CHARACTER * line.label.length + LEGEND_GAP;
	}
	parts.push(
		`<text x="${LEFT}" y="${TOP - 26}">${escapeText(quantity)}</text>`,
		'</svg>',
	);
	return parts.join('');
};
