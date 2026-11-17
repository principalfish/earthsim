/**
 * What is said of the winds while they are shown: a line saying where the
 * winds on hand stand, in the words the temperature legend uses, which the
 * info box's status line says unless the legend has worse to say, and the
 * observed winds' loading and failure lines.
 */

import type { LayerStatus, WindsLayer } from '../layers/layers';
import { LEGEND_EMPTY_TEXT, LEGEND_OUT_OF_DATE_TEXT } from './legend';

/** What is said of the winds while they are being worked out. */
export const WINDS_CALCULATING_TEXT = 'Calculating';

/** What is said once no winds can be worked out. */
export const WINDS_UNAVAILABLE_TEXT = 'Winds unavailable';

/** What is said while the observed winds load. */
export const OBSERVED_WINDS_LOADING_TEXT = 'Loading observed winds';

/** What is said when the observed winds could not be loaded. */
export const OBSERVED_WINDS_FAILED_TEXT = 'Observed winds could not be loaded';

/**
 * What is said of the winds at one moment, for the info box's status line.
 */
export type WindKeyContent = {
	/**
	 * Where the winds shown stand: the observed winds, which are never out
	 * of date, are `current`.
	 */
	readonly state: LayerStatus;
	/**
	 * What is said of the winds on hand, or null when there is nothing
	 * to say. While they are current it may say something else of them,
	 * such as that the observed winds are loading.
	 */
	readonly status: string | null;
};

/**
 * What is shown of the winds layer as it stands.
 *
 * @param layer - Where the winds stand, as the store has them or as
 * `windsStatus` words them for showing.
 * @returns No line for current winds; {@link LEGEND_OUT_OF_DATE_TEXT},
 * {@link WINDS_CALCULATING_TEXT}, {@link LEGEND_EMPTY_TEXT} or
 * {@link WINDS_UNAVAILABLE_TEXT} for the others, the arrows on hand, if
 * any, staying on the globe meanwhile.
 */
export const windKeyContent = (
	layer: Pick<WindsLayer, 'status'>,
): WindKeyContent => {
	switch (layer.status) {
		case 'current':
			return { state: 'current', status: null };
		case 'outOfDate':
			return { state: 'outOfDate', status: LEGEND_OUT_OF_DATE_TEXT };
		case 'calculating':
			return { state: 'calculating', status: WINDS_CALCULATING_TEXT };
		case 'empty':
			return { state: 'empty', status: LEGEND_EMPTY_TEXT };
		case 'unavailable':
			return { state: 'unavailable', status: WINDS_UNAVAILABLE_TEXT };
	}
};
