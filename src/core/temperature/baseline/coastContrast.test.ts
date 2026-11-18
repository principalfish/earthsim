import { describe, expect, it } from 'vitest';
import {
	readEarthDataFile,
	readObservedTemperatureFile,
} from '../../../../scripts/earth/dataFile.mjs';
import { decodeEarth, earthWorld } from '../../earth/earth';
import { createBlankWorld } from '../../world/world';
import { decodeObservedTemperature, observedTemperature } from '../observed';
import { coastContrast } from './coastContrast';

const EARTH = earthWorld(decodeEarth(readEarthDataFile()), 64);
const OBSERVED = observedTemperature(
	decodeObservedTemperature(readObservedTemperatureFile()),
	64,
);

describe('coastContrast', () => {
	it('finds the observed Earth’s west–east contrasts: about 11.5 and 22.9 K for Europe against Asia, 5.8 and 15.1 K for North America', () => {
		const { europeAsia, northAmerica } = coastContrast(
			EARTH,
			OBSERVED,
			OBSERVED,
		);
		expect(europeAsia.observed.annual).toBeCloseTo(11.5, 0);
		expect(europeAsia.observed.january).toBeCloseTo(22.9, 0);
		expect(northAmerica.observed.annual).toBeCloseTo(5.8, 0);
		expect(northAmerica.observed.january).toBeCloseTo(15.1, 0);
		// Simulated the same as observed: the same contrast.
		expect(europeAsia.simulated).toEqual(europeAsia.observed);
		expect(northAmerica.simulated).toEqual(northAmerica.observed);
	});

	it('is unchanged by a warming everywhere, and doubled by a doubling of the differences', () => {
		const observed = coastContrast(EARTH, OBSERVED, OBSERVED);
		const warmer = coastContrast(
			EARTH,
			OBSERVED.map((month) => month.map((value) => value + 3)),
			OBSERVED,
		);
		expect(warmer.europeAsia.simulated.annual).toBeCloseTo(
			observed.europeAsia.simulated.annual,
			4,
		);
		const doubled = coastContrast(
			EARTH,
			OBSERVED.map((month) => month.map((value) => 2 * value)),
			OBSERVED,
		);
		expect(doubled.northAmerica.simulated.january).toBeCloseTo(
			2 * observed.northAmerica.simulated.january,
			4,
		);
		expect(doubled.northAmerica.observed).toEqual(
			observed.northAmerica.observed,
		);
	});

	it('refuses a year that is not twelve months of one value per cell, and a world with no coasts', () => {
		expect(() => coastContrast(EARTH, OBSERVED.slice(1), OBSERVED)).toThrow(
			RangeError,
		);
		expect(() =>
			coastContrast(
				EARTH,
				OBSERVED,
				OBSERVED.map((month) => month.subarray(1)),
			),
		).toThrow(RangeError);
		const blank = createBlankWorld(64);
		const months = Array.from(
			{ length: 12 },
			() => new Float32Array(6 * 64 * 64),
		);
		expect(() => coastContrast(blank, months, months)).toThrow(/coast/);
	});
});
