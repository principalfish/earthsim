/**
 * The cursor readout: a block of the info box over the globe saying what
 * lies under the pointer in two lines: where it is, such as `27.9° N,
 * 86.9° E · 8,123 m`; and its values, on a computed layer the layer's,
 * such as `−18 °C` in Temperature view, and, while the winds are shown,
 * the wind, such as `7 m/s NE`, marked `observed` for the observed winds:
 * `−18 °C · 7 m/s NE`.
 *
 * The writing is in the pure functions at the top. {@link createCursorReadout}
 * follows the pointer and decides when to look again, and
 * {@link createReadoutBlock} is the block on the page, which only shows
 * what it is told.
 */

import {
	cellAt,
	directionToLatLon,
	getGrid,
	type Vec3,
	type World,
} from '../../core/index';
import type { Globe, WindowPoint } from '../globe/renderer';
import type { ScalarLayerSpec } from '../scalarLayer';
import type { Source, WindSource } from '../view';
import {
	DEFAULT_WIND_UNIT,
	formatWind,
	type WindUnit,
	windFromDeg,
} from '../windUnits';
import { createElement } from './fields';
import type { ShownLayer, ShownWinds } from './layerPanel';

/**
 * What the readout says beside a layer's value, or a wind, that is not the
 * current result as chosen, as the legend marks its scale out of date.
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
 * A value of a layer's field on screen as the readout writes it, followed
 * by the layer's unit, such as, for the temperature, `18 °C` or `−31 °C`,
 * whatever month or summary of the year the field is; and by where it
 * comes from, when that is not the simulation: `21 °C observed`, or
 * `+2 °C difference` for the simulated less the observed.
 *
 * @remarks
 * The value is written as the layer writes it, the temperature's rounded
 * to a whole degree, a half upwards, with its digits grouped in threes and
 * a true minus sign; a value that rounds to zero is `0`, never `−0`. A
 * difference is signed both ways, `+2` above zero and `−3` below, and one
 * that rounds to zero is `0`, never `+0`.
 *
 * @param layer - The layer's description.
 * @param value - The value, in the layer's unit.
 * @param source - Where the field comes from; the simulation when left
 * out.
 */
export const formatLayerValue = (
	layer: ScalarLayerSpec,
	value: number,
	source: Source = 'simulated',
): string => {
	const text = `${layer.formatValue(value, source === 'difference')} ${layer.unit}`;
	return source === 'simulated' ? text : `${text} ${source}`;
};

/** A layer's value at the place under the pointer, from what is on screen. */
export type ReadoutValue = {
	/** The layer on screen. */
	readonly layer: ScalarLayerSpec;
	/** The value of the field on screen at the place, in the layer's unit. */
	readonly value: number;
	/** Where the field comes from. */
	readonly source: Source;
	/** Whether the field is the one chosen and up to date. */
	readonly current: boolean;
};

/** The wind at the place under the pointer, from what is on screen. */
export type ReadoutWind = {
	/** The eastward wind at the place, in metres a second. */
	readonly east: number;
	/** The northward wind at the place, in metres a second. */
	readonly north: number;
	/** Where the winds come from; the simulation when left out. */
	readonly source?: WindSource;
	/** Whether the winds are the ones chosen and up to date. */
	readonly current: boolean;
};

/** What the readout says after a wind of the observed Earth. */
export const READOUT_OBSERVED_WIND_TEXT = 'observed';

/**
 * A wind as the readout writes it, such as `7 m/s NE`, the month's or the
 * year's mean alike; `calm` below 0.5 m/s, as {@link formatWind} writes it.
 * An observed wind is marked so at the end, as an observed value of a
 * layer is: `7 m/s W observed` or `calm observed`.
 *
 * @param wind - The wind.
 * @param unit - The unit to write its speed in.
 */
export const formatReadoutWind = (
	wind: ReadoutWind,
	unit: WindUnit,
): string => {
	const text = formatWind(
		Math.hypot(wind.east, wind.north),
		windFromDeg(wind.east, wind.north),
		unit,
	);
	return wind.source === 'observed'
		? `${text} ${READOUT_OBSERVED_WIND_TEXT}`
		: text;
};

