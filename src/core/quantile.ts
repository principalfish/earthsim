/**
 * Weighted quantiles of values laid out on the grid: where a share of the
 * weight is cut off at either end of a set of fields, each value counting
 * for its cell's weight, as a cell's area.
 */

/** The bins a span of values is divided into to find the one a cut is in. */
const QUANTILE_BINS = 4096;

/**
 * The most values the bin a cut falls in may hold for them to be sorted to
 * find the cut; a bin that holds more, not all equal, is divided into bins
 * of its own where its span can be.
 */
const SORT_LIMIT = 16384;

/**
 * Whether a value is finite, as `Number.isFinite`, in the form that is
 * quickest over millions of values: infinities and NaN less themselves are
 * NaN, not zero.
 */
const isFiniteNumber = (value: number): boolean => value - value === 0;

/** The ends of some weighted values and the cuts a share in from each. */
export type WeightedQuantiles = {
	/** The lowest finite value. */
	readonly lowest: number;
	/** The highest finite value. */
	readonly highest: number;
	/**
	 * The low cut: the smallest value such that the weight of the values at
	 * or below it is at least the share of the whole.
	 */
	readonly low: number;
	/**
	 * The high cut: the largest value such that the weight of the values at
	 * or above it is at least the share of the whole.
	 */
	readonly high: number;
};

/**
 * The values of some fields from one value to another, ends included, that
 * a cut is known to fall among.
 */
type Span = {
	/** The lowest value in the span, one of the values. */
	readonly lo: number;
	/** The highest value in the span, one of the values. */
	readonly hi: number;
	/** How many values the span holds, each field's counted apart. */
	readonly count: number;
	/**
	 * The weight of the values beyond the span on the side the cut is found
	 * from: below it for the low cut, above it for the high.
	 */
	readonly before: number;
};

/** The values of a span counted into bins over it, lowest first. */
type Bins = {
	/** The weight of the values in each bin. */
	readonly weights: Float64Array;
	/** How many values each bin holds. */
	readonly counts: Uint32Array;
	/** The lowest value in each bin, or infinity for an empty one. */
	readonly lows: Float64Array;
	/** The highest value in each bin, or minus infinity for an empty one. */
	readonly highs: Float64Array;
};

/**
 * What a value's distance above the low end of a span is multiplied by to
 * give its bin, or 0 for a span that is one bin: one too wide for its width
 * to be a number, or so narrow that its bins to a unit, this scale, are
 * not.
 */
const binScale = (lo: number, hi: number): number => {
	const width = hi - lo;
	const scale = QUANTILE_BINS / width;
	return Number.isFinite(width) && Number.isFinite(scale) ? scale : 0;
};

/**
 * The values of some fields from one value to another counted into
 * {@link QUANTILE_BINS} bins over that span.
 *
 * @remarks
 * A value's bin rises with the value, so the values in a bin are those from
 * its lowest value to its highest.
 */
const binned = (
	fields: readonly ArrayLike<number>[],
	weights: ArrayLike<number>,
	lo: number,
	hi: number,
): Bins => {
	const scale = binScale(lo, hi);
	const last = QUANTILE_BINS - 1;
	const binWeights = new Float64Array(QUANTILE_BINS);
	const counts = new Uint32Array(QUANTILE_BINS);
	const lows = new Float64Array(QUANTILE_BINS).fill(Number.POSITIVE_INFINITY);
	const highs = new Float64Array(QUANTILE_BINS).fill(Number.NEGATIVE_INFINITY);
	for (const field of fields) {
		for (let cell = 0; cell < field.length; cell++) {
			const value = field[cell] as number;
			// Neither NaN nor an infinity is within finite ends.
			if (value >= lo && value <= hi) {
				const bin = Math.min(last, Math.floor((value - lo) * scale));
				binWeights[bin] =
					(binWeights[bin] as number) + (weights[cell] as number);
				counts[bin] = (counts[bin] as number) + 1;
				if (value < (lows[bin] as number)) {
					lows[bin] = value;
				}
				if (value > (highs[bin] as number)) {
					highs[bin] = value;
				}
			}
		}
	}
	return { weights: binWeights, counts, lows, highs };
};

/**
 * Where, along some weights taken in order, the sum from a start first
 * reaches a target: the index, and the sum before the weight there.
 *
 * @remarks
 * When rounding leaves every sum short of the target, the last index with
 * a weight above zero is taken, so that what has no weight is not where a
 * cut falls; the last index of all is taken only when none has a weight.
 */
