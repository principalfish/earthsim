/**
 * What the globe is coloured by, Terrain or a layer of one computed value
 * per cell, such as Temperature, as the dock over the globe chooses it;
 * for such a layer, which month or summary of the year is shown, as the
 * top bar's Show choice chooses it; on the measured Earth, where the layer
 * and the winds come from, as the top bar's one comparison control chooses
 * it: the simulated values, the observed ones or, for the layer, the
 * difference; the month on screen, and whether the year plays through it,
 * for a layer's Month view, and in Terrain view too while the globe is lit
 * by the sun or shows the winds, as the timeline chooses them; and what
 * the info box over the globe shows of them: the legend, and where the
 * calculation, the layer and the winds stand, said on the info box's
 * status line.
 *
 * Each computed layer is shown as its description, a
 * `ScalarLayerSpec`, says: its views of the year, their colours and
 * scales, its wording and its comparison. {@link createLayerPanel} decides
 * what the globe and the info box show, from the view settings, the layer
 * store and whether the calculation is paused; what calculates the layers
 * runs whatever is shown. The info box, given as `LayerControls`,
 * only shows what it is told; the layer is chosen on the dock, and told to
 * the panel by {@link LayerPanel.setLayer}, the view of its year and the
 * source on the top bar, told by {@link LayerPanel.setSummary} and
 * {@link LayerPanel.setSource}, and the month and whether the year plays
 * on the timeline, told by {@link LayerPanel.setMonth} and
 * {@link LayerPanel.togglePlaying}.
 */

import type {
	compareField,
	FieldDifference,
	Resolution,
} from '../../core/index';
import { type ColourRamp, centredRange, type ValueRange } from '../globe/ramp';
import type { WindField } from '../globe/wind';
import { createPlayback } from '../layers/playback';
import {
	fitSummaryScale,
	inUnit,
	isDifferenceView,
	layerCaption,
	layerUnit,
	meanOfMonths,
	metricRange,
	type ObservedComparison,
	offersSummary,
	type PerUnit,
	SCALAR_LAYERS,
	scaleKey,
	summaryOf,
	toLayerUnit,
	type YearFieldKey,
	yearField,
} from '../layers/scalar';
import {
	DEFAULT_MONTH,
	DEFAULT_PAGE_VIEW,
	DEFAULT_SOURCE,
	DEFAULT_SUMMARY,
	DEFAULT_WIND_SOURCE,
	type Layer,
	offeredSources,
	offersMonth,
	type PageView,
	type ScalarLayerId,
	type Source,
	type WindSource,
	windSourceFor,
} from '../layers/view';
import { SYSTEM_UNITS } from '../settings/units';
import { differenceOf, figuresOf } from './layerPanel/figures';
import {
	type Derived,
	type DerivedWinds,
	type FittedScale,
	kept,
	type LayerState,
	OBSERVED_STATUS,
	OBSERVED_WINDS_STATUS,
	OBSERVED_WINDS_TEXTS,
	type ObservedRequest,
	type ObservedTexts,
	type ObservedWinds,
	type ObservedWindsState,
	type ObservedYear,
	type Shown,
} from './layerPanel/internal';
import type {
	LayerPanel,
	LayerPanelOptions,
	ShownLayer,
	ShownWinds,
} from './layerPanel/types';
import { calculationContent } from './main/infoBox';
import { legendContent } from './main/legend';
import {
	type OBSERVED_WINDS_FAILED_TEXT,
	type OBSERVED_WINDS_LOADING_TEXT,
	windKeyContent,
} from './main/windKey';

export type {
	LayerControls,
	LayerPanel,
	LayerPanelOptions,
	ShownLayer,
	ShownWinds,
} from './layerPanel/types';

