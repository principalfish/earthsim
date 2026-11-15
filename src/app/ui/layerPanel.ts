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
 * layer and the winds stand, said on the info box's status line.
 *
 * Each computed layer is shown as its description, a
 * {@link ScalarLayerSpec}, says: its views of the year, their colours and
 * scales, its wording and its comparison. {@link createLayerPanel} decides
 * what the globe and the info box show, from the view settings and
 * the layer store, and switches each layer's calculation on and off with
 * the layer and the winds' with the dock's Winds tile.
 * The info box, given as {@link LayerControls}, only shows what it is
 * told; the layer is chosen on the dock, and told
 * to the panel by {@link LayerPanel.setLayer}, the view of its year and
 * the source on the top bar, told by {@link LayerPanel.setSummary} and
 * {@link LayerPanel.setSource}, and the month and whether the year plays
 * on the timeline, told by {@link LayerPanel.setMonth} and
 * {@link LayerPanel.togglePlaying}.
 */

import {
	compareField,
	differenceField,
	type FieldDifference,
	getGrid,
	type MonthlyTemperature,
	type MonthlyWind,
	type Resolution,
} from '../../core/index';
import { type ColourRamp, centredRange, type ValueRange } from '../globe/ramp';
import type { Globe } from '../globe/renderer';
import type { WindField } from '../globe/wind';
import type { LayerStore, SolvedWinds } from '../layers';
import type { ObservedLoader } from '../observedData';
import { createPlayback, type PlaybackOptions } from '../playback';
import type { TemperatureScheduler, WindsScheduler } from '../refresh';
import {
	fitSummaryScale,
	type LayerYear,
	layerCaption,
	meanOfMonths,
	type ObservedComparison,
	offersSummary,
	SCALAR_LAYERS,
	type ScalarLayerReading,
	type ScalarLayerSpec,
	type ScalarObservedLoader,
	scaleKey,
	summaryOf,
	windsStatus,
	type YearFieldKey,
	yearField,
} from '../scalarLayer';
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
	type Summary,
	type WindSource,
	windSourceFor,
} from '../view';
import type { ComparisonContent } from './comparison';
import { type LegendContent, type LegendSource, legendContent } from './legend';
import {
	OBSERVED_WINDS_FAILED_TEXT,
	OBSERVED_WINDS_LOADING_TEXT,
	type WindKeyContent,
	windKeyContent,
} from './windKey';

/**
 * What the info box shows of the layer and the winds: the legend, and what
 * is said of the winds on its status line.
 */
export type LayerControls = {
	/** Shows a legend, or hides it for null. */
	showLegend(content: LegendContent | null): void;
	/**
	 * Says what is said of the winds, or nothing of them for null while
	 * they are not shown.
	 */
	showWindKey(content: WindKeyContent | null): void;
};

/** What the layer panel joins. */
export type LayerPanelOptions = Pick<
	PlaybackOptions,
	'setTimer' | 'clearTimer'
