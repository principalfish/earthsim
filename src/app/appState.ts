/**
 * The world being edited, and the one way of replacing it.
 *
 * Everything on the page that shows or edits the world asks here which
 * world that is, and hears from here when another takes its place. Nothing
 * in this module touches the DOM or the globe: the parts of the page are
 * given as plain functions.
 */

import {
	DEFAULT_SEA_LEVEL_M,
	MAX_ELEVATION_M,
	MIN_ELEVATION_M,
	normaliseSeaLevel,
	type World,
} from '../core/index';

/** Called with the new world after it has replaced the one being edited. */
export type WorldListener = (world: World) => void;

/** The sea levels the page can show and set, in metres against the datum. */
export type SeaLevelRange = {
	/** The lowest sea level. */
	readonly minM: number;
	/** The highest sea level; not below the lowest. */
	readonly maxM: number;
};

/** What an app state starts with. */
export type AppStateOptions = {
	/**
	 * The world the page opens on. It is taken as it is, sea level included,
	 * and no listener is told about it.
	 */
	readonly world: World;
	/** Listeners to start with, as if each had been added in this order. */
	readonly listeners?: readonly WorldListener[];
	/**
	 * The range a sea level that is kept is brought within: that of the
	 * control that sets the sea level, so that the control can show every
	 * world's own. Left out, it is the range of elevations a cell can hold.
	 */
	readonly seaLevelRange?: SeaLevelRange;
};

/** How a world takes the place of the one being edited. */
export type ReplaceWorldOptions = {
	/**
	 * Whether the world keeps the sea level it comes with, as a world read
	 * from a file or from the browser's storage does, rather than starting
	 * from the default as a new world does. False when left out.
	 */
	readonly keepSeaLevel?: boolean;
};

/** The world one page is editing. */
export type AppState = {
	/** The world being edited now. */
	readonly world: World;
	/**
	 * Has a listener told of every replacement from now on. It is not told
	 * of the world that is current when it is added.
	 *
	 * @param listener - Called after those added before it. Adding the same
	 * function again has it called again.
	 */
	addListener(listener: WorldListener): void;
	/**
	 * Makes another world the one being edited.
	 *
	 * @remarks
	 * In this order, each exactly once:
	 *
	 * 1. The new world's sea level is set to {@link DEFAULT_SEA_LEVEL_M},
	 *    through {@link normaliseSeaLevel}: a new world starts from the
	 *    default whatever the page's sea level was, and whatever the world
	 *    was given. With `keepSeaLevel`, the world's own sea level is
	 *    brought within the app state's sea-level range instead, to the
	 *    nearer end if it lies outside, and through
	 *    {@link normaliseSeaLevel}.
	 * 2. The new world becomes {@link AppState.world}.
	 * 3. Every listener is called with the new world, in the order they
	 *    were added. A listener added during the calls is not among them.
	 *
	 * A listener that throws does not stop the others: all of them are
	 * called, the world stays replaced, and then the error is thrown from
	 * here. If several threw, an `AggregateError` holding every error, in
	 * order, is thrown instead.
	 *
	 * Giving the world that is already current is allowed, and does all of
	 * the above again.
	 *
	 * @param world - The world to edit from now on. Its sea level is
	 * changed in place.
	 * @param options - Whether the world keeps its own sea level.
	 * @throws Error if called from inside a listener, while the listeners
	 * are still being told of a replacement. Nothing is changed.
	 * @throws RangeError if the sea level is to be kept and is NaN. Nothing
	 * is changed.
	 */
	replaceWorld(world: World, options?: ReplaceWorldOptions): void;
};

/**
 * Keeps hold of the world being edited and tells the page when it is
 * replaced.
 *
 * @param options - The world to start with, any listeners and the range
 * of sea levels.
 * @returns The app state.
 * @throws RangeError if the sea-level range has a lowest level that is not
 * at or below its highest.
 */
export const createAppState = (options: AppStateOptions): AppState => {
	const { minM, maxM } = options.seaLevelRange ?? {
		minM: MIN_ELEVATION_M,
		maxM: MAX_ELEVATION_M,
	};
	if (!(minM <= maxM)) {
		throw new RangeError(
			`A sea-level range needs a lowest level at or below its highest; got ${minM} to ${maxM}`,
		);
	}
	const listeners: WorldListener[] = [...(options.listeners ?? [])];
	let current = options.world;
	let announcing = false;

	return {
		get world(): World {
			return current;
		},
		addListener: (listener) => {
			listeners.push(listener);
		},
		replaceWorld: (world, { keepSeaLevel = false } = {}) => {
			if (announcing) {
				throw new Error(
					'The world cannot be replaced while a replacement is being announced',
				);
			}
			// A NaN passes through the range unchanged and is then refused.
			world.seaLevel = normaliseSeaLevel(
				keepSeaLevel
					? Math.min(maxM, Math.max(minM, world.seaLevel))
					: DEFAULT_SEA_LEVEL_M,
			);
			current = world;

			const errors: unknown[] = [];
			announcing = true;
			for (const listener of [...listeners]) {
				try {
					listener(world);
				} catch (error) {
					errors.push(error);
				}
			}
			announcing = false;
			if (errors.length === 1) {
				throw errors[0];
			}
			if (errors.length > 1) {
				throw new AggregateError(
					errors,
					'Several parts of the page failed to take the new world',
				);
			}
		},
	};
};
