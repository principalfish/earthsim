/**
 * The view settings that choose what the globe shows. Like the camera and
 * the relief exaggeration, they belong to the page, not to the world: they
 * are not saved, and a new world keeps them, all but the month, which a new
 * world sets back to {@link DEFAULT_MONTH}, and each layer's source, which
 * it sets back to {@link DEFAULT_SOURCE}. Whether the globe is lit by the
 * sun and whether the winds are shown are kept with the rest.
 */

/** What the globe can be coloured by. */
export const LAYERS = ['terrain', 'temperature', 'pressure'] as const;

/** What the globe is coloured by: the height, or a computed layer. */
export type Layer = (typeof LAYERS)[number];

/**
 * A layer that colours the globe by one computed value per cell: every
 * layer but the terrain, which is coloured by its height.
 */
export type ScalarLayerId = Exclude<Layer, 'terrain'>;

/**
 * Whether a layer colours the globe by one computed value per cell, rather
 * than by the height.
 *
 * @param layer - The layer.
 */
export const isScalarLayer = (layer: Layer): layer is ScalarLayerId =>
	layer !== 'terrain';

/** The layers that colour the globe by one computed value per cell. */
export const SCALAR_LAYER_IDS: readonly ScalarLayerId[] =
	LAYERS.filter(isScalarLayer);

/** What the globe is coloured by when the page opens. */
export const DEFAULT_LAYER: Layer = 'terrain';

/** The name the terrain goes by on the page. */
export const TERRAIN_LABEL = 'Terrain';

/**
 * What of a layer's year the globe can show: one month, or a summary of all
 * twelve. A layer offers some of them.
 */
export const SUMMARIES = [
	'month',
	'annualMean',
	'warmest',
	'coldest',
	'range',
] as const;

/**
 * What of a layer's year the globe shows: the month on screen, the mean of
 * the twelve months, the highest or the lowest month's value, or the
 * seasonal range, the highest less the lowest.
 */
export type Summary = (typeof SUMMARIES)[number];

/**
 * What of its year each layer shows when the page opens: the Month view,
 * which every layer offers.
 */
export const DEFAULT_SUMMARY: Summary = 'month';

/** The name each view of the year goes by on the page. */
export const SUMMARY_LABELS: Readonly<Record<Summary, string>> = {
	month: 'Month',
	annualMean: 'Annual average',
	warmest: 'Warmest month',
	coldest: 'Coldest month',
	range: 'Seasonal range',
};

/**
 * Where a layer on the globe comes from: the simulation, the observed
 * Earth, or the one less the other. Only the measured Earth is offered
 * more than the simulation, and only for a layer with an observed year.
 */
export const SOURCES = ['simulated', 'observed', 'difference'] as const;

/**
 * Where a layer on the globe comes from: the simulated year, the observed
 * one, or the simulated less the observed.
 */
export type Source = (typeof SOURCES)[number];

/** Where each layer comes from when the page opens and for a new world. */
export const DEFAULT_SOURCE: Source = 'simulated';

/** The name each source of a layer goes by on the page. */
export const SOURCE_LABELS: Readonly<Record<Source, string>> = {
	simulated: 'Simulated',
	observed: 'Observed',
	difference: 'Difference',
};

/**
 * Where the wind arrows can come from, in the order they are offered: the
 * simulation, or the observed Earth, which only the measured Earth offers.
 */
export const WIND_SOURCES = [
	'simulated',
	'observed',
] as const satisfies readonly Source[];

/** Where the wind arrows come from: the simulated winds or the observed. */
export type WindSource = (typeof WIND_SOURCES)[number];

/**
 * Where the wind arrows come from when the page opens, for a new world and
 * whenever the world stops being the measured Earth.
 */
export const DEFAULT_WIND_SOURCE: WindSource = 'simulated';

/** The months of the year, January first, as the page names them. */
export { MONTH_NAMES } from '../core/index';

/**
 * The month on screen when the page opens and when a new world arrives, as
 * an index into a result's twelve months from January at 0: July.
 */
export const DEFAULT_MONTH = 6;

/** Everything the view settings choose of what the globe shows. */
export type PageView = {
	/** What the globe is coloured by. */
	readonly layer: Layer;
	/**
	 * What of its year each computed layer shows when it is on screen: each
	 * layer keeps its own while another is shown.
	 */
	readonly summaries: Readonly<Record<ScalarLayerId, Summary>>;
	/**
	 * Where each computed layer shown comes from: always the simulation
	 * unless the world is the measured Earth. Each layer keeps its own.
	 */
	readonly sources: Readonly<Record<ScalarLayerId, Source>>;
	/**
	 * The month on screen, from January at 0 to December at 11: the one the
	 * Month view shows and the sun stands in.
	 */
	readonly month: number;
	/** Whether the globe is lit by the sun. */
	readonly sunlight: boolean;
	/** Whether the winds are shown as arrows over the globe. */
	readonly winds: boolean;
};

/** The same value for every computed layer. */
const forEveryLayer = <T>(value: T): Readonly<Record<ScalarLayerId, T>> =>
	Object.fromEntries(SCALAR_LAYER_IDS.map((id) => [id, value])) as Record<
		ScalarLayerId,
		T
	>;

/** The view settings the page opens on. */
export const DEFAULT_PAGE_VIEW: PageView = {
	layer: DEFAULT_LAYER,
	summaries: forEveryLayer(DEFAULT_SUMMARY),
	sources: forEveryLayer(DEFAULT_SOURCE),
	month: DEFAULT_MONTH,
	sunlight: false,
	winds: false,
};

/**
 * What of its year the layer on screen shows, or null in Terrain view.
 *
 * @param view - The view settings.
 */
export const shownSummary = (view: PageView): Summary | null =>
	isScalarLayer(view.layer) ? view.summaries[view.layer] : null;

/**
 * Whether the month on screen is chosen and played in a view: in the Month
 * view of a computed layer, and in Terrain view while the globe is lit by
 * the sun, whose place in the sky follows the month, or the winds, which
 * are those of the month, are shown.
 *
 * @param view - The view settings.
 */
export const offersMonth = (view: PageView): boolean => {
	const summary = shownSummary(view);
	return summary === null ? view.sunlight || view.winds : summary === 'month';
};
