/**
 * The cursor readout: a strip over the globe's bottom-left corner saying
 * what lies under the pointer, such as `27.9° N, 86.9° E`, `8,123 m` and,
 * in Temperature view, `July −18 °C`.
 *
 * The writing is in the pure functions at the top. {@link createCursorReadout}
 * follows the pointer and decides when to look again, and
 * {@link createReadoutStrip} is the strip on the page, which only shows what
 * it is told.
 */

import {
	cellAt,
	directionToLatLon,
	getGrid,
	type Vec3,
	type World,
} from '../../core/index';
import type { Globe, WindowPoint } from '../globe/renderer';
import {
	MONTH_NAMES,
	TEMPERATURE_VIEW_LABELS,
	type TemperatureSource,
	type TemperatureView,
} from '../view';
import { createElement } from './fields';
import type { ShownTemperature } from './layerPanel';

/**
 * What the readout says beside a temperature that is not the current
 * result as chosen, as the legend marks its scale out of date.
 */
export const READOUT_OUT_OF_DATE_TEXT = 'out of date';

/** A whole number with its digits grouped in threes, never `-0`. */
const groupedWhole = (value: number): string =>
	Math.round(Math.abs(value)).toLocaleString('en-GB');

/** A number of degrees to one decimal, from tenths, such as `27.9°`. */
const degreesOf = (tenths: number): string => `${(tenths / 10).toFixed(1)}°`;

/**
 * A position as the readout writes it, such as `27.9° N, 86.9° E`.
 *
 * @remarks
 * Each coordinate is rounded to a tenth of a degree first, and its letter
 * follows from what it was rounded to. A latitude that rounds to 0.0 is
 * written `N`, and a longitude that rounds to 0.0 or to 180.0, on the prime
 * meridian or the date line, is written `E`, so that every position has
 * one text and none reads `0.0° S`. Where the latitude rounds to 90.0, at
 * a pole, longitude has no meaning and is left out: `90.0° S`.
 *
 * @param latitudeDeg - Latitude in degrees, -90 to 90, north positive.
 * @param longitudeDeg - Longitude in degrees, -180 to 180, east positive.
 */
export const formatLatLon = (
	latitudeDeg: number,
	longitudeDeg: number,
): string => {
	const latitudeTenths = Math.round(Math.abs(latitudeDeg) * 10);
	const latitude = `${degreesOf(latitudeTenths)} ${latitudeDeg < 0 && latitudeTenths > 0 ? 'S' : 'N'}`;
	if (latitudeTenths >= 900) {
		return latitude;
	}
	const longitudeTenths = Math.round(Math.abs(longitudeDeg) * 10);
	const west =
		longitudeDeg < 0 && longitudeTenths > 0 && longitudeTenths < 1800;
	return `${latitude}, ${degreesOf(longitudeTenths)} ${west ? 'W' : 'E'}`;
};

/**
 * An elevation as the readout writes it, measured from the sea level: on
 * land the height above it, such as `1,234 m`, and at sea the depth below
 * it, such as `3,400 m deep`.
 *
 * @remarks
 * Land is what stands strictly above the sea level, so a place exactly at
 * it is sea: `0 m deep`. Metres are whole, with the digits grouped in
 * threes.
 *
 * @param heightM - Height above the sea level in metres; negative below it.
 */
export const formatElevation = (heightM: number): string =>
	heightM > 0
		? `${groupedWhole(heightM)} m`
		: `${groupedWhole(heightM)} m deep`;

/**
 * What the readout calls the field a temperature view shows: the month's
 * name for the Month view, and the view's own name for the others.
 *
 * @param view - What of the year is shown.
 * @param month - The month shown, from January at 0; read only for the
 * Month view.
 */
const fieldName = (view: TemperatureView, month: number): string =>
	view === 'month' ? (MONTH_NAMES[month] ?? '') : TEMPERATURE_VIEW_LABELS[view];

