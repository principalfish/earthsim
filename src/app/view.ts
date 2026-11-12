/**
 * The view settings that choose what the globe shows. Like the camera and
 * the relief exaggeration, they belong to the page, not to the world: they
 * are not saved, and a new world keeps them, all but the month, which a new
 * world sets back to {@link DEFAULT_MONTH}, and the temperature's source,
 * which it sets back to {@link DEFAULT_TEMPERATURE_SOURCE}. Whether the
 * globe is lit by the sun is kept with the rest.
 */

/** What the globe can be coloured by. */
export const LAYERS = ['terrain', 'temperature'] as const;

/** What the globe is coloured by: the height, or a computed layer. */
export type Layer = (typeof LAYERS)[number];

/** What the globe is coloured by when the page opens. */
export const DEFAULT_LAYER: Layer = 'terrain';

/** The name each layer goes by on the page. */
export const LAYER_LABELS: Readonly<Record<Layer, string>> = {
	terrain: 'Terrain',
	temperature: 'Temperature',
};

/**
 * What of the temperature's year the globe shows: one month, or a summary
 * of all twelve.
 */
export const TEMPERATURE_VIEWS = [
	'month',
	'annualMean',
	'warmest',
	'coldest',
	'range',
] as const;

/**
 * What of the temperature's year the globe shows: the month on screen, the
 * mean of the twelve months, the warmest or the coldest month's
 * temperature, or the seasonal range, the warmest less the coldest.
 */
export type TemperatureView = (typeof TEMPERATURE_VIEWS)[number];

/** What of the temperature's year the globe shows when the page opens. */
export const DEFAULT_TEMPERATURE_VIEW: TemperatureView = 'month';

/** The name each temperature view goes by on the page. */
export const TEMPERATURE_VIEW_LABELS: Readonly<
	Record<TemperatureView, string>
> = {
	month: 'Month',
	annualMean: 'Annual average',
	warmest: 'Warmest month',
	coldest: 'Coldest month',
	range: 'Seasonal range',
};

/**
 * Where the temperature on the globe comes from: the simulation, the
 * observed Earth, or the one less the other. Only the measured Earth is
 * offered more than the simulation.
 */
export const TEMPERATURE_SOURCES = [
	'simulated',
	'observed',
	'difference',
] as const;

/**
 * Where the temperature on the globe comes from: the simulated year, the
 * observed one, or the simulated less the observed.
 */
export type TemperatureSource = (typeof TEMPERATURE_SOURCES)[number];

/** Where the temperature comes from when the page opens and for a new world. */
export const DEFAULT_TEMPERATURE_SOURCE: TemperatureSource = 'simulated';

/** The name each source of the temperature goes by on the page. */
export const TEMPERATURE_SOURCE_LABELS: Readonly<
	Record<TemperatureSource, string>
> = {
	simulated: 'Simulated',
	observed: 'Observed',
	difference: 'Difference',
};

/** The months of the year, January first, as the page names them. */
export const MONTH_NAMES = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December',
] as const;

/**
 * The month on screen when the page opens and when a new world arrives, as
 * an index into a result's twelve months from January at 0: July.
 */
export const DEFAULT_MONTH = 6;

/** Everything the view settings choose of what the globe shows. */
export type PageView = {
	/** What the globe is coloured by. */
	readonly layer: Layer;
	/** What of the temperature's year is shown in Temperature view. */
	readonly temperatureView: TemperatureView;
	/**
	 * Where the temperature shown comes from: always the simulation unless
	 * the world is the measured Earth.
	 */
	readonly source: TemperatureSource;
	/**
	 * The month on screen, from January at 0 to December at 11: the one the
	 * Month view shows and the sun stands in.
	 */
	readonly month: number;
	/** Whether the globe is lit by the sun. */
	readonly sunlight: boolean;
};

/** The view settings the page opens on. */
export const DEFAULT_PAGE_VIEW: PageView = {
	layer: DEFAULT_LAYER,
	temperatureView: DEFAULT_TEMPERATURE_VIEW,
	source: DEFAULT_TEMPERATURE_SOURCE,
	month: DEFAULT_MONTH,
	sunlight: false,
};

/**
 * Whether the month on screen is chosen and played in a view: in the Month
 * view of Temperature, and in Terrain view while the globe is lit by the
 * sun, whose place in the sky follows the month.
 *
 * @param view - The view settings.
 */
export const offersMonth = (view: PageView): boolean =>
	view.layer === 'temperature'
		? view.temperatureView === 'month'
		: view.sunlight;
