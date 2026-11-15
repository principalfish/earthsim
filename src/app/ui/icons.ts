/**
 * The page's icons, each drawn in code as a small SVG on a square of
 * {@link ICON_SIZE} units: outlines of one width with rounded ends and
 * corners, in the colour of the text around them, so that an icon follows
 * whatever colour its button is given. Every icon is decorative, hidden
 * from screen readers, and stands beside or in place of words that name
 * what it is for.
 */

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/** The side of the square every icon is drawn on, in the icon's units. */
export const ICON_SIZE = 24;

/** The width of every icon's outlines, in the icon's units. */
const STROKE_WIDTH = 1.75;

/** One shape of an icon: an SVG element and its attributes. */
type Shape = {
	readonly tag: 'path' | 'circle' | 'rect';
	readonly attributes: Readonly<Record<string, string>>;
};

const path = (d: string, filled = false): Shape => ({
	tag: 'path',
	attributes: filled ? { d, fill: 'currentColor' } : { d },
});

const circle = (cx: number, cy: number, r: number): Shape => ({
	tag: 'circle',
	attributes: { cx: String(cx), cy: String(cy), r: String(r) },
});

const rect = (
	x: number,
	y: number,
	width: number,
	height: number,
	filled = false,
): Shape => ({
	tag: 'rect',
	attributes: {
		x: String(x),
		y: String(y),
		width: String(width),
		height: String(height),
		rx: '1',
		...(filled ? { fill: 'currentColor' } : {}),
	},
});

/**
 * Draws an icon from its shapes, outlined in the current text colour and
 * filled only where a shape asks to be, with that colour.
 *
 * @param name - What the icon shows, as its class names it.
 * @param shapes - What it is drawn with, in drawing order.
 */
const drawIcon = (name: string, shapes: readonly Shape[]): SVGSVGElement => {
	const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
	svg.setAttribute('class', `icon icon--${name}`);
	svg.setAttribute('viewBox', `0 0 ${ICON_SIZE} ${ICON_SIZE}`);
	svg.setAttribute('width', String(ICON_SIZE));
	svg.setAttribute('height', String(ICON_SIZE));
	svg.setAttribute('fill', 'none');
	svg.setAttribute('stroke', 'currentColor');
	svg.setAttribute('stroke-width', String(STROKE_WIDTH));
	svg.setAttribute('stroke-linecap', 'round');
	svg.setAttribute('stroke-linejoin', 'round');
	svg.setAttribute('aria-hidden', 'true');
	for (const shape of shapes) {
		const element = document.createElementNS(SVG_NAMESPACE, shape.tag);
		for (const [attribute, value] of Object.entries(shape.attributes)) {
			element.setAttribute(attribute, value);
		}
		svg.append(element);
	}
	return svg;
};

/** Terrain: a high peak and a lower one beside it, standing on the ground. */
export const terrainIcon = (): SVGSVGElement =>
	drawIcon('terrain', [path('M3 19 9 7.5l4.25 7 2.5-3.5L21 19Z')]);

/** Temperature: a thermometer, its bulb at the foot and a reading in it. */
export const temperatureIcon = (): SVGSVGElement =>
	drawIcon('temperature', [
		path('M10 13.75V5a2 2 0 0 1 4 0v8.75a4 4 0 1 1-4 0Z'),
		path('M12 9v8.25'),
	]);

/** Pressure: a gauge's dial, its needle and the needle's hub. */
export const pressureIcon = (): SVGSVGElement =>
	drawIcon('pressure', [
		path('M3 16a9 9 0 0 1 18 0'),
		path('m12 16 4.5-5'),
		circle(12, 16, 1.5),
	]);

/** Winds: three streams of air, each curling over at its end. */
export const windsIcon = (): SVGSVGElement =>
	drawIcon('winds', [
		path('M3 8h9.5a2.5 2.5 0 1 0-2.5-2.5'),
		path('M3 12h15.5a2.5 2.5 0 1 1-2.5 2.5'),
		path('M3 16h7.5a2.5 2.5 0 1 1-2.5 2.5'),
	]);

/** Sunlight: the sun, with eight rays around it. */
export const sunlightIcon = (): SVGSVGElement =>
	drawIcon('sunlight', [
		circle(12, 12, 4),
		path(
			'M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.64 5.64 7.4 7.4M16.6 16.6l1.76 1.76M5.64 18.36 7.4 16.6M16.6 7.4l1.76-1.76',
		),
	]);

/** Grid: a square divided into three rows and three columns of cells. */
export const gridIcon = (): SVGSVGElement =>
	drawIcon('grid', [
		rect(4, 4, 16, 16),
		path('M4 9.33h16M4 14.67h16M9.33 4v16M14.67 4v16'),
	]);

/** Pause: two upright bars, filled. */
export const pauseIcon = (): SVGSVGElement =>
	drawIcon('pause', [rect(6.5, 5, 3.5, 14, true), rect(14, 5, 3.5, 14, true)]);

/** Play: a triangle pointing right, filled. */
export const playIcon = (): SVGSVGElement =>
	drawIcon('play', [path('M7.5 4.75 19 12 7.5 19.25Z', true)]);
