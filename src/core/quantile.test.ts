import { describe, expect, it } from 'vitest';
import { weightedQuantiles } from './quantile';

/** A fixed sequence of numbers from 0 to 1, the same on every run. */
const sequence = (seed: number): (() => number) => {
	let state = seed;
	return () => {
		state = (state * 16807) % 2147483647;
		return state / 2147483647;
	};
};

/**
 * The cuts by the definition, from a full sort of every value with its
 * weight: the smallest value with at least the share of the weight at or
 * below it, and the largest with at least the share at or above it. Whole
 * weights keep every sum exact, whatever its order.
 */
const bySorting = (
	fields: readonly ArrayLike<number>[],
	weights: ArrayLike<number>,
	share: number,
): { low: number; high: number } => {
	const pairs: [number, number][] = [];
	for (const field of fields) {
		for (let cell = 0; cell < field.length; cell++) {
			const value = field[cell] as number;
			if (Number.isFinite(value)) {
				pairs.push([value, weights[cell] as number]);
			}
		}
	}
	pairs.sort((a, b) => a[0] - b[0]);
	// Each value once, lowest first, with the weight of all its cells.
	const values: number[] = [];
	const valueWeights: number[] = [];
	for (const [value, weight] of pairs) {
		if (values.length > 0 && values.at(-1) === value) {
			valueWeights[values.length - 1] =
				(valueWeights.at(-1) as number) + weight;
		} else {
			values.push(value);
			valueWeights.push(weight);
		}
	}
	const total = valueWeights.reduce((sum, weight) => sum + weight, 0);
	const target = share * total;
	let low = Number.NaN;
	for (let index = 0, sum = 0; index < values.length; index++) {
		sum += valueWeights[index] as number;
		if (sum >= target) {
			low = values[index] as number;
			break;
		}
	}
	let high = Number.NaN;
	for (let index = values.length - 1, sum = 0; index >= 0; index--) {
		sum += valueWeights[index] as number;
		if (sum >= target) {
			high = values[index] as number;
			break;
		}
	}
	return { low, high };
};

/**
 * Twelve fields of 20,000 cells, 240,000 values, nearly all of them drawn
 * from a few given values close together, so that they fall in one bin of
 * the whole span; a few far values make that span wide. The cells weigh
 * from 1 to 5.
 *
 * @param crowd - The values close together, each with the share of the
 * cells, out of 1000, that hold it.
 * @param far - Values far from the crowd, each in one cell of one field.
 */
const crowded = (
	crowd: readonly (readonly [number, number])[],
	far: readonly number[],
): { fields: Float64Array[]; weights: Float64Array } => {
	const cells = 20_000;
	const weights = Float64Array.from(
		{ length: cells },
		(_, cell) => 1 + (cell % 5),
	);
	const fields = Array.from({ length: 12 }, (_, month) =>
		Float64Array.from({ length: cells }, (_, cell) => {
			let rank = (cell * 7919 + month * 104_729) % 1000;
			for (const [value, perMille] of crowd) {
				if (rank < perMille) {
					return value;
				}
				rank -= perMille;
			}
			throw new RangeError('The crowd must make up a thousand per mille');
		}),
	);
	far.forEach((value, index) => {
		fields[(index * 5) % 12]?.set([value], index);
	});
	return { fields, weights };
};