const reach = (
	weights: Float64Array,
	start: number,
	target: number,
	ascending: boolean,
): { readonly index: number; readonly before: number } => {
	const last = weights.length - 1;
	let before = start;
	// Where the sums stop short: the last index with a weight, or, with no
	// weight anywhere, the last of all, the sum still as it started.
	let fallback = ascending ? last : 0;
	let beforeFallback = start;
	for (let step = 0; step <= last; step++) {
		const index = ascending ? step : last - step;
		const weight = weights[index] as number;
		const next = before + weight;
		if (next >= target) {
			return { index, before };
		}
		if (weight > 0) {
			fallback = index;
			beforeFallback = before;
		}
		before = next;
	}
	return { index: fallback, before: beforeFallback };
};

/**
 * The span of the bin, of some over a span, that a cut falls in.
 *
 * @param before - The weight beyond the span binned on the cut's side.
 */
const narrowed = (
	bins: Bins,
	before: number,
	target: number,
	ascending: boolean,
): Span => {
	const reached = reach(bins.weights, before, target, ascending);
	const { index } = reached;
	return {
		lo: bins.lows[index] as number,
		hi: bins.highs[index] as number,
		count: bins.counts[index] as number,
		before: reached.before,
	};
};

/**
 * Whether a span is to be divided into bins again: it holds more than
 * {@link SORT_LIMIT} values, not all equal, over a span that can be.
 */
const divisible = (span: Span): boolean =>
	span.lo < span.hi &&
	span.count > SORT_LIMIT &&
	binScale(span.lo, span.hi) !== 0;

/**
 * The cut among a span's values, from a sort of them: the first value, in
 * order from the side the cut is found from, at which the weight from that
 * side reaches the target.
 *
 * @param values - The span's values, which are left as they are.
 * @param valueWeights - The weight of each value.
 */
const sortedCut = (
	values: Float64Array,
	valueWeights: Float64Array,
	span: Span,
	target: number,
	ascending: boolean,
): number => {
	// The values once each, lowest first, and the weight of each.
	const sorted = values.slice().sort();
	let distinct = 0;
	for (let index = 0; index < sorted.length; index++) {
		const value = sorted[index] as number;
		if (distinct === 0 || value !== sorted[distinct - 1]) {
			sorted[distinct] = value;
			distinct++;
		}
	}
	const unique = sorted.subarray(0, distinct);
	const uniqueWeights = new Float64Array(distinct);
	for (let index = 0; index < values.length; index++) {
		const value = values[index] as number;
		let first = 0;
		let after = distinct - 1;
		while (first < after) {
			const middle = (first + after) >>> 1;
			if ((unique[middle] as number) < value) {
				first = middle + 1;
			} else {
				after = middle;
			}
		}
		uniqueWeights[first] =
			(uniqueWeights[first] as number) + (valueWeights[index] as number);
	}
	const { index } = reach(uniqueWeights, span.before, target, ascending);
	return unique[index] as number;
};

/**
 * The values that cut a share of the weight off each end of some fields,
 * each value weighted by its cell's weight.
 *
 * @remarks
 * The cuts are exact weighted quantiles, each one of the values given: the
 * low cut is the smallest value such that the weight of the values at or
 * below it is at least `share` of the whole, and the high cut, likewise from
 * the top, is the largest value such that the weight of the values at or
 * above it is. Every field shares the one set of weights, so a cell counts
 * for its weight in each field it is in, as a cell-month does over a year.
 * A value with no weight never moves a cut, unless `share` is 0, which cuts
 * at the lowest and highest values. When the lowest value alone carries the
 * share, as among a handful of values of like weight, the low cut is the
 * lowest value, and likewise at the top.
 *
 * The values are not all sorted: one pass bins them over their span, and
 * the bin each cut falls in is binned again over its own span, a pass each
 * time, while it holds more than {@link SORT_LIMIT} values that are not
 * all equal. The cut is then that one value, or one more pass gathers the
 * values left in its bin and only they are sorted. Each binning leaves a
 * span at most about 1/4096 as wide as the last, so values crowded into
 * one bin take a pass or so more, not a sort of them all. A span too wide
 * for its width to be a number, or so narrow that its bins to a unit are
 * not, is one bin, whose values are sorted however many there are. Sums of
 * weights are taken in double precision, so a cut that would fall exactly
 * on a boundary of the weight may go to the value on either side of it.
 *
 * @param fields - The fields, each one value per cell. Values that are not
 * numbers or are infinite are passed over.
 * @param weights - What each cell counts for, one per cell: finite and not
 * below zero.
 * @param share - The share of the whole weight to cut off each end, from 0
 * to 0.5.
 * @returns The lowest and highest finite values and the two cuts.
 * @throws RangeError if a field is not one value per weight, a weight is
 * below zero or not finite, the share is outside 0 to 0.5, or no field
 * holds a finite value.
 */
