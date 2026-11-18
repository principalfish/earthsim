/** What a layer's legend says its scale measures. */

import { unitLabel } from '../../settings/units';
import type { Source, Summary } from '../view';
import { metricUnit } from './inUnit';
import { type LayerUnit, type ScalarLayerSpec, summaryOf } from './spec';

/** A text with its first letter in capitals. */
const capitalised = (text: string): string =>
	`${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/**
 * What a layer's legend says the scale measures, for a view of its year,
 * the month on screen and, where the layer is compared with the observed
 * Earth, where the field comes from.
 *
 * @param layer - The layer's description, which words what each view
 * shows.
 * @param summary - What of the year is shown, a view the layer offers.
 * @param month - The month on screen, from January at 0; read only for the
 * Month view.
 * @param source - Where the field shown comes from, when the world is one
 * the comparison is offered for; left out, the caption names no source.
 * @param unit - The unit the scale is written in, one of the layer's
 * quantity; its metric unit when left out.
 * @returns For the temperature, such as `Air temperature in July, °C`,
 * `Observed air temperature in July, °F` or `Simulated less observed in
 * July, K`. The seasonal range's, but for its difference, says that it is
 * a difference of temperatures.
 * @throws RangeError if the layer does not offer the view, or the unit is
 * not one of its quantity.
 */
export const layerCaption = (
	layer: ScalarLayerSpec,
	summary: Summary,
	month: number,
	source?: Source,
	unit: LayerUnit = metricUnit(layer),
): string => {
	const view = summaryOf(layer, summary);
	const subject = view.subject(month);
	const label = unitLabel(layer.quantity, unit);
	switch (source) {
		case undefined:
			return `${capitalised(subject)}, ${label}`;
		case 'simulated':
			return `Simulated ${subject}, ${label}`;
		case 'observed':
			return `Observed ${subject}, ${label}`;
		case 'difference':
			return `Simulated less observed${view.comparedSubject(month)}, ${label}`;
	}
};
