/**
 * What a layer that colours the globe by one computed value per cell is
 * described by: the types of a layer's description and of the views of its
 * year it offers, and the lookup of a view among them.
 */

import type { MonthlyTemperature, Resolution } from '../../../core/index';
import type { SunlightStyle } from '../../globe/material';
import type { ColourRamp } from '../../globe/ramp';
import type { Quantity, UnitOf } from '../../settings/units';
import type { LayerStatus, LayerStore } from '../layers';
import type { ObservedLoader } from '../observedData';
import type { ScalarLayerId, Summary } from '../view';

/** The summaries of a year, worked out from its twelve months. */
export type YearSummary = Exclude<Summary, 'month'>;

/** The quantities the computed layers measure. */
export type LayerQuantity = Extract<Quantity, 'temperature' | 'pressure'>;

/** A unit of a quantity a computed layer measures, such as `°F` or `inHg`. */
export type LayerUnit = UnitOf<LayerQuantity>;

/**
 * A setting of a scale given for each unit of a layer's quantity, such as
 * its narrowest span: a round number in each unit, chosen for it rather
 * than converted from another, so that a scale is as round in °F or inHg
 * as in °C or hPa.
 */
export type PerUnit = Readonly<Partial<Record<LayerUnit, number>>>;

/**
 * The fields of the summaries a layer offers, each one value per cell, as
 * worked out from its year: one for each summary it offers but the Month.
 */
export type YearSummaries = Readonly<
	Partial<Record<YearSummary, Float32Array>>
>;

/**
 * How the scale a view of a layer's year is drawn on is fitted.
 *
 * - `endToEnd`: to the whole year, its twelve months together, from end to
 *   end of the middle 99% of the world by area, as `fitRange` fits it.
 * - `fromZero`: from zero up to the largest value of the field shown, as
 *   for a size such as the seasonal range.
 * - `centred`: to the whole year, as far either side of a centre worked out
 *   from it, such as the planet's mean.
 *
 * The views of a layer fitted end to end share one scale, and so do those
 * centred, so that a colour means the same in each.
 */
export type ScaleFit =
	| { readonly kind: 'endToEnd' }
	| { readonly kind: 'fromZero' }
	| {
			readonly kind: 'centred';
			/**
			 * The value the scale is centred on, from the months it is fitted to
			 * and each cell's weight by area.
			 */
			readonly centre: (
				months: readonly Float32Array[],
				weights: ArrayLike<number>,
			) => number;
	  };

/** A view of a layer's year that the layer offers. */
export type ScalarSummarySpec = {
	/** Which view it is. */
	readonly id: Summary;
	/** Its name on the page, in the Show control, the date line and the readout. */
	readonly label: string;
	/**
	 * What it shows, in lower case, for the legend's caption to name, such as
	 * `air temperature in July`.
	 *
	 * @param month - The month on screen, from January at 0.
	 */
	readonly subject: (month: number) => string;
	/**
	 * What the difference between simulated and observed is of, as the
	 * legend's caption adds it after `Simulated less observed`, such as ` in
	 * July`.
	 *
	 * @param month - The month on screen, from January at 0.
	 */
	readonly comparedSubject: (month: number) => string;
	/** The colours it is drawn in. */
	readonly ramp: ColourRamp;
	/** How its scale is fitted. */
	readonly scale: ScaleFit;
	/**
	 * A step of the scale's own to mark the legend at, in each unit; left
	 * out, the legend chooses one.
	 */
	readonly tickStep?: PerUnit;
};

/** How the difference between simulated and observed is drawn. */
export type DifferenceScale = {
	/** How far the scale reaches either side of zero, in each unit. */
	readonly halfSpan: PerUnit;
	/** The colours it is drawn in, centred on no difference. */
	readonly ramp: ColourRamp;
	/** The step its legend is marked at, in each unit. */
	readonly tickStep: PerUnit;
};

/**
 * The comparison a layer offers with the observed Earth: what loads the
 * observed year, what the page says of it and how the difference is
 * drawn.
 */
export type ObservedComparison = {
	/** Loads the observed year on a world's grid from its file. */
	readonly load: ObservedLoader;
	/** What the comparison's line says while the observed year loads. */
	readonly loadingText: string;
	/** What the comparison's line says when it could not be loaded. */
	readonly failedText: string;
	/** How the difference is drawn. */
	readonly difference: DifferenceScale;
};