> & {
	/** Where the computed layers and the winds are kept. */
	readonly store: Pick<LayerStore, 'temperature' | 'winds' | 'addListener'>;
	/**
	 * The computed layers offered, in the order the dock lists them after
	 * Terrain; {@link SCALAR_LAYERS} when left out.
	 */
	readonly layers?: readonly ScalarLayerSpec[];
	/**
	 * The globe the layer and the winds are drawn on, showing the world
	 * already.
	 */
	readonly globe: Pick<Globe, 'setLayer' | 'setWinds'>;
	/**
	 * What calculates the temperature, told whether it is showing: while a
	 * layer it calculates is on screen.
	 */
	readonly temperature: Pick<TemperatureScheduler, 'setShowing'>;
	/**
	 * What calculates the winds, told whether they are showing: while the
	 * dock's Winds tile is on, or a layer they calculate is on screen.
	 */
	readonly winds: Pick<WindsScheduler, 'setShowing'>;
	/** Gives what the info box shows of the layer and the winds. */
	readonly createControls: () => LayerControls;
	/**
	 * Called with the view settings, and whether the year is playing,
	 * whenever any of them changes.
	 */
	readonly onView?: (view: PageView, playing: boolean) => void;
	/**
	 * Gives a layer's observed year on a world's grid; asked the first time
	 * it is needed on a world: when Observed or Difference is chosen with
	 * the layer on screen, or the layer is chosen with either on.
	 */
	readonly loadObserved: ScalarObservedLoader;
	/**
	 * Gives the observed winds on a world's grid; asked the first time they
	 * are needed on a world: when Observed or Difference is chosen with the
	 * winds shown, or the winds are shown with either on.
	 */
	readonly loadObservedWinds: ObservedLoader<MonthlyWind>;
	/**
	 * Called with what the comparison control offers, the source chosen and
	 * the line under it, whenever the view settings are shown.
	 */
	readonly onComparison?: (content: ComparisonContent) => void;
	/**
	 * Told of an error with no control operated to hand it back to: one
	 * thrown while the year plays and moves on by itself, or after an
	 * observed year or the observed winds arrive, and why either could not
	 * be loaded.
	 */
	readonly reportError: (error: unknown) => void;
};

/** What the globe shows of a computed layer, as the layer panel gave it. */
export type ShownLayer = {
	/** The layer the field is of. */
	readonly layer: ScalarLayerSpec;
	/**
	 * The field the globe was last given: one value per cell, in cell order.
	 * It belongs to the panel and must not be changed.
	 */
	readonly field: Float32Array;
	/** Where the field comes from. */
	readonly source: Source;
	/**
	 * Whether the field is the one chosen and up to date: false while the
	 * globe keeps an earlier field than the one chosen and, but for the
	 * observed year, which is never out of date, while the store's result
	 * is out of date, being calculated or no longer calculable; so whenever
	 * the legend marks what it shows as not current.
	 */
	readonly current: boolean;
};

/** What the globe shows of the winds, as the layer panel gave it. */
export type ShownWinds = {
	/**
	 * The winds the globe's arrows were last drawn from, in metres a second:
	 * one eastward and one northward value per cell, in cell order. They
	 * belong to the panel and must not be changed.
	 */
	readonly field: WindField;
	/**
	 * Where they come from: the simulated winds, or the observed Earth's;
	 * the simulation when left out.
	 */
	readonly source?: WindSource;
	/**
	 * Whether they are the winds as chosen and up to date: false while the
	 * globe keeps earlier winds than those chosen, and, but for the observed
	 * winds, which are never out of date, while the store's winds are out of
	 * date, being worked out again or no longer calculable; so whenever the
	 * info box's status line does not say they are current.
	 */
	readonly current: boolean;
};

