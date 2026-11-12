/**
 * The Layers section: what the globe is coloured by, Terrain or
 * Temperature, and the legend of the temperature.
 *
 * {@link createLayerPanel} decides what the globe and the legend show, from
 * the choice and the layer store, and switches the temperature's
 * calculation on and off with the choice. {@link createLayerControls} is
 * the section on the page, which only shows what it is told and passes on
 * what is chosen.
 */

import type { TemperatureResult } from '../../core/index';
import { TEMPERATURE_RAMP, type ValueRange } from '../globe/ramp';
import type { Globe } from '../globe/renderer';
import type { LayerStore } from '../layers';
import type { TemperatureScheduler } from '../refresh';
import {
	DEFAULT_LAYER,
	LAYER_LABELS,
	LAYERS,
	type Layer,
	SHOWN_MONTH,
} from '../view';
import { createElement, createSegmentedPicker } from './fields';
import {
	createLegend,
	fitRange,
	type LegendContent,
	legendContent,
} from './legend';

/** What the temperature legend says the scale measures. */
export const TEMPERATURE_CAPTION = 'Air temperature in July, °C';

/** What the layer controls start with and whom they tell of a choice. */
export type LayerControlsOptions = {
	/** The layer chosen at first. */
	readonly layer: Layer;
	/** Called with the layer when another is chosen. */
	readonly onLayer: (layer: Layer) => void;
};

/** The layer controls on the page. */
export type LayerControls = {
	/** Shows a legend, or hides it for null. */
	showLegend(content: LegendContent | null): void;
};

/** What the layer panel joins. */
export type LayerPanelOptions = {
	/** Where the temperature is kept. */
	readonly store: Pick<LayerStore, 'temperature' | 'addListener'>;
	/** The globe the layer is drawn on, showing the world already. */
	readonly globe: Pick<Globe, 'setLayer'>;
	/** What calculates the temperature, told whether it is showing. */
	readonly temperature: Pick<TemperatureScheduler, 'setShowing'>;
	/** Adds the controls to the page. */
	readonly createControls: (options: LayerControlsOptions) => LayerControls;
};

/**
 * Joins the layer controls to the globe, the layer store and the
 * temperature's calculation, starting on {@link DEFAULT_LAYER}.
 *
 * @remarks
 * Choosing Temperature tells the temperature it is showing, which asks for
 * it if the result on hand is out of date or there is none, and choosing
 * Terrain tells it it is not. The choice is the page's: a new world keeps
 * it.
 *
 * In Temperature view, the globe shows the {@link SHOWN_MONTH} field of the
 * latest result in the store, in the colours of {@link TEMPERATURE_RAMP} on
 * a scale fitted to the whole of that result's year, and the legend shows
 * that scale and where the result stands. Until there is a result, the
 * globe shows the height colours and the legend says why. A result that is
 * out of date, or being calculated again, stays on the globe until the next
 * arrives. A result is sent to the globe once, when it arrives, not again
 * as its status or progress change. When the store drops its result, as
 * when the world is replaced, the globe goes back to the height colours. In
 * Terrain view, the globe shows the height colours and the legend is
 * hidden.
 *
 * The legend's scale is always that of what the globe shows: the range it
 * was last given, or no scale while it shows the height colours.
 * Its line and bar say where the store's result stands.
 *
 * Nothing here throws in normal use; what the globe throws reaches the
 * store's record of errors when it comes from a change of the store. The
 * globe then keeps what it showed, and the legend its scale with it, while
 * the legend's line still says where the store's result stands. For a
 * current result the globe refused, the line says that the earlier result
 * still on the globe is out of date, or, with nothing on the globe, that
 * the temperature could not be shown. The field is sent again at the next
 * change.
 *
 * @param options - The store, the globe, the temperature and the controls.
 */
export const createLayerPanel = (options: LayerPanelOptions): void => {
	const { store, globe, temperature } = options;
	let layer: Layer = DEFAULT_LAYER;
	/**
	 * The scale fitted to the latest result, kept until the next or until
	 * the store drops it, so that a dropped result is not held on to.
	 */
	let fitted: { readonly result: TemperatureResult; range: ValueRange } | null =
		null;
	/**
	 * What the globe was last given to show and on what range, or null for
	 * the heights.
	 */
	let shown: {
		readonly field: Float32Array;
		readonly range: ValueRange;
	} | null = null;

	const rangeOf = (result: TemperatureResult): ValueRange => {
		if (fitted?.result !== result) {
			fitted = { result, range: fitRange(result.months) };
		}
		return fitted.range;
	};

	const update = (): void => {
		const { result } = store.temperature;
		if (result === null) {
			fitted = null;
		}
		const field =
			layer === 'temperature' ? result?.months[SHOWN_MONTH] : undefined;
		try {
			if (field !== undefined && result !== null) {
				if (shown?.field !== field) {
					const range = rangeOf(result);
					globe.setLayer(field, range, TEMPERATURE_RAMP);
					shown = { field, range };
				}
			} else if (shown !== null) {
				globe.setLayer(null);
				shown = null;
			}
		} finally {
			// Brought up to date even when the globe throws, which leaves what
			// it shows, and so `shown` and the scale drawn from it, as they
			// were. The globe shows the store's result when the field it has is
			// that result's.
			controls.showLegend(
				layer === 'temperature'
					? legendContent(
							store.temperature,
							shown?.range ?? null,
							TEMPERATURE_RAMP,
							shown !== null && shown.field === field,
						)
					: null,
			);
		}
	};

	const controls = options.createControls({
		layer,
		onLayer: (next) => {
			if (next === layer) {
				return;
			}
			layer = next;
			temperature.setShowing(layer === 'temperature');
			update();
		},
	});
	store.addListener(update);
	update();
};

/**
 * Adds the Layers section to the side panel: the choice of layer and the
 * legend.
 *
 * @param panel - The panel to add the section to, after what it holds.
 * @param options - The starting choice and whom to tell of another.
 * @returns The controls, with the legend hidden.
 */
export const createLayerControls = (
	panel: HTMLElement,
	options: LayerControlsOptions,
): LayerControls => {
	const section = createElement('section', 'panel__section');
	const heading = createElement('h2', 'panel__heading');
	heading.textContent = 'Layers';
	const legend = createLegend(TEMPERATURE_CAPTION);

	section.append(
		heading,
		createSegmentedPicker({
			name: 'layer',
			legend: 'Layer',
			choices: LAYERS.map((value) => ({ value, label: LAYER_LABELS[value] })),
			value: options.layer,
			onChange: options.onLayer,
		}),
		legend.element,
	);
	panel.append(section);
	return { showLegend: legend.show };
};
