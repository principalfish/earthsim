import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	type EarthWindFigures,
	type StoredEarthWindFigures,
	WIND_BASELINE_FIGURES,
	type WIND_BASELINE_PERIODS,
	type WindBaselineFigures,
	windBaselineText,
} from '../src/core/baseline/earthWinds';
import { main, WIND_BASELINE_FILE } from './update-earth-winds-baseline';

/** The committed baseline file's text. */
const committedText = (): string =>
	new TextDecoder().decode(readFileSync(WIND_BASELINE_FILE));

/**
 * The figures a baseline text holds, as they were before it was written:
 * a `null`, which the file holds for a figure that was not a number, is
 * that again.
 */
const figuresOf = (text: string): EarthWindFigures => {
	const stored = JSON.parse(text) as StoredEarthWindFigures;
	const period = (name: (typeof WIND_BASELINE_PERIODS)[number]) =>
		Object.fromEntries(
			WIND_BASELINE_FIGURES.map((figure) => [
				figure,
				stored[name][figure] ?? Number.NaN,
			]),
		) as WindBaselineFigures;
	return {
		resolution: stored.resolution,
		year: period('year'),
		january: period('january'),
		july: period('july'),
	};
};

describe('the Earth winds baseline update', () => {
	it('would write the committed file’s figures as the very text the file holds', () => {
		const committed = committedText();
		expect(windBaselineText(figuresOf(committed))).toBe(committed);
	});

	it('writes a file that holds a figure that was not a number as it was, too', () => {
		const withNone = committedText().replace(
			/"directionSharePercent": [0-9.]+/,
			'"directionSharePercent": null',
		);
		expect(withNone).toContain('"directionSharePercent": null');
		expect(windBaselineText(figuresOf(withNone))).toBe(withNone);
	});

	it('refuses an argument it does not know, writing nothing', () => {
		const text = committedText();
		expect(() => main(['x'])).toThrow('Unknown option x');
		expect(committedText()).toBe(text);
	});
});
