/**
 * Seeded noise over three-dimensional space.
 *
 * Every function here is a pure function of a seed and a position, built
 * from 32-bit integer hashing and from addition, subtraction,
 * multiplication, division, `Math.floor` and `Math.abs` alone. Those are
 * all exactly specified, so a seed gives the same field, bit for bit, in
 * every JavaScript engine.
 *
 * Sampled at points of the unit sphere, the noise is a seamless field over
 * the globe: it knows nothing of the grid, its faces or its resolution.
 */

/** The largest seed: seeds are unsigned 32-bit integers. */
export const MAX_SEED = 0xffff_ffff;

/** Frequency ratio between successive octaves of the fractal noises. */
export const OCTAVE_LACUNARITY = 2;

/**
 * Amplitude ratio between successive octaves of {@link ridgedNoise3}, and
 * of {@link fractalNoise3} unless it is given another.
 */
export const OCTAVE_GAIN = 0.5;

/**
 * Distance each octave is shifted from the one before, along every axis.
 *
 * @remarks
 * Gradient noise is zero at every lattice point, and with a lacunarity of 2
 * a lattice point of one octave is a lattice point of every finer one.
 * Unshifted, the octaves would all vanish together there.
 */
const OCTAVE_OFFSET = 0.371;

/**
 * What separates the seeds of successive octaves. The lattice hash scrambles
 * the seed together with the coordinates, so seeds this simply related
 * still give unrelated fields.
 */
const OCTAVE_SEED_STEP = 0x9e37_79b9;

/**
 * Scales the raw gradient noise into -1 to 1. The raw extreme, about
 * 1.03635, is reached near the middle of a lattice cell whose eight
 * gradients all point at it.
 */
const GRADIENT_NOISE_SCALE = 1 / 1.0363537;

/** Scrambles a 32-bit integer: the finaliser of MurmurHash3. */
const mix = (value: number): number => {
	let h = value;
	h = Math.imul(h ^ (h >>> 16), 0x85eb_ca6b);
	h = Math.imul(h ^ (h >>> 13), 0xc2b2_ae35);
	return h ^ (h >>> 16);
};

/** Multipliers that spread the lattice coordinates of each axis. */
const LATTICE_X = 0x9e37_79b1;
const LATTICE_Y = 0x85eb_ca77;
const LATTICE_Z = 0xc2b2_ae3d;

/**
 * The sixteen gradient directions of Perlin's improved noise, by component:
 * the twelve edge midpoints of a cube, four of them twice.
 *
 * @remarks
 * Read from tables rather than chosen by branching on the hash, which the
 * processor cannot predict.
 */
const GRADIENT_X = new Float64Array([
	1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0, 1, 0, -1, 0,
]);
const GRADIENT_Y = new Float64Array([
	1, 1, -1, -1, 0, 0, 0, 0, 1, -1, 1, -1, 1, -1, 1, -1,
]);
const GRADIENT_Z = new Float64Array([
	0, 0, 0, 0, 1, 1, -1, -1, 1, 1, -1, -1, 0, 1, 0, -1,
]);

/**
 * The contribution of one lattice corner: the dot product of the offset
 * from the corner, `(x, y, z)`, with the gradient its hash selects.
 *
 * @remarks
 * The corner's three hashed coordinates arrive combined in `corner`. Two
 * rounds of multiply and shift scramble them, and the top four bits, the
 * best mixed, pick the gradient.
 */
const cornerDot = (corner: number, x: number, y: number, z: number): number => {
	let h = Math.imul(corner ^ (corner >>> 15), 0x85eb_ca6b);
	h = Math.imul(h ^ (h >>> 13), 0xc2b2_ae35) >>> 28;
	return (
		(GRADIENT_X[h] as number) * x +
		(GRADIENT_Y[h] as number) * y +
		(GRADIENT_Z[h] as number) * z
	);
};

/**
 * Whether a value can be used as a seed: an integer from 0 to
 * {@link MAX_SEED}.
 *
 * @param value - Candidate seed.
 */
export const isSeed = (value: number): boolean =>
	Number.isInteger(value) && value >= 0 && value <= MAX_SEED;

/**
 * A seed for an independent noise field, derived from another seed.
 *
 * @remarks
 * Fields that must not resemble one another, such as the three components
 * of a displacement, each take their own stream of one seed.
 *
 * @param seed - The seed to derive from; any number, read as a 32-bit
 * integer.
 * @param stream - Which derived seed to return; any number, read as a 32-bit
 * integer. Different streams give unrelated seeds.
 * @returns An integer from 0 to {@link MAX_SEED}.
 */
export const deriveSeed = (seed: number, stream: number): number =>
	mix(
		Math.imul(mix(seed ^ 0x9e37_79b9) ^ stream, 0x27d4_eb2f) + 0x1656_67b1,
	) >>> 0;

/**
 * Smooth gradient noise at a point: Perlin's improved noise over a hashed
 * lattice.
 *
 * @remarks
 * The lattice has unit spacing, so features are about one unit across. The
 * value is zero at every lattice point and continuous everywhere, with
 * continuous first and second derivatives.
 *
 * Coordinates are expected within about ±2 billion, where the lattice index
 * still fits a 32-bit integer; beyond that the field stays finite but loses
 * its smoothness.
 *
 * @param seed - Selects the field; any number, read as a 32-bit integer.
 * @param x - Position along the first axis.
 * @param y - Position along the second axis.
 * @param z - Position along the third axis.
 * @returns A value from -1 to 1, most often within ±0.5.
 */
