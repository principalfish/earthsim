/** The colours the terrain is drawn in, by height above and below the sea. */

import type { RampStop } from './glsl';

/** Land colours by height above sea level, lowest first. */
export const LAND_RAMP: readonly RampStop[] = [
	{ at: 0, colour: 0x5f9a4e },
	{ at: 300, colour: 0x86ad5a },
	{ at: 900, colour: 0xc2b877 },
	{ at: 1800, colour: 0xa98a5c },
	{ at: 3000, colour: 0x8a6f58 },
	{ at: 4200, colour: 0xa9a29c },
	{ at: 5500, colour: 0xf4f5f7 },
];

/** Sea colours by depth below sea level, shallowest first. */
export const OCEAN_RAMP: readonly RampStop[] = [
	{ at: 0, colour: 0x7cc4de },
	{ at: 150, colour: 0x4fa3d3 },
	{ at: 1000, colour: 0x2f7cbf },
	{ at: 2500, colour: 0x1f5aa3 },
	{ at: 4000, colour: 0x143f80 },
	{ at: 6000, colour: 0x0c2a5e },
	{ at: 9000, colour: 0x081a3f },
];
