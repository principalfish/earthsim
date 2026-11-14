import { describe, expect, it } from 'vitest';
import { baselineReport, flatten, UNCHANGED_LINE } from './baselineUpdate';

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

describe('baselineReport', () => {
	const before = JSON.stringify({ resolution: 64, a: { b: 1.5, c: 2 } });

	it('says the baseline is unchanged when no number moved', () => {
		const same = JSON.stringify(
			{ resolution: 64, a: { b: 1.5, c: 2 } },
			null,
			2,
		);
		expect(baselineReport(before, same, 'file.json')).toBe(
			`${UNCHANGED_LINE}\n`,
		);
		expect(UNCHANGED_LINE).toBe('The baseline is unchanged.');
	});

	it('names each number that moved, in order, and the file', () => {
		const now = JSON.stringify({ resolution: 64, a: { b: 1.25, c: 2, d: 3 } });
		expect(baselineReport(before, now, 'file.json')).toBe(
			'a.b: 1.5 -> 1.25\na.d: none -> 3\nWrote file.json\n',
		);
	});

	it('names every number as new when there was no file', () => {
		expect(baselineReport(null, before, 'file.json')).toBe(
			'resolution: none -> 64\na.b: none -> 1.5\na.c: none -> 2\nWrote file.json\n',
		);
	});

	it('names a number that became null or went missing', () => {
		expect(
			baselineReport('{"a":60.91,"b":1}', '{"a":null,"b":1}', 'file.json'),
		).toBe('a: 60.91 -> none\nWrote file.json\n');
		expect(baselineReport('{"a":60.91,"b":1}', '{"b":1}', 'file.json')).toBe(
			'a: 60.91 -> none\nWrote file.json\n',
		);
	});

	it('names the figures of the new text before those only the old had', () => {
		expect(
			baselineReport('{"a":1,"b":2,"c":3}', '{"b":2.5,"c":3}', 'file.json'),
		).toBe('b: 2 -> 2.5\na: 1 -> none\nWrote file.json\n');
	});

	it('names a null that became a number', () => {
		expect(
			baselineReport('{"a":null,"b":1}', '{"a":60.91,"b":1}', 'file.json'),
		).toBe('a: none -> 60.91\nWrote file.json\n');
	});

	it('says the baseline is unchanged when both texts are the same, nulls and all', () => {
		const text = '{"a":null,"b":1}';
		expect(baselineReport(text, text, 'file.json')).toBe(`${UNCHANGED_LINE}\n`);
		expect(baselineReport(before, before, 'file.json')).toBe(
			`${UNCHANGED_LINE}\n`,
		);
	});
});