/**
 * Joins the layer controls to the globe, the layer store and the layers'
 * calculations, starting on the view settings given, or on
 * {@link DEFAULT_PAGE_VIEW}. Like a change of the store, the start shows
 * on the globe what the view settings choose at once, before anything is
 * told of the view.
 *
 * @remarks
 * What calculates the layers is not told what is shown: the temperature
 * and the winds are worked out whatever is on screen, and the panel shows
 * what is in the store. The view settings are the page's: a new
 * world and a new result keep the layer and each layer's view of its year,
 * and a result keeps the month; {@link LayerPanel.newWorld} is how a new
 * world puts July back on screen. Each layer keeps its own view of the
 * year while another is on screen; the source is one for every layer and
 * the winds, and is kept from one layer to another while it is offered.
 *
 * On a computed layer, the globe shows the latest result in the store, as
 * the layer's description reads it: the month on screen or a summary of the
 * year it offers, such as, for the temperature, its annual mean, its warmest
 * or coldest month, or its seasonal range. Each view is drawn in its own
 * colours on a scale fitted as it says: the temperature's four temperatures
 * on one scale fitted to the result's whole year, so the colours do not
 * change their meaning as the month moves on or another summary is chosen,
 * spanning the middle 99% of the year's values by area, as `fitRange` fits
 * it with the cell areas of `cellWeights`; colder and hotter places take the
 * end colours. The temperature's seasonal range has a scale of its own, from
 * zero up to the largest range in the world, marked at its own step; a layer
 * centred on a value, as `fitRangeCentred` fits it, reaches as far either
 * side of it. Every scale is at least the layer's smallest span. The
 * summaries and scales are worked out once for each result, when first
 * shown, and kept until the next result or until the store drops this one,
 * so each is sent to the globe once. Until there is a result, the globe
 * shows the height colours and the legend says why. A result that is out of
 * date, or being calculated again, stays on the globe until the next
 * arrives. A field is sent to the globe when it arrives or another month or
 * summary is chosen, or its scale changes, not again as its status or
 * progress change. When the store drops its result, as when the world is
 * replaced, the globe goes back to the height colours. In Terrain view, the
 * globe shows the height colours and the legend is hidden.
 *
 * While the world is the measured Earth, as the page says through
 * {@link LayerPanel.newWorld} and {@link LayerPanel.setEarth}, the
 * comparison control offers where the layer on screen and the winds come
 * from, one source for both, as {@link offeredSources} says: Simulated,
 * Observed or Difference, simulated less observed, while a layer with an
 * observed year is on screen; Simulated or Observed while the winds are
 * shown with no such layer, as in Terrain view; and nothing otherwise. A
 * change of the view that takes the source chosen off the offer, as
 * Terrain does Difference, or Terrain with the winds off any source, puts
 * it back on Simulated; one that leaves it offered keeps it, from one
 * compared layer to another and from such a layer to Terrain with the
 * winds on Observed. Once the world stops being the measured Earth the
 * source goes back to Simulated and nothing is offered; when it is the
 * measured Earth again, the control comes back, on Simulated.
 *
 * On Observed or Difference, the observed year of the layer on screen is
 * asked for the first time it is needed on a world: when either is
 * chosen, or a layer is chosen while either is on. It is kept for that
 * world; the globe goes on showing the simulated year until it arrives,
 * and the comparison's line says the layer's words for its loading. If it
 * cannot be loaded, the line says the layer's words for that and the next
 * time it is needed asks again; the source goes back to Simulated if the
 * layer is still on screen. A choice of source clears the line, except
 * while what it speaks of is still on its way. What arrives after the
 * world was replaced, or after it stopped or started being the measured
 * Earth, is set aside. Like the result's fields,
 * the observed year's summaries, the differences and the error figures are
 * each worked out once when first needed, the differences and figures
 * with each result and dropped with it, so that each field is one array
 * sent to the globe once.
 *
 * While the comparison is offered and the observed year has arrived, the
 * simulated and the observed years share each scale, fitted as above to
 * their 24 months together, the same in every month and summary, and a scale
 * from zero runs up to the largest of either; until then, and once the world
 * stops being the measured Earth, the simulated year has its own. The
 * difference, of every month and summary, is drawn in the colours of the
 * layer's difference on a scale centred on zero and reaching as far either
 * way as it says, marked at its step. The legend then also gives the error
 * figures of the simulated field for the month or summary on screen against
 * the observed one, as {@link compareField} works them out, whichever the
 * source, except under the observed year while the store's result is not
 * current, as while it is out of date or being calculated again. The
 * observed year is never marked out of date; the difference is marked
 * whenever the simulated year would be. All three need a result: until there
 * is one, the globe shows the height colours.
 *
 * In the Month view, and in Terrain view while the globe is lit by the sun
 * or shows the winds, {@link LayerPanel.togglePlaying} plays the year, a
 * month a second and from December back to January. A month chosen while
 * it plays is where it carries on from: each choice restarts the wait of a
 * whole second. It stops when toggled again, on a new world, and whenever
 * a change of the view stops offering the month, as {@link offersMonth}
 * decides: another view of the year, Terrain without sunlight or winds,
 * sunlight or the winds turned off in Terrain view with the other off, or
 * a summary chosen on the way back to a computed layer.
 *
 * While the winds are shown, as the page says through
 * {@link LayerPanel.setWinds}, the globe shows the latest winds result in
 * the store as arrows over whatever colours it shows: in Terrain view and
 * in the Month view the winds of the month on screen, following the year
 * as it plays; while the layer on screen shows its annual average, their
 * annual mean, worked out once for each result, when first shown; and on
 * any other summary the month last on screen. Winds that are out of date
 * or being worked out again stay on the globe until the next arrive; until
 * there is a result there are none, and when the store drops its result,
 * as for a new world, they go. A field is sent to the globe when it
 * arrives or another month or the annual mean is chosen, not again as the
 * status changes. Turned off, the globe is given no winds. While the winds
 * are shown, the info box's status line is given where the store's winds
 * stand, as {@link windKeyContent} words it, as the pressure's legend does.
 *
 * While the world is the measured Earth, the arrows follow the source, as
 * {@link windSourceFor} says: the observed winds on Observed, and the
 * simulated on Simulated and on Difference. The observed winds are asked of
 * `loadObservedWinds` the first time they are needed on a world, never
 * before: when Observed or Difference is chosen while the winds are shown,
 * or the winds are shown while either is on. They are kept for that world,
 * as a layer's observed year is, by the same epochs: the info box's status
 * line says {@link OBSERVED_WINDS_LOADING_TEXT} until they arrive, the
 * simulated arrows staying meanwhile; if they cannot be loaded, it says
 * {@link OBSERVED_WINDS_FAILED_TEXT}, the source goes back to Simulated if
 * the winds are still shown, and the next time they are needed asks again;
 * and what arrives after a new world, or after the world stopped or started
 * being the measured Earth, is set aside. Observed and arrived, the arrows
 * are drawn from them as from a result: the month's, or on the annual
 * average their mean over the year, worked out once as the result's is; like
 * the result's, they need a result to be shown. They are never out of date,
 * so under them the info box's status line says nothing of the store's
 * winds.
 *
 * Whatever is shown, the info box's status line is also given where the
 * calculation stands, as {@link calculationContent} words it from the
 * store's temperature, which the climate's passes write with the winds, and
 * whether it is paused, as {@link LayerPanel.setPaused} last said; it
 * starts unpaused. So it says the climate is being calculated, and which
 * pass, in Terrain view too, and that the calculation is paused while it
 * is and a result is not current. It is given again whenever the legend
 * is, and at each change of being paused.
 *
 * The legend's scale, ramp, caption and ticks are always those of what the
 * globe shows: what it was last given, or no scale while it shows the height
 * colours, written as the layer that field is of writes its values, with its
 * error figures, in the unit chosen for that layer's quantity, as the page
 * gives the units at the start and by {@link LayerPanel.setUnits}; metric
 * until it does. Each scale is fitted in that unit: the values are
 * converted to it, and the scale fitted, at least the layer's smallest span
 * in that unit wide, and rounded there, so that its ends and ticks are
 * round in it; a seasonal range and a difference convert by the unit's
 * scale alone, and the difference reaches as far either side of zero, and
 * is marked at the step, the layer gives that unit. The globe is given the
 * range back in the metric values it colours by. Each scale is worked out
 * once for each unit, when first shown in it, and kept as the others are.
 * Its line and bar say where the chosen layer's result stands, in that
 * layer's words.
 *
 * Nothing here throws in normal use; what the globe throws reaches the
 * store's record of errors when it comes from a change of the store, and
 * whoever made the choice when it comes from a control. The globe then
 * keeps what it showed, and the legend its scale with it, while the
 * legend's line still says where the store's result stands. For a current
 * result the globe refused, the line says that the earlier field still on
 * the globe is out of date, or, with nothing on the globe, that the layer
 * could not be shown. The field is sent again at the next change. What is
 * thrown while the year plays and moves on by itself goes to `reportError`
 * instead, and the year stops playing, on the month it moved to, so that it
 * is not thrown again every second; the legend is brought up to date as for
 * any other refusal. What is thrown as an observed year arrives goes to
 * `reportError` too.
 *
 * @param options - The store, the layers, the globe, the info box, the
 * timers the year plays by, the observed years'
 * and the observed winds' loaders, whom to tell of the view, of the
 * comparison and of an error with no control to hand it back to.
 * @returns The panel.
 */
