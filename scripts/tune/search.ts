/**
 * The tuning script's two ways of trying settings: a sweep of one setting
 * over a range, and a search over several that lowers the Earth's wind
 * difference without letting the direction share or the pressure
 * difference worsen. Both take the scoring as a function, so they can be
 * tried on a made-up one; neither reads or writes a file.
 */

/** The Earth's three whole-year error figures for one run of the model. */
export type EarthFigures = {
	/** The root-mean-square of the wind's difference as vectors, in m/s. */
	readonly windRms: number;
	/**
	 * The share, 0 to 1, of the surface counted whose wind points within the
	 * tolerance of the observed.
	 */
	readonly directionShare: number;
	/** The root-mean-square of the pressure's difference, in hPa. */
	readonly pressureRms: number;
};

/** Settings by name, as the search moves them. */
export type SettingValues = Readonly<Record<string, number>>;

/** One value a sweep tried, and the figures it gave. */
export type SweepRow = {
	readonly value: number;
	readonly figures: EarthFigures;
};

/**
 * Evenly spaced values from one to another, both included.
 *
 * @param from - The first value.
 * @param to - The last value.
 * @param count - How many values: a whole number from 1; with 1, `from`
 * alone.
 * @returns New values, in order from `from`.
 * @throws RangeError if `from` or `to` is not finite, or `count` is not a
 * whole number from 1.
 */
export const sweepValues = (
	from: number,
	to: number,
	count: number,
): number[] => {
	if (!Number.isFinite(from) || !Number.isFinite(to)) {
		throw new RangeError(
			`A sweep's ends must be finite numbers; got ${from} and ${to}`,
		);
	}
	if (!Number.isInteger(count) || count < 1) {
		throw new RangeError(
			`A sweep's count must be a whole number from 1; got ${count}`,
		);
	}
	if (count === 1) {
		return [from];
	}
	return Array.from(
		{ length: count },
		(_, index) => from + ((to - from) * index) / (count - 1),
	);
};

/**
 * The figures for each of a sweep's values, one row for each, in the
 * order given.
 *
 * @param values - The values to try. Not changed.
 * @param evaluate - The figures one value gives.
 * @returns New rows.
 */
export const sweep = (
	values: readonly number[],
	evaluate: (value: number) => EarthFigures,
): SweepRow[] => values.map((value) => ({ value, figures: evaluate(value) }));

/**
 * Whether a search may move to a candidate's figures: its wind difference
 * is lower than the current one's, and neither its direction share nor its
 * pressure difference is worse than where the search started.
 *
 * @remarks
 * Figures that are not numbers, as a run whose winds are not finite gives,
 * are never taken, since every comparison with them is false.
 *
 * @param candidate - The figures of the settings tried.
 * @param current - The figures of the settings the search holds now.
 * @param start - The figures of the settings the search started from.
 */
export const isAccepted = (
	candidate: EarthFigures,
	current: EarthFigures,
	start: EarthFigures,
): boolean =>
	candidate.windRms < current.windRms &&
	candidate.directionShare >= start.directionShare &&
	candidate.pressureRms <= start.pressureRms;

/**
 * The most steps a search takes on one setting in one direction in a
 * round, so that a search whose figures keep improving still ends: at a
 * step of 10% that is a factor of about 6.7 either way.
 */
export const MAX_STEPS_PER_SETTING = 20;

/**
 * The values a setting may take in a search: above `above` and no more
 * than `atMost`, either left out for no bound on that side.
 */
export type SettingBounds = {
	readonly above?: number;
	readonly atMost?: number;
};

/** Whether a value lies within a setting's bounds. */
export const isWithin = (value: number, bounds: SettingBounds = {}): boolean =>
	(bounds.above === undefined || value > bounds.above) &&
	(bounds.atMost === undefined || value <= bounds.atMost);

/** A step a search did not try, its value lying outside the bounds. */
export type BoundStop = {
	readonly name: string;
	readonly value: number;
	readonly bounds: SettingBounds;
};

/** One step a search took. */
export type SearchStep = {
	/** The setting moved. */
	readonly name: string;
	/** Its new value. */
	readonly value: number;
	/** The figures the settings gave after the step. */
	readonly figures: EarthFigures;
};

