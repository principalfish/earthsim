import { describe, expect, it } from 'vitest';
import { flatten } from './update-earth-temperature-baseline';

describe('flatten', () => {
	it('names each number by the keys and indices that lead to it, in order', () => {
		const text = JSON.stringify({
			resolution: 64,
			annualMean: { meanDifference: -0.5, rmsDifference: 4 },
			months: [
				{ meanDifference: 1, rmsDifference: 2 },
				{ meanDifference: 3, rmsDifference: [5, 6] },
			],
		});
		expect([...flatten(text)]).toEqual([
			['resolution', 64],
			['annualMean.meanDifference', -0.5],
			['annualMean.rmsDifference', 4],
			['months.0.meanDifference', 1],
			['months.0.rmsDifference', 2],
			['months.1.meanDifference', 3],
			['months.1.rmsDifference.0', 5],
			['months.1.rmsDifference.1', 6],
		]);
	});

	it('leaves out what is not a number', () => {
		const text = JSON.stringify({
			name: 'Earth',
			missing: null,
			flag: true,
			empty: {},
			list: [],
			kept: { value: 0 },
		});
		expect([...flatten(text)]).toEqual([['kept.value', 0]]);
	});

	it('names a number that is the whole text by the empty path', () => {
		expect([...flatten('1.25')]).toEqual([['', 1.25]]);
	});
});