export const createLayerPanel = (options: LayerPanelOptions): LayerPanel => {
	const { store, globe } = options;
	const start = options.start ?? DEFAULT_PAGE_VIEW;
	const states: LayerState[] = (options.layers ?? SCALAR_LAYERS).map((spec) => {
		const summary = start.summaries[spec.id];
		return {
			spec,
			summary: offersSummary(spec, summary) ? summary : DEFAULT_SUMMARY,
			derived: null,
			observed: null,
			loading: false,
			message: null,
		};
	});
	let layer: Layer = states.some((state) => state.spec.id === start.layer)
		? start.layer
		: DEFAULT_PAGE_VIEW.layer;
	let sunlight = start.sunlight;
	let windsOn = start.winds;
	/** Whether the cell grid is drawn, as the dock last said. */
	let grid = start.grid;
	/** Where the layer on screen and the winds come from. */
	let source = DEFAULT_PAGE_VIEW.source;
	/** Whether the calculation is paused, as the page last said. */
	let paused = false;
	/** The unit chosen for each quantity, as the page last said. */
	let units = options.units ?? SYSTEM_UNITS.metric;
	/**
	 * What has been worked out from the latest winds result, dropped with it.
	 */
	let derivedWinds: DerivedWinds | null = null;
	/** The winds the globe was last given, or null for none. */
	let shownWinds: WindField | null = null;
	/** Where {@link shownWinds} come from. */
	let shownWindsSource: WindSource = DEFAULT_WIND_SOURCE;
	/** What {@link LayerPanel.shownWinds} gives, as of the latest update. */
	let shownWindsState: ShownWinds | null = null;
	/** The observed winds, as asked for and kept. */
	const observedWinds: ObservedWindsState = {
		observed: null,
		loading: false,
		message: null,
	};
	/**
	 * The world's resolution while it is the measured Earth, as the page
	 * last said; null while it is not, and the comparison is not offered.
	 */
	let earth: Resolution | null = null;
	/**
	 * Counts the changes that set aside an answer from the observed years'
	 * loader still on its way: a new world, and the world starting or
	 * stopping being the measured Earth.
	 */
	let epoch = 0;
	/** What the globe was last given to show, or null for the heights. */
	let shown: Shown | null = null;
	/** What {@link LayerPanel.shown} gives, as of the latest update. */
	let shownLayer: ShownLayer | null = null;

	/** The computed layer on screen, or null in Terrain view. */
	const onScreen = (): LayerState | null =>
		states.find((state) => state.spec.id === layer) ?? null;
	const stateOf = (id: ScalarLayerId): LayerState | undefined =>
		states.find((state) => state.spec.id === id);

	/**
	 * The observed year a result is compared with: the one that has arrived
	 * for this world while the comparison is offered, on the result's grid,
	 * with what was worked out against another dropped. Null when there is
	 * none.
	 */
	const comparedWith = (
		state: LayerState,
		from: Derived,
	): ObservedYear | null => {
		const year = state.observed;
		if (
			earth === null ||
			state.spec.observed === null ||
			year === null ||
			year.resolution !== earth ||
			year.months[0]?.length !== from.months[0]?.length
		) {
			return null;
		}
		if (from.against !== year) {
			from.against = year;
			from.shared.clear();
			from.differences.clear();
			from.figures.clear();
		}
		return year;
	};

	/** What the globe is to show of a result of the layer on screen. */
	const target = (state: LayerState, from: Derived): Shown => {
		const { spec, summary } = state;
		const year = comparedWith(state, from);
		// Until the observed year is there, the simulated is shown.
		const showing: Source = year === null ? 'simulated' : source;
		const view = summaryOf(spec, summary);
		const key: YearFieldKey = summary === 'month' ? playback.month : summary;
		const unit = layerUnit(spec, units);
		/** A difference of the layer's quantity, in the unit. */
		const differenceIn = (metric: number): number =>
			toLayerUnit(spec, unit, metric, true);
		const figures = (): FieldDifference | null => {
			if (year === null) {
				return null;
			}
			const metric = figuresOf(spec, from, year, key);
			return {
				meanDifference: differenceIn(metric.meanDifference),
				rmsDifference: differenceIn(metric.rmsDifference),
			};
		};
		/** What the globe is to show of a field on a scale. */
		const on = (
			field: Float32Array,
			scale: FittedScale,
			ramp: ColourRamp,
			tickStep?: PerUnit,
		): Shown => ({
			field,
			range: scale.metric,
			legend: {
				range: scale.range,
				ramp,
				caption: layerCaption(
					spec,
					summary,
					playback.month,
					earth === null || spec.observed === null ? undefined : showing,
					unit,
				),
				unit,
				tickStep: tickStep === undefined ? undefined : inUnit(tickStep, unit),
				figures: figures(),
			},
			layer: spec,
			summary,
			month: playback.month,
			source: showing,
		});
		/**
		 * A scale in the unit with the same of the metric values, whose
		 * values are differences of the quantity or not.
		 */
		const fitted = (range: ValueRange, isDifference: boolean): FittedScale => ({
			range,
			metric: metricRange(spec, unit, range, isDifference),
		});
		const scaleIn = `${scaleKey(view, key)} ${unit}`;
		const viewDifference = isDifferenceView(view);
		if (year === null) {
			return on(
				yearField(spec, from, key),
				kept(from.scales, scaleIn, () =>
					fitted(
						fitSummaryScale(spec, view, [from], key, unit),
						viewDifference,
					),
				),
				view.ramp,
				view.tickStep,
			);
		}
		const shared = kept(from.shared, scaleIn, () =>
			fitted(
				fitSummaryScale(spec, view, [from, year], key, unit),
				viewDifference,
			),
		);
		switch (showing) {
			case 'simulated':
				return on(yearField(spec, from, key), shared, view.ramp, view.tickStep);
			case 'observed':
				return on(yearField(spec, year, key), shared, view.ramp, view.tickStep);
			case 'difference': {
				// A year is compared only for a layer with a comparison.
				const { difference } = spec.observed as ObservedComparison;
				return on(
					differenceOf(spec, from, year, key),
					fitted(centredRange(inUnit(difference.halfSpan, unit)), true),
					difference.ramp,
					difference.tickStep,
				);
			}
		}
	};

	/**
	 * The observed winds that may be shown in place of a winds result: those
	 * that have arrived for this world while the world is the measured
	 * Earth, on the result's grid. Null when there are none.
	 */
	const observedWindsFor = (from: DerivedWinds): ObservedWinds | null => {
		const year = observedWinds.observed;
		if (
			earth === null ||
			year === null ||
			year.resolution !== earth ||
			year.winds.east[0]?.length !== from.solved.winds.east[0]?.length
		) {
			return null;
		}
		return year;
	};

	/** Whether the wind arrows are the year's mean, as the view settings say. */
	const windsMeanShown = (): boolean => onScreen()?.summary === 'annualMean';

	/**
	 * The winds the globe is to show of a result, or of the observed winds
	 * when given, for the view settings.
	 */
	const windsTarget = (
		from: DerivedWinds,
		observed: ObservedWinds | null,
	): WindField => {
		if (windsMeanShown()) {
			if (observed !== null) {
				observed.mean ??= {
					east: meanOfMonths(observed.winds.east),
					north: meanOfMonths(observed.winds.north),
				};
				return observed.mean;
			}
			from.summary ??= {
				east: meanOfMonths(from.solved.winds.east),
				north: meanOfMonths(from.solved.winds.north),
			};
			return from.summary;
		}
		const year = observed?.winds ?? from.solved.winds;
		const month = playback.month;
		return {
			east: year.east[month] as Float32Array,
			north: year.north[month] as Float32Array,
		};
	};

	/** Brings the arrows on the globe and what is said of them up to date. */
	const updateWinds = (): void => {
		const { result } = store.winds;
		if (derivedWinds !== null && derivedWinds.solved !== result) {
			derivedWinds = null;
		}
		/** The winds the globe is to show, once they are known. */
		let target: WindField | null | undefined;
		try {
			let next: WindField | null = null;
			let nextSource: WindSource = DEFAULT_WIND_SOURCE;
			if (windsOn && result !== null) {
				derivedWinds ??= { solved: result };
				const year = observedWindsFor(derivedWinds);
				// Until the observed winds are there, the simulated are shown.
				if (year !== null && windSourceFor(source) === 'observed') {
					nextSource = 'observed';
				}
				next = windsTarget(
					derivedWinds,
					nextSource === 'observed' ? year : null,
				);
			}
			target = next;
			// Sent again only for other arrays: a month's are the result's
			// own or the observed winds', and each mean is kept with them.
			if (
				next?.east !== shownWinds?.east ||
				next?.north !== shownWinds?.north
			) {
				globe.setWinds(next);
				shownWinds = next;
				shownWindsSource = nextSource;
			}
		} finally {
			// Brought up to date even when the globe throws, which leaves the
			// winds it shows, and so `shownWinds`, as they were. The observed
			// winds are never out of date, whatever the store's winds.
			const observedShown = shownWindsSource === 'observed';
			const showsTarget =
				target !== undefined &&
				target !== null &&
				shownWinds !== null &&
				shownWinds.east === target.east &&
				shownWinds.north === target.north;
			const storeCurrent = store.winds.status === 'current';
			shownWindsState =
				windsOn && shownWinds !== null
					? {
							field: shownWinds,
							source: shownWindsSource,
							current: showsTarget && (observedShown || storeCurrent),
						}
					: null;
			const { state, status } =
				observedShown && showsTarget
					? OBSERVED_WINDS_STATUS
					: windKeyContent({
							status: store.winds.status,
						});
			controls.showWindKey(
				windsOn
					? {
							state,
							// Where the winds themselves stand comes first: the line
							// about the observed winds, loading or failed, shows only
							// while there is nothing else to say.
							status: status ?? observedWinds.message,
						}
					: null,
			);
		}
	};

	/**
	 * Brings what the globe shows of the layer on screen and the legend up to
	 * date.
	 */
	const updateLayer = (): void => {
		const state = onScreen();
		const reading = state === null ? null : state.spec.read(store);
		for (const each of states) {
			const { result } =
				each === state && reading !== null ? reading : each.spec.read(store);
			if (each.derived !== null && each.derived.result !== result) {
				each.derived = null;
			}
		}
		/** The field the globe is to show, once it is known. */
		let field: Float32Array | undefined;
		try {
			if (
				state !== null &&
				reading !== null &&
				reading.result !== null &&
				reading.months !== null
			) {
				state.derived ??= {
					result: reading.result,
					months: reading.months,
					scales: new Map(),
					shared: new Map(),
					differences: new Map(),
					figures: new Map(),
				};
				const next = target(state, state.derived);
				field = next.field;
				// Sent again only for another field or another scale; what
				// only the legend shows, such as its caption, needs no
				// sending.
				if (
					shown === null ||
					shown.field !== next.field ||
					shown.legend.ramp !== next.legend.ramp ||
					shown.range.min !== next.range.min ||
					shown.range.max !== next.range.max
				) {
					globe.setLayer(next.field, next.range, next.legend.ramp);
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
			// field it has is the one chosen. The observed year is never out
			// of date, whatever the store's result; the error figures, worked
			// out from that result, are left off under it while the result is
			// not current.
			const showsResult = shown !== null && shown.field === field;
			const observedShown = shown?.source === 'observed';
			const status = observedShown ? OBSERVED_STATUS : reading;
			const legend =
				shown !== null && observedShown && reading?.status !== 'current'
					? { ...shown.legend, figures: null }
					: (shown?.legend ?? null);
			shownLayer =
				shown === null
					? null
					: {
							layer: shown.layer,
							summary: shown.summary,
							field: shown.field,
							source: shown.source,
							current:
								showsResult && status !== null && status.status === 'current',
						};
			// The scale is written as the layer it shows is, which is not the
			// one chosen while the globe keeps another layer's field.
			controls.showLegend(
				state === null || status === null
					? null
					: legendContent(
							state.spec,
							status,
							legend,
							showsResult,
							shown?.layer,
						),
			);
		}
	};

	/** Brings the globe and what the info box shows up to date. */
	const update = (): void => {
		try {
			updateLayer();
		} finally {
			try {
				updateWinds();
			} finally {
				controls.showCalculation(calculationContent(store.temperature, paused));
			}
		}
	};

	/** The same of each layer's, by its id. */
	const byLayer = <T>(
		pick: (state: LayerState) => T,
	): Readonly<Record<ScalarLayerId, T>> =>
		Object.fromEntries(
			states.map((state) => [state.spec.id, pick(state)]),
		) as Record<ScalarLayerId, T>;
	const view = (): PageView => ({
		layer,
		summaries: byLayer((state) => state.summary),
		source,
		month: playback.month,
		sunlight,
		winds: windsOn,
		grid,
	});
	/** The sources the comparison control offers for the view and world. */
	const offered = (): readonly Source[] =>
		offeredSources(
			earth !== null,
			(onScreen()?.spec.observed ?? null) !== null,
			windsOn,
		);

	/** Puts the source back on Simulated if it is no longer offered. */
	const keepSourceOffered = (): void => {
		if (!offered().includes(source)) {
			source = DEFAULT_SOURCE;
		}
	};

	/** Tells of the view settings, playing and the comparison. */
	const announce = (): void => {
		options.onView?.(view(), playback.playing);
		options.onComparison?.({
			offered: offered(),
			source,
			// The winds' loading and failure lines go to the info box's
			// status line.
			message: onScreen()?.message ?? null,
		});
	};

	/**
	 * Sets aside whatever the observed years' and the observed winds'
	 * loaders have yet to give, and the lines about it.
	 */
	const newEpoch = (): void => {
		epoch++;
		for (const request of [...states, observedWinds]) {
			request.loading = false;
			request.message = null;
		}
	};

	/**
	 * Asks a loader for something observed, unless it is already asked for
	 * in this epoch, saying meanwhile that it loads; what it gives is set
	 * aside if the epoch has moved on by then.
	 *
	 * @param request - Whether it is asked for, and what is said of it.
	 * @param texts - What is said while it loads, and if it fails.
	 * @param load - Asks the loader.
	 * @param arrived - Keeps what the loader gave.
	 * @param failed - Puts the choice back, after a failure.
	 */
	const requestObserved = <T>(
		request: ObservedRequest,
		texts: ObservedTexts,
		load: () => Promise<T>,
		arrived: (value: T) => void,
		failed: () => void,
	): void => {
		if (request.loading) {
			return;
		}
		request.loading = true;
		request.message = texts.loadingText;
		const asked = epoch;
		/** Brings the page up to date with what the loader gave. */
		const settle = (apply: () => void): void => {
			if (asked !== epoch) {
				return;
			}
			request.loading = false;
			apply();
			try {
				announce();
				update();
			} catch (error) {
				options.reportError(error);
			}
		};
		load().then(
			(value) =>
				settle(() => {
					arrived(value);
					request.message = null;
				}),
			(error: unknown) =>
				settle(() => {
					options.reportError(error);
					request.message = texts.failedText;
					failed();
				}),
		);
	};

	/**
	 * Asks for what the source needs and is not on hand for this world,
	 * unless it is already asked for: on Observed or Difference, the
	 * observed year of the layer on screen, and while the winds are shown
	 * the observed winds. A failure puts the source back on Simulated while
	 * what failed is still on screen.
	 */
	const requestNeeded = (): void => {
		if (earth === null || source === 'simulated') {
			return;
		}
		const resolution = earth;
		const state = onScreen();
		const comparison = state?.spec.observed ?? null;
		if (
			state !== null &&
			comparison !== null &&
			state.observed?.resolution !== resolution
		) {
			requestObserved(
				state,
				comparison,
				() => options.loadObserved(state.spec, resolution),
				(months) => {
					state.observed = { resolution, months };
				},
				() => {
					if (onScreen() === state) {
						source = DEFAULT_SOURCE;
					}
				},
			);
		}
		if (windsOn && observedWinds.observed?.resolution !== resolution) {
			requestObserved(
				observedWinds,
				OBSERVED_WINDS_TEXTS,
				() => options.loadObservedWinds(resolution),
				(winds) => {
					observedWinds.observed = { resolution, winds };
				},
				() => {
					if (windsOn) {
						source = DEFAULT_SOURCE;
					}
				},
			);
		}
	};

	const playback = createPlayback({
		month: DEFAULT_PAGE_VIEW.month,
		setTimer: options.setTimer,
		clearTimer: options.clearTimer,
		onMonth: () => {
			// Told first, so that the timeline is on the month even if the
			// globe refuses it.
			announce();
			try {
				update();
			} catch (error) {
				// Nothing calls this but the timer, which would lose the error.
				// Stopped first, so the timeline shows the year not playing even
				// if the report throws.
				playback.pause();
				options.reportError(error);
			}
		},
		onPlayingChange: announce,
	});

	const controls = options.createControls();
	store.addListener(update);
	update();

	return {
		newWorld: (next) => {
			playback.pause();
			const changed =
				playback.month !== DEFAULT_MONTH ||
				earth !== next ||
				source !== DEFAULT_SOURCE ||
				states.some(
					(state) => state.observed !== null || state.message !== null,
				) ||
				observedWinds.observed !== null ||
				observedWinds.message !== null;
			newEpoch();
			earth = next;
			for (const state of states) {
				state.observed = null;
			}
			observedWinds.observed = null;
			source = DEFAULT_SOURCE;
			if (!changed) {
				return;
			}
			playback.setMonth(DEFAULT_MONTH);
			announce();
			update();
		},
		setLayer: (next) => {
			if (next === layer) {
				return;
			}
			layer = next;
			if (!offersMonth(view())) {
				playback.pause();
			}
			keepSourceOffered();
			requestNeeded();
			announce();
			update();
		},
		setSummary: (id, next) => {
			const state = stateOf(id);
			if (
				state === undefined ||
				next === state.summary ||
				!offersSummary(state.spec, next)
			) {
				return;
			}
			state.summary = next;
			if (!offersMonth(view())) {
				playback.pause();
			}
			announce();
			update();
		},
		setSource: (next) => {
			if (next === source) {
				return;
			}
			if (!offered().includes(next)) {
				// Not offered: the control is put back as it was.
				announce();
				return;
			}
			source = next;
			// A choice clears what was said of the observed data, but while
			// any of it is on its way the line says so.
			for (const request of [...states, observedWinds]) {
				if (!request.loading) {
					request.message = null;
				}
			}
			requestNeeded();
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
		setWinds: (on) => {
			if (on === windsOn) {
				return;
			}
			windsOn = on;
			if (!offersMonth(view())) {
				playback.pause();
			}
			keepSourceOffered();
			requestNeeded();
			announce();
			update();
		},
		setGrid: (on) => {
			if (on === grid) {
				return;
			}
			grid = on;
			announce();
		},
		setEarth: (next) => {
			if (next === earth) {
				return;
			}
			newEpoch();
			earth = next;
			source = DEFAULT_SOURCE;
			announce();
			update();
		},
		setMonth: (next) => {
			if (next === playback.month) {
				return;
			}
			playback.setMonth(next);
			announce();
			update();
		},
		togglePlaying: () => {
			if (playback.playing) {
				playback.pause();
			} else {
				playback.play();
			}
		},
		setPaused: (next) => {
			if (next === paused) {
				return;
			}
			paused = next;
			update();
		},
		setUnits: (next) => {
			const changed = states.some(
				(state) => layerUnit(state.spec, next) !== layerUnit(state.spec, units),
			);
			units = next;
			if (changed) {
				update();
			}
		},
		shown: () => shownLayer,
		shownWinds: () => shownWindsState,
	};
};