/** Where a search started and ended, and the steps between. */
export type SearchResult = {
	readonly start: {
		readonly settings: SettingValues;
		readonly figures: EarthFigures;
	};
	readonly end: {
		readonly settings: SettingValues;
		readonly figures: EarthFigures;
	};
	/** Every step taken, in order. */
	readonly steps: readonly SearchStep[];
	/** Every step not tried for lying outside its setting's bounds. */
	readonly boundStops: readonly BoundStop[];
	/** How many times the figures were worked out, the start's included. */
	readonly evaluations: number;
};

/** What a search is given. */
export type SearchOptions = {
	/**
	 * The settings to start from, by name: every setting searched must be
	 * among them, with a value other than zero.
	 */
	readonly start: SettingValues;
	/** The settings to move, in the order each round tries them. */
	readonly names: readonly string[];
	/** The figures a set of settings gives. */
	readonly evaluate: (settings: SettingValues) => EarthFigures;
	/**
	 * The first round's step, as a share of a setting's value: each step
	 * multiplies the value by one plus or one less it. Defaults to 0.1.
	 */
	readonly step?: number;
	/**
	 * How many rounds over every setting; each round's step is half the
	 * one before. Defaults to 3.
	 */
	readonly rounds?: number;
	/** Called after each step taken, as it is taken. */
	readonly onStep?: (step: SearchStep) => void;
	/**
	 * The values each setting may take, by name; a setting not named has
	 * no bounds. A step outside them is not tried, as if it had not been
	 * accepted, and is noted in the result.
	 */
	readonly bounds?: Readonly<Record<string, SettingBounds>>;
};

/**
 * A search for settings that lower the Earth's wind difference, one
 * setting at a time.
 *
 * @remarks
 * Each round goes through the settings in turn. A setting's value is
 * multiplied by one plus the round's step; if the figures that gives are
 * {@link isAccepted}, the search moves there and steps again the same way
 * for as long as each step is accepted, up to
 * {@link MAX_STEPS_PER_SETTING}; if the first step up is not, it tries the
 * same downwards. Each round's step is half the round before's.
 * Since a step is taken only when the wind difference falls, the search
 * never ends with a wind difference above its start's, and since the other
 * two figures are held against the start's, neither ends worse than it
 * started. A step that would take a setting outside its bounds is not
 * tried. Multiplying keeps each setting's sign, so a setting never
 * reaches zero.
 *
 * @param options - Where to start, what to move and how. Not changed.
 * @returns A new result.
 * @throws RangeError if a setting searched is not among the start's or is
 * zero there, the step is not between 0 and 1, or the rounds are not a
 * whole number from 1.
 */
export const search = (options: SearchOptions): SearchResult => {
	const {
		start,
		names,
		evaluate,
		step = 0.1,
		rounds = 3,
		onStep,
		bounds = {},
	} = options;
	for (const name of names) {
		const value = start[name];
		if (value === undefined || value === 0) {
			throw new RangeError(
				`The setting ${name} must have a starting value other than zero to be searched`,
			);
		}
	}
	if (!(step > 0 && step < 1)) {
		throw new RangeError(
			`A search's step must lie between 0 and 1; got ${step}`,
		);
	}
	if (!Number.isInteger(rounds) || rounds < 1) {
		throw new RangeError(
			`A search's rounds must be a whole number from 1; got ${rounds}`,
		);
	}
	const startFigures = evaluate(start);
	let evaluations = 1;
	let settings: SettingValues = { ...start };
	let figures = startFigures;
	const steps: SearchStep[] = [];
	const boundStops: BoundStop[] = [];
	const tryValue = (name: string, value: number): boolean => {
		const limits = bounds[name];
		if (!isWithin(value, limits)) {
			boundStops.push({ name, value, bounds: limits ?? {} });
			return false;
		}
		const candidate = { ...settings, [name]: value };
		const candidateFigures = evaluate(candidate);
		evaluations++;
		if (!isAccepted(candidateFigures, figures, startFigures)) {
			return false;
		}
		settings = candidate;
		figures = candidateFigures;
		const taken = { name, value, figures };
		steps.push(taken);
		onStep?.(taken);
		return true;
	};
	for (let round = 0; round < rounds; round++) {
		const share = step / 2 ** round;
		for (const name of names) {
			for (const factor of [1 + share, 1 - share]) {
				let taken = 0;
				while (
					taken < MAX_STEPS_PER_SETTING &&
					tryValue(name, (settings[name] as number) * factor)
				) {
					taken++;
				}
				if (taken > 0) {
					break;
				}
			}
		}
	}
	return {
		start: { settings: { ...start }, figures: startFigures },
		end: { settings, figures },
		steps,
		boundStops,
		evaluations,
	};
};