export const weightedQuantiles = (
	fields: readonly ArrayLike<number>[],
	weights: ArrayLike<number>,
	share: number,
): WeightedQuantiles => {
	if (!(share >= 0 && share <= 0.5)) {
		throw new RangeError(`A share to cut must be from 0 to 0.5; got ${share}`);
	}
	for (let cell = 0; cell < weights.length; cell++) {
		const weight = weights[cell] as number;
		if (!(Number.isFinite(weight) && weight >= 0)) {
			throw new RangeError(
				`A weight must be finite and not below zero; cell ${cell} has ${weight}`,
			);
		}
	}
	let lowest = Number.POSITIVE_INFINITY;
	let highest = Number.NEGATIVE_INFINITY;
	for (const field of fields) {
		if (field.length !== weights.length) {
			throw new RangeError(
				`A field must hold one value per weight: ${weights.length}; got ${field.length}`,
			);
		}
		for (let cell = 0; cell < field.length; cell++) {
			const value = field[cell] as number;
			if (isFiniteNumber(value)) {
				if (value < lowest) {
					lowest = value;
				}
				if (value > highest) {
					highest = value;
				}
			}
		}
	}
	if (!Number.isFinite(lowest)) {
		throw new RangeError('Quantiles need at least one finite value');
	}
	if (lowest === highest) {
		return { lowest, highest, low: lowest, high: highest };
	}

	// The values are binned once over their span, if it can be, and the bin
	// of each cut again while it holds too many values to sort; both cuts
	// share a pass while they fall in the same bin.
	let target: number;
	let low: Span;
	let high: Span;
	if (binScale(lowest, highest) !== 0) {
		const bins = binned(fields, weights, lowest, highest);
		target = share * bins.weights.reduce((sum, weight) => sum + weight, 0);
		low = narrowed(bins, 0, target, true);
		high = narrowed(bins, 0, target, false);
	} else {
		let count = 0;
		let total = 0;
		for (const field of fields) {
			for (let cell = 0; cell < field.length; cell++) {
				if (isFiniteNumber(field[cell] as number)) {
					count++;
					total += weights[cell] as number;
				}
			}
		}
		target = share * total;
		low = { lo: lowest, hi: highest, count, before: 0 };
		high = low;
	}
	for (;;) {
		const shared = low.lo === high.lo && low.hi === high.hi;
		const lowBins = divisible(low)
			? binned(fields, weights, low.lo, low.hi)
			: null;
		const highBins = !divisible(high)
			? null
			: shared && lowBins !== null
				? lowBins
				: binned(fields, weights, high.lo, high.hi);
		if (lowBins === null && highBins === null) {
			break;
		}
		if (lowBins !== null) {
			low = narrowed(lowBins, low.before, target, true);
		}
		if (highBins !== null) {
			high = narrowed(highBins, high.before, target, false);
		}
	}

	// The values of each span whose values are not all equal, gathered in
	// one pass, and once for both when the spans are the same.
	const lowOpen = low.lo < low.hi;
	const highShared = lowOpen && low.lo === high.lo && low.hi === high.hi;
	const highOpen = high.lo < high.hi && !highShared;
	const lowValues = new Float64Array(lowOpen ? low.count : 0);
	const lowWeights = new Float64Array(lowValues.length);
	const highValues = new Float64Array(highOpen ? high.count : 0);
	const highWeights = new Float64Array(highValues.length);
	if (lowOpen || highOpen) {
		// Ends no value lies between, for a span not gathered.
		const lowFrom = lowOpen ? low.lo : Number.POSITIVE_INFINITY;
		const lowTo = lowOpen ? low.hi : Number.NEGATIVE_INFINITY;
		const highFrom = highOpen ? high.lo : Number.POSITIVE_INFINITY;
		const highTo = highOpen ? high.hi : Number.NEGATIVE_INFINITY;
		let lowCount = 0;
		let highCount = 0;
		for (const field of fields) {
			for (let cell = 0; cell < field.length; cell++) {
				const value = field[cell] as number;
				if (value >= lowFrom && value <= lowTo) {
					lowValues[lowCount] = value;
					lowWeights[lowCount] = weights[cell] as number;
					lowCount++;
				}
				if (value >= highFrom && value <= highTo) {
					highValues[highCount] = value;
					highWeights[highCount] = weights[cell] as number;
					highCount++;
				}
			}
		}
	}

	return {
		lowest,
		highest,
		low: lowOpen ? sortedCut(lowValues, lowWeights, low, target, true) : low.lo,
		high: highOpen
			? sortedCut(highValues, highWeights, high, target, false)
			: highShared
				? sortedCut(lowValues, lowWeights, high, target, false)
				: high.lo,
	};
};
