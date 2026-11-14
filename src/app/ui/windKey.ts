/**
 * The key to the wind arrows, laid over the globe while the winds are
 * shown: arrows of a few speeds, drawn as those on the globe are and as
 * long as they are where they face the camera, and a line saying where the
 * winds on hand stand, in the words the temperature legend uses.
 */

import {
	ARROW_CAP_SPEED,
	ARROW_EDGE_COLOUR,
	ARROW_EDGE_PX,
	ARROW_FILL_COLOUR,
	type ArrowShape,
	arrowOutline,
	arrowShape,
} from '../globe/wind';
import type { WindsLayer } from '../layers';
import { createElement } from './fields';
import { LEGEND_EMPTY_TEXT, LEGEND_OUT_OF_DATE_TEXT } from './legend';

/**
 * The speeds the key's arrows are drawn for, in metres a second: one
 * halfway and one at the cap, the longest arrow drawn.
 */
export const WIND_KEY_SPEEDS = [ARROW_CAP_SPEED / 2, ARROW_CAP_SPEED] as const;

/** What the key's caption says. */
export const WIND_KEY_CAPTION = 'Surface wind';

/** What the key says while the winds are being worked out. */
export const WINDS_CALCULATING_TEXT = 'Calculating';

/** What the key says once no winds can be worked out. */
export const WINDS_UNAVAILABLE_TEXT = 'Winds unavailable';

/**
 * A speed as the key writes it, such as `5 m/s`, or `10+ m/s` at and above
 * {@link ARROW_CAP_SPEED}, every speed of which draws the same arrow.
 *
 * @param speed - The speed, in metres a second.
 */
export const formatSpeed = (speed: number): string =>
	speed >= ARROW_CAP_SPEED ? `${ARROW_CAP_SPEED}+ m/s` : `${speed} m/s`;

/** What the key shows at one moment. */
export type WindKeyContent = {
	/**
	 * What the key says of the winds on hand, or null when they describe
	 * the world as it is.
	 */
	readonly status: string | null;
};

/**
 * What the key shows for the winds layer as it stands.
 *
 * @param layer - The winds layer, from the store.
 * @returns No line for current winds; {@link LEGEND_OUT_OF_DATE_TEXT},
 * {@link WINDS_CALCULATING_TEXT}, {@link LEGEND_EMPTY_TEXT} or
 * {@link WINDS_UNAVAILABLE_TEXT} for the others, the arrows on hand, if
 * any, staying on the globe meanwhile.
 */
export const windKeyContent = (layer: WindsLayer): WindKeyContent => {
	switch (layer.status) {
		case 'current':
			return { status: null };
		case 'outOfDate':
			return { status: LEGEND_OUT_OF_DATE_TEXT };
		case 'calculating':
			return { status: WINDS_CALCULATING_TEXT };
		case 'empty':
			return { status: LEGEND_EMPTY_TEXT };
		case 'unavailable':
			return { status: WINDS_UNAVAILABLE_TEXT };
	}
};

/** The key on the page. */
export type WindKey = {
	/** The key, to put in its place over the globe. */
	readonly element: HTMLElement;
	/** Shows the content given, or hides the key for null. */
	show(content: WindKeyContent | null): void;
};

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/** A `0xrrggbb` colour as CSS writes it. */
const cssColour = (colour: number): string =>
	`#${colour.toString(16).padStart(6, '0')}`;

/**
 * An arrow pointing right, drawn as the arrows on the globe are: dark, with
 * a light edge of {@link ARROW_EDGE_PX} rounded at the corners, at one CSS
 * pixel to a pixel of the arrow's shape.
 */
const drawArrow = (shape: ArrowShape): SVGSVGElement => {
	const margin = ARROW_EDGE_PX;
	const width = shape.length + 2 * margin;
	const height = 2 * (shape.headHalfWidth + margin);
	const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
	svg.setAttribute('class', 'wind-key__arrow');
	svg.setAttribute('width', String(width));
	svg.setAttribute('height', String(height));
	svg.setAttribute('viewBox', `${-margin} ${-height / 2} ${width} ${height}`);
	svg.setAttribute('aria-hidden', 'true');
	const outline = document.createElementNS(SVG_NAMESPACE, 'polygon');
	outline.setAttribute(
		'points',
		arrowOutline(shape)
			.map(([x, y]) => `${x},${y}`)
			.join(' '),
	);
	outline.setAttribute('fill', cssColour(ARROW_FILL_COLOUR));
	outline.setAttribute('stroke', cssColour(ARROW_EDGE_COLOUR));
	// The stroke is centred on the outline and painted under the fill, so
	// half of it shows outside: the edge's width.
	outline.setAttribute('stroke-width', String(2 * ARROW_EDGE_PX));
	outline.setAttribute('stroke-linejoin', 'round');
	outline.setAttribute('paint-order', 'stroke');
	svg.append(outline);
	return svg;
};

/**
 * Creates the key, hidden until it is given something to show.
 *
 * @remarks
 * An arrow and its speed for each of {@link WIND_KEY_SPEEDS}, the arrows
 * shaped by {@link arrowShape} as those on the globe are, and under them the
 * status line, a polite live region rewritten only when its words change,
 * as the legend's is, and kept in place, empty, while there is nothing to
 * say.
 *
 * @returns The key.
 */
export const createWindKey = (): WindKey => {
	const key = createElement('div', 'wind-key');
	key.hidden = true;
	const caption = createElement('p', 'wind-key__caption');
	caption.textContent = WIND_KEY_CAPTION;
	key.append(caption);
	for (const speed of WIND_KEY_SPEEDS) {
		const shape = arrowShape(speed);
		if (shape === null) {
			continue;
		}
		const row = createElement('div', 'wind-key__row');
		const label = createElement('span', 'wind-key__label');
		label.textContent = formatSpeed(speed);
		row.append(drawArrow(shape) as unknown as HTMLElement, label);
		key.append(row);
	}
	const status = createElement('p', 'wind-key__status');
	status.setAttribute('aria-live', 'polite');
	key.append(status);
	return {
		element: key,
		show: (content) => {
			key.hidden = content === null;
			if (content === null) {
				return;
			}
			const text = content.status ?? '';
			if (status.textContent !== text) {
				status.textContent = text;
			}
		},
	};
};
