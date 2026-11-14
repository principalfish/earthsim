/**
 * The key to the wind arrows, laid over the globe while the winds are
 * shown: arrows of a few speeds, drawn as those on the globe are and as
 * long as they are where they face the camera; on the measured Earth, two
 * lines saying how far the simulated winds are from the observed; and a
 * line saying where the winds on hand stand, in the words the temperature
 * legend uses.
 */

import {
	DIRECTION_MIN_SPEED_M_PER_S,
	DIRECTION_TOLERANCE_DEG,
	type WindErrorFigures,
} from '../../core/index';
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
import {
	convertSpeed,
	DEFAULT_WIND_UNIT,
	type WindUnit,
	wholeSpeed,
} from '../windUnits';
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
 * A speed as the key writes it, a whole number in a unit, such as `5 m/s`,
 * `18 km/h` or `11 mph`; or, at and above {@link ARROW_CAP_SPEED}, every
 * speed of which draws the same arrow, the cap and more: `10+ m/s`,
 * `36+ km/h` or `22+ mph`.
 *
 * @param speed - The speed, in metres a second.
 * @param unit - The unit to write it in; m/s when left out.
 */
export const formatSpeed = (
	speed: number,
	unit: WindUnit = DEFAULT_WIND_UNIT,
): string => {
	const capped = speed >= ARROW_CAP_SPEED;
	const whole = wholeSpeed(capped ? ARROW_CAP_SPEED : speed, unit);
	return `${whole}${capped ? '+' : ''} ${unit}`;
};

/** What the key says while the observed winds load. */
export const OBSERVED_WINDS_LOADING_TEXT = 'Loading observed winds';

/** What the key says when the observed winds could not be loaded. */
export const OBSERVED_WINDS_FAILED_TEXT = 'Observed winds could not be loaded';

/**
 * What the tooltip of the key's line of how far off the winds are says:
 * exactly what the figure is.
 */
export const WIND_OFF_BY_TITLE =
	'The area-weighted root-mean-square difference between the simulated and the observed wind, as vectors.';

/**
 * What the tooltip of the key's line of how often the winds point right
 * says: exactly what the figure is.
 */
export const WIND_DIRECTION_TITLE = `The share of the surface, where the observed wind is at least ${DIRECTION_MIN_SPEED_M_PER_S} m/s, on which the simulated wind points within ${DIRECTION_TOLERANCE_DEG}° of the observed.`;

/**
 * How far the simulated winds are off as the key writes it, such as `Off
 * by 3.8 m/s on average`, `Off by 13.7 km/h on average` or `Off by 8.5 mph
 * on average`: to one decimal of the unit, a half rounded upwards.
 *
 * @param speed - The root-mean-square vector difference, in metres a
 * second.
 * @param unit - The unit to write it in.
 */
export const formatWindOffBy = (speed: number, unit: WindUnit): string =>
	`Off by ${(Math.round(convertSpeed(speed, unit) * 10) / 10).toFixed(1)} ${unit} on average`;

/**
 * How much of the map the simulated winds point right on as the key writes
 * it, such as `Direction right on 61% of the map`: a whole percentage, a
 * half rounded upwards.
 *
 * @param share - The share, from 0 to 1.
 */
export const formatWindDirectionRight = (share: number): string =>
	`Direction right on ${Math.round(share * 100)}% of the map`;

/**
 * The figures the key gives of the simulated winds against the observed,
 * as {@link WindErrorFigures} holds them.
 */
export type WindKeyFigures = Pick<
	WindErrorFigures,
	'rmsVectorDifference' | 'directionShare'
>;

/** What the key shows at one moment. */
export type WindKeyContent = {
	/**
	 * What the key says of the winds on hand, or null when they describe
	 * the world as it is.
	 */
	readonly status: string | null;
	/**
	 * How far the simulated winds are from the observed, for the key's two
	 * lines under its arrows; left out when there are none to give.
	 */
	readonly figures?: WindKeyFigures;
};

