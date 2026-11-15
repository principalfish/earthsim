/**
 * What the globe is coloured by, Terrain or a layer of one computed value
 * per cell, such as Temperature, as the dock over the globe chooses it, and
 * the Layers section: for such a layer, which month or summary of the year
 * is shown, with a slider and a play button for the month, and, on the
 * measured Earth for a layer compared with the observed one, whether it is
 * the simulated value, the observed one or the difference; the slider and
 * the play button in Terrain view too while the globe is lit by the sun or
 * shows the winds; and the legend and the key to the wind arrows, which are
 * laid over the globe rather than in the section. On the measured Earth the
 * wind arrows can be the observed winds rather than the simulated, and the
 * key then says how far apart the two are.
 *
 * Each computed layer is shown as its description, a
 * {@link ScalarLayerSpec}, says: its views of the year, their colours and
 * scales, its wording and its comparison. {@link createLayerPanel} decides
 * what the globe, the legend and the key show, from the view settings and
 * the layer store, and switches each layer's calculation on and off with
 * the layer and the winds' with the dock's Winds tile.
 * {@link createLayerControls} is the section's controls, the legend and the
 * key on the page, which only show what they are told and pass on what is
 * chosen; the layer is chosen on the dock, and told to the panel by
 * {@link LayerPanel.setLayer}.
 */

import {
	compareField,
	differenceField,
	type FieldDifference,
	getGrid,
	type MonthlyTemperature,
	type MonthlyWind,
	type Resolution,
	type WindComparison,
	type WindErrorFigures,
	windErrorFigures,
} from '../../core/index';
import { type ColourRamp, centredRange } from '../globe/ramp';
import type { Globe } from '../globe/renderer';
import type { WindField } from '../globe/wind';
import { DEFAULT_WIND_STYLE, type WindStyle } from '../globe/windMotion';
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
	MONTH_NAMES,
	offersMonth,
	type PageView,
	type ScalarLayerId,
	type Source,
	type Summary,
	type WindSource,
} from '../view';
import { DEFAULT_WIND_UNIT, type WindUnit } from '../windUnits';
import { type ComparisonContent, createComparisonControls } from './comparison';
import {
	createButton,
	createElement,
	createRangeField,
	createSelectField,
} from './fields';
import {
	createLegend,
	type FittedScale,
	type LegendContent,
	type LegendSource,
	legendContent,
} from './legend';
import type { MainView } from './mainView';
import type { WindSourceContent } from './viewPanel';
import {
	createWindKey,
	OBSERVED_WINDS_FAILED_TEXT,
	OBSERVED_WINDS_LOADING_TEXT,
	type WindKeyContent,
	windKeyContent,
} from './windKey';

/** What the layer controls start with and whom they tell of a choice. */
export type LayerControlsOptions = {
	/** The computed layers offered, in the order the dock lists them. */
	readonly layers: readonly ScalarLayerSpec[];
	/** The view settings shown at first, with the year not playing. */
	readonly view: PageView;
	/** Called with a layer and the view of its year chosen for it. */
	readonly onSummary: (layer: ScalarLayerId, summary: Summary) => void;
	/** Called with the month whenever the month slider moves. */
	readonly onMonth: (month: number) => void;
	/** Called when the play button is pressed, to play or to stop. */
	readonly onPlay: () => void;
	/** Called with a layer and the source chosen for it. */
	readonly onSource: (layer: ScalarLayerId, source: Source) => void;
	/**
	 * The unit the key to the wind arrows writes its speeds in at first; m/s
	 * when left out.
	 */
	readonly windUnit?: WindUnit;
	/**
	 * How the winds are drawn at first, which the key follows; as arrows
	 * when left out.
	 */
	readonly windStyle?: WindStyle;
};

