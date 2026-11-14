import { describe, expect, it } from 'vitest';
import { LITERATURE_CHECKS, SLOW_END } from './literature';

/**
 * Every quotation the report may hold, each exactly as it was read in the
 * paper: Ferreira et al. (2014), Lobo and Bordoni (2020), Kaspi and Showman
 * (2015), Held and Hou (1980) and Way et al. (2018).
 */
const GIVEN_QUOTATIONS = [
	'despite reversed temperature gradients, mid-latitudes surface winds are westerly and trade winds exist at the equator (as for φ = 23.5°) although the westerlies are confined to the summer hemisphere',
	'the eddy momentum convergence sustains surface westerly winds near 50°S and trades winds in the deep tropics (Fig. 7)',
	'In Aqua90, surface winds vanish in winter because there are no eddies to sustain them.',
	'the synoptic scale activity is weak in both hemispheres as are surface winds in the midlatitudes.',
	'dominated by seasonally reversing broad cross-equatorial Hadley cells',
	'the associated ascending branches and precipitation convergence zones becoming progressively broader and more poleward shifted into the summer hemisphere with higher obliquities',
	'While not embedded within the Hadley cell ascending branches, the hot summer poles of high obliquity planets experience nonnegligible precipitation',
	'the atmospheric meridional overturning circulation in January (Fig. 8, top) is thermally direct as in Aqua23 (upwelling in the summer/southern hemisphere and downwelling in the winter/northern hemisphere), but has an hemispheric latitudinal extent',
	'In July, the upwelling branch approaches the north pole and the overturning cell is of counterclockwise from 5°S to 70°N (not shown).',
	'As in Aqua90, a Hadley circulation develops with an upper flow from the summer to the winter hemisphere (not shown). It is weaker than in Aqua90 (by a factor 2)',
	'Planets with faster rotation rates are characterized by smaller and weaker Hadley cells, and smaller eddy length scales. ... The number of jets grows with rotation rate.',
	'At slow rotation rates, the Hadley cells are nearly global',
	'An axisymmetric picture predicts that the Hadley cell width should be proportional to Ω⁻¹ (Held & Hou 1980), however this is complicated by the existence of eddies',
	'θ_H = (5/3 R)^½',
	'The width of the Hadley cell in this limit is directly proportional to the square root of the horizontal temperature gradient, directly proportional to the square root of the height of the cell, inversely proportional to the rotation rate and independent of static stability.',
	'model stream function diagnostic showing increase in Hadley Cell size and decrease in number from Rotations X001 to X016',
	'until about X016, by which time the Hadley cell now stretches to the pole',
	'The second transition is from a circulation that transports heat poleward to a diurnally-driven circulation that transports heat from a dayside region of rising motion to a nightside region of sinking motion',
	'In our simulations the transition appears to occur between 32 d and 64 d rotation period.',
];

describe('the papers’ words', () => {
	it('are exactly the given quotations, each once', () => {
		const held = [
			...LITERATURE_CHECKS.flatMap(({ reports }) => reports),
			SLOW_END.report,
		].flatMap(({ quotations }) => quotations);
		expect(new Set(held).size).toBe(held.length);
		expect([...held].sort()).toEqual([...GIVEN_QUOTATIONS].sort());
	});
});