/**
 * What the key shows for the winds layer as it stands.
 *
 * @param layer - Where the winds stand, as the store has them or as
 * `windsStatus` words them for showing.
 * @returns No line for current winds; {@link LEGEND_OUT_OF_DATE_TEXT},
 * {@link WINDS_CALCULATING_TEXT}, {@link LEGEND_EMPTY_TEXT} or
 * {@link WINDS_UNAVAILABLE_TEXT} for the others, the arrows on hand, if
 * any, staying on the globe meanwhile.
 */
export const windKeyContent = (
	layer: Pick<WindsLayer, 'status'>,
): WindKeyContent => {
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
	/**
	 * Writes the arrows' speeds, and how far off the winds are, in another
	 * unit. The arrows stay as they are, drawn for the same speeds.
	 */
	setUnit(unit: WindUnit): void;
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
 * shaped by {@link arrowShape} as those on the globe are and their speeds
 * written by {@link formatSpeed} in the unit given; under them, while it
 * is given figures, a line of how far off the simulated winds are, as
 * {@link formatWindOffBy} writes it in the same unit, and one of how much
 * of the map they point right on, as {@link formatWindDirectionRight}
 * writes it, the second left out when there is no share; each line's
 * tooltip says exactly what its figure is, and neither takes any room
 * while there are no figures. Under them all is the status line, a polite
 * live region rewritten only when its words change, as the legend's is,
 * and kept in place, empty, while there is nothing to say.
 *
 * @param unit - The unit the speeds are written in at first; m/s when left
 * out.
 * @returns The key.
 */
export const createWindKey = (unit: WindUnit = DEFAULT_WIND_UNIT): WindKey => {
	const key = createElement('div', 'wind-key');
	key.hidden = true;
	const caption = createElement('p', 'wind-key__caption');
	caption.textContent = WIND_KEY_CAPTION;
	key.append(caption);
	/** Each arrow's label, with the speed it is drawn for. */
	const labels: { readonly speed: number; readonly label: HTMLElement }[] = [];
	for (const speed of WIND_KEY_SPEEDS) {
		const shape = arrowShape(speed);
		if (shape === null) {
			continue;
		}
		const row = createElement('div', 'wind-key__row');
		const label = createElement('span', 'wind-key__label');
		label.textContent = formatSpeed(speed, unit);
		labels.push({ speed, label });
		row.append(drawArrow(shape) as unknown as HTMLElement, label);
		key.append(row);
	}
	const offBy = createElement('p', 'wind-key__figure');
	offBy.title = WIND_OFF_BY_TITLE;
	offBy.hidden = true;
	const direction = createElement('p', 'wind-key__figure');
	direction.title = WIND_DIRECTION_TITLE;
	direction.hidden = true;
	key.append(offBy, direction);
	const status = createElement('p', 'wind-key__status');
	status.setAttribute('aria-live', 'polite');
	key.append(status);
	let shownUnit = unit;
	/** The figures the key last showed, or null for none. */
	let figures: WindKeyFigures | null = null;
	/** Writes the figures' lines, in the unit the key writes speeds in. */
	const writeFigures = (): void => {
		offBy.hidden = figures === null;
		offBy.textContent =
			figures === null
				? ''
				: formatWindOffBy(figures.rmsVectorDifference, shownUnit);
		const share = figures?.directionShare ?? null;
		direction.hidden = share === null;
		direction.textContent =
			share === null ? '' : formatWindDirectionRight(share);
	};
	return {
		element: key,
		show: (content) => {
			key.hidden = content === null;
			if (content === null) {
				return;
			}
			figures = content.figures ?? null;
			writeFigures();
			const text = content.status ?? '';
			if (status.textContent !== text) {
				status.textContent = text;
			}
		},
		setUnit: (next) => {
			shownUnit = next;
			for (const { speed, label } of labels) {
				label.textContent = formatSpeed(speed, next);
			}
			writeFigures();
		},
	};
};