/**
 * A value of the temperature field on screen as the readout writes it,
 * named by what the field is: `July 18 °C`, `Annual average 14 °C`,
 * `Warmest month 27 °C`, `Coldest month −31 °C` or `Seasonal range 12 °C`;
 * and by where it comes from, when that is not the simulation: `July
 * 21 °C observed`, or `July +2 °C difference` for the simulated less the
 * observed.
 *
 * @remarks
 * The value is rounded to a whole degree, a half upwards, and written with
 * its digits grouped in threes and a true minus sign; a value that rounds
 * to zero is `0`, never `−0`. A difference is signed both ways, `+2` above
 * zero and `−3` below, and one that rounds to zero is `0`, never `+0`. The
 * seasonal range is named as a range, so that it does not read as a
 * temperature: it is the difference between the warmest and the coldest
 * month.
 *
 * @param value - The value in degrees Celsius.
 * @param view - What of the year the field is.
 * @param month - The month the field is for the Month view, from January
 * at 0; read only for that view.
 * @param source - Where the field comes from; the simulation when left
 * out.
 */
export const formatTemperature = (
	value: number,
	view: TemperatureView,
	month: number,
	source: TemperatureSource = 'simulated',
): string => {
	// Rounded once, so that the sign and the digits agree: −0.5 rounds to
	// zero, and is written `0`.
	const rounded = Math.round(value);
	const positive = source === 'difference' && rounded > 0 ? '+' : '';
	const sign = rounded < 0 ? '−' : positive;
	const text = `${fieldName(view, month)} ${sign}${groupedWhole(rounded)} °C`;
	return source === 'simulated' ? text : `${text} ${source}`;
};

/** The temperature at the place under the pointer, from what is on screen. */
export type ReadoutTemperature = {
	/** The value of the field on screen at the place, in degrees Celsius. */
	readonly value: number;
	/** What of the year the field is. */
	readonly view: TemperatureView;
	/** The month the field is for the Month view, from January at 0. */
	readonly month: number;
	/** Where the field comes from. */
	readonly source: TemperatureSource;
	/** Whether the field is the one chosen and up to date. */
	readonly current: boolean;
};

/** What the readout says of one place. */
export type ReadoutParts = {
	/** Latitude of the place in degrees, north positive. */
	readonly latitudeDeg: number;
	/** Longitude of the place in degrees, east positive. */
	readonly longitudeDeg: number;
	/** Height of the place above the sea level in metres; negative below. */
	readonly heightM: number;
	/** The temperature on screen at the place, or null for none. */
	readonly temperature: ReadoutTemperature | null;
};

/** The readout's text, part by part, as the strip shows it. */
export type ReadoutText = {
	/** Where the place is, as {@link formatLatLon} writes it. */
	readonly position: string;
	/** Its elevation, as {@link formatElevation} writes it. */
	readonly elevation: string;
	/** Its temperature, as {@link formatTemperature} writes it, or null. */
	readonly temperature: string | null;
	/**
	 * {@link READOUT_OUT_OF_DATE_TEXT} when the temperature is not the
	 * current result as chosen; null when it is, or there is none.
	 */
	readonly status: string | null;
};

/**
 * The readout's text for one place.
 *
 * @param parts - What there is to say of the place.
 */
export const describeReadout = (parts: ReadoutParts): ReadoutText => {
	const { temperature } = parts;
	return {
		position: formatLatLon(parts.latitudeDeg, parts.longitudeDeg),
		elevation: formatElevation(parts.heightM),
		temperature:
			temperature === null
				? null
				: formatTemperature(
						temperature.value,
						temperature.view,
						temperature.month,
						temperature.source,
					),
		status:
			temperature === null || temperature.current
				? null
				: READOUT_OUT_OF_DATE_TEXT,
	};
};

/**
 * What the readout says of the cell a direction falls in.
 *
 * @remarks
 * The position is the direction's own, so it moves smoothly with the
 * pointer and reaches the poles. The height and the temperature are of the
 * one cell the direction falls in, with no blending of its neighbours: its
 * elevation less the world's sea level, and the field's value at it. A
 * field that is not one value per cell of the world, or whose value there
 * is not finite, gives no temperature.
 *
 * @param world - The world on show.
 * @param direction - The direction of the place, as the globe picks it.
 * @param shown - What the globe shows of the temperature, or null for
 * none.
 */
