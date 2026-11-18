/**
 * What the layer panel keeps of the layers, the observed years and the
 * winds, and the constants it says of them.
 */

import type {
	FieldDifference,
	MonthlyTemperature,
	MonthlyWind,
	Resolution,
} from '../../../core/index';
import type { ValueRange } from '../../globe/ramp';
import type { WindField } from '../../globe/wind';
import type { SolvedWinds } from '../../layers/layers';
import type {
	LayerYear,
	ObservedComparison,
	ScalarLayerReading,
	ScalarLayerSpec,
	scaleKey,
	YearFieldKey,
} from '../../layers/scalar';
import type { Source, Summary } from '../../layers/view';
import type { LegendSource } from '../main/legend';
import {
	OBSERVED_WINDS_FAILED_TEXT,
	OBSERVED_WINDS_LOADING_TEXT,
	type WindKeyContent,
} from '../main/windKey';

/** What the globe is given to show of a layer, and how. */
export type Shown = {
	readonly field: Float32Array;
	/** The range the globe colours the field on, in the metric unit. */
	readonly range: ValueRange;
	readonly legend: LegendSource;
	readonly layer: ScalarLayerSpec;
	readonly summary: Summary;
	readonly month: number;
	readonly source: Source;
};

/** A layer's observed year on a world's grid. */
export type ObservedYear = LayerYear & {
	readonly resolution: Resolution;
	readonly months: MonthlyTemperature;
};

/**
 * What is worked out from one result, each part when first needed and then
 * kept with it, so that the same arrays and ranges are given again until
 * the next result. What is worked out against an observed year is kept for
 * the observed year it was worked out against.
 */
export type Derived = LayerYear & {
	readonly result: object;
	/**
	 * The scales fitted to this year alone, by {@link scaleKey} and the
	 * unit they are fitted in.
	 */
	readonly scales: Map<string, FittedScale>;
	against?: ObservedYear;
	/**
	 * The scales fitted to this year and the observed one together, by
	 * {@link scaleKey} and unit.
	 */
	readonly shared: Map<string, FittedScale>;
	readonly differences: Map<YearFieldKey, Float32Array>;
	readonly figures: Map<YearFieldKey, FieldDifference>;
};

/**
 * A scale as it is fitted in a unit, and as the globe is given it, so that
 * the same ranges are given again while it is kept.
 */
export type FittedScale = {
	/** The range in the unit, which the legend is marked along. */
	readonly range: ValueRange;
	/** The same range of the metric values the globe colours by. */
	readonly metric: ValueRange;
};

/**
 * An observed year asked of a loader, as the panel keeps it: whether it has
 * been asked for in this epoch, and what is said of it.
 */
export type ObservedRequest = {
	/** Whether it has been asked for in this epoch. */
	loading: boolean;
	/** What is said of it, its loading or its failure, or null. */
	message: string | null;
};

/** What is said of an observed year while it loads, and when it failed. */
export type ObservedTexts = Pick<
	ObservedComparison,
	'loadingText' | 'failedText'
>;

/** The observed winds on a world's grid. */
export type ObservedWinds = {
	readonly resolution: Resolution;
	readonly winds: MonthlyWind;
	/** Their mean over the year, once worked out. */
	mean?: WindField;
};

/** The observed winds as the panel asks for them and keeps them. */
export type ObservedWindsState = ObservedRequest & {
	/** The observed winds, once they have arrived for this world. */
	observed: ObservedWinds | null;
};

/** What is said of the observed winds while they load, and when they failed. */
export const OBSERVED_WINDS_TEXTS: ObservedTexts = {
	loadingText: OBSERVED_WINDS_LOADING_TEXT,
	failedText: OBSERVED_WINDS_FAILED_TEXT,
};

/** A computed layer as the panel keeps it. */
export type LayerState = ObservedRequest & {
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
export type DerivedWinds = {
	readonly solved: SolvedWinds;
	summary?: WindField;
};

/** Where the observed year shown stands: never out of date. */
export const OBSERVED_STATUS: Pick<ScalarLayerReading, 'status'> = {
	status: 'current',
};

/**
 * What is said of observed winds on show: they are never out of date.
 */
export const OBSERVED_WINDS_STATUS: WindKeyContent = {
	state: 'current',
	status: null,
};

/** What is kept in a map under a key, worked out and kept if it is not. */
export const kept = <K, V>(map: Map<K, V>, key: K, make: () => V): V => {
	let value = map.get(key);
	if (value === undefined) {
		value = make();
		map.set(key, value);
	}
	return value;
};