/** A layer's result as the store holds it, read for showing. */
export type ScalarLayerReading = {
	/** Where the result stands against the world. */
	readonly status: LayerStatus;
	/**
	 * The store's result the months are part of: the very object, so that it
	 * can be told apart from any later result. Null when there is none.
	 */
	readonly result: object | null;
	/**
	 * The year's twelve months, January first, one value per cell in the
	 * metric unit of the layer's quantity: null exactly when the result is.
	 */
	readonly months: readonly Float32Array[] | null;
};

/** What a layer's result is read from: the page's layer store. */
export type ScalarLayerStore = Pick<LayerStore, 'temperature' | 'winds'>;

/** A layer that colours the globe by one computed value per cell. */
export type ScalarLayerSpec = {
	/** Which layer it is. */
	readonly id: ScalarLayerId;
	/** Its name on the page, in the choice of layer. */
	readonly label: string;
	/**
	 * What its values measure. They are held in the quantity's metric unit
	 * and written in the unit chosen for it.
	 */
	readonly quantity: LayerQuantity;
	/**
	 * A value as the readout writes it before the unit, such as `−18`.
	 *
	 * @param value - The value, in the unit.
	 * @param unit - The unit it is written in, one of the layer's quantity.
	 * @param signed - Whether a value above zero is written with a plus
	 * sign, as for a difference.
	 */
	readonly formatValue: (
		value: number,
		unit: LayerUnit,
		signed: boolean,
	) => string;
	/**
	 * A value marked on the legend's scale as it writes it, such as `−20`.
	 *
	 * @param value - The value, in the unit.
	 * @param unit - The unit the scale is written in, one of the layer's
	 * quantity.
	 */
	readonly formatTick: (value: number, unit: LayerUnit) => string;
	/** What the legend says once no result can be calculated. */
	readonly unavailableText: string;
	/**
	 * What the legend says when the result is current but the globe shows
	 * none of it, as when the globe refused its first field.
	 */
	readonly notShownText: string;
	/**
	 * The views of its year it offers, in the order the Show control lists
	 * them: the Month view among them, which a layer opens on.
	 */
	readonly summaries: readonly ScalarSummarySpec[];
	/**
	 * Works out the summaries it offers from a year's twelve months: new
	 * arrays, one value per cell, for every summary offered but the Month.
	 */
	readonly summarise: (months: readonly Float32Array[]) => YearSummaries;
	/** The narrowest span its scales are fitted to, in each unit. */
	readonly minSpan: PerUnit;
	/**
	 * The comparison it offers with the observed Earth, or null for none: its
	 * source is then always the simulation.
	 */
	readonly observed: ObservedComparison | null;
	/** Reads its result from the store. */
	readonly read: (store: ScalarLayerStore) => ScalarLayerReading;
	/**
	 * How the globe is lit over it while the sun lights the globe: with the
	 * line between day and night drawn over colours shaded as without the
	 * sun, so that a darkened colour is not read as another value, or with
	 * the night side darkened.
	 */
	readonly sunlightStyle: Exclude<SunlightStyle, 'off'>;
	/** The id of its Show control, the drop-down of the views it offers. */
	readonly summaryControlId: string;
};

/** Gives a layer's observed year on a world's grid. */
export type ScalarObservedLoader = (
	layer: ScalarLayerSpec,
	resolution: Resolution,
) => Promise<MonthlyTemperature>;

/**
 * Whether a layer offers a view of its year.
 *
 * @param layer - The layer's description.
 * @param summary - The view.
 */
export const offersSummary = (
	layer: ScalarLayerSpec,
	summary: Summary,
): boolean => layer.summaries.some((offered) => offered.id === summary);

/**
 * A view of a layer's year as the layer describes it.
 *
 * @param layer - The layer's description.
 * @param summary - The view, one the layer offers.
 * @throws RangeError if the layer does not offer it.
 */
export const summaryOf = (
	layer: ScalarLayerSpec,
	summary: Summary,
): ScalarSummarySpec => {
	const found = layer.summaries.find((offered) => offered.id === summary);
	if (found === undefined) {
		throw new RangeError(`The ${layer.id} layer does not offer ${summary}`);
	}
	return found;
};
