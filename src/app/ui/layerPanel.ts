/**
 * The Layers section: what the globe is coloured by, Terrain or
 * Temperature; in Temperature view, which month or summary of the year is
 * shown, with a slider and a play button for the month; and the legend.
 *
 * {@link createLayerPanel} decides what the globe and the legend show, from
 * the view settings and the layer store, and switches the temperature's
 * calculation on and off with the layer. {@link createLayerControls} is the
 * section on the page, which only shows what it is told and passes on what
 * is chosen.
 */

import {
	summariseTemperature,
	type TemperatureResult,
	type TemperatureSummary,
} from '../../core/index';
import {
	type ColourRamp,
	SEASONAL_RANGE_RAMP,
	TEMPERATURE_RAMP,
} from '../globe/ramp';
import type { Globe } from '../globe/renderer';
import type { LayerStore } from '../layers';
import { createPlayback, type PlaybackOptions } from '../playback';
import type { TemperatureScheduler } from '../refresh';
import {
	DEFAULT_MONTH,
	DEFAULT_PAGE_VIEW,
	LAYER_LABELS,
	LAYERS,
	type Layer,
	MONTH_NAMES,
	type PageView,
	TEMPERATURE_VIEW_LABELS,
	TEMPERATURE_VIEWS,
	type TemperatureView,
} from '../view';
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
 * What the temperature legend says the scale measures, for a temperature
 * view and the month on screen.
 *
 * @param view - What of the year is shown.
 * @param month - The month on screen, from January at 0; read only for the
 * Month view.
 * @returns Such as `Air temperature in July, °C`; for the seasonal range, a
 * caption that says it is a difference of temperatures.
 */
