/**
 * The world being edited, and the one way of replacing it.
 *
 * Everything on the page that shows or edits the world asks here which
 * world that is, and hears from here when another takes its place. Nothing
 * in this module touches the DOM or the globe: the parts of the page are
 * given as plain functions.
 */

import {
	DEFAULT_AGE_YEARS,
	DEFAULT_PLANET,
	DEFAULT_SEA_LEVEL_M,
	MAX_ELEVATION_M,
	MIN_ELEVATION_M,
	normaliseAgeYears,
	normalisePlanet,
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
	/**
	 * How far apart the levels that can be shown and set are, counted from
	 * the lowest, in metres: the step of the control that sets the sea
	 * level. Left out, every level within the range can be.
	 */
	readonly stepM?: number;
};

/** What an app state starts with. */
export type AppStateOptions = {
	/**
	 * The world the page opens on. It is taken as it is, sea level, planet
	 * and date included, and no listener is told about it.
	 */
	readonly world: World;
	/** Listeners to start with, as if each had been added in this order. */
	readonly listeners?: readonly WorldListener[];
	/**
	 * The levels a sea level that is kept is brought to: those of the
	 * control that sets the sea level, so that the control can show every
	 * world's own. Left out, it is the range of elevations a cell can hold,
	 * with no step.
	 */
	readonly seaLevelRange?: SeaLevelRange;
};

/** How a world takes the place of the one being edited. */
export type ReplaceWorldOptions = {
	/**
	 * Whether the world keeps the sea level, planet settings and date it
	 * comes with, as a world read from a file or from the browser's storage
	 * does, rather than starting from the defaults as a new world does.
	 * False when left out.
	 */
	readonly keepSettings?: boolean;
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
	 *    through {@link normaliseSeaLevel}, its planet to a copy of
	 *    {@link DEFAULT_PLANET} and its date to {@link DEFAULT_AGE_YEARS}:
	 *    a new world starts from the defaults whatever the page's world
	 *    had, and whatever the world was given. With `keepSettings`, the
	 *    world's own sea level is instead rounded to the nearest level the
	 *    app state's sea-level range has a step on, the higher of two
	 *    equally near, then brought to the nearer end of the range if it
	 *    lies outside, and put through {@link normaliseSeaLevel}; its own
	 *    planet is put through {@link normalisePlanet} and its own date
	 *    through {@link normaliseAgeYears}.
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
	 * @param world - The world to edit from now on. Its sea level, planet
	 * and date are set in place.
	 * @param options - Whether the world keeps its own settings.
	 * @throws Error if called from inside a listener, while the listeners
	 * are still being told of a replacement. Nothing is changed.
	 * @throws RangeError if the settings are to be kept and the sea level
	 * is NaN, a planet setting is not a number, or the date is not a finite
	 * number from zero up. Nothing is changed.
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
 * at or below its highest, or a step that is not a positive finite number.
 */
export const createAppState = (options: AppStateOptions): AppState => {
	const range: SeaLevelRange = options.seaLevelRange ?? {
		minM: MIN_ELEVATION_M,
		maxM: MAX_ELEVATION_M,
	};
	const { minM, maxM, stepM } = range;
	if (!(minM <= maxM)) {
		throw new RangeError(
			`A sea-level range needs a lowest level at or below its highest; got ${minM} to ${maxM}`,
		);
	}
	if (stepM !== undefined && !(stepM > 0 && Number.isFinite(stepM))) {
		throw new RangeError(
			`A sea-level range needs a step that is a positive finite number; got ${stepM}`,
		);
	}
	/** The level the control shows for a sea level a world comes with. */
	const shownLevel = (metres: number): number => {
		// Halves go to the higher level, as a slider's own rounding does.
		const stepped =
			stepM === undefined
				? metres
				: minM + Math.round((metres - minM) / stepM) * stepM;
		return Math.min(maxM, Math.max(minM, stepped));
	};
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
		replaceWorld: (world, { keepSettings = false } = {}) => {
			if (announcing) {
				throw new Error(
					'The world cannot be replaced while a replacement is being announced',
				);
			}
			// Every value is settled before any is set, so that one refused
			// leaves the world as it was. A NaN sea level passes through the
			// step and the range unchanged and is then refused.
			const seaLevel = normaliseSeaLevel(
				keepSettings ? shownLevel(world.seaLevel) : DEFAULT_SEA_LEVEL_M,
			);
			const planet = keepSettings
				? normalisePlanet(world.planet)
				: { ...DEFAULT_PLANET };
			const ageYears = keepSettings
				? normaliseAgeYears(world.ageYears)
				: DEFAULT_AGE_YEARS;
			world.seaLevel = seaLevel;
			world.planet = planet;
			world.ageYears = ageYears;
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