/** The layer panel, as the page tells it of the world. */
export type LayerPanel = {
	/**
	 * Takes a new world: stops the year playing, puts {@link DEFAULT_MONTH}
	 * on screen and the source back to {@link DEFAULT_SOURCE}, and forgets
	 * the observed years, the observed winds and the comparisons of the
	 * world before.
	 * The layer, each layer's view of the year, the sunlight and the winds
	 * are kept.
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
	 * Takes the layer the globe is to be coloured by, as the dock chose it,
	 * and tells what calculates each layer whether it is showing. A layer
	 * that does not offer the month stops the year playing. A source the
	 * new view does not offer goes back to Simulated; one it does is kept,
	 * and what it needs of the new layer is asked for. The layer on screen
	 * already changes nothing.
	 *
	 * @param layer - The layer chosen.
	 */
	setLayer(layer: Layer): void;
	/**
	 * Takes the view of its year chosen for a computed layer, as the top
	 * bar's Show choice chose it; one the layer does not offer, or the one
	 * it has, changes nothing. A view that does not offer the month stops
	 * the year playing.
	 *
	 * @param layer - The layer it is chosen for.
	 * @param summary - The view of its year chosen.
	 */
	setSummary(layer: ScalarLayerId, summary: Summary): void;
	/**
	 * Takes where the layer on screen and the winds are to come from, as the
	 * top bar's comparison control chose it, and asks for what it needs
	 * that is not on hand; ignored, the control put back, while the source
	 * is not offered.
	 *
	 * @param source - The source chosen.
	 */
	setSource(source: Source): void;
	/**
	 * Takes whether the globe is lit by the sun, as the dock sets it. Turned
	 * on in Terrain view, the month is offered there; turned off there, it
	 * is no longer offered and the year stops playing. On a computed layer
	 * the month is offered as it was either way.
	 *
	 * @param on - Whether the globe is lit by the sun.
	 */
	setSunlight(on: boolean): void;
	/**
	 * Takes whether the winds are shown, as the dock sets it, and
	 * tells what calculates them. Turned on in Terrain view, the month is
	 * offered there, as for sunlight; turned off there with sunlight off
	 * too, it is no longer offered and the year stops playing. Turned
	 * off, the arrows leave the globe, and a source no longer offered goes
	 * back to Simulated; turned on with Observed or Difference chosen, the
	 * observed winds are asked for if they are not on hand.
	 *
	 * @param on - Whether the winds are shown.
	 */
	setWinds(on: boolean): void;
	/**
	 * Puts a month on screen, as the timeline chose it; the month on screen
	 * already changes nothing. While the year plays it carries on from
	 * there, a whole step after the choice.
	 *
	 * @param month - The month, from January at 0 to December at 11.
	 * @throws What the globe throws for the month's field, after the view
	 * settings have been told of the month.
	 */
	setMonth(month: number): void;
	/**
	 * Plays the year from the month on screen, as the timeline's play
	 * button asks, or stops it on that month if it is playing.
	 */
	togglePlaying(): void;
	/**
	 * What the globe shows of a computed layer: exactly what it was last
	 * given, as of the panel's latest update, which follows every change of
	 * the view settings and of the store. Null while it shows the height
	 * colours, as in Terrain view and before there is a result.
	 */
	shown(): ShownLayer | null;
	/**
	 * What the globe shows of the winds: exactly what its arrows were last
	 * drawn from, as of the panel's latest update, which follows every
	 * change of the view settings and of the store. Null while the winds are
	 * off, and while the globe has none, as before there is a result.
	 */
	shownWinds(): ShownWinds | null;
};

/** What the globe is given to show of a layer, and how. */
type Shown = {
	readonly field: Float32Array;
	readonly legend: LegendSource;
	readonly layer: ScalarLayerSpec;
	readonly summary: Summary;
	readonly month: number;
	readonly source: Source;
};

/** A layer's observed year on a world's grid. */
type ObservedYear = LayerYear & {
	readonly resolution: Resolution;
	readonly months: MonthlyTemperature;
};

/**
 * What is worked out from one result, each part when first needed and then
 * kept with it, so that the same arrays and ranges are given again until
 * the next result. What is worked out against an observed year is kept for
 * the observed year it was worked out against.
 */
type Derived = LayerYear & {
	readonly result: object;
	/** The scales fitted to this year alone, by {@link scaleKey}. */
	readonly scales: Map<string, ValueRange>;
	against?: ObservedYear;
	/** The scales fitted to this year and the observed one together. */
	readonly shared: Map<string, ValueRange>;
	readonly differences: Map<YearFieldKey, Float32Array>;
	readonly figures: Map<YearFieldKey, FieldDifference>;
};

/**
 * An observed year asked of a loader, as the panel keeps it: whether it has
 * been asked for in this epoch, and what is said of it.
 */
type ObservedRequest = {
	/** Whether it has been asked for in this epoch. */
	loading: boolean;
	/** What is said of it, its loading or its failure, or null. */
	message: string | null;
};

/** What is said of an observed year while it loads, and when it failed. */
type ObservedTexts = Pick<ObservedComparison, 'loadingText' | 'failedText'>;