/** The layer controls on the page. */
export type LayerControls = {
	/** Shows a legend, or hides it for null. */
	showLegend(content: LegendContent | null): void;
	/** Shows the key to the wind arrows, or hides it for null. */
	showWindKey(content: WindKeyContent | null): void;
	/**
	 * Shows the view settings: the controls of the layer on screen, the
	 * month controls where {@link offersMonth} says, the month on the slider
	 * and whether the year is playing.
	 */
	showView(view: PageView, playing: boolean): void;
	/**
	 * Shows a layer's comparison controls as given, or hides them; a layer
	 * with no comparison has none to show.
	 */
	showComparison(layer: ScalarLayerId, content: ComparisonContent): void;
	/** Writes the speeds of the key to the wind arrows in another unit. */
	setWindUnit(unit: WindUnit): void;
	/**
	 * Shows the key for the winds drawn another way: its arrows for arrows,
	 * a line in their place for streaks.
	 */
	setWindStyle(style: WindStyle): void;
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
	/** Adds the controls to the page. */
	readonly createControls: (options: LayerControlsOptions) => LayerControls;
	/** Called with the view settings whenever any of them changes. */
	readonly onView?: (view: PageView) => void;
	/**
	 * Gives a layer's observed year on a world's grid; asked the first time
	 * Observed or Difference is chosen for the layer on a world.
	 */
	readonly loadObserved: ScalarObservedLoader;
	/**
	 * Gives the observed winds on a world's grid; asked the first time
	 * Observed is chosen for the wind arrows on a world.
	 */
	readonly loadObservedWinds: ObservedLoader<MonthlyWind>;
	/**
	 * Called with whether the choice of where the wind arrows come from is
	 * offered and which is chosen, whenever the view settings are shown.
	 */
	readonly onWindSource?: (content: WindSourceContent) => void;
	/**
	 * Told of an error with no control operated to hand it back to: one
	 * thrown while the year plays and moves on by itself, or after an
	 * observed year or the observed winds arrive, and why either could not
	 * be loaded.
	 */
	readonly reportError: (error: unknown) => void;
	/**
	 * The unit the key to the wind arrows writes its speeds in at first; m/s
	 * when left out.
	 */
	readonly windUnit?: WindUnit;
	/**
	 * How the winds are drawn at first, which the key follows; as arrows
	 * when left out.
	 */
	readonly windStyle?: WindStyle;
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
	/** What of the year the field is. */
	readonly summary: Summary;
	/**
	 * The month on screen when the field was given, from January at 0; what
	 * the field is for the Month view.
	 */
	readonly month: number;
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
	 * Whether they are the year's mean winds, as on a layer's Annual
	 * average; the winds of a month when not.
	 */
	readonly annualMean: boolean;
	/**
	 * While they are the year's mean, the label of the Annual average of the
	 * layer whose view of the year they follow, such as `Annual average` for
	 * the temperature, for the readout to name them by as it names that
	 * layer's values. Left out for a month's winds.
	 */
	readonly annualMeanLabel?: string;
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
	 * key does not say they are current.
	 */
	readonly current: boolean;
};

