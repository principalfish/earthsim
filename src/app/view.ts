/**
 * The view settings that choose what the globe shows. Like the camera and
 * the relief exaggeration, they belong to the page, not to the world: they
 * are not saved, and a new world keeps them, all but the month, which a new
 * world sets back to {@link DEFAULT_MONTH}.
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
	 * The month on screen for the Month view, from January at 0 to
	 * December at 11.
	 */
	readonly month: number;
};

/** The view settings the page opens on. */
export const DEFAULT_PAGE_VIEW: PageView = {
	layer: DEFAULT_LAYER,
	temperatureView: DEFAULT_TEMPERATURE_VIEW,
	month: DEFAULT_MONTH,
};