/** The observed winds on a world's grid. */
type ObservedWinds = {
	readonly resolution: Resolution;
	readonly winds: MonthlyWind;
	/** Their mean over the year, once worked out. */
	mean?: WindField;
};

/** The observed winds as the panel asks for them and keeps them. */
type ObservedWindsState = ObservedRequest & {
	/** The observed winds, once they have arrived for this world. */
	observed: ObservedWinds | null;
};

/** What is said of the observed winds while they load, and when they failed. */
const OBSERVED_WINDS_TEXTS: ObservedTexts = {
	loadingText: OBSERVED_WINDS_LOADING_TEXT,
	failedText: OBSERVED_WINDS_FAILED_TEXT,
};

/** A computed layer as the panel keeps it. */
type LayerState = ObservedRequest & {
	readonly spec: ScalarLayerSpec;
	/** What of its year it shows, kept while another layer is on screen. */
	summary: Summary;
	/**
	 * What has been worked out from its latest result, dropped with it so
	 * that a result the store no longer holds is not held on to here.
	 */
	derived: Derived | null;
	/** Its observed year, once it has arrived for this world. */
	observed: ObservedYear | null;
};

/**
 * What is worked out from one winds result: its annual mean, when first
 * needed, kept with it until the next result.
 */
type DerivedWinds = {
	readonly solved: SolvedWinds;
	summary?: WindField;
};

/** Where the observed year shown stands: never out of date. */
const OBSERVED_STATUS: Pick<ScalarLayerReading, 'status' | 'progress'> = {
	status: 'current',
	progress: null,
};

/**
 * What is said of observed winds on show: they are never out of date.
 */
const OBSERVED_WINDS_STATUS: WindKeyContent = {
	state: 'current',
	status: null,
};

/** What is kept in a map under a key, worked out and kept if it is not. */
const kept = <K, V>(map: Map<K, V>, key: K, make: () => V): V => {
	let value = map.get(key);
	if (value === undefined) {
		value = make();
		map.set(key, value);
	}
	return value;
};

/**
 * Joins the layer controls to the globe, the layer store and the layers'
 * calculations, starting on {@link DEFAULT_PAGE_VIEW}.
 *
 * @remarks
 * Choosing a computed layer tells what calculates it, the temperature or
 * the winds as its description says, that it is showing, which asks for
 * it if the result on hand is out of date or there is none, and choosing
 * Terrain tells it it is not. The view settings are the page's: a new
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
 * {@link LayerPanel.setWinds}, the winds are told they are showing, which
 * asks for them, and the globe shows the latest winds result in the store as
 * arrows over whatever colours it shows: in Terrain view and in the Month
 * view the winds of the month on screen, following the year as it plays;
 * while the layer on screen shows its annual average, their annual mean,
 * worked out once for each result, when first shown; and on any other
 * summary the month last on screen. Winds that are out of date or being
 * worked out again stay on the globe until the next arrive; until there is a
 * result there are none, and when the store drops its result, as for a new
 * world, they go. A field is sent to the globe when it arrives or another
 * month or the annual mean is chosen, not again as the status changes.
 * Turned off, the winds are told they are not showing, unless the layer on
 * screen is one they calculate, and the globe is given no winds. While the
 * winds are shown, the info box's status line is given where the store's
 * winds stand, as {@link windKeyContent} words it from {@link windsStatus},
 * the rule the pressure's legend follows, so that it says the winds are
 * being worked out while the temperature they wait for is.
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
 * The legend's scale, ramp, caption and ticks are always those of what the
 * globe shows: what it was last given, or no scale while it shows the height
 * colours, written as the layer that field is of writes its values, with its
 * error figures in that layer's unit. Its line and bar say where the chosen
 * layer's result stands, in that layer's words.
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
 * @param options - The store, the layers, the globe, the temperature, the
 * winds, the info box, the timers the year plays by, the observed years'
 * and the observed winds' loaders, whom to tell of the view, of the
 * comparison and of an error with no control to hand it back to.
 * @returns The panel.
 */
