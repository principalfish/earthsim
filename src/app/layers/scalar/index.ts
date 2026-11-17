/**
 * The layers that colour the globe by one computed value per cell, each as
 * a description: everything the layer panel, the legend, the cursor
 * readout, the top bar's Show choice, the date line and the globe's lighting
 * need to know of a layer to show it. Each takes a description as data, so
 * that another such layer is added by describing it.
 *
 * The page offers two: the temperature, `TEMPERATURE_LAYER` in
 * `temperature.ts`, and the sea-level pressure, `PRESSURE_LAYER` in
 * `pressure.ts`. The folder also holds the description's types and the
 * lookup of a view (`spec.ts`), a layer's values in the units chosen
 * (`inUnit.ts`), the list of the layers offered (`registry.ts`), the
 * legend's caption (`caption.ts`), a year's fields and the scale a view of
 * it is drawn on (`yearScale.ts`), and the fitting of a scale and the
 * writing of a value marked on it (`fit.ts`, imported from there, not from
 * here).
 */

export { layerCaption } from './caption';
export {
	formatWhole,
	inUnit,
	isDifferenceView,
	layerUnit,
	metricRange,
	metricUnit,
	toLayerUnit,
} from './inUnit';
export {
	MIN_PRESSURE_SPAN_HPA,
	meanOfMonths,
	OBSERVED_PRESSURE_FAILED_TEXT,
	OBSERVED_PRESSURE_LOADING_TEXT,
	PRESSURE_DIFFERENCE_HALF_SPAN_HPA,
	PRESSURE_DIFFERENCE_HALF_SPANS,
	PRESSURE_DIFFERENCE_TICK_STEP_HPA,
	PRESSURE_DIFFERENCE_TICK_STEPS,
	PRESSURE_LAYER,
	PRESSURE_MIN_SPANS,
	PRESSURE_NOT_SHOWN_TEXT,
	PRESSURE_OBSERVED,
	PRESSURE_UNAVAILABLE_TEXT,
	windsStatus,
} from './pressure';
export {
	loadLayerObserved,
	SCALAR_LAYER_SPECS,
	SCALAR_LAYERS,
	scalarLayerOf,
} from './registry';
export type {
	DifferenceScale,
	LayerQuantity,
	LayerUnit,
	ObservedComparison,
	PerUnit,
	ScalarLayerReading,
	ScalarLayerSpec,
	ScalarLayerStore,
	ScalarObservedLoader,
	ScalarSummarySpec,
	ScaleFit,
	YearSummaries,
	YearSummary,
} from './spec';
export {
	offersSummary,
	summaryOf,
} from './spec';
export {
	DIFFERENCE_HALF_SPAN_C,
	DIFFERENCE_HALF_SPANS,
	DIFFERENCE_TICK_STEP,
	DIFFERENCE_TICK_STEPS,
	OBSERVED_FAILED_TEXT,
	OBSERVED_LOADING_TEXT,
	SEASONAL_RANGE_TICK_STEP,
	SEASONAL_RANGE_TICK_STEPS,
	TEMPERATURE_LAYER,
	TEMPERATURE_MIN_SPANS,
	TEMPERATURE_NOT_SHOWN_TEXT,
	TEMPERATURE_OBSERVED,
	TEMPERATURE_UNAVAILABLE_TEXT,
} from './temperature';
export type {
	LayerYear,
	YearFieldKey,
} from './yearScale';
export {
	fitSummaryScale,
	scaleKey,
	yearField,
	yearSummaries,
} from './yearScale';
