/**
 * The layer panel's public types: what it is given, what it gives the
 * info box, and what it says the globe shows.
 */

import type { MonthlyWind, Resolution } from '../../../core/index';
import type { Globe } from '../../globe/renderer';
import type { WindField } from '../../globe/wind';
import type { LayerStore } from '../../layers/layers';
import type { ObservedLoader } from '../../layers/observedData';
import type { PlaybackOptions } from '../../layers/playback';
import type {
	SCALAR_LAYERS,
	ScalarLayerSpec,
	ScalarObservedLoader,
} from '../../layers/scalar';
import type {
	DEFAULT_MONTH,
	DEFAULT_PAGE_VIEW,
	DEFAULT_SOURCE,
	DEFAULT_SUMMARY,
	Layer,
	PageView,
	ScalarLayerId,
	Source,
	StoredView,
	Summary,
	WindSource,
} from '../../layers/view';
import type { ResolvedUnits } from '../../settings/units';
import type { ComparisonContent } from '../main/comparison';
import type { CalculationContent } from '../main/infoBox';
import type { LegendContent } from '../main/legend';
import type { WindKeyContent } from '../main/windKey';

/**
 * What the info box shows of the layer and the winds: the legend, and what
 * is said of the winds and of the calculation on its status line.
 */
export type LayerControls = {
	/** Shows a legend, or hides it for null. */
	showLegend(content: LegendContent | null): void;
	/**
	 * Says what is said of the winds, or nothing of them for null while
	 * they are not shown.
	 */
	showWindKey(content: WindKeyContent | null): void;
	/** Says where the calculation of the temperature and the winds stands. */
	showCalculation(content: CalculationContent): void;
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
	 * The view settings it starts on, but for the month and the source,
	 * which start on {@link DEFAULT_MONTH} and {@link DEFAULT_SOURCE}; those
	 * of {@link DEFAULT_PAGE_VIEW} when left out. A layer not offered starts
	 * as Terrain, and a view of the year its layer does not offer as
	 * {@link DEFAULT_SUMMARY}.
	 */
	readonly start?: StoredView;
	/**
	 * The unit chosen for each quantity it starts on, which the legend is
	 * written in; metric when left out.
	 */
	readonly units?: ResolvedUnits;
	/**
	 * The globe the layer and the winds are drawn on, showing the world
	 * already.
	 */
	readonly globe: Pick<Globe, 'setLayer' | 'setWinds'>;
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
	/** The view of the layer's year the field is of. */
	readonly summary: Summary;
	/**
	 * The field the globe was last given: one value per cell, in cell order,
	 * in the metric unit of the layer's quantity. It belongs to the panel
	 * and must not be changed.
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
	 * The layer, each layer's view of the year, the sunlight, the winds and
	 * the cell grid are kept.
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
	 * Takes the layer the globe is to be coloured by, as the dock chose it.
	 * A layer that does not offer the month stops the year playing. A source
	 * the new view does not offer goes back to Simulated; one it does is
	 * kept, and what it needs of the new layer is asked for. The layer on
	 * screen already changes nothing.
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
	 * Takes whether the winds are shown, as the dock sets it. Turned on in
	 * Terrain view, the month is
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
	 * Takes whether the cell grid is drawn, as the dock sets it, for the
	 * view settings to say; it changes nothing else.
	 *
	 * @param on - Whether the cell grid is drawn.
	 */
	setGrid(on: boolean): void;
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
	 * Takes whether the calculation of the temperature and the winds is
	 * paused, as the Pause button sets it, for the info box's status line
	 * to say; saying what is already so changes nothing.
	 *
	 * @param paused - Whether it is paused.
	 */
	setPaused(paused: boolean): void;
	/**
	 * Takes the unit chosen for each quantity, as the settings chose them,
	 * and writes the legend in the units of the layers' quantities at once:
	 * its scale fitted again in the new unit, its ticks, caption and error
	 * figures, with no new calculation. The globe is given the field again
	 * only when the scale's ends, rounded in the new unit, cover other
	 * values. A change of no layer's unit changes nothing.
	 *
	 * @param units - The unit for each quantity.
	 */
	setUnits(units: ResolvedUnits): void;
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
