/**
 * The Layers section: what the globe is coloured by, Terrain or
 * Temperature; in Temperature view, which month or summary of the year is
 * shown, with a slider and a play button for the month, and, on the
 * measured Earth, whether it is the simulated temperature, the observed one
 * or the difference; the slider and the play button in Terrain view too
 * while the globe is lit by the sun; and the legend.
 *
 * {@link createLayerPanel} decides what the globe and the legend show, from
 * the view settings and the layer store, and switches the temperature's
 * calculation on and off with the layer. {@link createLayerControls} is the
 * section on the page, which only shows what it is told and passes on what
 * is chosen.
 */

import {
	compareField,
	differenceField,
	type FieldDifference,
	getGrid,
	type MonthlyTemperature,
	type Resolution,
	summariseTemperature,
	type TemperatureResult,
	type TemperatureSummary,
} from '../../core/index';
import {
	type ColourRamp,
	centredRange,
	DIFFERENCE_RAMP,
	SEASONAL_RANGE_RAMP,
	TEMPERATURE_RAMP,
} from '../globe/ramp';
import type { Globe } from '../globe/renderer';
import type { LayerStore, TemperatureLayer } from '../layers';
import type { ObservedLoader } from '../observedData';
import { createPlayback, type PlaybackOptions } from '../playback';
import type { TemperatureScheduler } from '../refresh';
import {
	DEFAULT_MONTH,
	DEFAULT_PAGE_VIEW,
	DEFAULT_TEMPERATURE_SOURCE,
	LAYER_LABELS,
	LAYERS,
	type Layer,
	MONTH_NAMES,
	offersMonth,
	type PageView,
	TEMPERATURE_VIEW_LABELS,
	TEMPERATURE_VIEWS,
	type TemperatureSource,
	type TemperatureView,
} from '../view';
import { type ComparisonContent, createComparisonControls } from './comparison';
import {
	createButton,
	createElement,
	createRangeField,
	createSegmentedPicker,
	createSelectField,
} from './fields';
import {
	cellWeights,
	createLegend,
	type FittedScale,
	fitRange,
	fitRangeFromZero,
	type LegendContent,
	type LegendSource,
	legendContent,
	NOTHING_BEYOND,
} from './legend';

/** The step, in degrees, the seasonal range's legend is marked at. */
export const SEASONAL_RANGE_TICK_STEP = 5;

/**
 * How far the difference's scale reaches either side of zero, in degrees:
 * the same for every month and summary, the seasonal range's included.
 */
export const DIFFERENCE_HALF_SPAN_C = 20;

/** The step, in degrees, the difference's legend is marked at. */
export const DIFFERENCE_TICK_STEP = 10;

/** What the comparison's line says while the observed temperature loads. */
export const OBSERVED_LOADING_TEXT = 'Loading observed temperature';

/** What the comparison's line says when the observed temperature failed. */
export const OBSERVED_FAILED_TEXT = 'Observed temperature could not be loaded';

/**
 * What a temperature view shows, in lower case, for a caption to name. The
 * seasonal range's says that it is a difference of temperatures.
 */
const subjectOf = (view: TemperatureView, month: number): string => {
	switch (view) {
		case 'month':
			return `air temperature in ${MONTH_NAMES[month]}`;
		case 'annualMean':
			return 'annual average air temperature';
		case 'warmest':
			return 'air temperature in the warmest month';
		case 'coldest':
			return 'air temperature in the coldest month';
		case 'range':
			return 'seasonal range: difference between the warmest and coldest months';
	}
};

/**
 * What a difference between simulated and observed is of, as its caption
 * adds it after `Simulated less observed`. Worded to run to a second line
 * where the simulated caption for the same view does and not otherwise, so
 * the legend keeps its height from one source to the next.
 */
const comparedSubject = (view: TemperatureView, month: number): string => {
	switch (view) {
		case 'month':
			return ` in ${MONTH_NAMES[month]}`;
		case 'annualMean':
		case 'warmest':
		case 'coldest':
			return `, ${subjectOf(view, month)}`;
		case 'range':
			return ', seasonal range';
	}
};