export const gradientNoise3 = (
	seed: number,
	x: number,
	y: number,
	z: number,
): number => {
	const floorX = Math.floor(x);
	const floorY = Math.floor(y);
	const floorZ = Math.floor(z);
	const fx = x - floorX;
	const fy = y - floorY;
	const fz = z - floorZ;
	const gx = fx - 1;
	const gy = fy - 1;
	const gz = fz - 1;
	const ix = floorX | 0;
	const iy = floorY | 0;
	const iz = floorZ | 0;
	const x0 = Math.imul(ix, LATTICE_X) ^ seed;
	const x1 = Math.imul(ix + 1, LATTICE_X) ^ seed;
	const y0 = Math.imul(iy, LATTICE_Y);
	const y1 = Math.imul(iy + 1, LATTICE_Y);
	const z0 = Math.imul(iz, LATTICE_Z);
	const z1 = Math.imul(iz + 1, LATTICE_Z);

	// Quintic fade: zero first and second derivatives at the lattice.
	const wx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
	const wy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
	const wz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);

	const n000 = cornerDot(x0 ^ y0 ^ z0, fx, fy, fz);
	const n100 = cornerDot(x1 ^ y0 ^ z0, gx, fy, fz);
	const n010 = cornerDot(x0 ^ y1 ^ z0, fx, gy, fz);
	const n110 = cornerDot(x1 ^ y1 ^ z0, gx, gy, fz);
	const n001 = cornerDot(x0 ^ y0 ^ z1, fx, fy, gz);
	const n101 = cornerDot(x1 ^ y0 ^ z1, gx, fy, gz);
	const n011 = cornerDot(x0 ^ y1 ^ z1, fx, gy, gz);
	const n111 = cornerDot(x1 ^ y1 ^ z1, gx, gy, gz);

	const nx00 = n000 + wx * (n100 - n000);
	const nx10 = n010 + wx * (n110 - n010);
	const nx01 = n001 + wx * (n101 - n001);
	const nx11 = n011 + wx * (n111 - n011);
	const nxy0 = nx00 + wy * (nx10 - nx00);
	const nxy1 = nx01 + wy * (nx11 - nx01);
	return (nxy0 + wz * (nxy1 - nxy0)) * GRADIENT_NOISE_SCALE;
};

/**
 * Fractal noise at a point: octaves of {@link gradientNoise3} summed, each
 * at {@link OCTAVE_LACUNARITY} times the frequency of the one before and
 * `gain` times its amplitude.
 *
 * @remarks
 * The first octave has features about one unit across. With a gain of a
 * half it carries half of the total amplitude or more, so the large shapes
 * dominate and the later octaves only roughen them; a higher gain roughens
 * them more. Each octave is an independent field, and the sum is divided by
 * the total amplitude.
 *
 * @param seed - Selects the field; any number, read as a 32-bit integer.
 * @param x - Position along the first axis.
 * @param y - Position along the second axis.
 * @param z - Position along the third axis.
 * @param octaves - Number of octaves to sum: a whole number, at least 1.
 * @param gain - Amplitude of each octave against the one before, above 0;
 * {@link OCTAVE_GAIN} by default.
 * @returns A value from -1 to 1, most often within ±0.4.
 */
export const fractalNoise3 = (
	seed: number,
	x: number,
	y: number,
	z: number,
	octaves: number,
	gain: number = OCTAVE_GAIN,
): number => {
	let sum = 0;
	let total = 0;
	let amplitude = 1;
	let frequency = 1;
	for (let octave = 0; octave < octaves; octave++) {
		const offset = octave * OCTAVE_OFFSET;
		sum +=
			amplitude *
			gradientNoise3(
				seed ^ Math.imul(octave, OCTAVE_SEED_STEP),
				x * frequency + offset,
				y * frequency + offset,
				z * frequency + offset,
			);
		total += amplitude;
		amplitude *= gain;
		frequency *= OCTAVE_LACUNARITY;
	}
	return sum / total;
};

/**
 * Ridged fractal noise at a point: sharp crests where the octaves of
 * {@link gradientNoise3} cross zero, with broad valleys between them.
 *
 * @remarks
 * Each octave contributes `(1 - |noise|)²`, which peaks along the lines
 * where the noise changes sign. An octave is weighted by the one before, so
 * that fine detail gathers on the crests and the valleys stay smooth. The
 * first octave has crests about one unit apart.
 *
 * @param seed - Selects the field; any number, read as a 32-bit integer.
 * @param x - Position along the first axis.
 * @param y - Position along the second axis.
 * @param z - Position along the third axis.
 * @param octaves - Number of octaves to sum: a whole number, at least 1.
 * @returns A value from 0 to 1: near 1 on a crest.
 */
export const ridgedNoise3 = (
	seed: number,
	x: number,
	y: number,
	z: number,
	octaves: number,
): number => {
	let sum = 0;
	let total = 0;
	let amplitude = 1;
	let frequency = 1;
	let weight = 1;
	for (let octave = 0; octave < octaves; octave++) {
		const offset = octave * OCTAVE_OFFSET;
		const ridge =
			1 -
			Math.abs(
				gradientNoise3(
					seed ^ Math.imul(octave, OCTAVE_SEED_STEP),
					x * frequency + offset,
					y * frequency + offset,
					z * frequency + offset,
				),
			);
		const crest = ridge * ridge;
		sum += amplitude * weight * crest;
		total += amplitude;
		weight = crest;
		amplitude *= OCTAVE_GAIN;
		frequency *= OCTAVE_LACUNARITY;
	}
	return sum / total;
};