/** What the readout says of one place. */
export type ReadoutParts = {
	/** Latitude of the place in degrees, north positive. */
	readonly latitudeDeg: number;
	/** Longitude of the place in degrees, east positive. */
	readonly longitudeDeg: number;
	/** Height of the place above the sea level in metres; negative below. */
	readonly heightM: number;
	/** The layer's value on screen at the place, or null for none. */
	readonly value: ReadoutValue | null;
	/** The wind on screen at the place, or null for none. */
	readonly wind: ReadoutWind | null;
};

/** The readout's text, part by part, as the block shows it. */
export type ReadoutText = {
	/** Where the place is, as {@link formatLatLon} writes it. */
	readonly position: string;
	/** Its elevation, as {@link formatElevation} writes it. */
	readonly elevation: string;
	/**
	 * The layer's value there, as {@link formatLayerValue} writes it, or
	 * null.
	 */
	readonly value: string | null;
	/**
	 * {@link READOUT_OUT_OF_DATE_TEXT} when the layer's value is not the
	 * current result as chosen; null when it is, or there is none.
	 */
	readonly status: string | null;
	/** Its wind, as {@link formatReadoutWind} writes it, or null. */
	readonly wind: string | null;
	/**
	 * {@link READOUT_OUT_OF_DATE_TEXT} when the wind is not the current
	 * result as chosen; null when it is, or there is none.
	 */
	readonly windStatus: string | null;
};

/**
 * The readout's text for one place.
 *
 * @param parts - What there is to say of the place.
 * @param unit - The unit to write a wind's speed in; m/s when left out.
 */
export const describeReadout = (
	parts: ReadoutParts,
	unit: WindUnit = DEFAULT_WIND_UNIT,
): ReadoutText => {
	const { value, wind } = parts;
	return {
		position: formatLatLon(parts.latitudeDeg, parts.longitudeDeg),
		elevation: formatElevation(parts.heightM),
		value:
			value === null
				? null
				: formatLayerValue(value.layer, value.value, value.source),
		status: value === null || value.current ? null : READOUT_OUT_OF_DATE_TEXT,
		wind: wind === null ? null : formatReadoutWind(wind, unit),
		windStatus: wind === null || wind.current ? null : READOUT_OUT_OF_DATE_TEXT,
	};
};

/**
 * What the readout says of the cell a direction falls in.
 *
 * @remarks
 * The position is the direction's own, so it moves smoothly with the
 * pointer and reaches the poles. The height, the layer's value and the
 * wind are of the one cell the direction falls in, with no blending of its
 * neighbours: its elevation less the world's sea level, the field's value
 * at it, and the wind there, uncapped, of the winds the globe's arrows are
 * drawn from, not the mean of an arrow's patch. A field that is not one
 * value per cell of the world, or whose value there is not finite, gives
 * no value, and winds that are not, no wind.
 *
 * @param world - The world on show.
 * @param direction - The direction of the place, as the globe picks it.
 * @param shown - What the globe shows of a computed layer, or null for
 * none.
 * @param winds - What the globe shows of the winds, or null for none; none
 * when left out.
 */