/** The layer panel, as the page tells it of the world. */
export type LayerPanel = {
	/**
	 * Takes a new world: stops the year playing, puts {@link DEFAULT_MONTH}
	 * on screen, every layer's source back to {@link DEFAULT_SOURCE} and the
	 * winds' to {@link DEFAULT_WIND_SOURCE}, and forgets the observed years,
	 * the observed winds and the comparisons of the world before.
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
	 * that does not offer the month stops the year playing. The layer on
	 * screen already changes nothing.
	 *
	 * @param layer - The layer chosen.
	 */
	setLayer(layer: Layer): void;
	/**
	 * Takes whether the globe is lit by the sun, as the dock sets it. Turned
	 * on in Terrain view, the month controls show there; turned off there,
	 * they are hidden again and the year stops playing. On a computed layer
	 * the controls are as they were either way.
	 *
	 * @param on - Whether the globe is lit by the sun.
	 */
	setSunlight(on: boolean): void;
	/**
	 * Takes whether the winds are shown, as the dock sets it, and
	 * tells what calculates them. Turned on in Terrain view, the month
	 * controls show there, as for sunlight; turned off there with sunlight
	 * off too, they are hidden again and the year stops playing. Turned
	 * off, the arrows leave the globe.
	 *
	 * @param on - Whether the winds are shown.
	 */
	setWinds(on: boolean): void;
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
	/**
	 * Writes the speeds of the key to the wind arrows, and how far off the
	 * winds are, in another unit. The arrows on the globe are as they were.
	 *
	 * @param unit - The unit to write them in.
	 */
	setWindUnit(unit: WindUnit): void;
	/**
	 * Shows the key for the winds drawn another way, as arrows or as
	 * streaks; the winds on the globe and what the key says of them stay as
	 * they are.
	 *
	 * @param style - How the winds are drawn.
	 */
	setWindStyle(style: WindStyle): void;
	/**
	 * Takes where the wind arrows are to come from, as the view controls
	 * chose it; ignored, the controls put back, while the world is not the
	 * measured Earth.
	 *
	 * @param source - The source chosen.
	 */
	setWindSource(source: WindSource): void;
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
	readonly scales: Map<string, FittedScale>;
	against?: ObservedYear;
	/** The scales fitted to this year and the observed one together. */
	readonly shared: Map<string, FittedScale>;
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

/** Where the wind arrows come from, as the panel keeps it. */
type WindSourceState = ObservedRequest & {
	/** The source chosen. */
	source: WindSource;
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
	/** Where it comes from, kept while another layer is on screen. */
	source: Source;
	/**
	 * What has been worked out from its latest result, dropped with it so
	 * that a result the store no longer holds is not held on to here.
	 */
	derived: Derived | null;
	/** Its observed year, once it has arrived for this world. */
	observed: ObservedYear | null;
};

/**
 * What is worked out from one winds result: its annual mean and its error
 * figures against the observed winds, each when first needed, kept with it
 * until the next result; the figures for the observed winds they were
 * worked out against.
 */
type DerivedWinds = {
	readonly solved: SolvedWinds;
	summary?: WindField;
	against?: ObservedWinds;
	comparison?: WindComparison;
};

/** Where the observed year shown stands: never out of date. */
const OBSERVED_STATUS: Pick<ScalarLayerReading, 'status' | 'progress'> = {
	status: 'current',
	progress: null,
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
 * year and its own source while another is on screen.
 *
 * On a computed layer, the globe shows the latest result in the store, as
 * the layer's description reads it: the month on screen or a summary of
 * the year it offers, such as, for the temperature, its annual mean, its
 * warmest or coldest month, or its seasonal range. Each view is drawn in
 * its own colours on a scale fitted as it says: the temperature's four
 * temperatures on one scale fitted to the result's whole year, so the
 * colours do not change their meaning as the month moves on or another
 * summary is chosen, spanning the middle 99% of the year's values by area,
 * as `fitRange` fits it with the cell areas of `cellWeights`;
 * colder and hotter places take the end colours, and the legend says so at
 * each end beyond which the year holds values, the same in every month and
 * summary. The temperature's seasonal range has a scale of its own, from
 * zero up to the largest range in the world, marked at its own step, with
 * nothing beyond it; a layer centred on a value, as `fitRangeCentred`
 * fits it, reaches as far either side of it. Every scale is at least the
 * layer's smallest span. The summaries and scales are worked out once for
 * each result, when first shown, and kept until the next result or until
 * the store drops this one, so each is sent to the globe once. Until there
 * is a result, the globe shows the height colours and the legend says why.
 * A result that is out of date, or being calculated again, stays on the
 * globe until the next arrives. A field is sent to the globe when it
 * arrives or another month or summary is chosen, or its scale changes, not
 * again as its status or progress change. When the store drops its result,
 * as when the world is replaced, the globe goes back to the height colours.
 * In Terrain view, the globe shows the height colours and the legend is
 * hidden.
 *
 * While the world is the measured Earth, as the page says through
 * {@link LayerPanel.newWorld} and {@link LayerPanel.setEarth}, a layer with
 * an observed year offers the comparison: its source, Simulated, Observed
 * or Difference, simulated less observed. Once the world stops being the
 * measured Earth every source goes back to Simulated and the choice is
 * hidden; when it is the measured Earth again, the choice comes back, on
 * Simulated. A layer's observed year is asked for the first time Observed
 * or Difference is chosen for it on a world, and kept for that world; the
 * globe goes on showing the simulated year until it arrives, and the
 * comparison's line says the layer's words for its loading. If it cannot
 * be loaded, the line says the layer's words for that, the source goes
 * back to Simulated, and the next choice of Observed or Difference asks
 * again. What arrives after the world was replaced, or after it stopped or
 * started being the measured Earth, is set aside. Like the result's fields,
 * the observed year's summaries, the differences and the error figures are
 * each worked out once when first needed, the differences and figures
 * with each result and dropped with it, so that each field is one array
 * sent to the globe once.
 *
 * While the comparison is offered and the observed year has arrived, the
 * simulated and the observed years share each scale, fitted as above to
 * their 24 months together, the same in every month and summary, and a
 * scale from zero runs up to the largest of either; until then, and once
 * the world stops being the measured Earth, the simulated year has its
 * own. The difference, of every month and summary, is drawn in the colours
 * of the layer's difference on a scale centred on zero and reaching as far
 * either way as it says, marked at its step, whose legend always says what
 * lies beyond both ends. The legend then also gives the error figures of
 * the simulated field for the month or summary on screen against the
 * observed one, as {@link compareField} works them out, whichever the
 * source, except under the observed year while the store's result is not
 * current, as while it is out of date or being calculated again. The
 * observed year is never marked out of date; the difference is marked
 * whenever the simulated year would be. All three need a result: until
 * there is one, the globe shows the height colours.
 *
 * In the Month view, and in Terrain view while the globe is lit by the sun
 * or shows the winds, the play button plays the year, a month a second and
 * from December back to January. A move of the slider while it plays is
 * where it carries on from: each move restarts the wait of a whole second.
 * It stops when pressed again, on a new world, and whenever a change of the
 * view hides the month controls, as {@link offersMonth} decides: another
 * view of the year, Terrain without sunlight or winds, sunlight or the
 * winds turned off in Terrain view with the other off, or a summary chosen
 * on the way back to a computed layer.
 *
 * While the winds are shown, as the page says through
 * {@link LayerPanel.setWinds}, the winds are told they are showing, which
 * asks for them, and the globe shows the latest winds result in the store
 * as arrows over whatever colours it shows: in Terrain view and in the
 * Month view the winds of the month on screen, following the year as it
 * plays; while the layer on screen shows its annual average, their annual
 * mean, worked out once for each result, when first shown; and on any
 * other summary the month last on screen. Winds that are out of date or
 * being worked out again stay on the globe until the next arrive; until
 * there is a result there are none, and when the store drops its result,
 * as for a new world, they go. A field is sent to
 * the globe when it arrives or another month or the annual mean is chosen,
 * not again as the status changes. Turned off, the winds are told they are
 * not showing, unless the layer on screen is one they calculate, and the
 * globe is given no winds. The key to the arrows shows while the winds are
 * shown, its line saying where the store's winds stand, as
 * {@link windKeyContent} words it from {@link windsStatus}, the rule the
 * pressure's legend follows, so that it says the winds are being worked
 * out while the temperature they wait for is; and its speeds in the unit
 * given, m/s when none is, or the one last set through
 * {@link LayerPanel.setWindUnit}.
 *
 * While the world is the measured Earth, the arrows can be the observed
 * winds instead, as chosen through {@link LayerPanel.setWindSource} and
 * told back through `onWindSource` with whether the choice is offered,
 * whenever the view settings are shown. The source is put back on
 * Simulated, and the choice is not offered, exactly when a layer's source
 * is: whenever the world stops being the measured Earth, and for a new
 * world. The observed winds are asked of `loadObservedWinds` the first
 * time Observed is chosen on a world, never before, and kept for that
 * world, as a layer's observed year is, by the same epochs: the key's line
 * says {@link OBSERVED_WINDS_LOADING_TEXT} until they arrive, the
 * simulated arrows staying meanwhile; if they cannot be loaded, it says
 * {@link OBSERVED_WINDS_FAILED_TEXT}, the source goes back to Simulated,
 * and the next choice of Observed asks again; and what arrives after a new
 * world, or after the world stopped or started being the measured Earth,
 * is set aside. Observed and arrived, the arrows are drawn from them as
 * from a result: the month's, or on the annual average their mean over the
 * year, worked out once as the result's is; like the result's, they need
 * a result to be shown. They are never out of date, so under them the
 * key's line says nothing of the store's winds.
 *
 * From the time the observed winds have arrived, while the world is the
 * measured Earth and there is a winds result, the key also gives how far
 * the result is from them, whichever the source: the figures
 * `windErrorFigures` works out, once for each result and observed winds,
 * for the month the arrows are of, or for the year while they are its
 * mean. Under the observed winds they are left off while the store's winds
 * are not current, as the legend leaves off a layer's figures under its
 * observed year; under the simulated they stay.
 *
 * The legend's scale, ramp, caption, ticks and words for what lies beyond
 * the ends are always those of what the globe shows: what it was last
 * given, or no scale while it shows the height colours, written as the
 * layer that field is of writes its values, with its error figures in that
 * layer's unit. Its line and bar say where the chosen layer's result
 * stands, in that layer's words.
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
 * winds, the controls, the timers the year plays by, the observed years'
 * and the observed winds' loaders, whom to tell of the view, of the choice
 * of the winds' source and of an error with no control to hand it back to.
 * @returns The panel.
 */
export const createLayerPanel = (options: LayerPanelOptions): LayerPanel => {
	const { store, globe, temperature, winds } = options;
	const states: LayerState[] = (options.layers ?? SCALAR_LAYERS).map(
		(spec) => ({
			spec,
			summary: DEFAULT_SUMMARY,
			source: DEFAULT_SOURCE,
			derived: null,
			observed: null,
			loading: false,
			message: null,
		}),
	);
	let layer: Layer = DEFAULT_PAGE_VIEW.layer;
	let sunlight = DEFAULT_PAGE_VIEW.sunlight;
	let windsOn = DEFAULT_PAGE_VIEW.winds;
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
	/** Whether {@link shownWinds} is a result's annual mean. */
	let shownWindsMean = false;
	/**
	 * The label of the Annual average of the layer whose view of the year
	 * {@link shownWinds} followed, while they are the annual mean.
	 */
	let shownWindsMeanLabel: string | undefined;
	/** Where {@link shownWinds} come from. */
	let shownWindsSource: WindSource = DEFAULT_WIND_SOURCE;
	/** What {@link LayerPanel.shownWinds} gives, as of the latest update. */
	let shownWindsState: ShownWinds | null = null;
	/** Where the wind arrows come from, and the observed winds. */
	const windSource: WindSourceState = {
		source: DEFAULT_WIND_SOURCE,
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
		const showing: Source = year === null ? 'simulated' : state.source;
		const view = summaryOf(spec, summary);
		const key: YearFieldKey = summary === 'month' ? playback.month : summary;
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
				caption: layerCaption(
					spec,
					summary,
					playback.month,
					earth === null || spec.observed === null ? undefined : showing,
				),
				beyond,
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
					{
						range: centredRange(difference.halfSpan),
						beyond: { below: true, above: true },
					},
					difference.ramp,
					difference.tickStep,
				);
			}
		}
	};

	/**
	 * The observed winds a winds result is compared with: those that have
	 * arrived for this world while the world is the measured Earth, on the
	 * result's grid, with the figures worked out against others dropped.
	 * Null when there are none.
	 */
	const observedWindsFor = (from: DerivedWinds): ObservedWinds | null => {
		const year = windSource.observed;
		if (
			earth === null ||
			year === null ||
			year.resolution !== earth ||
			year.winds.east[0]?.length !== from.solved.winds.east[0]?.length
		) {
			return null;
		}
		if (from.against !== year) {
			from.against = year;
			from.comparison = undefined;
		}
		return year;
	};

	/** Whether the wind arrows are the year's mean, as the view settings say. */
	const windsMeanShown = (): boolean => onScreen()?.summary === 'annualMean';

	/**
	 * The error figures of a winds result against the observed winds, for
	 * the month on screen or, with the year's mean shown, the year: all of
	 * them worked out once for each result and observed winds.
	 */
	const windFiguresOf = (
		from: DerivedWinds,
		year: ObservedWinds,
	): WindErrorFigures => {
		const { winds: simulated } = from.solved;
		// The figures read only the winds; the simulated pressure stands in
		// for the observed, which is not fetched for the winds.
		from.comparison ??= windErrorFigures(
			simulated,
			{ ...year.winds, pressure: simulated.pressure },
			getGrid(year.resolution),
		);
		return windsMeanShown()
			? from.comparison.year
			: (from.comparison.months[playback.month] as WindErrorFigures);
	};

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

	/** Brings the arrows on the globe and the key up to date. */
	const updateWinds = (): void => {
		const { result } = store.winds;
		if (derivedWinds !== null && derivedWinds.solved !== result) {
			derivedWinds = null;
		}
		/** The winds the globe is to show, once they are known. */
		let target: WindField | null | undefined;
		/** The figures the key is to give, once they are known. */
		let figures: WindErrorFigures | null = null;
		try {
			let next: WindField | null = null;
			let nextSource: WindSource = DEFAULT_WIND_SOURCE;
			if (windsOn && result !== null) {
				derivedWinds ??= { solved: result };
				const year = observedWindsFor(derivedWinds);
				// Until the observed winds are there, the simulated are shown.
				if (year !== null && windSource.source === 'observed') {
					nextSource = 'observed';
				}
				next = windsTarget(
					derivedWinds,
					nextSource === 'observed' ? year : null,
				);
				figures = year === null ? null : windFiguresOf(derivedWinds, year);
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
				shownWindsMean =
					next !== null &&
					(next === derivedWinds?.summary ||
						next === windSource.observed?.mean);
				shownWindsSource = nextSource;
			}
			// Reached only with the winds on the globe as chosen, so the mean
			// is of the layer on screen's Annual average, whichever layer that
			// is now; the same mean is not sent again for another layer's.
			const state = onScreen();
			shownWindsMeanLabel =
				shownWindsMean && state !== null
					? summaryOf(state.spec, 'annualMean').label
					: undefined;
		} finally {
			// Brought up to date even when the globe throws, which leaves the
			// winds it shows, and so `shownWinds`, as they were. The observed
			// winds are never out of date, whatever the store's winds; the
			// figures, worked out from those, are left off under them while
			// the store's winds are not current, as the legend leaves off a
			// layer's figures under its observed year.
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
							annualMean: shownWindsMean,
							annualMeanLabel: shownWindsMeanLabel,
							source: shownWindsSource,
							current: showsTarget && (observedShown || storeCurrent),
						}
					: null;
			const status =
				observedShown && showsTarget
					? null
					: windKeyContent({
							status: windsStatus(store.temperature.status, store.winds.status),
						}).status;
			const shownFigures =
				figures === null || (observedShown && !storeCurrent) ? null : figures;
			controls.showWindKey(
				windsOn
					? {
							// Where the winds themselves stand comes first: the line
							// about the observed winds, loading or failed, shows only
							// while there is nothing else to say.
							status: status ?? windSource.message,
							...(shownFigures === null ? {} : { figures: shownFigures }),
						}
					: null,
			);
		}
	};

	/** Brings what the globe shows of the layer on screen and the legend up to date. */
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
							summary: shown.summary,
							month: shown.month,
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

	/** Brings the globe, the legend and the key up to date. */
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
		sources: byLayer((state) => state.source),
		month: playback.month,
		sunlight,
		winds: windsOn,
	});
	/** Shows the view settings and the comparisons, and tells of them. */
	const announce = (): void => {
		controls.showView(view(), playback.playing);
		for (const state of states) {
			if (state.spec.observed !== null) {
				controls.showComparison(state.spec.id, {
					offered: layer === state.spec.id && earth !== null,
					source: state.source,
					message: state.message,
				});
			}
		}
		options.onWindSource?.({
			offered: earth !== null,
			source: windSource.source,
		});
		options.onView?.(view());
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
		for (const request of [...states, windSource]) {
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

	/** Asks for a layer's observed year, unless it is already asked for. */
	const requestObservedYear = (
		state: LayerState,
		comparison: ObservedComparison,
		resolution: Resolution,
	): void =>
		requestObserved(
			state,
			comparison,
			() => options.loadObserved(state.spec, resolution),
			(months) => {
				state.observed = { resolution, months };
			},
			() => {
				state.source = DEFAULT_SOURCE;
			},
		);

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
		layers: states.map((state) => state.spec),
		view: view(),
		windUnit: options.windUnit ?? DEFAULT_WIND_UNIT,
		windStyle: options.windStyle ?? DEFAULT_WIND_STYLE,
		onSummary: (id, next) => {
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
		onSource: (id, next) => {
			const state = stateOf(id);
			if (state === undefined || next === state.source) {
				return;
			}
			const comparison = state.spec.observed;
			if (earth === null || comparison === null) {
				// Not offered: the controls are put back as they were.
				announce();
				return;
			}
			state.source = next;
			if (
				next !== 'simulated' &&
				(state.observed === null || state.observed.resolution !== earth)
			) {
				requestObservedYear(state, comparison, earth);
			}
			// While the observed year is on its way the line says so, whatever
			// is chosen meanwhile; otherwise a choice clears it.
			state.message = state.loading ? comparison.loadingText : null;
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
				states.some(
					(state) =>
						state.source !== DEFAULT_SOURCE ||
						state.observed !== null ||
						state.message !== null,
				) ||
				windSource.source !== DEFAULT_WIND_SOURCE ||
				windSource.observed !== null ||
				windSource.message !== null;
			newEpoch();
			earth = next;
			for (const state of states) {
				state.observed = null;
				state.source = DEFAULT_SOURCE;
			}
			windSource.observed = null;
			windSource.source = DEFAULT_WIND_SOURCE;
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
			tellShowing();
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
			for (const state of states) {
				state.source = DEFAULT_SOURCE;
			}
			windSource.source = DEFAULT_WIND_SOURCE;
			announce();
			update();
		},
		shown: () => shownLayer,
		shownWinds: () => shownWindsState,
		setWindUnit: (unit) => controls.setWindUnit(unit),
		setWindStyle: (style) => controls.setWindStyle(style),
		setWindSource: (next) => {
			if (next === windSource.source) {
				return;
			}
			if (earth === null) {
				// Not offered: the controls are put back as they were.
				announce();
				return;
			}
			windSource.source = next;
			if (
				next === 'observed' &&
				(windSource.observed === null ||
					windSource.observed.resolution !== earth)
			) {
				const resolution = earth;
				requestObserved(
					windSource,
					OBSERVED_WINDS_TEXTS,
					() => options.loadObservedWinds(resolution),
					(winds) => {
						windSource.observed = { resolution, winds };
					},
					() => {
						windSource.source = DEFAULT_WIND_SOURCE;
					},
				);
			}
			// While the observed winds are on their way the key says so,
			// whatever is chosen meanwhile; otherwise a choice clears it.
			windSource.message = windSource.loading
				? OBSERVED_WINDS_LOADING_TEXT
				: null;
			announce();
			update();
		},
	};
};

/**
 * The class of the box in the Layers section that holds the computed
 * layers' own controls and the month controls: named for the temperature,
 * the first such layer, as the stylesheet styles it.
 */
const LAYER_CONTROLS_CLASS = 'temperature-view';

/** The id of the month slider, which every layer and Terrain share. */
const MONTH_SLIDER_ID = 'temperature-month';

/**
 * Adds the layer controls to the Layers section of the side panel, the
 * computed layers' view controls, and the legend and the key to the wind
 * arrows to their places over the globe.
 *
 * @remarks
 * Each computed layer's controls show only while it is on screen: a
 * drop-down of the views of its year it offers, with the id its
 * description gives; and under it, for a layer with an observed year, the
 * comparison controls of {@link createComparisonControls}, hidden unless
 * they are offered. Under them all, for the Month view, a slider from
 * January to December, which a screen reader hears by the month's name,
 * and a play button. The slider and the button show in Terrain view too
 * while the globe is lit by the sun or shows the winds, on their own. The
 * button is a toggle whose pressed state says whether the year is playing.
 *
 * The legend and the key to the wind arrows are shown and hidden only as
 * they are told, whether the Layers section is open or closed.
 *
 * @param body - The section's body, to add the controls to, after what it
 * holds.
 * @param places - Where the legend and the key go, over the globe, each
 * after what its place holds.
 * @param options - The layers offered, the starting view settings and whom
 * to tell of a choice.
 * @returns The controls, with the legend and the key hidden.
 */
export const createLayerControls = (
	body: HTMLElement,
	places: Pick<MainView, 'legend' | 'windKey'>,
	options: LayerControlsOptions,
): LayerControls => {
	const legend = createLegend();
	const windKey = createWindKey(
		options.windUnit ?? DEFAULT_WIND_UNIT,
		options.windStyle ?? DEFAULT_WIND_STYLE,
	);

	const layerControls = createElement('div', LAYER_CONTROLS_CLASS);
	const own = options.layers.map((layer) => {
		const show = createSelectField({
			id: layer.summaryControlId,
			label: 'Show',
			choices: layer.summaries.map(({ id, label }) => ({ value: id, label })),
			value: options.view.summaries[layer.id],
			onChange: (summary) => options.onSummary(layer.id, summary),
		});
		show.classList.add(`${LAYER_CONTROLS_CLASS}__show`);
		layerControls.append(show);
		const comparison =
			layer.observed === null
				? null
				: createComparisonControls(layerControls, {
						observed: layer.observed,
						source: options.view.sources[layer.id],
						onSource: (source) => options.onSource(layer.id, source),
					});
		return { layer, show, comparison };
	});

	const monthControls = createElement('div', 'month-controls');
	const month = createRangeField({
		id: MONTH_SLIDER_ID,
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
	layerControls.append(monthControls);

	const showView = (view: PageView, playing: boolean): void => {
		const monthShown = offersMonth(view);
		const layerShown = own.some(({ layer }) => layer.id === view.layer);
		layerControls.hidden = !layerShown && !monthShown;
		for (const { layer, show } of own) {
			show.hidden = layer.id !== view.layer;
		}
		monthControls.hidden = !monthShown;
		month.setValue(view.month);
		play.setAttribute('aria-pressed', String(playing));
	};
	showView(options.view, false);

	body.append(layerControls);
	places.legend.append(legend.element);
	places.windKey.append(windKey.element);
	return {
		showLegend: legend.show,
		showWindKey: windKey.show,
		setWindUnit: windKey.setUnit,
		setWindStyle: windKey.setStyle,
		showView,
		showComparison: (layer, content) =>
			own.find((each) => each.layer.id === layer)?.comparison?.show(content),
	};
};
