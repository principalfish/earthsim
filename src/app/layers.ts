/**
 * The layers the page computes from the world, as the page holds them:
 * for now the temperature through the year, with whether it describes the
 * world as it is.
 *
 * Nothing here computes anything or touches the DOM. The scheduler that
 * asks for the temperature writes here, and whatever shows it reads here
 * and listens for changes.
 */

import type { TemperatureProgress, TemperatureResult } from '../core/index';

/**
 * Where the temperature on hand stands against the world.
 *
 * - `empty`: there is no result, and none is being calculated. So it is
 *   before the first result for a world, and after a request for one that
 *   failed.
 * - `calculating`: a result is being calculated. The previous result, if
 *   there is one, is still on hand to show meanwhile.
 * - `current`: the result describes the world as it is.
 * - `outOfDate`: the result describes the world as it was before a change
 *   that no result yet takes in, or a request that would have taken it in
 *   failed. It is still on hand to show, marked as out of date.
 * - `unavailable`: no result can be calculated any more, as when the worker
 *   that calculates them could not be started. The last result, if there
 *   is one, is still on hand.
 */
export type TemperatureStatus =
	| 'empty'
	| 'calculating'
	| 'current'
	| 'outOfDate'
	| 'unavailable';

/** The temperature layer as it stands at one moment. */
export type TemperatureLayer = {
	/** Where the result stands against the world. */
	readonly status: TemperatureStatus;
	/**
	 * The latest result to be completed, whole, state included: null when
	 * the status is `empty`, never null when it is `current` or `outOfDate`,
	 * and either while `calculating` or `unavailable`.
	 */
	readonly result: TemperatureResult | null;
	/**
	 * How far the calculation under way has come, as last told: null unless
	 * the status is `calculating`, and until the first year of the
	 * calculation is done.
	 */
	readonly progress: TemperatureProgress | null;
};

/** Called with the layer as it now stands, after every change. */
export type LayerListener = (layer: TemperatureLayer) => void;

/** The computed layers of one page. */
export type LayerStore = {
	/** The temperature layer as it stands now; a new object each change. */
	readonly temperature: TemperatureLayer;
	/**
	 * Has a listener told of every change from now on, after those added
	 * before it. It is not told of the layer as it stands when added, nor of
	 * a change made before then that is still waiting to be told.
	 */
	addListener(listener: LayerListener): void;
	/**
	 * Drops the result, as when the world it describes has been replaced:
	 * the status becomes `empty`, unless it is `unavailable`, which stays.
	 */
	clear(): void;
	/**
	 * Says that the world has changed since the result was calculated: a
	 * `current` result becomes `outOfDate`. Any other status stays as it
	 * is: there is nothing to be out of date while `empty`, and a result on
	 * its way while `calculating` is judged when it arrives.
	 */
	markOutOfDate(): void;
	/**
	 * Says that a result has been asked for: the status becomes
	 * `calculating`, the result on hand stays, and there is no progress
	 * yet. Once `unavailable`, this does nothing.
	 */
	markCalculating(): void;
	/**
	 * Says how far the calculation under way has come. Does nothing unless
	 * the status is `calculating`.
	 */
	setProgress(progress: TemperatureProgress): void;
	/**
	 * Keeps a result that has been completed, in place of the one on hand.
	 *
	 * @param result - The result, whole.
	 * @param current - Whether it describes the world as it is now, rather
	 * than as it was before a change made while it was being calculated.
	 * The status becomes `current` or `outOfDate`, unless it is
	 * `unavailable`, which stays.
	 */
	setResult(result: TemperatureResult, current: boolean): void;
	/**
	 * Says that the request for a result failed: the result on hand stays,
	 * and the status becomes `outOfDate`, or `empty` if there is no result.
	 * Once `unavailable`, this does nothing.
	 */
	markFailed(): void;
	/**
	 * Says that no result can be calculated from now on: the status becomes
	 * `unavailable` for good, and the result on hand stays until `clear`.
	 */
	markUnavailable(): void;
};

/**
 * How many changes the store tells its listeners of in one round, counting
 * those the listeners write while being told, before it takes them to be
 * undoing each other's writes without end and stops. Far more than any
 * chain of listeners reacting to one another in turn would need.
 */
export const MAX_CHANGES_TOLD_IN_A_ROUND = 1000;