export const readoutPartsAt = (
	world: World,
	direction: Vec3,
	shown: ShownTemperature | null,
): ReadoutParts => {
	const grid = getGrid(world.resolution);
	const cell = cellAt(grid, direction);
	const { latitudeDeg, longitudeDeg } = directionToLatLon(direction);
	const value =
		shown !== null && shown.field.length === grid.cellCount
			? (shown.field[cell] as number)
			: Number.NaN;
	return {
		latitudeDeg,
		longitudeDeg,
		heightM: (world.elevation[cell] as number) - world.seaLevel,
		temperature:
			shown !== null && Number.isFinite(value)
				? {
						value,
						view: shown.view,
						month: shown.month,
						source: shown.source,
						current: shown.current,
					}
				: null,
	};
};

/** Whether two texts of the readout say the same. */
const sameText = (a: ReadoutText | null, b: ReadoutText | null): boolean =>
	a === b ||
	(a !== null &&
		b !== null &&
		a.position === b.position &&
		a.elevation === b.elevation &&
		a.temperature === b.temperature &&
		a.status === b.status);

/** What the cursor readout follows, and where it shows what it finds. */
export type CursorReadoutOptions = {
	/** The canvas the globe is drawn on, whose pointer is followed. */
	readonly canvas: HTMLCanvasElement;
	/** The globe, which finds the point under the pointer. */
	readonly globe: Pick<Globe, 'pick'>;
	/** The world on show, at the time it is asked. */
	readonly currentWorld: () => World;
	/** Whether a brush stroke is under way. */
	readonly isStrokeActive: () => boolean;
	/** What the globe shows of the temperature, at the time it is asked. */
	readonly shownTemperature: () => ShownTemperature | null;
	/** Shows the readout's text, or hides the readout for null. */
	readonly show: (text: ReadoutText | null) => void;
};

/** The cursor readout of one globe. */
export type CursorReadout = {
	/**
	 * Says that what lies under the pointer may have changed though the
	 * pointer has not moved: the terrain, the sea level, the world, the
	 * camera, or the temperature on screen. The readout looks again at the
	 * next animation frame.
	 */
	invalidate(): void;
	/**
	 * Hides the readout at once and forgets where the pointer was, as when a
	 * modal dialog comes over the page and the canvas no longer hears the
	 * pointer. It shows again at the next pointer event on the canvas.
	 */
	clear(): void;
	/** Hides the readout and stops listening to the canvas. */
	dispose(): void;
};

/**
 * Has a readout follow the pointer over the globe.
 *
 * @remarks
 * The readout says what lies at the point of the smooth globe under the
 * pointer, as {@link Globe.pick} finds it for the brush, so near the edge of
 * the globe raised relief can stand in front of the place named. It is
 * hidden while the pointer is off the canvas or over the background around
 * the globe, and while a pointer captured by a drag is outside the canvas.
 *
 * It looks at most once an animation frame, however many pointer events
 * arrive in it, and only when asked to: by a pointer event on the canvas,
 * by a change of the canvas's size while the pointer is over it, which
 * moves the globe under a pointer held still, or by
 * {@link CursorReadout.invalidate}. While a stroke is under way and the
 * pointer is over the globe it looks every frame, so that the elevation
 * under a brush held still keeps up with the terrain. The text is handed on
 * only when it changes.
 *
 * @param options - The canvas and globe, what is on show, and where to show
 * the text.
 * @returns The readout, hidden until the pointer is over the globe.
 */