describe('weightedQuantiles', () => {
	it('gives the cuts a full sort gives, each one of the values', () => {
		// Whole weights, so that every sum is exact; values rounded to halves,
		// so that many are tied, over a span that fills many bins, with no -0
		// to be told from 0.
		const next = sequence(11);
		const cells = 400;
		const weights = Float64Array.from({ length: cells }, () =>
			Math.ceil(next() * 10),
		);
		const fields = Array.from({ length: 12 }, () =>
			Float32Array.from(
				{ length: cells },
				() => Math.round((next() - 0.5) * 2 * (next() * 120)) / 2 + 0,
			),
		);
		const values = new Set(fields.flatMap((field) => Array.from(field)));
		for (const share of [0, 0.005, 0.01, 0.1, 0.25, 0.5]) {
			const cuts = weightedQuantiles(fields, weights, share);
			expect(cuts, `share ${share}`).toMatchObject(
				bySorting(fields, weights, share),
			);
			expect(values.has(cuts.low)).toBe(true);
			expect(values.has(cuts.high)).toBe(true);
		}
	});

	it('gives the lowest and highest values', () => {
		const cuts = weightedQuantiles(
			[Float32Array.of(3, -7, 12), Float32Array.of(40, 0, -20)],
			[1, 1, 1],
			0.005,
		);
		expect(cuts.lowest).toBe(-20);
		expect(cuts.highest).toBe(40);
	});

	it('cuts at the lowest and highest values among a handful of like weight', () => {
		expect(weightedQuantiles([Float32Array.of(-5, 8)], [1, 1], 0.005)).toEqual({
			lowest: -5,
			highest: 8,
			low: -5,
			high: 8,
		});
	});

	it('weights each value by its cell, so that weights change the cuts', () => {
		// Ten cells, the first at -50; a share of 0.1 is the first cell's
		// count, but not its weight once the others weigh more.
		const field = Float32Array.from({ length: 10 }, (_, cell) =>
			cell === 0 ? -50 : cell,
		);
		const even = new Float64Array(10).fill(1);
		expect(weightedQuantiles([field], even, 0.1).low).toBe(-50);
		const uneven = Float64Array.from({ length: 10 }, (_, cell) =>
			cell === 0 ? 1 : 3,
		);
		// The weight is 28; a tenth of it is 2.8, which the first cell's 1
		// falls short of, and with cell 1's 3 is passed.
		expect(weightedQuantiles([field], uneven, 0.1).low).toBe(1);
		// A heavy first cell carries the share alone.
		const heavy = Float64Array.from({ length: 10 }, (_, cell) =>
			cell === 0 ? 100 : 1,
		);
		expect(weightedQuantiles([field], heavy, 0.5).low).toBe(-50);
	});

	it('counts a cell for its weight in every field it is in', () => {
		// Cell 0 is light but cold in every month; cell 1 is heavy.
		const months = Array.from({ length: 12 }, () => Float32Array.of(-40, 10));
		expect(weightedQuantiles(months, [1, 99], 0.005).low).toBe(-40);
		expect(weightedQuantiles(months, [1, 99], 0.02).low).toBe(10);
	});

	it('takes tied values together', () => {
		// Three tied at 2 make up the weight from a fifth to four fifths.
		const field = Float32Array.of(1, 2, 2, 2, 3);
		const weights = [1, 1, 1, 1, 1];
		expect(weightedQuantiles([field], weights, 0.2)).toMatchObject({
			low: 1,
			high: 3,
		});
		expect(weightedQuantiles([field], weights, 0.21)).toMatchObject({
			low: 2,
			high: 2,
		});
		expect(weightedQuantiles([field], weights, 0.5)).toMatchObject({
			low: 2,
			high: 2,
		});
	});

	it('gives a single value as both cuts', () => {
		expect(weightedQuantiles([Float32Array.of(4.5)], [2], 0.005)).toEqual({
			lowest: 4.5,
			highest: 4.5,
			low: 4.5,
			high: 4.5,
		});
		expect(
			weightedQuantiles([Float32Array.of(7, 7, 7)], [1, 2, 3], 0.25),
		).toEqual({ lowest: 7, highest: 7, low: 7, high: 7 });
	});

	it('passes over values that are not finite numbers, and their weight', () => {
		const field = Float32Array.of(
			Number.NaN,
			Number.NEGATIVE_INFINITY,
			-10,
			0,
			10,
			Number.POSITIVE_INFINITY,
		);
		// Without the weight of the cells passed over, -10 carries a third.
		const cuts = weightedQuantiles([field], [50, 50, 1, 1, 1, 50], 0.3);
		expect(cuts).toEqual({ lowest: -10, highest: 10, low: -10, high: 10 });
	});

	it('leaves the cuts where the many values put them, for one extreme value', () => {
		const next = sequence(5);
		const cells = 2000;
		const weights = new Float64Array(cells).fill(1);
		const months = Array.from({ length: 12 }, () =>
			Float32Array.from({ length: cells }, () => next() * 40 - 20),
		);
		const before = weightedQuantiles(months, weights, 0.005);
		months[0]?.set([-1000], 0);
		const after = weightedQuantiles(months, weights, 0.005);
		expect(after.lowest).toBe(-1000);
		expect(after.low).toBeGreaterThan(-20);
		expect(after.low).toBeCloseTo(before.low, 0);
		expect(after.high).toBe(before.high);
	});

	it('cuts nothing off for no weight at all', () => {
		expect(
			weightedQuantiles([Float32Array.of(-3, 0, 3)], [0, 0, 0], 0.1),
		).toMatchObject({ low: -3, high: 3 });
	});

	it('finds the cuts over a span too wide for its width to be a number', () => {
		const field = Float64Array.of(-1e308, -1, 0, 1, 1e308);
		expect(weightedQuantiles([field], [1, 1, 1, 1, 1], 0.2)).toMatchObject({
			low: -1e308,
			high: 1e308,
		});
		expect(weightedQuantiles([field], [1, 1, 1, 1, 1], 0.21)).toMatchObject({
			low: -1,
			high: 1,
		});
	});

	it('finds the cuts over a span too narrow for its bins to a unit to be a number', () => {
		// Five of the seven weight is at 0, so 0 is both cuts.
		expect(
			weightedQuantiles([Float64Array.of(0, 1e-310, 1e-310)], [5, 1, 1], 0.4),
		).toEqual({ lowest: 0, highest: 1e-310, low: 0, high: 0 });
	});

	it('is not moved by a value with no weight, unless the share is 0', () => {
		const field = Float32Array.of(-1000, 1, 2, 3, 4, 5, 6, 7, 8, 1000);
		const weights = [0, 1, 1, 1, 1, 1, 1, 1, 1, 0];
		expect(weightedQuantiles([field], weights, 0.005)).toEqual({
			lowest: -1000,
			highest: 1000,
			low: 1,
			high: 8,
		});
		expect(weightedQuantiles([field], weights, 0)).toMatchObject({
			low: -1000,
			high: 1000,
		});
	});

	it('takes tied values together where rounding leaves their sum short', () => {
		// The bin of the two 0s weighs 1.5, which with the 0.7 below it
		// reaches half of the 4.4; added one at a time, they come to
		// 2.1999999999999997.
		expect(
			weightedQuantiles(
				[Float64Array.of(-1, 0, 0, 1)],
				[0.7, 0.7, 0.7999999999999999, 2.2],
				0.5,
			),
		).toEqual({ lowest: -1, highest: 1, low: 0, high: 1 });
	});

	it('cuts at the last value of a bin where rounding leaves their sum short', () => {
		// The bin of 0 and 1e-9 weighs 1.5, which with the 0.7 below it
		// reaches half of the 4.4; its values' own sums from the 0.7 are 1.4
		// and 2.1999999999999997, short of it, so the cut is its last value.
		expect(
			weightedQuantiles(
				[Float64Array.of(-1, 0, 1e-9, 1)],
				[0.7, 0.7, 0.7999999999999999, 2.2],
				0.5,
			),
		).toEqual({ lowest: -1, highest: 1, low: 1e-9, high: 1 });
	});

	it('cuts at the last value with a weight where rounding leaves the sums short', () => {
		// The four values about 1000 share a bin, whose weight with the
		// lowest value's reaches the target; their own sums from it stop one
		// rounding short, and the last of them has no weight.
		const field = Float64Array.of(0, 1000, 1000.01, 1000.02, 1000.03, 5000);
		const weights = [
			0.4228681116130133, 0.04239011539027706, 0.15047161871363693,
			0.03944718321274668, 0, 0.7734524293544207,
		];
		expect(weightedQuantiles([field], weights, 0.4586052913374734)).toEqual({
			lowest: 0,
			highest: 5000,
			low: 1000.02,
			high: 5000,
		});
	});

	it('passes over values that are not finite over a span too wide to bin', () => {
		const field = Float64Array.of(
			-1e308,
			-1,
			0,
			1,
			1e308,
			Number.NaN,
			Number.POSITIVE_INFINITY,
		);
		expect(weightedQuantiles([field], [1, 1, 1, 1, 1, 100, 100], 0.2)).toEqual({
			lowest: -1e308,
			highest: 1e308,
			low: -1e308,
			high: 1e308,
		});
	});

	it('finds a high cut among close values when the low cut is a value alone', () => {
		// The lowest value has its bin to itself and carries the share; the
		// three highest share the last bin, where the high cut is the middle
		// one of them.
		const field = Float64Array.of(-1000, 1, 1 + 1e-9, 1 + 2e-9);
		const weights = [50, 10, 10, 10];
		const cuts = weightedQuantiles([field], weights, 0.15);
		expect(cuts).toEqual({
			lowest: -1000,
			highest: 1 + 2e-9,
			low: -1000,
			high: 1 + 1e-9,
		});
		expect(cuts).toMatchObject(bySorting([field], weights, 0.15));
	});

	it('gives the cuts a full sort gives among values crowded into one bin', () => {
		// The crowd is within 2^-20 of 1, over a span of 2000, so the bin
		// the cuts fall in holds far more values than are sorted.
		const { fields, weights } = crowded(
			[
				[1 - 2 ** -44, 3],
				[1, 397],
				[1 + 2 ** -40, 200],
				[1 + 2 ** -39, 300],
				[1 + 2 ** -20, 96],
				[1 + 2 ** -20 + 2 ** -44, 4],
			],
			[-1000, 1000, 300, -250],
		);
		for (const share of [0.005, 0.5]) {
			const cuts = weightedQuantiles(fields, weights, share);
			expect(cuts, `share ${share}`).toEqual({
				lowest: -1000,
				highest: 1000,
				...bySorting(fields, weights, share),
			});
		}
	});

	it('gives the cuts a full sort gives among many values crowded into one bin', () => {
		// Ten thousand values 2^-40 apart, each in 24 cells, and two far
		// ones: each cut's bin of the crowd holds a few of them to sort.
		const weights = Float64Array.from(
			{ length: 20_000 },
			(_, cell) => 1 + (cell % 5),
		);
		const fields = Array.from({ length: 12 }, (_, month) =>
			Float64Array.from(
				{ length: weights.length },
				(_, cell) => 1 + ((cell * 7919 + month * 104_729) % 10_000) * 2 ** -40,
			),
		);
		fields[0]?.set([-1000], 0);
		fields[11]?.set([1000], 1);
		for (const share of [0.005, 0.5]) {
			expect(
				weightedQuantiles(fields, weights, share),
				`share ${share}`,
			).toMatchObject(bySorting(fields, weights, share));
		}
	});

	it('cuts at the one value that a crowded bin holds', () => {
		const { fields, weights } = crowded([[7.25, 1000]], [-1000, 1000]);
		for (const share of [0.005, 0.5]) {
			expect(
				weightedQuantiles(fields, weights, share),
				`share ${share}`,
			).toEqual({ lowest: -1000, highest: 1000, low: 7.25, high: 7.25 });
		}
	});

	it.each([
		['lowest', 1],
		['highest', -1],
	])(
		'gives the cuts a full sort gives with the crowded bin at the %s end',
		(_, sign) => {
			const { fields, weights } = crowded(
				[
					[sign * 5, 500],
					[sign * (5 + 2 ** -30), 300],
					[sign * (5 + 2 ** -29), 200],
				],
				[sign * 1000, sign * 600],
			);
			for (const share of [0, 0.005, 0.5]) {
				expect(
					weightedQuantiles(fields, weights, share),
					`share ${share}`,
				).toMatchObject(bySorting(fields, weights, share));
			}
		},
	);

	it.each([
		['a field of another length', [Float32Array.of(1, 2)], [1], 0.1],
		['a weight below zero', [Float32Array.of(1, 2)], [1, -1], 0.1],
		[
			'a weight that is not a number',
			[Float32Array.of(1, 2)],
			[1, Number.NaN],
			0.1,
		],
		[
			'an infinite weight',
			[Float32Array.of(1, 2)],
			[1, Number.POSITIVE_INFINITY],
			0.1,
		],
		['a share below zero', [Float32Array.of(1, 2)], [1, 1], -0.1],
		['a share above a half', [Float32Array.of(1, 2)], [1, 1], 0.6],
		[
			'a share that is not a number',
			[Float32Array.of(1, 2)],
			[1, 1],
			Number.NaN,
		],
		['no fields', [], [1, 1], 0.1],
		[
			'no finite value',
			[Float32Array.of(Number.NaN, Number.POSITIVE_INFINITY)],
			[1, 1],
			0.1,
		],
	])('refuses %s', (_, fields, weights, share) => {
		expect(() => weightedQuantiles(fields, weights, share)).toThrow(RangeError);
	});
});