/** A text with its first letter in capitals. */
const capitalised = (text: string): string =>
	`${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/**
 * What the temperature legend says the scale measures, for a temperature
 * view, the month on screen and, on the measured Earth, where the
 * temperature comes from.
 *
 * @param view - What of the year is shown.
 * @param month - The month on screen, from January at 0; read only for the
 * Month view.
 * @param source - Where the temperature shown comes from, when the world
 * is one the comparison is offered for; left out, the caption names no
 * source.
 * @returns Such as `Air temperature in July, °C`, `Observed air
 * temperature in July, °C` or `Simulated less observed in July, °C`. The
 * seasonal range's, but for its difference, says that it is a difference
 * of temperatures.
 */
export const temperatureCaption = (
	view: TemperatureView,
	month: number,
	source?: TemperatureSource,
): string => {
	const subject = subjectOf(view, month);
	switch (source) {
		case undefined:
			return `${capitalised(subject)}, °C`;
		case 'simulated':
			return `Simulated ${subject}, °C`;
		case 'observed':
			return `Observed ${subject}, °C`;
		case 'difference':
			return `Simulated less observed${comparedSubject(view, month)}, °C`;
	}
};

/** What the layer controls start with and whom they tell of a choice. */
export type LayerControlsOptions = {
	/** The view settings shown at first, with the year not playing. */
	readonly view: PageView;
	/** Called with the layer when another is chosen. */
	readonly onLayer: (layer: Layer) => void;
	/** Called with the temperature view when another is chosen. */
	readonly onTemperatureView: (view: TemperatureView) => void;
	/** Called with the month whenever the month slider moves. */
	readonly onMonth: (month: number) => void;
	/** Called when the play button is pressed, to play or to stop. */
	readonly onPlay: () => void;
	/** Called with the temperature's source when another is chosen. */
	readonly onSource: (source: TemperatureSource) => void;
};

/** The layer controls on the page. */
export type LayerControls = {
	/** Shows a legend, or hides it for null. */
	showLegend(content: LegendContent | null): void;
	/**
	 * Shows the view settings: the controls for the temperature in
	 * Temperature view, the month controls where {@link offersMonth} says,
	 * the month on the slider and whether the year is playing.
	 */
	showView(view: PageView, playing: boolean): void;
	/** Shows the comparison controls as given, or hides them. */
	showComparison(content: ComparisonContent): void;
};

/** What the layer panel joins. */
export type LayerPanelOptions = Pick<
	PlaybackOptions,
	'setTimer' | 'clearTimer'
> & {
	/** Where the temperature is kept. */
	readonly store: Pick<LayerStore, 'temperature' | 'addListener'>;
	/** The globe the layer is drawn on, showing the world already. */
	readonly globe: Pick<Globe, 'setLayer'>;
	/** What calculates the temperature, told whether it is showing. */
	readonly temperature: Pick<TemperatureScheduler, 'setShowing'>;
	/** Adds the controls to the page. */
	readonly createControls: (options: LayerControlsOptions) => LayerControls;
	/** Called with the view settings whenever any of them changes. */
	readonly onView?: (view: PageView) => void;
	/**
	 * Gives the observed temperature on a world's grid; asked the first
	 * time Observed or Difference is chosen for a world.
	 */
	readonly loadObserved: ObservedLoader;
	/**
	 * Told of an error with no control operated to hand it back to: one
	 * thrown while the year plays and moves on by itself, or after the
	 * observed temperature arrives, and why the observed temperature could
	 * not be loaded.
	 */
	readonly reportError: (error: unknown) => void;
};

/** What the globe shows of the temperature, as the layer panel gave it. */
export type ShownTemperature = {
	/**
	 * The field the globe was last given: one value per cell, in cell order.
	 * It belongs to the panel and must not be changed.
	 */
	readonly field: Float32Array;
	/** What of the year the field is. */
	readonly view: TemperatureView;
	/**
	 * The month on screen when the field was given, from January at 0; what
	 * the field is for the Month view.
	 */
	readonly month: number;
	/** Where the field comes from. */
	readonly source: TemperatureSource;
	/**
	 * Whether the field is the one chosen and up to date: false while the
	 * globe keeps an earlier field than the one chosen and, but for the
	 * observed temperature, which is never out of date, while the store's
	 * result is out of date, being calculated or no longer calculable; so
	 * whenever the legend marks what it shows as not current.
	 */
	readonly current: boolean;
};

/** The layer panel, as the page tells it of the world. */
export type LayerPanel = {
	/**
	 * Takes a new world: stops the year playing, puts {@link DEFAULT_MONTH}
	 * on screen and the source back to {@link DEFAULT_TEMPERATURE_SOURCE},
	 * and forgets the observed temperature and the comparison of the world
	 * before. The layer, the temperature view and the sunlight are kept.
	 *
	 * @param earth - The new world's resolution if it is the measured Earth;
	 * null if it is not.
	 */
	newWorld(earth: Resolution | null): void;
	/**
	 * Says whether the world on show is the measured Earth, after a change
	 * to it that may have made it so or stopped it being so.
	 *
	 * @param earth - Its resolution if it is the measured Earth now; null if
	 * it is not.
	 */
	setEarth(earth: Resolution | null): void;
	/**
	 * Takes whether the globe is lit by the sun, as the view controls set
	 * it. Turned on in Terrain view, the month controls show there; turned
	 * off there, they are hidden again and the year stops playing. In
	 * Temperature view the controls are as they were either way.
	 *
	 * @param on - Whether the globe is lit by the sun.
	 */
	setSunlight(on: boolean): void;
	/**
	 * What the globe shows of the temperature: exactly what it was last
	 * given, as of the panel's latest update, which follows every change of
	 * the view settings and of the store. Null while it shows the height
	 * colours, as in Terrain view and before there is a result.
	 */
	shown(): ShownTemperature | null;
};

/** What the globe is given to show of the temperature, and how. */
type Shown = {
	readonly field: Float32Array;
	readonly legend: LegendSource;
	readonly view: TemperatureView;
	readonly month: number;
	readonly source: TemperatureSource;
};

/**
 * A field of a year: a month, from January at 0, or a summary of the
 * twelve.
 */
type FieldKey = number | Exclude<TemperatureView, 'month'>;

/**
 * The observed temperature on a world's grid, its summaries worked out
 * when first needed and then kept with it.
 */
type ObservedYear = {
	readonly resolution: Resolution;
	readonly months: MonthlyTemperature;
	summary?: TemperatureSummary;
};

/**
 * What is worked out from one result, each part when first needed and then
 * kept with it, so that the same arrays and ranges are given again until
 * the next result. What is worked out against the observed temperature is
 * kept for the observed year it was worked out against.
 */
type Derived = {
	readonly result: TemperatureResult;
	year?: FittedScale;
	summary?: TemperatureSummary;
	spread?: FittedScale;
	against?: ObservedYear;
	sharedYear?: FittedScale;
	sharedSpread?: FittedScale;
	differences: Map<FieldKey, Float32Array>;
	figures: Map<FieldKey, FieldDifference>;
};

/** The difference's scale: centred on zero, with values beyond both ends. */
const DIFFERENCE_SCALE: FittedScale = {
	range: centredRange(DIFFERENCE_HALF_SPAN_C),
	beyond: { below: true, above: true },
};

/**
 * Joins the layer controls to the globe, the layer store and the
 * temperature's calculation, starting on {@link DEFAULT_PAGE_VIEW}.
 *
 * @remarks
 * Choosing Temperature tells the temperature it is showing, which asks for
 * it if the result on hand is out of date or there is none, and choosing
 * Terrain tells it it is not. The view settings are the page's: a new world
 * and a new result keep the layer and the temperature view, and a result
 * keeps the month; {@link LayerPanel.newWorld} is how a new world puts
 * July back on screen.
 *
 * In Temperature view, the globe shows the latest result in the store: the
 * month on screen, its annual mean, its warmest or coldest month, or its
 * seasonal range. The four temperatures are drawn in the colours of
 * {@link TEMPERATURE_RAMP} on one scale fitted to the result's whole year,
 * so the colours do not change their meaning as the month moves on or
 * another summary is chosen. The scale spans the middle 99% of the year's
 * values by area, as {@link fitRange} fits it with the cell areas of
 * {@link cellWeights}; colder and hotter places take the end colours, and
 * the legend says so at each end beyond which the year holds values, the
 * same in every month and summary. The seasonal range is drawn in those of
 * {@link SEASONAL_RANGE_RAMP} on a scale of its own, from zero up to the
 * largest range in the world, marked every {@link SEASONAL_RANGE_TICK_STEP}
 * degrees, with nothing beyond it. The summaries and scales are worked out
 * once for each result, when first shown, and kept until the next result or
 * until the store drops this one, so each is sent to the globe once. Until
 * there is a result, the globe shows the height colours and the legend
 * says why. A result that is out of date, or being calculated again, stays
 * on the globe until the next arrives. A field is sent to the globe when it
 * arrives or another month or summary is chosen, or its scale changes, not
 * again as its status or progress change. When the store drops its result,
 * as when the world is replaced, the globe goes back to the height colours.
 * In Terrain view, the globe shows the height colours and the legend is
 * hidden.
 *
 * While the world is the measured Earth, as the page says through
 * {@link LayerPanel.newWorld} and {@link LayerPanel.setEarth}, Temperature
 * view offers the comparison: the temperature's source, Simulated, Observed
 * or Difference, simulated less observed. Once the world stops being the
 * measured Earth the source goes back to Simulated and the choice is
 * hidden; when it is the measured Earth again, the choice comes back, on
 * Simulated. The observed temperature is asked for the first time Observed
 * or Difference is chosen for a world, and kept for that world; the globe
 * goes on showing the simulated temperature until it arrives, and the
 * comparison's line says {@link OBSERVED_LOADING_TEXT}. If it cannot be
 * loaded, the line says {@link OBSERVED_FAILED_TEXT}, the source goes back
 * to Simulated, and the next choice of Observed or Difference asks again.
 * What arrives after the world was replaced, or after it stopped or started
 * being the measured Earth, is set aside. Like the result's fields, the
 * observed year's summaries, the differences and the error figures are
 * each worked out once when first needed, the differences and figures
 * with each result and dropped with it, so that each field is one array
 * sent to the globe once.
 *
 * While the comparison is offered and the observed temperature has
 * arrived, the simulated and the observed temperatures share one scale,
 * fitted as above to their 24 months together, the same in every month and
 * summary, and their seasonal ranges one from zero up to the largest of
 * either; until then, and once the world stops being the measured Earth,
 * the simulated temperature has its own. The difference, of every month
 * and summary, the seasonal range's included, is drawn in the colours of
 * {@link DIFFERENCE_RAMP} on a scale from −{@link DIFFERENCE_HALF_SPAN_C} to
 * {@link DIFFERENCE_HALF_SPAN_C} degrees, marked every
 * {@link DIFFERENCE_TICK_STEP}, whose legend always says what lies beyond
 * both ends. The legend then also gives the error figures of the simulated
 * field for the month or summary on screen against the observed one, as
 * {@link compareField} works them out, whichever the source, except under
 * the observed temperature while the store's result is not current, as
 * while it is out of date or being calculated again. The observed
 * temperature is never marked out of date; the difference is marked
 * whenever the simulated temperature would be. All three need a result:
 * until there is one, the globe shows the height colours.
 *
 * In the Month view, and in Terrain view while the globe is lit by the sun,
 * the play button plays the year, a month a second and from December back
 * to January. A move of the slider while it plays is where it carries on
 * from: each move restarts the wait of a whole second. It stops when
 * pressed again, on a new world, and whenever a change of the view hides
 * the month controls, as {@link offersMonth} decides: another temperature
 * view, Terrain without sunlight, sunlight turned off in Terrain view, or
 * a summary chosen on the way back to Temperature view.
 *
 * The legend's scale, ramp, caption, ticks and words for what lies beyond
 * the ends are always those of what the globe shows: what it was last
 * given, or no scale while it shows the height colours. Its line and bar say
 * where the store's result stands.
 *
 * Nothing here throws in normal use; what the globe throws reaches the
 * store's record of errors when it comes from a change of the store, and
 * whoever made the choice when it comes from a control. The globe then
 * keeps what it showed, and the legend its scale with it, while the
 * legend's line still says where the store's result stands. For a current
 * result the globe refused, the line says that the earlier field still on
 * the globe is out of date, or, with nothing on the globe, that the
 * temperature could not be shown. The field is sent again at the next
 * change. What is thrown while the year plays and moves on by itself goes
 * to `reportError` instead, and the year stops playing, on the month it
 * moved to, so that it is not thrown again every second; the legend is
 * brought up to date as for any other refusal. What is thrown as the
 * observed temperature arrives goes to `reportError` too.
 *
 * @param options - The store, the globe, the temperature, the controls,
 * the timers the year plays by, the observed temperature's loader, whom to
 * tell of the view and of an error with no control to hand it back to.
 * @returns The panel.
 */
export const createLayerPanel = (options: LayerPanelOptions): LayerPanel => {
	const { store, globe, temperature } = options;
	let layer: Layer = DEFAULT_PAGE_VIEW.layer;
	let temperatureView: TemperatureView = DEFAULT_PAGE_VIEW.temperatureView;
	let source: TemperatureSource = DEFAULT_PAGE_VIEW.source;
	let sunlight = DEFAULT_PAGE_VIEW.sunlight;
	/**
	 * The world's resolution while it is the measured Earth, as the page
	 * last said; null while it is not, and the comparison is not offered.
	 */
	let earth: Resolution | null = null;
	/** The observed temperature, once it has arrived for this world. */
	let observed: ObservedYear | null = null;
	/**
	 * Counts the changes that set aside an answer from the observed
	 * temperature's loader still on its way: a new world, and the world
	 * starting or stopping being the measured Earth.
	 */
	let epoch = 0;
	/** Whether the observed temperature has been asked for in this epoch. */
	let loading = false;
	/** What the comparison's line says, or null. */
	let message: string | null = null;
	/**
	 * What has been worked out from the latest result, dropped with it so
	 * that a result the store no longer holds is not held on to here.
	 */
	let derived: Derived | null = null;
	/** What the globe was last given to show, or null for the heights. */
	let shown: Shown | null = null;
	/** What {@link LayerPanel.shown} gives, as of the latest update. */
	let shownTemperature: ShownTemperature | null = null;

	const yearScale = (from: Derived): FittedScale => {
		const { months } = from.result;
		from.year ??= fitRange(months, cellWeights(months[0]?.length ?? 0));
		return from.year;
	};
	const summaryOf = (from: Derived): TemperatureSummary => {
		from.summary ??= summariseTemperature(from.result.months);
		return from.summary;
	};
	const spreadScale = (from: Derived): FittedScale => {
		from.spread ??= {
			range: fitRangeFromZero(summaryOf(from).range),
			beyond: NOTHING_BEYOND,
		};
		return from.spread;
	};
	const observedSummary = (year: ObservedYear): TemperatureSummary => {
		year.summary ??= summariseTemperature(year.months);
		return year.summary;
	};
	const simulatedField = (from: Derived, key: FieldKey): Float32Array =>
		typeof key === 'number'
			? (from.result.months[key] as Float32Array)
			: summaryOf(from)[key];
	const observedField = (year: ObservedYear, key: FieldKey): Float32Array =>
		typeof key === 'number'
			? (year.months[key] as Float32Array)
			: observedSummary(year)[key];

	/**
	 * The observed year a result is compared with: the one that has arrived
	 * for this world while the comparison is offered, on the result's grid,
	 * with what was worked out against another dropped. Null when there is
	 * none.
	 */
	const comparedWith = (from: Derived): ObservedYear | null => {
		const year = observed;
		if (
			earth === null ||
			year === null ||
			year.resolution !== earth ||
			year.months[0]?.length !== from.result.months[0]?.length
		) {
			return null;
		}
		if (from.against !== year) {
			from.against = year;
			from.sharedYear = undefined;
			from.sharedSpread = undefined;
			from.differences.clear();
			from.figures.clear();
		}
		return year;
	};
	const sharedYearScale = (from: Derived, year: ObservedYear): FittedScale => {
		const { months } = from.result;
		// Both years hold months of one length, as `comparedWith` checks.
		from.sharedYear ??= fitRange(
			[...months, ...year.months],
			cellWeights((months[0] as Float32Array).length),
		);
		return from.sharedYear;
	};
	const sharedSpreadScale = (
		from: Derived,
		year: ObservedYear,
	): FittedScale => {
		from.sharedSpread ??= {
			range: {
				min: 0,
				max: Math.max(
					fitRangeFromZero(summaryOf(from).range).max,
					fitRangeFromZero(observedSummary(year).range).max,
				),
			},
			beyond: NOTHING_BEYOND,
		};
		return from.sharedSpread;
	};
	const differenceOf = (
		from: Derived,
		year: ObservedYear,
		key: FieldKey,
	): Float32Array => {
		let field = from.differences.get(key);
		if (field === undefined) {
			field = differenceField(
				simulatedField(from, key),
				observedField(year, key),
			);
			from.differences.set(key, field);
		}
		return field;
	};
	const figuresOf = (
		from: Derived,
		year: ObservedYear,
		key: FieldKey,
	): FieldDifference => {
		let figures = from.figures.get(key);
		if (figures === undefined) {
			figures = compareField(
				simulatedField(from, key),
				observedField(year, key),
				getGrid(year.resolution),
			);
			from.figures.set(key, figures);
		}
		return figures;
	};

	/** What the globe is to show of a result in the temperature view. */
	const target = (from: Derived): Shown => {
		const year = comparedWith(from);
		// Until the observed temperature is there, the simulated is shown.
		const showing: TemperatureSource = year === null ? 'simulated' : source;
		const key: FieldKey =
			temperatureView === 'month' ? playback.month : temperatureView;
		const spread = temperatureView === 'range';
		const on = (
			field: Float32Array,
			{ range, beyond }: FittedScale,
			ramp: ColourRamp,
			tickStep?: number,
		): Shown => ({
			field,
			legend: {
				range,
				ramp,
				caption: temperatureCaption(
					temperatureView,
					playback.month,
					earth === null ? undefined : showing,
				),
				beyond,
				tickStep,
				figures: year === null ? null : figuresOf(from, year, key),
			},
			view: temperatureView,
			month: playback.month,
			source: showing,
		});
		const ramp = spread ? SEASONAL_RANGE_RAMP : TEMPERATURE_RAMP;
		const tickStep = spread ? SEASONAL_RANGE_TICK_STEP : undefined;
		if (year === null) {
			return on(
				simulatedField(from, key),
				spread ? spreadScale(from) : yearScale(from),
				ramp,
				tickStep,
			);
		}
		const shared = spread
			? sharedSpreadScale(from, year)
			: sharedYearScale(from, year);
		switch (showing) {
			case 'simulated':
				return on(simulatedField(from, key), shared, ramp, tickStep);
			case 'observed':
				return on(observedField(year, key), shared, ramp, tickStep);
			case 'difference':
				return on(
					differenceOf(from, year, key),
					DIFFERENCE_SCALE,
					DIFFERENCE_RAMP,
					DIFFERENCE_TICK_STEP,
				);
		}
	};

	const update = (): void => {
		const { result } = store.temperature;
		if (derived !== null && derived.result !== result) {
			derived = null;
		}
		/** The field the globe is to show, once it is known. */
		let field: Float32Array | undefined;
		try {
			if (layer === 'temperature' && result !== null) {
				derived ??= { result, differences: new Map(), figures: new Map() };
				const next = target(derived);
				field = next.field;
				// Sent again only for another field or another scale; what
				// only the legend shows, such as its caption, needs no
				// sending.
				if (
					shown === null ||
					shown.field !== next.field ||
					shown.legend.ramp !== next.legend.ramp ||
					shown.legend.range.min !== next.legend.range.min ||
					shown.legend.range.max !== next.legend.range.max
				) {
					globe.setLayer(next.field, next.legend.range, next.legend.ramp);
				}
				shown = next;
			} else if (shown !== null) {
				globe.setLayer(null);
				shown = null;
			}
		} finally {
			// Brought up to date even when the globe throws, which leaves what
			// it shows, and so `shown` and the scale drawn from it, as they
			// were. The globe shows the store's result as chosen when the
			// field it has is the one chosen. The observed temperature is
			// never out of date, whatever the store's result; the error
			// figures, worked out from that result, are left off under it
			// while the result is not current.
			const showsResult = shown !== null && shown.field === field;
			const observedShown = shown?.source === 'observed';
			const status: TemperatureLayer = observedShown
				? { status: 'current', result, progress: null }
				: store.temperature;
			const legend =
				shown !== null &&
				observedShown &&
				store.temperature.status !== 'current'
					? { ...shown.legend, figures: null }
					: (shown?.legend ?? null);
			shownTemperature =
				shown === null
					? null
					: {
							field: shown.field,
							view: shown.view,
							month: shown.month,
							source: shown.source,
							current: showsResult && status.status === 'current',
						};
			controls.showLegend(
				layer === 'temperature'
					? legendContent(status, legend, showsResult)
					: null,
			);
		}
	};

	const view = (): PageView => ({
		layer,
		temperatureView,
		source,
		month: playback.month,
		sunlight,
	});
	/** Shows the view settings and the comparison, and tells of them. */
	const announce = (): void => {
		controls.showView(view(), playback.playing);
		controls.showComparison({
			offered: layer === 'temperature' && earth !== null,
			source,
			message,
		});
		options.onView?.(view());
	};

	/**
	 * Sets aside whatever the observed temperature's loader has yet to give,
	 * and the line about it.
	 */
	const newEpoch = (): void => {
		epoch++;
		loading = false;
		message = null;
	};

	/** Asks for the observed temperature, unless it is already asked for. */
	const requestObserved = (resolution: Resolution): void => {
		if (loading) {
			return;
		}
		loading = true;
		message = OBSERVED_LOADING_TEXT;
		const asked = epoch;
		/** Brings the page up to date with what the loader gave. */
		const settle = (apply: () => void): void => {
			if (asked !== epoch) {
				return;
			}
			loading = false;
			apply();
			try {
				announce();
				update();
			} catch (error) {
				options.reportError(error);
			}
		};
		options.loadObserved(resolution).then(
			(months) =>
				settle(() => {
					observed = { resolution, months };
					message = null;
				}),
			(error: unknown) =>
				settle(() => {
					options.reportError(error);
					message = OBSERVED_FAILED_TEXT;
					source = DEFAULT_TEMPERATURE_SOURCE;
				}),
		);
	};

	const playback = createPlayback({
		month: DEFAULT_PAGE_VIEW.month,
		setTimer: options.setTimer,
		clearTimer: options.clearTimer,
		onMonth: () => {
			// The controls first, so that the slider is on the month even if
			// the globe refuses it.
			announce();
			try {
				update();
			} catch (error) {
				// Nothing calls this but the timer, which would lose the error.
				// Stopped first, so the controls show the year not playing even
				// if the report throws.
				playback.pause();
				options.reportError(error);
			}
		},
		onPlayingChange: announce,
	});

	const controls = options.createControls({
		view: view(),
		onLayer: (next) => {
			if (next === layer) {
				return;
			}
			layer = next;
			if (!offersMonth(view())) {
				playback.pause();
			}
			temperature.setShowing(layer === 'temperature');
			announce();
			update();
		},
		onTemperatureView: (next) => {
			if (next === temperatureView) {
				return;
			}
			temperatureView = next;
			if (!offersMonth(view())) {
				playback.pause();
			}
			announce();
			update();
		},
		onMonth: (next) => {
			if (next === playback.month) {
				return;
			}
			playback.setMonth(next);
			announce();
			update();
		},
		onPlay: () => {
			if (playback.playing) {
				playback.pause();
			} else {
				playback.play();
			}
		},
		onSource: (next) => {
			if (next === source) {
				return;
			}
			if (earth === null) {
				// Not offered: the controls are put back as they were.
				announce();
				return;
			}
			source = next;
			if (
				source !== 'simulated' &&
				(observed === null || observed.resolution !== earth)
			) {
				requestObserved(earth);
			}
			// While the observed temperature is on its way the line says so,
			// whatever is chosen meanwhile; otherwise a choice clears it.
			message = loading ? OBSERVED_LOADING_TEXT : null;
			announce();
			update();
		},
	});
	store.addListener(update);
	update();

	return {
		newWorld: (next) => {
			playback.pause();
			const changed =
				playback.month !== DEFAULT_MONTH ||
				earth !== next ||
				source !== DEFAULT_TEMPERATURE_SOURCE ||
				observed !== null ||
				message !== null;
			newEpoch();
			earth = next;
			observed = null;
			source = DEFAULT_TEMPERATURE_SOURCE;
			if (!changed) {
				return;
			}
			playback.setMonth(DEFAULT_MONTH);
			announce();
			update();
		},
		setSunlight: (on) => {
			if (on === sunlight) {
				return;
			}
			sunlight = on;
			if (!offersMonth(view())) {
				playback.pause();
			}
			announce();
		},
		setEarth: (next) => {
			if (next === earth) {
				return;
			}
			newEpoch();
			earth = next;
			source = DEFAULT_TEMPERATURE_SOURCE;
			announce();
			update();
		},
		shown: () => shownTemperature,
	};
};

/**
 * Adds the Layers section to the side panel: the choice of layer, the
 * temperature's view controls, and the legend.
 *
 * @remarks
 * The temperature's controls show only in Temperature view: a drop-down of
 * what of the year to show; under it the comparison controls of
 * {@link createComparisonControls}, hidden unless they are offered; and,
 * for the Month view, a slider from January to December, which a screen
 * reader hears by the month's name, and a play button. The slider and the
 * button show in Terrain view too while the globe is lit by the sun, on
 * their own. The button is a toggle whose pressed state says whether the
 * year is playing.
 *
 * @param panel - The panel to add the section to, after what it holds.
 * @param options - The starting view settings and whom to tell of a choice.
 * @returns The controls, with the legend hidden.
 */
export const createLayerControls = (
	panel: HTMLElement,
	options: LayerControlsOptions,
): LayerControls => {
	const section = createElement('section', 'panel__section');
	const heading = createElement('h2', 'panel__heading');
	heading.textContent = 'Layers';
	const legend = createLegend();

	const temperatureControls = createElement('div', 'temperature-view');
	const viewField = createSelectField({
		id: 'temperature-view',
		label: 'Show',
		choices: TEMPERATURE_VIEWS.map((value) => ({
			value,
			label: TEMPERATURE_VIEW_LABELS[value],
		})),
		value: options.view.temperatureView,
		onChange: options.onTemperatureView,
	});
	viewField.classList.add('temperature-view__show');

	const monthControls = createElement('div', 'month-controls');
	const month = createRangeField({
		id: 'temperature-month',
		label: 'Month',
		min: 0,
		max: MONTH_NAMES.length - 1,
		step: 1,
		value: options.view.month,
		format: (value) => MONTH_NAMES[value] ?? '',
		onInput: options.onMonth,
		// Moved every second while the year plays; the slider itself says
		// the month.
		quietValue: true,
	});
	const play = createButton({
		label: 'Play',
		title: 'Play through the year, a month a second',
		onClick: options.onPlay,
	});
	play.classList.add('button--compact');
	monthControls.append(month.element, play);
	temperatureControls.append(viewField);
	const comparison = createComparisonControls(temperatureControls, {
		source: options.view.source,
		onSource: options.onSource,
	});
	temperatureControls.append(monthControls);

	const showView = (view: PageView, playing: boolean): void => {
		const temperatureShown = view.layer === 'temperature';
		const monthShown = offersMonth(view);
		temperatureControls.hidden = !temperatureShown && !monthShown;
		viewField.hidden = !temperatureShown;
		monthControls.hidden = !monthShown;
		month.setValue(view.month);
		play.setAttribute('aria-pressed', String(playing));
	};
	showView(options.view, false);

	section.append(
		heading,
		createSegmentedPicker({
			name: 'layer',
			legend: 'Layer',
			choices: LAYERS.map((value) => ({ value, label: LAYER_LABELS[value] })),
			value: options.view.layer,
			onChange: options.onLayer,
		}),
		temperatureControls,
		legend.element,
	);
	panel.append(section);
	return {
		showLegend: legend.show,
		showView,
		showComparison: comparison.show,
	};
};