/**
 * Makes the store of a page's computed layers, with no temperature yet.
 *
 * @remarks
 * Every method that changes the layer tells every listener once, in the
 * order they were added; one that changes nothing tells nobody.
 *
 * A listener may write to the store while it is being told. The layer is
 * changed at once, so `temperature` is always the latest, but the change is
 * told only once the round of telling under way has finished: then every
 * listener there when it was made is told of it, in order, with the layer
 * as that change left it. So every listener hears every change exactly
 * once, in the order the changes were made, though `temperature` may by
 * then have moved past the layer a listener is handed.
 *
 * Listeners must not go on undoing each other's writes, as one that marks
 * every current result out of date and another that marks every
 * out-of-date result current would: that would never end. Should it
 * happen, the telling is cut short after
 * {@link MAX_CHANGES_TOLD_IN_A_ROUND} changes: the changes still waiting
 * are told to nobody, an error saying so goes to `reportError`, and
 * `temperature` stays as the last write left it.
 *
 * A listener that throws stops neither the change nor the telling: the
 * layer is changed first, every listener is still told, and each error is
 * handed to `reportError` once, as it was thrown, in the order the
 * listeners were told. No method of the store ever throws for a listener.
 * The store reports these errors rather than throwing them because what
 * writes to it, the scheduler that asks for the temperature, must go on
 * scheduling whatever a listener does: an error thrown back into it would
 * stop it halfway through a change.
 *
 * A `reportError` that throws in turn is not let out either: what it
 * throws is dropped, and the remaining listeners are still told.
 *
 * @param reportError - Told of each error a listener throws, as the
 * page's record of errors that it carries on after.
 * @returns The store, `empty`.
 */
export const createLayerStore = (
	reportError: (error: unknown) => void,
): LayerStore => {
	const listeners: LayerListener[] = [];
	let layer: TemperatureLayer = Object.freeze({
		status: 'empty',
		result: null,
		progress: null,
	});
	let unavailable = false;
	// Changes made while listeners are being told, each with the listeners
	// there when it was made, waiting their turn to be told.
	const untold: {
		readonly layer: TemperatureLayer;
		readonly listeners: readonly LayerListener[];
	}[] = [];
	let telling = false;

	const report = (error: unknown): void => {
		try {
			reportError(error);
		} catch {
			// Nowhere is left to report it to, and letting it out would stop
			// the scheduler that wrote the change.
		}
	};

	const set = (next: Partial<TemperatureLayer>): void => {
		const changed = Object.freeze({ ...layer, ...next });
		if (
			changed.status === layer.status &&
			changed.result === layer.result &&
			changed.progress === layer.progress
		) {
			return;
		}
		// The layer is set before anybody is told, so the store is whole
		// whatever a listener does, and every listener is told whatever the
		// ones before it did. The listeners to tell are those there at the
		// change, so one added later is not told of it.
		layer = changed;
		untold.push({ layer: changed, listeners: [...listeners] });
		if (telling) {
			// A listener wrote this change while being told of an earlier
			// one: it is told once the round under way has finished, so
			// that every listener hears the changes in the order they were
			// made.
			return;
		}
		telling = true;
		let told = 0;
		for (let change = untold.shift(); change; change = untold.shift()) {
			if (told === MAX_CHANGES_TOLD_IN_A_ROUND) {
				// Listeners that go on undoing each other's writes would keep
				// this going for ever, with the page stopped meanwhile.
				report(
					new Error(
						`Listeners went on changing the temperature layer while being told of its changes; the telling was stopped after ${MAX_CHANGES_TOLD_IN_A_ROUND} changes`,
					),
				);
				untold.length = 0;
				break;
			}
			told++;
			for (const listener of change.listeners) {
				try {
					listener(change.layer);
				} catch (error) {
					report(error);
				}
			}
		}
		telling = false;
	};

	return {
		get temperature(): TemperatureLayer {
			return layer;
		},
		addListener: (listener) => {
			listeners.push(listener);
		},
		clear: () => {
			set({
				status: unavailable ? 'unavailable' : 'empty',
				result: null,
				progress: null,
			});
		},
		markOutOfDate: () => {
			if (layer.status === 'current') {
				set({ status: 'outOfDate' });
			}
		},
		markCalculating: () => {
			if (!unavailable) {
				set({ status: 'calculating', progress: null });
			}
		},
		setProgress: (progress) => {
			if (layer.status === 'calculating') {
				set({ progress });
			}
		},
		setResult: (result, current) => {
			set({
				status: unavailable ? 'unavailable' : current ? 'current' : 'outOfDate',
				result,
				progress: null,
			});
		},
		markFailed: () => {
			if (!unavailable) {
				set({
					status: layer.result === null ? 'empty' : 'outOfDate',
					progress: null,
				});
			}
		},
		markUnavailable: () => {
			unavailable = true;
			set({ status: 'unavailable', progress: null });
		},
	};
};
