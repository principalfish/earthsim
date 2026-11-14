/**
 * The layers the page computes from the world, as the page holds them:
 * for now the temperature through the year and the winds and pressure
 * worked out from it, each with whether it describes the world as it is.
 *
 * Nothing here computes anything or touches the DOM. The schedulers that
 * ask for the temperature and the winds write here, and whatever shows
 * them reads here and listens for changes.
 */

import type {
	TemperatureProgress,
	TemperatureResult,
	WindResult,
} from '../core/index';

/**
 * Where a layer's result on hand stands against the world: here for the
 * temperature, and the same for the winds.
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
export type LayerStatus =
	| 'empty'
	| 'calculating'
	| 'current'
	| 'outOfDate'
	| 'unavailable';

/** The temperature layer as it stands at one moment. */
export type TemperatureLayer = {
	/** Where the result stands against the world. */
	readonly status: LayerStatus;
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

/**
 * A year of winds and pressure, with what it was worked out from: the
 * temperature result and the day length.
 */
export type SolvedWinds = {
	/** The winds and sea-level pressure of each month. */
	readonly winds: WindResult;
	/**
	 * The temperature result whose months the winds were worked out from:
	 * the very object, so that it can be told apart from any later result.
	 */
	readonly temperature: TemperatureResult;
	/** The day length the winds were worked out for, in hours. */
	readonly dayLengthHours: number;
};

/**
 * The winds layer as it stands at one moment. Its statuses mean what the
 * temperature's do, with the winds' result in place of the temperature's;
 * besides, winds are `current` only while the temperature they were worked
 * out from is the current one and the day length is the one they were
 * worked out for, and they are `unavailable` when there is no current
 * temperature and none can be calculated any more, since they are worked
 * out from it. Their calculation tells of no progress.
 */
export type WindsLayer = {
	/** Where the result stands against the world. */
	readonly status: LayerStatus;
	/**
	 * The latest result to be completed: null when the status is `empty`,
	 * never null when it is `current` or `outOfDate`, and either while
	 * `calculating` or `unavailable`.
	 */
	readonly result: SolvedWinds | null;
};

/**
 * Called after every change of either layer, with the temperature layer as
 * that change left it: after a change of the winds alone, the very
 * temperature layer it was handed before. A listener that wants the winds
 * reads them from the store.
 */
export type LayerListener = (layer: TemperatureLayer) => void;

/** The computed layers of one page. */
export type LayerStore = {
	/**
	 * The temperature layer as it stands now: a new object whenever this
	 * layer changes, and the same one while only the winds do.
	 */
	readonly temperature: TemperatureLayer;
	/**
	 * The temperature result if it describes the world as it is, and
	 * otherwise null: the result while the status is `current`, and while
	 * it is `unavailable` if the result was current when it became so and
	 * nothing has changed since. What the winds are worked out from.
	 */
	readonly currentTemperature: TemperatureResult | null;
	/**
	 * The winds layer as it stands now: a new object whenever this layer
	 * changes, and the same one while only the temperature does.
	 */
	readonly winds: WindsLayer;
	/**
	 * Has a listener told of every change from now on, after those added
	 * before it. It is not told of the layer as it stands when added, nor of
	 * a change made before then that is still waiting to be told.
	 */
	addListener(listener: LayerListener): void;
	/**
	 * Drops the result of each layer, as when the world they describe has
	 * been replaced: each status becomes `empty`, unless it is
	 * `unavailable`, which stays.
	 */
	clear(): void;
	/**
	 * Drops the winds alone, leaving the temperature as it is: their status
	 * becomes `empty`, unless it is `unavailable`, which stays.
	 */
	clearWinds(): void;
	/**
	 * Says that the world has changed since the results were calculated: a
	 * `current` result of either layer becomes `outOfDate`, since winds
	 * worked out from a temperature that is out of date are too. Any other
	 * status stays as it is: there is nothing to be out of date while
	 * `empty`, and a result on its way while `calculating` is judged when it
	 * arrives.
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
	 * The winds become `unavailable` too as soon as there is no current
	 * temperature to work them out from: at once if the result on hand is
	 * not current, and otherwise at the next change of the world.
	 */
	markUnavailable(): void;
	/**
	 * Says that the day length has changed since the winds were calculated:
	 * `current` winds become `outOfDate`, as for {@link markOutOfDate}, and
	 * the temperature, which does not depend on the day length, is left as
	 * it is.
	 */
	markWindsOutOfDate(): void;
	/** As {@link markCalculating}, for the winds. */
	markWindsCalculating(): void;
	/** As {@link setResult}, for the winds. */
	setWindsResult(result: SolvedWinds, current: boolean): void;
	/** As {@link markFailed}, for the winds. */
	markWindsFailed(): void;
	/**
	 * As {@link markUnavailable}, for the winds alone: the temperature can
	 * still be calculated.
	 */
	markWindsUnavailable(): void;
};

/**
 * How many changes the store tells its listeners of in one round, counting
 * those the listeners write while being told, before it takes them to be
 * undoing each other's writes without end and stops. Far more than any
 * chain of listeners reacting to one another in turn would need.
 */
export const MAX_CHANGES_TOLD_IN_A_ROUND = 1000;

/** A temperature layer with no result, empty or unavailable. */
const emptyTemperature = (status: LayerStatus): TemperatureLayer =>
	Object.freeze({ status, result: null, progress: null });

/** A winds layer with no result, empty or unavailable. */
const emptyWinds = (status: LayerStatus): WindsLayer =>
	Object.freeze({ status, result: null });

/**
 * A layer with some fields changed, as a new frozen object; or the layer
 * itself if nothing changes.
 */
const changed = <L extends object>(layer: L, next: Partial<L>): L => {
	const merged = { ...layer, ...next };
	const keys = Object.keys(merged) as (keyof L)[];
	return keys.every((key) => merged[key] === layer[key])
		? layer
		: Object.freeze(merged);
};

/**
 * Makes the store of a page's computed layers, with no temperature or
 * winds yet.
 *
 * @remarks
 * Every method that changes a layer tells every listener once, in the
 * order they were added; one that changes nothing tells nobody.
 *
 * A listener may write to the store while it is being told. The layers
 * are changed at once, so `temperature` and `winds` are always the latest,
 * but the change is told only once the round of telling under way has
 * finished: then every listener there when it was made is told of it, in
 * order, with the temperature layer as that change left it. So every
 * listener hears every change exactly once, in the order the changes were
 * made, though `temperature` may by then have moved past the layer a
 * listener is handed.
 *
 * Listeners must not go on undoing each other's writes, as one that marks
 * every current result out of date and another that marks every
 * out-of-date result current would: that would never end. Should it
 * happen, the telling is cut short after
 * {@link MAX_CHANGES_TOLD_IN_A_ROUND} changes: the changes still waiting
 * are told to nobody, an error saying so goes to `reportError`, and
 * `temperature` and `winds` stay as the last write left them.
 *
 * A listener that throws stops neither the change nor the telling: the
 * layers are changed first, every listener is still told, and each error is
 * handed to `reportError` once, as it was thrown, in the order the
 * listeners were told. No method of the store ever throws for a listener.
 * The store reports these errors rather than throwing them because what
 * writes to it, the schedulers that ask for the temperature and the winds,
 * must go on scheduling whatever a listener does: an error thrown back
 * into one would stop it halfway through a change.
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
	let layers: {
		readonly temperature: TemperatureLayer;
		readonly winds: WindsLayer;
	} = { temperature: emptyTemperature('empty'), winds: emptyWinds('empty') };
	let unavailable = false;
	let windsUnavailable = false;
	/**
	 * Whether the temperature result describes the world as it is: whether
	 * the status is `current`, or would be were it not `unavailable`.
	 */
	let temperatureCurrent = false;
	/** Whether the winds can never be calculated again. */
	const windsGone = (): boolean =>
		windsUnavailable || (unavailable && !temperatureCurrent);
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

	const set = (next: {
		readonly temperature?: Partial<TemperatureLayer>;
		readonly winds?: Partial<WindsLayer>;
	}): void => {
		const temperature = changed(layers.temperature, next.temperature ?? {});
		const winds = changed(
			layers.winds,
			windsGone()
				? { ...next.winds, status: 'unavailable' }
				: (next.winds ?? {}),
		);
		if (temperature === layers.temperature && winds === layers.winds) {
			return;
		}
		// The layers are set before anybody is told, so the store is whole
		// whatever a listener does, and every listener is told whatever the
		// ones before it did. The listeners to tell are those there at the
		// change, so one added later is not told of it.
		layers = { temperature, winds };
		untold.push({ layer: temperature, listeners: [...listeners] });
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
						`Listeners went on changing the layers while being told of their changes; the telling was stopped after ${MAX_CHANGES_TOLD_IN_A_ROUND} changes`,
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

	/** What a `current` status becomes after a change; any other stays. */
	const outOfDate = (status: LayerStatus): LayerStatus =>
		status === 'current' ? 'outOfDate' : status;

	/** The status a completed result is kept with. */
	const resultStatus = (gone: boolean, current: boolean): LayerStatus => {
		if (gone) {
			return 'unavailable';
		}
		return current ? 'current' : 'outOfDate';
	};

	return {
		get temperature(): TemperatureLayer {
			return layers.temperature;
		},
		get currentTemperature(): TemperatureResult | null {
			return temperatureCurrent ? layers.temperature.result : null;
		},
		get winds(): WindsLayer {
			return layers.winds;
		},
		addListener: (listener) => {
			listeners.push(listener);
		},
		clear: () => {
			temperatureCurrent = false;
			set({
				temperature: emptyTemperature(unavailable ? 'unavailable' : 'empty'),
				winds: emptyWinds('empty'),
			});
		},
		clearWinds: () => {
			set({ winds: emptyWinds('empty') });
		},
		markOutOfDate: () => {
			temperatureCurrent = false;
			set({
				temperature: { status: outOfDate(layers.temperature.status) },
				winds: { status: outOfDate(layers.winds.status) },
			});
		},
		markCalculating: () => {
			if (!unavailable) {
				temperatureCurrent = false;
				set({ temperature: { status: 'calculating', progress: null } });
			}
		},
		setProgress: (progress) => {
			if (layers.temperature.status === 'calculating') {
				set({ temperature: { progress } });
			}
		},
		setResult: (result, current) => {
			temperatureCurrent = current;
			set({
				temperature: {
					status: resultStatus(unavailable, current),
					result,
					progress: null,
				},
			});
		},
		markFailed: () => {
			if (!unavailable) {
				temperatureCurrent = false;
				set({
					temperature: {
						status: layers.temperature.result === null ? 'empty' : 'outOfDate',
						progress: null,
					},
				});
			}
		},
		markUnavailable: () => {
			unavailable = true;
			set({ temperature: { status: 'unavailable', progress: null } });
		},
		markWindsOutOfDate: () => {
			set({ winds: { status: outOfDate(layers.winds.status) } });
		},
		markWindsCalculating: () => {
			if (!windsGone()) {
				set({ winds: { status: 'calculating' } });
			}
		},
		setWindsResult: (result, current) => {
			set({
				winds: {
					status: resultStatus(windsGone(), current),
					result,
				},
			});
		},
		markWindsFailed: () => {
			if (!windsGone()) {
				set({
					winds: {
						status: layers.winds.result === null ? 'empty' : 'outOfDate',
					},
				});
			}
		},
		markWindsUnavailable: () => {
			windsUnavailable = true;
			set({ winds: { status: 'unavailable' } });
		},
	};
};
