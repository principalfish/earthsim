/**
 * Putting a climate into a layer store as its scheduler would, for tests
 * of whatever shows the store: none of it comes from a solve.
 */

import type { TemperatureResult } from '../../core/index';
import { windResultOf } from '../../core/testing/windFixtures';
import type { LayerStore, SolvedWinds } from '../layers/layers';

/**
 * A pass of a climate with that temperature: its winds, if none are given,
 * calm on as many cells as the temperature holds, and a day of 24 hours.
 *
 * @param temperature - The pass's temperature.
 * @param winds - The pass's winds, of which only `winds` is read; left
 * out, calm winds of {@link windResultOf}.
 */
export const climateOf = (
	temperature: TemperatureResult,
	winds?: Pick<SolvedWinds, 'winds'>,
): SolvedWinds => ({
	temperature,
	winds: winds?.winds ?? windResultOf(0, temperature.months[0]?.length ?? 2),
	dayLengthHours: 24,
});

/**
 * Has a climate be asked for and answered, as the scheduler does it: both
 * layers calculating and then holding the climate.
 *
 * @param store - The store to write to.
 * @param climate - The climate's last pass, or a temperature, to which
 * {@link climateOf} gives calm winds.
 * @param current - Whether the answer describes the world as it is; true
 * when left out.
 */
export const arriveClimate = (
	store: LayerStore,
	climate: SolvedWinds | TemperatureResult,
	current = true,
): void => {
	store.markClimateCalculating();
	store.setClimateResult(
		'winds' in climate ? climate : climateOf(climate),
		current,
	);
};

/**
 * A pass of a climate with those winds and the temperature the store has
 * on hand, as a pass that changed the winds alone would be; the winds'
 * own temperature while the store has none.
 *
 * @param store - The store whose temperature is kept.
 * @param winds - The winds, with their temperature and day length.
 */
export const keepingTemperature = (
	store: LayerStore,
	winds: SolvedWinds,
): SolvedWinds => ({
	...winds,
	temperature: store.temperature.result ?? winds.temperature,
});

/**
 * Has a climate with those winds and the temperature on hand be asked for
 * and answered, as {@link arriveClimate} does.
 *
 * @param store - The store to write to.
 * @param winds - The winds, with their temperature and day length.
 * @param current - Whether the answer describes the world as it is; true
 * when left out.
 */
export const answerWinds = (
	store: LayerStore,
	winds: SolvedWinds,
	current = true,
): void => arriveClimate(store, keepingTemperature(store, winds), current);
