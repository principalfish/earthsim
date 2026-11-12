/**
 * Colour ramps for tests: none is a ramp the page draws with, so a test can
 * tell one apart from the page's own.
 */

import type { ColourRamp } from '../globe/ramp';

/** Black to orange in one step. */
export const TWO_STOP_RAMP: ColourRamp = {
	name: 'two',
	stops: [
		{ at: 0, colour: 0x000000 },
		{ at: 1, colour: 0xff8000 },
	],
};

/** Seven greys from black to white, a sixth of the way apart. */
export const SEVEN_STOP_RAMP: ColourRamp = {
	name: 'seven',
	stops: [
		0x000000, 0x2a2a2a, 0x555555, 0x808080, 0xaaaaaa, 0xd5d5d5, 0xffffff,
	].map((colour, index) => ({ at: index / 6, colour })),
};