export const readoutPartsAt = (
	world: World,
	direction: Vec3,
	shown: ShownLayer | null,
	winds: ShownWinds | null = null,
): ReadoutParts => {
	const grid = getGrid(world.resolution);
	const cell = cellAt(grid, direction);
	const { latitudeDeg, longitudeDeg } = directionToLatLon(direction);
	const value =
		shown !== null && shown.field.length === grid.cellCount
			? (shown.field[cell] as number)
			: Number.NaN;
	const onGrid =
		winds !== null &&
		winds.field.east.length === grid.cellCount &&
		winds.field.north.length === grid.cellCount;
	const east = onGrid ? (winds.field.east[cell] as number) : Number.NaN;
	const north = onGrid ? (winds.field.north[cell] as number) : Number.NaN;
	return {
		latitudeDeg,
		longitudeDeg,
		heightM: (world.elevation[cell] as number) - world.seaLevel,
		value:
			shown !== null && Number.isFinite(value)
				? {
						layer: shown.layer,
						value,
						source: shown.source,
						current: shown.current,
					}
				: null,
		wind:
			winds !== null && Number.isFinite(east) && Number.isFinite(north)
				? {
						east,
						north,
						source: winds.source,
						current: winds.current,
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
		a.value === b.value &&
		a.status === b.status &&
		a.wind === b.wind &&
		a.windStatus === b.windStatus);

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
	/** What the globe shows of a computed layer, at the time it is asked. */
	readonly shownLayer: () => ShownLayer | null;
	/** What the globe shows of the winds, at the time it is asked. */
	readonly shownWinds: () => ShownWinds | null;
	/** The unit wind speeds are written in, at the time it is asked. */
	readonly windUnit: () => WindUnit;
	/** Shows the readout's text, or hides the readout for null. */
	readonly show: (text: ReadoutText | null) => void;
};

/** The cursor readout of one globe. */
export type CursorReadout = {
	/**
	 * Says that what lies under the pointer may have changed though the
	 * pointer has not moved: the terrain, the sea level, the world, the
	 * camera, the layer or the winds on screen, or the unit wind
	 * speeds are written in. The readout looks again at the next animation
	 * frame.
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
							options.shownLayer(),
							options.shownWinds(),
						),
						options.windUnit(),
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

/** The readout's block on the page. */
export type ReadoutBlock = {
	/** The block, to put in the info box. */
	readonly element: HTMLElement;
	/** Shows a readout's text, or hides the block for null. */
	show(text: ReadoutText | null): void;
};

/** What stands between two parts of a line of the readout's block. */
export const READOUT_SEPARATOR = ' · ';

/**
 * Creates the readout's block, hidden until it is given text to show.
 *
 * @remarks
 * The block holds two lines. The first is the place: its position, then
 * {@link READOUT_SEPARATOR}, then its elevation. The second is its values:
 * the layer's value, then the separator, then the wind; with only one of
 * the two it holds that one alone, and with neither it is hidden. The mark
 * that the value is out of date follows the value, and the mark that the
 * wind is follows the wind, each hidden while it has nothing to say; the
 * stylesheet puts a space before each. A line too long for the block is
 * cut short with an ellipsis.
 *
 * The block is for sighted users of a pointer. It is not a live region and
 * is hidden from assistive technology, since it changes with every
 * movement of the pointer and would otherwise be announced each time.
 *
 * @returns The block.
 */
export const createReadoutBlock = (): ReadoutBlock => {
	const element = createElement('div', 'cursor-readout');
	element.setAttribute('aria-hidden', 'true');
	element.hidden = true;
	/** A separator between two parts of a line. */
	const separator = (): HTMLElement => {
		const made = createElement('span', 'cursor-readout__separator');
		made.textContent = READOUT_SEPARATOR;
		return made;
	};
	const place = createElement('div', 'cursor-readout__place');
	const position = createElement('span', 'cursor-readout__position');
	const elevation = createElement('span', 'cursor-readout__elevation');
	place.append(position, separator(), elevation);
	const values = createElement('div', 'cursor-readout__values');
	const layerValue = createElement('span', 'cursor-readout__layer-value');
	const value = createElement('span', 'cursor-readout__value');
	const status = createElement('span', 'cursor-readout__status');
	layerValue.append(value, status);
	const between = separator();
	const wind = createElement('span', 'cursor-readout__wind');
	const windValue = createElement('span', 'cursor-readout__wind-value');
	const windStatus = createElement('span', 'cursor-readout__wind-status');
	wind.append(windValue, windStatus);
	values.append(layerValue, between, wind);
	element.append(place, values);

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
			const hasValue = (text?.value ?? null) !== null;
			const hasWind = (text?.wind ?? null) !== null;
			layerValue.hidden = !hasValue;
			write(value, text?.value ?? null);
			write(status, text?.status ?? null);
			between.hidden = !(hasValue && hasWind);
			wind.hidden = !hasWind;
			write(windValue, text?.wind ?? null);
			write(windStatus, text?.windStatus ?? null);
			values.hidden = !(hasValue || hasWind);
		},
	};
};