export const createCursorReadout = (
	options: CursorReadoutOptions,
): CursorReadout => {
	const { canvas, globe } = options;
	const listeners = new AbortController();
	const { signal } = listeners;
	/** Where the pointer was last seen over the canvas; null once it leaves. */
	let cursor: WindowPoint | null = null;
	let frame = 0;
	let shown: ReadoutText | null = null;
	let disposed = false;

	const show = (text: ReadoutText | null): void => {
		if (!sameText(text, shown)) {
			shown = text;
			options.show(text);
		}
	};

	const look = (): void => {
		frame = 0;
		const direction =
			cursor === null ? null : globe.pick(cursor.clientX, cursor.clientY);
		show(
			direction === null
				? null
				: describeReadout(
						readoutPartsAt(
							options.currentWorld(),
							direction,
							options.shownTemperature(),
						),
					),
		);
		if (direction !== null && options.isStrokeActive()) {
			invalidate();
		}
	};

	const invalidate = (): void => {
		if (frame === 0 && !disposed) {
			frame = requestAnimationFrame(look);
		}
	};

	const track = (event: PointerEvent): void => {
		// A captured pointer keeps reporting from outside the canvas, where
		// a globe zoomed past the canvas's edges could still be picked.
		const inside =
			event.offsetX >= 0 &&
			event.offsetY >= 0 &&
			event.offsetX < canvas.clientWidth &&
			event.offsetY < canvas.clientHeight;
		cursor = inside ? { clientX: event.clientX, clientY: event.clientY } : null;
		invalidate();
	};

	for (const type of ['pointermove', 'pointerdown', 'pointerup'] as const) {
		canvas.addEventListener(type, track, { signal });
	}
	canvas.addEventListener(
		'pointerleave',
		() => {
			cursor = null;
			invalidate();
		},
		{ signal },
	);
	// Called once as soon as it observes, and then at each change of size;
	// with the pointer off the canvas there is nothing under it to find.
	const resizes = new ResizeObserver(() => {
		if (cursor !== null) {
			invalidate();
		}
	});
	resizes.observe(canvas);

	const clear = (): void => {
		cursor = null;
		if (frame !== 0) {
			cancelAnimationFrame(frame);
			frame = 0;
		}
		show(null);
	};

	return {
		invalidate,
		clear,
		dispose: () => {
			clear();
			disposed = true;
			listeners.abort();
			resizes.disconnect();
		},
	};
};

/** The readout strip on the page. */
export type ReadoutStrip = {
	/** The strip, added to the place given for it. */
	readonly element: HTMLElement;
	/** Shows a readout's text, or hides the strip for null. */
	show(text: ReadoutText | null): void;
};

/**
 * Adds the readout strip, hidden, to the place given for it.
 *
 * @remarks
 * The strip holds one line for each piece of the text: the position, the
 * elevation and the temperature, in that order, each hidden while it has
 * nothing to say. The mark that the temperature is out of date is the end
 * of the temperature's line, hidden while it has nothing to say, and the
 * stylesheet puts a middle dot before it. The stylesheet lays the strip
 * over the globe's bottom-left corner, beside or above the legend, out of
 * the pointer's way.
 *
 * The strip is for sighted users of a pointer. It is not a live region and
 * is hidden from assistive technology, since it changes with every
 * movement of the pointer and would otherwise be announced each time.
 *
 * @param container - Where the strip goes, in the row of overlays along the
 * bottom of the globe's area.
 * @returns The strip.
 */
export const createReadoutStrip = (container: HTMLElement): ReadoutStrip => {
	const element = createElement('div', 'cursor-readout');
	element.setAttribute('aria-hidden', 'true');
	element.hidden = true;
	const position = createElement('span', 'cursor-readout__position');
	const elevation = createElement('span', 'cursor-readout__elevation');
	const temperature = createElement('span', 'cursor-readout__temperature');
	const value = createElement('span', 'cursor-readout__value');
	const status = createElement('span', 'cursor-readout__status');
	temperature.append(value, status);
	element.append(position, elevation, temperature);
	container.append(element);

	const write = (part: HTMLElement, text: string | null): void => {
		part.hidden = text === null;
		const next = text ?? '';
		if (part.textContent !== next) {
			part.textContent = next;
		}
	};

	return {
		element,
		show: (text) => {
			element.hidden = text === null;
			write(position, text?.position ?? null);
			write(elevation, text?.elevation ?? null);
			temperature.hidden = (text?.temperature ?? null) === null;
			write(value, text?.temperature ?? null);
			write(status, text?.status ?? null);
		},
	};
};