export const createLayerPanel = (options: LayerPanelOptions): LayerPanel => {
	const { store, globe, temperature, winds } = options;
	const states: LayerState[] = (options.layers ?? SCALAR_LAYERS).map(
		(spec) => ({
			spec,
			summary: DEFAULT_SUMMARY,
			derived: null,
			observed: null,
			loading: false,
			message: null,
		}),
	);
	let layer: Layer = DEFAULT_PAGE_VIEW.layer;
	let sunlight = DEFAULT_PAGE_VIEW.sunlight;
	let windsOn = DEFAULT_PAGE_VIEW.winds;
	/** Where the layer on screen and the winds come from. */
	let source = DEFAULT_PAGE_VIEW.source;
	/** Whether the temperature was last told it is showing. */
	let temperatureTold = false;
	/** Whether the winds were last told they are showing. */
	let windsTold = false;
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
	const differenceOf = (
		spec: ScalarLayerSpec,
		from: Derived,
		year: ObservedYear,
		key: YearFieldKey,
	): Float32Array =>
		kept(from.differences, key, () =>
			differenceField(yearField(spec, from, key), yearField(spec, year, key)),
		);
	const figuresOf = (
		spec: ScalarLayerSpec,
		from: Derived,
		year: ObservedYear,
		key: YearFieldKey,
	): FieldDifference =>
		kept(from.figures, key, () =>
			compareField(
				yearField(spec, from, key),
				yearField(spec, year, key),
				getGrid(year.resolution),
			),
		);

	/** What the globe is to show of a result of the layer on screen. */
	const target = (state: LayerState, from: Derived): Shown => {
		const { spec, summary } = state;
		const year = comparedWith(state, from);
		// Until the observed year is there, the simulated is shown.
		const showing: Source = year === null ? 'simulated' : source;
		const view = summaryOf(spec, summary);
		const key: YearFieldKey = summary === 'month' ? playback.month : summary;
		const on = (
			field: Float32Array,
			range: ValueRange,
			ramp: ColourRamp,
			tickStep?: number,
		): Shown => ({
			field,
			legend: {
				range,
				ramp,
				caption: layerCaption(
					spec,
					summary,
					playback.month,
					earth === null || spec.observed === null ? undefined : showing,
				),
				tickStep,
				figures: year === null ? null : figuresOf(spec, from, year, key),
			},
			layer: spec,
			summary,
			month: playback.month,
			source: showing,
		});
		if (year === null) {
			return on(
				yearField(spec, from, key),
				kept(from.scales, scaleKey(view, key), () =>
					fitSummaryScale(spec, view, [from], key),
				),
				view.ramp,
				view.tickStep,
			);
		}
		const shared = kept(from.shared, scaleKey(view, key), () =>
			fitSummaryScale(spec, view, [from, year], key),
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
					centredRange(difference.halfSpan),
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
							status: windsStatus(store.temperature.status, store.winds.status),
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
			updateWinds();
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
	 * Tells what calculates the temperature and the winds whether each is
	 * showing, when that has changed: the one that calculates the layer on
	 * screen, and the winds while the dock's Winds tile is on.
	 */
	const tellShowing = (): void => {
		const scheduler = onScreen()?.spec.scheduler;
		const temperatureShowing = scheduler === 'temperature';
		const windsShowing = windsOn || scheduler === 'winds';
		if (temperatureShowing !== temperatureTold) {
			temperatureTold = temperatureShowing;
			temperature.setShowing(temperatureShowing);
		}
		if (windsShowing !== windsTold) {
			windsTold = windsShowing;
			winds.setShowing(windsShowing);
		}
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
			tellShowing();
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
			tellShowing();
			announce();
			update();
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
		shown: () => shownLayer,
		shownWinds: () => shownWindsState,
	};
};