export const temperatureCaption = (
	view: TemperatureView,
	month: number,
): string => {
	switch (view) {
		case 'month':
			return `Air temperature in ${MONTH_NAMES[month]}, °C`;
		case 'annualMean':
			return 'Annual average air temperature, °C';
		case 'warmest':
			return 'Air temperature in the warmest month, °C';
		case 'coldest':
			return 'Air temperature in the coldest month, °C';
		case 'range':
			return 'Seasonal range: difference between the warmest and coldest months, °C';
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
};

/** The layer controls on the page. */
export type LayerControls = {
	/** Shows a legend, or hides it for null. */
	showLegend(content: LegendContent | null): void;
	/**
	 * Shows the view settings: the controls for the temperature in
	 * Temperature view, the month controls for the Month view alone, the
	 * month on the slider and whether the year is playing.
	 */
	showView(view: PageView, playing: boolean): void;
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
	 * Told of an error thrown while the year plays and moves on by itself,
	 * with no control operated to hand it back to.
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
	/**
	 * Whether the field is the store's current result as chosen: false while
	 * the result is out of date, being calculated or no longer calculable,
	 * and while the globe keeps an earlier field than the one chosen, so
	 * whenever the legend marks what it shows as not current.
	 */
	readonly current: boolean;
};

/** The layer panel, as the page tells it of a new world. */
export type LayerPanel = {
	/**
	 * Stops the year playing and puts {@link DEFAULT_MONTH} on screen, as a
	 * new world does. The layer and the temperature view are kept.
	 */
	resetMonth(): void;
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
	readonly source: LegendSource;
	readonly view: TemperatureView;
	readonly month: number;
};

/**
 * What is worked out from one result, each part when first needed and then
 * kept with it, so that the same arrays and ranges are given again until
 * the next result.
 */
type Derived = {
	readonly result: TemperatureResult;
	year?: FittedScale;
	summary?: TemperatureSummary;
	spread?: FittedScale;
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
 * keeps the month; {@link LayerPanel.resetMonth} is how a new world puts
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
 * arrives or another month or summary is chosen, not again as its status
 * or progress change. When the store drops its result, as when the world is
 * replaced, the globe goes back to the height colours. In Terrain view, the
 * globe shows the height colours and the legend is hidden.
 *
 * In the Month view the play button plays the year, a month a second and
 * from December back to January. A move of the slider while it plays is
 * where it carries on from: each move restarts the wait of a whole second.
 * It stops when pressed again, when another temperature view or the
 * terrain is chosen, and on a new world.
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
 * brought up to date as for any other refusal.
 *
 * @param options - The store, the globe, the temperature, the controls,
 * the timers the year plays by, whom to tell of the view and of an error
 * while the year plays.
 * @returns The panel.
 */
export const createLayerPanel = (options: LayerPanelOptions): LayerPanel => {
	const { store, globe, temperature } = options;
	let layer: Layer = DEFAULT_PAGE_VIEW.layer;
	let temperatureView: TemperatureView = DEFAULT_PAGE_VIEW.temperatureView;
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

	/** What the globe is to show of a result in the temperature view. */
	const target = (from: Derived): Shown => {
		const caption = temperatureCaption(temperatureView, playback.month);
		const on = (
			field: Float32Array,
			{ range, beyond }: FittedScale,
			ramp: ColourRamp = TEMPERATURE_RAMP,
			tickStep?: number,
		): Shown => ({
			field,
			source: { range, ramp, caption, beyond, tickStep },
			view: temperatureView,
			month: playback.month,
		});
		switch (temperatureView) {
			case 'month':
				return on(
					from.result.months[playback.month] as Float32Array,
					yearScale(from),
				);
			case 'annualMean':
				return on(summaryOf(from).annualMean, yearScale(from));
			case 'warmest':
				return on(summaryOf(from).warmest, yearScale(from));
			case 'coldest':
				return on(summaryOf(from).coldest, yearScale(from));
			case 'range':
				return on(
					summaryOf(from).range,
					spreadScale(from),
					SEASONAL_RANGE_RAMP,
					SEASONAL_RANGE_TICK_STEP,
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
				derived ??= { result };
				const next = target(derived);
				field = next.field;
				if (shown?.field !== next.field) {
					globe.setLayer(next.field, next.source.range, next.source.ramp);
					shown = next;
				}
			} else if (shown !== null) {
				globe.setLayer(null);
				shown = null;
			}
		} finally {
			// Brought up to date even when the globe throws, which leaves what
			// it shows, and so `shown` and the scale drawn from it, as they
			// were. The globe shows the store's result as chosen when the
			// field it has is the one chosen.
			const showsResult = shown !== null && shown.field === field;
			shownTemperature =
				shown === null
					? null
					: {
							field: shown.field,
							view: shown.view,
							month: shown.month,
							current: showsResult && store.temperature.status === 'current',
						};
			controls.showLegend(
				layer === 'temperature'
					? legendContent(store.temperature, shown?.source ?? null, showsResult)
					: null,
			);
		}
	};

	const view = (): PageView => ({
		layer,
		temperatureView,
		month: playback.month,
	});
	/** Shows the view settings and tells of them. */
	const announce = (): void => {
		controls.showView(view(), playback.playing);
		options.onView?.(view());
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
			if (layer !== 'temperature') {
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
			if (temperatureView !== 'month') {
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
	});
	store.addListener(update);
	update();

	return {
		resetMonth: () => {
			playback.pause();
			if (playback.month === DEFAULT_MONTH) {
				return;
			}
			playback.setMonth(DEFAULT_MONTH);
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
 * what of the year to show and, for the Month view alone, a slider from
 * January to December, which a screen reader hears by the month's name, and
 * a play button. The button is a toggle whose pressed state says whether
 * the year is playing.
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
	temperatureControls.append(viewField, monthControls);

	const showView = (view: PageView, playing: boolean): void => {
		temperatureControls.hidden = view.layer !== 'temperature';
		monthControls.hidden = view.temperatureView !== 'month';
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
	return { showLegend: legend.show, showView };
};
